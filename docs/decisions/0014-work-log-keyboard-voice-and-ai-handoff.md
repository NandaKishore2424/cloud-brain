# 0014 — Work log: keyboard dictation for voice, share-sheet hand-off for AI

**Status:** Accepted · 2026-09-21
**Supersedes:** the Phase 6 plan in `docs/roadmap.md` (speech-recognition module,
Edge Function, Gemini, `pg_cron` rollups)
**Relates to:** [0002](0002-expo-go-constraint.md), [0004](0004-local-first-sqlite.md), [0013](0013-email-otp-auth.md)

## Context

Phase 6 is the feature the project is named for: at the end of each day, say
what you worked on; at the end of the week, get it back as a sprint update,
appraisal material and CV bullets.

The original plan was an on-device speech-recognition module, a Supabase Edge
Function holding a Gemini key, and scheduled weekly rollups in Postgres. By the
time Phase 6 was built, all three had become unavailable or unwanted:

- **A speech module needs a native build.** ADR 0002 keeps the app in Expo Go,
  and the author tests there.
- **An Edge Function needs a caller identity.** With sync switched off (the
  author's decision, recorded in HANDOVER.md) there is no signed-in user. An
  Edge Function callable with only the publishable key is callable by anyone who
  extracts that key from the APK, spending the author's Gemini quota.
- **The author asked for the basic version.** Configuring SMTP for sign-in was
  explicitly declined as more setup than this project wants.

## Decision

### Voice is the keyboard's own microphone

The entry is a plain multiline text field. Android's keyboard (Gboard on nearly
every device) already has a microphone key that turns speech into text in any
field — offline on most devices, in the user's own language settings, at no cost.
The screen says so in one line of hint text.

A speech-recognition module would reimplement that, less well, behind a native
build.

### AI is a hand-off, not an API call

"Summarise with AI" builds a prompt from the week's entries and opens the
Android share sheet. The person chooses Gemini, ChatGPT or anything else, and
the text lands in that app's input box.

The prompt does the work a server-side pipeline would have done:

- asks for three outputs — sprint update, STAR-form achievements for an
  appraisal, CV bullets — the three reasons the log exists;
- instructs the model to use **only** what is in the log, and to write
  `[add result]` rather than invent a metric. An appraisal is exactly where an
  embellished number does damage.

A plain "Share week" sends the same entries without the instructions, for a
standup message or a note to a manager.

## Why this is better than the plan, not only cheaper

**Privacy is visible.** A work log is the one dataset in this app most likely
to contain someone else's confidential information — an employer's project
names, incidents, customers. Under the original design it would have been sent
to a model API automatically, every week. Here nothing leaves the device until
the person picks a destination and looks at the text in it. Free-tier model
APIs may also use inputs for training; the person's own assistant app is under
terms they already chose.

**No secret exists.** CLAUDE.md invariant 6 says no API key in the bundle.
The cleanest way to satisfy it is to not have one.

**It works today, in Expo Go, signed out.** Both halves are platform features
(`TextInput`, `Share`), not dependencies.

## Rejected

- **`expo-speech-recognition` / `@react-native-voice/voice`.** Native module,
  dev build required. Duplicates the keyboard.
- **Edge Function + Gemini.** Needs sign-in (so SMTP), a key, and a rate-limit
  story for an endpoint callable with a public key.
- **Structured capture** (category, project, impact per entry). Every required
  field at 11pm is a reason not to log. Structure is extracted at summary time
  from free text instead.
- **A sixth tab.** The log is visited once a day. It is a Home capture button
  ("Work") and a pushed screen — resolving the "five tabs, Phase 6 wants a
  sixth" item that sat in HANDOVER since Phase 5.

## Costs

- **One extra step.** Paste-and-send in the assistant app, rather than a
  summary appearing in-app.
- **Summaries are not stored.** The output lives in the assistant's history,
  not in Cloud Brain. Pasting one back into a note is manual.
- **No reminder.** The plan's nightly notification is not built;
  `expo-notifications` is a dependency and a permission prompt, deferred until
  the habit proves it needs one.

## When to revisit

An in-app summary via an Edge Function becomes reasonable once sync is on (so
there is a user to authorise) and the one-tap hand-off has proved too much
friction in actual use. The prompt builder is pure and tested
(`src/features/worklog/summary.ts`), so it would be reused unchanged as the
function's input.
