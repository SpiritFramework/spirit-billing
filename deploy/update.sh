#!/usr/bin/env bash
# Redeploy Spirit Billing from the current repo (or --repo-dir).
# Prefer the multi-command helper:
#   sudo bash deploy/spirit-billing.sh update [--repo-dir PATH]
#   sudo bash scripts/spirit.sh update -y
#
# Usage: sudo bash deploy/update.sh [--repo-dir PATH] [--skip-web] [--skip-api] [--force-build]
#   [--panel-url URL] [--panel-web-url URL] [--panel-key KEY] [--admin-email EMAIL]
#   [--with-ssl] [--email EMAIL]
#
# Does not rotate secrets or recreate the database.
# Ticket uploads under billing-api/uploads/ are preserved.

set -euo pipefail

REPO_DIR=""
SKIP_WEB=0
SKIP_API=0
FORCE_BUILD=0
WITH_SSL=0
PANEL_URL=""
PANEL_WEB_URL=""
PANEL_KEY=""
ADMIN_EMAIL=""
CERTBOT_EMAIL=""
APP_ROOT="/opt/spirit-billing"
WEB_ROOT="/var/www/spirit-billing"
APP_GROUP="spirit-billing"
LOCK_FILE="/var/lock/spirit-billing-update.lock"
STAMP_FILE=""

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

strip_crlf() {
  local f
  for f in "$@"; do
    [[ -f "$f" ]] || continue
    sed -i 's/\r$//' "$f"
  done
}

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

file_hash() {
  local f="$1"
  [[ -f "$f" ]] || { echo "missing"; return; }
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  else
    # crude fallback
    wc -c < "$f" | tr -d ' '
  fi
}

compute_stamp() {
  local commit="nogit"
  if [[ -d "$REPO_DIR/.git" ]]; then
    commit="$(git -c safe.directory="$REPO_DIR" -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo nogit)"
  fi
  printf '%s|%s|%s|%s\n' \
    "$commit" \
    "$(file_hash "$REPO_DIR/billing-api/package-lock.json")" \
    "$(file_hash "$REPO_DIR/billing-web/package-lock.json")" \
    "$(file_hash "$REPO_DIR/billing-api/prisma/schema.prisma")"
}

write_stamp() {
  compute_stamp > "$STAMP_FILE"
  chown root:"$APP_GROUP" "$STAMP_FILE" 2>/dev/null || true
  chmod 644 "$STAMP_FILE" 2>/dev/null || true
}

# Return 0 when installed deps look loadable; 1 when missing/corrupt.
deps_healthy() {
  local api_nm="$APP_ROOT/billing-api/node_modules"
  local web_nm="$APP_ROOT/billing-web/node_modules"
  local pkg

  for pkg in fastify @prisma/client bcryptjs zod; do
    [[ -f "$api_nm/$pkg/package.json" ]] || return 1
  done
  # prisma CLI is re-added after prune; needed for db push on every update
  [[ -f "$api_nm/prisma/package.json" || -x "$api_nm/.bin/prisma" ]] || return 1

  # Directory present is not enough — confirm Node can resolve the runtime.
  if ! (
    cd "$APP_ROOT/billing-api" || exit 1
    node --input-type=module -e "await import('fastify'); await import('@prisma/client');" >/dev/null 2>&1
  ); then
    return 1
  fi

  # Web tree is needed whenever we may rebuild; also if dist is missing.
  if [[ "$SKIP_WEB" -eq 0 ]]; then
    if [[ ! -f "$WEB_ROOT/index.html" ]]; then
      [[ -f "$web_nm/vite/package.json" ]] || return 1
      [[ -f "$web_nm/react/package.json" ]] || return 1
    fi
  fi

  return 0
}

# Echo a short reason on stdout when a rebuild is required; empty = skip ok.
build_reason() {
  [[ "$FORCE_BUILD" -eq 1 ]] && { echo "forced (--force-build)"; return; }
  [[ ! -f "$STAMP_FILE" ]] && { echo "no build stamp yet"; return; }
  [[ ! -f "$APP_ROOT/billing-api/dist/index.js" ]] && { echo "API dist missing"; return; }
  [[ "$SKIP_WEB" -eq 0 && ! -f "$WEB_ROOT/index.html" ]] && { echo "web dist missing"; return; }
  if ! deps_healthy; then
    echo "dependencies missing or broken"
    return
  fi
  local now prev
  now="$(compute_stamp)"
  prev="$(tr -d '\r\n' < "$STAMP_FILE" 2>/dev/null || true)"
  [[ "$now" != "$prev" ]] && { echo "source stamp changed"; return; }
  echo ""
}

