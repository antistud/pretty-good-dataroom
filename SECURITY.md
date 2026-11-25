# Security

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
vulnerability reporting instead: on this repository, go to **Security →
Report a vulnerability**. Include what you found, how to reproduce it and what
an attacker could do with it. You will get a reply there.

## Security model in brief

- **Self-hosted, single tenant.** One container holds the app, a SQLite
  database and the uploaded files. Nothing is sent to a third party except
  email, and only if you configure SMTP.
- **Invite-only.** There is no public sign-up. Invitations are single-use,
  expire after 14 days and can be cancelled.
- **HTTPS and browser policy.** The bundled setup puts Caddy in front for
  HTTPS and keeps the app's own port private. Pages send a
  Content-Security-Policy that only allows scripts, styles, fonts and images
  from the app itself, forms that post back to it, and no framing by other
  sites.
- **No passwords.** People sign in with a six-digit code sent to their email.
  A code works once, expires after ten minutes, is replaced when a new one is
  requested and dies after five wrong guesses; only a hash is stored. An
  account that collects fifteen wrong guesses in a day has sign-in paused for
  24 hours and its owner is emailed; the count survives restarts. Requests
  and attempts are rate limited, and the sign-in screen answers the same way
  whether or not an email has access. An authenticator-app code (TOTP) can be
  added as a second step. "Sign out everywhere else" ends other sessions.
- **Email is part of the trust boundary.** Whoever controls an invited inbox
  can sign in as that person, so access is as strong as their email account
  unless they add the second step. Without SMTP configured the app serves a
  single "email is not set up" page and nothing else.
- **Recovery.** On the server, `install.sh unlock|code|reset-2fa <email>` lifts
  a pause, issues a code when email is down, or clears a lost authenticator
  (see docs/locked-out.md). Anyone able to run it already controls the server and its data.
- **Sessions** are random tokens stored hashed, in an `HttpOnly`, `SameSite=Lax`
  cookie that is marked `Secure` when `APP_URL` is `https://`.
- **Access levels.** Every folder, document, page, update section and built-in
  section has a minimum audience. Supporters are level 0, investor tiers are
  1–3, founders and team are above all of them. Checks run on the server for
  every page and every action.
- **Files** are stored under random names outside any web root and are only
  served through an authenticated, permission-checked route. PDFs are
  watermarked with the viewer's email and the time. Downloads are off unless a
  tier is allowed them.
- **Pictures.** Team photos and the company logo must be PNG, JPEG or WebP,
  checked by content; SVG is refused. Team photos are served only to people
  who may see the team page. The logo is public by design: it appears on the
  sign-in page and in emails, alongside the company name already shown there.
- **Audit log.** Sign-ins, views, downloads and admin changes are recorded.
- **User-written text** (overview, updates, pages) is rendered through a small
  markdown subset with all HTML escaped.

What it does not do: encrypt data at rest (use disk encryption on the host),
stop a permitted viewer from photographing their screen, or replace a signed
NDA or legal advice.

## AI assistant connectors

A founder or team member can create a connector (an MCP endpoint) and give it
to an AI assistant of their choice.

- **The key is the credential.** It is a long random value (288 bits) shown
  once and stored only as a hash. Each person can have up to five.
- **Two ways to present it.** Preferred: `POST /mcp` with
  `Authorization: Bearer <key>`, so nothing secret is in an address or a log.
  For assistants that only accept a plain URL: `POST /mcp/<key>`. In that
  form the key can end up wherever URLs are recorded (the assistant
  provider's settings, a proxy's access log), which is why the limits below
  exist.
- **Suggestions only, by default.** A new connector cannot read anything; it
  can only send suggestions. A leaked key then reveals nothing. Reading the
  company profile, team, cap table, rounds and SAFEs is a box the founder
  ticks per connector. No connector can read documents, investors, the
  pipeline, people, requests, updates or activity.
- **Keys expire.** The founder picks 1, 7 (default), 30 or 90 days. A key can
  be turned off at any time on the "From your documents" page, and stops
  working when its owner loses access.
- **First use is announced.** The owner gets a notification and an email the
  first time a key is used, and the caller's address is written to the
  activity log.
- **It cannot upload files.** It can leave a note saying what a file is and
  which folder it belongs in. The note is used only when a founder uploads a
  file with that name, and never decides who can see it: that comes from the
  folder. Files the room cannot place go to a founders-only folder.
- **What it can write:** suggestions only. A suggestion is stored as pending
  and changes nothing until a founder reviews and applies it, item by item.
  This is deliberate: documents handed to an assistant can contain text that
  tries to steer it, and an assistant can simply be wrong.
- Wrong keys are limited to 20 per caller per 15 minutes.
- Not done: OAuth sign-in for connectors (the assistant sends the founder to
  the room to approve it, and no key is ever copied). It is the stronger
  design and a larger piece of work.
- Everything an assistant sends is treated as untrusted input: parsed
  leniently, then typed, range-checked and length-limited before it is stored
  or shown. Requests from other websites (an `Origin` header that is not the
  room's own) are refused, and requests are rate limited.
- The app contains no AI and never sends files anywhere. Whatever a founder
  uploads to their assistant is governed by that provider's terms.

## What has and has not been checked

The code has been reviewed by its authors for missing permission checks, SQL
built from user input, unescaped output and unsafe redirects, and the access
rules are exercised by browser tests. It has **not** had an independent
security audit or penetration test. Treat it accordingly: keep it updated,
turn on the authenticator-app step for founders, and do not put anything in it
that you could not bear to have read.

## Operator checklist

- [ ] Serve it over **HTTPS** behind a reverse proxy and set `APP_URL` to the
      `https://` address. Do not expose port 3000 directly.
- [ ] Set a long random **`SETUP_TOKEN`** before the first start, so nobody
      else can claim the fresh install.
- [ ] Keep `.env` out of version control. This repository's `.gitignore`
      already excludes it and the `data/` directory.
- [ ] **Back up the data volume** on a schedule and test a restore. It holds
      the database and every uploaded file.
- [ ] Turn on **two-step sign-in** for every founder account.
- [ ] Remove access for people who should no longer have it (People & access).
- [ ] Keep the host and the image up to date; rebuild after pulling changes.
