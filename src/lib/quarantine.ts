import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entityAliases, quarantinedInputs } from "@/db/schema";
import { loadContext } from "./context";
import { getCacheVersion } from "./store";
import { buildCatalog, type EntityKind, type EntityRef } from "./resolver/catalog";
import { aliasKey, embed, roundVector, EMBED_DIMS } from "./resolver/embed";
import {
  buildIndex,
  kindsForAction,
  resolveQuery,
  THRESHOLDS,
  type EntityIndex,
  type LearnedEntry,
  type Resolution,
  type ResolveTiming,
} from "./resolver/resolve";
import { getThresholds } from "./resolver/thresholds";
import { recordEvent, toMatchViews } from "./resolver/telemetry";
import type { BoardData, EntityOption, MappedTarget, QuarantineRowView, AliasView } from "./quarantine-types";

/**
 * The vector store lives in this process. The catalog (one vector per surface form of every
 * routable entity) is rebuilt only when the project graph changes. Judge labels are loaded
 * from Postgres once and then appended in place, which is what makes a label visible to the
 * very next request without a restart or a cache purge.
 */
type ResolverStore = {
  version: number;
  entities: EntityRef[];
  index: EntityIndex;
  learned: LearnedEntry[];
};

const globalForResolver = globalThis as typeof globalThis & {
  __devImpactResolver?: ResolverStore;
};

const OUT_OF_DOMAIN = "out_of_domain";

async function loadLearned(entities: EntityRef[]): Promise<LearnedEntry[]> {
  const rows = await db.select().from(entityAliases);
  const byId = new Map(entities.map((e) => [e.id, e]));
  const out: LearnedEntry[] = [];
  for (const row of rows) {
    const vector = Array.isArray(row.vector) ? (row.vector as number[]) : [];
    if (vector.length !== EMBED_DIMS) continue; // embedding model changed; the label is re-mappable
    const ref = row.entityKind === OUT_OF_DOMAIN ? null : (byId.get(`${row.entityKind}|${row.repoId}|${row.file}|${row.symbol}`) ?? null);
    // A stale alias pointing at a repository that no longer exists is ignored rather than
    // silently routed into an empty target.
    if (row.entityKind !== OUT_OF_DOMAIN && !ref) continue;
    out.push({
      key: row.key,
      raw: row.raw,
      vec: Float32Array.from(vector),
      ref,
      rejected: row.entityKind === OUT_OF_DOMAIN,
      scopeRepoId: row.repoId ?? null,
    });
  }
  return out;
}

export async function getResolver(): Promise<ResolverStore> {
  const { graph } = await loadContext();
  const version = getCacheVersion();
  const current = globalForResolver.__devImpactResolver;
  if (current && current.version === version) return current;

  const entities = buildCatalog(graph);
  const index = buildIndex(entities);
  const loaded = await loadLearned(entities);

  // Merge labels registered while the graph was being rebuilt, so a concurrent mapping
  // is never dropped from the in-process store.
  const merged = new Map(loaded.map((l) => [l.key, l]));
  for (const l of current?.learned ?? []) merged.set(l.key, l);

  const store: ResolverStore = { version, entities, index, learned: [...merged.values()] };
  globalForResolver.__devImpactResolver = store;
  return store;
}

export interface StoredResolution extends Resolution {
  quarantineId: number | null;
}

export interface ResolveOptions {
  repoId?: number;
  kinds?: EntityKind[];
  context?: Record<string, unknown>;
  persist?: boolean;
}

