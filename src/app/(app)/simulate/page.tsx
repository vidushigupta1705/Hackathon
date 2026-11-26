import SimulatorClient, { type SimRepo } from "@/components/SimulatorClient";
import { Empty, PageHeader } from "@/components/ui";
import { loadContext } from "@/lib/context";
import { buildCatalog } from "@/lib/resolver/catalog";

export const dynamic = "force-dynamic";

export default async function Simulate() {
  const { graph } = await loadContext();
  const repos: SimRepo[] = graph.repos.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    symbols: r.files
      .filter((f) => !f.isTest)
      .flatMap((f) => f.symbols)
      .filter((s) => s.exported)
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        params: s.params.map((p) => ({ name: p.name, type: p.type })),
        returnType: s.returnType,
        fields: (s.fields ?? []).map((f) => f.name),
      })),
    deps: [...new Set(r.files.flatMap((f) => Object.keys(f.pkg?.dependencies ?? {})))],
  }));
  const entities = buildCatalog(graph).map((e) => ({
    id: e.id,
    kind: e.kind,
    repoId: e.repoId,
    repoName: e.repoName,
    file: e.file,
    symbol: e.symbol,
    label: e.label,
    detail: e.detail,
  }));

  return (
    <>
      <PageHeader
        eyebrow="hypothetical changes"
        title="What-if simulator"
        desc="Ask what happens if you remove an API before writing a line of code. The simulator applies the change in memory and runs the full impact pipeline — verdicts, blast radius, risk score and mitigations."
      />
      {repos.length === 0 ? (
        <Empty title="Connect repositories first" eyebrow="0 repositories">
          The simulator needs a parsed project to work against.
        </Empty>
      ) : (
        <SimulatorClient repos={repos} entities={entities} />
      )}
    </>
  );
}
