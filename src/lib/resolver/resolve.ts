import { embed, aliasKey, cosine, normalizeQuery } from "./embed";
import type { EntityKind, EntityRef } from "./catalog";
import { DEFAULT_THRESHOLDS, getThresholds, type ThresholdValues } from "./thresholds";

/**
 * Refusal thresholds. They are intentionally explicit and returned with every decision so
 * the UI (and a judge) can see exactly why an input was not routed.
 *
 * - `floor`   below this, nothing is close enough: out of domain.
 * - `auto`    at or above this, a single clear winner is routed without asking.
 * - `margin`  the winner must lead the runner-up by this much, else it is ambiguous.
 * - `learned` similarity to a previously labelled surface form that is enough to route
 *             again. Lower than `auto` because a judge has already vouched for the
 *             neighbourhood, not just for one exact string.
 * - `reject`  similarity to a previously rejected input that is enough to refuse again.
 */
export const THRESHOLDS: ResolutionThresholds = DEFAULT_THRESHOLDS;

export type Bucket = "out_of_domain" | "low_confidence" | "ambiguous";
export type OutcomeStatus = "resolved" | "refused";

export type ResolutionThresholds = ThresholdValues;

/** Filled in by the caller's mutable timing object; surfaced by the vector inspector. */
export interface ResolveTiming {
  embedMs: number;
  retrieveMs: number;
  totalMs?: number;
}

export interface Candidate {
  id: string;
  kind: EntityKind;
  repoId: number;
  repoName: string;
  file: string;
  symbol: string;
  label: string;
  score: number;
  matched: string;
  learned: boolean;
  compatible: boolean;
}

export interface LearnedEntry {
  key: string;
  raw: string;
  vec: Float32Array;
  /** null means the judge labelled the input as out of domain. */
  ref: EntityRef | null;
  rejected: boolean;
  /**
   * A refusal made inside one repository says nothing about the other repositories:
   * `chargeCustomer` is unknown in user-service but real in billing-service. Scoped
   * refusals are therefore ignored for project-wide resolution and other repos.
   */
  scopeRepoId: number | null;
}

export interface EntityIndex {
  entities: EntityRef[];
  slots: { owner: number; text: string; vec: Float32Array }[];
  byId: Map<string, number>;
}

export interface Resolution {
  query: string;
  normalized: string;
  status: OutcomeStatus;
  bucket: Bucket | null;
  entity: EntityRef | null;
  /** 0–1 similarity of the winning candidate. */
  confidence: number;
  /** 0–1 lead over the runner-up. */
  margin: number;
  reason: string;
  learned: boolean;
  candidates: Candidate[];
  thresholds: ResolutionThresholds;
  timing?: ResolveTiming;
}

export function buildIndex(entities: EntityRef[]): EntityIndex {
  const slots: EntityIndex["slots"] = [];
  entities.forEach((entity, owner) => {
    for (const text of entity.variants) slots.push({ owner, text, vec: embed(text) });
  });
  return { entities, slots, byId: new Map(entities.map((e, i) => [e.id, i])) };
}

