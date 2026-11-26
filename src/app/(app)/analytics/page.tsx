import Link from "next/link";
import { Bar, Card, CardHeader, Empty, Ledger, PageHeader, ScoreRing, short } from "@/components/ui";
import { loadContext } from "@/lib/context";

export const dynamic = "force-dynamic";

const tone = (level: string) => (level === "high" ? "danger" : level === "medium" ? "warn" : "ok");

export default async function Analytics() {
  const { graph, prs, health } = await loadContext();
  if (graph.repos.length === 0)
    return (
      <>
        <PageHeader eyebrow="risk & health" title="Risk & health analytics" />
        <Empty title="No data yet" eyebrow="0 repositories">
          Connect repositories to see how risk concentrates across pull requests.
        </Empty>
      </>
    );

  const analysed = prs.filter((p) => p.analysis).sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const low = analysed.filter((p) => p.riskLevel === "low").length;
  const med = analysed.filter((p) => p.riskLevel === "medium").length;
  const high = analysed.filter((p) => p.riskLevel === "high").length;
  const avg = analysed.length ? Math.round(analysed.reduce((s, p) => s + p.riskScore, 0) / analysed.length) : 0;
  const uncovered = graph.repos.flatMap((r) => {
    const h = health.get(r.id)!;
    return h.coverage < 1 ? [{ repo: r.name, pct: Math.round(h.coverage * 100) }] : [];
  });

  return (
    <>
      <PageHeader
        eyebrow="signals across the project"
        title="Risk & health analytics"
        desc="Where risk concentrates across pull requests, and how each repository's dependency posture is trending."
      />

      <Ledger
        items={[
          { label: "Average PR risk", value: avg, tone: avg > 70 ? "danger" : avg > 30 ? "warn" : "ok", note: `${analysed.length} analysed PRs` },
          { label: "High", value: high, tone: high ? "danger" : "neutral", note: "score ≥ 71" },
          { label: "Medium", value: med, tone: med ? "warn" : "neutral", note: "31 – 70" },
          { label: "Low", value: low, tone: "ok", note: "≤ 30" },
          { label: "Uncovered repos", value: uncovered.length, note: "below full symbol coverage" },
        ]}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader eyebrow="oldest → newest" title="Risk score per pull request" />
          <div className="divide-y divide-line">
            {analysed.map((p) => (
              <Link key={p.id} href={`/pull-requests/${p.id}`} className="group block px-4 py-2.5 transition-colors hover:bg-white/[0.025] md:px-5">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="min-w-0 truncate text-[12px] text-muted group-hover:text-fg">
                    <span className="num mr-1.5 text-[10.5px] text-faint">#{p.number}</span>
                    {p.title}
                  </span>
                  <span className={`num shrink-0 text-[11.5px] ${p.riskLevel === "high" ? "text-danger" : p.riskLevel === "medium" ? "text-warn" : "text-ok"}`}>
                    {p.riskScore}
                  </span>
                </div>
                <div className="mt-2">
                  <Bar value={p.riskScore} max={100} tone={tone(p.riskLevel)} />
                </div>
              </Link>
            ))}
            <div className="flex justify-between px-4 py-2 font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint md:px-5">
              <span>low ≤ 30</span>
              <span>medium ≤ 70</span>
              <span>high · 100</span>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader eyebrow="risk model" title="Where the risk comes from" subtitle="Average contribution of each signal across analysed pull requests." />
          <div className="space-y-4 px-4 py-4 md:px-5">
            {(analysed[0]?.analysis?.risk.factors ?? []).map((f, i) => {
              const avgPts = analysed.reduce((s, p) => s + (p.analysis!.risk.factors[i]?.points ?? 0), 0) / Math.max(1, analysed.length);
              return (
                <div key={f.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[11.5px] text-fg">{f.label}</span>
                    <span className="num text-[10.5px] text-faint">
                      {avgPts.toFixed(1)} / {f.max}
                    </span>
                  </div>
                  <Bar value={avgPts} max={f.max} tone={avgPts / f.max > 0.6 ? "danger" : avgPts / f.max > 0.3 ? "warn" : "ok"} />
                </div>
              );
            })}
            {analysed.length === 0 && <p className="text-[12px] text-muted">No analysed pull requests yet.</p>}
          </div>
        </Card>
      </div>

      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="font-serif text-[22px] text-fg">Dependency health by repository</h2>
        <span className="eyebrow">{graph.repos.length} repos</span>
      </div>

      <Card className="overflow-hidden">
        <div className="divide-y divide-line">
          {graph.repos.map((r) => {
            const h = health.get(r.id)!;
            return (
              <div key={r.id} className="grid gap-4 px-4 py-4 md:grid-cols-[auto_1fr_1.3fr_auto] md:items-center md:px-5">
                <ScoreRing score={h.score} size={54} invert />
                <div className="min-w-0">
                  <Link href={`/repositories/${r.id}`} className="block truncate text-[12.5px] text-fg hover:text-signal">
                    {r.fullName}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-faint">
                    <span className={h.coverage >= 0.7 ? "text-ok" : h.coverage >= 0.4 ? "text-warn" : "text-danger"}>
                      {Math.round(h.coverage * 100)}% coverage
                    </span>
                    <span>grade {h.grade}</span>
                    {h.outdated.length > 0 && <span className="text-warn">{h.outdated.length} outdated</span>}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {h.factors.slice(0, 4).map((f) => (
                    <div key={f.label}>
                      <div className="mb-1 flex justify-between gap-2 font-mono text-[9.5px] text-faint">
                        <span className="truncate">{f.label}</span>
                        <span className="shrink-0">−{f.points}</span>
                      </div>
                      <Bar value={f.points} max={f.max} tone={f.points / f.max > 0.6 ? "danger" : f.points / f.max > 0.3 ? "warn" : "ok"} />
                    </div>
                  ))}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint md:text-right">
                  {h.factors.length} signals
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      {uncovered.length > 0 && (
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-faint">
          Coverage is estimated from exported functions and endpoints referenced by test files in {uncovered.map((u) => short(u.repo)).join(", ")}.
        </p>
      )}
    </>
  );
}