export async function resolveInput(raw: string, opts: ResolveOptions = {}): Promise<StoredResolution> {
  const store = await getResolver();
  const thresholds = getThresholds();
  const timing: ResolveTiming = { embedMs: 0, retrieveMs: 0 };

  const startedAt = performance.now();
  const resolution = resolveQuery(store.index, store.learned, raw, {
    kinds: opts.kinds,
    repoId: opts.repoId,
    thresholds,
    timing,
  });
  const totalMs = performance.now() - startedAt;
  const decided: Resolution = { ...resolution, timing: { ...timing, totalMs } };

  let quarantineId: number | null = null;
  if (decided.status === "refused" && !decided.learned && opts.persist !== false) {
    quarantineId = await recordQuarantine(raw, decided, opts);
  }

  // Telemetry is recorded for refusals too: a refusal is a decision the inspector must show.
  recordEvent({
    source: typeof opts.context?.source === "string" ? opts.context.source : "resolver",
    action: typeof opts.context?.action === "string" ? opts.context.action : null,
    query: decided.query,
    normalized: decided.normalized,
    repoId: opts.repoId ?? null,
    status: decided.status,
    bucket: decided.bucket,
    entity: decided.entity
      ? {
          id: decided.entity.id,
          symbol: decided.entity.symbol,
          kind: decided.entity.kind,
          repoName: decided.entity.repoName,
          file: decided.entity.file,
        }
      : null,
    confidence: decided.confidence,
    margin: decided.margin,
    reason: decided.reason,
    learned: decided.learned,
    quarantineId,
    matchCount: decided.candidates.length,
    matches: toMatchViews(decided.candidates, 3),
    timing: decided.timing!,
    thresholds,
  });

  return { ...decided, quarantineId };
}

function contextKey(opts: ResolveOptions): string {
  return [opts.repoId ?? "", (opts.kinds ?? []).join("+"), String(opts.context?.action ?? ""), String(opts.context?.source ?? "")].join("|");
}

async function recordQuarantine(raw: string, resolution: Resolution, opts: ResolveOptions): Promise<number> {
  const key = contextKey(opts);
  const values = {
    raw: raw.slice(0, 500),
    normalized: resolution.normalized.toLowerCase().slice(0, 500),
    bucket: resolution.bucket ?? "low_confidence",
    confidence: Math.round(resolution.confidence * 100),
    margin: Math.round(resolution.margin * 100),
    reason: resolution.reason,
    contextKey: key,
    context: { ...opts.context, repoId: opts.repoId ?? null, kinds: opts.kinds ?? [] },
    candidates: resolution.candidates,
    lastSeenAt: new Date(),
  };
  const [row] = await db
    .insert(quarantinedInputs)
    .values(values)
    .onConflictDoUpdate({
      target: [quarantinedInputs.normalized, quarantinedInputs.contextKey],
      // Keep the review status: a mapped or rejected input that is refused again must not
      // reappear in the judge's pending queue.
      set: { ...values, seenCount: sql`${quarantinedInputs.seenCount} + 1` },
    })
    .returning({ id: quarantinedInputs.id });
  return row.id;
}

async function markRow(id: number, status: "mapped" | "rejected", target: MappedTarget | null) {
  await db
    .update(quarantinedInputs)
    .set({ status, mappedTo: target as unknown as Record<string, unknown> | null, resolvedAt: new Date() })
    .where(eq(quarantinedInputs.id, id));
}

export type LabelResult =
  | { ok: true; entity: EntityRef | null; key: string; raw: string; board: BoardData }
  | { ok: false; error: string; status: number };

export async function mapQuarantine(id: number, entityId: string): Promise<LabelResult> {
  const store = await getResolver();
  const [row] = await db.select().from(quarantinedInputs).where(eq(quarantinedInputs.id, id));
  if (!row) return { ok: false, error: "Quarantine entry not found.", status: 404 };

  const entity = store.entities.find((e) => e.id === entityId);
  if (!entity) return { ok: false, error: "That target is not in the current project graph.", status: 400 };

  const context = (row.context ?? {}) as { repoId?: number | null; action?: string | null };
  if (context.repoId && context.repoId !== entity.repoId) {
    return {
      ok: false,
      error: `This input was scoped to another repository, so an alias to ${entity.repoName} could never route here.`,
      status: 400,
    };
  }
  if (context.action) {
    const allowed = kindsForAction(context.action);
    if (!allowed.includes(entity.kind)) {
      return {
        ok: false,
        error: `\`${context.action.replace(/_/g, " ")}\` cannot target a ${entity.kind}. Pick a compatible target.`,
        status: 400,
      };
    }
  }

  await teach(row.raw, entity, id, entity.repoId);
  const target: MappedTarget = { id: entity.id, symbol: entity.symbol, kind: entity.kind, repoName: entity.repoName, file: entity.file };
  await markRow(id, "mapped", target);

  return { ok: true, entity, key: aliasKey(row.raw), raw: row.raw, board: await loadBoard() };
}

