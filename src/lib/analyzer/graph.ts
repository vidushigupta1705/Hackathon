import type { CallInfo, HttpCallInfo, ParsedFile, RepoInput, SymbolInfo } from "./types";

export interface Edge {
  kind: "import" | "call" | "http";
  fromRepo: number;
  fromFile: string;
  fromSymbol: string;
  toRepo: number;
  toFile: string;
  toSymbol: string;
  line: number;
  text: string;
  call?: CallInfo;
  http?: HttpCallInfo;
}

export interface ProjectGraph {
  repos: RepoInput[];
  repoById: Map<number, RepoInput>;
  edges: Edge[];
  byTarget: Map<string, Edge[]>;
  bySource: Map<string, Edge[]>;
  fileMap: Map<string, ParsedFile>;
  symbolMap: Map<string, SymbolInfo>; // nodeKey -> symbol
}

export const nodeKey = (repoId: number, file: string, symbol: string) => `${repoId}|${file}|${symbol}`;

function dirname(p: string) {
  const i = p.lastIndexOf("/");
  return i < 0 ? "" : p.slice(0, i);
}

function joinPath(base: string, rel: string) {
  const parts = (base ? base.split("/") : []).concat(rel.split("/"));
  const out: string[] = [];
  for (const s of parts) {
    if (s === "." || s === "") continue;
    if (s === "..") out.pop();
    else out.push(s);
  }
  return out.join("/");
}

export function pathsMatch(callPath: string, routePath: string) {
  const a = callPath.split("/").filter(Boolean);
  const b = routePath.split("/").filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg === b[i] || seg.startsWith(":") || b[i].startsWith(":"));
}

type Binding = { repo: RepoInput; file?: string; name: string; ns?: boolean };

