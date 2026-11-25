# Running it

Everything is in `/opt/dataroom` on your server.

## Everyday commands

| To | Run on the server |
|---|---|
| Update to the latest version | `sudo /opt/dataroom/install.sh` |
| Back up right now | `sudo /opt/dataroom/install.sh backup` |
| Lift a sign-in pause | `sudo /opt/dataroom/install.sh unlock you@example.com` |
| Issue a sign-in code when email is down | `sudo /opt/dataroom/install.sh code you@example.com` |
| Clear a lost authenticator | `sudo /opt/dataroom/install.sh reset-2fa you@example.com` |
| See what went wrong | `cd /opt/dataroom && docker compose logs --tail 50` |

## Updating

Run the installer again. It fetches the latest version, keeps your settings and data, and restarts the room. It takes a minute or two.

## Settings

Settings live in `/opt/dataroom/.env`:

| Variable | Purpose |
|---|---|
| `DOMAIN` | The address of the room, such as `room.example.com` |
| `SETUP_TOKEN` | Asked for once on the first screen, so a stranger cannot claim a fresh install |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Email. See [Email](email.md) |

After changing any of them, run the installer again.

## Your data and backups

Everything about your company is in one place: a SQLite database and a folder of uploaded files, both in the app's `/data` volume.

A backup runs every night and copies are kept for 14 days in `/opt/dataroom/backups`. These live on the same server, so also switch on your host's own backups or copy the files elsewhere.

To restore, stop the room, unpack a backup into the data volume, and start it again. Ask in the project's issues if you need a hand.

## Moving to a different address

Change `DOMAIN` in `/opt/dataroom/.env`, point the new name's DNS at the server, and run the installer. A new certificate is issued automatically.

## Behind Cloudflare

Set the DNS record to **DNS only** (grey cloud) for the first start, so the server can get its own certificate. Once the site loads over HTTPS you may turn the proxy on, with Cloudflare's SSL/TLS mode set to **Full (strict)**.

## Without the installer

Copy `.env.example` to `.env`, fill it in, and run `docker compose up -d`. That starts two containers: the app, and Caddy for HTTPS.

## Developing

```bash
npm install
SMTP_HOST=console npm run dev
npm test
```

With `SMTP_HOST=console`, emails and sign-in codes are printed to the terminal instead of being sent. The stack is Next.js, TypeScript and SQLite. The project is MIT licensed; issues and pull requests are welcome on [GitHub](https://github.com/antistud/pretty-good-dataroom).
