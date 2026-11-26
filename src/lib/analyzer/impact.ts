import { dependentsOf, nodeKey, type Edge, type ProjectGraph } from "./graph";
import { unionMembers } from "./diff";
import type {
  ParsedFile,
  AffectedNode,
  Change,
  Finding,
  ImpactReport,
  MissingCoverage,
  RepoImpact,
  RiskFactor,
  Severity,
  TestRec,
} from "./types";

const SEV: Severity[] = ["low", "medium", "high", "critical"];
const down = (s: Severity): Severity => SEV[Math.max(0, SEV.indexOf(s) - 1)];
const maxSev = (a: Severity, b: Severity): Severity => (SEV.indexOf(a) >= SEV.indexOf(b) ? a : b);
export const shortName = (s: string) => (s.includes(" ") ? s : s.split(".").pop()!);
const PRIM = new Set(["string", "number", "boolean", "bigint", "null", "undefined", "void"]);

function assignable(argType: string, expected: string): boolean | null {
  if (argType === "unknown" || argType === "spread") return null;
  const members = unionMembers(expected);
  if (members.has("any") || members.has("unknown")) return true;
  if (members.has(argType)) return true;
  if (argType === "object") return null;
  if (argType === "array") return [...members].some((m) => m.endsWith("[]") || m.startsWith("Array<")) ? true : [...members].every((m) => PRIM.has(m)) ? false : null;
  if ([...members].some((m) => /^["'`]/.test(m) || /^-?\d+$/.test(m))) return null;
  return [...members].every((m) => PRIM.has(m)) ? false : null;
}

export interface Overlay {
  repoId: number;
  head: Map<string, ParsedFile>;
  changed: Set<string>;
}
let OV: Overlay | undefined;

/** Re-evaluate edges originating in files modified by the PR against their head version. */
function adapt(e: Edge): Edge | null {
  if (!OV || e.fromRepo !== OV.repoId || !OV.changed.has(e.fromFile)) return e;
  const hf = OV.head.get(e.fromFile);
  if (!hf) return null;
  if (e.kind === "import") {
    const hit = hf.imports.find((i) => i.named.some((n) => n.name === e.toSymbol));
    return hit ? { ...e, line: hit.line, text: hit.text } : null;
  }
  if (e.call) {
    const c = hf.calls.find((x) => x.name === e.call!.name && x.enclosing === e.fromSymbol && x.object === e.call!.object);
    return c ? { ...e, call: c, line: c.line, text: c.text } : null;
  }
  const s = hf.symbols.find((x) => x.name === e.fromSymbol);
  return s ? e : null;
}
const edgesInto = (key: string) => (graphRef?.byTarget.get(key) ?? []).map(adapt).filter((e): e is Edge => !!e);
let graphRef: ProjectGraph | undefined;
const fileOf = (repoId: number, file: string): ParsedFile | undefined =>
  OV && OV.repoId === repoId && OV.changed.has(file) ? OV.head.get(file) : graphRef?.fileMap.get(`${repoId}|${file}`);

const HARD_KINDS = new Set(["function_removed", "route_removed", "route_changed", "function_renamed", "type_removed", "export_removed"]);

function mkFinding(graph: ProjectGraph, change: Change, e: Edge, verdict: "confirmed" | "potential", reason: string, conf?: number): Finding {
  const repoName = graph.repoById.get(e.fromRepo)?.fullName ?? String(e.fromRepo);
  const severity: Severity = verdict === "confirmed" ? (HARD_KINDS.has(change.kind) ? "critical" : "high") : "medium";
  return {
    id: `${change.id}@${e.fromRepo}:${e.fromFile}:${e.line}:${e.fromSymbol}`,
    changeId: change.id,
    repoId: e.fromRepo,
    repoName,
    file: e.fromFile,
    line: e.line,
    symbol: e.fromSymbol,
    text: e.text,
    edgeKind: e.kind,
    verdict,
    reason,
    confidence: conf ?? (verdict === "confirmed" ? (e.kind === "http" ? 0.9 : 0.95) : 0.55),
    severity,
  };
}

const where = (e: Edge) => `\`${e.fromSymbol === "<module>" ? e.fromFile : e.fromSymbol}\` (${e.fromFile}:${e.line})`;

function typeConsumers(graph: ProjectGraph, change: Change): { findings: Finding[]; edgeCount: number } {
  const typeName = change.symbol;
  const field = String(change.detail.field ?? "");
  const re = new RegExp(`\\b${typeName.replace(/[^\w$]/g, "")}\\b`);
  const findings: Finding[] = [];
  const covered = new Set<string>();
  let edgeCount = 0;
  const repo = graph.repoById.get(change.repoId);
  const mention: { file: string; name: string }[] = [];
  for (const f of repo?.files ?? []) {
    if (f.isTest) continue;
    for (const s of f.symbols) {
      if (!["function", "method"].includes(s.kind)) continue;
      if (re.test(s.returnType) || s.params.some((p) => re.test(p.type))) mention.push({ file: s.file, name: s.name });
    }
  }
  const removal = change.kind === "type_field_removed";
  for (const m of mention) {
    for (const e of edgesInto(nodeKey(change.repoId, m.file, m.name))) {
      if (e.kind === "import") continue;
      edgeCount++;
      if (change.kind !== "type_field_added") covered.add(`${e.fromRepo}|${e.fromFile}`);
      const accessed = !!field && !!fileOf(e.fromRepo, e.fromFile)?.propAccess.includes(field);
      if (change.kind === "type_field_added") continue;
      const detail = change.kind === "type_field_changed" ? `type \`${change.detail.oldType}\` → \`${change.detail.newType}\`` : "removed";
      if (removal && accessed) {
        findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} calls \`${m.name}\` which returns \`${typeName}\` and reads \`.${field}\`, which no longer exists.`));
      } else if (accessed) {
        findings.push(mkFinding(graph, change, e, "potential", `${where(e)} calls \`${m.name}\` (returns \`${typeName}\`) and reads \`.${field}\` (${detail}). Verify downstream usage still type-checks.`, change.detail.categoryChange ? 0.75 : 0.6));
      } else {
        findings.push(mkFinding(graph, change, e, "potential", `${where(e)} consumes \`${typeName}\` through \`${m.name}\`; \`${field}\` is not read directly but may be forwarded or serialised.`, 0.35));
      }
    }
  }
  // file-level consumers that import the type directly
  for (const e of edgesInto(nodeKey(change.repoId, change.file, typeName))) {
    if (e.kind !== "import" || e.fromRepo === change.repoId) continue;
    edgeCount++;
    if (covered.has(`${e.fromRepo}|${e.fromFile}`)) continue;
    const accessed = !!field && !!fileOf(e.fromRepo, e.fromFile)?.propAccess.includes(field);
    if (change.kind === "type_field_added") {
      findings.push(mkFinding(graph, change, e, "potential", `${where(e)} imports \`${typeName}\`; if it constructs this type, it must now provide \`${field}\`.`, 0.35));
    } else if (removal && accessed) {
      findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} imports \`${typeName}\` and reads \`.${field}\`, which was removed.`));
    } else {
      findings.push(mkFinding(graph, change, e, "potential", `${where(e)} imports \`${typeName}\`${accessed ? ` and reads \`.${field}\`` : ""}; the shape of \`${field}\` changed.`, accessed ? 0.65 : 0.4));
    }
  }
  return { findings, edgeCount };
}

