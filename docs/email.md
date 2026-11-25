# Email

Email is required. It carries sign-in codes, invitations, monthly updates and reminders. Without it the room shows a single "email is not set up" page and nothing else.

## What to have ready

Any email service that offers SMTP works: Resend, Postmark, SendGrid, Amazon SES, Mailgun, Google Workspace and others. From the service you need five things:

| Setting | What it is | Example |
|---|---|---|
| `SMTP_HOST` | The service's SMTP server | `smtp.example.com` |
| `SMTP_PORT` | Usually 587. Use 2525 if your host blocks it | `587` |
| `SMTP_USER` | The username the service gives you | |
| `SMTP_PASS` | The password or API key | |
| `SMTP_FROM` | The name and address emails come from | `Acme Data Room <room@example.com>` |

Most services ask you to **verify your sending domain** first by adding DNS records. Do that before installing, or the service will refuse to send.

The installer asks for these values. They are saved in `/opt/dataroom/.env` on your server and nowhere else.

## Changing them later

Edit the `SMTP_` lines in `/opt/dataroom/.env`, then run:

```bash
sudo /opt/dataroom/install.sh
```

## If emails are not arriving

- **Check spam**, and that the address is exactly the one that was invited.
- **Look at the log.** A founder who is signed in can open **Settings** and read **Emails sent recently**, which shows the error the email service gave.
- **Blocked port.** Many hosts, DigitalOcean included, block ports 25, 465 and 587. Set `SMTP_PORT=2525` if your service offers it.
- **Unverified domain.** The "from" address must be on a domain your email service has verified.

Locked out while email is broken? You can [issue a sign-in code on the server](locked-out.md).

## Who gets what

Everyone can switch individual kinds of email on or off under **Account**. Sign-in codes and security notices are always sent.
