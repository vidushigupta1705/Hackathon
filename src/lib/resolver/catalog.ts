import type { ProjectGraph } from "../analyzer/graph";

export type EntityKind =
  | "function"
  | "class"
  | "method"
  | "interface"
  | "type"
  | "enum"
  | "route"
  | "dependency";

export interface EntityRef {
  /** Stable across graph rebuilds: kind|repo|file|symbol. */
  id: string;
  kind: EntityKind;
  repoId: number;
  repoName: string;
  file: string;
  symbol: string;
  label: string;
  detail: string;
  /** Surface forms that should resolve to this entity (qualified names, short names…). */
  variants: string[];
}

const uniq = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];

export function entityId(kind: EntityKind, repoId: number, file: string, symbol: string) {
  return `${kind}|${repoId}|${file}|${symbol}`;
}

/**
 * Every routable target in the connected project. Dependencies are included because
 * `upgrade_dep` is a valid simulator action; tests are excluded because the analyzer
 * never routes a production change into one.
 */
export function buildCatalog(graph: ProjectGraph): EntityRef[] {
  const out: EntityRef[] = [];
  const seen = new Set<string>();

  for (const repo of graph.repos) {
    const shortRepo = repo.fullName.split("/").pop() ?? repo.fullName;

    for (const file of repo.files) {
      if (file.isTest) continue;
      for (const s of file.symbols) {
        const id = entityId(s.kind, repo.id, s.file, s.name);
        if (seen.has(id)) continue;
        seen.add(id);
        const short = s.name.includes(" ") ? s.name : (s.name.split(".").pop() ?? s.name);
        const variants = uniq([
          s.name,
          short,
          `${s.file}#${s.name}`,
          `${shortRepo}/${s.name}`,
          ...(s.route ? [s.route.path, `${s.route.method} ${s.route.path}`] : []),
        ]);
        out.push({
          id,
          kind: s.kind,
          repoId: repo.id,
          repoName: repo.fullName,
          file: s.file,
          symbol: s.name,
          label: `${s.name}  ·  ${s.kind}`,
          detail: `${repo.fullName} · ${s.file}:${s.line}`,
          variants,
        });
      }
    }

    const deps = new Map<string, string>();
    for (const file of repo.files) {
      for (const [name, version] of Object.entries(file.pkg?.dependencies ?? {})) {
        if (!deps.has(name)) deps.set(name, version);
      }
    }
    for (const [name, version] of deps) {
      const id = entityId("dependency", repo.id, "package.json", name);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        kind: "dependency",
        repoId: repo.id,
        repoName: repo.fullName,
        file: "package.json",
        symbol: name,
        label: `${name}  ·  dependency`,
        detail: `${repo.fullName} · ${version}`,
        variants: uniq([name, `${shortRepo}/${name}`]),
      });
    }
  }

  return out;
}
