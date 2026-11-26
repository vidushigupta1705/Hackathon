import { KIND_LABEL } from "@/lib/analyzer/diff";
import type { PRAnalysis } from "@/lib/analyzer/types";
import BlastRadius from "./BlastRadius";
import FixCard from "./FixCard";
import { Badge, Bar, Card, CardHeader, ScoreRing, SevBadge, VerdictBadge } from "./ui";

const pct = (c: number) => `${Math.round(c * 100)}%`;
const order = { confirmed_breaking: 0, potential_risk: 1, non_breaking: 2 } as const;

const verdictRule = (v?: string) =>
  v === "confirmed_breaking" ? "border-l-danger" : v === "potential_risk" ? "border-l-warn" : "border-l-ok/50";

const th = "eyebrow sticky top-0 z-10 bg-panel px-3 py-2 text-left font-normal first:pl-4 last:pr-4 md:first:pl-5 md:last:pr-5";

export default function AnalysisView({ analysis: a, prId, fixStatus = {} }: { analysis: PRAnalysis; prId?: number; fixStatus?: Record<string, string> }) {
  const changes = [...a.changes].sort((x, y) => order[x.verdict ?? "non_breaking"] - order[y.verdict ?? "non_breaking"]);

  // de-duplicate affected nodes across changes
  const nodeMap = new Map<string, (typeof a.affected)[number] & { count: number }>();
  for (const n of a.affected) {
    if (n.file === "*") continue;
    const k = `${n.repoId}|${n.file}|${n.symbol}`;
    const cur = nodeMap.get(k);
    if (!cur) nodeMap.set(k, { ...n, count: 1 });
    else {
      cur.count++;
      if (n.confidence > cur.confidence) {
        cur.confidence = n.confidence;
        cur.severity = n.severity;
        cur.reason = n.reason;
      }
    }
  }
  const nodes = [...nodeMap.values()].sort((x, y) => x.depth - y.depth || y.confidence - x.confidence);
  const impacted = a.repos.filter((r) => r.level !== "origin");

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-5 p-4 md:flex-row md:items-center md:gap-7 md:p-5">
          <ScoreRing score={a.risk.score} label="risk" size={104} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone={a.risk.level === "high" ? "danger" : a.risk.level === "medium" ? "warn" : "ok"}>{a.risk.level} risk</Badge>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
                {a.engine === "llm" ? "llm prose · deterministic detection" : "rule engine · deterministic"}
              </span>
            </div>
            <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-fg">{a.summary}</p>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-5">
              {[
                ["changes", a.stats.changed, "text-fg"],
                ["confirmed", a.stats.confirmed, "text-danger"],
                ["potential", a.stats.potential, "text-warn"],
                ["safe", a.stats.safe, "text-ok"],
                ["repos hit", a.stats.affectedRepos, "text-fg"],
              ].map(([l, v, c]) => (
                <div key={l as string} className="bg-panel px-3 py-2.5">
                  <div className={`num text-[16px] leading-none ${c as string}`}>{String(v).padStart(2, "0")}</div>
                  <div className="eyebrow mt-1.5">{l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-x-8 gap-y-3.5 border-t border-line p-4 md:grid-cols-2 md:p-5">
          {a.risk.factors.map((f) => (
            <div key={f.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-[11.5px] text-fg">{f.label}</span>
                <span className="num text-[10.5px] text-faint">
                  {f.points}/{f.max}
                </span>
              </div>
              <Bar value={f.points} max={f.max} tone={f.points / f.max > 0.66 ? "danger" : f.points / f.max > 0.33 ? "warn" : "ok"} />
              <div className="mt-1.5 text-[10.5px] leading-relaxed text-faint">{f.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="diff classification"
          title="Changes and compatibility verdicts"
          subtitle="Confirmed incompatibilities are proven by a call site in a connected repository. Potential risks are changes that could not be proven safe."
        />
        <div>
          {changes.length === 0 && <div className="px-5 py-8 text-[12.5px] text-muted">No API-level changes detected.</div>}
          {changes.map((c) => {
            const fs = a.findings.filter((f) => f.changeId === c.id);
            return (
              <div key={c.id} className={`border-b border-line border-l-2 px-4 py-4 last:border-b-0 md:px-5 ${verdictRule(c.verdict)}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <VerdictBadge verdict={c.verdict} />
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">{KIND_LABEL[c.kind]}</span>
                  <span className="font-mono text-[10.5px] text-faint">
                    {c.file}:{c.line}
                  </span>
                </div>
                <div className="mt-2.5 text-[12.5px] font-medium leading-relaxed text-fg">{c.summary}</div>
                {c.oldSym && c.newSym && c.oldSym.signature !== c.newSym.signature && (
                  <div className="mt-2.5 border border-line bg-sunken font-mono text-[11px] leading-[1.8]">
                    <div className="flex gap-2 px-2.5 text-danger">
                      <span className="select-none opacity-60">−</span>
                      <span className="min-w-0 break-all">{c.oldSym.signature}</span>
                    </div>
                    <div className="flex gap-2 border-t border-line px-2.5 text-ok">
                      <span className="select-none opacity-60">+</span>
                      <span className="min-w-0 break-all">{c.newSym.signature}</span>
                    </div>
                  </div>
                )}
                {a.explanations[c.id] && (
                  <div className="mt-3 border-l border-signal/30 pl-3">
                    <div className="eyebrow mb-1.5 text-signal/60">why</div>
                    <p className="text-[12px] leading-relaxed text-muted">{a.explanations[c.id]}</p>
                  </div>
                )}
                {typeof c.detail.note === "string" && <div className="mt-2 font-mono text-[10.5px] text-faint">{c.detail.note}</div>}
                {fs.length > 0 && (
                  <details className="group mt-3">
                    <summary className="flex cursor-pointer list-none items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted hover:text-fg [&::-webkit-details-marker]:hidden">
                      <span className="text-faint group-open:hidden">+</span>
                      <span className="hidden text-faint group-open:inline">−</span>
                      {fs.length} affected call site{fs.length === 1 ? "" : "s"}
                    </summary>
                    <div className="mt-2 space-y-1.5">
                      {fs.map((f) => (
                        <div key={f.id} className="border border-line bg-sunken/60 p-2.5">
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px]">
                            <Badge tone={f.verdict === "confirmed" ? "danger" : "warn"}>{f.verdict}</Badge>
                            <SevBadge sev={f.severity} />
                            <span className="text-muted">{f.repoName.split("/").pop()}</span>
                            <span className="font-mono text-faint">
                              {f.file}:{f.line}
                            </span>
                            <span className="ml-auto num text-faint">{pct(f.confidence)}</span>
                          </div>
                          <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">{f.reason}</p>
                          {f.text && (
                            <pre className="mt-1.5 overflow-x-auto border border-line bg-ink px-2 py-1 font-mono text-[10.5px] text-faint">{f.text.trim()}</pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="propagation"
          title="Blast radius"
          subtitle="Transitive propagation through function calls and HTTP contracts, not just direct dependents."
        />
        <BlastRadius analysis={a} />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="evidence"
          title="Impact report"
          subtitle="Affected repositories, files and functions with severity, confidence and the reason each is affected."
        />
        {impacted.length === 0 ? (
          <div className="px-5 py-8 text-[12.5px] text-muted">No other repository is affected.</div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>repository</th>
                  <th className={th}>reach</th>
                  <th className={th}>severity</th>
                  <th className={th}>conf.</th>
                  <th className={th}>confirmed / potential</th>
                  <th className={th}>files</th>
                  <th className={th}>why</th>
                </tr>
              </thead>
              <tbody>
                {impacted.map((r) => (
                  <tr key={r.repoId} className="border-b border-line align-top last:border-0 hover:bg-white/[0.025]">
                    <td className="px-3 py-2.5 pl-4 text-[12px] text-fg md:pl-5">{r.name.split("/").pop()}</td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted">
                      {r.level} · hop {r.hop}
                    </td>
                    <td className="px-3 py-2.5">
                      <SevBadge sev={r.severity} />
                    </td>
                    <td className="num px-3 py-2.5 text-[11px] text-muted">{pct(r.confidence)}</td>
                    <td className="num px-3 py-2.5 text-[11px]">
                      <span className="text-danger">{r.confirmed}</span>
                      <span className="text-faint"> / </span>
                      <span className="text-warn">{r.potential}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[10.5px] text-faint">
                      {r.files.slice(0, 2).join(", ")}
                      {r.files.length > 2 ? ` +${r.files.length - 2}` : ""}
                    </td>
                    <td className="max-w-md px-3 py-2.5 pr-4 text-[11.5px] leading-relaxed text-muted">{r.reasons[0]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nodes.length > 0 && (
          <div className="max-h-[460px] overflow-auto border-t border-line">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className={th}>function / scope</th>
                  <th className={th}>file</th>
                  <th className={th}>depth</th>
                  <th className={th}>severity</th>
                  <th className={th}>conf.</th>
                  <th className={th}>why it is affected</th>
                </tr>
              </thead>
              <tbody>
                {nodes.slice(0, 40).map((n) => (
                  <tr key={`${n.repoId}|${n.file}|${n.symbol}`} className="border-b border-line align-top last:border-0 hover:bg-white/[0.025]">
                    <td className="px-3 py-2 pl-4 md:pl-5">
                      <div className="font-mono text-[11.5px] text-fg">{n.symbol === "<module>" ? "(module scope)" : n.symbol}</div>
                      <div className="font-mono text-[10px] text-faint">{n.repoName.split("/").pop()}</div>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10.5px] text-muted">{n.file}</td>
                    <td className="num px-3 py-2 text-[10.5px] text-muted">{n.depth === 1 ? "direct" : `depth ${n.depth}`}</td>
                    <td className="px-3 py-2">
                      <SevBadge sev={n.severity} />
                    </td>
                    <td className="num px-3 py-2 text-[11px] text-muted">{pct(n.confidence)}</td>
                    <td className="max-w-lg px-3 py-2 pr-4 text-[11.5px] leading-relaxed text-muted">{n.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            eyebrow="test strategy"
            title="Suites worth running"
            subtitle="Existing suites that exercise changed or affected symbols, ordered by priority."
          />
          <div>
            {a.tests.recommended.length === 0 && (
              <div className="px-4 py-6 text-[12px] text-muted md:px-5">No existing tests reference the impacted symbols.</div>
            )}
            {a.tests.recommended.map((t) => (
              <div key={`${t.repoId}|${t.file}`} className="flex gap-3 border-b border-line px-4 py-3 last:border-0 md:px-5">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${t.priority === "must" ? "bg-danger" : t.priority === "should" ? "bg-warn" : "bg-ok"}`} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[11px] text-fg">
                      {t.repoName.split("/").pop()}/{t.file}
                    </span>
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
                      {t.priority === "must" ? "run first" : t.priority === "should" ? "should run" : "optional"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11.5px] leading-relaxed text-muted">{t.reason}</div>
                  <div className="mt-1 font-mono text-[10px] text-faint">covers {t.covers.join(", ")}</div>
                </div>
              </div>
            ))}
          </div>
          {a.tests.missing.length > 0 && (
            <div className="border-t border-line px-4 py-3 md:px-5">
              <div className="eyebrow mb-2 text-warn/80">missing coverage · {a.tests.missing.length}</div>
              <ul className="space-y-1">
                {a.tests.missing.slice(0, 8).map((m) => (
                  <li key={`${m.repoId}|${m.file}|${m.symbol}`} className="font-mono text-[10.5px] text-muted">
                    {m.symbol} <span className="text-faint">· {m.repoName.split("/").pop()}/{m.file}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader eyebrow="review checklist" title="What to verify" subtitle="Generated for the human reviewing this change." />
          <ul className="divide-y divide-line">
            {a.verify.length === 0 && <li className="px-4 py-6 text-[12px] text-muted md:px-5">Nothing to verify — the change looks safe.</li>}
            {a.verify.map((v, i) => (
              <li key={i} className="flex gap-3 px-4 py-3 text-[12px] leading-relaxed text-muted md:px-5">
                <span className="mt-[3px] h-3 w-3 shrink-0 border border-line-strong" />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {a.fixes.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader
            eyebrow="suggested fixes · advisory"
            title="Patches awaiting review"
            subtitle="Nothing is applied automatically. Approved suggestions are attached to the PR comment for the author."
          />
          <div className="space-y-2 p-4 md:p-5">
            {a.fixes.map((f) => (
              <FixCard key={f.id} fix={f} prId={prId} status={fixStatus[f.id]} />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
