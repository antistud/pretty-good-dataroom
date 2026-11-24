# Pretty Good Data Room

A self-hosted data room and fundraising workspace for pre-seed startups. One Docker container, one SQLite file, no external services required.

It does two jobs:

- **For investors and supporters:** a guided room that tells them exactly what to look at next, monthly updates, a way to ask for things, and a way to offer introductions.
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
| Guided onboarding | A "Start here" checklist for investors and a lighter welcome for supporters |
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
- It does not do e-signatures. Sign elsewhere and upload the signed copy.
- Watermarks and view-only mode deter casual sharing; they cannot stop someone photographing a screen.
- It is built for one company per install.

## Security

See [SECURITY.md](SECURITY.md) for the security model, the operator checklist and how to report a vulnerability.

## Licence

MIT. See [LICENSE](LICENSE).
