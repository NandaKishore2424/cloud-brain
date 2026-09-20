# 0006 — Money as integer paise

**Status:** Accepted · 2026-09-20

## Context

Monetary amounts need a representation. The obvious one — a float holding
rupees — is wrong.

## Decision

Every monetary amount is an **integer number of paise**, typed as a branded
`Paise` type. `4200` means ₹42.00. Rupees exist only as display output and raw
user input; they never reach the database and never participate in arithmetic.

## Why

IEEE-754 doubles cannot represent most decimal fractions exactly:

```js
0.1 + 0.2          // 0.30000000000000004
1.005 * 100        // 100.49999999999999  → rounds to 100, not 101
```

Sum a few hundred float rupee values and the total drifts by paise. In a ledger
that is not a rounding artefact — it is a wrong number on screen, and it
compounds silently. Integers are exact, and JavaScript integers stay exact up to
2^53, which in paise is about ₹90 trillion. Comfortably sufficient.

## The branded type

```ts
declare const paiseBrand: unique symbol;
export type Paise = number & { readonly [paiseBrand]: true };
```

Structurally `Paise` is a `number`, so it costs nothing at runtime. But
TypeScript will not accept a plain `number` where `Paise` is expected, so a raw
rupee value cannot be passed to a function expecting paise by accident. The
invariant is enforced by the compiler rather than by remembering.

## Supporting rules

- **Amounts are always positive.** Direction lives in `transactions.type`
  (`income` | `expense`) with a `CHECK` constraint. Signed amounts mean every
  aggregate must know the sign convention, and one missed `ABS()` inverts a total.
- **Round once, at the end.** `scalePaise` rounds after multiplying. Never
  accumulate fractional paise across a calculation.
- **Indian digit grouping is hand-rolled**, not `Intl.NumberFormat('en-IN')`, so
  output does not depend on which ICU data the device's JS engine ships.
- **Display uses U+2212 MINUS SIGN**, not a hyphen — it is digit-width in most
  fonts, so a column of negative amounts stays aligned.

## Alternatives rejected

**decimal.js / big.js** — correct, but a dependency and an allocation per
operation, to solve a problem that integers already solve exactly for a
two-decimal currency.

**Storing a string** — pushes parsing into every call site and makes SQL
aggregation impossible.

## Consequences

- All formatting goes through `src/lib/money.ts`. No component formats currency
  itself.
- User input passes through `parseAmount`, which returns `Result<Paise>` and
  rejects more than two decimal places, zero, and absurd magnitudes.
- A currency with a different minor-unit exponent (Kuwaiti dinar, 3 decimals)
  would need the scale factor to become per-currency data rather than the
  hardcoded 100. Out of scope; the app is INR-only.
