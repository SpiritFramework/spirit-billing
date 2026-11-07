#!/usr/bin/env bash
# Spirit Billing — Ubuntu 22.04 production installer
# Prefer the multi-command helper:
#   sudo bash deploy/spirit-billing.sh install --domain billing.example.com
#   sudo bash deploy/spirit-billing.sh auto --domain billing.example.com
#
# Usage (from repo root, as root):
#   sudo bash deploy/install.sh --domain billing.example.com
#
# Optional flags:
#   --domain NAME          Public hostname (required)
#   --repo-dir PATH        Source tree (default: parent of deploy/)
#   --skip-packages        Skip apt / Node install
#   --skip-db              Skip MariaDB database creation
#   --skip-seed            Skip admin seed
#   --with-ssl             Run certbot after nginx is up (DNS must point here)
#   --panel-url URL        Write PANEL_API_URL (+ PANEL_WEB_URL if unset)
#   --panel-web-url URL    Write PANEL_WEB_URL
#   --panel-key KEY        Write PANEL_APPLICATION_API_KEY
#   --admin-email EMAIL    Write ADMIN_EMAIL (seed)
#   --email EMAIL          Certbot contact email

set -euo pipefail

DOMAIN=""
REPO_DIR=""
SKIP_PACKAGES=0
SKIP_DB=0
SKIP_SEED=0
WITH_SSL=0
PANEL_URL=""
PANEL_WEB_URL=""
PANEL_KEY=""
ADMIN_EMAIL=""
CERTBOT_EMAIL=""
APP_ROOT="/opt/spirit-billing"
WEB_ROOT="/var/www/spirit-billing"
APP_USER="spirit-billing"
APP_GROUP="spirit-billing"
LOCK_FILE="/var/lock/spirit-billing-install.lock"
NODE_MAJOR=20

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

# WinSCP/zip from Windows often ships CRLF — strip before bash/source
strip_crlf() {
  local f
  for f in "$@"; do
    [[ -f "$f" ]] || continue
    sed -i 's/\r$//' "$f"
  done
}

# Safe KEY=VALUE loader (do not `source` — values with spaces would execute as commands)
load_env() {
  local env_file="${1:-$APP_ROOT/.env}"
  local line key val
  [[ -f "$env_file" ]] || die "Missing env file: $env_file"
  strip_crlf "$env_file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key="${BASH_REMATCH[1]}"
    val="${BASH_REMATCH[2]}"
    if [[ "$val" =~ ^\"(.*)\"$ ]]; then
      val="${BASH_REMATCH[1]}"
    elif [[ "$val" =~ ^\'(.*)\'$ ]]; then
      val="${BASH_REMATCH[1]}"
    fi
    printf -v "$key" '%s' "$val"
    export "$key"
  done < "$env_file"
}

usage() {
  sed -n '2,14p' "$0" | sed 's/^# \?//'
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --repo-dir) REPO_DIR="${2:-}"; shift 2 ;;
    --skip-packages) SKIP_PACKAGES=1; shift ;;
    --skip-db) SKIP_DB=1; shift ;;
    --skip-seed) SKIP_SEED=1; shift ;;
    --with-ssl) WITH_SSL=1; shift ;;
    --panel-url) PANEL_URL="${2:-}"; shift 2 ;;
    --panel-web-url) PANEL_WEB_URL="${2:-}"; shift 2 ;;
    --panel-key) PANEL_KEY="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --email) CERTBOT_EMAIL="${2:-}"; shift 2 ;;
    -h|--help) usage ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "$PANEL_URL" && -z "$PANEL_WEB_URL" ]] && PANEL_WEB_URL="$PANEL_URL"

[[ "$(id -u)" -eq 0 ]] || die "Run as root: sudo bash deploy/install.sh --domain billing.example.com"
[[ -n "$DOMAIN" ]] || die "Missing --domain (e.g. billing.example.com)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "$REPO_DIR" ]]; then
  REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
