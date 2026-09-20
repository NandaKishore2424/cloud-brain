# Building an APK

Development happens in Expo Go on a physical device. That needs a laptop running
Metro on the same network, which is fine for building the app and useless for
actually living with it. An installable APK removes the laptop.

This is also the step that unblocks Phase 6: an EAS build is a standalone build,
not Expo Go, so native modules that ADR 0002 currently forbids become available.

## What EAS is, and why not build locally

EAS Build is Expo's hosted build service. It takes the JavaScript project,
generates the native Android project, compiles it and returns an APK.

Building locally would need the Android SDK, a matching JDK and the NDK — none
of which are installed on the development machine, and all of which are a
multi-gigabyte setup whose only output is the same artifact. The free tier
queues builds behind paid ones but does not charge for them.

## Profiles

`eas.json` defines three. They differ in what they produce and who can install
it.

| Profile | Output | Purpose |
|---------|--------|---------|
| `development` | APK with the dev client | Phase 6 — native modules, still hot-reloading from Metro |
| `preview` | **APK** | The one to install and use daily. Sideloaded, no Play Store |
| `production` | AAB | Play Store only — Google requires App Bundle, which cannot be sideloaded |

`preview` is the one that matters now.

**Why `preview` is an APK and `production` is an AAB:** an Android App Bundle is
not an installable file. Google's servers split it into per-device APKs at
install time, so it is only useful once the app is listed. An APK installs by
tapping it.

## Versioning

`appVersionSource: "remote"` — EAS owns `versionCode` and increments it per
build. The alternative is tracking it by hand in `app.json` and remembering to
bump it, which fails silently: Android refuses to install an APK whose
`versionCode` is not higher than the installed one, and the error does not say
that clearly.

`version` in `app.json` (`0.1.0`) is the human-facing string and stays manual.

## Environment variables

The two `EXPO_PUBLIC_SUPABASE_*` values are inlined into the bundle at build
time. `.env` is gitignored, and EAS respects `.gitignore` when uploading the
project — so the build machine never sees that file and the values must be
supplied separately.

They are registered as EAS environment variables rather than written into
`eas.json`:

```bash
eas env:create --environment preview \
  --name EXPO_PUBLIC_SUPABASE_URL --value https://YOUR-REF.supabase.co --type string

eas env:create --environment preview \
  --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value sb_publishable_... --type string
```

Neither is secret — the publishable key ships inside the APK by design, and
row-level security is what makes that safe (ADR 0012, and `npm run
check:remote`). Keeping them out of the repository anyway is cheap and avoids
having the project URL scraped out of a public repo and used for sign-up spam
against a rate-limited free-tier mailer.

**If they are missing the build still succeeds**, and the app works — with sync
switched off, reporting "Not configured in this build" on the sync screen. That
is deliberate (ADR 0004), but it does mean a forgotten variable looks like a
working build.

## First build

```bash
npm install -g eas-cli      # or use npx eas-cli@latest everywhere below
eas login                   # free Expo account
eas init                    # writes extra.eas.projectId into app.json — commit it
```

Then the two `eas env:create` commands above, then:

```bash
npm run build:apk
```

Ten to twenty minutes including queue time. The CLI prints a URL; the APK
downloads from there.

## Installing it

Transfer the APK to the phone and tap it. Android asks permission to install
from an unknown source once.

**The APK starts with an empty database.** It and Expo Go are separate apps with
separate sandboxes, so nothing recorded while developing in Expo Go carries
over.

That is worth knowing before the switch, and it is also the first real test of
sync: sign in on the APK and the data should arrive from the server.

## Rebuilding

Only when native configuration changes — a new native module, a change to
`app.json`, a new permission. JavaScript-only changes do not need a rebuild if
OTA updates are configured; they are not, and for a single-user app rebuilding
is simpler than running an update server.
