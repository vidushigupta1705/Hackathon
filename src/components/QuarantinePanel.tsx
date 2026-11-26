"use client";

import { useState } from "react";
import { IconCheck } from "./Icons";
import { Badge, Bar, btn, field } from "./ui";
import type { BoardData, EntityOption } from "@/lib/quarantine-types";
import type { Resolution } from "@/lib/resolver/resolve";

const BUCKETS: Record<string, { label: string; tone: string }> = {
  out_of_domain: { label: "unknown · out of domain", tone: "danger" },
  low_confidence: { label: "low confidence", tone: "warn" },
  ambiguous: { label: "ambiguous", tone: "warn" },
};

const shortRepo = (name: string) => name.split("/").pop() ?? name;

/**
 * Shown whenever the resolver refuses. The judge either confirms a scored candidate / picks
 * another target, or declares the input out of domain. Both paths store an alias and update
 * the live vector store before the response returns.
 */
export default function QuarantinePanel({
  resolution,
  quarantineId,
  entities,
  onChanged,
  onMapped,
  dense = false,
  showHeader = true,
}: {
  resolution: Resolution;
  quarantineId: number | null;
  entities: EntityOption[];
  onChanged?: (board: BoardData) => void;
  onMapped?: (entity: EntityOption) => void;
  dense?: boolean;
  /** The bucket row already prints the input, bucket and score; avoid repeating them. */
  showHeader?: boolean;
}) {
  const first = resolution.candidates.find((c) => c.compatible) ?? resolution.candidates[0];
  const [pick, setPick] = useState(first?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"mapped" | "rejected" | null>(null);
  const [learned, setLearned] = useState("");

  const bucket = resolution.bucket ?? "low_confidence";
  const meta = BUCKETS[bucket] ?? { label: bucket.replace(/_/g, " "), tone: "neutral" };
  const chosen = entities.find((e) => e.id === pick);

  async function label(action: "map" | "reject") {
    if (!quarantineId) {
      setError("This refusal has no quarantine row, so it cannot be labelled.");
      return;
    }
    setBusy(true);
    setError("");
    const body = action === "map" ? { id: quarantineId, action, entityId: pick } : { id: quarantineId, action };
    const r = await fetch("/api/quarantine", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) {
      setError(j.error ?? "Could not save that label.");
      return;
    }
    setDone(action === "map" ? "mapped" : "rejected");
    setLearned(j.learned?.raw ?? resolution.query);
    if (j.board) onChanged?.(j.board as BoardData);
    if (action === "map") {
      const entity = (j.entity as EntityOption | null) ?? chosen ?? null;
      if (entity) onMapped?.(entity);
    }
  }

  return (
    <div className={dense ? "border-t border-line" : "rounded-[6px] border border-warn/30 bg-warn/[0.035]"}>
      {showHeader && (
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 md:px-5">
          <div className="min-w-0">
            <div className="eyebrow mb-2 text-warn/80">quarantined · not routed</div>
            <div className="break-all font-mono text-[12.5px] leading-relaxed text-fg">{resolution.query || "(empty input)"}</div>
            <p className="mt-1.5 max-w-2xl text-[11.5px] leading-relaxed text-muted">{resolution.reason}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Badge tone="neutral">
              <span className="num">{Math.round(resolution.confidence * 100)}</span>% closest
            </Badge>
          </div>
        </div>
      )}

      {done ? (
        <div className="flex items-start gap-2 border-t border-line px-4 py-3 md:px-5">
          <IconCheck size={14} className={done === "mapped" ? "mt-0.5 shrink-0 text-ok" : "mt-0.5 shrink-0 text-muted"} />
          <p className="text-[11.5px] leading-relaxed text-muted">
            {done === "mapped" ? (
              <>
                <span className="text-fg">Mapped once.</span> Alias <span className="font-mono text-fg">{learned}</span> →{" "}
                <span className="font-mono text-fg">{chosen?.symbol ?? "target"}</span> is in the live vector store. Similar inputs now
                route without a restart.
              </>
            ) : (
              <>
                <span className="text-fg">Recorded as out of domain.</span> Near-identical inputs will be refused immediately instead of
                scoring candidates again.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="border-t border-line">
            <fieldset>
              <legend className="eyebrow px-4 pt-3 md:px-5">candidates · cosine similarity</legend>
              <ul className="mt-1">
                {resolution.candidates.length === 0 && (
                  <li className="px-4 py-3 font-mono text-[10.5px] text-faint md:px-5">No entity scored above noise.</li>
                )}
                {resolution.candidates.map((c) => (
                  <li key={c.id} className={`border-t border-line/60 first:border-t-0 ${c.compatible ? "" : "opacity-55"}`}>
                    <label className="flex cursor-pointer items-start gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.025] md:px-5">
                      <input
                        type="radio"
                        name={`pick-${quarantineId ?? "probe"}`}
                        value={c.id}
                        checked={pick === c.id}
                        onChange={() => setPick(c.id)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#c8f542]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="break-all font-mono text-[11.5px] text-fg">{c.symbol}</span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-faint">{c.kind}</span>
                          {c.learned && <Badge tone="accent">learned</Badge>}
                          {!c.compatible && <Badge tone="neutral">wrong kind</Badge>}
                        </span>
                        <span className="mt-0.5 block break-all font-mono text-[10px] text-faint">
                          {shortRepo(c.repoName)} · {c.file}
                          {c.matched !== c.symbol ? ` · matched “${c.matched}”` : ""}
                        </span>
                      </span>
                      <span className="w-16 shrink-0 text-right">
                        <span className="num block text-[12px] text-fg">{Math.round(c.score * 100)}%</span>
                        <span className="mt-1 block">
                          <Bar value={c.score * 100} max={100} tone={c.id === first?.id ? "accent" : "neutral"} />
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </div>

          <div className="space-y-3 border-t border-line px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={btn.primary} disabled={busy || !pick} onClick={() => label("map")}>
                {busy ? "Saving…" : "Map once & remember"}
              </button>
              <button type="button" className={btn.secondary} disabled={busy} onClick={() => label("reject")}>
                This is out of domain
              </button>
              <span className="font-mono text-[10px] text-faint">
                floor {Math.round(resolution.thresholds.floor * 100)}% · auto {Math.round(resolution.thresholds.auto * 100)}% · margin{" "}
                {Math.round(resolution.thresholds.margin * 100)} pts · learned {Math.round(resolution.thresholds.learned * 100)}%
              </span>
            </div>
            <details className="group">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.14em] text-faint transition-colors hover:text-muted">
                pick another target
              </summary>
              <label className="mt-2 block">
                <span className="sr-only">Map to another target</span>
                <select className={field} value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Select an entity…</option>
                  {[...new Set(entities.map((e) => e.repoName))].map((repo) => (
                    <optgroup key={repo} label={repo}>
                      {entities
                        .filter((e) => e.repoName === repo)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.symbol} · {e.kind} · {e.file}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            </details>
            {error && <p className="font-mono text-[10.5px] text-danger">{error}</p>}
          </div>
        </>
      )}
    </div>
  );
}

