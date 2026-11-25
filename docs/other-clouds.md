# Deploying on other clouds

The data room runs on any Linux server that can run Docker, so every cloud works the same way. The steps are always:

1. **Create a small Ubuntu server** (the latest LTS, 1 GB of memory or more).
2. **Give it an address that does not change**, and open ports 22, 80 and 443.
3. **Point your domain at it** with a DNS A record, for example `room` → the server's IP.
4. **Sign in and run one command:**

```bash
curl -fsSL https://raw.githubusercontent.com/antistud/pretty-good-dataroom/main/install.sh | sudo bash -s -- room.example.com
```

The installer asks for your [email settings](email.md), starts the room behind HTTPS and prints a setup token. From there, follow [Getting started](getting-started.md).

What differs between clouds is what each one calls those things, and which email ports it blocks. The notes below cover that. Menu names change, so treat them as a guide and check the cloud's own help if something looks different.

## AWS

**The simple route is Lightsail**, Amazon's fixed-price servers.

- Create an instance: **Linux/Unix → OS Only → Ubuntu**, on the smallest plan with 1 GB of memory.
- Under **Networking**, create and attach a **static IP**, and add firewall rules for **HTTP (80)** and **HTTPS (443)**. SSH (22) is open by default.
- Connect with the browser SSH button, or as the `ubuntu` user with your key.

**On EC2** it is the same idea with more knobs:

- Launch an Ubuntu instance (a `t3.micro` or `t4g.micro` is enough).
- In its **security group**, allow inbound 22, 80 and 443.
- Allocate an **Elastic IP** and associate it with the instance, or the address changes when it restarts.
- Connect as `ubuntu`.

**Email:** AWS blocks outgoing port 25. Use port **587** or **2525** with your email service. If you use Amazon SES, new accounts start in a sandbox that only sends to verified addresses; ask AWS to move you out of it before inviting anyone.

## Google Cloud

- In **Compute Engine → VM instances**, create an instance with an **Ubuntu LTS** boot disk. An `e2-micro` works; `e2-small` is more comfortable.
- Tick **Allow HTTP traffic** and **Allow HTTPS traffic** when creating it. That opens ports 80 and 443.
- Reserve a **static external IP address** (under VPC network → IP addresses) and attach it to the VM.
- Connect with the **SSH** button in the console.

**Email:** Google Cloud blocks outgoing port 25. Use **587** or **2525**.

## Microsoft Azure

- Create a **Virtual machine** with an **Ubuntu Server LTS** image. A `B1s` size is enough.
- Under **Inbound port rules**, allow **SSH (22)**, **HTTP (80)** and **HTTPS (443)**.
- Open the VM's **public IP address** and set its assignment to **Static**.
- Connect as the admin user you chose (often `azureuser`).

**Email:** many Azure subscriptions block outgoing port 25. Use **587** or **2525**.

## Hetzner

- In the Cloud Console, add a server with the **Ubuntu** image. The smallest shared-CPU type is enough.
- The IP address stays with the server for its lifetime. If you attach a **Firewall**, allow inbound 22, 80 and 443.
- Connect as `root`.

**Email:** new Hetzner accounts have outgoing ports 25 and 465 blocked. Use **587** or **2525**.

## Linode (Akamai) and Vultr

- Create the smallest shared instance with **Ubuntu LTS**.
- The IP address stays with the server. If you add a cloud firewall, allow inbound 22, 80 and 443.
- Connect as `root`.

**Email:** both restrict outgoing mail ports on new accounts. Use **587** or **2525**, or ask support to lift the restriction.

## DigitalOcean

There is a [click-by-click guide](digitalocean.md).

## Setting it up without signing in

Most clouds let you paste a script that runs on first boot, called **user data**, a **startup script** or **cloud-init**. Paste this, with your own values, and the server installs itself:

```bash
#!/bin/bash
export SMTP_HOST=smtp.example.com SMTP_PORT=587 SMTP_USER=your-username SMTP_PASS=your-password SMTP_FROM="Acme <room@example.com>"
curl -fsSL https://raw.githubusercontent.com/antistud/pretty-good-dataroom/main/install.sh | bash -s -- room.example.com > /root/dataroom-install.log 2>&1
```

Then read the setup token on the server with `sudo grep SETUP_TOKEN /opt/dataroom/.env`.

## Your own hardware, or anything else

A home server, a NAS or a company machine works too, as long as:

- it runs Docker on Linux,
- ports 80 and 443 reach it from the internet (needed to get the HTTPS certificate),
- your domain points at it.

Container platforms that run a single image without a persistent disk are **not** a good fit: the room keeps its database and uploaded files in one volume, and losing that volume loses the room. If a platform gives you `docker compose` and a volume that survives restarts, it should work, but only plain servers are tested.

## If the page does not load

- **Connection times out:** ports 80 and 443 are not open in the cloud's firewall or security group.
- **Certificate error:** the DNS record does not point at the server yet. The certificate is issued automatically once it does.
- **Sign-in codes do not arrive:** an email port is blocked. Set `SMTP_PORT=2525` in `/opt/dataroom/.env` and run the installer again. See [Email](email.md).
