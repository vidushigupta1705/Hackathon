import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db, pool } from "@/db";
import { fixReviews, prComments, prFiles, pullRequests, repositories, settings, sourceFiles } from "@/db/schema";
import { diffRepo } from "./analyzer/diff";
import { buildGraph, type ProjectGraph } from "./analyzer/graph";
import { parseFile, SOURCE_RE } from "./analyzer/parser";
import type { ParsedFile, PRAnalysis, RepoInput } from "./analyzer/types";
import { DEMO_PRS, DEMO_REPOS } from "./demo/data";
import { buildAnalysis } from "./engine";

export type RepoRow = typeof repositories.$inferSelect;
export type PRRow = typeof pullRequests.$inferSelect;
export type PRWithRepo = PRRow & { analysis: PRAnalysis | null; repoName: string };

type StoreCache = {
  version: number;
  demoChecked: boolean;
  graphPromise: Promise<{ graph: ProjectGraph; rows: RepoRow[] }> | null;
  prsPromise: Promise<PRWithRepo[]> | null;
  settingsPromise: Promise<Map<string, string>> | null;
  approvedFixesPromise: Promise<Set<string>> | null;
};

const globalForStore = globalThis as typeof globalThis & {
  __devImpactStoreCache?: StoreCache;
};

const cache: StoreCache =
  globalForStore.__devImpactStoreCache ??
  (globalForStore.__devImpactStoreCache = {
    version: 0,
    demoChecked: false,
    graphPromise: null,
    prsPromise: null,
    settingsPromise: null,
    approvedFixesPromise: null,
  });

export function getCacheVersion(): number {
  return cache.version;
}

export function invalidateGraphCache() {
  cache.graphPromise = null;
  cache.version += 1;
}

export function invalidatePRsCache() {
  cache.prsPromise = null;
  cache.version += 1;
}

export function invalidateFixReviewsCache() {
  cache.approvedFixesPromise = null;
}

export function invalidateSettingsCache() {
  cache.settingsPromise = null;
}

export function invalidateAllCache(resetDemoCheck = false) {
  cache.graphPromise = null;
  cache.prsPromise = null;
  cache.approvedFixesPromise = null;
  cache.version += 1;
  if (resetDemoCheck) cache.demoChecked = false;
}

// ------------------------------------------------------------------ settings
function loadAllSettings(): Promise<Map<string, string>> {
  if (!cache.settingsPromise) {
    cache.settingsPromise = db
      .select()
      .from(settings)
      .then((rows) => new Map(rows.map((r) => [r.key, r.value])))
      .catch((err) => {
        cache.settingsPromise = null;
        throw err;
      });
  }
  return cache.settingsPromise;
}

export async function getSetting(key: string): Promise<string | null> {
  const map = await loadAllSettings();
  return map.get(key) ?? null;
}
export async function setSetting(key: string, value: string) {
  await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } });
  invalidateSettingsCache();
}
export async function deleteSetting(key: string) {
  await db.delete(settings).where(eq(settings.key, key));
  invalidateSettingsCache();
  if (key === "demo_disabled") cache.demoChecked = false;
}
export async function getGithubToken(): Promise<string | null> {
  return (await getSetting("github_token")) || process.env.GITHUB_TOKEN || null;
}

