#!/usr/bin/env bash
# Sets up the data room on a fresh Linux server, or updates one that is already running.
#
#   Fresh server:   curl -fsSL https://raw.githubusercontent.com/antistud/pretty-good-dataroom/main/install.sh | sudo bash -s -- room.example.com
#   Update:         sudo /opt/dataroom/install.sh
#   Backup now:     sudo /opt/dataroom/install.sh backup
#
# It installs Docker if missing, writes .env, starts the app with HTTPS, and
# schedules a nightly backup. Running it again is safe: it keeps your settings and data.
set -euo pipefail

REPO="https://github.com/antistud/pretty-good-dataroom.git"
DIR="${DATAROOM_DIR:-/opt/dataroom}"
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

main() {
[ "$(id -u)" = "0" ] || die "Run this as root (put sudo in front)."

backup() {
  cd "$DIR"
  mkdir -p "$DIR/backups"
  local name="dataroom-$(date +%F-%H%M).tgz" container volume image
  container="$(docker compose ps -aq dataroom | head -1)"
  [ -n "$container" ] || die "The data room is not running here, so there is nothing to back up."
  # Find the volume by where it is mounted, so it can never be confused with another one.
  volume="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Name}}{{end}}{{end}}' "$container")"
  image="$(docker inspect -f '{{.Image}}' "$container")"
  [ -n "$volume" ] || die "Could not find the data volume."
  docker run --rm --user 0 -v "$volume":/data:ro -v "$DIR/backups":/backup "$image" tar czf "/backup/$name" -C /data .
  # Keep two weeks.
  find "$DIR/backups" -name 'dataroom-*.tgz' -mtime +14 -delete
  echo "Backup written to $DIR/backups/$name"
}

if [ "${1:-}" = "backup" ]; then backup; exit 0; fi

# ---- 1. Docker ----
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker…"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || die "Docker is installed but 'docker compose' is missing. Install the Docker compose plugin and run this again."
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

# ---- 2. The code ----
if [ -d "$DIR/.git" ]; then
  say "Updating $DIR…"
  git -C "$DIR" pull --ff-only
else
  say "Downloading into $DIR…"
  git clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"

# ---- 3. Settings (written once, then left alone) ----
if [ ! -f .env ]; then
  DOMAIN="${1:-${DOMAIN:-}}"
  if [ -z "$DOMAIN" ] && [ -r /dev/tty ]; then
    read -rp "The address people will use, e.g. room.example.com: " DOMAIN </dev/tty || true
  fi
  DOMAIN="$(printf '%s' "$DOMAIN" | sed -E 's#^https?://##; s#/.*$##' | tr 'A-Z' 'a-z')"
  [[ "$DOMAIN" =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "Give the address as the first argument, for example: install.sh room.example.com"
  TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  umask 077
  cat > .env <<ENV
# Written by install.sh. Edit and run 'sudo $DIR/install.sh' to apply.

# The address of your data room. Its DNS must point at this server.
DOMAIN=$DOMAIN

# Asked for once, on the first-run setup screen.
SETUP_TOKEN=$TOKEN

# Email (optional). Fill these in to send invitations, updates and reminders.
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
ENV
  NEW_INSTALL=1
fi
DOMAIN="$(grep -E '^DOMAIN=' .env | head -1 | cut -d= -f2-)"
[ -n "$DOMAIN" ] || die "DOMAIN is missing from $DIR/.env. Add a line like DOMAIN=room.example.com and run this again."

# ---- 4. Start ----
say "Starting the data room…"
IMAGE="$(docker compose config --images 2>/dev/null | grep -m1 dataroom || true)"
# A ready-made image is published for every version. Ask for the one that
# matches this exact code, so an update never runs yesterday's build.
VERSION="$(git rev-parse HEAD)"
docker compose pull --quiet caddy 2>/dev/null </dev/null || true
if [ -n "$IMAGE" ] && [ "${BUILD:-}" != "1" ] && docker pull --quiet "${IMAGE%:*}:$VERSION" >/dev/null 2>&1 </dev/null; then
  docker tag "${IMAGE%:*}:$VERSION" "$IMAGE"
  echo "Using the ready-made image for this version."
else
  echo "Building the app on this server (a few minutes)."
  # Building needs memory. Add swap on small servers so it does not get killed.
  if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 1900 ] && ! swapon --show | grep -q .; then
    fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
  fi
  docker compose build
fi
docker compose up -d --remove-orphans

# ---- 5. Nightly backup ----
cat > /etc/cron.d/dataroom-backup <<CRON
# Nightly backup of the data room. Copies are kept for 14 days in $DIR/backups.
17 3 * * * root $DIR/install.sh backup >> /var/log/dataroom-backup.log 2>&1
CRON

# ---- 6. Wait until it answers ----
printf "Waiting for it to come up"
for _ in $(seq 1 40); do
  if docker compose exec -T dataroom node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))" </dev/null 2>/dev/null; then OK=1; break; fi
  printf "."; sleep 3
done
echo
[ "${OK:-}" = "1" ] || die "The app did not start. See what went wrong with: cd $DIR && docker compose logs --tail 50"

say "Done."
echo "  Open:         https://$DOMAIN"
if [ "${NEW_INSTALL:-}" = "1" ]; then
  echo "  Setup token:  $(grep -E '^SETUP_TOKEN=' .env | cut -d= -f2-)"
  echo
  echo "  The first screen asks for that token, then creates your founder account."
  echo "  If the page does not load yet, the DNS for $DOMAIN is not pointing here;"
  echo "  the certificate is issued automatically as soon as it does."
else
  echo "  Up to date. Your settings and data were kept."
  echo "  Setup token (only needed if you have not created the first account yet):"
  echo "                $(grep -E '^SETUP_TOKEN=' .env | cut -d= -f2-)"
fi
echo "  Settings:     $DIR/.env    Backups: $DIR/backups (nightly)"
}

# Run only once the whole file has been read. When this script is piped in from
# curl, a command that reads standard input could otherwise swallow the rest of it.
main "$@" </dev/null
