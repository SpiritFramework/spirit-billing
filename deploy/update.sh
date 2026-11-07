#!/usr/bin/env bash
# Redeploy Spirit Billing from the current repo (or --repo-dir).
# Prefer the multi-command helper:
#   sudo bash deploy/spirit-billing.sh update [--repo-dir PATH]
#
# Usage: sudo bash deploy/update.sh [--repo-dir PATH] [--skip-web] [--skip-api]
#
# Does not rotate secrets or recreate the database.

set -euo pipefail

REPO_DIR=""
SKIP_WEB=0
SKIP_API=0
APP_ROOT="/opt/spirit-billing"
WEB_ROOT="/var/www/spirit-billing"
APP_GROUP="spirit-billing"
LOCK_FILE="/var/lock/spirit-billing-update.lock"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
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

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-dir) REPO_DIR="${2:-}"; shift 2 ;;
    --skip-web) SKIP_WEB=1; shift ;;
    --skip-api) SKIP_API=1; shift ;;
    *) die "Unknown argument: $1" ;;
  esac
done

[[ "$(id -u)" -eq 0 ]] || die "Run as root"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
[[ -d "$REPO_DIR/billing-api" ]] || die "Repo not found: $REPO_DIR"
[[ -f "$APP_ROOT/.env" ]] || die "Missing $APP_ROOT/.env — run install.sh first"

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || die "Another update is running"

log "Syncing code"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'billing-api/dist' \
  --exclude 'billing-web/dist' \
  --exclude '**/Spirit-PanelV4' \
  --exclude '**/.env' \
  "$REPO_DIR/billing-api" "$REPO_DIR/billing-web" "$REPO_DIR/deploy" \
  "$APP_ROOT/"
rsync -a "$REPO_DIR/deploy/" "$APP_ROOT/deploy/"
chown -R root:"$APP_GROUP" "$APP_ROOT"
chmod 640 "$APP_ROOT/.env"
chmod 755 "$APP_ROOT/deploy/"*.sh 2>/dev/null || true
strip_crlf "$APP_ROOT/deploy/install.sh" "$APP_ROOT/deploy/update.sh"
ln -sfn ../.env "$APP_ROOT/billing-api/.env"

if [[ "$SKIP_API" -eq 0 ]]; then
  log "Rebuilding API"
  cd "$APP_ROOT/billing-api"
  npm ci --include=dev
  load_env
  npx prisma generate
  npx prisma db push
  npm run build
  npm prune --omit=dev
  npm install --no-save --omit=dev prisma@6.9.0
  # Ticket uploads: service user must own this tree (ProtectSystem=strict)
  mkdir -p "$APP_ROOT/billing-api/uploads/tickets"
  chown -R spirit-billing:spirit-billing "$APP_ROOT/billing-api/uploads"
  chmod -R u+rwX,g+rX "$APP_ROOT/billing-api/uploads"
  cp "$APP_ROOT/deploy/systemd/spirit-billing.service" /etc/systemd/system/spirit-billing.service
  systemctl daemon-reload
  systemctl restart spirit-billing
fi

if [[ "$SKIP_WEB" -eq 0 ]]; then
  log "Rebuilding web"
  cd "$APP_ROOT/billing-web"
  npm ci --include=dev
  npm run build
  rsync -a --delete "$APP_ROOT/billing-web/dist/" "$WEB_ROOT/"
  chown -R www-data:www-data "$WEB_ROOT"
fi

systemctl --no-pager --full status spirit-billing || true
log "Update complete"