[[ -d "$REPO_DIR/billing-api" && -d "$REPO_DIR/billing-web" ]] \
  || die "Repo not found at $REPO_DIR (expected billing-api + billing-web)"

# Prevent concurrent installs
mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  die "Another install is running (lock: $LOCK_FILE)"
fi

export DEBIAN_FRONTEND=noninteractive

install_packages() {
  log "Installing system packages"
  apt-get update -y
  apt-get install -y \
    ca-certificates curl gnupg build-essential \
    nginx mariadb-server \
    ufw fail2ban \
    openssl rsync

  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null | sed 's/v//;s/\..*//')" -lt "$NODE_MAJOR" ]]; then
    log "Installing Node.js ${NODE_MAJOR}.x"
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi

  if ! command -v certbot >/dev/null 2>&1; then
    apt-get install -y certbot python3-certbot-nginx
  fi

  node -v
  npm -v
}

create_user_and_dirs() {
  log "Creating user and directories"
  if ! id "$APP_USER" >/dev/null 2>&1; then
    useradd --system --home "$APP_ROOT" --shell /usr/sbin/nologin "$APP_USER"
  fi

  mkdir -p "$APP_ROOT" "$WEB_ROOT" /var/www/html
  # Deploy tree owned by root; runtime user can read API and write only what it needs
  chown root:"$APP_GROUP" "$APP_ROOT"
  chmod 755 "$APP_ROOT"
  chown www-data:www-data "$WEB_ROOT"
  chmod 755 "$WEB_ROOT"
}

sync_application() {
  log "Syncing application to $APP_ROOT"
  # Preserve ticket uploads across reinstalls; never sync .env from the repo
  rsync -a --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'dist' \
    --exclude 'uploads' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude 'Spirit-PanelV4' \
    "$REPO_DIR/billing-api" "$REPO_DIR/billing-web" "$REPO_DIR/deploy" \
    "$APP_ROOT/"

  if [[ -d "$REPO_DIR/scripts" ]]; then
    mkdir -p "$APP_ROOT/scripts"
    rsync -a "$REPO_DIR/scripts/" "$APP_ROOT/scripts/"
  fi

  mkdir -p "$APP_ROOT/deploy"
  rsync -a "$REPO_DIR/deploy/" "$APP_ROOT/deploy/"

  chown -R root:"$APP_GROUP" "$APP_ROOT"
  find "$APP_ROOT" -type d -exec chmod 755 {} \;
  find "$APP_ROOT" -type f -exec chmod 644 {} \;
  chmod 755 "$APP_ROOT/deploy/"*.sh 2>/dev/null || true
  chmod 755 "$APP_ROOT/scripts/"*.sh 2>/dev/null || true
  strip_crlf \
    "$APP_ROOT/deploy/install.sh" \
    "$APP_ROOT/deploy/update.sh" \
    "$APP_ROOT/deploy/spirit-billing.sh" \
    "$APP_ROOT/deploy/env.production.example" \
    "$APP_ROOT/deploy/nginx/spirit-billing.conf" \
    "$APP_ROOT/deploy/nginx/spirit-billing.http-only.conf" \
    "$APP_ROOT/deploy/systemd/spirit-billing.service" \
    "$APP_ROOT/scripts/spirit.sh"
}