needs_build() {
  local reason
  reason="$(build_reason)"
  [[ -n "$reason" ]]
}

poll_health() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 3 http://127.0.0.1:3001/health >/dev/null 2>&1; then
      log "API health OK"
      return 0
    fi
    sleep 1
  done
  warn "API health check did not pass within 10s — check: journalctl -u spirit-billing -n 50"
  return 1
}

sync_tree() {
  log "Syncing code from $REPO_DIR"
  # Preserve runtime uploads and build artefacts; never delete .env
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

  rsync -a "$REPO_DIR/deploy/" "$APP_ROOT/deploy/"
  chown -R root:"$APP_GROUP" "$APP_ROOT"
  [[ -f "$APP_ROOT/.env" ]] || die "Missing $APP_ROOT/.env after sync"
  chmod 640 "$APP_ROOT/.env"
  chmod 755 "$APP_ROOT/deploy/"*.sh 2>/dev/null || true
  chmod 755 "$APP_ROOT/scripts/"*.sh 2>/dev/null || true
  strip_crlf \
    "$APP_ROOT/deploy/install.sh" \
    "$APP_ROOT/deploy/update.sh" \
    "$APP_ROOT/deploy/spirit-billing.sh" \
    "$APP_ROOT/scripts/spirit.sh"
  ln -sfn ../.env "$APP_ROOT/billing-api/.env"
  mkdir -p "$APP_ROOT/billing-api/uploads/tickets"
  chown -R spirit-billing:spirit-billing "$APP_ROOT/billing-api/uploads"
  chmod -R u+rwX,g+rX "$APP_ROOT/billing-api/uploads"
}

# npm/tsc run as root can leave dist/node_modules unreadable by User=spirit-billing
fix_api_runtime_perms() {
  chown -R root:"$APP_GROUP" "$APP_ROOT/billing-api"
  if [[ -d "$APP_ROOT/billing-api/dist" ]]; then
    chmod -R a+rX "$APP_ROOT/billing-api/dist"
  fi
  if [[ -d "$APP_ROOT/billing-api/node_modules" ]]; then
    chmod -R a+rX "$APP_ROOT/billing-api/node_modules"
  fi
  mkdir -p "$APP_ROOT/billing-api/uploads/tickets"
  chown -R spirit-billing:spirit-billing "$APP_ROOT/billing-api/uploads"
  chmod -R u+rwX,g+rX "$APP_ROOT/billing-api/uploads"
}

env_set_key() {
  local file="$1" key="$2" val="$3" tmp
  tmp="$(mktemp)"
  grep -vE "^${key}=" "$file" > "$tmp" || true
  val="${val//\"/\\\"}"
  printf '%s="%s"\n' "$key" "$val" >> "$tmp"
  cat "$tmp" > "$file"
  rm -f "$tmp"
}

apply_optional_env() {
  local env_file="$APP_ROOT/.env"
  [[ -f "$env_file" ]] || return 0
  local changed=0
  if [[ -n "$PANEL_URL" ]]; then
    env_set_key "$env_file" PANEL_API_URL "$PANEL_URL"
    changed=1
  fi
  if [[ -n "$PANEL_WEB_URL" ]]; then
    env_set_key "$env_file" PANEL_WEB_URL "$PANEL_WEB_URL"
    changed=1
  fi
  if [[ -n "$PANEL_KEY" ]]; then
    env_set_key "$env_file" PANEL_APPLICATION_API_KEY "$PANEL_KEY"
    changed=1
  fi
  if [[ -n "$ADMIN_EMAIL" ]]; then
    env_set_key "$env_file" ADMIN_EMAIL "$ADMIN_EMAIL"
    changed=1
  fi
  env_set_key "$env_file" BILLING_LIFECYCLE_SCHEDULER "true"
  chown root:"$APP_GROUP" "$env_file"
  chmod 640 "$env_file"
  log "Lifecycle scheduler enabled (renewals, trial wipe, overdue)"
  if [[ "$changed" -eq 1 ]]; then
    log "Updated Panel / admin settings in .env"
  fi
}

domain_from_env() {
  local url d
  url="$(grep -E '^BILLING_URL=' "$APP_ROOT/.env" | head -n1 | cut -d= -f2- | tr -d '\r"')"
  d="${url#https://}"; d="${d#http://}"; d="${d%%/*}"; d="${d%%:*}"
  printf '%s' "$d"
}

