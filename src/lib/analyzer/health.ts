import { dependenciesOf, dependentsOf, type ProjectGraph } from "./graph";
import { shortName } from "./impact";
import type { PRAnalysis, RepoInput, RiskFactor } from "./types";

export const LATEST_MAJOR: Record<string, number> = {
  react: 19,
  "react-dom": 19,
  next: 16,
  express: 5,
  zod: 4,
  stripe: 18,
  typescript: 5,
  axios: 1,
  lodash: 4,
  vue: 3,
  fastify: 5,
  prisma: 6,
  "drizzle-orm": 0,
};

export interface HealthResult {
  repoId: number;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: RiskFactor[];
  coverage: number;
  outdated: { name: string; current: string; latest: number }[];
}

export function testCoverage(repo: RepoInput): { ratio: number; total: number; uncovered: string[] } {
  const tests = repo.files.filter((f) => f.isTest);
  const syms = repo.files
    .filter((f) => !f.isTest)
    .flatMap((f) => f.symbols)
    .filter((s) => s.exported && ["function", "method", "route", "class"].includes(s.kind));
  const uncovered: string[] = [];
  let covered = 0;
  for (const s of syms) {
    const sn = shortName(s.name);
    const hit = tests.some((t) =>
      s.kind === "route" && s.route
        ? t.httpCalls.some((h) => h.method === s.route!.method && h.path.split("/")[1] === s.route!.path.split("/")[1])
        : t.calls.some((c) => c.name === sn) || t.imports.some((i) => i.named.some((n) => n.name === sn)),
    );
    if (hit) covered++;
    else uncovered.push(s.name);
  }
  return { ratio: syms.length ? covered / syms.length : 1, total: syms.length, uncovered };
}

export function repoHealth(
  graph: ProjectGraph,
  repo: RepoInput,
  prs: { repoId: number; status: string; analysis: PRAnalysis | null }[],
): HealthResult {
  const own = prs.filter((p) => p.repoId === repo.id);
  const open = prs.filter((p) => p.status === "open" && p.analysis);
  const unresolved =
    open.reduce((n, p) => n + p.analysis!.findings.filter((f) => f.repoId === repo.id && f.verdict === "confirmed").length, 0) +
    open.filter((p) => p.repoId === repo.id).reduce((n, p) => n + p.analysis!.changes.filter((c) => c.verdict === "confirmed_breaking").length, 0);
  const breaking = own.filter((p) => p.analysis?.changes.some((c) => c.verdict === "confirmed_breaking")).length;
  const freq = own.length ? breaking / own.length : 0;
  const cov = testCoverage(repo);
  const fanIn = dependentsOf(graph, repo.id).length;
  const fanOut = dependenciesOf(graph, repo.id).length;
  const outEdges = graph.edges.filter((e) => e.fromRepo === repo.id && e.toRepo !== repo.id).length;
  const outdated: HealthResult["outdated"] = [];
  for (const f of repo.files) {
    if (!f.pkg) continue;
    for (const [name, v] of Object.entries({ ...f.pkg.dependencies, ...f.pkg.devDependencies })) {
      const m = v.match(/(\d+)/);
      const latest = LATEST_MAJOR[name];
      if (m && latest && Number(m[1]) < latest) outdated.push({ name, current: v, latest });
    }
  }
  const factors: RiskFactor[] = [
    { label: "Unresolved dependency issues", points: Math.min(25, unresolved * 5), max: 25, detail: `${unresolved} confirmed issue${unresolved === 1 ? "" : "s"} in open pull requests` },
    { label: "Breaking-change frequency", points: Math.round(freq * 20), max: 20, detail: `${breaking} of ${own.length} analysed PRs introduced breaking changes` },
    { label: "Test coverage", points: Math.round((1 - cov.ratio) * 25), max: 25, detail: `${Math.round(cov.ratio * 100)}% of exported symbols are referenced by tests` },
    { label: "Dependency complexity", points: Math.min(15, (fanIn + fanOut) * 3 + Math.floor(outEdges / 3)), max: 15, detail: `${fanIn} dependents · ${fanOut} dependencies · ${outEdges} outbound links` },
    { label: "Outdated dependencies", points: Math.min(15, outdated.length * 5), max: 15, detail: outdated.length ? outdated.map((o) => `${o.name}@${o.current}`).join(", ") : "all tracked packages are current" },
  ];
  const score = Math.max(0, 100 - factors.reduce((s, f) => s + f.points, 0));
  const grade = score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  return { repoId: repo.id, score, grade, factors, coverage: cov.ratio, outdated };
}
