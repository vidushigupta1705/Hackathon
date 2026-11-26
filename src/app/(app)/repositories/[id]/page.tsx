import Link from "next/link";
import { notFound } from "next/navigation";
import { Bar, Badge, Card, CardHeader, PageHeader, ScoreRing, btn, relTime } from "@/components/ui";
import { nodeKey } from "@/lib/analyzer/graph";
import { loadContext } from "@/lib/context";

export const dynamic = "force-dynamic";

export default async function RepoDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { graph, rows, health, prs } = await loadContext();
  const repo = graph.repoById.get(Number(id));
  const row = rows.find((r) => r.id === Number(id));
  if (!repo || !row) notFound();
  const h = health.get(repo.id)!;
  const symbols = repo.files.filter((f) => !f.isTest).flatMap((f) => f.symbols).filter((s) => s.exported);
  const mine = prs.filter((p) => p.repoId === repo.id);
  const pkg = repo.files.find((f) => f.path === "package.json")?.pkg;
  const tests = repo.files.filter((f) => f.isTest);

  return (
    <>
      <div className="mb-4">
        <Link href="/repositories" className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint transition-colors hover:text-fg">
          ← all repositories
        </Link>
      </div>

      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-x-2">
            <span>{row.provider}</span>
            <span className="text-line-strong">/</span>
            <span>default branch {row.defaultBranch}</span>
            {row.isPrivate && (
              <>
                <span className="text-line-strong">/</span>
                <span>private</span>
              </>
            )}
          </span>
        }
        title={repo.fullName}
        desc={row.description || undefined}
        actions={<span className="font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">synced {relTime(row.lastSyncedAt)}</span>}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader
            eyebrow="score model"
            title="Dependency health"
            subtitle="Penalties from unresolved issues, breaking-change frequency, test coverage, complexity and outdated dependencies."
            right={<span className="num text-[12px] text-muted">grade {h.grade}</span>}
          />
          <div className="flex flex-wrap gap-6 p-4 md:p-5">
            <ScoreRing score={h.score} size={112} invert label="health" />
            <div className="grid min-w-[240px] flex-1 gap-3.5">
              {h.factors.map((f) => (
                <div key={f.label}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3">
                    <span className="text-[11.5px] text-fg">{f.label}</span>
                    <span className="num text-[10.5px] text-faint">
                      −{f.points} / {f.max}
                    </span>
                  </div>
                  <Bar value={f.points} max={f.max} tone={f.points / f.max > 0.6 ? "danger" : f.points / f.max > 0.3 ? "warn" : "ok"} />
                  <div className="mt-1.5 text-[10.5px] leading-relaxed text-faint">{f.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="overflow-hidden">
            <CardHeader eyebrow="branches" title={row.defaultBranch} />
            <div className="flex flex-wrap gap-1.5 p-4">
              {row.branches.map((b) => (
                <Badge key={b} tone={b === row.defaultBranch ? "accent" : "neutral"}>
                  {b}
                </Badge>
              ))}
            </div>
          </Card>
          <Card className="overflow-hidden">
            <CardHeader eyebrow="history" title="Recent commits" />
            <div>
              {row.commits.slice(0, 6).map((c) => (
                <div key={c.sha + c.message} className="border-b border-line px-4 py-2.5 last:border-0">
                  <div className="truncate text-[11.5px] text-fg">{c.message}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-faint">
                    {c.sha} · {c.author} · {relTime(c.date)}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card className="mt-4 overflow-hidden">
        <CardHeader
          eyebrow={`${symbols.length} exported`}
          title="Parsed public API"
          subtitle="Functions, classes, endpoints and types extracted from source, with the number of call sites that depend on each."
        />
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead>
              <tr className="border-b border-line">
                {["symbol", "kind", "signature", "location", "used by"].map((hd, i) => (
                  <th
                    key={hd}
                    className={`eyebrow sticky top-0 z-10 bg-panel px-3 py-2 font-normal first:pl-4 md:first:pl-5 last:pr-4 md:last:pr-5 ${
                      i === 4 ? "text-right" : ""
                    }`}
                  >
                    {hd}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((s) => {
                const used = (graph.byTarget.get(nodeKey(repo.id, s.file, s.name)) ?? []).filter((e) => e.fromRepo !== repo.id);
                const repos = new Set(used.map((e) => graph.repoById.get(e.fromRepo)?.name));
                return (
                  <tr key={s.file + s.name} className="border-b border-line last:border-0 hover:bg-white/[0.025]">
                    <td className="px-3 py-2 pl-4 font-mono text-[11.5px] text-fg md:pl-5">{s.name}</td>
                    <td className="px-3 py-2">
                      <Badge tone="neutral">{s.kind}</Badge>
                    </td>
                    <td className="max-w-md truncate px-3 py-2 font-mono text-[10.5px] text-muted">{s.kind === "route" ? "" : s.signature}</td>
                    <td className="px-3 py-2 font-mono text-[10.5px] text-faint">
                      {s.file}:{s.line}
                    </td>
                    <td className="px-3 py-2 pr-4 text-right font-mono text-[10.5px] text-muted md:pr-5">
                      {used.length ? (
                        <span title={[...repos].join(", ")}>
                          {used.length} · {repos.size} repo{repos.size === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden">
          <CardHeader eyebrow={pkg?.name ?? "manifest"} title="Dependencies" />
          <div>
            {Object.entries({ ...pkg?.dependencies, ...pkg?.devDependencies }).map(([n, v]) => {
              const out = h.outdated.find((o) => o.name === n);
              return (
                <div key={n} className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 last:border-0">
                  <span className="truncate font-mono text-[11px] text-fg">{n}</span>
                  <span className="flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-faint">
                    {v}
                    {out && <span className="text-warn">→ {out.latest}</span>}
                  </span>
                </div>
              );
            })}
            {!pkg && <div className="px-4 py-6 font-mono text-[10.5px] text-faint">No package.json found.</div>}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader eyebrow={`${Math.round(h.coverage * 100)}% of symbols referenced`} title="Test files" />
          <div>
            {tests.map((t) => (
              <div key={t.path} className="truncate border-b border-line px-4 py-2 font-mono text-[10.5px] text-muted last:border-0">
                {t.path}
              </div>
            ))}
            {tests.length === 0 && <div className="px-4 py-6 font-mono text-[10.5px] text-faint">No test files detected.</div>}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader eyebrow={`${mine.length} total`} title="Pull requests" />
          <div>
            {mine.map((p) => (
              <Link key={p.id} href={`/pull-requests/${p.id}`} className="group flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 last:border-0 hover:bg-white/[0.025]">
                <span className="min-w-0 truncate text-[11.5px] text-muted group-hover:text-fg">
                  <span className="num mr-1.5 text-[10px] text-faint">#{p.number}</span>
                  {p.title}
                </span>
                <span
                  className={`num shrink-0 text-[11px] ${
                    p.riskLevel === "high" ? "text-danger" : p.riskLevel === "medium" ? "text-warn" : "text-ok"
                  }`}
                >
                  {p.riskScore}
                </span>
              </Link>
            ))}
            {mine.length === 0 && <div className="px-4 py-6 font-mono text-[10.5px] text-faint">No pull requests.</div>}
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Link href="/graph" className={btn.secondary}>
          Open in dependency graph
        </Link>
      </div>
    </>
  );
}
