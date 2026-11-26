/**
 * Live vector telemetry.
 *
 * Every input that reaches the resolver — from the simulator, the resolve API, a judge's
 * probe, or the automatic replay after a slider move — is recorded here with the three
 * nearest neighbours, their raw cosine scores, the time spent embedding and searching,
 * and the thresholds that were in force for that decision. The buffer is bounded and
 * in-process: it is an inspector, not an audit log.
 */

import type { Candidate } from "./resolve";
import type { ThresholdValues } from "./thresholds";

export interface TelemetryTiming {
  embedMs: number;
  retrieveMs: number;
  totalMs?: number;
}

export interface MatchView {
  rank: number;
  id: string;
  kind: string;
  repoId: number;
  repoName: string;
  file: string;
  symbol: string;
  label: string;
  /** The surface form that produced the score (catalog variant or a judged alias). */
  matched: string;
  /** Raw cosine similarity, four decimals. */
  score: number;
  learned: boolean;
  compatible: boolean;
}

export interface TelemetryEvent {
  id: string;
  at: string;
  source: string;
  query: string;
  normalized: string;
  repoId: number | null;
  action: string | null;
  status: "resolved" | "refused";
  bucket: string | null;
  entity: { id: string; symbol: string; kind: string; repoName: string; file: string } | null;
  confidence: number;
  margin: number;
  reason: string;
  learned: boolean;
  quarantineId: number | null;
  matchCount: number;
  matches: MatchView[];
  timing: TelemetryTiming;
  thresholds: ThresholdValues;
}

export interface TelemetryStats {
  observed: number;
  resolved: number;
  refused: number;
  avgEmbedMs: number;
  avgRetrieveMs: number;
  avgTotalMs: number;
  p95Ms: number;
}

export interface TelemetryFeed {
  events: TelemetryEvent[];
  stats: TelemetryStats;
  capacity: number;
}

const MAX_EVENTS = 60;

type TelemetryStore = {
  seq: number;
  events: TelemetryEvent[];
};

const globalForTelemetry = globalThis as typeof globalThis & {
  __devImpactTelemetry?: TelemetryStore;
};

function store(): TelemetryStore {
  return (globalForTelemetry.__devImpactTelemetry ??= { seq: 0, events: [] });
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The nearest `limit` candidates, preserving the resolver's ordering. */
export function toMatchViews(candidates: Candidate[], limit = 3): MatchView[] {
  return candidates.slice(0, limit).map((c, i) => ({
    rank: i + 1,
    id: c.id,
    kind: c.kind,
    repoId: c.repoId,
    repoName: c.repoName,
    file: c.file,
    symbol: c.symbol,
    label: c.label,
    matched: c.matched,
    score: c.score,
    learned: c.learned,
    compatible: c.compatible,
  }));
}

export function recordEvent(input: Omit<TelemetryEvent, "id" | "at">): TelemetryEvent {
  const s = store();
  s.seq += 1;
  const embedMs = round(input.timing.embedMs);
  const retrieveMs = round(input.timing.retrieveMs);
  const event: TelemetryEvent = {
    ...input,
    id: `evt-${s.seq}`,
    at: new Date().toISOString(),
    timing: {
      embedMs,
      retrieveMs,
      totalMs: round(input.timing.totalMs ?? embedMs + retrieveMs),
    },
  };
  s.events.unshift(event);
  if (s.events.length > MAX_EVENTS) s.events.length = MAX_EVENTS;
  return event;
}

export function getFeed(limit = 40): TelemetryFeed {
  const s = store();
  const take = Math.max(1, Math.min(MAX_EVENTS, Number.isFinite(limit) ? Math.floor(limit) : 40));
  const events = s.events.slice(0, take);

  const observed = s.events.length;
  const totals = s.events.map((e) => e.timing.totalMs ?? 0).sort((a, b) => a - b);
  const sum = (pick: (e: TelemetryEvent) => number) => s.events.reduce((acc, e) => acc + pick(e), 0);

  return {
    events,
    capacity: MAX_EVENTS,
    stats: {
      observed,
      resolved: s.events.filter((e) => e.status === "resolved").length,
      refused: s.events.filter((e) => e.status === "refused").length,
      avgEmbedMs: round(observed ? sum((e) => e.timing.embedMs) / observed : 0),
      avgRetrieveMs: round(observed ? sum((e) => e.timing.retrieveMs) / observed : 0),
      avgTotalMs: round(observed ? sum((e) => e.timing.totalMs ?? 0) / observed : 0),
      p95Ms: round(totals.length ? totals[Math.min(totals.length - 1, Math.floor(totals.length * 0.95))] : 0),
    },
  };
}