function symbolConsumers(graph: ProjectGraph, change: Change): { findings: Finding[]; edgeCount: number } {
  const edges = edgesInto(nodeKey(change.repoId, change.file, change.symbol));
  const findings: Finding[] = [];
  const callFiles = new Set(edges.filter((e) => e.kind !== "import").map((e) => `${e.fromRepo}|${e.fromFile}`));
  const d = change.detail;
  let edgeCount = 0;

  for (const e of edges) {
    if (e.kind === "import") {
      if (["function_removed", "export_removed", "type_removed", "function_renamed"].includes(change.kind) && !callFiles.has(`${e.fromRepo}|${e.fromFile}`)) {
        edgeCount++;
        findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} imports \`${change.symbol}\`, which ${change.kind === "function_renamed" ? `was renamed to \`${d.renamedTo}\`` : "no longer exists"}.`));
      }
      continue;
    }
    edgeCount++;
    const c = e.call;
    const argN = c?.args.length ?? 0;
    const hasSpread = !!c?.args.some((a) => a.type === "spread");
    switch (change.kind) {
      case "function_removed":
      case "export_removed":
        findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} still ${e.kind === "http" ? "calls" : "invokes"} \`${change.symbol}\`, which ${change.kind === "export_removed" ? "is no longer exported" : "was removed"}.`));
        break;
      case "function_renamed":
        findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} still calls \`${change.symbol}\`; it was renamed to \`${d.renamedTo}\`.`));
        break;
      case "route_removed":
        findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} calls \`${change.symbol}\`, which no longer exists.`));
        break;
      case "route_changed":
        findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} calls \`${change.symbol}\`, which is now \`${d.newMethod} ${d.newPath}\`.`));
        break;
      case "param_added_required": {
        const need = Number(d.requiredCount);
        if (hasSpread) findings.push(mkFinding(graph, change, e, "potential", `${where(e)} spreads arguments into \`${change.symbol}\`; cannot verify the new required \`${d.paramName}\`.`));
        else if (argN < need) findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} passes ${argN} argument${argN === 1 ? "" : "s"} but \`${change.symbol}\` now requires ${need} (new required \`${d.paramName}\`).`));
        break;
      }
      case "param_made_required":
        if (argN <= Number(d.paramIndex)) findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} omits \`${d.paramName}\`, which is now required.`));
        break;
      case "param_removed":
        if (argN > Number(d.newParamCount)) findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} passes ${argN} arguments but \`${change.symbol}\` now accepts ${d.newParamCount} (\`${d.paramName}\` was removed).`));
        break;
      case "param_type_changed": {
        const arg = c?.args[Number(d.paramIndex)];
        if (!arg) break;
        const ok = assignable(arg.type, String(d.newType));
        if (ok === false) findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} passes \`${arg.text}\` (type \`${arg.type}\`) but \`${d.paramName}\` now expects \`${d.newType}\`.`));
        else if (ok === null) findings.push(mkFinding(graph, change, e, "potential", `${where(e)} passes \`${arg.text}\` whose type could not be inferred; \`${d.paramName}\` now expects \`${d.newType}\` (was \`${d.oldType}\`).`));
        break;
      }
      case "return_type_changed":
        if (c?.usesResult) {
          if (d.categoryChange) findings.push(mkFinding(graph, change, e, "confirmed", `${where(e)} uses the result of \`${change.symbol}\`, whose return type changed from \`${d.oldType}\` to a different kind of value (\`${d.newType}\`).`, 0.85));
          else findings.push(mkFinding(graph, change, e, "potential", `${where(e)} uses the result of \`${change.symbol}\` (\`${c.assignedTo ?? "result"}\`); return type is now \`${d.newType}\` — handle the new case${String(d.newType).includes("null") || String(d.newType).includes("undefined") ? " (null/undefined)" : ""}.`));
        }
        break;
      default:
        break;
    }
  }
  return { findings, edgeCount };
}

