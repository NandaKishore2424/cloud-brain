# 0002 — Stay Expo Go compatible until Phase 6

**Status:** Accepted · 2026-09-20

## Context

Expo Go is a pre-built app from the Play Store containing a fixed set of native
modules. A project using only those modules runs instantly on a phone by scanning
a QR code. A project using any other native module requires a **development
build** — a custom APK, which needs either the Android SDK locally (not
installed) or a cloud EAS build (a few minutes per build, limited free tier).

## Decision

Phases 0–5 use only modules bundled in Expo Go. Phase 6 will require a
development build and that is accepted at that point.

## Why

The iteration loop is the thing being protected. Expo Go is save-file →
see-it-on-the-phone in about a second. A development build turns every native
dependency change into a multi-minute cloud round-trip. For evenings-and-weekends
development, that difference decides whether the project gets finished.

Phase 6 needs `expo-speech-recognition`, which is not in Expo Go. By then the
app is worth the slower loop, and the build setup is a one-time cost.

## Consequences

**Before adding any dependency**, check whether it ships in Expo Go. Anything
with an `android/` folder that is not in Expo's bundled set will break the
workflow for every phase that follows.

Known constraint, accepted: `expo-sqlite` **is** in Expo Go, which is what makes
the local-first architecture (ADR 0004) viable this early.

Known cost: local SQLite cannot be encrypted with SQLCipher under Expo Go. The
database holds salary and spending data. This is tracked as debt and must be
addressed when the development build arrives in Phase 6.
