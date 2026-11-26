import Link from "next/link";
import { Badge, Empty, PageHeader, SevBadge, VerdictBadge, short } from "@/components/ui";
import { KIND_LABEL } from "@/lib/analyzer/diff";
import { loadContext } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function BreakingChanges({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  const { v = "all" } = await searchParams;
  const { prs } = await loadContext();
  const items = prs.flatMap((p) =>
    (p.analysis?.changes ?? [])
      .filter((c) => c.verdict && c.verdict !== "non_breaking")
      .map((c) => {
        const fs = p.analysis!.findings.filter((f) => f.changeId === c.id);
        return { p, c, fs, repos: [...new Set(fs.map((f) => short(f.repoName)))] };
      }),
  );
  const confirmed = items.filter((i) => i.c.verdict === "confirmed_breaking");
  const potential = items.filter((i) => i.c.verdict === "potential_risk");
  const shown = v === "confirmed" ? confirmed : v === "potential" ? potential : [...confirmed, ...potential];

  const tabs: [string, string, number][] = [
    ["all", "all", items.length],
    ["confirmed", "confirmed breaking", confirmed.length],
    ["potential", "potential risk", potential.length],
  ];

  return (
    <>
      <PageHeader
        eyebrow="findings across every analysed PR"
        title="Breaking changes"
        desc="Confirmed incompatibilities have a proven failing call site. Potential risks are changes that could not be proven safe — unknown types, external consumers, behavioural shifts."
        actions={
          <div className="inline-flex border border-line-strong">
            {tabs.map(([k, l, n]) => (
              <Link
                key={k}
                href={`/breaking-changes?v=${k}`}
                aria-current={v === k ? "page" : undefined}
                className={`flex items-center gap-1.5 border-r border-line-strong px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] last:border-r-0 ${
                  v === k ? "bg-signal/[0.09] text-signal" : "text-muted transition-colors hover:bg-white/[0.03] hover:text-fg"
                }`}
              >
                {l}
                <span className="num opacity-70">{String(n).padStart(2, "0")}</span>
              </Link>
            ))}
          </div>
        }
      />

      {shown.length === 0 ? (
        <Empty title="Nothing matches this filter" eyebrow="0 findings">
          No analysed pull request currently carries a confirmed or potential incompatibility in this view.
        </Empty>
      ) : (
        <div className="border-y border-line">
          {shown.map(({ p, c, fs, repos }) => {
            const sev = fs.reduce((m, f) => (["low", "medium", "high", "critical"].indexOf(f.severity) > ["low", "medium", "high", "critical"].indexOf(m) ? f.severity : m), "low" as string);
            return (
              <div
                key={`${p.id}-${c.id}`}
                className={`grid gap-2 border-b border-l-2 border-line px-4 py-4 last:border-b-0 md:grid-cols-[170px_1fr_auto] md:gap-5 md:px-5 ${
                  c.verdict === "confirmed_breaking" ? "border-l-danger" : "border-l-warn"
                }`}
              >
                <div className="space-y-2">
                  <VerdictBadge verdict={c.verdict} />
                  <div className="flex flex-wrap gap-1.5">
                    {fs.length > 0 && <SevBadge sev={sev} />}
                    <Badge tone="neutral">{KIND_LABEL[c.kind]}</Badge>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium leading-relaxed text-fg">{c.summary}</div>
                  <p className="mt-1.5 max-w-3xl text-[11.5px] leading-relaxed text-muted">{p.analysis!.explanations[c.id]}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-faint">
                    <span>{c.file}:{c.line}</span>
                    <span className="text-line-strong">/</span>
                    <span>
                      affects {repos.length ? repos.join(", ") : "no known consumers"}
                    </span>
                    <span className="text-line-strong">/</span>
                    <span>
                      {fs.length} call site{fs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="md:text-right">
                  <Link href={`/pull-requests/${p.id}`} className="font-mono text-[10.5px] text-muted underline decoration-line-strong underline-offset-4 hover:text-signal">
                    #{p.number} {short(p.repoName)}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
