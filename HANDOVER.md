# HANDOVER

> Living state file. **Read after `CLAUDE.md`, before touching code.**
> Every session updates this before it ends.

**Last updated:** 2026-09-20
**Current phase:** Phase 1 — Money
**Status:** ✅ Complete — `npm run verify` passes (typecheck + 68 tests + schema)

---

## Where things stand

| Phase | Scope | Status |
|-------|-------|--------|
| 0 | Foundation: repo, docs, design system, DB layer, navigation shell | ✅ Done |
| 1 | Money — ledger, entry flow, month summary, category breakdown | ✅ Done |
| 2 | Todos | ⬜ **Next** |
| 3 | Notes | ⬜ |
| 4 | Supabase auth + sync | ⬜ |
| 5 | Job application tracker | ⬜ |
| 6 | Voice work-log + AI summaries | ⬜ |

---

## What Phase 1 delivered

**Data access** (`src/features/money/api/`) — the only place money SQL is written
- `transactions.ts` — `transactionsInRange` (query builder for `useLiveQuery`),
  `createTransaction`, `updateTransaction`, `softDeleteTransaction`,
  `restoreTransaction`. Mutations return `Result<T>` and never throw.
- `summary.ts` — `monthTotals` and `categoryTotals` as SQL `SUM`/`GROUP BY`,
  not JS reductions. Sums stay in integer paise.
- `categories.ts` — `categoriesByRecency` (ordered by `MAX(created_at)`),
  `getDefaultAccountId`.

**Hooks** (`src/features/money/hooks/`)
- `useTransactions` — reactive ledger, flattened into header/item rows in one
  O(n) pass, with sticky header indices for FlashList
- `useMonthSummary`, `useCategoryBreakdown`, `useCategoriesByRecency`
- `useMonthNavigation` — stores a single anchor date, derives the range

**UI** (`src/features/money/components/`)
- `MoneyScreen` — composition root; FlashList with the summary and breakdown as
  `ListHeaderComponent` (never a ScrollView wrapping a virtualised list)
- `AddTransactionSheet` — the five-second entry flow
- `AmountKeypad` — custom 12-key pad, memoised keys, haptics on press-in,
  long-press backspace clears
- `CategoryPicker`, `TypeToggle`, `TransactionRow`, `MonthSummaryCard`,
  `CategoryBreakdownCard`
- `Sheet` added to the design system — hand-built Modal + Reanimated + pan
  dismiss, ~120 lines, reusable for Phases 2 and 3

**Also**
- `src/db/seed.ts` — deterministic dev seeder (seeded PRNG, realistic Indian
  salaried-month shape). Never runs automatically; exposed via a `__DEV__`-gated
  card on the Home tab.
- 68 unit tests (Vitest) over `money.ts`, `date.ts`, `amountInput.ts`
- ADR 0007 (entry flow) and ADR 0008 (verification strategy)
- `study/phase-1/` — 3 notes including a 20-question interview bank

---

## Bugs and gaps the tests caught

Worth reading before Phase 2 — these are the failure modes this project actually
produces.

1. **`fromRupees(1.005)` returned 100, not 101.** `1.005 * 100` is
   `100.49999999999999`. Fixed by rounding through a fixed-decimal string. The
   doc comment was also **overclaiming** and was rewritten: by the time the
   function is called the literal is already the nearest double, so this
   recovers intent, not information. `parseAmount` (string → integer) is the
   only path user input takes and never touches a float.

2. **`asCalendarDate` validated shape but not existence.** `'2026-02-29'`
   matched the regex, and `new Date(2026, 1, 29)` silently rolls over to 1
   March. Now validated by round-trip: parse, format back, compare.

3. **Two test expectations were wrong, not the code** — `2026-02-29` (not a leap
   year) and `formatMoneyCompact(450)` (₹4.50 rounds to ₹5 by design). Both
   corrected with a comment explaining the intent.

---

## Next session: Phase 2 — Todos

**Entry point:** read `docs/roadmap.md` § Phase 2, then `src/db/schema.ts`
(`todos` table already defined — do not redesign). Mirror the money feature's
structure exactly; it is the reference implementation now.

**Build, in this order:**
1. `src/features/todos/api/` — query builder for the list, plus
   `createTodo`, `toggleTodo`, `updateTodo`, `softDeleteTodo`, `reorderTodo`.
   Same two-shape split as money: unexecuted queries for reads, `Result<T>` for
   writes.
2. `src/features/todos/hooks/useTodos.ts` — reactive, grouped into
   Overdue / Today / Upcoming / No date / Done.
3. Quick-add: a single text field pinned above the keyboard. Title is the only
   required field, same defaults-first principle as the money sheet.
4. List with swipe-to-complete, and the same delete-plus-undo pattern as the
   ledger (`MoneyScreen` has the reference implementation).
5. Drag to reorder — `sortOrder` is already sparse in the schema so a reorder
   writes one row rather than renumbering the list.

**Reuse, do not rebuild:** `Sheet`, `Button`, `Card`, `EmptyState`, the undo bar
pattern, and `useMonthNavigation`'s derive-don't-store approach.

**Deferred** (stay out of scope): subtasks, recurring todos, reminders,
notifications.

---

## Known issues / debt

| Item | Severity | Note |
|------|----------|------|
| Local DB not encrypted | **medium** | Holds salary and spending data. SQLCipher needs a custom dev build (blocked by ADR 0002 until Phase 6). |
| No forward-migration test | medium | `verify:schema` proves the chain applies to an *empty* database, not that a device on v1 upgrades cleanly to v2. Add a per-version upgrade test before any migration 3. |
| No edit flow for transactions | low | `updateTransaction` exists and is tested by typecheck only — nothing calls it yet. Delete-and-re-add with undo is the current path. |
| No account picker | low | One account. Phase 4 will force this. |
| No full date picker | low | Stepper covers today through a few days back. Back-filling a month of receipts is unsupported. |
| Project path contains a space | low | Fine for Expo Go and EAS. **Breaks local Gradle builds** — rename to `cloud-brain` first. |
| `deletedAt` rows never purged | low | Needs compaction in Phase 4, once sync can confirm a tombstone reached all replicas. |
| Icons are Expo defaults | low | Cosmetic. |

---

## Decisions a future session must not silently reverse

Reversing one means writing a new ADR that supersedes it.

- **No styling library** — tokens + `StyleSheet` only (ADR 0003)
- **Drizzle for queries, hand-written migrations** (ADR 0005)
- **Local-first**; SQLite is the read path, Supabase is a sync target (ADR 0004)
- **Expo Go compatibility** is a hard constraint until Phase 6 (ADR 0002)
- **Money is integer paise**, amounts always positive, direction in `type` (ADR 0006)
- **Defaults-first entry**: one required field, everything else defaulted (ADR 0007)
- **No component tests**; three-layer verification instead (ADR 0008)
- **A shipped migration is frozen.** Append a new one; never edit an old one.
- **No feature imports from another feature.**
- **All SQL lives in a feature's `api/`.** Components never import `db`.
- **No state management library.** SQLite is the store; `useLiveQuery` is the
  subscription.
