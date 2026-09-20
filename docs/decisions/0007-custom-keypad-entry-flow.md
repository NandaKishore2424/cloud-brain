# 0007 — Custom keypad and a defaults-first entry flow

**Status:** Accepted · 2026-09-20

## Context

Phase 1's product bet: recording an expense takes **under five seconds**. This
is not a nice-to-have. An expense tracker that is slow to write to stops being
written to within a week, and a partial ledger is worth roughly nothing — you
cannot trust a total you know has gaps in it.

A transaction has six fields: amount, type, category, account, date, note. The
naive implementation renders six inputs and a Save button, which is a form, and
a form takes about thirty seconds.

## Decision

**Amount is the only field the user must touch.** Everything else has a default
that is correct most of the time, and the entry surface is a custom numeric
keypad in a bottom sheet.

| Field | Default | Reasoning |
|-------|---------|-----------|
| Type | Expense | For a salaried user, income is a few entries a month against dozens of expenses |
| Date | Today | Expenses get logged when they happen |
| Category | Most recently used | Ordered by `MAX(created_at)` per category, so it self-tunes |
| Account | The only live one | A picker for a list of one is pure friction |
| Note | Empty | Genuinely optional |

## Why a custom keypad rather than a `TextInput`

1. **No open animation.** Android's keyboard takes 200–300ms to slide in and
   reflows the layout as it does. The custom pad renders with the sheet.
2. **Bigger targets.** System numeric keyboards size digits like alphabetic
   keys. These are a third of the screen width, which makes one-handed entry
   without looking actually viable.
3. **No layout fight.** No `KeyboardAvoidingView`, no scroll-into-view, no
   insets shifting under the sheet.
4. **Exact input rules.** `keyboardType="numeric"` still admits `-`, `+`, `e`
   and multiple separators depending on the OEM keyboard. Here only twelve keys
   exist, and the transition rules live in `amountInput.ts` as pure, tested
   functions.

The cost is that the note field still needs the system keyboard. Rather than
letting the two overlap, focusing the note hides the keypad — the usual failure
of this layout is two keyboards competing for the same space.

## Why a sheet rather than a screen

A pushed route costs a navigation transition in each direction and puts the
ledger behind an animation the user has to wait out. The sheet renders over the
list, and because the list is driven by `useLiveQuery`, the new transaction is
already visible underneath as the sheet dismisses.

## Why pre-select a category

It removes a tap from the common path, and the recency ordering means the guess
is right most of the time after a few days of real use.

The risk is silent mis-categorisation. It is mitigated by placement rather than
by confirmation: the selected chip sits highlighted directly above the keypad,
in the user's field of view while they type the amount. A wrong guess is visible
before saving, not discovered a month later in the breakdown.

## Consequences

- No account picker. Adding a second account is a Phase 4+ concern and will
  need this flow revisited.
- No full date picker. The stepper handles today, yesterday and a few days back,
  which covers the overwhelming majority of real entries. Back-filling a month
  of receipts is not supported and is noted as deferred.
- `amountInput.ts` is pure and unit-tested; the keypad component holds no input
  logic of its own.