// ------------------------------------------------------------------ files
export function isAnalyzablePath(p: string) {
  if (/(^|\/)(node_modules|dist|build|\.next|coverage)\//.test(p)) return false;
  return SOURCE_RE.test(p) || p === "package.json" || p.endsWith("/package.json");
}

export async function replaceRepoFiles(repoId: number, files: { path: string; content: string }[]) {
  await db.delete(sourceFiles).where(eq(sourceFiles.repoId, repoId));
  const rows = files.filter((f) => isAnalyzablePath(f.path)).map((f) => ({ repoId, path: f.path, content: f.content, parsed: parseFile(f.path, f.content) }));
  for (let i = 0; i < rows.length; i += 50) await db.insert(sourceFiles).values(rows.slice(i, i + 50));
  const pkg = rows.map((r) => r.parsed).find((p) => p.path === "package.json" && p.pkg?.name);
  await db
    .update(repositories)
    .set({ packageName: pkg?.pkg?.name ?? null, lastSyncedAt: new Date() })
    .where(eq(repositories.id, repoId));
  invalidateGraphCache();
}

export async function deleteRepo(repoId: number) {
  await db.delete(repositories).where(eq(repositories.id, repoId));
  invalidateAllCache(true);
}

export async function loadRepoInputs(): Promise<{ inputs: RepoInput[]; rows: RepoRow[] }> {
  const [rows, files] = await Promise.all([
    db.select().from(repositories).orderBy(repositories.id),
    db.select({ id: sourceFiles.id, repoId: sourceFiles.repoId, path: sourceFiles.path, parsed: sourceFiles.parsed }).from(sourceFiles),
  ]);
  if (rows.length === 0) return { inputs: [], rows };

  const missingIds = files.filter((f) => f.parsed === null).map((f) => f.id);
  const rawContentById = new Map<number, string>();
  if (missingIds.length > 0) {
    const rawRows = await db
      .select({ id: sourceFiles.id, content: sourceFiles.content })
      .from(sourceFiles)
      .where(inArray(sourceFiles.id, missingIds));
    for (const r of rawRows) rawContentById.set(r.id, r.content);
  }

  const filesByRepo = new Map<number, ParsedFile[]>();
  for (const f of files) {
    const parsed = (f.parsed as ParsedFile | null) ?? parseFile(f.path, rawContentById.get(f.id) ?? "");
    const list = filesByRepo.get(f.repoId);
    if (list) list.push(parsed);
    else filesByRepo.set(f.repoId, [parsed]);
  }

  const inputs: RepoInput[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.fullName,
    packageName: r.packageName,
    files: filesByRepo.get(r.id) ?? [],
  }));
  return { inputs, rows };
}

export function loadGraph(): Promise<{ graph: ProjectGraph; rows: RepoRow[] }> {
  if (!cache.graphPromise) {
    cache.graphPromise = loadRepoInputs()
      .then(({ inputs, rows }) => ({ graph: buildGraph(inputs), rows }))
      .catch((err) => {
        cache.graphPromise = null;
        throw err;
      });
  }
  return cache.graphPromise;
}

// ------------------------------------------------------------------ PR analysis
export async function analyzePR(prId: number, graphIn?: ProjectGraph): Promise<PRAnalysis | null> {
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, prId));
  if (!pr) return null;
  const graph = graphIn ?? (await loadGraph()).graph;
  const repo = graph.repoById.get(pr.repoId);
  if (!repo) return null;
  const files = await db.select().from(prFiles).where(eq(prFiles.prId, prId));
  const head = new Map(repo.files.map((f) => [f.path, f]));
  for (const f of files) {
    if (f.status === "removed" || f.content === null) head.delete(f.path);
    else head.set(f.path, parseFile(f.path, f.content));
  }
  const changes = diffRepo(repo.id, repo.files, [...head.values()]);
  const analysis = await buildAnalysis(graph, repo.id, changes, { llm: true, head: [...head.values()] });
  await db
    .update(pullRequests)
    .set({ analysis, riskScore: analysis.risk.score, riskLevel: analysis.risk.level, analyzedAt: new Date() })
    .where(eq(pullRequests.id, prId));
  invalidatePRsCache();
  return analysis;
}

export async function analyzeOpenPRs(repoIds?: number[]) {
  const { graph } = await loadGraph();
  const prs = await db.select().from(pullRequests).where(eq(pullRequests.status, "open"));
  for (const pr of prs) {
    if (repoIds && !repoIds.includes(pr.repoId)) continue;
    await analyzePR(pr.id, graph);
  }
  invalidatePRsCache();
}

export function listPRs(): Promise<PRWithRepo[]> {
  if (!cache.prsPromise) {
    cache.prsPromise = db
      .select({ pr: pullRequests, repoName: repositories.fullName })
      .from(pullRequests)
      .innerJoin(repositories, eq(pullRequests.repoId, repositories.id))
      .orderBy(desc(pullRequests.createdAt))
      .then((rows) => rows.map((r) => ({ ...r.pr, analysis: r.pr.analysis as PRAnalysis | null, repoName: r.repoName })))
      .catch((err) => {
        cache.prsPromise = null;
        throw err;
      });
  }
  return cache.prsPromise;
}

