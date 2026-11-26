-- Out-of-domain quarantine + one-shot learning store.
-- Applied with `node scripts/apply-quarantine-ddl.js` (drizzle-kit is not initialised here).

create table if not exists quarantined_inputs (
  id serial primary key,
  raw text not null,
  normalized text not null,
  bucket text not null default 'low_confidence',
  status text not null default 'pending',
  confidence integer not null default 0,
  margin integer not null default 0,
  reason text not null default '',
  context_key text not null default '',
  context jsonb not null default '{}'::jsonb,
  candidates jsonb not null default '[]'::jsonb,
  mapped_to jsonb,
  seen_count integer not null default 1,
  created_at timestamp not null default now(),
  last_seen_at timestamp not null default now(),
  resolved_at timestamp,
  constraint quarantined_input_key unique (normalized, context_key)
);

create table if not exists entity_aliases (
  id serial primary key,
  key text not null unique,
  raw text not null,
  entity_kind text not null,
  repo_id integer,
  repo_name text,
  file text,
  symbol text,
  label text,
  vector jsonb not null,
  source text not null default 'judge',
  quarantine_id integer,
  hits integer not null default 0,
  created_at timestamp not null default now()
);

create index if not exists entity_aliases_kind_idx on entity_aliases (entity_kind);
create index if not exists quarantined_inputs_status_idx on quarantined_inputs (status);
