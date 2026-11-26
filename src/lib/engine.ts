import { diffRepo } from "./analyzer/diff";
import { explainChange, generateFixes, llmEnhance, summarize, verifyChecklist } from "./analyzer/explain";
import type { ProjectGraph } from "./analyzer/graph";
import { computeImpact, recommendTests, scoreRisk } from "./analyzer/impact";
import type { Change, ParsedFile, PRAnalysis } from "./analyzer/types";

export async function buildAnalysis(
  graph: ProjectGraph,
  repoId: number,
  changes: Change[],
  opts: { llm?: boolean; head?: ParsedFile[] } = {},
): Promise<PRAnalysis> {
  const repo = graph.repoById.get(repoId)!;
  const report = computeImpact(graph, changes, opts.head ? { repoId, files: opts.head } : undefined);
  const tests = recommendTests(graph, report);
  const risk = scoreRisk(graph, report, tests, repoId);
  let explanations: Record<string, string> = {};
  for (const c of report.changes) if (c.verdict && c.verdict !== "non_breaking") explanations[c.id] = explainChange(c, report);
  let summary = summarize(repo.fullName, report, risk.score, risk.level);
  let engine: PRAnalysis["engine"] = "rule-engine";
  if (opts.llm) {
    const ai = await llmEnhance(repo.fullName, report, { summary, explanations });
    if (ai) {
      summary = ai.summary;
      explanations = ai.explanations;
      engine = "llm";
    }
  }
  const fixes = generateFixes(graph, report);
  const verify = verifyChecklist(report, tests);
  const confirmed = report.changes.filter((c) => c.verdict === "confirmed_breaking").length;
  const potential = report.changes.filter((c) => c.verdict === "potential_risk").length;
  return {
    generatedAt: new Date().toISOString(),
    engine,
    summary,
    changes: report.changes,
    explanations,
    findings: report.findings,
    affected: report.affected,
    repos: report.repos,
    risk,
    tests,
    fixes,
    verify,
    stats: {
      changed: report.changes.length,
      confirmed,
      potential,
      safe: report.changes.length - confirmed - potential,
      affectedRepos: report.repos.filter((r) => r.level !== "origin").length,
      affectedNodes: report.affected.length,
    },
  };
}

// ------------------------------------------------------------ what-if simulation

export type SimAction =
  | { type: "remove"; symbol: string }
  | { type: "rename"; symbol: string; newName: string }
  | { type: "param_type"; symbol: string; paramIndex: number; newType: string }
  | { type: "add_param"; symbol: string; name: string; paramType: string }
  | { type: "return_type"; symbol: string; newType: string }
  | { type: "route_path"; symbol: string; newPath: string }
  | { type: "remove_field"; symbol: string; field: string }
  | { type: "upgrade_dep"; symbol: string };

const sig = (s: ParsedFile["symbols"][number]) =>
  `${s.name}(${s.params.map((p) => `${p.rest ? "..." : ""}${p.name}${p.optional ? "?" : ""}${p.type ? ": " + p.type : ""}`).join(", ")})${s.returnType ? ": " + s.returnType : ""}`;

export function simulate(graph: ProjectGraph, repoId: number, action: SimAction): { changes: Change[]; head?: ParsedFile[]; error?: string } {
  const repo = graph.repoById.get(repoId);
  if (!repo) return { changes: [], error: "Repository not found" };
  const head: ParsedFile[] = structuredClone(repo.files);

  if (action.type === "upgrade_dep") {
    let found = false;
    for (const f of head) {
      if (!f.pkg) continue;
      for (const bucket of [f.pkg.dependencies, f.pkg.devDependencies]) {
        const v = bucket[action.symbol];
        if (v) {
          const m = v.match(/(\d+)/);
          bucket[action.symbol] = v.replace(/\d+/, String((m ? Number(m[1]) : 0) + 1));
          found = true;
        }
      }
    }
    if (!found) return { changes: [], error: "Dependency not found" };
    return { changes: diffRepo(repoId, repo.files, head), head };
  }

  let target: ParsedFile["symbols"][number] | undefined;
  let owner: ParsedFile | undefined;
  for (const f of head) {
    const s = f.symbols.find((x) => x.name === action.symbol);
    if (s) {
      target = s;
      owner = f;
      break;
    }
  }
  if (!target || !owner) return { changes: [], error: "Symbol not found" };

  switch (action.type) {
    case "remove":
      owner.symbols = owner.symbols.filter((s) => s !== target);
      break;
    case "rename": {
      if (target.kind === "route") return { changes: [], error: "Use the route path action for endpoints" };
      const old = target.name;
      target.name = action.newName;
      target.signature = sig(target);
      if (target.kind === "class") for (const s of owner.symbols) if (s.name.startsWith(old + ".")) s.name = action.newName + s.name.slice(old.length);
      break;
    }
    case "param_type": {
      const p = target.params[action.paramIndex];
      if (!p) return { changes: [], error: "Parameter not found" };
      p.type = action.newType;
      target.signature = sig(target);
      break;
    }
    case "add_param":
      target.params.push({ name: action.name, type: action.paramType, optional: false, hasDefault: false, rest: false });
      target.signature = sig(target);
      break;
    case "return_type":
      target.returnType = action.newType;
      target.signature = sig(target);
      break;
    case "route_path": {
      if (!target.route) return { changes: [], error: "Not an endpoint" };
      target.route = { ...target.route, path: action.newPath };
      target.name = `${target.route.method} ${action.newPath}`;
      target.signature = target.name;
      break;
    }
    case "remove_field":
      if (!target.fields) return { changes: [], error: "Type has no fields" };
      target.fields = target.fields.filter((f) => f.name !== action.field);
      break;
  }
  return { changes: diffRepo(repoId, repo.files, head), head };
}