export function buildGraph(repos: RepoInput[]): ProjectGraph {
  const repoById = new Map(repos.map((r) => [r.id, r]));
  const fileMap = new Map<string, ParsedFile>();
  const symbolMap = new Map<string, SymbolInfo>();
  const symsByRepo = new Map<number, SymbolInfo[]>();
  const pkgToRepo = new Map<string, RepoInput>();

  for (const r of repos) {
    const list: SymbolInfo[] = [];
    for (const f of r.files) {
      fileMap.set(`${r.id}|${f.path}`, f);
      if (f.isTest) continue;
      for (const s of f.symbols) {
        list.push(s);
        symbolMap.set(nodeKey(r.id, s.file, s.name), s);
      }
    }
    symsByRepo.set(r.id, list);
    const pkgs = new Set<string>();
    if (r.packageName) pkgs.add(r.packageName);
    for (const f of r.files) if (f.pkg?.name) pkgs.add(f.pkg.name);
    for (const p of pkgs) pkgToRepo.set(p, r);
  }

  const findSymbol = (repo: RepoInput, name: string, file?: string): SymbolInfo | undefined => {
    const list = symsByRepo.get(repo.id) ?? [];
    return (
      (file ? list.find((s) => s.file === file && s.name === name) : undefined) ??
      list.find((s) => s.name === name && s.exported && s.kind !== "route") ??
      list.find((s) => s.name === name && s.kind !== "route")
    );
  };

  const resolveModule = (repo: RepoInput, fromFile: string, mod: string): { repo: RepoInput; file?: string } | null => {
    if (mod.startsWith(".") || mod.startsWith("@/") || mod.startsWith("~/")) {
      const base = mod.startsWith(".") ? joinPath(dirname(fromFile), mod) : joinPath("src", mod.slice(2));
      const cands = [base, ...["ts", "tsx", "js", "jsx", "mjs"].map((e) => `${base}.${e}`), ...["ts", "tsx", "js", "jsx"].map((e) => `${base}/index.${e}`)];
      const hit = cands.find((c) => fileMap.has(`${repo.id}|${c}`));
      return hit ? { repo, file: hit } : { repo };
    }
    for (const [pkg, target] of pkgToRepo) {
      if (target.id === repo.id) continue;
      if (mod === pkg || mod.startsWith(pkg + "/")) return { repo: target };
    }
    return null;
  };

  const edges: Edge[] = [];

  for (const repo of repos) {
    for (const file of repo.files) {
      if (file.isTest || !file.symbols) continue;
      const bindings = new Map<string, Binding>();

      for (const imp of file.imports) {
        const target = resolveModule(repo, file.path, imp.module);
        if (!target) continue;
        const addImportEdge = (name: string) => {
          const sym = findSymbol(target.repo, name, target.file);
          if (sym) {
            edges.push({
              kind: "import",
              fromRepo: repo.id,
              fromFile: file.path,
              fromSymbol: "<module>",
              toRepo: target.repo.id,
              toFile: sym.file,
              toSymbol: sym.name,
              line: imp.line,
              text: imp.text,
            });
          }
        };
        for (const n of imp.named) {
          bindings.set(n.alias, { repo: target.repo, file: target.file, name: n.name });
          addImportEdge(n.name);
        }
        if (imp.default) bindings.set(imp.default, { repo: target.repo, file: target.file, name: "default" });
        if (imp.namespace) bindings.set(imp.namespace, { repo: target.repo, file: target.file, name: "*", ns: true });
      }

      const resolveName = (name: string, objectType?: string): { repo: RepoInput; sym: SymbolInfo } | null => {
        const sameFile = (n: string) => {
          const s = (symsByRepo.get(repo.id) ?? []).find((x) => x.file === file.path && x.name === n);
          return s ? { repo, sym: s } : null;
        };
        if (objectType) {
          const b = bindings.get(objectType);
          if (b) {
            const s = findSymbol(b.repo, `${b.name}.${name}`, b.file);
            if (s) return { repo: b.repo, sym: s };
          }
          return sameFile(`${objectType}.${name}`);
        }
        const b = bindings.get(name);
        if (b) {
          const s = findSymbol(b.repo, b.name, b.file);
          return s ? { repo: b.repo, sym: s } : null;
        }
        return sameFile(name);
      };

      for (const c of file.calls) {
        let hit: { repo: RepoInput; sym: SymbolInfo } | null = null;
        if (c.object === "this" && c.enclosing.includes(".")) {
          const cls = c.enclosing.split(".")[0];
          const s = (symsByRepo.get(repo.id) ?? []).find((x) => x.file === file.path && x.name === `${cls}.${c.name}`);
          if (s) hit = { repo, sym: s };
        } else if (c.object) {
          const b = bindings.get(c.object);
          if (b?.ns) {
            const s = findSymbol(b.repo, c.name, b.file);
            if (s) hit = { repo: b.repo, sym: s };
          } else if (c.objectType) hit = resolveName(c.name, c.objectType);
        } else hit = resolveName(c.name);
        if (!hit) continue;
        edges.push({
          kind: "call",
          fromRepo: repo.id,
          fromFile: file.path,
          fromSymbol: c.enclosing,
          toRepo: hit.repo.id,
          toFile: hit.sym.file,
          toSymbol: hit.sym.name,
          line: c.line,
          text: c.text,
          call: c,
        });
      }

      for (const s of file.symbols) {
        if (s.kind === "route" && s.handler) {
          const hit = resolveName(s.handler);
          if (hit) {
            edges.push({
              kind: "call",
              fromRepo: repo.id,
              fromFile: file.path,
              fromSymbol: s.name,
              toRepo: hit.repo.id,
              toFile: hit.sym.file,
              toSymbol: hit.sym.name,
              line: s.line,
              text: s.signature,
            });
          }
        }
      }

      for (const h of file.httpCalls) {
        let found: { repo: RepoInput; sym: SymbolInfo } | null = null;
        for (const other of repos) {
          if (other.id === repo.id) continue;
          const s = (symsByRepo.get(other.id) ?? []).find(
            (x) => x.kind === "route" && x.route && x.route.method === h.method && pathsMatch(h.path, x.route.path),
          );
          if (s) {
            found = { repo: other, sym: s };
            break;
          }
        }
        if (!found) continue;
        edges.push({
          kind: "http",
          fromRepo: repo.id,
          fromFile: file.path,
          fromSymbol: h.enclosing,
          toRepo: found.repo.id,
          toFile: found.sym.file,
          toSymbol: found.sym.name,
          line: h.line,
          text: h.text,
          http: h,
        });
      }
    }
  }

  const byTarget = new Map<string, Edge[]>();
  const bySource = new Map<string, Edge[]>();
  for (const e of edges) {
    const tk = nodeKey(e.toRepo, e.toFile, e.toSymbol);
    const sk = nodeKey(e.fromRepo, e.fromFile, e.fromSymbol);
    (byTarget.get(tk) ?? byTarget.set(tk, []).get(tk)!).push(e);
    (bySource.get(sk) ?? bySource.set(sk, []).get(sk)!).push(e);
  }

  return { repos, repoById, edges, byTarget, bySource, fileMap, symbolMap };
}

