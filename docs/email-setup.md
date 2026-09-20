# Email setup — why sign-in needs an SMTP sender

Sign-in does not work on a fresh Supabase project. Not because of a bug, and not
because of anything in this repository. The reason is a three-link chain that is
invisible from the code:

1. The app signs in with a **six-digit code** (ADR 0013 — no password, no OAuth
   redirect, because a redirect needs a native build and ADR 0002 keeps this in
   Expo Go).
2. Supabase's default *Magic link or OTP* template sends
   `{{ .ConfirmationURL }}` — a **link**. Expo Go has no stable URL scheme to
   receive it, so the link is useless here. The template has to send
   `{{ .Token }}` instead, which is the six-digit code.
3. **Editing an auth email template requires custom SMTP.** The dashboard
   greys out the subject and body and says so: *"Set up custom SMTP to edit
   templates."*

So custom SMTP is not a production nicety. It is the precondition for the first
sign-in.

There is a second reason it is unavoidable: Supabase's built-in mailer **only
delivers to addresses belonging to project team members**, and is rate-limited
to a handful of messages an hour. Custom SMTP raises that to 30/hour and lets
mail reach any address.

## Choosing a sender

Any SMTP provider works. Two that cost nothing:

| | Setup | Why |
|---|---|---|
| **Brevo** | new free account, ~10 min | 300 emails/day free, permanently. A real sending domain, so it keeps working when the app is public |
| **Gmail app password** | ~5 min if 2-Step Verification is already on | No new account. Fine for one person; not a good sender for a public app |

Brevo is the better one-time investment, because it is also the answer for the
Play Store. Gmail is faster if the goal is just to test today.

## Brevo

1. Sign up at **brevo.com** and verify the account email.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender.** Use an address
   you control. Brevo refuses to send `From:` an unverified sender.
3. **SMTP & API → SMTP.** The page shows the server, the port and an **SMTP
   login**. Generate an **SMTP key** — that is the password. It is *not* the
   Brevo account password.

Read the host, port and login off that page rather than trusting values written
down elsewhere; Brevo has changed the login format before. At the time of
writing the server is `smtp-relay.brevo.com` on port `587`.

## Gmail

1. Google Account → Security → **2-Step Verification** must be on.
2. **myaccount.google.com/apppasswords** → create one. It is 16 characters.
3. Host `smtp.gmail.com`, port `465`, username = the full Gmail address,
   password = the app password. The sender address **must** be that same Gmail
   address — Gmail rewrites anything else.

## Filling in the Supabase form

**Authentication → Emails → SMTP Settings**, with *Enable custom SMTP* on.

| Field | Value |
|---|---|
| Sender email address | the verified sender (Brevo) or the Gmail address |
| Sender name | `Cloud Brain` |
| Host | from the provider |
| Port | `587` for Brevo, `465` for Gmail |
| Minimum interval per user | `60` — leave it |
| Username | the provider's SMTP **login** |
| Password | the provider's SMTP **key** |

> **Check the Username and Password fields before saving.** The browser will
> happily autofill them from a saved login for an unrelated site. A wrong value
> here fails at send time, and the app only sees "could not send the code",
> which looks like a bug in the app.

Save changes.

## The template

**Authentication → Emails → Templates → Magic link or OTP.** The fields are now
editable.

Subject:

```
Your Cloud Brain code
```

Body — switch to **Source**, replace everything:

```html
<h2>Your Cloud Brain code</h2>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>It expires in an hour. If you didn't ask for it, ignore this email.</p>
```

Save changes.

`{{ .Token }}` is the six-digit code. `{{ .TokenHash }}` is a different value
used inside confirmation links and **cannot** be typed into the app — the two
are not interchangeable.

## Verifying it

```bash
npx expo start -c
```

The `-c` is not optional after `.env` changes: `EXPO_PUBLIC_*` values are
inlined into the bundle at build time, so a running dev server still holds the
old ones.

Then Home → cloud icon → enter the address → **Send code**. The mail should
arrive within a few seconds carrying six digits.

If it does not arrive, **Authentication → Logs** shows the SMTP error verbatim,
which is far more useful than anything the app can report.
