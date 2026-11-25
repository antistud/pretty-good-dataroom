# If someone cannot sign in

People sign in with a six-digit code sent to their email. This page covers the three ways that can go wrong and how the person who runs the server fixes each.

All commands are run **on the server** (the machine where the data room is installed), as root. If you are an investor or supporter, send this page to the founder who invited you.

## "Sign-in is paused for 24 hours"

**What happened.** Someone entered the wrong sign-in code for that account 15 times in one day. To stop anyone guessing their way in, sign-in for that one email is paused for 24 hours. Nobody got in, and nothing was lost. The account's owner receives an email saying so.

It may have been the person themselves mistyping, or someone else trying their address.

**To lift the pause now:**

```bash
/opt/dataroom/install.sh unlock you@example.com
```

They can ask for a new code straight away. If you do nothing, the pause ends by itself after 24 hours.

**If it keeps happening** to the same person, someone is probably trying their address on purpose. They cannot get in without the code from that person's inbox, but it is a good moment for a founder to turn on the authenticator-app step (Account → Two-step sign-in), which keeps the account safe even if their email were compromised.

## The code email never arrives

Check the spam folder first, and that the address is exactly the one that was invited.

If nobody is receiving codes, the server's email settings are the cause. In the room, a founder who is still signed in can look at **Settings → Emails sent recently** to see the error. Common causes: the email service's password or API key changed, the sending domain is not verified, or the host blocks the port (try `SMTP_PORT=2525`). Fix the `SMTP_` lines in `/opt/dataroom/.env`, then run `/opt/dataroom/install.sh`.

**To get in while email is broken:**

1. On the sign-in page, enter the email and press **Email me a code**.
2. On the server:
   ```bash
   /opt/dataroom/install.sh code you@example.com
   ```
3. Type the code it prints. It works once and lasts ten minutes.

## A lost phone, with the authenticator-app step turned on

The emailed code still arrives, but the second code cannot be produced.

```bash
/opt/dataroom/install.sh reset-2fa you@example.com
```

This turns the authenticator step off for that person and signs them out everywhere. They sign in with an emailed code as usual and should set the authenticator step up again under **Account**.

## Good to know

- These commands only work on the server. Anyone able to run them already controls the server and its data, so they add no new way in.
- Each one is recorded in the room's activity log.
- Without Docker (development), run `node scripts/account.js <unlock|code|reset-2fa> you@example.com` from the project folder.
