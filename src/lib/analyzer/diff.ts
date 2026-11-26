import type { Change, ChangeKind, ParamInfo, ParsedFile, SymbolInfo } from "./types";
import { pathsMatch } from "./graph";

const norm = (s: string) => s.replace(/\s+/g, "");

export function unionMembers(t: string): Set<string> {
  let s = t.replace(/\s+/g, "");
  const m = s.match(/^Promise<(.*)>$/);
  if (m) s = m[1];
  return new Set(s.split("|").filter(Boolean));
}

function isSubset(a: Set<string>, b: Set<string>) {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

const PRIMS = new Set(["string", "number", "boolean", "void", "undefined", "null", "bigint"]);
export function typeCategory(t: string): string {
  const members = [...unionMembers(t)].filter((x) => x !== "null" && x !== "undefined");
  if (members.length === 0) return "void";
  if (members.length === 1) {
    const x = members[0];
    if (PRIMS.has(x)) return x;
    if (x.endsWith("[]") || x.startsWith("Array<")) return "array";
    return "object";
  }
  return "mixed";
}

function majorOf(v: string): number | null {
  const m = v.match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

let counter = 0;
const cid = (kind: string, symbol: string) => `${kind}:${symbol}:${++counter}`;

interface Ctx {
  repoId: number;
  out: Change[];
}

function push(ctx: Ctx, c: Omit<Change, "id" | "repoId">) {
  ctx.out.push({ ...c, id: cid(c.kind, c.symbol), repoId: ctx.repoId });
}

function collect(files: ParsedFile[]) {
  const map = new Map<string, SymbolInfo>();
  for (const f of files) {
    if (f.isTest) continue;
    for (const s of f.symbols) map.set(s.kind === "route" ? `route|${s.name}` : `sym|${s.name}`, s);
  }
  return map;
}

function sigEq(a: SymbolInfo, b: SymbolInfo) {
  return (
    a.params.length === b.params.length &&
    a.params.every((p, i) => norm(p.type) === norm(b.params[i].type)) &&
    norm(a.returnType) === norm(b.returnType)
  );
}

function reqCount(params: ParamInfo[]) {
  return params.filter((p) => !p.optional && !p.hasDefault && !p.rest).length;
}

function diffFunction(ctx: Ctx, o: SymbolInfo, n: SymbolInfo) {
  const base = { file: n.file, symbol: o.name, symbolKind: o.kind, line: n.line, oldSym: o, newSym: n } as const;
  let sigChanged = false;
  const common = Math.min(o.params.length, n.params.length);

  for (let i = 0; i < common; i++) {
    const op = o.params[i];
    const np = n.params[i];
    if (op.type && np.type && norm(op.type) !== norm(np.type)) {
      sigChanged = true;
      const widening = isSubset(unionMembers(op.type), unionMembers(np.type));
      push(ctx, {
        ...base,
        kind: "param_type_changed",
        inherent: widening ? "safe" : "risky",
        summary: `Parameter \`${np.name}\` of \`${o.name}\` changed from \`${op.type}\` to \`${np.type}\`${widening ? " (widening, backward compatible)" : ""}`,
        detail: { paramIndex: i, paramName: np.name, oldType: op.type, newType: np.type, widening },
      });
    } else if (op.name !== np.name) {
      sigChanged = true;
      push(ctx, {
        ...base,
        kind: "param_renamed",
        inherent: "safe",
        summary: `Parameter \`${op.name}\` of \`${o.name}\` renamed to \`${np.name}\``,
        detail: { paramIndex: i, oldName: op.name, paramName: np.name },
      });
    }
    if ((op.optional || op.hasDefault) && !np.optional && !np.hasDefault) {
      sigChanged = true;
      push(ctx, {
        ...base,
        kind: "param_made_required",
        inherent: "breaking",
        summary: `Parameter \`${np.name}\` of \`${o.name}\` is now required`,
        detail: { paramIndex: i, paramName: np.name },
      });
    }
  }
  for (let i = common; i < n.params.length; i++) {
    sigChanged = true;
    const p = n.params[i];
    const required = !p.optional && !p.hasDefault && !p.rest;
    push(ctx, {
      ...base,
      kind: required ? "param_added_required" : "param_added_optional",
      inherent: required ? "breaking" : "safe",
      summary: required
        ? `New required parameter \`${p.name}: ${p.type || "any"}\` added to \`${o.name}\``
        : `New optional parameter \`${p.name}\` added to \`${o.name}\``,
      detail: { paramIndex: i, paramName: p.name, newType: p.type, requiredCount: reqCount(n.params) },
    });
  }
  for (let i = common; i < o.params.length; i++) {
    sigChanged = true;
    const p = o.params[i];
    push(ctx, {
      ...base,
      kind: "param_removed",
      inherent: "breaking",
      summary: `Parameter \`${p.name}\` was removed from \`${o.name}\``,
      detail: { paramIndex: i, paramName: p.name, oldType: p.type, newParamCount: n.params.length },
    });
  }

  if (o.kind !== "class" && o.returnType && n.returnType && norm(o.returnType) !== norm(n.returnType)) {
    sigChanged = true;
    const narrowing = isSubset(unionMembers(n.returnType), unionMembers(o.returnType));
    const catChange = typeCategory(o.returnType) !== typeCategory(n.returnType);
    push(ctx, {
      ...base,
      kind: "return_type_changed",
      inherent: narrowing ? "safe" : "risky",
      summary: `Return type of \`${o.name}\` changed from \`${o.returnType}\` to \`${n.returnType}\``,
      detail: { oldType: o.returnType, newType: n.returnType, narrowing, categoryChange: catChange },
    });
  }

  if (!sigChanged && o.bodyHash && n.bodyHash && o.bodyHash !== n.bodyHash) {
    push(ctx, {
      ...base,
      kind: "function_modified",
      inherent: "safe",
      summary: `Implementation of \`${o.name}\` changed (signature unchanged)`,
      detail: {},
    });
  }
}

function diffFields(ctx: Ctx, o: SymbolInfo, n: SymbolInfo) {
  const base = { file: n.file, symbol: o.name, symbolKind: o.kind, line: n.line, oldSym: o, newSym: n } as const;
  const of = new Map((o.fields ?? []).map((f) => [f.name, f]));
  const nf = new Map((n.fields ?? []).map((f) => [f.name, f]));
  for (const [name, f] of of) {
    const g = nf.get(name);
    if (!g) {
      push(ctx, { ...base, kind: "type_field_removed", inherent: "breaking", summary: `Field \`${name}\` removed from \`${o.name}\``, detail: { field: name, oldType: f.type } });
    } else if (norm(f.type) !== norm(g.type)) {
      push(ctx, {
        ...base,
        kind: "type_field_changed",
        inherent: isSubset(unionMembers(f.type), unionMembers(g.type)) && o.kind !== "enum" ? "risky" : "risky",
        summary: `Field \`${o.name}.${name}\` changed from \`${f.type}\` to \`${g.type}\``,
        detail: { field: name, oldType: f.type, newType: g.type, categoryChange: typeCategory(f.type) !== typeCategory(g.type) },
      });
    } else if (f.optional && !g.optional) {
      push(ctx, { ...base, kind: "type_field_changed", inherent: "risky", summary: `Field \`${o.name}.${name}\` is now required`, detail: { field: name, oldType: f.type, newType: g.type, nowRequired: true } });
    }
  }
  for (const [name, g] of nf) {
    if (of.has(name)) continue;
    push(ctx, {
      ...base,
      kind: "type_field_added",
      inherent: g.optional ? "safe" : "risky",
      summary: g.optional ? `Optional field \`${name}\` added to \`${o.name}\`` : `Required field \`${name}: ${g.type}\` added to \`${o.name}\` — producers must now supply it`,
      detail: { field: name, newType: g.type, optional: g.optional },
    });
  }
}

function segs(p: string) {
  return p.split("/").filter(Boolean);
}
function pathSimilarity(a: string, b: string) {
  const x = segs(a);
  const y = segs(b);
  let same = 0;
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] === y[i] || x[i].startsWith(":") || y[i].startsWith(":")) same++;
  return same / Math.max(x.length, y.length);
}

