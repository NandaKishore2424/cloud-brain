-- Cloud Brain — last-write-wins upsert
--
-- THE PROBLEM. PostgREST's upsert (`Prefer: resolution=merge-duplicates`)
-- overwrites unconditionally. Pushing a row would therefore clobber a newer
-- version already on the server — which is not last-write-wins, it is
-- last-*push*-wins, and it silently destroys an edit made on another device.
--
-- Pulling before pushing narrows the window but does not close it: another
-- device can write between this device's pull and its push.
--
-- THE FIX. One function per table doing a genuinely conditional upsert:
--
--     on conflict (id) do update set ...
--       where excluded.updated_at > <table>.updated_at
--
-- Postgres evaluates that atomically per row, so the newer version wins
-- regardless of arrival order. A stale push becomes a no-op instead of data
-- loss.
--
-- WHY GENERATED RATHER THAN HAND-WRITTEN. The `do update set` clause must list
-- every column. Across seven tables that is roughly 80 assignments, and a
-- column omitted by accident simply stops syncing — no error, no failing test,
-- just a field that quietly never updates on other devices. Generating the
-- clause from the catalogue means the function cannot drift from the table.
--
-- SECURITY. These are `security invoker` (the default), so they execute as the
-- calling user and RLS still applies in full. A `security definer` function
-- here would bypass every policy in 0002 and hand any authenticated user write
-- access to every row in the database.

begin;

do $$
declare
  target_table text;
  synced_tables text[] := array[
    'accounts',
    'categories',
    'transactions',
    'todos',
    'notes',
    'applications',
    'application_events'
  ];
  assignments text;
begin
  foreach target_table in array synced_tables loop

    -- Every column except the primary key, which is the conflict target and
    -- must not be reassigned. user_id is included deliberately: the RLS
    -- `with check` clause still refuses to let it become another user's id, so
    -- including it is safe and keeps the generated clause uniform.
    select string_agg(format('%I = excluded.%I', column_name, column_name), ', ')
      into assignments
      from information_schema.columns
     where table_schema = 'public'
       and table_name = target_table
       and column_name <> 'id';

    execute format($f$
      create or replace function public.%I(rows jsonb)
        returns integer
        language plpgsql
        as $body$
        declare
          affected integer;
        begin
          insert into public.%I
          select * from jsonb_populate_recordset(null::public.%I, rows)
          on conflict (id) do update
            set %s
            where excluded.updated_at > public.%I.updated_at;

          get diagnostics affected = row_count;
          return affected;
        end;
        $body$;
    $f$,
      'sync_upsert_' || target_table,
      target_table,
      target_table,
      assignments,
      target_table);

    execute format(
      'grant execute on function public.%I(jsonb) to authenticated',
      'sync_upsert_' || target_table);

    -- anon holds the key shipped in the APK. It must not be able to write.
    execute format(
      'revoke all on function public.%I(jsonb) from anon',
      'sync_upsert_' || target_table);

  end loop;
end $$;

commit;
