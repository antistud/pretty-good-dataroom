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
- **No passwords.** People sign in with a six-digit code sent to their email.
  A code works once, expires after ten minutes, is replaced when a new one is
  requested and dies after five wrong guesses; only a hash is stored. Requests
  and attempts are rate limited, and the sign-in screen answers the same way
  whether or not an email has access. An authenticator-app code (TOTP) can be
  added as a second step. "Sign out everywhere else" ends other sessions.
- **Email is part of the trust boundary.** Whoever controls an invited inbox
  can sign in as that person, so access is as strong as their email account
  unless they add the second step. Without SMTP configured the app serves a
  single "email is not set up" page and nothing else.
- **Recovery.** If email is down, `install.sh code <email>` issues a code on
  the server. Anyone able to run it already controls the server and its data.
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
- **Audit log.** Sign-ins, views, downloads and admin changes are recorded.
- **User-written text** (overview, updates, pages) is rendered through a small
  markdown subset with all HTML escaped.

What it does not do: encrypt data at rest (use disk encryption on the host),
stop a permitted viewer from photographing their screen, or replace a signed
NDA or legal advice.

## AI assistant connectors

A founder or team member can create a connector address (an MCP endpoint at
`/mcp/<secret>`) and give it to an AI assistant of their choice.

- **The address is the credential.** It is a long random value shown once and
  stored only as a hash. Anyone holding it can use the connector, so treat it
  like a password and turn it off on the "From your documents" page if it may
  have leaked. Each person can have up to five.
- **What it can read:** the company profile, team, cap table, rounds and SAFEs.
  It cannot read documents, investors, the pipeline, people, requests,
  updates or activity.
- **What it can write:** suggestions only. A suggestion is stored as pending
  and changes nothing until a founder reviews and applies it, item by item.
  This is deliberate: documents handed to an assistant can contain text that
  tries to steer it, and an assistant can simply be wrong.
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
