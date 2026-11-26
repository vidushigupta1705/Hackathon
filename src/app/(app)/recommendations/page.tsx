import Link from "next/link";
import { Card, CardHeader, Empty, PageHeader, short } from "@/components/ui";
import { IconAlert, IconBranch, IconGraph, IconRepo } from "@/components/Icons";
import { architectureRecommendations } from "@/lib/analyzer/graph";
import { loadContext } from "@/lib/context";
import { getApprovedFixKeys } from "@/lib/store";

export const dynamic = "force-dynamic";

const ICONS: Record<string, typeof IconGraph> = {
  cycle: IconGraph,
  spof: IconAlert,
  hub: IconRepo,
  coupling: IconBranch,
  "thin-dependency": IconRepo,
};

export default async function Recommendations() {
  const [{ graph, prs }, approved] = await Promise.all([loadContext(), getApprovedFixKeys()]);
  const recs = architectureRecommendations(graph);
  const llm = !!process.env.OPENAI_API_KEY;

  const pending = prs
    .filter((p) => p.analysis && p.status === "open")
    .flatMap((p) => p.analysis!.fixes.filter((f) => f.role === "producer").map((f) => ({ p, f })))
    .slice(0, 8);

  return (
    <>
      <PageHeader
        eyebrow="advisory output"
        title="Recommendations"
        desc="Dependency-aware architecture advice and suggested patches. Everything here is a suggestion for a human to review — DevImpact never rewrites your code on its own."
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-line py-2.5">
        <span className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${llm ? "bg-signal" : "bg-faint"}`} />
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{llm ? "llm prose enabled" : "rule-based prose"}</span>
        </span>
        <span className="text-[11.5px] leading-relaxed text-faint">
          {llm
            ? "Impact explanations are written by your configured model, grounded in analysis facts. Detection stays deterministic."
            : "Set OPENAI_API_KEY (optionally OPENAI_MODEL / OPENAI_BASE_URL) to upgrade explanations to model-written prose. Detection itself is always deterministic."}
        </span>
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-serif text-[22px] text-fg">Structural findings</h2>
        <span className="eyebrow">{recs.length} open</span>
      </div>

      {recs.length === 0 ? (
        <Empty title="No structural issues found" eyebrow="clean graph">
          The dependency graph has no cycles, hubs or single points of failure.
        </Empty>
      ) : (
        <div className="border-y border-line">
          {recs.map((r) => {
            const Icon = ICONS[r.type] ?? IconRepo;
            return (
              <div key={r.id} className="grid gap-3 border-b border-line px-4 py-4 last:border-b-0 md:grid-cols-[auto_1fr] md:gap-5 md:px-5">
                <div className="flex items-start gap-3 md:w-[190px]">
                  <Icon size={16} className={r.severity === "high" ? "mt-0.5 text-danger" : r.severity === "medium" ? "mt-0.5 text-warn" : "mt-0.5 text-faint"} />
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{r.type}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{r.severity} severity</div>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-fg">{r.title}</div>
                  <p className="mt-1.5 max-w-3xl text-[11.5px] leading-relaxed text-muted">{r.description}</p>
                  <div className="mt-2.5 border-l border-signal/30 pl-3">
                    <div className="eyebrow mb-1 text-signal/60">suggestion</div>
                    <p className="text-[11.5px] leading-relaxed text-muted">{r.suggestion}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Card className="mt-6 overflow-hidden">
        <CardHeader
          eyebrow="patches · reviewed by a human"
          title="Suggested fixes awaiting review"
          subtitle="Compatible-signature patches proposed for open pull requests. Open the PR to approve or dismiss each one."
        />
        <div>
          {pending.length === 0 && <div className="px-4 py-8 text-[12.5px] text-muted md:px-5">No fixes suggested — open pull requests are compatible.</div>}
          {pending.map(({ p, f }) => (
            <Link key={f.id} href={`/pull-requests/${p.id}`} className="group flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-white/[0.025] md:px-5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${approved.has(`${p.id}|${f.id}`) ? "bg-ok" : "bg-faint"}`} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-fg group-hover:text-signal">{f.title}</div>
                <div className="truncate font-mono text-[10px] text-faint">
                  #{p.number} · {short(f.repoName)}/{f.file}
                </div>
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{approved.has(`${p.id}|${f.id}`) ? "approved" : "pending"}</span>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
