import type { Candidate } from "./resolver/resolve";
import type { EntityKind } from "./resolver/catalog";
import type { ThresholdValues } from "./resolver/thresholds";

export type Thresholds = ThresholdValues;

export interface EntityOption {
  id: string;
  kind: EntityKind;
  repoId: number;
  repoName: string;
  file: string;
  symbol: string;
  label: string;
  detail: string;
}

export interface MappedTarget {
  id: string;
  symbol: string;
  kind: EntityKind;
  repoName: string;
  file: string;
}

export interface QuarantineRowView {
  id: number;
  raw: string;
  normalized: string;
  bucket: string;
  status: string;
  /** 0–100, as stored. */
  confidence: number;
  /** 0–100, as stored. */
  margin: number;
  reason: string;
  candidates: Candidate[];
  context: { repoId?: number | null; repoName?: string | null; action?: string | null; source?: string | null };
  mappedTo: MappedTarget | null;
  seenCount: number;
  createdAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
}

export interface AliasView {
  id: number;
  key: string;
  raw: string;
  entityKind: string;
  repoId: number | null;
  repoName: string | null;
  file: string | null;
  symbol: string | null;
  label: string | null;
  source: string;
  createdAt: string;
}

export interface QuarantineStats {
  pending: number;
  mapped: number;
  rejected: number;
  aliases: number;
}

export interface BoardData {
  rows: QuarantineRowView[];
  aliases: AliasView[];
  entities: EntityOption[];
  stats: QuarantineStats;
  thresholds: Thresholds;
  dims: number;
}
