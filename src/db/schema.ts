import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const repositories = pgTable("repositories", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull().unique(),
  name: text("name").notNull(),
  provider: text("provider").notNull().default("github"), // github | demo
  description: text("description").notNull().default(""),
  language: text("language").notNull().default("TypeScript"),
  isPrivate: boolean("is_private").notNull().default(false),
  defaultBranch: text("default_branch").notNull().default("main"),
  packageName: text("package_name"),
  htmlUrl: text("html_url"),
  branches: jsonb("branches").$type<string[]>().notNull().default([]),
  commits: jsonb("commits")
    .$type<{ sha: string; message: string; author: string; date: string }[]>()
    .notNull()
    .default([]),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sourceFiles = pgTable(
  "source_files",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    content: text("content").notNull(),
    parsed: jsonb("parsed"),
  },
  (t) => [unique("source_files_repo_path").on(t.repoId, t.path)],
);

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: serial("id").primaryKey(),
    repoId: integer("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    author: text("author").notNull().default("unknown"),
    baseBranch: text("base_branch").notNull().default("main"),
    headBranch: text("head_branch").notNull().default("feature"),
    headSha: text("head_sha").notNull().default(""),
    status: text("status").notNull().default("open"),
    riskScore: integer("risk_score").notNull().default(0),
    riskLevel: text("risk_level").notNull().default("low"),
    analysis: jsonb("analysis"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    analyzedAt: timestamp("analyzed_at"),
  },
  (t) => [unique("pull_requests_repo_number").on(t.repoId, t.number)],
);

export const prFiles = pgTable("pr_files", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  path: text("path").notNull(),
  status: text("status").notNull().default("modified"), // added | modified | removed
  content: text("content"),
});

export const fixReviews = pgTable(
  "fix_reviews",
  {
    id: serial("id").primaryKey(),
    prId: integer("pr_id")
      .notNull()
      .references(() => pullRequests.id, { onDelete: "cascade" }),
    fixId: text("fix_id").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | rejected
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("fix_reviews_pr_fix").on(t.prId, t.fixId)],
);

export const prComments = pgTable("pr_comments", {
  id: serial("id").primaryKey(),
  prId: integer("pr_id")
    .notNull()
    .references(() => pullRequests.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  postedTo: text("posted_to").notNull().default("preview"), // preview | github
  url: text("url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Inputs the resolver refused to route, kept until a judge maps or rejects them. */
export const quarantinedInputs = pgTable(
  "quarantined_inputs",
  {
    id: serial("id").primaryKey(),
    raw: text("raw").notNull(),
    normalized: text("normalized").notNull(),
    bucket: text("bucket").notNull().default("low_confidence"), // out_of_domain | low_confidence | ambiguous
    status: text("status").notNull().default("pending"), // pending | mapped | rejected
    confidence: integer("confidence").notNull().default(0), // 0-100
    margin: integer("margin").notNull().default(0), // 0-100
    reason: text("reason").notNull().default(""),
    contextKey: text("context_key").notNull().default(""),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    candidates: jsonb("candidates").$type<unknown[]>().notNull().default([]),
    mappedTo: jsonb("mapped_to").$type<Record<string, unknown> | null>(),
    seenCount: integer("seen_count").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [unique("quarantined_input_key").on(t.normalized, t.contextKey)],
);

/** One-shot labels from a judge: an input surface form and the target it maps to. */
export const entityAliases = pgTable("entity_aliases", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  raw: text("raw").notNull(),
  entityKind: text("entity_kind").notNull(), // function | ... | dependency | out_of_domain
  repoId: integer("repo_id"),
  repoName: text("repo_name"),
  file: text("file"),
  symbol: text("symbol"),
  label: text("label"),
  vector: jsonb("vector").$type<number[]>().notNull(),
  source: text("source").notNull().default("judge"),
  quarantineId: integer("quarantine_id"),
  hits: integer("hits").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
