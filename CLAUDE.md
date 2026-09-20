# CLAUDE.md — Cloud Brain

Read this file **first** in every session. Then read `HANDOVER.md` for current state.

---

## 1. What this project is

**Cloud Brain** — an Android-first personal operations app for a working software
professional. One place for the things that are normally scattered across a bank
app, a spreadsheet, a notes app and memory.

It is simultaneously:
- a **real tool** the author uses daily, and
- a **portfolio project** that must survive technical interrogation by senior engineers.

The second goal is load-bearing. Every non-obvious decision has a written rationale
in `docs/decisions/`. If you make a non-obvious decision, write the ADR.

### Feature scope

| # | Feature | Status |
|---|---------|--------|
| 1 | Money — income / expense tracking | Phase 1 |
| 2 | Todos — task list with projects | Phase 2 |
| 3 | Notes — markdown-ish notes with tags | Phase 3 |
| 4 | Cloud sync + auth (Supabase) | Phase 4 |
| 5 | Job application tracker | Phase 5 |
| 6 | Voice work-log + AI weekly summaries | Phase 6 |

Features 5 and 6 are **not** in scope yet. Do not build toward them speculatively,
but do not make decisions that block them either.

---

## 2. Hard invariants

Break these and the project breaks. Non-negotiable.

1. **Money is integer paise.** Never a float. `4200` means ₹42.00. All formatting
   goes through `src/lib/money.ts`. There is no exception to this rule.
2. **SQLite on device is the source of truth for reads.** The UI never waits on a
   network call to render. Supabase (Phase 4) is a sync target and backup, not a
   read path.
3. **Every table has `id` (uuid text), `createdAt`, `updatedAt`, `deletedAt`.**
   Deletes are soft. Phase 4 sync depends on this; retrofitting it is painful.
4. **No feature imports from another feature.** `features/money` must never import
   from `features/todos`. Shared code goes to `src/lib` or `src/design`.
5. **Routes are thin.** Files in `app/` wire params and render one feature
   component. Business logic lives in `src/features/*`.
6. **No secrets in the client bundle.** Anything with an API key goes behind a
   Supabase Edge Function (Phase 6).

---

## 3. Conventions

**Language** TypeScript, `strict: true`. No `any` — use `unknown` and narrow.

**Imports** Absolute via `@/` → `src/`. e.g. `import { Text } from '@/design'`.

**Naming**
- Files: `PascalCase.tsx` for components, `camelCase.ts` for everything else.
- DB columns: `snake_case`. TS fields: `camelCase`. Drizzle maps between them.
- Booleans read as assertions: `isPending`, `hasSynced`.

**Styling** No styling library. `src/design/tokens.ts` holds the design tokens;
`StyleSheet.create` consumes them. Never hardcode a colour, radius or spacing
value in a component — if a token is missing, add it to `tokens.ts`.

**Data access** Feature code calls `src/features/<f>/api/*`. Those files are the
only place Drizzle queries are written. Components never import `db` directly.

**Lists** Use `FlashList`, never `FlatList` or `.map()` over unbounded data.

**Errors** Data-layer functions return `Result<T>` (`src/lib/result.ts`), they do
not throw. UI decides how to surface failure.

---

## 4. Commands

```bash
npm start              # Expo dev server — scan QR with Expo Go
npm run android        # open on connected device/emulator

npm run verify         # typecheck + schema verification — MUST pass to end a phase
npm run typecheck      # tsc --noEmit
npm run verify:schema  # runs migrations against a real SQLite engine (sql.js)
```

`npm run verify:schema` matters more than it looks. `tsc` proves the migration
SQL is a valid *string*; `expo export` proves it *bundles*. Neither executes it.
A bad `CREATE TABLE`, a constraint that does not do what you assumed, or a
module-initialisation order bug all pass both and then crash on the device at
first launch — which is exactly what happened in Phase 0. Run it after any
change to `src/db/`.

There is no Android SDK installed on this machine. Development happens in
**Expo Go** on a physical Android phone. Do not add a dependency that requires a
custom dev build unless the phase explicitly calls for one — check
`docs/decisions/0002-expo-go-constraint.md` before adding any native module.

---

## 5. Multi-session protocol

Sessions are deliberately short to avoid context exhaustion. **One phase per
session.**

**Starting a session:**
1. Read `CLAUDE.md` (this file).
2. Read `HANDOVER.md` — it names the current phase and the exact next step.
3. Read only the files that phase touches. Do not read the whole tree.

**Ending a session:**
1. Run `npm run verify`. It must pass.
2. Update `HANDOVER.md`: move the phase to Done, write the next phase's entry
   point, list any known issues.
3. Write/refresh the phase's study notes in `study/phase-N/`.
4. Commit with a message naming the phase: `feat(phase-1): money tracking`.

**Never** leave a session with `HANDOVER.md` stale. The next session is blind
without it.

---

## 6. Documentation duties

Two doc trees, different audiences. Keep them separate.

| Path | Committed? | Audience | Content |
|------|-----------|----------|---------|
| `docs/` | ✅ yes | other engineers, interviewers browsing the repo | architecture, data model, ADRs, roadmap |
| `study/` | ❌ gitignored | the author, privately | step-by-step teaching notes, interview Q&A, rationale in long form |

`docs/` is terse and professional. `study/` is verbose and explains *why* a
concept exists, assuming no prior knowledge. Both get updated each phase.

When you finish a phase, `study/phase-N/` must let the author explain, unprompted,
to a senior engineer: what was built, why that approach, what was rejected, and
what the tradeoffs were.
