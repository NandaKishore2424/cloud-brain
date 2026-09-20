# 0001 — React Native + Expo, Android first

**Status:** Accepted · 2026-09-20

## Context

A personal productivity app that must be genuinely free to build and run, and
that doubles as a portfolio piece. The developer machine is Linux with no Android
SDK installed, and there is no Mac and no Apple Developer account.

## Decision

React Native with Expo (SDK 57), targeting Android only for now.

## Why

**Why cross-platform at all, given only Android is targeted?** Because the cost
is near zero and it keeps iOS open. Writing Kotlin would close that door for no
present benefit.

**Why Expo over bare React Native?** Expo Go lets the app run on a physical
device with zero native toolchain — no Android Studio, no SDK download, no
Gradle. That removed the single largest setup barrier on this machine. EAS Build
later produces a real APK in the cloud, also free at the tier needed here.

**Why not Flutter?** Genuinely competitive — better default performance and a
more consistent UI layer. Rejected because the TypeScript ecosystem carries
directly into the Phase 4 backend and Phase 6 Edge Functions, so one language
covers the whole system. Dart would mean context-switching for the server side.

**Why Android first?** It is the only path that is actually free end to end.
Android: build an APK and install it, ₹0. iOS: a free Apple ID sideload expires
every 7 days; a real install needs $99/year. Given a zero-cost constraint,
Android is not a preference, it is the only option.

## Consequences

- No iOS testing happens. Platform-specific code must stay behind `Platform`
  checks rather than assuming Android behaviour is universal.
- Expo's managed workflow constrains which native modules can be used — see ADR
  0002.
- `expo export` is available as a bundle-level CI check without a device.
