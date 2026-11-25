# Pretty Good Data Room

A self-hosted data room and fundraising workspace for pre-seed startups. One command to install, one SQLite file, no external services required.

It does two jobs:

- **For investors and supporters:** a room that shows them what is there and asks what they need and by when, monthly updates, a way to ask for things, and a way to offer introductions.
- **For founders:** a small CRM that walks each investor from first contact to wire, keeps their access in step with their stage, and nags you to send the monthly update.

## What's in it

| Area | What it does |
|---|---|
| Roles | Founders, team members, investors, supporters |
| Organisations | Access belongs to the firm. Members can invite their own colleagues, who get the same access and never more |
| Access tiers | Supporter, then investor tiers (Teaser, Diligence, Closing by default). Every folder, document, section, update section and intro ask has an audience |
| Documents | Folders seeded from a pre-seed template, versions, in-browser viewing, PDFs watermarked with the viewer's email, per-tier download permission |
| Cap table and SAFEs | Holders, option pool, SAFEs (post- and pre-money, cap, discount, MFN) and a pro-forma conversion at a priced round |
| Rounds | A step-by-step planner that asks what the money is for, works out how much to raise and at what cap from your own numbers, and explains what founders usually do. Then open, planned and closed rounds with progress, ready-to-raise and closing checklists |
| Pipeline | Import a contact list from a CSV file, with a preview and duplicate detection. Stage board, per-investor "do this next" guidance, engagement signals, diligence tracker |
| Updates | Monthly update with per-section audiences, preview-as, per-reader emails, founder reminders until it is published |
| Requests | Investors ask questions or request documents, data or a call; founders work an inbox |
| Set Me Up | A list of introductions you want, shown in the room and in every update email |
| Investor home | A letter from the founders, what is in the room, and one question: what do you need, and by when. No checklists and no chasing |
| Founder guide | A six-stage path through the raise, a daily note, a room health score and ready-to-edit wording for each message you need to send |
| Delight | An at-a-glance view of where every investor stands, drag-and-drop pipeline, search and jump (Ctrl/Cmd+K), light and dark themes, a quiet celebration when money lands |
| Notifications | A "What's new" inbox for everyone, with matching emails each person can switch on or off by topic |
| Replies | Readers can answer an update with one tap or a written reply; founders see who read it. Emails set Reply-To to a founder so replies reach a person |
| Automations | Automatic next steps, welcomes, wire thank-yous, alerts when investors lean in, nudges, runway warnings and a Monday summary. Each can be switched off |
| Phone | A bottom tab bar, stacked tables, large touch targets, and it can be added to the home screen |
| Export and print | Every investor-facing page prints cleanly or saves as PDF, stamped with who it was prepared for. A one-page summary of everything a person can see. Cap table, SAFEs and financials as CSV, and all documents as one zip, for tiers allowed to download |
| Bring your own AI | Connect the assistant you already use (Claude, ChatGPT, Grok or any that supports MCP connectors) and hand it your deck, formation documents and SAFEs. It suggests the overview, team, cap table, round and SAFEs; you review and apply. A copy-and-paste route covers assistants without connectors. The app itself contains no AI and sends your files nowhere |
| Sample company | One click loads a fictional raise into an empty room so you can look around; one click removes exactly what it added |
| Security | Invite-only. Sign-in by a six-digit code sent to your email, with no passwords to choose, leak or reset. Optional authenticator-app second step, optional NDA gate, activity and audit log |

## Run it

On a fresh Linux server whose DNS name points at it, one command:

```bash
curl -fsSL https://raw.githubusercontent.com/antistud/pretty-good-dataroom/main/install.sh | sudo bash -s -- room.example.com
```

It installs Docker if needed, asks for your email (SMTP) settings, starts the app behind HTTPS, schedules a nightly backup, and prints your address and a setup token. Open the address, enter the token, and create the first founder account.

**Email is required.** People sign in with a code sent by email, so the room stays closed until it can send mail. Have SMTP details from any email service ready (Resend, Postmark, SendGrid, Amazon SES, Google Workspace…). If email ever breaks and you are locked out, `sudo /opt/dataroom/install.sh code you@example.com` issues a sign-in code on the server.

Run `sudo /opt/dataroom/install.sh` again at any time to update; settings and data are kept. Step-by-step for DigitalOcean: [docs/digitalocean.md](docs/digitalocean.md).

Settings live in `/opt/dataroom/.env`:

| Variable | Purpose |
|---|---|
| `DOMAIN` | The address of the room, e.g. `room.example.com` |
| `SETUP_TOKEN` | Asked for once on the setup screen, so a stranger cannot claim a fresh install |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Required. Any SMTP provider. Used for sign-in codes, invitations, updates and reminders |

Prefer to do it by hand? Copy `.env.example` to `.env`, fill it in, and run `docker compose up -d`. That starts two containers: the app, and Caddy for HTTPS.

## Your data

Everything lives in the `/data` volume: `dataroom.sqlite` and a `files/` directory of uploads. Back up that volume. Nothing about your company is stored in this repository, and `.env` and `data/` are gitignored.

## Develop

```bash
npm install
SMTP_HOST=console npm run dev   # http://localhost:3000, data in ./data; emails (and sign-in codes) print to the terminal
npm test           # cap table maths
npm run typecheck
```

Stack: Next.js (App Router, server actions), TypeScript, better-sqlite3, pdf-lib, nodemailer. The schema is in `src/lib/db.ts` and is created on first start.

## Limits to know about

- This tool tracks and guides. It is not legal, tax or securities advice, and its SAFE maths is a planning aid, not a closing calculation. Have a lawyer confirm conversions and filings.
- It does not read incoming email. Replies to its emails go to a founder's own inbox; replies inside the room are threaded.
- PDFs are made by the browser's own "Save as PDF". The per-page footer and page numbers appear in Chrome and Edge; other browsers show the stamp once at the top.
- Anyone who controls an invited email inbox can sign in as that person. The optional authenticator-app step protects against that.
- The built-in connector lets an assistant read the room's profile, team, cap table, rounds and SAFEs and send suggestions. It cannot publish, invite, or see investors, and its suggestions do nothing until a founder applies them. I have tested it with the official MCP client library, not inside each assistant's own app.
- It does not do e-signatures. Sign elsewhere and upload the signed copy.
- Watermarks and view-only mode deter casual sharing; they cannot stop someone photographing a screen.
- It is built for one company per install.

## Security

See [SECURITY.md](SECURITY.md) for the security model, the operator checklist and how to report a vulnerability.

## Licence

MIT. See [LICENSE](LICENSE). The bundled Inter and Instrument Serif typefaces are served from this app (no third-party font requests) and are licensed under the SIL Open Font License 1.1.
