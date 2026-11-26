import GraphView from "@/components/GraphView";
import { Empty, PageHeader } from "@/components/ui";
import { architectureRecommendations } from "@/lib/analyzer/graph";
import { loadContext } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const { graph, health } = await loadContext();
  const cycles = architectureRecommendations(graph).filter((r) => r.type === "cycle").length;
  const cross = graph.edges.filter((e) => e.fromRepo !== e.toRepo).length;

  return (
    <>
      <PageHeader
        eyebrow={`${graph.repos.length} repositories · ${graph.edges.length} relationships · ${cross} cross-repo · ${cycles} circular`}
        title="Dependency graph"
        desc="Every import, package dependency, function call and HTTP contract in one graph. Switch level, select a node, then read its dependency surface and its blast radius."
      />
      {graph.repos.length === 0 ? (
        <Empty title="Nothing to map yet" eyebrow="0 repositories">
          Connect repositories and DevImpact will parse them into a graph.
        </Empty>
      ) : (
        <GraphView
          repos={graph.repos.map((r) => ({ id: r.id, name: r.name, fullName: r.fullName, health: health.get(r.id)?.score }))}
          edges={graph.edges.map((e) => ({
            kind: e.kind,
            fromRepo: e.fromRepo,
            fromFile: e.fromFile,
            fromSymbol: e.fromSymbol,
            toRepo: e.toRepo,
            toFile: e.toFile,
            toSymbol: e.toSymbol,
            line: e.line,
            text: e.text,
          }))}
        />
      )}
    </>
  );
}
