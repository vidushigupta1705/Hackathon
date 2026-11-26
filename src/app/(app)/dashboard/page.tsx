import Link from "next/link";
import { ApiButton } from "@/components/Actions";
import BlastRadius from "@/components/BlastRadius";
import { Card, CardHeader, Empty, Ledger, PageHeader, ScoreRing, btn, relTime, short } from "@/components/ui";
import { architectureRecommendations } from "@/lib/analyzer/graph";
import { loadContext } from "@/lib/context";

export const dynamic = "force-dynamic";

const scoreTone = (level: string) => (level === "high" ? "text-danger" : level === "medium" ? "text-warn" : "text-ok");
const ruleTone = (level: string) => (level === "high" ? "bg-danger" : level === "medium" ? "bg-warn" : "bg-ok");

export default async function Overview() {
  const { graph, rows, prs, health } = await loadContext();

  if (rows.length === 0) {
    return (
      <>
        <PageHeader eyebrow="cross-repository impact" title="Overview" desc="Nothing is mapped yet." />
        <Empty
          eyebrow="0 repositories"
          title="Connect a project to start mapping its blast radius"
          actions={
            <>
              <ApiButton url="/api/demo" body={{ action: "load" }} label="Load demo project" busyLabel="Analysing demo…" />
              <Link href="/repositories" className={btn.secondary}>
                Connect GitHub
              </Link>
            </>
          }
        >
          DevImpact parses imports, package manifests and HTTP calls into one dependency graph, then traces what a pull
          request breaks across every repository that depends on it.
        </Empty>
      </>
    );
  }

  const analyzed = prs.filter((p) => p.analysis);
  const open = analyzed.filter((p) => p.status === "open");
  const confirmed = open.reduce((n, p) => n + p.analysis!.stats.confirmed, 0);
  const potential = open.reduce((n, p) => n + p.analysis!.stats.potential, 0);
  const cross = graph.edges.filter((e) => e.fromRepo !== e.toRepo).length;
  const ranked = [...analyzed].sort((a, b) => b.riskScore - a.riskScore);
  const top = ranked[0];
  const byRisk = [...open].sort((a, b) => b.riskScore - a.riskScore);
  const recs = architectureRecommendations(graph).slice(0, 3);

  return (
    <>
      <PageHeader
        eyebrow={`${rows.length} repositories · ${graph.edges.length} relationships · ${cross} cross-repo`}
        title="Overview"
        desc="What is at stake in the pull requests you are about to merge."
        actions={
          <>
            <Link href="/simulate" className={btn.secondary}>
              Simulate a change
            </Link>
            <Link href="/pull-requests" className={btn.primary}>
              Analyze pull requests
            </Link>
          </>
        }
      />

      {top && top.analysis && (
        <Card className="overflow-hidden">
          <div className="grid border-b border-line lg:grid-cols-[1fr_290px]">
            <div className="min-w-0 p-5 md:p-6">
              <div className="flex items-center gap-3">
                <span className="eyebrow flex items-center gap-2 text-danger">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                  highest risk{top.status === "open" ? " · open" : ""}
                </span>
                <span className="h-px flex-1 bg-line" />
                {top.analysis.engine === "llm" && <span className="eyebrow">llm prose</span>}
              </div>
              <h2 className="mt-4 max-w-3xl font-serif text-[25px] leading-[1.12] tracking-[-0.01em] text-fg md:text-[31px]">
                <Link href={`/pull-requests/${top.id}`} className="transition-colors hover:text-signal">
                  <span className="num mr-2 text-[0.68em] text-faint">#{top.number}</span>
                  {top.title}
                </Link>
              </h2>
              <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed text-muted">{top.analysis.summary}</p>
              <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[11px] text-faint">
                <span className="text-muted">{short(top.repoName)}</span>
                <span className="text-line-strong">/</span>
                <span>
                  {top.headBranch} → {top.baseBranch}
                </span>
                <span className="text-line-strong">/</span>
                <span>@{top.author}</span>
                <span className="text-line-strong">/</span>
                <span>{relTime(top.createdAt)}</span>
              </div>
            </div>
            <div className="flex items-center gap-5 border-t border-line px-5 py-5 lg:border-l lg:border-t-0 md:px-6">
              <ScoreRing score={top.riskScore} size={88} label="risk" />
              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex items-baseline gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                  <span className="num text-[13px] text-danger">{top.analysis.stats.confirmed}</span>
                  <span className="text-faint">confirmed</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-warn" />
                  <span className="num text-[13px] text-warn">{top.analysis.stats.potential}</span>
                  <span className="text-faint">potential</span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                  <span className="num text-[13px] text-ok">{top.analysis.stats.safe}</span>
                  <span className="text-faint">safe</span>
                </div>
                <div className="pt-1 text-faint">
                  <span className="num text-fg">{top.analysis.stats.affectedRepos}</span> repos affected
                </div>
              </div>
            </div>
          </div>
          <BlastRadius analysis={top.analysis} />
        </Card>
      )}

      <Ledger
        className="mt-4"
        items={[
          { label: "Repositories", value: rows.length, note: "connected & parsed" },
          { label: "Relationships", value: graph.edges.length, note: `${cross} cross-repository` },
          { label: "Confirmed breaking", value: confirmed, tone: confirmed > 0 ? "danger" : "ok", note: "in open PRs" },
          { label: "Potential risk", value: potential, tone: potential > 0 ? "warn" : "neutral", note: "unproven, not safe" },
          { label: "Analysed PRs", value: analyzed.length, note: `${open.length} still open` },
        ]}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <Card className="min-w-0">
          <CardHeader
            eyebrow="by risk score"
            title="Pull requests"
            right={
              <Link href="/pull-requests" className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:text-fg">
                all →
              </Link>
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="eyebrow px-4 py-2 font-normal md:px-5">risk</th>
                  <th className="eyebrow px-2 py-2 font-normal">pull request</th>
                  <th className="eyebrow px-2 py-2 text-right font-normal">break</th>
                  <th className="eyebrow px-2 py-2 text-right font-normal">pot.</th>
                  <th className="eyebrow px-4 py-2 text-right font-normal md:px-5">repos</th>
                </tr>
              </thead>
              <tbody>
                {byRisk.map((p) => (
                  <tr key={p.id} className="group border-b border-line last:border-0 hover:bg-white/[0.025]">
                    <td className="py-2.5 pl-4 pr-2 md:pl-5">
                      <div className="flex items-center gap-2">
                        <span className={`h-3 w-[2px] ${ruleTone(p.riskLevel)}`} />
                        <span className={`num text-[12.5px] ${scoreTone(p.riskLevel)}`}>{p.riskScore}</span>
                      </div>
                    </td>
                    <td className="max-w-[300px] px-2 py-2.5">
                      <Link href={`/pull-requests/${p.id}`} className="block truncate text-[12.5px] text-fg group-hover:text-signal">
                        <span className="num mr-1.5 text-[11px] text-faint">#{p.number}</span>
                        {p.title}
                      </Link>
                      <div className="mt-0.5 truncate font-mono text-[10.5px] text-faint">
                        {short(p.repoName)} · @{p.author} · {relTime(p.createdAt)}
                      </div>
                    </td>
                    <td className={`num px-2 py-2.5 text-right text-[12px] ${p.analysis!.stats.confirmed > 0 ? "text-danger" : "text-faint"}`}>
                      {p.analysis!.stats.confirmed}
                    </td>
                    <td className={`num px-2 py-2.5 text-right text-[12px] ${p.analysis!.stats.potential > 0 ? "text-warn" : "text-faint"}`}>
                      {p.analysis!.stats.potential}
                    </td>
                    <td className="num px-4 py-2.5 text-right text-[12px] text-muted md:px-5">{p.analysis!.stats.affectedRepos}</td>
                  </tr>
                ))}
                {byRisk.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-[12px] text-muted">
                      No open pull requests with an analysis.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="min-w-0">
          <CardHeader
            eyebrow="dependency posture"
            title="Repository health"
            right={
              <Link href="/analytics" className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:text-fg">
                detail →
              </Link>
            }
          />
          <div>
            {graph.repos.map((r) => {
              const h = health.get(r.id)!;
              return (
                <Link
                  key={r.id}
                  href={`/repositories/${r.id}`}
                  className="group flex items-center gap-3 border-b border-line px-4 py-3 last:border-0 hover:bg-white/[0.025] md:px-5"
                >
                  <ScoreRing score={h.score} size={38} invert />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-fg group-hover:text-signal">{r.name}</div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-faint">
                      {Math.round(h.coverage * 100)}% coverage · {h.outdated.length} outdated
                    </div>
                  </div>
                  <span className="num text-[11px] text-muted">grade {h.grade}</span>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      {recs.length > 0 && (
        <Card className="mt-4">
          <CardHeader
            eyebrow="architecture"
            title="Structural alerts"
            right={
              <Link href="/recommendations" className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted hover:text-fg">
                all →
              </Link>
            }
          />
          <div className="grid md:grid-cols-3">
            {recs.map((r) => (
              <div key={r.id} className="border-b border-line p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0 md:p-5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      r.severity === "high" ? "bg-danger" : r.severity === "medium" ? "bg-warn" : "bg-faint"
                    }`}
                  />
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">{r.type}</span>
                </div>
                <div className="mt-2.5 text-[12.5px] leading-snug text-fg">{r.title}</div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{r.suggestion}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
