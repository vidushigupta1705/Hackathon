/**
 * Live similarity thresholds.
 *
 * The resolver reads these on every call, so moving a slider changes the very next
 * lookup. They live in the process (not in the build) which is what makes the inspector
 * real-time; a restart returns to the defaults below.
 */

export interface ThresholdValues {
  /** Below this, nothing is close enough: out of domain. */
  floor: number;
  /** At or above this, a single clear winner routes without asking. */
  auto: number;
  /** The winner must lead the runner-up by this much, else it is ambiguous. */
  margin: number;
  /** Similarity to a judged label that is enough to route again. */
  learned: number;
  /** Similarity to a rejected input that is enough to refuse again. */
  reject: number;
}

export const DEFAULT_THRESHOLDS: ThresholdValues = {
  floor: 0.45,
  auto: 0.86,
  margin: 0.04,
  learned: 0.78,
  reject: 0.92,
};

export const THRESHOLD_KEYS: (keyof ThresholdValues)[] = ["floor", "auto", "margin", "learned", "reject"];

export const THRESHOLD_BOUNDS: Record<keyof ThresholdValues, { min: number; max: number; step: number; unit: string }> = {
  floor: { min: 0.1, max: 0.9, step: 0.01, unit: "%" },
  auto: { min: 0.5, max: 0.99, step: 0.01, unit: "%" },
  margin: { min: 0, max: 0.3, step: 0.01, unit: " pts" },
  learned: { min: 0.4, max: 0.99, step: 0.01, unit: "%" },
  reject: { min: 0.5, max: 1, step: 0.01, unit: "%" },
};

type ThresholdStore = {
  current: ThresholdValues;
  updatedAt: string | null;
};

const globalForThresholds = globalThis as typeof globalThis & {
  __devImpactThresholds?: ThresholdStore;
};

function store(): ThresholdStore {
  return (globalForThresholds.__devImpactThresholds ??= {
    current: { ...DEFAULT_THRESHOLDS },
    updatedAt: null,
  });
}

export function getThresholds(): ThresholdValues {
  return { ...store().current };
}

export function getThresholdsUpdatedAt(): string | null {
  return store().updatedAt;
}

export type ThresholdUpdate =
  | { ok: true; thresholds: ThresholdValues }
  | { ok: false; error: string };

/**
 * Apply a partial patch of fractions (0–1). Values are rounded to three decimals — the
 * resolution the sliders offer — and the one relationship that keeps the buckets coherent
 * is enforced: the floor must stay below the route threshold.
 */
export function setThresholds(patch: unknown): ThresholdUpdate {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, error: "Expected a JSON object of threshold values." };
  }
  const input = patch as Record<string, unknown>;
  const next: ThresholdValues = { ...store().current };
  let touched = 0;

  for (const key of THRESHOLD_KEYS) {
    if (!(key in input)) continue;
    const raw = Number(input[key]);
    if (!Number.isFinite(raw)) {
      return { ok: false, error: `\`${key}\` must be a number between 0 and 1.` };
    }
    const value = Math.round(raw * 1000) / 1000;
    const bounds = THRESHOLD_BOUNDS[key];
    if (value < bounds.min || value > bounds.max) {
      return {
        ok: false,
        error: `\`${key}\` must stay between ${bounds.min} and ${bounds.max} (got ${value}).`,
      };
    }
    next[key] = value;
    touched += 1;
  }

  if (touched === 0) {
    return { ok: false, error: "No threshold keys in the request." };
  }
  if (next.floor >= next.auto) {
    return { ok: false, error: "The similarity floor must stay below the route threshold." };
  }

  const target = store();
  target.current = next;
  target.updatedAt = new Date().toISOString();
  return { ok: true, thresholds: { ...next } };
}

export function resetThresholds(): ThresholdValues {
  const target = store();
  target.current = { ...DEFAULT_THRESHOLDS };
  target.updatedAt = new Date().toISOString();
  return { ...target.current };
}
