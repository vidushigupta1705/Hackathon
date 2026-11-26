import type { ProjectGraph } from "./analyzer/graph";
import { repoHealth, type HealthResult } from "./analyzer/health";
import { ensureDemo, getCacheVersion, listPRs, loadGraph, type PRWithRepo, type RepoRow } from "./store";

export type AppContext = {
  graph: ProjectGraph;
  rows: RepoRow[];
  prs: PRWithRepo[];
  health: Map<number, HealthResult>;
};

const globalForContext = globalThis as typeof globalThis & {
  __devImpactContextCache?: { version: number; promise: Promise<AppContext> };
};

export async function loadContext(): Promise<AppContext> {
  await ensureDemo();
  const version = getCacheVersion();
  const cached = globalForContext.__devImpactContextCache;
  if (cached && cached.version === version) return cached.promise;

  const promise = Promise.all([loadGraph(), listPRs()])
    .then(([{ graph, rows }, prs]) => {
      const prSummaries = prs.map((p) => ({ repoId: p.repoId, status: p.status, analysis: p.analysis }));
      const health = new Map<number, HealthResult>(graph.repos.map((r) => [r.id, repoHealth(graph, r, prSummaries)]));
      return { graph, rows, prs, health };
    })
    .catch((err) => {
      if (globalForContext.__devImpactContextCache?.promise === promise) {
        globalForContext.__devImpactContextCache = undefined;
      }
      throw err;
    });

  globalForContext.__devImpactContextCache = { version, promise };
  return promise;
}
