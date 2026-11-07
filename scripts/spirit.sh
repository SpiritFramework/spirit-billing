#!/usr/bin/env bash
#
# Spirit-Billing — one-command installer & updater
#
#   curl -fsSL https://raw.githubusercontent.com/SpiritFramework/spirit-billing/main/scripts/spirit.sh -o /tmp/spirit-billing.sh
#   sudo bash /tmp/spirit-billing.sh
#
# Do NOT use: sudo bash <(curl ...)
# sudo closes inherited fds, so /dev/fd/N from process substitution vanishes.
#
# Interactive menu by default. Non-interactive:
#   sudo bash /tmp/spirit-billing.sh install --domain billing.example.com -y
#   sudo bash /tmp/spirit-billing.sh update -y
#   sudo bash /tmp/spirit-billing.sh update --channel release -y
#   sudo bash /tmp/spirit-billing.sh status
#
# Channel (saved in ${CHECKOUT}/.spirit-channel):
#   release  newest non-draft, non-prerelease GitHub Release tag
#   dev      branch main
# --ref REF overrides the channel for this run only.
#
set -uo pipefail

SCRIPT_VERSION="1.1.0"
export GIT_TERMINAL_PROMPT=0

REPO_URL="${SPIRIT_BILLING_REPO_URL:-https://github.com/SpiritFramework/spirit-billing.git}"
REPO_SLUG="${SPIRIT_BILLING_REPO_SLUG:-SpiritFramework/spirit-billing}"
CHECKOUT="${SPIRIT_BILLING_CHECKOUT:-/home/Spirit-Billing}"
APP_ROOT="${SPIRIT_BILLING_APP_ROOT:-/opt/spirit-billing}"
SERVICE_NAME="spirit-billing"
BACKUP_DIR="${SPIRIT_BILLING_BACKUP_DIR:-/var/backups/spirit-billing}"
WEB_ROOT="/var/www/spirit-billing"

LINK_GITHUB="github.com/${REPO_SLUG}"
LINK_DISCORD="discord.gg/tyR6FF8u2a"
LINK_DOCS="github.com/${REPO_SLUG}/blob/main/deploy/INSTALL.md"

ASSUME_YES=0
CHANNEL=""
REF_OVERRIDE=""
DOMAIN=""
WITH_SSL=0
FORCE_BUILD=0
CMD=""
LATEST_TAG_RESOLVED=""

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_CYAN=$'\033[36m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

