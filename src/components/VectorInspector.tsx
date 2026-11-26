"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Bar, Card, CardHeader, btn } from "./ui";
import type { Thresholds } from "@/lib/quarantine-types";
import type { TelemetryEvent, TelemetryFeed } from "@/lib/resolver/telemetry";

const SLIDERS: { key: keyof Thresholds; label: string; hint: string }[] = [
  { key: "floor", label: "similarity floor", hint: "Below this nothing is close enough: out of domain." },
  { key: "auto", label: "route threshold", hint: "A clear winner at or above this routes without asking." },
  { key: "margin", label: "winner margin", hint: "Lead the winner needs over the runner-up, in points." },
  { key: "learned", label: "learned alias gate", hint: "Similarity to a judged label that is enough to route." },
  { key: "reject", label: "rejection hold", hint: "Similarity to a rejected input that refuses again." },
];

const BOUNDS: Record<keyof Thresholds, [number, number]> = {
  floor: [10, 90],
  auto: [50, 99],
  margin: [0, 30],
  learned: [40, 99],
  reject: [50, 100],
};

const EMPTY: TelemetryFeed = {
  events: [],
  capacity: 60,
  stats: { observed: 0, resolved: 0, refused: 0, avgEmbedMs: 0, avgRetrieveMs: 0, avgTotalMs: 0, p95Ms: 0 },
};

const shortRepo = (name: string) => name.split("/").pop() ?? name;
const ms = (n?: number) => `${(n ?? 0).toFixed(2)} ms`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false });
const bucketLabel = (bucket: string | null) =>
  bucket === "out_of_domain" ? "unknown" : (bucket ?? "refused").replace(/_/g, " ");

type Replay = { query: string; status: string; bucket: string | null; confidence: number; entity: string | null };

/**
 * Vector inspector: the resolver seen from the inside.
 *
 * Left: every processed input with its three nearest neighbours, their raw cosine score and
 * the embedding/search/total milliseconds. Right: threshold sliders bound to the live
 * in-process policy — moving one changes the next lookup, and the last input is re-run so the
 * change is visible on the spot.
 */
