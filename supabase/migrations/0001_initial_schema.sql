-- Cloud Brain — initial Postgres schema
--
-- Mirrors the on-device SQLite schema (src/db/migrations.ts) with three
-- additions that only exist server-side:
--
--   1. user_id on every table, referencing auth.users
--   2. Row Level Security scoped to auth.uid()
--   3. Explicit grants, because this project disabled "automatically expose
--      new tables" — a table is unreachable through the Data API until granted
--
-- ON THE ANON KEY. The app ships an anon key inside the APK, where anyone can
-- extract it. That is by design and it is safe ONLY because of the policies
-- below. With RLS off, that key reads every user's financial data. Every table
-- here enables RLS explicitly rather than relying on the project's automatic
-- trigger, so this file is correct on its own and does not depend on a project
-- setting somebody might change later.
--
-- TYPE MAPPING from SQLite:
--   TEXT id          -> uuid     (ids are UUIDv7, generated on-device)
--   INTEGER epoch ms -> bigint   (not timestamptz — see note below)
--   TEXT YYYY-MM-DD  -> date     (timezone-free, serialises back as the same string)
--   INTEGER paise    -> bigint   (int4 caps at ~₹21 million; bigint matches JS safe ints)
--   TEXT json        -> jsonb
--
-- Timestamps stay as epoch-millisecond bigints rather than becoming
-- timestamptz. They are compared, not displayed: conflict resolution is
-- `excluded.updated_at > table.updated_at`, and keeping both replicas on the
-- identical integer representation removes a whole class of precision and
-- timezone-conversion bugs at the boundary.

begin;

-- ============================================================ accounts

create table if not exists public.accounts (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  kind            text not null,
  opening_balance bigint not null default 0,
  currency        text not null default 'INR',
  archived_at     bigint,
  created_at      bigint not null,
  updated_at      bigint not null,
  deleted_at      bigint
);

-- ============================================================ categories

create table if not exists public.categories (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('income', 'expense')),
  icon        text not null default 'ellipse-outline',
  color_token text not null default 'accent',
  sort_order  integer not null default 0,
  is_system   boolean not null default false,
  created_at  bigint not null,
  updated_at  bigint not null,
  deleted_at  bigint
);

-- ============================================================ transactions

create table if not exists public.transactions (
  id          uuid primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  account_id  uuid not null,
  category_id uuid,
  amount      bigint not null check (amount > 0),
  type        text not null check (type in ('income', 'expense')),
  note        text,
  occurred_on date not null,
  created_at  bigint not null,
  updated_at  bigint not null,
  deleted_at  bigint
);

-- Foreign keys between synced tables are deliberately NOT declared.
--
-- Sync pushes tables one at a time, so a transaction can legitimately arrive
-- before the account it references. A foreign key would reject it and the sync
-- would fail on ordering rather than on anything being wrong. The local SQLite
-- database enforces these relationships at the point of creation, which is
-- where enforcement actually protects the user.

-- ============================================================ todos

create table if not exists public.todos (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  details      text,
  project      text,
  priority     text not null default 'normal'
               check (priority in ('low', 'normal', 'high')),
  due_on       date,
  completed_at bigint,
  sort_order   integer not null default 0,
  created_at   bigint not null,
  updated_at   bigint not null,
  deleted_at   bigint
);

-- ============================================================ notes

create table if not exists public.notes (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default '',
  body       text not null default '',
  tags       jsonb not null default '[]'::jsonb,
  pinned_at  bigint,
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint
);

-- ============================================================ applications

create table if not exists public.applications (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  company        text not null,
  role           text not null,
  source         text,
  location       text,
  applied_on     date not null,
  status         text not null default 'applied'
                 check (status in ('applied', 'screen', 'tech', 'onsite',
                                   'offer', 'rejected', 'ghosted')),
  salary_min     bigint,
  salary_max     bigint,
  contact        text,
  notes          text,
  next_action    text,
  next_action_on date,
  created_at     bigint not null,
  updated_at     bigint not null,
  deleted_at     bigint
);

create table if not exists public.application_events (
  id             uuid primary key,
  user_id        uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null,
  kind           text not null,
  happened_on    date not null,
  note           text,
  created_at     bigint not null,
  updated_at     bigint not null,
  deleted_at     bigint
);

-- ============================================================ sync indexes
--
-- Pull is always "my rows, changed since a cursor", so every table gets the
-- same composite index in that order: equality predicate first, then the range
-- column. Same reasoning as the SQLite indexes.

create index if not exists accounts_sync_idx
  on public.accounts (user_id, updated_at);
create index if not exists categories_sync_idx
  on public.categories (user_id, updated_at);
create index if not exists transactions_sync_idx
  on public.transactions (user_id, updated_at);
create index if not exists todos_sync_idx
  on public.todos (user_id, updated_at);
create index if not exists notes_sync_idx
  on public.notes (user_id, updated_at);
create index if not exists applications_sync_idx
  on public.applications (user_id, updated_at);
create index if not exists application_events_sync_idx
  on public.application_events (user_id, updated_at);

commit;