STEP=0
step() { STEP=$((STEP + 1)); printf '%s==>%s %s%s%s\n' "$C_CYAN" "$C_RESET" "$C_BOLD" "[$STEP] $*" "$C_RESET"; }
ok()   { printf '    %s+%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
info() { printf '    %s-%s %s\n' "$C_DIM" "$C_RESET" "$*"; }
warn() { printf '    %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*"; }
die()  { printf '\n%sError:%s %s\n\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

PHASE_INDEX=0
PHASE_TOTAL=0
PHASE_ALMOST_DONE=0
PHASE_ALMOST_MSG="finishing up"

phase_begin() {
  PHASE_TOTAL="${1:-0}"
  PHASE_INDEX=0
  PHASE_ALMOST_DONE=0
  PHASE_ALMOST_MSG="${2:-finishing up}"
  STEP=0
}

phase() {
  PHASE_INDEX=$((PHASE_INDEX + 1))
  local pct=0
  if [[ "$PHASE_TOTAL" -gt 0 ]]; then
    pct=$((PHASE_INDEX * 100 / PHASE_TOTAL))
    [[ "$pct" -gt 100 ]] && pct=100
  fi
  printf '%s==>%s %s[%s/%s · %s%%] %s%s\n' \
    "$C_CYAN" "$C_RESET" "$C_BOLD" "$PHASE_INDEX" "$PHASE_TOTAL" "$pct" "$*" "$C_RESET"
  if [[ "$PHASE_ALMOST_DONE" -eq 0 && "$pct" -ge 80 ]]; then
    PHASE_ALMOST_DONE=1
    printf '    %sAlmost done — %s%s\n' "$C_DIM" "$PHASE_ALMOST_MSG" "$C_RESET"
  fi
}

banner() {
  clear 2>/dev/null || true
  printf '%s' "$C_CYAN"
  cat <<'ART'
     ____  ____ ___ ____  ___ _____
    / ___||  _ \_ _|  _ \|_ _|_   _|
    \___ \| |_) | || |_) || |  | |
     ___) |  __/| ||  _ < | |  | |
    |____/|_|  |___|_| \_\___| |_|
ART
  printf '%s' "$C_RESET"
  printf '    %sB I L L I N G%s\n\n' "$C_BOLD" "$C_RESET"
  printf '  %sScript Version:%s %s%s%s\n\n' "$C_BOLD" "$C_RESET" "$C_CYAN" "$SCRIPT_VERSION" "$C_RESET"

  local rows=(
    "Github:   ${LINK_GITHUB}"
    "Discord:  ${LINK_DISCORD}"
    "Docs:     ${LINK_DOCS}"
  )
  local w=0 r
  for r in "${rows[@]}"; do (( ${#r} > w )) && w=${#r}; done
  local bar
  bar="$(printf '%*s' "$((w + 4))" '' | tr ' ' '-')"
  printf '  +%s+\n' "$bar"
  for r in "${rows[@]}"; do
    printf '  |  %-*s  |\n' "$w" "$r"
  done
  printf '  +%s+\n\n' "$bar"
}

require_root() {
  [[ "$(id -u)" -eq 0 ]] || die "Run as root: sudo bash $0 $*"
}

detect_os() {
  [[ -f /etc/os-release ]] || die "No /etc/os-release — unsupported OS."
  # shellcheck disable=SC1091
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ok "OS: ${PRETTY_NAME:-$ID}" ;;
    *) die "Supported OS: Ubuntu 22.04+ / Debian 12+. Found: ${PRETTY_NAME:-$ID}" ;;
  esac
}

is_installed() {
  [[ -f "${APP_ROOT}/.env" && -f "${APP_ROOT}/billing-api/package.json" ]]
}

checkout_ready() {
  [[ -f "${CHECKOUT}/deploy/install.sh" && -d "${CHECKOUT}/billing-api" && -d "${CHECKOUT}/billing-web" ]]
}

confirm() {
  local prompt="$1" default="${2:-n}" reply hint="[y/N]"
  [[ "$ASSUME_YES" == "1" ]] && return 0
  [[ ! -t 0 ]] && return 1
  [[ "$default" == "y" ]] && hint="[Y/n]"
  printf '  %s %s ' "$prompt" "$hint" >/dev/tty 2>/dev/null || printf '  %s %s ' "$prompt" "$hint"
  read -r reply || return 1
  reply="${reply:-$default}"
  [[ "$reply" =~ ^[Yy]$ ]]
}

ask() {
  local prompt="$1" default="${2:-}" reply
  [[ ! -t 0 ]] && { echo "$default"; return; }
  if [[ -n "$default" ]]; then
    printf '  %s [%s]: ' "$prompt" "$default" >/dev/tty 2>/dev/null || printf '  %s [%s]: ' "$prompt" "$default"
  else
    printf '  %s: ' "$prompt" >/dev/tty 2>/dev/null || printf '  %s: ' "$prompt"
  fi
  read -r reply || true
  echo "${reply:-$default}"
}

acquire_lock() {
  command -v flock >/dev/null 2>&1 || return 0
  mkdir -p /var/lock 2>/dev/null || return 0
  exec 9>"/var/lock/spirit-billing.lock" || return 0
  flock -n 9 || die "Another spirit-billing installer is already running.
If that is wrong, remove /var/lock/spirit-billing.lock and try again."
}

CHANNEL_FILE() { printf '%s' "${CHECKOUT}/.spirit-channel"; }

read_saved_channel() {
  local f c
  f="$(CHANNEL_FILE)"
  [[ -f "$f" ]] || return 1
  c="$(tr -d '[:space:]' < "$f")"
  case "$c" in
    release|dev) printf '%s' "$c"; return 0 ;;
  esac
  return 1
}

save_channel() {
  [[ "$CHANNEL" == "release" || "$CHANNEL" == "dev" ]] || return 0
  [[ -d "$CHECKOUT" ]] || return 0
  printf '%s\n' "$CHANNEL" > "$(CHANNEL_FILE)"
  chmod 644 "$(CHANNEL_FILE)" 2>/dev/null || true
}

validate_ref() {
  local ref="$1"
  [[ -n "$ref" ]] || die "No git ref to check out."
  [[ "$ref" =~ ^[A-Za-z0-9._/-]+$ ]] || die "Invalid git ref: ${ref}"
  [[ "$ref" != *".."* ]] || die "Invalid git ref: ${ref}"
}

# Strip CR and surrounding quotes from .env values (Windows / WinSCP safe).
env_get() {
  local key="$1" file="${2:-${APP_ROOT}/.env}" val
  [[ -f "$file" ]] || return 1
  val="$(grep -E "^${key}=" "$file" | head -n1 | cut -d= -f2- | tr -d '\r')"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  if [[ "${val}" == \"*\" ]]; then val="${val:1:${#val}-2}"
  elif [[ "${val}" == \'*\' ]]; then val="${val:1:${#val}-2}"
  fi
  printf '%s' "$val"
}

urldecode() {
  local s="${1//+/ }"
  printf '%b' "${s//%/\\x}"
}

cnf_escape() {
  local s="${1//\\/\\\\}"
  printf '%s' "${s//\"/\\\"}"
}

# Parse mysql://user:pass@host:port/db — password may be percent-encoded and may contain @.
parse_database_url() {
  local url="$1" rest user pass hostport db host port
  [[ "$url" == mysql://* ]] || return 1
  rest="${url#mysql://}"
  # Split credentials on the LAST @
  if [[ "$rest" != *@* ]]; then return 1; fi
  userpass="${rest%@*}"
  hostdb="${rest##*@}"
  user="${userpass%%:*}"
  pass="${userpass#*:}"
  [[ "$userpass" == *:* ]] || pass=""
  db="${hostdb#*/}"
  db="${db%%\?*}"
  hostport="${hostdb%%/*}"
  host="${hostport%%:*}"
  port=""
  if [[ "$hostport" == *:* ]]; then
    port="${hostport#*:}"
  fi
  user="$(urldecode "$user")"
  pass="$(urldecode "$pass")"
  printf '%s\n' "$user" "$pass" "$host" "${port:-3306}" "$db"
}

github_curl() {
  curl -fsSL --max-time 20 \
    -H "Accept: application/vnd.github+json" \
    -H "User-Agent: spirit-billing-installer/${SCRIPT_VERSION}" \
    "$@"
}

latest_release_tag() {
  if [[ -n "${LATEST_TAG_RESOLVED:-}" ]]; then
    [[ "$LATEST_TAG_RESOLVED" == "-" ]] && return 1
    printf '%s' "$LATEST_TAG_RESOLVED"
    return 0
  fi
  local body tag draft pre
  body="$(github_curl "https://api.github.com/repos/${REPO_SLUG}/releases/latest" 2>/dev/null)" || body=""
  if [[ -n "$body" ]] && printf '%s' "$body" | grep -q '"tag_name"'; then
    draft="$(printf '%s' "$body" | grep -oE '"draft"[[:space:]]*:[[:space:]]*(true|false)' | head -n1 || true)"
    pre="$(printf '%s' "$body" | grep -oE '"prerelease"[[:space:]]*:[[:space:]]*(true|false)' | head -n1 || true)"
    if [[ "$draft" != *true* && "$pre" != *true* ]]; then
      tag="$(printf '%s' "$body" | grep -oE '"tag_name"[[:space:]]*:[[:space:]]*"[^"]+"' | head -n1 | sed -E 's/.*"([^"]+)"$/\1/')"
    fi
  fi
  if [[ -z "${tag:-}" ]]; then
    tag="$(git ls-remote --tags "$REPO_URL" 2>/dev/null | awk '{print $2}' | sed 's#refs/tags/##' | sed 's/\^{}$//' | grep -E '^[Vv]?[0-9]+(\.[0-9]+){1,3}$' | sort -V | tail -n1 || true)"
  fi
  if [[ -z "${tag:-}" ]]; then
    LATEST_TAG_RESOLVED="-"
    return 1
  fi
  LATEST_TAG_RESOLVED="$tag"
  printf '%s' "$tag"
}

resolve_target_ref() {
  if [[ -n "$REF_OVERRIDE" ]]; then
    validate_ref "$REF_OVERRIDE"
    printf '%s' "$REF_OVERRIDE"
    return 0
  fi
  case "$CHANNEL" in
    release)
      local tag
      tag="$(latest_release_tag)" || die "No GitHub Release found. Use --channel dev or --ref <tag>."
      printf '%s' "$tag"
      ;;
    dev|*)
      printf '%s' "main"
      ;;
  esac
}

ensure_packages_minimal() {
  command -v git >/dev/null 2>&1 || apt-get install -y git
  command -v curl >/dev/null 2>&1 || apt-get install -y curl
  command -v rsync >/dev/null 2>&1 || apt-get install -y rsync
}

repo_git() {
  git -c safe.directory="$CHECKOUT" -C "$CHECKOUT" "$@"
}

ensure_checkout() {
  step "Source checkout → ${CHECKOUT}"
  ensure_packages_minimal
  mkdir -p "$(dirname "$CHECKOUT")"

  local target
  target="$(resolve_target_ref)"
  info "Target ref: ${target} (channel=${CHANNEL:-dev})"

  if [[ -d "${CHECKOUT}/.git" ]]; then
    ok "Existing git checkout"
    repo_git remote set-url origin "$REPO_URL" 2>/dev/null || true
    if ! repo_git fetch --tags --prune origin; then
      die "git fetch failed for ${REPO_URL}"
    fi
    if [[ -n "$(repo_git status --porcelain 2>/dev/null)" ]]; then
      warn "Local changes in ${CHECKOUT}"
      if confirm "Stash local changes and continue?" "y"; then
        repo_git stash push -u -m "spirit-billing-installer $(date -u +%Y%m%dT%H%M%SZ)" || true
      else
        die "Update cancelled — clean or stash ${CHECKOUT} first."
      fi
    fi
    # Prefer exact tag, then origin/<branch>. Never fall through to upstream tracking.
    if repo_git rev-parse --verify "refs/tags/${target}" >/dev/null 2>&1; then
      repo_git checkout -f "refs/tags/${target}"
    elif repo_git rev-parse --verify "origin/${target}" >/dev/null 2>&1; then
      repo_git checkout -B "$target" "origin/${target}"
    else
      repo_git checkout -f "$target" || die "Could not check out ref: ${target}"
    fi
  else
    if [[ -e "$CHECKOUT" && ! -d "${CHECKOUT}/.git" ]]; then
      if checkout_ready; then
        warn "${CHECKOUT} exists but is not a git clone — using as --repo-dir (zip-style)."
        return 0
      fi
      die "${CHECKOUT} exists and is not a usable Spirit-Billing tree. Move it aside or set SPIRIT_BILLING_CHECKOUT."
    fi
    info "Cloning ${REPO_URL}"
    rm -rf "$CHECKOUT"
    if [[ "$target" == "main" ]]; then
      git clone --branch main --single-branch "$REPO_URL" "$CHECKOUT" \
        || die "git clone failed"
    else
      git clone "$REPO_URL" "$CHECKOUT" || die "git clone failed"
      if repo_git rev-parse --verify "refs/tags/${target}" >/dev/null 2>&1; then
        repo_git checkout -f "refs/tags/${target}"
      else
        repo_git checkout -f "$target" || die "Could not check out ref: ${target}"
      fi
    fi
  fi

  checkout_ready || die "Checkout incomplete at ${CHECKOUT} (missing billing-api / billing-web / deploy)."
  save_channel
  ok "Checkout ready"
}

strip_crlf_tree() {
  find "${CHECKOUT}/deploy" -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true
  sed -i 's/\r$//' "${CHECKOUT}/scripts/spirit.sh" 2>/dev/null || true
  chmod +x "${CHECKOUT}/deploy/"*.sh "${CHECKOUT}/scripts/spirit.sh" 2>/dev/null || true
}

run_deploy() {
  local action="$1"
  shift
  strip_crlf_tree
  local extra=()
  if [[ "$action" == "update" && "$FORCE_BUILD" == "1" ]]; then
    extra+=(--force-build)
  fi
  bash "${CHECKOUT}/deploy/spirit-billing.sh" "$action" --repo-dir "$CHECKOUT" "${extra[@]}" "$@"
}

dump_database() {
  local dest="$1"
  local dburl user pass host port db cnf
  dburl="$(env_get DATABASE_URL)" || return 1
  mapfile -t parts < <(parse_database_url "$dburl") || return 1
  user="${parts[0]}"; pass="${parts[1]}"; host="${parts[2]}"; port="${parts[3]}"; db="${parts[4]}"
  [[ -n "$user" && -n "$db" ]] || return 1
  command -v mysqldump >/dev/null 2>&1 || { warn "mysqldump not installed"; return 1; }

  cnf="${dest}/mysqldump.cnf"
  umask 077
  cat > "$cnf" <<EOF
[client]
user="$(cnf_escape "$user")"
password="$(cnf_escape "$pass")"
host="${host}"
port="${port}"
EOF

  if mysqldump --defaults-extra-file="$cnf" --single-transaction --routines --triggers "$db" \
      > "${dest}/spirit_billing.sql" 2>"${dest}/mysqldump.err"; then
    rm -f "$cnf"
    ok "Database dump → ${dest}/spirit_billing.sql"
    return 0
  fi

  # MariaDB root often authenticates over the unix socket as root
  warn "App-user dump failed — retrying as root over socket"
  if mysqldump --protocol=socket -u root --single-transaction --routines --triggers "$db" \
      > "${dest}/spirit_billing.sql" 2>>"${dest}/mysqldump.err"; then
    rm -f "$cnf"
    ok "Database dump (root socket) → ${dest}/spirit_billing.sql"
    return 0
  fi

  rm -f "$cnf"
  warn "mysqldump failed — see ${dest}/mysqldump.err"
  return 1
}

backup_before_update() {
  step "Backup"
  mkdir -p "$BACKUP_DIR"
  local stamp dest
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  dest="${BACKUP_DIR}/${stamp}"
  mkdir -p "$dest"
  LAST_BACKUP="$dest"

  if [[ -f "${APP_ROOT}/.env" ]]; then
    cp -a "${APP_ROOT}/.env" "${dest}/.env"
    ok "Saved .env → ${dest}/.env"
  fi

  if [[ -d "${APP_ROOT}/billing-api/uploads" ]]; then
    tar -C "${APP_ROOT}/billing-api" -czf "${dest}/uploads.tgz" uploads 2>/dev/null \
      && ok "Saved uploads → ${dest}/uploads.tgz" \
      || warn "Could not archive uploads"
  fi

  if ! dump_database "$dest"; then
    confirm "Continue update without a database backup?" "n" || die "Update cancelled. Backup folder: ${dest}"
  fi
  info "Backup folder: ${dest}"
}

poll_health() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS --max-time 3 http://127.0.0.1:3001/health >/dev/null 2>&1; then
      ok "API health OK"
      return 0
    fi
    sleep 1
  done
  warn "API health check did not pass — journalctl -u ${SERVICE_NAME} -n 50"
  return 1
}

cmd_install() {
  require_root
  detect_os
  acquire_lock
  phase_begin 4 "starting services"

  if [[ -z "$DOMAIN" ]]; then
    DOMAIN="$(ask "Public billing domain (e.g. billing.example.com)" "")"
  fi
  [[ -n "$DOMAIN" ]] || die "Domain is required."

  if [[ -z "$CHANNEL" ]]; then
    if [[ -t 0 ]]; then
      local choice
      choice="$(ask "Channel — release or dev" "dev")"
      case "$choice" in
        release|dev) CHANNEL="$choice" ;;
        *) CHANNEL="dev" ;;
      esac
    else
      CHANNEL="dev"
    fi
  fi

  if is_installed; then
    warn "Existing install detected at ${APP_ROOT}"
    confirm "Re-run install sync (keeps .env)?" "y" || die "Cancelled."
  fi

  phase "Fetch source"
  ensure_checkout
  phase "Install packages + build"
  local extra=()
  [[ "$WITH_SSL" == "1" ]] && extra+=(--with-ssl)
  run_deploy install --domain "$DOMAIN" "${extra[@]}"
  phase "Verify"
  poll_health || true
  phase "Done"
  ok "Install finished"
  info "Admin password (first install): ${APP_ROOT}/.adminpass — delete after login"
  info "Edit Panel link: ${APP_ROOT}/.env  then: sudo bash ${CHECKOUT}/scripts/spirit.sh restart"
  info "Docs: https://${LINK_DOCS}"
}

cmd_update() {
  require_root
  detect_os
  acquire_lock
  is_installed || die "No install at ${APP_ROOT}. Run: sudo bash $0 install --domain your.domain"
  phase_begin 5 "restarting API"

  if [[ -z "$CHANNEL" ]]; then
    CHANNEL="$(read_saved_channel || true)"
    if [[ -z "$CHANNEL" ]]; then
      if [[ -t 0 ]]; then
        CHANNEL="$(ask "Channel — release or dev" "dev")"
      else
        CHANNEL="dev"
      fi
    fi
  fi
  case "$CHANNEL" in release|dev) ;; *) CHANNEL="dev" ;; esac

  local from to
  from="$(repo_git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  to="$(resolve_target_ref)"
  info "Update ${from} → ${to} (channel=${CHANNEL})"
  confirm "Continue update?" "y" || die "Cancelled."

  phase "Backup"
  backup_before_update
  phase "Fetch source"
  ensure_checkout
  phase "Redeploy"
  run_deploy update
  phase "Verify"
  poll_health || true
  phase "Done"
  ok "Update finished"
  [[ -n "${LAST_BACKUP:-}" ]] && info "Backup kept at ${LAST_BACKUP}"
  systemctl --no-pager --full status "$SERVICE_NAME" || true
  echo
}

cmd_status() {
  require_root
  echo
  if is_installed; then
    ok "Installed at ${APP_ROOT}"
  else
    warn "Not installed (${APP_ROOT}/.env missing)"
  fi
  if checkout_ready; then
    local ver ch commit
    ver="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${CHECKOUT}/billing-api/package.json" 2>/dev/null | head -n1)"
    ch="$(read_saved_channel 2>/dev/null || echo unset)"
    commit="$(repo_git rev-parse --short HEAD 2>/dev/null || echo n/a)"
    info "Checkout: ${CHECKOUT}"
    info "Version:  ${ver:-unknown}  channel=${ch}  commit=${commit}"
    if tag="$(latest_release_tag 2>/dev/null)"; then
      info "Latest release: ${tag}"
    fi
  else
    warn "No source checkout at ${CHECKOUT}"
  fi
  echo
  systemctl --no-pager --full status "$SERVICE_NAME" || true
  echo
  curl -sS --max-time 5 http://127.0.0.1:3001/health || echo "API health check failed"
  echo
}

