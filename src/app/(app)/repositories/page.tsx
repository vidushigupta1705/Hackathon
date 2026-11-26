import Link from "next/link";
import { ApiButton } from "@/components/Actions";
import ConnectPanel from "@/components/ConnectPanel";
import { Card, Empty, PageHeader, ScoreRing, btn, relTime } from "@/components/ui";
import { dependenciesOf, dependentsOf } from "@/lib/analyzer/graph";
import { loadContext } from "@/lib/context";
import { getGithubToken } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Repositories() {
  const [{ graph, rows, health }, token] = await Promise.all([loadContext(), getGithubToken()]);
  const hasDemo = rows.some((r) => r.provider === "demo");

  return (
    <>
      <PageHeader
        eyebrow={`${rows.length} connected · ${graph.edges.length} relationships`}
        title="Repositories"
        desc="Each repository is parsed into functions, classes, endpoints, types and imports, then linked into a single cross-repository graph."
        actions={
          <>
            {hasDemo ? (
              <>
                <ApiButton url="/api/demo" body={{ action: "reset" }} label="Reset demo" busyLabel="Resetting…" variant="secondary" />
                <ApiButton url="/api/demo" body={{ action: "remove" }} label="Remove demo" variant="danger" confirmText="Remove the demo repositories and their pull requests?" />
              </>
            ) : (
              <ApiButton url="/api/demo" body={{ action: "load" }} label="Load demo project" busyLabel="Analysing demo…" variant="secondary" />
            )}
          </>
        }
      />

      {rows.length === 0 ? (
        <Empty title="No repositories yet" eyebrow="0 connected">
          Connect GitHub repositories below, or load the demo project to see the analyzer on a four-service system.
        </Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-line">
            {graph.repos.map((r) => {
              const row = rows.find((x) => x.id === r.id)!;
              const h = health.get(r.id)!;
              const files = r.files.filter((f) => !f.isTest && f.symbols.length + f.imports.length > 0).length;
              const syms = r.files.flatMap((f) => f.symbols).filter((s) => s.exported).length;
              const deps = dependenciesOf(graph, r.id).map((i) => graph.repoById.get(i)!.name);
              const users = dependentsOf(graph, r.id).map((i) => graph.repoById.get(i)!.name);
              return (
                <div key={r.id} className="px-4 py-4 md:px-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <ScoreRing score={h.score} size={44} invert />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                          <Link href={`/repositories/${r.id}`} className="text-[13px] font-medium text-fg transition-colors hover:text-signal">
                            {r.fullName}
                          </Link>
                          <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
                            {row.provider}
                            {row.isPrivate ? " · private" : ""}
                          </span>
                        </div>
                        <p className="mt-1 max-w-xl text-[11.5px] leading-relaxed text-muted">{row.description || "—"}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/repositories/${r.id}`} className={btn.secondary}>
                        Inspect
                      </Link>
                      {row.provider === "github" && <ApiButton url={`/api/repos/${r.id}`} label="Sync" busyLabel="Syncing…" variant="secondary" />}
                      {row.provider === "github" && (
                        <ApiButton url={`/api/repos/${r.id}`} method="DELETE" label="Disconnect" variant="danger" confirmText={`Disconnect ${r.fullName}?`} />
                      )}
                    </div>
                  </div>

                  <div className="mt-3.5 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-4">
                    {[
                      ["source files", files],
                      ["public symbols", syms],
                      ["branches", row.branches.length],
                      ["health grade", h.grade],
                    ].map(([l, v]) => (
                      <div key={l as string} className="bg-panel px-3 py-2">
                        <div className="num text-[13px] text-fg">{v}</div>
                        <div className="eyebrow mt-1">{l}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 grid gap-1 font-mono text-[10.5px] leading-relaxed text-faint sm:grid-cols-2">
                    <div>
                      <span className="text-muted">depends on </span>
                      {deps.length ? deps.join(", ") : "—"}
                    </div>
                    <div>
                      <span className="text-muted">used by </span>
                      {users.length ? users.join(", ") : "—"}
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-muted">latest commit </span>
                      {row.commits[0] ? `${row.commits[0].message} — ${row.commits[0].author}` : "—"}
                      <span className="text-line-strong"> / </span>
                      synced {relTime(row.lastSyncedAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="mt-6">
        <ConnectPanel hasToken={!!token} connected={rows.map((r) => r.fullName)} />
      </div>
    </>
  );
}