export function computeImpact(graph: ProjectGraph, changes: Change[], head?: { repoId: number; files: ParsedFile[] }): ImpactReport {
  graphRef = graph;
  OV = undefined;
  if (head) {
    const base = new Map(graph.repoById.get(head.repoId)?.files.map((f) => [f.path, f]) ?? []);
    const changed = new Set<string>();
    for (const f of head.files) if (base.get(f.path) !== f) changed.add(f.path);
    for (const p of base.keys()) if (!head.files.some((f) => f.path === p)) changed.add(p);
    OV = { repoId: head.repoId, head: new Map(head.files.map((f) => [f.path, f])), changed };
  }
  try {
    return computeImpactInner(graph, changes);
  } finally {
    OV = undefined;
  }
}

function computeImpactInner(graph: ProjectGraph, changes: Change[]): ImpactReport {
  const findings: Finding[] = [];
  const affected = new Map<string, AffectedNode>();
  const originRepos = new Set(changes.map((c) => c.repoId));

  const addNode = (n: AffectedNode) => {
    const k = `${n.changeId}|${n.repoId}|${n.file}|${n.symbol}`;
    const cur = affected.get(k);
    if (!cur || n.depth < cur.depth) affected.set(k, n);
  };

  for (const change of changes) {
    if (change.inherent === "safe") {
      change.verdict = "non_breaking";
      continue;
    }
    let fs: Finding[] = [];
    let edgeCount = 0;

    if (change.symbolKind === "dependency") {
      if (change.kind === "dep_removed" && change.detail.importedBy) {
        const repo = graph.repoById.get(change.repoId)!;
        fs.push({
          id: `${change.id}@self`,
          changeId: change.id,
          repoId: change.repoId,
          repoName: repo.fullName,
          file: String(change.detail.importedBy),
          line: 1,
          symbol: "<module>",
          text: `import ... from "${change.symbol}"`,
          edgeKind: "dependency",
          verdict: "confirmed",
          reason: `\`${change.detail.importedBy}\` still imports \`${change.symbol}\`, but it was removed from package.json.`,
          confidence: 0.95,
          severity: "high",
        });
      }
      if (change.detail.major || change.kind === "dep_removed") {
        // repo-level transitive propagation through dependents
        const seen = new Set<number>([change.repoId]);
        let frontier = [change.repoId];
        let hop = 0;
        while (frontier.length && hop < 5) {
          hop++;
          const next: number[] = [];
          for (const rid of frontier) {
            for (const dep of dependentsOf(graph, rid)) {
              if (seen.has(dep)) continue;
              seen.add(dep);
              next.push(dep);
              const repo = graph.repoById.get(dep)!;
              const sev: Severity = hop === 1 ? "medium" : "low";
              const conf = hop === 1 ? 0.4 : 0.25;
              const reason =
                hop === 1
                  ? `Depends directly on ${graph.repoById.get(change.repoId)!.fullName}, which ${change.kind === "dep_removed" ? "removes" : "makes a major upgrade of"} \`${change.symbol}\`; serialised shapes or runtime behaviour may differ.`
                  : `Transitively depends on ${graph.repoById.get(change.repoId)!.fullName} through ${graph.repoById.get(rid)?.name}.`;
              if (hop === 1) {
                fs.push({
                  id: `${change.id}@${dep}`,
                  changeId: change.id,
                  repoId: dep,
                  repoName: repo.fullName,
                  file: "package.json",
                  line: 1,
                  symbol: "<repository>",
                  text: `depends on ${graph.repoById.get(change.repoId)!.fullName}`,
                  edgeKind: "dependency",
                  verdict: "potential",
                  reason,
                  confidence: conf,
                  severity: sev,
                });
              }
              addNode({ repoId: dep, repoName: repo.fullName, file: "*", symbol: "(runtime dependency)", depth: hop, repoHop: hop, severity: sev, confidence: conf, reason, changeId: change.id, via: [change.symbol] });
            }
          }
          frontier = next;
        }
      }
    } else {
      const r = ["type_field_removed", "type_field_changed", "type_field_added"].includes(change.kind)
        ? typeConsumers(graph, change)
        : symbolConsumers(graph, change);
      fs = r.findings;
      edgeCount = r.edgeCount;

      // transitive blast radius
      const seen = new Set<string>([nodeKey(change.repoId, change.file, change.symbol)]);
      const queue: { key: string; depth: number; hop: number; sev: Severity; conf: number; via: string[] }[] = [];
      for (const f of fs) {
        if (f.symbol === "<module>") {
          addNode({ repoId: f.repoId, repoName: f.repoName, file: f.file, symbol: "<module>", depth: 1, repoHop: f.repoId === change.repoId ? 0 : 1, severity: f.severity, confidence: f.confidence, reason: f.reason, changeId: change.id, via: [change.symbol] });
          continue;
        }
        const key = nodeKey(f.repoId, f.file, f.symbol);
        if (seen.has(key)) continue;
        seen.add(key);
        const hop = f.repoId === change.repoId ? 0 : 1;
        addNode({ repoId: f.repoId, repoName: f.repoName, file: f.file, symbol: f.symbol, depth: 1, repoHop: hop, severity: f.severity, confidence: f.confidence, reason: f.reason, changeId: change.id, via: [change.symbol, f.symbol] });
        queue.push({ key, depth: 1, hop, sev: f.severity, conf: f.confidence, via: [change.symbol, f.symbol] });
      }
      let guard = 0;
      while (queue.length && guard < 400) {
        const cur = queue.shift()!;
        for (const e0 of graph.byTarget.get(cur.key) ?? []) {
          const e = adapt(e0);
          if (!e || e.kind === "import" || e.fromSymbol === "<module>") continue;
          const nk = nodeKey(e.fromRepo, e.fromFile, e.fromSymbol);
          if (seen.has(nk)) continue;
          seen.add(nk);
          guard++;
          const depth = cur.depth + 1;
          const hop = cur.hop + (e.fromRepo !== e.toRepo ? 1 : 0);
          const sev = down(cur.sev);
          const conf = Math.round(cur.conf * 0.8 * 100) / 100;
          const via = [...cur.via, e.fromSymbol];
          addNode({
            repoId: e.fromRepo,
            repoName: graph.repoById.get(e.fromRepo)?.fullName ?? "",
            file: e.fromFile,
            symbol: e.fromSymbol,
            depth,
            repoHop: hop,
            severity: sev,
            confidence: conf,
            reason: `\`${e.fromSymbol}\` ${e.kind === "http" ? "calls endpoint" : "calls"} \`${e.toSymbol}\`, which is affected at depth ${depth - 1} (${e.fromFile}:${e.line}).`,
            changeId: change.id,
            via,
          });
          queue.push({ key: nk, depth, hop, sev, conf, via });
        }
      }
    }

    fs = fs.filter((f, i) => fs.findIndex((g) => g.id === f.id) === i);
    findings.push(...fs);
    const hasConfirmed = fs.some((f) => f.verdict === "confirmed");
    if (hasConfirmed) change.verdict = "confirmed_breaking";
    else if (fs.length > 0) change.verdict = "potential_risk";
    else if (edgeCount > 0) {
      change.verdict = "non_breaking";
      change.detail.note = "All known call sites remain compatible with this change.";
    } else if (change.inherent === "breaking") {
      change.verdict = "potential_risk";
      change.detail.note = "No consumers found in the connected repositories — external consumers may still exist.";
    } else {
      change.verdict = "non_breaking";
      change.detail.note = "No consumers found in the connected repositories.";
    }
  }

  const nodes = [...affected.values()];
  const repos = new Map<number, RepoImpact>();
  for (const id of originRepos) {
    const r = graph.repoById.get(id)!;
    repos.set(id, { repoId: id, name: r.fullName, level: "origin", hop: 0, nodeCount: 0, fileCount: 0, files: [], severity: "low", confidence: 1, confirmed: 0, potential: 0, reasons: [] });
  }
  const seenNodes = new Set<string>();
  for (const n of nodes) {
    let r = repos.get(n.repoId);
    if (!r) {
      r = { repoId: n.repoId, name: n.repoName, level: n.repoHop <= 1 ? "direct" : "indirect", hop: n.repoHop, nodeCount: 0, fileCount: 0, files: [], severity: "low", confidence: 0, confirmed: 0, potential: 0, reasons: [] };
      repos.set(n.repoId, r);
    }
    if (r.level !== "origin" && n.repoHop < r.hop) {
      r.hop = n.repoHop;
      r.level = n.repoHop <= 1 ? "direct" : "indirect";
    }
    const uk = `${n.repoId}|${n.file}|${n.symbol}`;
    if (!seenNodes.has(uk)) {
      seenNodes.add(uk);
      r.nodeCount++;
    }
    if (n.file !== "*" && !r.files.includes(n.file)) r.files.push(n.file);
    r.severity = maxSev(r.severity, n.severity);
    r.confidence = Math.max(r.confidence, n.confidence);
    if (r.reasons.length < 3 && !r.reasons.includes(n.reason)) r.reasons.push(n.reason);
  }
  for (const f of findings) {
    const r = repos.get(f.repoId);
    if (!r) continue;
    if (f.verdict === "confirmed") r.confirmed++;
    else r.potential++;
  }
  for (const r of repos.values()) r.fileCount = r.files.length;

  return {
    changes,
    findings,
    affected: nodes.sort((a, b) => a.depth - b.depth),
    repos: [...repos.values()].sort((a, b) => a.hop - b.hop || b.confirmed - a.confirmed),
  };
}

