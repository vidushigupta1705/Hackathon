import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prComments, prFiles, pullRequests, repositories } from "@/db/schema";
import type { PRAnalysis } from "./analyzer/types";
import { buildPrComment } from "./analyzer/explain";
import { fetchPullWithFiles, fetchRepoSnapshot, listOpenPulls, postPrComment } from "./github";
import {
  getFixStatuses,
  getGithubToken,
  invalidateAllCache,
  invalidatePRsCache,
  replaceRepoFiles,
  type RepoRow,
} from "./store";

export async function upsertPull(token: string | null, repo: RepoRow, number: number): Promise<number> {
  const { pr, files } = await fetchPullWithFiles(token, repo.fullName, number);
  const [row] = await db
    .insert(pullRequests)
    .values({
      repoId: repo.id,
      number,
      title: pr.title,
      body: pr.body ?? "",
      author: pr.user.login,
      baseBranch: pr.base.ref,
      headBranch: pr.head.ref,
      headSha: pr.head.sha.slice(0, 7),
      status: pr.state === "open" ? "open" : "closed",
    })
    .onConflictDoUpdate({
      target: [pullRequests.repoId, pullRequests.number],
      set: { title: pr.title, body: pr.body ?? "", headBranch: pr.head.ref, headSha: pr.head.sha.slice(0, 7), status: pr.state === "open" ? "open" : "closed" },
    })
    .returning();
  await db.delete(prFiles).where(eq(prFiles.prId, row.id));
  if (files.length) await db.insert(prFiles).values(files.map((f) => ({ prId: row.id, path: f.path, status: f.status, content: f.content })));
  invalidatePRsCache();
  return row.id;
}

export async function connectGithubRepo(token: string | null, fullName: string): Promise<RepoRow> {
  const snap = await fetchRepoSnapshot(token, fullName);
  const values = {
    fullName: snap.meta.full_name,
    name: snap.meta.name,
    provider: "github",
    description: snap.meta.description ?? "",
    language: snap.meta.language ?? "Unknown",
    isPrivate: snap.meta.private,
    defaultBranch: snap.meta.default_branch,
    htmlUrl: snap.meta.html_url,
    branches: snap.branches,
    commits: snap.commits,
  };
  const [row] = await db
    .insert(repositories)
    .values(values)
    .onConflictDoUpdate({ target: repositories.fullName, set: { ...values, lastSyncedAt: new Date() } })
    .returning();
  await replaceRepoFiles(row.id, snap.files);
  try {
    const pulls = await listOpenPulls(token, row.fullName);
    for (const p of pulls) await upsertPull(token, row, p.number).catch(() => undefined);
  } catch {
    /* PRs are optional */
  }
  invalidateAllCache();
  return row;
}

export async function postPRComment(prId: number) {
  const [pr] = await db.select().from(pullRequests).where(eq(pullRequests.id, prId));
  if (!pr || !pr.analysis) throw new Error("Pull request has not been analysed yet");
  const [repo] = await db.select().from(repositories).where(eq(repositories.id, pr.repoId));
  const fixStatus = await getFixStatuses(prId);
  const body = buildPrComment({ repo: repo.fullName, number: pr.number, analysis: pr.analysis as PRAnalysis, fixStatus });
  const token = await getGithubToken();
  let postedTo: "github" | "preview" = "preview";
  let url: string | null = null;
  if (repo.provider === "github" && token) {
    url = await postPrComment(token, repo.fullName, pr.number, body);
    postedTo = "github";
  }
  const [c] = await db.insert(prComments).values({ prId, body, postedTo, url }).returning();
  return c;
}
