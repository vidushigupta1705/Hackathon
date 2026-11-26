"use client";

import { useMemo, useState } from "react";
import QuarantinePanel from "./QuarantinePanel";
import VectorInspector from "./VectorInspector";
import { Badge, Card, CardHeader, Empty, Ledger, btn, field, relTime, short } from "./ui";
import type { BoardData, EntityOption, Thresholds } from "@/lib/quarantine-types";
import type { Resolution } from "@/lib/resolver/resolve";

type Probe = (Resolution & { quarantineId: number | null }) | null;

const BUCKET_TONE: Record<string, string> = {
  out_of_domain: "danger",
  low_confidence: "warn",
  ambiguous: "warn",
};

const bucketLabel = (bucket: string) => (bucket === "out_of_domain" ? "unknown" : bucket.replace(/_/g, " "));

const ACTIONS: [string, string][] = [
  ["", "any target kind"],
  ["remove", "remove"],
  ["rename", "rename"],
  ["param_type", "change parameter type"],
  ["return_type", "change return type"],
  ["route_path", "move endpoint"],
  ["remove_field", "remove type field"],
  ["upgrade_dep", "upgrade dependency"],
];

export default function QuarantineClient({ initial }: { initial: BoardData }) {
  const [board, setBoard] = useState<BoardData>(initial);
  const [text, setText] = useState("");
  const [repo, setRepo] = useState("0");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [probe, setProbe] = useState<Probe>(null);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  // Single live copy of the policy: the inspector writes it, the policy card and every row
  // read it, so a slider move never leaves two different thresholds on screen.
  const [thresholds, setThresholds] = useState<Thresholds>(initial.thresholds);

  const repos = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of board.entities) map.set(e.repoId, e.repoName);
    return [...map.entries()];
  }, [board.entities]);

  const rows = board.rows.filter((r) => (filter === "pending" ? r.status === "pending" : true));

  async function refresh() {
    const r = await fetch("/api/quarantine");
    if (r.ok) setBoard((await r.json()) as BoardData);
  }

  async function runProbe(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = { query: text };
    if (repo !== "0") body.repoId = Number(repo);
    if (action) body.action = action;
    const r = await fetch("/api/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    setBusy(false);
    if (!j) {
      setError("The resolver returned no body.");
      return;
    }
    if (!r.ok && r.status !== 422) {
      setError(j.error ?? "Resolution failed.");
      setProbe(null);
      return;
    }
    setProbe(j as Probe);
    if (r.status === 422) void refresh();
  }

  const [floor, auto, margin, learned] = [
    Math.round(thresholds.floor * 100),
    Math.round(thresholds.auto * 100),
    Math.round(thresholds.margin * 100),
    Math.round(thresholds.learned * 100),
  ];

  return (
    <div className="space-y-6">
      <Ledger
        items={[
          {
            label: "pending",
            value: board.stats.pending,
            tone: board.stats.pending > 0 ? "warn" : "ok",
            note: board.stats.pending > 0 ? "waiting for a judge" : "bucket is clear",
          },
          { label: "mapped once", value: board.stats.mapped, note: "aliases now routing" },
          { label: "out of domain", value: board.stats.rejected, note: "refusals remembered" },
          { label: "learned aliases", value: board.stats.aliases, tone: "accent", note: `${board.dims}-d vectors · live` },
        ]}
      />

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="routing policy"
          title="Refuse before guessing"
          subtitle="Every candidate is embedded and compared by cosine similarity. The decision is a threshold, not a best-guess: nothing below the floor is routed, and a winner that does not lead by the margin is sent to a judge."
          right={<Badge tone="neutral">{board.dims}-d · local</Badge>}
        />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["unknown", `< ${floor}%`, "No target is close enough. Quarantined, never routed."],
            ["low confidence", `${floor}–${auto}%`, "Plausible neighbours exist, but none earned a route."],
            ["ambiguous", `lead < ${margin} pts`, "Two targets are too close to call. The judge picks one."],
            ["auto-route", `≥ ${auto}%`, "One clear winner, leading by at least the margin."],
          ].map(([label, value, note]) => (
            <div key={label} className="bg-panel px-4 py-3.5 md:px-5">
              <div className="eyebrow">{label}</div>
              <div className="num mt-2 text-[19px] leading-none text-fg">{value}</div>
              <div className="mt-2 text-[11px] leading-snug text-faint">{note}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-4 py-2.5 font-mono text-[10px] leading-relaxed tracking-[0.02em] text-faint md:px-5">
          a judge label is usable at ≥ {learned}% similarity · a rejection holds at ≥ {Math.round(thresholds.reject * 100)}% · labels are
          appended to the in-process store, not a background job
        </div>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="live input"
          title="Route an arbitrary surface form"
          subtitle={
            <>
              Paste a typo, a snake_case variant, a qualified path, or something from another domain. Judges can also call{" "}
              <span className="font-mono text-[11px] text-fg">POST /api/resolve</span> directly; refusals return{" "}
              <span className="font-mono text-[11px] text-fg">422</span> with a quarantine id.
            </>
          }
          right={<Badge tone="accent">embedding · cosine</Badge>}
        />
        <form onSubmit={runProbe} className="grid gap-3 p-4 md:grid-cols-[1fr_190px_170px_auto] md:items-end md:p-5">
          <label className="block min-w-0">
            <span className="eyebrow mb-1.5 block">surface form</span>
            <input
              className={field}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="charg_costumer"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">repository scope</span>
            <select className={field} value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="0">all repositories</option>
              {repos.map(([id, name]) => (
                <option key={id} value={id}>
                  {short(name)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">expected action</span>
            <select className={field} value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={btn.primary} disabled={busy || !text.trim()}>
            {busy ? "Resolving…" : "Route input"}
          </button>
        </form>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 md:px-5">
          <span className="eyebrow">try</span>
          {["chargeCostumer", "charg_customer", "sendSlackMessage", "getUser"].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setText(example)}
              className="rounded-[3px] border border-line px-1.5 py-1 font-mono text-[10px] text-muted transition-colors hover:border-line-strong hover:text-fg"
            >
              {example}
            </button>
          ))}
          {error && <span className="ml-auto font-mono text-[10.5px] text-danger">{error}</span>}
        </div>

        {probe && probe.status === "refused" && !probe.learned && (
          <div className="border-t border-line p-0">
            <QuarantinePanel
              key={`probe-${probe.quarantineId ?? probe.query}`}
              resolution={probe}
              quarantineId={probe.quarantineId}
              entities={repo === "0" ? board.entities : board.entities.filter((e) => e.repoId === Number(repo))}
              onChanged={setBoard}
            />
          </div>
        )}
        {probe && probe.status === "refused" && probe.learned && (
          <div className="border-t border-line px-4 py-3 md:px-5">
            <div className="eyebrow mb-1.5 text-signal/75">refused by a learned rule</div>
            <p className="text-[11.5px] leading-relaxed text-muted">{probe.reason}</p>
          </div>
        )}
        {probe && probe.status === "resolved" && probe.entity && (
          <div className="border-t border-line px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="ok">routed</Badge>
              <span className="break-all font-mono text-[11.5px] text-muted">{probe.query}</span>
              <span className="text-faint">→</span>
              <span className="break-all font-mono text-[11.5px] text-fg">{probe.entity.symbol}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">{probe.entity.kind}</span>
              <Badge tone={probe.learned ? "accent" : "neutral"}>
                {probe.learned ? "learned" : "exact"} · {Math.round(probe.confidence * 100)}%
              </Badge>
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-faint">
              {probe.entity.repoName} · {probe.entity.file}
            </p>
          </div>
        )}
      </Card>

      <VectorInspector dims={board.dims} thresholds={thresholds} onThresholdsChange={setThresholds} />

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow mb-1.5">quarantine bucket</div>
            <h2 className="font-serif text-[21px] leading-tight text-fg">Unknown &amp; low-confidence inputs</h2>
          </div>
          <div className="inline-flex border border-line-strong">
            {(["pending", "all"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setFilter(v)}
                aria-pressed={filter === v}
                className={`flex items-center gap-1.5 border-r border-line-strong px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] last:border-r-0 ${
                  filter === v ? "bg-signal/[0.09] text-signal" : "text-muted transition-colors hover:bg-white/[0.03] hover:text-fg"
                }`}
              >
                {v}
                <span className="num opacity-70">{String(v === "pending" ? board.stats.pending : board.rows.length).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <Empty eyebrow={filter === "pending" ? "bucket clear" : "no history"} title={filter === "pending" ? "Nothing needs a judge" : "No quarantined inputs yet"}>
            {filter === "pending"
              ? "Send an input through the resolver above — or from the simulator — and refusals will appear here with scored candidates."
              : "Refusals are recorded as judges encounter them. Nothing has been quarantined in this project yet."}
          </Empty>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const rowEntities = row.context.repoId ? board.entities.filter((e) => e.repoId === row.context.repoId) : board.entities;
              const resolution: Resolution = {
                query: row.raw,
                normalized: row.normalized,
                status: "refused",
                bucket: row.bucket as Resolution["bucket"],
                entity: null,
                confidence: row.confidence / 100,
                margin: row.margin / 100,
                reason: row.reason,
                learned: false,
                candidates: row.candidates,
                thresholds,
              };
              return (
                <Card key={row.id} className="overflow-hidden">
                  <CardHeader
                    eyebrow={
                      <>
                        {row.context.source ?? "input"} · {row.seenCount}× seen · {relTime(row.lastSeenAt)}
                      </>
                    }
                    title={<span className="break-all font-mono text-[12.5px] font-normal">{row.raw}</span>}
                    subtitle={<span className="font-mono text-[10.5px]">{row.reason}</span>}
                    right={
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Badge tone={BUCKET_TONE[row.bucket] ?? "neutral"}>{bucketLabel(row.bucket)}</Badge>
                        <Badge tone="neutral">
                          <span className="num">{row.confidence}</span>% closest
                        </Badge>
                        {row.status !== "pending" && <Badge tone={row.status === "mapped" ? "ok" : "neutral"}>{row.status}</Badge>}
                      </div>
                    }
                  />
                  {row.status === "pending" ? (
                    <QuarantinePanel
                      resolution={resolution}
                      quarantineId={row.id}
                      entities={rowEntities}
                      dense
                      showHeader={false}
                      onChanged={setBoard}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 md:px-5">
                      {row.status === "mapped" && row.mappedTo ? (
                        <>
                          <span className="eyebrow">mapped to</span>
                          <span className="break-all font-mono text-[11.5px] text-fg">{row.mappedTo.symbol}</span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">{row.mappedTo.kind}</span>
                          <span className="font-mono text-[10px] text-faint">
                            {short(row.mappedTo.repoName)} · {row.mappedTo.file}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="eyebrow">rejected</span>
                          <span className="text-[11.5px] text-muted">Declared out of domain; near-identical inputs are refused without scoring.</span>
                        </>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-faint">
                        {row.resolvedAt ? relTime(row.resolvedAt) : ""} ·{" "}
                        {row.context.repoId ? short(repos.find(([id]) => id === row.context.repoId)?.[1] ?? "") : "project-wide"}
                      </span>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <Card className="overflow-hidden">
        <CardHeader
          eyebrow="one-shot learning"
          title="Learned aliases"
          subtitle="One label per input, written to Postgres and appended to the vector store in the same request. There is no retraining step and no restart."
          right={
            <div className="flex items-center gap-2">
              <Badge tone="accent">
                <span className="num">{board.stats.aliases}</span> in store
              </Badge>
              <button type="button" className={btn.quiet} onClick={() => void refresh()}>
                Refresh
              </button>
            </div>
          }
        />
        {board.aliases.length === 0 ? (
          <div className="px-4 py-6 text-[11.5px] leading-relaxed text-muted md:px-5">
            No labels yet. Map a quarantined input and it will appear here — the very next request will use it.
          </div>
        ) : (
          <ul>
            {board.aliases.map((a) => (
              <li
                key={a.id}
                className="grid gap-1.5 border-t border-line px-4 py-2.5 first:border-t-0 md:grid-cols-[1fr_1fr_150px_70px] md:items-baseline md:gap-4 md:px-5"
              >
                <span className="break-all font-mono text-[11.5px] text-fg">{a.raw}</span>
                <span className="flex flex-wrap items-baseline gap-1.5">
                  {a.entityKind === "out_of_domain" ? (
                    <Badge tone="neutral">out of domain</Badge>
                  ) : (
                    <>
                      <span className="break-all font-mono text-[11.5px] text-muted">{a.symbol}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">{a.entityKind}</span>
                    </>
                  )}
                </span>
                <span className="truncate font-mono text-[10px] text-faint">{a.repoName ? short(a.repoName) : "—"}</span>
                <span className="font-mono text-[10px] text-faint md:text-right">{relTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