// ---------------------------------------------------------------- tests

export function recommendTests(graph: ProjectGraph, report: ImpactReport): { recommended: TestRec[]; missing: MissingCoverage[] } {
  type Target = { repoId: number; file: string; symbol: string; prio: "must" | "should" | "nice"; why: string };
  const targets: Target[] = [];
  const rank = { must: 3, should: 2, nice: 1 };

  for (const c of report.changes) {
    if (c.symbolKind === "dependency" || c.kind === "function_added" || c.kind === "route_added") continue;
    const prio = c.verdict === "confirmed_breaking" ? "must" : c.verdict === "potential_risk" ? "should" : "nice";
    targets.push({ repoId: c.repoId, file: c.file, symbol: c.kind === "function_renamed" ? String(c.detail.renamedTo) : c.symbol, prio, why: `\`${shortName(c.symbol)}\` is modified in this PR (${c.kind.replace(/_/g, " ")})` });
  }
  for (const n of report.affected) {
    if (n.symbol === "<module>" || n.file === "*") continue;
    const prio = n.depth === 1 && n.severity !== "low" && n.confidence >= 0.8 ? "must" : n.depth === 1 ? "should" : "nice";
    targets.push({ repoId: n.repoId, file: n.file, symbol: n.symbol, prio, why: `\`${shortName(n.symbol)}\` is ${n.depth === 1 ? "directly" : "indirectly"} affected via ${n.via[0]}` });
  }

  const recs = new Map<string, TestRec>();
  const missing = new Map<string, MissingCoverage>();
  for (const t of targets) {
    const repo = graph.repoById.get(t.repoId);
    if (!repo) continue;
    const sn = shortName(t.symbol);
    const routeSym = graph.symbolMap.get(nodeKey(t.repoId, t.file, t.symbol));
    const testFiles = repo.files.filter((f) => f.isTest);
    const hits = testFiles.filter((f) => {
      if (t.symbol.includes(" ") && routeSym?.route) {
        const rt = routeSym.route;
        return f.httpCalls.some((h) => h.method === rt.method && h.path.split("/").filter(Boolean).length === rt.path.split("/").filter(Boolean).length && h.path.split("/")[1] === rt.path.split("/")[1]);
      }
      return f.calls.some((c) => c.name === sn) || f.imports.some((i) => i.named.some((n) => n.name === sn)) || f.typeRefs.includes(sn);
    });
    if (hits.length === 0) {
      const k = `${t.repoId}|${t.file}|${t.symbol}`;
      if (!missing.has(k)) missing.set(k, { repoId: t.repoId, repoName: repo.fullName, file: t.file, symbol: t.symbol, why: `No test references \`${sn}\` although it is ${t.prio === "must" ? "at high risk" : "touched by this change"}.` });
      continue;
    }
    for (const h of hits) {
      const k = `${t.repoId}|${h.path}`;
      const cur = recs.get(k);
      if (!cur) recs.set(k, { repoId: t.repoId, repoName: repo.fullName, file: h.path, priority: t.prio, reason: t.why, covers: [sn] });
      else {
        if (rank[t.prio] > rank[cur.priority]) {
          cur.priority = t.prio;
          cur.reason = t.why;
        }
        if (!cur.covers.includes(sn)) cur.covers.push(sn);
      }
    }
  }
  return {
    recommended: [...recs.values()].sort((a, b) => rank[b.priority] - rank[a.priority]),
    missing: [...missing.values()],
  };
}