export function kindsForAction(actionType: string): EntityKind[] {
  switch (actionType) {
    case "upgrade_dep":
      return ["dependency"];
    case "route_path":
      return ["route"];
    case "remove_field":
      return ["interface", "type", "enum"];
    case "param_type":
    case "add_param":
    case "return_type":
      return ["function", "method"];
    case "rename":
      // `simulate` rejects route renames, so routes are deliberately absent.
      return ["function", "method", "class", "interface", "type", "enum"];
    default:
      return ["function", "method", "class", "interface", "type", "enum", "route"];
  }
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function resolveQuery(
  index: EntityIndex,
  learned: LearnedEntry[],
  raw: string,
  opts: { kinds?: EntityKind[]; repoId?: number; thresholds?: ResolutionThresholds; timing?: ResolveTiming } = {},
): Resolution {
  const query = raw ?? "";
  const normalized = normalizeQuery(query);
  const key = aliasKey(query);
  const allowed = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : null;
  const visible = (entity: EntityRef) => !opts.repoId || entity.repoId === opts.repoId;
  const compatibleKind = (kind: EntityKind) => !allowed || allowed.has(kind);

  // Read the live thresholds rather than a compile-time constant: moving the inspector's
  // slider changes this very decision.
  const th = opts.thresholds ?? getThresholds();

  // Time the search separately from the embedding so the inspector can show both halves.
  const score = (queryVec: Float32Array) => {
    const started = performance.now();
    const out = scoreCandidates(index, queryVec, learned, visible, compatibleKind);
    if (opts.timing) opts.timing.retrieveMs += performance.now() - started;
    return out;
  };

  const refused = (bucket: Bucket, reason: string, candidates: Candidate[], confidence = 0, margin = 0): Resolution => ({
    query,
    normalized,
    status: "refused",
    bucket,
    entity: null,
    confidence,
    margin,
    reason,
    learned: false,
    candidates,
    thresholds: th,
  });

  if (!normalized) {
    return refused("out_of_domain", "Empty input — nothing to route.", []);
  }

  const embedStarted = performance.now();
  const q = embed(query);
  if (opts.timing) opts.timing.embedMs += performance.now() - embedStarted;

  // A scoped refusal only applies to the repo it was made in (or to every repo when the
  // judge rejected the input project-wide).
  const refusalApplies = (l: LearnedEntry) =>
    l.scopeRepoId === null || (opts.repoId !== undefined && l.scopeRepoId === opts.repoId);

  // Rejections are checked first: a judge has already declared this neighbourhood unknown,
  // so a lexical neighbour in the catalog must not override that decision.
  const exactRejection = learned.find((l) => l.rejected && refusalApplies(l) && l.key === key);
  if (exactRejection) {
    const candidates = score(q);
    return { ...refused("out_of_domain", "Previously labelled out of domain by a judge.", candidates.slice(0, 5)), learned: true };
  }
  let bestRejection = 0;
  for (const l of learned) if (l.rejected && refusalApplies(l)) bestRejection = Math.max(bestRejection, cosine(q, l.vec));
  if (bestRejection >= th.reject) {
    const candidates = score(q);
    return {
      ...refused("out_of_domain", `Matches a previously rejected input at ${pct(bestRejection)} similarity.`, candidates.slice(0, 5)),
      learned: true,
    };
  }

  const candidates = score(q);

  // Exact surface-form match. `getUser` and the route `GET /users` collapse to nearly
  // the same stems, so a fuzzy score alone would call a perfect input ambiguous. When a
  // query is identical (ignoring separators and case) to exactly one routable variant,
  // that is not a guess and does not need a threshold.
  const compact = normalized.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (compact.length >= 3) {
    const owners = new Map<number, string>();
    for (const slot of index.slots) {
      const entity = index.entities[slot.owner];
      if (!visible(entity) || !compatibleKind(entity.kind)) continue;
      if (slot.text.toLowerCase().replace(/[^a-z0-9]/g, "") !== compact) continue;
      if (!owners.has(slot.owner)) owners.set(slot.owner, slot.text);
    }
    if (owners.size === 1) {
      const [[owner, matched]] = [...owners.entries()];
      const entity = index.entities[owner];
      const rest = candidates.filter((c) => c.id !== entity.id);
      return {
        query,
        normalized,
        status: "resolved",
        bucket: null,
        entity,
        confidence: 1,
        margin: rest[0] ? Math.max(0, 1 - rest[0].score) : 1,
        reason: `Exact surface match on \`${matched}\`.`,
        learned: false,
        candidates: [toCandidate(entity, 1, matched, false, true), ...rest].slice(0, 5),
        thresholds: th,
      };
    }
    if (owners.size > 1) {
      const shared = candidates.filter((c) => owners.has(index.byId.get(c.id)!));
      return refused(
        "ambiguous",
        `${owners.size} routable entities share this exact surface form; pick one.`,
        shared.length ? shared : candidates.slice(0, 5),
        1,
        0,
      );
    }
  }

  const exact = learned.find((l) => !l.rejected && l.key === key && l.ref && index.byId.has(l.ref.id) && visible(l.ref));
  if (exact?.ref) {
    if (!compatibleKind(exact.ref.kind)) {
      return refused(
        "low_confidence",
        `This input was previously mapped to \`${exact.ref.symbol}\` (${exact.ref.kind}), which this action cannot target.`,
        candidates.slice(0, 5),
        1,
      );
    }
    const pos = index.byId.get(exact.ref.id)!;
    const learnedCandidate: Candidate = toCandidate(index.entities[pos], 1, exact.raw, true, true);
    return {
      query,
      normalized,
      status: "resolved",
      bucket: null,
      entity: exact.ref,
      confidence: 1,
      margin: 1,
      reason: `Exact learned alias from a previous judge label.`,
      learned: true,
      candidates: [learnedCandidate, ...candidates.filter((c) => c.id !== exact.ref!.id)].slice(0, 5),
      thresholds: th,
    };
  }

  const compatible = candidates.filter((c) => c.compatible);
  const top = compatible[0];
  const second = compatible[1];
  const nearest = candidates[0];

  if (!top) {
    const reason = nearest
      ? `Closest match is \`${nearest.symbol}\` (${nearest.kind}), which this action cannot target.`
      : "This repository has no routable targets for that action.";
    return refused("low_confidence", reason, candidates.slice(0, 5), nearest?.score ?? 0);
  }

  const margin = second ? Math.max(0, top.score - second.score) : top.score;
  const base = {
    query,
    normalized,
    candidates: candidates.slice(0, 5),
    thresholds: th,
    confidence: top.score,
    margin,
  };

  if (top.score < th.floor) {
    return {
      ...base,
      status: "refused",
      bucket: "out_of_domain",
      entity: null,
      learned: false,
      reason: `No target reaches the ${pct(th.floor)} similarity floor (best ${pct(top.score)}).`,
    };
  }

  if (top.learned && top.score >= th.learned) {
    const entity = index.entities[index.byId.get(top.id)!];
    if (entity) {
      return {
        ...base,
        status: "resolved",
        bucket: null,
        entity,
        learned: true,
        reason: `Similar to a previously labelled input (${pct(top.score)}); routed without asking.`,
      };
    }
  }

  if (top.score < th.auto) {
    return {
      ...base,
      status: "refused",
      bucket: "low_confidence",
      entity: null,
      learned: false,
      reason: `Best match is ${pct(top.score)} similar — below the ${pct(th.auto)} auto-resolve threshold.`,
    };
  }

  if (second && margin < th.margin) {
    return {
      ...base,
      status: "refused",
      bucket: "ambiguous",
      entity: null,
      learned: false,
      reason: `${compatible.filter((c) => top.score - c.score < th.margin).length} targets sit within ${pct(th.margin)} of each other.`,
    };
  }

  const entity = index.entities[index.byId.get(top.id)!];
  return {
    ...base,
    status: "resolved",
    bucket: null,
    entity,
    learned: top.learned,
    reason: `Matched \`${top.matched}\` at ${pct(top.score)} similarity.`,
  };
}

function toCandidate(entity: EntityRef, score: number, matched: string, learned: boolean, compatible: boolean): Candidate {
  return {
    id: entity.id,
    kind: entity.kind,
    repoId: entity.repoId,
    repoName: entity.repoName,
    file: entity.file,
    symbol: entity.symbol,
    label: entity.label,
    score: Math.round(score * 10000) / 10000,
    matched,
    learned,
    compatible,
  };
}

function scoreCandidates(
  index: EntityIndex,
  q: Float32Array,
  learned: LearnedEntry[],
  visible: (e: EntityRef) => boolean,
  compatibleKind: (k: EntityKind) => boolean,
): Candidate[] {
  const best = new Map<number, { score: number; matched: string; learned: boolean }>();

  for (const slot of index.slots) {
    const entity = index.entities[slot.owner];
    if (!visible(entity)) continue;
    const score = cosine(q, slot.vec);
    const cur = best.get(slot.owner);
    if (!cur || score > cur.score) best.set(slot.owner, { score, matched: slot.text, learned: false });
  }

  for (const entry of learned) {
    if (entry.rejected || !entry.ref) continue;
    const owner = index.byId.get(entry.ref.id);
    if (owner === undefined) continue;
    if (!visible(index.entities[owner])) continue;
    const score = cosine(q, entry.vec);
    const cur = best.get(owner);
    if (!cur || score > cur.score) best.set(owner, { score, matched: entry.raw, learned: true });
  }

  return [...best.entries()]
    .map(([owner, hit]) => toCandidate(index.entities[owner], hit.score, hit.matched, hit.learned, compatibleKind(index.entities[owner].kind)))
    .filter((c) => c.score > 0.05)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