// ---------------------------------------------------------------- repo level

export interface RepoEdge {
  from: number;
  to: number;
  count: number;
  kinds: string[];
  targets: string[];
}

export function repoEdges(g: ProjectGraph): RepoEdge[] {
  const m = new Map<string, RepoEdge & { ks: Set<string>; ts: Set<string> }>();
  for (const e of g.edges) {
    if (e.fromRepo === e.toRepo) continue;
    const k = `${e.fromRepo}>${e.toRepo}`;
    const cur = m.get(k) ?? { from: e.fromRepo, to: e.toRepo, count: 0, kinds: [], targets: [], ks: new Set(), ts: new Set() };
    cur.count++;
    cur.ks.add(e.kind);
    cur.ts.add(e.toSymbol);
    m.set(k, cur);
  }
  // package.json dependencies between connected repos (declared, even if unused in code)
  return [...m.values()].map((v) => ({ from: v.from, to: v.to, count: v.count, kinds: [...v.ks], targets: [...v.ts] }));
}

export function dependentsOf(g: ProjectGraph, repoId: number): number[] {
  return [...new Set(repoEdges(g).filter((e) => e.to === repoId).map((e) => e.from))];
}

export function dependenciesOf(g: ProjectGraph, repoId: number): number[] {
  return [...new Set(repoEdges(g).filter((e) => e.from === repoId).map((e) => e.to))];
}

/** Tarjan SCC over repo graph, returns components with >1 repo */
function sccs(nodes: string[], adj: Map<string, string[]>): string[][] {
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  const out: string[][] = [];
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index);
    index++;
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      const comp: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        comp.push(w);
      } while (w !== v);
      if (comp.length > 1) out.push(comp);
    }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  return out;
}

// ---------------------------------------------------------------- architecture

export interface Recommendation {
  id: string;
  type: "cycle" | "hub" | "spof" | "coupling" | "thin-dependency";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  repos: string[];
  suggestion: string;
}