maybe_ssl_update() {
  [[ "$WITH_SSL" -eq 1 ]] || return 0
  local domain
  domain="$(domain_from_env)"
  [[ -n "$domain" ]] || { warn "Cannot enable SSL — BILLING_URL domain unknown"; return 0; }
  log "Requesting Let's Encrypt certificate for $domain"
  local email_args=(--non-interactive --agree-tos)
  if [[ -n "$CERTBOT_EMAIL" ]]; then
    email_args+=(--email "$CERTBOT_EMAIL")
  elif [[ -n "$ADMIN_EMAIL" ]]; then
    email_args+=(--email "$ADMIN_EMAIL")
  else
    email_args+=(--register-unsafely-without-email)
  fi
  command -v certbot >/dev/null 2>&1 || apt-get install -y certbot python3-certbot-nginx
  if certbot --nginx -d "$domain" "${email_args[@]}"; then
    sed "s/billing.example.com/${domain}/g" \
      "$APP_ROOT/deploy/nginx/spirit-billing.conf" > /etc/nginx/sites-available/spirit-billing
    nginx -t && systemctl reload nginx
    env_set_key "$APP_ROOT/.env" BILLING_URL "https://${domain}"
    env_set_key "$APP_ROOT/.env" CORS_ORIGINS "https://${domain}"
  else
    warn "certbot failed during update — site left as-is"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir) REPO_DIR="${2:-}"; shift 2 ;;
    --skip-web) SKIP_WEB=1; shift ;;
    --skip-api) SKIP_API=1; shift ;;
    --force-build) FORCE_BUILD=1; shift ;;
    --with-ssl) WITH_SSL=1; shift ;;
    --panel-url) PANEL_URL="${2:-}"; shift 2 ;;
    --panel-web-url) PANEL_WEB_URL="${2:-}"; shift 2 ;;
    --panel-key) PANEL_KEY="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --email) CERTBOT_EMAIL="${2:-}"; shift 2 ;;
    --domain) shift 2 ;; # accepted/ignored — domain comes from .env on update
    *) die "Unknown argument: $1" ;;
  esac
done

[[ -n "$PANEL_URL" && -z "$PANEL_WEB_URL" ]] && PANEL_WEB_URL="$PANEL_URL"

[[ "$(id -u)" -eq 0 ]] || die "Run as root"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
[[ -d "$REPO_DIR/billing-api" ]] || die "Repo not found: $REPO_DIR"
[[ -f "$APP_ROOT/.env" ]] || die "Missing $APP_ROOT/.env — run install.sh first"
STAMP_FILE="$APP_ROOT/.spirit-build-stamp"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || die "Another update is running"

sync_tree
apply_optional_env
maybe_ssl_update

BUILD=0
BUILD_REASON="$(build_reason)"
if [[ -n "$BUILD_REASON" ]]; then
  BUILD=1
  log "Build required — $BUILD_REASON"
else
  log "Deps healthy and source stamp unchanged — skipping npm install/build (use --force-build to override)"
fi

if [[ "$SKIP_API" -eq 0 ]]; then
  cd "$APP_ROOT/billing-api"
  load_env
  if [[ "$BUILD" -eq 1 ]]; then
    log "Rebuilding API"
    npm ci --include=dev
    npx prisma generate
    npx prisma db push
    npm run build
    npm prune --omit=dev
    npm install --no-save --omit=dev prisma@6.9.0
  else
    log "Applying schema (prisma db push)"
    npx prisma generate
    npx prisma db push
  fi
  fix_api_runtime_perms
  # Restart only after a successful build/schema step
  cp "$APP_ROOT/deploy/systemd/spirit-billing.service" /etc/systemd/system/spirit-billing.service
  systemctl daemon-reload
  systemctl restart spirit-billing
fi

if [[ "$SKIP_WEB" -eq 0 ]]; then
  if [[ "$BUILD" -eq 1 || ! -f "$WEB_ROOT/index.html" ]]; then
    log "Rebuilding web"
    cd "$APP_ROOT/billing-web"
    npm ci --include=dev
    npm run build
    rsync -a --delete "$APP_ROOT/billing-web/dist/" "$WEB_ROOT/"
    chown -R www-data:www-data "$WEB_ROOT"
  else
    log "Web dist unchanged — skipping web rebuild"
  fi
fi

write_stamp
systemctl --no-pager --full status spirit-billing || true
poll_health || true
log "Update complete"
