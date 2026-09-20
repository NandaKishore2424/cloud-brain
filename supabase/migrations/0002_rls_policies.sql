-- Cloud Brain — Row Level Security
--
-- This file is the entire security model. If it is wrong, the anon key shipped
-- inside the APK reads every user's data.
--
-- WHY A LOOP RATHER THAN 28 HAND-WRITTEN POLICIES.
-- Security code is usually better written out explicitly. Here the opposite
-- applies: the risk is not that a policy is hard to read, it is that one table
-- gets missed or gets a subtly different rule. Generating them from a list
-- makes every table provably identical, and reduces the audit question to a
-- single check — "is every table in this array?" — which is far easier to
-- verify than reading 28 near-identical stanzas for a typo.
--
-- WHY `(select auth.uid())` RATHER THAN `auth.uid()`.
-- Wrapped in a subquery, Postgres evaluates it once per statement instead of
-- once per row. On a filtered scan of a few thousand rows that is the
-- difference between a fast query and a slow one. This is Supabase's own
-- documented recommendation.
--
-- WHY UPDATE NEEDS BOTH `using` AND `with check`.
-- `using` decides which existing rows you may target. `with check` decides
-- what the row is allowed to look like afterwards. With only `using`, a user
-- could take one of their own rows and reassign its user_id to somebody else —
-- writing into another account. Both clauses are required.

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
begin
  foreach target_table in array synced_tables loop

    -- Explicit, not relying on the project's automatic-RLS trigger. That
    -- setting can be changed by someone later; this file cannot be applied
    -- without also enabling RLS.
    execute format(
      'alter table public.%I enable row level security', target_table);

    -- Applies the policies to the table owner too. Without this, a query run
    -- as the owner silently bypasses every policy below — which is exactly the
    -- situation where a bug goes unnoticed in testing.
    execute format(
      'alter table public.%I force row level security', target_table);

    -- Idempotent: this migration must be safe to re-run.
    execute format('drop policy if exists %I on public.%I',
                   target_table || '_select_own', target_table);
    execute format('drop policy if exists %I on public.%I',
                   target_table || '_insert_own', target_table);
    execute format('drop policy if exists %I on public.%I',
                   target_table || '_update_own', target_table);
    execute format('drop policy if exists %I on public.%I',
                   target_table || '_delete_own', target_table);

    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (user_id = (select auth.uid()))
    $f$, target_table || '_select_own', target_table);

    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (user_id = (select auth.uid()))
    $f$, target_table || '_insert_own', target_table);

    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $f$, target_table || '_update_own', target_table);

    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using (user_id = (select auth.uid()))
    $f$, target_table || '_delete_own', target_table);

    -- This project disabled "automatically expose new tables", so a table is
    -- unreachable through the Data API until granted. The grant is what makes
    -- it reachable; the policies above are what make that safe.
    --
    -- Granted to `authenticated` only. `anon` — an unauthenticated visitor
    -- holding the public key — gets nothing at all.
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated',
      target_table);

  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Verifying this actually works
--
-- Enabling RLS and believing it works is the mistake. The check below should
-- return one row per table, each with rowsecurity = true and policies = 4.
--
--   select c.relname               as table_name,
--          c.relrowsecurity        as rls_enabled,
--          c.relforcerowsecurity   as rls_forced,
--          count(p.polname)        as policies
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--   left join pg_policy p on p.polrelid = c.oid
--   where n.nspname = 'public' and c.relkind = 'r'
--   group by c.relname, c.relrowsecurity, c.relforcerowsecurity
--   order by c.relname;
--
-- The real test is behavioural, not structural: sign in as a second user and
-- attempt to select a row belonging to the first. It must return zero rows —
-- not an error, zero rows, because RLS filters rather than rejects. A test
-- that only checks "RLS is enabled" would pass against a policy of `using
-- (true)`, which protects nothing.
-- ---------------------------------------------------------------------------
