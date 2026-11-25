# Pretty Good Data Room

A self-hosted data room and fundraising workspace for pre-seed startups. One Docker container, one SQLite file, no external services required.

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
| Rounds | Open, planned and closed rounds with progress, ready-to-raise and closing checklists |
| Pipeline | Stage board, per-investor "do this next" guidance, engagement signals, diligence tracker |
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
| Sample company | One click loads a fictional raise into an empty room so you can look around; one click removes exactly what it added |
| Security | Invite-only, scrypt password hashes, optional two-step sign-in, optional NDA gate, activity and audit log |

## Run it

You need Docker and a domain name pointing at your server.

```bash
git clone <this repo> && cd pretty-good-dataroom
cp .env.example .env        # then edit it
docker compose up -d --build
```

Then open the site and create the first founder account on the setup screen.

Set these in `.env` before the first start:

| Variable | Purpose |
|---|---|
| `APP_URL` | The public address, e.g. `https://room.example.com`. Used in links and to decide whether cookies are HTTPS-only |
| `SETUP_TOKEN` | A long random string. The setup screen asks for it, so a stranger cannot claim a fresh install |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional. Any SMTP provider. Without these the app still works, but invitations are copy-and-paste links and reminders only appear in the app |

The container listens on port 3000 and should sit behind a reverse proxy that provides HTTPS. `Caddyfile.example` is a working starting point.

## Your data

Everything lives in the `/data` volume: `dataroom.sqlite` and a `files/` directory of uploads. Back up that volume. Nothing about your company is stored in this repository, and `.env` and `data/` are gitignored.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000, data in ./data
npm test           # cap table maths
npm run typecheck
```

Stack: Next.js (App Router, server actions), TypeScript, better-sqlite3, pdf-lib, nodemailer. The schema is in `src/lib/db.ts` and is created on first start.

## Limits to know about

- This tool tracks and guides. It is not legal, tax or securities advice, and its SAFE maths is a planning aid, not a closing calculation. Have a lawyer confirm conversions and filings.
- It does not read incoming email. Replies to its emails go to a founder's own inbox; replies inside the room are threaded.
- It does not do e-signatures. Sign elsewhere and upload the signed copy.
- Watermarks and view-only mode deter casual sharing; they cannot stop someone photographing a screen.
- It is built for one company per install.

## Security

See [SECURITY.md](SECURITY.md) for the security model, the operator checklist and how to report a vulnerability.

## Licence

MIT. See [LICENSE](LICENSE). The bundled Caveat typeface is served from this app (no third-party font requests) and is licensed under the SIL Open Font License 1.1.