export function diffDependencies(ctx: Ctx, base: ParsedFile[], head: ParsedFile[]) {
  const pk = (files: ParsedFile[]) => {
    const m = new Map<string, { v: string; dev: boolean; file: string }>();
    for (const f of files) {
      if (!f.pkg) continue;
      for (const [k, v] of Object.entries(f.pkg.dependencies)) m.set(k, { v, dev: false, file: f.path });
      for (const [k, v] of Object.entries(f.pkg.devDependencies)) if (!m.has(k)) m.set(k, { v, dev: true, file: f.path });
    }
    return m;
  };
  const b = pk(base);
  const h = pk(head);
  const importedInHead = (dep: string) => head.find((f) => !f.isTest && f.imports.some((i) => i.module === dep || i.module.startsWith(dep + "/")));
  for (const [dep, o] of b) {
    const n = h.get(dep);
    if (!n) {
      const user = importedInHead(dep);
      push(ctx, {
        kind: "dep_removed",
        file: o.file,
        symbol: dep,
        symbolKind: "dependency",
        line: 1,
        inherent: user ? "breaking" : "safe",
        summary: `Dependency \`${dep}\` (${o.v}) removed${user ? ` but still imported by ${user.path}` : ""}`,
        detail: { dependency: dep, oldVersion: o.v, importedBy: user?.path },
      });
    } else if (n.v !== o.v) {
      const mo = majorOf(o.v);
      const mn = majorOf(n.v);
      const major = mo !== null && mn !== null && mo !== mn;
      push(ctx, {
        kind: "dep_version_changed",
        file: n.file,
        symbol: dep,
        symbolKind: "dependency",
        line: 1,
        inherent: major && !n.dev ? "risky" : "safe",
        summary: `Dependency \`${dep}\` ${o.v} → ${n.v}${major ? " (major version change)" : ""}`,
        detail: { dependency: dep, oldVersion: o.v, newVersion: n.v, major, dev: n.dev },
      });
    }
  }
  for (const [dep, n] of h) {
    if (!b.has(dep)) {
      push(ctx, { kind: "dep_added", file: n.file, symbol: dep, symbolKind: "dependency", line: 1, inherent: "safe", summary: `Dependency \`${dep}@${n.v}\` added`, detail: { dependency: dep, newVersion: n.v } });
    }
  }
}