export async function rejectQuarantine(id: number): Promise<LabelResult> {
  const [row] = await db.select().from(quarantinedInputs).where(eq(quarantinedInputs.id, id));
  if (!row) return { ok: false, error: "Quarantine entry not found.", status: 404 };

  const context = (row.context ?? {}) as { repoId?: number | null };
  await teach(row.raw, null, id, context.repoId ?? null);
  await markRow(id, "rejected", null);

  return { ok: true, entity: null, key: aliasKey(row.raw), raw: row.raw, board: await loadBoard() };
}

/**
 * Persist the label, then put it into the live vector store. The DB write makes it survive a
 * restart; the in-process append makes the next request resolve without one.
 */
async function teach(raw: string, ref: EntityRef | null, quarantineId: number | null, scopeRepoId: number | null) {
  const key = aliasKey(raw);
  const vector = roundVector(embed(raw));
  const values = {
    key,
    raw: raw.slice(0, 500),
    entityKind: ref?.kind ?? OUT_OF_DOMAIN,
    repoId: scopeRepoId ?? ref?.repoId ?? null,
    repoName: ref?.repoName ?? null,
    file: ref?.file ?? null,
    symbol: ref?.symbol ?? null,
    label: ref?.label ?? null,
    vector,
    source: "judge",
    quarantineId,
  };
  await db
    .insert(entityAliases)
    .values(values)
    .onConflictDoUpdate({ target: entityAliases.key, set: { ...values, hits: 0 } });

  const store = await getResolver();
  const entry: LearnedEntry = { key, raw, vec: embed(raw), ref, rejected: !ref, scopeRepoId };
  store.learned = [...store.learned.filter((l) => l.key !== key), entry];
}

function rowView(row: typeof quarantinedInputs.$inferSelect): QuarantineRowView {
  return {
    id: row.id,
    raw: row.raw,
    normalized: row.normalized,
    bucket: row.bucket,
    status: row.status,
    confidence: row.confidence,
    margin: row.margin,
    reason: row.reason,
    candidates: (row.candidates ?? []) as QuarantineRowView["candidates"],
    context: (row.context ?? {}) as QuarantineRowView["context"],
    mappedTo: (row.mappedTo as MappedTarget | null) ?? null,
    seenCount: row.seenCount,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export async function loadBoard(): Promise<BoardData> {
  const store = await getResolver();
  const [rows, aliases, statusCounts, aliasCount] = await Promise.all([
    db.select().from(quarantinedInputs).orderBy(desc(quarantinedInputs.lastSeenAt)).limit(100),
    db.select().from(entityAliases).orderBy(desc(entityAliases.createdAt)).limit(40),
    db.select({ status: quarantinedInputs.status, n: count() }).from(quarantinedInputs).groupBy(quarantinedInputs.status),
    db.select({ n: count() }).from(entityAliases),
  ]);

  const stats = { pending: 0, mapped: 0, rejected: 0, aliases: Number(aliasCount[0]?.n ?? 0) };
  for (const row of statusCounts) {
    const n = Number(row.n);
    if (row.status === "pending") stats.pending = n;
    else if (row.status === "mapped") stats.mapped = n;
    else if (row.status === "rejected") stats.rejected = n;
  }

  const entities: EntityOption[] = store.entities.map(({ id, kind, repoId, repoName, file, symbol, label, detail }) => ({
    id,
    kind,
    repoId,
    repoName,
    file,
    symbol,
    label,
    detail,
  }));

  const aliasViews: AliasView[] = aliases.map((a) => ({
    id: a.id,
    key: a.key,
    raw: a.raw,
    entityKind: a.entityKind,
    repoId: a.repoId,
    repoName: a.repoName,
    file: a.file,
    symbol: a.symbol,
    label: a.label,
    source: a.source,
    createdAt: a.createdAt.toISOString(),
  }));

  return { rows: rows.map(rowView), aliases: aliasViews, entities, stats, thresholds: getThresholds(), dims: EMBED_DIMS };
}

export { THRESHOLDS };
