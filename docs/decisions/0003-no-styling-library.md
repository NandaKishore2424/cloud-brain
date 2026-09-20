# 0003 — No styling library: design tokens + StyleSheet

**Status:** Accepted · 2026-09-20

## Context

React Native has no built-in theming. The usual options are NativeWind
(Tailwind classes), Tamagui (compiler-optimised components), react-native-
unistyles (C++ style engine), or hand-rolled tokens with `StyleSheet`.

## Decision

A hand-rolled token system: `src/design/tokens.ts` holds every visual constant,
`StyleSheet.create` consumes them, and a `useThemedStyles` hook caches the
result per theme.

## Why

**Unistyles** was the strongest technical candidate — its C++ core updates styles
without re-rendering React. Rejected because it requires a Babel plugin and a
development build, which violates ADR 0002 at Phase 0.

**NativeWind** is the popular choice and would have been faster to write.
Rejected on two grounds: it adds a runtime that parses class strings on every
render, and — more importantly for this project — "I used Tailwind" is not an
engineering decision anybody can interrogate. Building the token layer means
owning the reasoning about scale, contrast and caching.

**Tamagui** is the most capable and by a distance the most complex. Its compiler
setup is a meaningful fraction of the total effort of this app.

**The chosen approach costs verbosity and buys:** zero runtime overhead, zero
dependency risk, no build-tool coupling, and full control of the visual system.

## The caching detail

The naive implementation of themed styles builds the style object inside the
render body, allocating a new object every render and defeating React Native's
style diffing. `useThemedStyles` instead runs each factory at most twice — once
per theme — and caches results in a `WeakMap` keyed by the factory function, so
a factory going out of scope takes its cache with it and nothing leaks.

## Consequences

- Every new visual value must be added to `tokens.ts` first. This is friction by
  design; it is what prevents drift.
- No utility-class ergonomics. Layout is written as explicit style objects.
- If the app ever needs runtime user-selectable themes (beyond OS light/dark),
  this approach extends cleanly — `getTheme()` already takes a name.
