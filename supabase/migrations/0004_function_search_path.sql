-- Cloud Brain — pin the search_path on the sync functions
--
-- Found by Supabase's database linter (`function_search_path_mutable`) after
-- 0003 was applied, not by review. Worth recording how, because the class of
-- bug is invisible in the source: the functions look correct and are correct
-- today.
--
-- THE PROBLEM. A function without its own `search_path` resolves unqualified
-- names using the *caller's* search_path. Anything the function references
-- without a schema — an operator, a type, a function in pg_catalog — can
-- therefore be resolved differently depending on who calls it. Where an
-- attacker can create objects in a schema that sorts earlier in that path, they
-- can shadow what the function meant to call and have it run their code
-- instead.
--
-- The exposure here is small: these are `security invoker`, so a hijacked call
-- executes with the caller's own privileges and RLS still applies. It is a
-- hardening fix, not an incident. But "small exposure" is a poor reason to keep
-- a known sharp edge in code that runs on every sync.
--
-- THE FIX. `set search_path = ''` forces every name to be resolved exactly as
-- written. The function bodies in 0003 are already fully qualified
-- (`public.<table>`), and `pg_catalog` is always searched implicitly, so
-- nothing in them needs to change.
--
-- WHY ALTER RATHER THAN CREATE OR REPLACE. A shipped migration is frozen
-- (CLAUDE.md §5) — 0003 has been applied to the live project and must not be
-- edited. `alter function` also keeps this file to one concern: it changes the
-- execution environment and cannot accidentally change the logic, which a
-- redefinition could.

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
    execute format(
      'alter function public.%I(jsonb) set search_path = ''''',
      'sync_upsert_' || target_table);
  end loop;
end $$;

commit;