cmd_restart() {
  require_root
  systemctl restart "$SERVICE_NAME"
  poll_health || true
  systemctl --no-pager --full status "$SERVICE_NAME" || true
}

cmd_logs() {
  require_root
  journalctl -u "$SERVICE_NAME" -f
}

cmd_uninstall() {
  require_root
  warn "This stops the service and removes nginx site + ${APP_ROOT}."
  warn "Database and ${CHECKOUT} are left in place unless you confirm."
  confirm "Uninstall Spirit-Billing application files?" "n" || die "Cancelled."
  systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
  rm -f /etc/systemd/system/spirit-billing.service
  systemctl daemon-reload || true
  rm -f /etc/nginx/sites-enabled/spirit-billing /etc/nginx/sites-available/spirit-billing
  nginx -t 2>/dev/null && systemctl reload nginx || true
  rm -rf "$APP_ROOT" "$WEB_ROOT"
  if confirm "Also delete source checkout ${CHECKOUT}?" "n"; then
    rm -rf "$CHECKOUT"
  fi
  ok "Uninstall complete (MariaDB data left intact)."
}

usage() {
  cat <<EOF
Spirit-Billing installer v${SCRIPT_VERSION}

Usage:
  sudo bash $0                          Interactive menu
  sudo bash $0 install --domain HOST [-y] [--with-ssl] [--channel release|dev] [--ref REF]
  sudo bash $0 update [-y] [--channel release|dev] [--ref REF] [--force-build]
  sudo bash $0 status | restart | logs | uninstall
  sudo bash $0 --version

--ref REF     Overrides --channel for this run only (exact tag or branch).
--force-build Rebuild npm packages even when the source stamp is unchanged.

Environment:
  SPIRIT_BILLING_REPO_URL     Git remote (default: ${REPO_URL})
  SPIRIT_BILLING_CHECKOUT     Clone path (default: ${CHECKOUT})
  SPIRIT_BILLING_APP_ROOT     Live app (default: ${APP_ROOT})
  SPIRIT_BILLING_BACKUP_DIR   Update backups (default: ${BACKUP_DIR})

Download (safe):
  curl -fsSL https://raw.githubusercontent.com/${REPO_SLUG}/main/scripts/spirit.sh -o /tmp/spirit-billing.sh
  sudo bash /tmp/spirit-billing.sh
EOF
}

