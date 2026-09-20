# 0011 — Colour system: measured, not chosen

**Status:** Accepted · 2026-09-20
**Supersedes:** the palette values in ADR 0003 (the structure it describes stands)

## Context

The original palette was picked by eye: an indigo accent, emerald for income,
rose for expenses, a near-black dark background. It looked fine on a laptop.

Two questions were worth answering before building more UI on top of it.
Is it *readable*, and is the hue choice defensible or just taste?

## What the measurement found

`scripts/check-contrast.js` composites every foreground/background pair the app
actually renders — including the semi-transparent chip backgrounds, which have
to be alpha-composited over their surface before measuring — and checks each
against its WCAG 2.1 target.

The original palette failed **11 of 38 pairs**:

| Pair | Measured | Target |
|------|----------|--------|
| warning icon on card (light) | 2.15:1 | 3.0 |
| label on filled button (dark) | 2.98:1 | 4.5 |
| focused input border (light) | 1.93:1 | 3.0 |
| focused input border (dark) | 1.62:1 | 3.0 |
| income amount on card (light) | 3.77:1 | 4.5 |
| positive text on chip (light) | 3.34:1 | 4.5 |
| …and five more | | |

The light theme was substantially worse than the dark one, which is the opposite
of the intuition that dark themes are the risky ones.

## Decisions

### 1. Contrast is enforced, not reviewed

`npm run check:contrast` runs inside `npm run verify`. A palette change that
drops a pair below its target fails the build. Colour is the easiest thing in a
design system to regress by eye and the easiest to verify by arithmetic, so it
should be arithmetic.

Targets follow WCAG 2.1: **4.5:1** for body text, **3.0:1** for large text and
for non-text UI that carries meaning (1.4.11) — focused borders, meaningful
icons. Hairline dividers are decorative and exempt.

### 2. Accent is blue

Blue is the colour most consistently associated with sustained focus and calm in
the workplace-colour literature, and independently it is the conventional
platform signal for "interactive".

**Stated honestly:** most of the popular writing on colour and productivity is
marketing content citing other marketing content, with effect sizes that would
not survive scrutiny. Blue is a *reasonable, conventional* choice, not a proven
performance win. The parts of this ADR worth defending are the measured ones.

### 3. The dark background is not near-black

Changed from `#0B0D11` to `#14161A`.

Pure and near-pure black under light text causes **halation** — text appears to
bleed at its edges — which is materially worse for readers with astigmatism, and
the extreme contrast is tiring over a long session. Material's guidance lands
around `#121212`.

### 4. Dark-theme accent colours are desaturated and lightened

Saturated colour on a dark surface optically vibrates and cannot reach a
readable ratio at body-text size. The dark palette uses lighter, less saturated
variants than a naive "same hue, lighter" transform would give.

### 5. The dark theme's button label is dark, not white

The dark theme's accent is a light blue, so a white label on it measures ~3:1 —
below the body-text target. `textOnAccent` is therefore near-black in the dark
theme and white in the light one.

This looks wrong written down and is correct on screen. Material 3 does the same
thing with `primary`/`onPrimary` across themes.

## Consequences

- Adding a colour means adding its pair to `PAIRS` in the contrast script.
  If a new pair is not listed, it is not verified.
- The palette cannot be "brightened" casually; several values are at their
  measured limit.
- The checker composites alpha, so a chip background cannot be tuned without
  re-checking the text on it.
- A future user-selectable theme would need to run through the same check before
  shipping, not after.
