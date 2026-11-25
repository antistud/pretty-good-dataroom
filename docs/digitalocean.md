# Deploying on DigitalOcean

About ten minutes, most of it waiting.

## 1. Create a Droplet

In the DigitalOcean control panel: **Create → Droplets**.

- **Image:** Ubuntu (the latest LTS).
- **Size:** Basic, 1 GB is enough.
- **Authentication:** an SSH key.
- **Backups:** tick *Enable backups*.

Note the Droplet's IP address.

## 2. Point your domain at it

Where your domain's DNS is managed, add an **A record** for the name you want (for example `room`) pointing at the Droplet's IP.

## 3. Have your email settings ready

People sign in with a code sent by email, so the installer asks for SMTP details: host, port, username, password (or API key) and a "from" address. Any email service works. DigitalOcean blocks outgoing ports 25, 465 and 587 on many accounts; most services also offer **2525**, so use that if codes do not arrive.

## 4. Run one command

```bash
ssh root@YOUR_DROPLET_IP
curl -fsSL https://raw.githubusercontent.com/antistud/pretty-good-dataroom/main/install.sh | bash -s -- room.example.com
```

Replace `room.example.com` with your address. The script installs Docker, asks for the email settings, starts the data room with HTTPS, schedules a nightly backup, and prints your address and a **setup token**.

## 5. Open it

Go to your address, enter the setup token, and create your founder account. From then on you sign in by entering your email and typing the six-digit code we send; there is no password.

## Even less typing: do it all at creation

When creating the Droplet, open **Advanced options → Add Initialization scripts** and paste this, with your address in place of `room.example.com`:

```bash
#!/bin/bash
export SMTP_HOST=smtp.example.com SMTP_PORT=2525 SMTP_USER=your-username SMTP_PASS=your-password SMTP_FROM="Acme <room@example.com>"
curl -fsSL https://raw.githubusercontent.com/antistud/pretty-good-dataroom/main/install.sh | bash -s -- room.example.com > /root/dataroom-install.log 2>&1
```

The Droplet sets itself up on first boot. Point the DNS at it, wait a few minutes, then read the setup token with:

```bash
ssh root@YOUR_DROPLET_IP grep SETUP_TOKEN /opt/dataroom/.env
```

## Afterwards

| To | Run on the server |
|---|---|
| Update to the latest version | `/opt/dataroom/install.sh` |
| Change email settings | edit `/opt/dataroom/.env`, change the `SMTP_` lines, then `/opt/dataroom/install.sh` |
| Someone cannot sign in | see [locked-out.md](locked-out.md): `/opt/dataroom/install.sh unlock`, `code` or `reset-2fa` followed by their email |
| Back up right now | `/opt/dataroom/install.sh backup` |
| See what went wrong | `cd /opt/dataroom && docker compose logs --tail 50` |

Nightly backups are kept for 14 days in `/opt/dataroom/backups`. They live on the same server, so keep DigitalOcean's own backups switched on as well.

## If your DNS is on Cloudflare

Set the record to **DNS only** (grey cloud) for the first start. With the proxy on (orange cloud), Cloudflare shows "SSL handshake failed (525)" because the server cannot yet get its own certificate. Once the site loads over HTTPS you may turn the proxy on, with Cloudflare's SSL/TLS mode set to **Full (strict)**. If you changed the record after installing, run `cd /opt/dataroom && docker compose restart caddy` so it retries straight away.

## If the page does not load

- **Certificate or connection error:** the DNS record is not pointing at the Droplet yet. Nothing needs re-running; the certificate is issued as soon as it does.
- **A firewall is attached:** allow inbound ports 22, 80 and 443.