export function getApprovedFixKeys(): Promise<Set<string>> {
  if (!cache.approvedFixesPromise) {
    cache.approvedFixesPromise = db
      .select({ prId: fixReviews.prId, fixId: fixReviews.fixId })
      .from(fixReviews)
      .where(eq(fixReviews.status, "approved"))
      .then((rows) => new Set(rows.map((r) => `${r.prId}|${r.fixId}`)))
      .catch((err) => {
        cache.approvedFixesPromise = null;
        throw err;
      });
  }
  return cache.approvedFixesPromise;
}

export async function getFixStatuses(prId: number): Promise<Record<string, string>> {
  const rows = await db.select().from(fixReviews).where(eq(fixReviews.prId, prId));
  return Object.fromEntries(rows.map((r) => [r.fixId, r.status]));
}

export async function getComments(prId: number) {
  return db.select().from(prComments).where(eq(prComments.prId, prId)).orderBy(desc(prComments.createdAt));
}

export async function upsertFixStatus(prId: number, fixId: string, status: string) {
  await db
    .insert(fixReviews)
    .values({ prId, fixId, status })
    .onConflictDoUpdate({ target: [fixReviews.prId, fixReviews.fixId], set: { status, updatedAt: new Date() } });
  invalidateFixReviewsCache();
}

// ------------------------------------------------------------------ demo seeding
let seeding: Promise<void> | null = null;

export function ensureDemo(): Promise<void> {
  if (seeding) return seeding;
  if (cache.demoChecked) return Promise.resolve();
  seeding = doSeed().finally(() => (seeding = null));
  return seeding;
}

async function repoCount() {
  const [{ n }] = await db.select({ n: count() }).from(repositories);
  return Number(n);
}

async function doSeed() {
  if ((await repoCount()) > 0 || (await getSetting("demo_disabled"))) {
    cache.demoChecked = true;
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("select pg_advisory_lock(4242)");
    if ((await repoCount()) > 0) {
      cache.demoChecked = true;
      return;
    }
    await seedDemoData();
    cache.demoChecked = true;
  } finally {
    await client.query("select pg_advisory_unlock(4242)");
    client.release();
  }
}

const sha = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 7);
};

export async function seedDemoData() {
  const ids = new Map<string, number>();
  for (const r of DEMO_REPOS) {
    const prBranches = DEMO_PRS.filter((p) => p.repo === r.fullName).map((p) => p.headBranch);
    const [row] = await db
      .insert(repositories)
      .values({
        fullName: r.fullName,
        name: r.fullName.split("/")[1],
        provider: "demo",
        description: r.description,
        language: "TypeScript",
        isPrivate: true,
        defaultBranch: "main",
        packageName: r.packageName,
        htmlUrl: `https://github.com/${r.fullName}`,
        branches: ["main", "develop", ...prBranches],
        commits: r.commits.map((m, i) => ({ sha: sha(r.fullName + m), message: m, author: r.authors[i % r.authors.length], date: new Date(Date.now() - (i + 1) * 86400000 * 1.7).toISOString() })),
      })
      .returning();
    ids.set(r.fullName, row.id);
    await replaceRepoFiles(row.id, Object.entries(r.files).map(([path, content]) => ({ path, content })));
  }
  for (const p of DEMO_PRS) {
    const repoId = ids.get(p.repo)!;
    const [row] = await db
      .insert(pullRequests)
      .values({
        repoId,
        number: p.number,
        title: p.title,
        body: p.body,
        author: p.author,
        headBranch: p.headBranch,
        headSha: sha(p.title),
        createdAt: new Date(Date.now() - p.hoursAgo * 3600000),
      })
      .returning();
    await db.insert(prFiles).values(p.files.map((f) => ({ prId: row.id, path: f.path, status: f.status, content: f.content })));
  }
  await analyzeOpenPRs();
  invalidateAllCache();
  cache.demoChecked = true;
}

export async function removeDemoData() {
  await db.delete(repositories).where(eq(repositories.provider, "demo"));
  await setSetting("demo_disabled", "1");
  invalidateAllCache();
  cache.demoChecked = true;
}

export async function resetDemoData() {
  if (seeding) await seeding;
  const run = (async () => {
    await db.delete(repositories).where(eq(repositories.provider, "demo"));
    await db.delete(settings).where(eq(settings.key, "demo_disabled"));
    invalidateSettingsCache();
    await seedDemoData();
  })();
  seeding = run.finally(() => {
    seeding = null;
  });
  await seeding;
}

export { and, inArray };