// ---------------------------------------------------------------- risk

export function scoreRisk(
  graph: ProjectGraph,
  report: ImpactReport,
  tests: { recommended: TestRec[]; missing: MissingCoverage[] },
  originRepoId: number,
) {
  const changes = report.changes;
  const confirmed = changes.filter((c) => c.verdict === "confirmed_breaking").length;
  const potential = changes.filter((c) => c.verdict === "potential_risk").length;
  const direct = report.repos.filter((r) => r.level === "direct").length;
  const indirect = report.repos.filter((r) => r.level === "indirect").length;
  const fanIn = dependentsOf(graph, originRepoId).length;
  const ratio = fanIn / Math.max(1, graph.repos.length - 1);
  const gapRatio = tests.missing.length / Math.max(1, tests.missing.length + tests.recommended.length);
  const sensitive = changes.filter((c) => c.verdict !== "non_breaking" && ["route_removed", "route_changed", "type_field_removed", "function_removed"].includes(c.kind)).length;

  const factors: RiskFactor[] = [
    { label: "Confirmed breaking changes", points: Math.min(45, confirmed * 18), max: 45, detail: `${confirmed} change${confirmed === 1 ? "" : "s"} with proven incompatible call sites` },
    { label: "Potential compatibility risks", points: Math.min(18, potential * 6), max: 18, detail: `${potential} change${potential === 1 ? "" : "s"} that could not be proven safe` },
    { label: "Blast radius", points: Math.min(20, direct * 7 + indirect * 4), max: 20, detail: `${direct} directly and ${indirect} indirectly affected repositor${direct + indirect === 1 ? "y" : "ies"}` },
    { label: "Dependency criticality", points: Math.round(ratio * 10), max: 10, detail: `${fanIn} of ${Math.max(0, graph.repos.length - 1)} other repositories depend on this one` },
    { label: "Test coverage gaps", points: Math.round(gapRatio * 7), max: 7, detail: `${tests.missing.length} impacted symbol${tests.missing.length === 1 ? "" : "s"} without tests` },
    { label: "API / schema surface", points: Math.min(5, sensitive * 3), max: 5, detail: `${sensitive} endpoint, schema or removal change${sensitive === 1 ? "" : "s"}` },
  ];
  let score = Math.min(100, factors.reduce((s, f) => s + f.points, 0));
  if (confirmed > 0) score = Math.max(score, 35);
  if (changes.length > 0 && changes.every((c) => c.verdict === "non_breaking")) score = Math.min(score, 25);
  const level = score <= 30 ? "low" : score <= 70 ? "medium" : "high";
  return { score, level: level as "low" | "medium" | "high", factors };
}
