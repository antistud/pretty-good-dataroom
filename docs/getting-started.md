# Getting started

Pretty Good Data Room is free and open source, and runs on a server you control. Installing it takes one command and about ten minutes.

## What you need

- **A Linux server.** The smallest size from any host is enough (1 GB of memory). Ubuntu LTS is what it is tested on.
- **A web address** for the room, such as `room.yourcompany.com`, with its DNS pointing at the server.
- **Email (SMTP) details** from any email service. People sign in with a code sent by email, so the room stays closed until it can send mail. See [Email](email.md).

## Install

Sign in to the server and run this, with your own address at the end:

```bash
curl -fsSL https://raw.githubusercontent.com/antistud/pretty-good-dataroom/main/install.sh | sudo bash -s -- room.example.com
```

The installer:

1. installs Docker if the server does not have it,
2. asks for your email settings,
3. starts the room behind HTTPS, with a certificate it gets and renews by itself,
4. schedules a nightly backup,
5. prints your address and a **setup token**.

Using DigitalOcean? There is a [click-by-click version](digitalocean.md). For AWS, Google Cloud, Azure, Hetzner and others, see [other clouds](other-clouds.md).

## Create your account

Open your address. The first screen asks for the setup token, your company name, your name and your email. That creates the first founder account, and the token is never needed again.

From then on you sign in by entering your email and typing the six-digit code that arrives. There are no passwords.

## Then

The room opens on a short list of what to do first. The quickest route is to [let your AI assistant fill the room from your documents](ai-connector.md). After that, [set up the room and invite people](using-the-room.md).

Want to look around before entering anything real? On the first screen, choose **Show me a made-up company**. One click removes it again.