env_set_key() {
  local file="$1" key="$2" val="$3" tmp
  tmp="$(mktemp)"
  # Drop existing key (if any), then append a safely quoted value
  grep -vE "^${key}=" "$file" > "$tmp" || true
  # Escape embedded double-quotes only
  val="${val//\"/\\\"}"
  printf '%s="%s"\n' "$key" "$val" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

apply_optional_env() {
  local env_file="$APP_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  if [[ -n "$PANEL_URL" ]]; then
    env_set_key "$env_file" PANEL_API_URL "$PANEL_URL"
    log "Set PANEL_API_URL"
  fi
  if [[ -n "$PANEL_WEB_URL" ]]; then
    env_set_key "$env_file" PANEL_WEB_URL "$PANEL_WEB_URL"
    log "Set PANEL_WEB_URL"
  fi
  if [[ -n "$PANEL_KEY" ]]; then
    env_set_key "$env_file" PANEL_APPLICATION_API_KEY "$PANEL_KEY"
    log "Set PANEL_APPLICATION_API_KEY"
  fi
  if [[ -n "$ADMIN_EMAIL" ]]; then
    env_set_key "$env_file" ADMIN_EMAIL "$ADMIN_EMAIL"
  fi
}

ensure_env() {
  local env_file="$APP_ROOT/.env"
  if [[ -f "$env_file" ]]; then
    log "Keeping existing $env_file"
  else
    log "Creating $env_file from template"
    cp "$APP_ROOT/deploy/env.production.example" "$env_file"
    local jwt secrets dbpass adminpass
    jwt="$(openssl rand -base64 48 | tr -d '\n')"
    secrets="$(openssl rand -base64 48 | tr -d '\n')"
    # Alphanumeric only — safe for DATABASE_URL and shell/SQL quoting
    dbpass="$(openssl rand -hex 16)"
    adminpass="$(openssl rand -hex 12)Aa1"

    sed -i \
      -e "s|^BILLING_URL=.*|BILLING_URL=https://${DOMAIN}|" \
      -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|" \
      -e "s|^JWT_SECRET=.*|JWT_SECRET=${jwt}|" \
      -e "s|^SECRETS_ENCRYPTION_KEY=.*|SECRETS_ENCRYPTION_KEY=${secrets}|" \
      -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=${adminpass}|" \
      -e "s|CHANGE_ME_DB_PASSWORD|${dbpass}|g" \
      "$env_file"

    if [[ -n "$ADMIN_EMAIL" ]]; then
      env_set_key "$env_file" ADMIN_EMAIL "$ADMIN_EMAIL"
    fi

    # Store generated DB password for MariaDB setup
    printf '%s\n' "$dbpass" > "$APP_ROOT/.dbpass"
    chmod 600 "$APP_ROOT/.dbpass"
    chown root:root "$APP_ROOT/.dbpass"

    printf '%s\n' "$adminpass" > "$APP_ROOT/.adminpass"
    chmod 600 "$APP_ROOT/.adminpass"
    chown root:root "$APP_ROOT/.adminpass"

    warn "Generated secrets written to $env_file"
    warn "One-time admin password saved at $APP_ROOT/.adminpass (delete after first login)"
  fi

  apply_optional_env

  strip_crlf "$env_file"
  # Quote unquoted values that contain spaces (common WinSCP/template pitfall)
  if grep -qE '^COMPANY_NAME=[^"].* ' "$env_file"; then
    sed -i 's/^COMPANY_NAME=\(.*\)$/COMPANY_NAME="\1"/' "$env_file"
  fi
  if grep -qE '^PAYMENT_INSTRUCTIONS=[^"]' "$env_file"; then
    sed -i 's/^PAYMENT_INSTRUCTIONS=\(.*\)$/PAYMENT_INSTRUCTIONS="\1"/' "$env_file"
  fi
  chown root:"$APP_GROUP" "$env_file"
  chmod 640 "$env_file"
  # Prisma / dotenv resolve billing-api/.env → point at the locked secrets file
  ln -sfn ../.env "$APP_ROOT/billing-api/.env"
}

setup_database() {
  log "Configuring MariaDB database"
  systemctl enable --now mariadb

  local dbpass
  if [[ -f "$APP_ROOT/.dbpass" ]]; then
    dbpass="$(cat "$APP_ROOT/.dbpass")"
  else
    # Extract from existing DATABASE_URL if re-running
    dbpass="$(grep -E '^DATABASE_URL=' "$APP_ROOT/.env" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')"
  fi
  [[ -n "$dbpass" ]] || die "Could not determine DB password"

  mysql -e "CREATE DATABASE IF NOT EXISTS spirit_billing CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  mysql -e "CREATE USER IF NOT EXISTS 'spirit_billing'@'localhost' IDENTIFIED BY '${dbpass}';"
  # MariaDB <10.4 may not support IF NOT EXISTS for users — fall back
  mysql -e "ALTER USER 'spirit_billing'@'localhost' IDENTIFIED BY '${dbpass}';" 2>/dev/null \
    || mysql -e "CREATE USER 'spirit_billing'@'localhost' IDENTIFIED BY '${dbpass}';" 2>/dev/null \
    || true
  mysql -e "GRANT ALL PRIVILEGES ON spirit_billing.* TO 'spirit_billing'@'localhost'; FLUSH PRIVILEGES;"

  # Rewrite DATABASE_URL with known password
  sed -i -E "s|^DATABASE_URL=.*|DATABASE_URL=\"mysql://spirit_billing:${dbpass}@127.0.0.1:3306/spirit_billing\"|" \
    "$APP_ROOT/.env"
}

build_api() {
  log "Building billing-api"
  cd "$APP_ROOT/billing-api"
  # Full install for build (tsc/prisma), then prune to production deps
  npm ci --include=dev
  load_env
  npx prisma generate
  npx prisma db push
  npm run build
  npm prune --omit=dev
  # Keep prisma CLI for future schema pushes via update.sh
  npm install --no-save --omit=dev prisma@6.9.0
  chown -R root:"$APP_GROUP" "$APP_ROOT/billing-api"
  chmod -R a+rX "$APP_ROOT/billing-api/dist" "$APP_ROOT/billing-api/node_modules"
  mkdir -p "$APP_ROOT/billing-api/uploads/tickets"
  chown -R spirit-billing:spirit-billing "$APP_ROOT/billing-api/uploads"
  chmod -R u+rwX,g+rX "$APP_ROOT/billing-api/uploads"
}

seed_admin() {
  log "Seeding admin user (if needed)"
  cd "$APP_ROOT/billing-api"
  load_env
  # tsx is a build-time dep; install temporarily for seed
  npm install --no-save tsx@4.20.3 >/dev/null
  npx tsx prisma/seed.ts || warn "Seed skipped or already exists"
  npm uninstall tsx >/dev/null 2>&1 || true
}

build_web() {
  log "Building billing-web"
  cd "$APP_ROOT/billing-web"
  # NODE_ENV=production would omit typescript/vite — force full install for build
  npm ci --include=dev
  npm run build
  rsync -a --delete "$APP_ROOT/billing-web/dist/" "$WEB_ROOT/"
  chown -R www-data:www-data "$WEB_ROOT"
  find "$WEB_ROOT" -type d -exec chmod 755 {} \;
  find "$WEB_ROOT" -type f -exec chmod 644 {} \;
}

install_systemd() {
  log "Installing systemd unit"
  cp "$APP_ROOT/deploy/systemd/spirit-billing.service" /etc/systemd/system/spirit-billing.service
  systemctl daemon-reload
  systemctl enable spirit-billing
  systemctl restart spirit-billing
  sleep 2
  systemctl --no-pager --full status spirit-billing || true
}

install_nginx() {
  log "Installing nginx site for $DOMAIN"
  local conf_src conf_dst
  conf_dst="/etc/nginx/sites-available/spirit-billing"

  if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    conf_src="$APP_ROOT/deploy/nginx/spirit-billing.conf"
  else
    conf_src="$APP_ROOT/deploy/nginx/spirit-billing.http-only.conf"
  fi

  sed "s/billing.example.com/${DOMAIN}/g" "$conf_src" > "$conf_dst"
  ln -sfn "$conf_dst" /etc/nginx/sites-enabled/spirit-billing
  # Remove default site if present (optional)
  rm -f /etc/nginx/sites-enabled/default

  nginx -t
  systemctl enable --now nginx
  systemctl reload nginx
}

configure_firewall() {
  log "Configuring UFW"
  ufw allow OpenSSH >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
  ufw status || true
}

maybe_ssl() {
  if [[ "$WITH_SSL" -eq 1 ]]; then
    log "Requesting Let's Encrypt certificate for $DOMAIN"
    local email_args=(--non-interactive --agree-tos)
    if [[ -n "$CERTBOT_EMAIL" ]]; then
      email_args+=(--email "$CERTBOT_EMAIL")
    elif [[ -n "$ADMIN_EMAIL" ]]; then
      email_args+=(--email "$ADMIN_EMAIL")
    else
      email_args+=(--register-unsafely-without-email)
    fi
    if ! certbot --nginx -d "$DOMAIN" "${email_args[@]}"; then
      warn "certbot failed — continuing on HTTP. Fix DNS, then: sudo bash ${APP_ROOT}/scripts/spirit.sh ssl"
      return 0
    fi
    # Switch to full HTTPS template after certbot
    sed "s/billing.example.com/${DOMAIN}/g" \
      "$APP_ROOT/deploy/nginx/spirit-billing.conf" > /etc/nginx/sites-available/spirit-billing
    nginx -t && systemctl reload nginx
    # Ensure public URLs use https
    sed -i \
      -e "s|^BILLING_URL=.*|BILLING_URL=https://${DOMAIN}|" \
      -e "s|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${DOMAIN}|" \
      "$APP_ROOT/.env"
  else
    warn "SSL not enabled yet. After DNS points to this server:"
    warn "  sudo bash ${APP_ROOT}/scripts/spirit.sh ssl --domain ${DOMAIN}"
  fi
}

print_summary() {
  log "Install complete"
  cat <<EOF

File layout
-----------
  ${APP_ROOT}/                 Application (API + deploy helpers)
  ${APP_ROOT}/.env             Secrets (mode 640, root:${APP_GROUP})  ← LOCK THIS
  ${APP_ROOT}/.adminpass       One-time admin password (delete after login)
  ${WEB_ROOT}/                 Public SPA only (www-data)
  /etc/nginx/sites-available/spirit-billing
  /etc/systemd/system/spirit-billing.service

Permissions (locks)
-------------------
  ${APP_ROOT}/.env             640 root:${APP_GROUP}   never world-readable
  ${WEB_ROOT}/                 755/644 www-data         no .env here
  Port 3001                    bound to 127.0.0.1 only

Next steps
----------
  1. Login at https://${DOMAIN}/admin  (password in ${APP_ROOT}/.adminpass)
  2. rm -f ${APP_ROOT}/.adminpass ${APP_ROOT}/.dbpass
  3. If Panel was not passed on the CLI, set PANEL_* in ${APP_ROOT}/.env and restart
  4. If SSL was skipped: point DNS here, then sudo bash ${APP_ROOT}/scripts/spirit.sh ssl

Useful commands
---------------
  sudo bash ${APP_ROOT}/scripts/spirit.sh status
  sudo bash ${APP_ROOT}/scripts/spirit.sh update -y
  sudo bash ${APP_ROOT}/scripts/spirit.sh ssl
  curl -sS http://127.0.0.1:3001/health

Docs: ${APP_ROOT}/deploy/INSTALL.md

EOF
}

# ——— main ———
[[ "$SKIP_PACKAGES" -eq 0 ]] && install_packages
create_user_and_dirs
sync_application
ensure_env
[[ "$SKIP_DB" -eq 0 ]] && setup_database
build_api
[[ "$SKIP_SEED" -eq 0 ]] && seed_admin
build_web
install_systemd
install_nginx
configure_firewall
maybe_ssl

# Smoke-check the API before declaring success
log "Checking API health"
ok_health=0
for _i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/health >/dev/null 2>&1; then
    ok_health=1
    break
  fi
  sleep 1
done
if [[ "$ok_health" -eq 1 ]]; then
  log "API health OK"
else
  warn "API health check failed — run: journalctl -u spirit-billing -n 80 --no-pager"
fi

print_summary
