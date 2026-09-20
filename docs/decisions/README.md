# Architecture Decision Records

One file per decision that was not obvious. Each records the context at the time,
what was chosen, what was rejected and why, and what it costs.

An ADR is immutable once written. To change a decision, write a new ADR that
supersedes it and say so in both.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-react-native-expo-android-first.md) | React Native + Expo, Android first | Accepted |
| [0002](0002-expo-go-constraint.md) | Stay Expo Go compatible until Phase 6 | Accepted |
| [0003](0003-no-styling-library.md) | No styling library — tokens + StyleSheet | Accepted |
| [0004](0004-local-first-sqlite.md) | Local-first; SQLite is the read path | Accepted |
| [0005](0005-drizzle-with-hand-written-migrations.md) | Drizzle for queries, hand-written migrations | Accepted |
| [0006](0006-money-as-integer-paise.md) | Money as integer paise | Accepted |