export function architectureRecommendations(g: ProjectGraph): Recommendation[] {
  const recs: Recommendation[] = [];
  const name = (id: number) => g.repoById.get(id)?.fullName ?? String(id);
  const re = repoEdges(g);

  // circular dependencies between repos
  const adj = new Map<string, string[]>();
  for (const e of re) (adj.get(String(e.from)) ?? adj.set(String(e.from), []).get(String(e.from))!).push(String(e.to));
  for (const comp of sccs(g.repos.map((r) => String(r.id)), adj)) {
    const names = comp.map((c) => name(Number(c)));
    const involved = re.filter((e) => comp.includes(String(e.from)) && comp.includes(String(e.to)));
    recs.push({
      id: `cycle:${comp.sort().join("-")}`,
      type: "cycle",
      severity: "high",
      title: `Circular dependency: ${names.map((n) => n.split("/").pop()).join(" ⇄ ")}`,
      description: `${names.join(", ")} depend on each other (${involved.map((e) => `${name(e.from).split("/").pop()} → ${name(e.to).split("/").pop()} via ${e.targets.slice(0, 2).join(", ")}`).join("; ")}). A change in any of them can ripple back to itself and the services cannot be released or tested independently.`,
      repos: names,
      suggestion:
        "Break the cycle by inverting one direction: publish an event (e.g. OrderPaid) instead of a synchronous call, or extract the shared contract into a small neutral package that both services depend on.",
    });
  }

  // file-level cycles inside a repo
  for (const r of g.repos) {
    const fadj = new Map<string, string[]>();
    const files = new Set<string>();
    for (const e of g.edges) {
      if (e.kind !== "import" || e.fromRepo !== r.id || e.toRepo !== r.id || e.fromFile === e.toFile) continue;
      files.add(e.fromFile);
      files.add(e.toFile);
      (fadj.get(e.fromFile) ?? fadj.set(e.fromFile, []).get(e.fromFile)!).push(e.toFile);
    }
    for (const comp of sccs([...files], fadj)) {
      recs.push({
        id: `filecycle:${r.id}:${comp.sort().join(",")}`,
        type: "cycle",
        severity: "medium",
        title: `Import cycle inside ${r.name}`,
        description: `Files ${comp.join(", ")} import each other.`,
        repos: [r.fullName],
        suggestion: "Move shared types/helpers into a leaf module that neither file needs to import from the other.",
      });
    }
  }

  const others = Math.max(1, g.repos.length - 1);
  for (const r of g.repos) {
    const fanIn = new Set(re.filter((e) => e.to === r.id).map((e) => e.from)).size;
    // transitive dependents
    const closure = new Set<number>();
    const stack = [r.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const e of re) if (e.to === cur && e.from !== r.id && !closure.has(e.from)) { closure.add(e.from); stack.push(e.from); }
    }
    const fanOut = new Set(re.filter((e) => e.from === r.id).map((e) => e.to)).size;
    if (g.repos.length >= 3 && closure.size / others >= 0.75) {
      recs.push({
        id: `spof:${r.id}`,
        type: "spof",
        severity: closure.size === others ? "high" : "medium",
        title: `Single point of failure: ${r.name}`,
        description: `${closure.size} of ${others} other repositories depend on ${r.fullName} (${fanIn} directly, ${closure.size - fanIn} transitively). Any breaking change or outage here has a platform-wide blast radius.`,
        repos: [r.fullName],
        suggestion:
          "Version its public API explicitly (v1/v2 routes, deprecation windows), add consumer-driven contract tests, and cache or degrade gracefully in consumers.",
      });
    }
    if (fanIn + fanOut >= 4) {
      recs.push({
        id: `hub:${r.id}`,
        type: "hub",
        severity: "medium",
        title: `Highly interconnected: ${r.name}`,
        description: `${r.fullName} has ${fanIn} dependents and ${fanOut} dependencies, making it hard to change in isolation.`,
        repos: [r.fullName],
        suggestion: "Split responsibilities into smaller modules or introduce a façade so consumers depend on a narrow, stable interface.",
      });
    }
  }

  // chatty & thin couplings
  for (const e of re) {
    if (e.count >= 5) {
      recs.push({
        id: `coupling:${e.from}-${e.to}`,
        type: "coupling",
        severity: "medium",
        title: `Tight coupling: ${name(e.from).split("/").pop()} → ${name(e.to).split("/").pop()}`,
        description: `${e.count} separate call sites reach into ${name(e.to)} (${e.targets.slice(0, 4).join(", ")}…).`,
        repos: [name(e.from), name(e.to)],
        suggestion: "Wrap the dependency behind a single client/adapter module so only one file needs to change when the API moves.",
      });
    } else if (e.targets.length === 1 && e.kinds.includes("call") && !e.kinds.includes("http")) {
      recs.push({
        id: `thin:${e.from}-${e.to}`,
        type: "thin-dependency",
        severity: "low",
        title: `Unnecessary coupling: ${name(e.from).split("/").pop()} → ${name(e.to).split("/").pop()}`,
        description: `${name(e.from)} depends on ${name(e.to)} only for \`${e.targets[0]}\`. A whole package dependency for a single symbol increases the blast radius of unrelated changes.`,
        repos: [name(e.from), name(e.to)],
        suggestion: "Inline the helper, move it to a shared utility package, or call it through a stable API instead of a library import.",
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  return recs.sort((a, b) => order[a.severity] - order[b.severity]);
}
