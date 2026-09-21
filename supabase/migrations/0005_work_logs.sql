-- Cloud Brain — work log (Phase 6)
--
-- One table, brought to the same standard as the seven before it in a single
-- file: the table (as 0001), row-level security (as 0002), the conditional
-- last-write-wins upsert (as 0003) and a pinned search_path (as 0004).
--
-- WHY IT EXISTS WHILE SYNC IS SWITCHED OFF. The client adds `work_logs` to
-- SYNC_TABLES, and a sync cycle only advances its cursors when every table
-- succeeds (ADR 0012, decision 4). A table the client syncs but the server
-- lacks is therefore not a missing feature — it fails every sync run for every
-- table. Shipping this now means turning sync on later needs no server work.
--
-- WHY THE EARLIER MIGRATIONS ARE NOT EDITED to include it: shipped migrations
-- are frozen. 0001–0004 have been applied to the live project.

begin;

create table if not exists public.work_logs (
  id         uuid primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  logged_on  date not null,
  -- Mirrors the SQLite CHECK. Both ends refuse an empty entry, so neither can
  -- replicate one to the other.
  body       text not null check (length(btrim(body)) > 0),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint
);

create index if not exists work_logs_sync_idx
  on public.work_logs (user_id, updated_at);

-- ---------------------------------------------------------------- RLS (0002)

alter table public.work_logs enable row level security;
alter table public.work_logs force row level security;

drop policy if exists work_logs_select_own on public.work_logs;
drop policy if exists work_logs_insert_own on public.work_logs;
drop policy if exists work_logs_update_own on public.work_logs;
drop policy if exists work_logs_delete_own on public.work_logs;

create policy work_logs_select_own on public.work_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy work_logs_insert_own on public.work_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy work_logs_update_own on public.work_logs
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy work_logs_delete_own on public.work_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.work_logs to authenticated;

-- ------------------------------------------- last-write-wins upsert (0003+0004)
--
-- The SET clause is generated from the catalogue, as in 0003, so it cannot
-- drift from the table. `set search_path = ''` is written into the definition
-- rather than applied afterwards, so this function is never, even briefly,
-- in the state 0004 had to repair.

do $$
declare
  assignments text;
begin
  select string_agg(format('%I = excluded.%I', column_name, column_name), ', ')
    into assignments
    from information_schema.columns
   where table_schema = 'public'
     and table_name = 'work_logs'
     and column_name <> 'id';

  execute format($f$
    create or replace function public.sync_upsert_work_logs(rows jsonb)
      returns integer
      language plpgsql
      set search_path = ''
      as $body$
      declare
        affected integer;
      begin
        insert into public.work_logs
        select * from jsonb_populate_recordset(null::public.work_logs, rows)
        on conflict (id) do update
          set %s
          where excluded.updated_at > public.work_logs.updated_at;

        get diagnostics affected = row_count;
        return affected;
      end;
      $body$;
  $f$, assignments);
end $$;

grant execute on function public.sync_upsert_work_logs(jsonb) to authenticated;
revoke all on function public.sync_upsert_work_logs(jsonb) from anon;

commit;