menu() {
  banner
  if is_installed; then
    printf '  %s1)%s Update\n' "$C_BOLD" "$C_RESET"
    printf '  %s2)%s Status\n' "$C_BOLD" "$C_RESET"
    printf '  %s3)%s Restart\n' "$C_BOLD" "$C_RESET"
    printf '  %s4)%s Logs\n' "$C_BOLD" "$C_RESET"
    printf '  %s5)%s Reinstall / repair\n' "$C_BOLD" "$C_RESET"
    printf '  %s6)%s Uninstall\n' "$C_BOLD" "$C_RESET"
    printf '  %s0)%s Exit\n\n' "$C_BOLD" "$C_RESET"
    local choice
    choice="$(ask "Select" "1")"
    case "$choice" in
      1) CMD="update" ;;
      2) CMD="status" ;;
      3) CMD="restart" ;;
      4) CMD="logs" ;;
      5) CMD="install" ;;
      6) CMD="uninstall" ;;
      0) exit 0 ;;
      *) die "Invalid choice" ;;
    esac
  else
    printf '  %s1)%s Install\n' "$C_BOLD" "$C_RESET"
    printf '  %s0)%s Exit\n\n' "$C_BOLD" "$C_RESET"
    local choice
    choice="$(ask "Select" "1")"
    case "$choice" in
      1) CMD="install" ;;
      0) exit 0 ;;
      *) die "Invalid choice" ;;
    esac
  fi
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      install|update|status|restart|logs|uninstall|help|-h|--help)
        CMD="$1"
        shift
        [[ "$CMD" == "help" || "$CMD" == "-h" || "$CMD" == "--help" ]] && { usage; exit 0; }
        ;;
      --version|-V)
        printf '%s\n' "$SCRIPT_VERSION"
        exit 0
        ;;
      -y|--yes) ASSUME_YES=1; shift ;;
      --domain) DOMAIN="${2:-}"; shift 2 ;;
      --channel) CHANNEL="${2:-}"; shift 2 ;;
      --ref) REF_OVERRIDE="${2:-}"; shift 2 ;;
      --with-ssl) WITH_SSL=1; shift ;;
      --force-build) FORCE_BUILD=1; shift ;;
      --checkout) CHECKOUT="${2:-}"; shift 2 ;;
      *)
        die "Unknown argument: $1 (try --help)"
        ;;
    esac
  done
}

main() {
  parse_args "$@"
  if [[ -z "$CMD" ]]; then
    require_root
    menu
  fi
  case "$CMD" in
    install) cmd_install ;;
    update) cmd_update ;;
    status) cmd_status ;;
    restart) cmd_restart ;;
    logs) cmd_logs ;;
    uninstall) cmd_uninstall ;;
    *) usage; exit 1 ;;
  esac
}

# Allow tests to source helpers without running main
if [[ "${SPIRIT_BILLING_SOURCE_ONLY:-0}" != "1" ]]; then
  main "$@"
fi