export default function VectorInspector({
  dims,
  thresholds,
  onThresholdsChange,
}: {
  dims: number;
  thresholds: Thresholds;
  onThresholdsChange: (next: Thresholds) => void;
}) {
  const [feed, setFeed] = useState<TelemetryFeed>(EMPTY);
  const [draft, setDraft] = useState<Partial<Record<keyof Thresholds, number>> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [replay, setReplay] = useState<Replay | null>(null);

  const eventsRef = useRef<TelemetryEvent[]>([]);
  eventsRef.current = feed.events;
  const notify = useRef(onThresholdsChange);
  notify.current = onThresholdsChange;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/telemetry?limit=40", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as TelemetryFeed;
      setFeed({ events: j.events ?? [], stats: j.stats ?? EMPTY.stats, capacity: j.capacity ?? EMPTY.capacity });
    } catch {
      // Transient: the next poll retries.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 2500);
    return () => {
      clearInterval(id);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  /** Re-run the most recent input under the new thresholds, so the change is observable. */
  const replayLast = useCallback(async () => {
    const last = eventsRef.current[0];
    if (!last) return;
    try {
      const r = await fetch("/api/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query: last.query,
          repoId: last.repoId ?? undefined,
          action: last.action ?? undefined,
          persist: false,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!j) return;
      setReplay({
        query: last.query,
        status: j.status,
        bucket: j.bucket ?? null,
        confidence: j.confidence ?? 0,
        entity: j.entity?.symbol ?? null,
      });
      void refresh();
    } catch {
      // The previous replay note stays; the next change retries.
    }
  }, [refresh]);

  async function commit(patch: Partial<Record<keyof Thresholds, number>>) {
    setSaving(true);
    setError("");
    const body: Record<string, number> = {};
    for (const [key, pct] of Object.entries(patch)) if (pct !== undefined) body[key] = pct / 100;
    try {
      const r = await fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "Could not apply that threshold.");
        setDraft(null);
        return;
      }
      notify.current(j.thresholds as Thresholds);
      setDraft(null);
      await replayLast();
    } finally {
      setSaving(false);
    }
  }

  function slide(key: keyof Thresholds, pct: number) {
    const next = { ...(draft ?? {}), [key]: pct };
    setDraft(next);
    setError("");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void commit(next), 180);
  }

  async function reset() {
    setSaving(true);
    setError("");
    try {
      const r = await fetch("/api/telemetry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(j.error ?? "Could not reset the thresholds.");
        return;
      }
      notify.current(j.thresholds as Thresholds);
      setDraft(null);
      await replayLast();
    } finally {
      setSaving(false);
    }
  }

  const valueOf = (key: keyof Thresholds) => draft?.[key] ?? Math.round(thresholds[key] * 100);
  const { stats } = feed;

  return (
    <Card className="overflow-hidden">
      <CardHeader
        eyebrow="vector telemetry"
        title="Vector inspector"
        subtitle={
          <>
            Every processed input is shown with its three nearest neighbours, the raw cosine score that produced each match, and how
            long embedding and retrieval took. The sliders are live: the next lookup uses them, and the last input is re-run so you can
            see the decision flip.
          </>
        }
        right={
          <div className="flex items-center gap-2">
            <Badge tone="accent">
              <span className="num">{dims}</span>-d · live
            </Badge>
            <button type="button" className={btn.quiet} onClick={() => void refresh()}>
              Refresh
            </button>
          </div>
        }
      />

      <div className="grid gap-px border-b border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["observed", String(stats.observed).padStart(2, "0"), `${stats.resolved} routed · ${stats.refused} refused`, "neutral"],
          ["avg embedding", ms(stats.avgEmbedMs), "text → 256-d unit vector", "neutral"],
          ["avg retrieval", ms(stats.avgRetrieveMs), "cosine over catalog + labels", "neutral"],
          ["end to end", ms(stats.avgTotalMs), `p95 ${ms(stats.p95Ms)}`, "accent"],
        ].map(([label, value, note, tone]) => (
          <div key={label} className="bg-panel px-4 py-3 md:px-5">
            <div className="eyebrow">{label}</div>
            <div className={`num mt-2 text-[17px] leading-none ${tone === "accent" ? "text-signal" : "text-fg"}`}>{value}</div>
            <div className="mt-1.5 font-mono text-[10px] text-faint">{note}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5 md:px-5">
            <span className="eyebrow">decision log · newest first</span>
            <span className="font-mono text-[10px] text-faint">
              showing {feed.events.length} of {feed.capacity} kept
            </span>
          </div>
          {feed.events.length === 0 ? (
            <div className="px-4 py-8 md:px-5">
              <p className="font-mono text-[11px] text-faint">No lookups in this process yet.</p>
              <p className="mt-1.5 max-w-md text-[11.5px] leading-relaxed text-muted">
                Route a surface form below, or run something through the simulator, and it will appear here with its scored neighbours
                and timings.
              </p>
            </div>
          ) : (
            <ol className="max-h-[430px] divide-y divide-line overflow-y-auto">
              {feed.events.map((e) => (
                <li key={e.id} className="px-4 py-3 md:px-5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="font-mono text-[10px] tabular-nums text-faint">{clock(e.at)}</span>
                    <Badge tone={e.status === "resolved" ? "ok" : e.bucket === "out_of_domain" ? "danger" : "warn"}>
                      {e.status === "resolved" ? "routed" : bucketLabel(e.bucket)}
                    </Badge>
                    <span className="break-all font-mono text-[11.5px] text-fg">{e.query || "(empty)"}</span>
                    {e.entity && (
                      <>
                        <span className="text-faint">→</span>
                        <span className="break-all font-mono text-[11.5px] text-muted">{e.entity.symbol}</span>
                      </>
                    )}
                    {e.learned && <Badge tone="accent">learned</Badge>}
                    <span className="ml-auto font-mono text-[10px] tabular-nums text-faint">
                      embed {ms(e.timing.embedMs)} · retrieve {ms(e.timing.retrieveMs)} · total {ms(e.timing.totalMs)}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] text-faint">
                    <span>{e.source}</span>
                    <span aria-hidden>·</span>
                    <span>
                      {e.matches.length ? `${Math.min(3, e.matchCount)} nearest` : "no candidates"} · threshold {Math.round(e.thresholds.auto * 100)}%
                      auto / {Math.round(e.thresholds.floor * 100)}% floor
                    </span>
                    {e.status === "refused" && e.quarantineId !== null && (
                      <>
                        <span aria-hidden>·</span>
                        <span>quarantine #{e.quarantineId}</span>
                      </>
                    )}
                  </div>

                  {e.matches.length > 0 ? (
                    <ol className="mt-2 space-y-1.5">
                      {e.matches.map((m) => (
                        <li key={m.id} className="grid grid-cols-[12px_minmax(0,1fr)_66px] items-start gap-2">
                          <span className="pt-0.5 font-mono text-[10px] tabular-nums text-faint">{m.rank}</span>
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-baseline gap-x-1.5">
                              <span className="break-all font-mono text-[11px] text-fg">{m.symbol}</span>
                              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-faint">{m.kind}</span>
                              {m.learned && <Badge tone="accent">learned</Badge>}
                              {!m.compatible && <Badge tone="neutral">wrong kind</Badge>}
                            </span>
                            <span className="mt-0.5 block break-all font-mono text-[9.5px] text-faint">
                              {shortRepo(m.repoName)} · {m.file}
                              {m.matched !== m.symbol ? ` · matched “${m.matched}”` : ""}
                            </span>
                          </span>
                          <span className="w-[66px] shrink-0">
                            <span className="num block text-right font-mono text-[11px] tabular-nums text-fg">{m.score.toFixed(4)}</span>
                            <span className="mt-1 block">
                              <Bar value={m.score * 100} max={100} tone={m.rank === 1 ? "accent" : "neutral"} />
                            </span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="mt-1.5 font-mono text-[10px] text-faint">No candidate scored above noise.</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="border-t border-line px-4 py-4 lg:border-l lg:border-t-0 md:px-5">
          <div className="eyebrow mb-1.5">live thresholds</div>
          <p className="text-[11px] leading-relaxed text-muted">
            Held in memory for this process. A change applies to the next lookup; no rebuild, no restart.
          </p>

          <div className="mt-4 space-y-3.5">
            {SLIDERS.map((s) => {
              const [min, max] = BOUNDS[s.key];
              const pct = valueOf(s.key);
              return (
                <div key={s.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={`threshold-${s.key}`} className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                      {s.label}
                    </label>
                    <span className="num font-mono text-[11px] tabular-nums text-fg">
                      {pct}
                      {s.key === "margin" ? " pts" : "%"}
                    </span>
                  </div>
                  <input
                    id={`threshold-${s.key}`}
                    type="range"
                    min={min}
                    max={max}
                    step={1}
                    value={pct}
                    onChange={(ev) => slide(s.key, Number(ev.target.value))}
                    aria-describedby={`threshold-${s.key}-hint`}
                    className="mt-1.5 w-full cursor-pointer accent-[#c8f542] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
                  />
                  <p id={`threshold-${s.key}-hint`} className="mt-0.5 text-[10px] leading-snug text-faint">
                    {s.hint}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" className={btn.secondary} onClick={() => void reset()} disabled={saving}>
              Reset defaults
            </button>
            <span aria-live="polite" className="font-mono text-[10px] text-faint">
              {saving ? "applying…" : "applied on the next request"}
            </span>
          </div>

          {replay && (
            <div className="mt-3.5 border-t border-line pt-3">
              <div className="eyebrow mb-1">re-ran at the new thresholds</div>
              <p className="break-all font-mono text-[10.5px] leading-relaxed text-muted">{replay.query}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                {replay.status === "resolved" ? (
                  <>
                    routed to <span className="font-mono text-fg">{replay.entity}</span> at{" "}
                    <span className="num text-fg">{(replay.confidence * 100).toFixed(1)}%</span>.
                  </>
                ) : (
                  <>
                    refused — <span className="text-warn">{bucketLabel(replay.bucket)}</span>, best match{" "}
                    <span className="num text-fg">{(replay.confidence * 100).toFixed(1)}%</span>.
                  </>
                )}
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 font-mono text-[10.5px] leading-relaxed text-danger">
              {error}
            </p>
          )}
        </aside>
      </div>
    </Card>
  );
}
