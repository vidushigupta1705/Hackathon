import Link from "next/link";
import { AnalyzePRForm } from "@/components/Actions";
import { Card, Empty, PageHeader, relTime, short } from "@/components/ui";
import { loadContext } from "@/lib/context";

export const dynamic = "force-dynamic";

const tone = (level: string) => (level === "high" ? "text-danger" : level === "medium" ? "text-warn" : "text-ok");
const rule = (level: string) => (level === "high" ? "bg-danger" : level === "medium" ? "bg-warn" : "bg-ok");

export default async function PullRequests() {
  const { prs, rows } = await loadContext();
  const sorted = [...prs].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const github = rows.filter((r) => r.provider === "github");

  return (
    <>
      <PageHeader
        eyebrow="every PR, every dependent"
        title="Pull requests"
        desc="Each pull request is diffed against its base, checked against every connected repository and scored 0–100. Low ≤ 30 · medium 31–70 · high ≥ 71."
      />

      {github.length > 0 && (
        <div className="mb-4">
          <AnalyzePRForm repos={github.map((r) => ({ id: r.id, fullName: r.fullName }))} />
        </div>
      )}

      {sorted.length === 0 ? (
        <Empty
          title="No pull requests yet"
          eyebrow="0 analysed"
          actions={
            <Link href="/repositories" className="border border-line-strong px-3.5 py-2 text-[12.5px] text-fg transition-colors hover:bg-white/[0.04]">
              Connect a repository
            </Link>
          }
        >
          Connect a GitHub repository with open pull requests, or load the demo project from Repositories.
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[70vh] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  {["risk", "pull request", "changes", "verdicts", "blast radius", "opened"].map((h, i) => (
                    <th
                      key={h}
                      className={`eyebrow sticky top-0 z-10 bg-panel px-3 py-2 font-normal first:pl-4 md:first:pl-5 last:pr-4 md:last:pr-5 ${
                        i >= 2 && i <= 4 ? "hidden md:table-cell" : ""
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => (
                  <tr key={p.id} className="group border-b border-line align-top last:border-0 hover:bg-white/[0.025]">
                    <td className="py-2.5 pl-4 pr-2 md:pl-5">
                      <div className="flex items-center gap-2">
                        <span className={`h-3.5 w-[2px] ${rule(p.riskLevel)}`} />
                        <span className={`num text-[13px] ${tone(p.riskLevel)}`}>{p.analysis ? p.riskScore : "—"}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <Link href={`/pull-requests/${p.id}`} className="block text-[12.5px] text-fg group-hover:text-signal">
                        <span className="num mr-1.5 text-[11px] text-faint">#{p.number}</span>
                        {p.title}
                      </Link>
                      <div className="mt-1 font-mono text-[10px] text-faint">
                        {short(p.repoName)} · {p.headBranch} · @{p.author}
                      </div>
                    </td>
                    <td className="num hidden px-3 py-2.5 text-[11.5px] text-muted md:table-cell">{p.analysis?.stats.changed ?? "—"}</td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      {p.analysis ? (
                        <div className="flex items-center gap-2.5 font-mono text-[10.5px]">
                          {p.analysis.stats.confirmed > 0 && <span className="text-danger">{p.analysis.stats.confirmed} breaking</span>}
                          {p.analysis.stats.potential > 0 && <span className="text-warn">{p.analysis.stats.potential} potential</span>}
                          {p.analysis.stats.confirmed + p.analysis.stats.potential === 0 && <span className="text-ok">no breaks</span>}
                        </div>
                      ) : (
                        <span className="font-mono text-[10.5px] text-faint">not analysed</span>
                      )}
                    </td>
                    <td className="hidden max-w-[220px] truncate px-3 py-2.5 font-mono text-[10.5px] text-muted md:table-cell">
                      {p.analysis && p.analysis.stats.affectedRepos
                        ? p.analysis.repos.filter((r) => r.level !== "origin").map((r) => short(r.name)).join(", ")
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 pr-4 font-mono text-[10.5px] text-faint md:pr-5">{relTime(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