export function diffRepo(repoId: number, baseFiles: ParsedFile[], headFiles: ParsedFile[]): Change[] {
  counter = 0;
  const ctx: Ctx = { repoId, out: [] };
  const bs = collect(baseFiles);
  const hs = collect(headFiles);

  const removed: SymbolInfo[] = [];
  const added: SymbolInfo[] = [];
  for (const [k, s] of bs) if (!hs.has(k)) removed.push(s);
  for (const [k, s] of hs) if (!bs.has(k)) added.push(s);

  const usedAdded = new Set<SymbolInfo>();
  const reported = new Set<SymbolInfo>();

  // renames (functions, classes, methods)
  for (const r of removed) {
    if (!["function", "class", "method"].includes(r.kind)) continue;
    const cands = added.filter((a) => a.kind === r.kind && !usedAdded.has(a) && (sigEq(a, r) || (!!a.bodyHash && a.bodyHash === r.bodyHash && a.params.length === r.params.length)));
    const best = cands.find((a) => a.bodyHash && a.bodyHash === r.bodyHash) ?? (cands.length === 1 ? cands[0] : undefined);
    if (best) {
      usedAdded.add(best);
      reported.add(r);
      push(ctx, {
        kind: "function_renamed",
        file: r.file,
        symbol: r.name,
        symbolKind: r.kind,
        line: best.line,
        inherent: r.exported ? "breaking" : "safe",
        summary: `\`${r.name}\` renamed to \`${best.name}\``,
        detail: { renamedTo: best.name, exported: r.exported },
        oldSym: r,
        newSym: best,
      });
    }
  }

  // route moves (path/method changes)
  const removedRoutes = removed.filter((r) => r.kind === "route");
  const addedRoutes = added.filter((a) => a.kind === "route");
  for (const r of removedRoutes) {
    const cands = addedRoutes
      .filter((a) => !usedAdded.has(a))
      .map((a) => ({
        a,
        score:
          (a.handler && a.handler === r.handler ? 2 : 0) +
          (a.bodyHash && a.bodyHash === r.bodyHash ? 2 : 0) +
          (a.route!.method === r.route!.method ? pathSimilarity(a.route!.path, r.route!.path) : 0) +
          (a.route!.path === r.route!.path ? 1 : 0),
      }))
      .filter((x) => x.score >= 1.4)
      .sort((x, y) => y.score - x.score);
    if (cands[0]) {
      const a = cands[0].a;
      usedAdded.add(a);
      reported.add(r);
      push(ctx, {
        kind: "route_changed",
        file: a.file,
        symbol: r.name,
        symbolKind: "route",
        line: a.line,
        inherent: "breaking",
        summary: `Endpoint \`${r.name}\` is now \`${a.name}\``,
        detail: { oldMethod: r.route!.method, oldPath: r.route!.path, newMethod: a.route!.method, newPath: a.route!.path },
        oldSym: r,
        newSym: a,
      });
    }
  }

  for (const r of removed) {
    if (reported.has(r)) continue;
    if (r.kind === "route") {
      push(ctx, { kind: "route_removed", file: r.file, symbol: r.name, symbolKind: "route", line: r.line, inherent: "breaking", summary: `Endpoint \`${r.name}\` was removed`, detail: { oldMethod: r.route!.method, oldPath: r.route!.path }, oldSym: r });
    } else if (["interface", "type", "enum"].includes(r.kind)) {
      push(ctx, { kind: "type_removed", file: r.file, symbol: r.name, symbolKind: r.kind, line: r.line, inherent: r.exported ? "breaking" : "safe", summary: `Type \`${r.name}\` was removed`, detail: { exported: r.exported }, oldSym: r });
    } else {
      push(ctx, { kind: "function_removed", file: r.file, symbol: r.name, symbolKind: r.kind, line: r.line, inherent: r.exported ? "breaking" : "safe", summary: `${r.kind === "class" ? "Class" : "Function"} \`${r.name}\` was removed`, detail: { exported: r.exported }, oldSym: r });
    }
  }
  for (const a of added) {
    if (usedAdded.has(a)) continue;
    if (a.kind === "route") push(ctx, { kind: "route_added", file: a.file, symbol: a.name, symbolKind: "route", line: a.line, inherent: "safe", summary: `New endpoint \`${a.name}\``, detail: {}, newSym: a });
    else if (a.exported) push(ctx, { kind: "function_added", file: a.file, symbol: a.name, symbolKind: a.kind, line: a.line, inherent: "safe", summary: `New ${a.kind} \`${a.name}\``, detail: {}, newSym: a });
  }

  for (const [k, o] of bs) {
    const n = hs.get(k);
    if (!n) continue;
    if (o.kind !== n.kind) continue;
    if (o.exported && !n.exported && o.kind !== "route") {
      push(ctx, { kind: "export_removed", file: n.file, symbol: o.name, symbolKind: o.kind, line: n.line, inherent: "breaking", summary: `\`${o.name}\` is no longer exported`, detail: {}, oldSym: o, newSym: n });
      continue;
    }
    if (["function", "method", "class"].includes(o.kind)) diffFunction(ctx, o, n);
    else if (o.kind === "route") {
      if (o.bodyHash && n.bodyHash && o.bodyHash !== n.bodyHash) {
        push(ctx, { kind: "function_modified", file: n.file, symbol: o.name, symbolKind: "route", line: n.line, inherent: "safe", summary: `Handler of \`${o.name}\` changed (route unchanged)`, detail: {}, oldSym: o, newSym: n });
      }
    } else diffFields(ctx, o, n);
  }

  diffDependencies(ctx, baseFiles, headFiles);
  return ctx.out;
}

export const KIND_LABEL: Record<ChangeKind, string> = {
  function_added: "Added",
  function_removed: "Removed",
  function_renamed: "Renamed",
  function_modified: "Modified",
  type_removed: "Type removed",
  export_removed: "Export removed",
  param_added_required: "Required param added",
  param_added_optional: "Optional param added",
  param_removed: "Param removed",
  param_type_changed: "Param type changed",
  param_renamed: "Param renamed",
  param_made_required: "Param now required",
  return_type_changed: "Return type changed",
  route_added: "Endpoint added",
  route_removed: "Endpoint removed",
  route_changed: "Endpoint changed",
  type_field_removed: "Field removed",
  type_field_added: "Field added",
  type_field_changed: "Field changed",
  dep_added: "Dependency added",
  dep_removed: "Dependency removed",
  dep_version_changed: "Dependency version",
};

export { pathsMatch };
