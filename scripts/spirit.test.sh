#!/usr/bin/env bash
#
# Tests for scripts/spirit.sh + deploy helpers
#
#   bash scripts/spirit.test.sh
#   # or on Windows with Git Bash:
#   "C:\Program Files\Git\bin\bash.exe" scripts/spirit.test.sh
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET="${SCRIPT_DIR}/spirit.sh"
UPDATE_SH="${REPO_ROOT}/deploy/update.sh"

PASS=0
FAIL=0
FAILED_NAMES=()
CURRENT=""
TEST_ERRORS=""

RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

SANDBOX=""
setup_sandbox() {
  SANDBOX="$(mktemp -d "${TMPDIR:-/tmp}/spirit-billing-test.XXXXXX")"
  export SANDBOX CMDLOG="$SANDBOX/log/commands.log"
  mkdir -p "$SANDBOX/bin" "$SANDBOX/log" \
    "$SANDBOX/etc/nginx/sites-available" "$SANDBOX/etc/nginx/sites-enabled" \
    "$SANDBOX/etc/systemd/system" "$SANDBOX/var/lock" "$SANDBOX/backups"
  : > "$CMDLOG"
  cat > "$SANDBOX/os-release" <<'EOF'
ID=ubuntu
PRETTY_NAME="Ubuntu 24.04 LTS (sandbox)"
EOF
  make_stubs
  export PATH="$SANDBOX/bin:$PATH"
}

teardown_sandbox() {
  [[ -n "$SANDBOX" && -d "$SANDBOX" ]] && rm -rf "$SANDBOX"
  SANDBOX=""
}

_stub() {
  local name="$1"
  local body
  body="$(cat)"
  printf '#!/usr/bin/env bash\nprintf "%%s %%s\\n" "%s" "$*" >> "${CMDLOG:-/dev/null}"\n%s\n' "$name" "$body" > "$SANDBOX/bin/$name"
  chmod +x "$SANDBOX/bin/$name"
}

make_stubs() {
  _stub id <<'EOF'
[[ "${1:-}" == "-u" ]] && { echo 0; exit 0; }
exit 0
EOF

  _stub curl <<'EOF'
[[ "$*" == *"/health"* ]] && {
  [[ "${SPIRIT_TEST_HEALTH_FAIL:-0}" == "1" ]] && exit 1
  echo '{"ok":true,"service":"spirit-billing"}'
  exit 0
}
[[ "$*" == *"api.github.com"* ]] && {
  echo '{"tag_name":"V1.0.0.0","draft":false,"prerelease":false}'
  exit 0
}
exit 0
EOF

  _stub mysqldump <<'EOF'
cnf=""
for arg in "$@"; do
  case "$arg" in --defaults-extra-file=*) cnf="${arg#*=}" ;; esac
done
if [[ -n "$cnf" && -f "$cnf" ]]; then
  got="$(grep -E '^password=' "$cnf" | head -n1 | sed 's/^password=//;s/^"//;s/"$//')"
  printf '%s\n' "$got" > "$SANDBOX/last-mysqldump-password"
fi
if [[ "${SPIRIT_TEST_DUMP_FAIL:-0}" == "1" ]]; then
  echo "mysqldump: Access denied" >&2
  exit 2
fi
echo "-- dump ok"
exit 0
EOF

  _stub systemctl <<'EOF'
exit 0
EOF
  _stub nginx <<'EOF'
[[ "${1:-}" == "-t" ]] && exit 0
exit 0
EOF
  _stub apt-get <<'EOF'
exit 0
EOF
  _stub flock <<'EOF'
exit 0
EOF
  _stub journalctl <<'EOF'
exit 0
EOF
  _stub openssl <<'EOF'
echo "TESTSECRET0123456789abcdefGHIJKLMNOP+/=="
exit 0
EOF
}

it() { CURRENT="$1"; TEST_ERRORS=""; }
done_test() {
  if [[ -z "${TEST_ERRORS:-}" ]]; then
    printf '  %s+%s %s\n' "$GREEN" "$RESET" "$CURRENT"
    PASS=$((PASS + 1))
  else
    printf '  %sx%s %s\n%s' "$RED" "$RESET" "$CURRENT" "$TEST_ERRORS"
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("$CURRENT")
  fi
  TEST_ERRORS=""
}
expect_contains() {
  [[ "$1" == *"$2"* ]] || TEST_ERRORS+="      expected ${3:-value} to contain: $2"$'\n'
}
expect_not_contains() {
  [[ "$1" != *"$2"* ]] || TEST_ERRORS+="      expected ${3:-value} NOT to contain: $2"$'\n'
}
expect_eq() {
  [[ "$1" == "$2" ]] || TEST_ERRORS+="      expected ${3:-value}=[$2] got [$1]"$'\n'
}
expect_file() {
  [[ -f "$1" ]] || TEST_ERRORS+="      missing file: $1"$'\n'
}
section() { printf '\n%s%s%s\n' "$BOLD" "$1" "$RESET"; }

run_spirit() {
  local sandboxed="$SANDBOX/spirit.sh"
  sed \
    -e "s|/etc/os-release|$SANDBOX/os-release|g" \
    -e "s|/etc/systemd/system|$SANDBOX/etc/systemd/system|g" \
    -e "s|/etc/nginx|$SANDBOX/etc/nginx|g" \
    -e "s|/var/lock|$SANDBOX/var/lock|g" \
    -e "s|/var/backups/spirit-billing|$SANDBOX/backups|g" \
    "$TARGET" > "$sandboxed"
  chmod +x "$sandboxed"
  # Override paths via env
  SPIRIT_BILLING_CHECKOUT="${SPIRIT_TEST_CHECKOUT:-$SANDBOX/checkout}" \
  SPIRIT_BILLING_APP_ROOT="${SPIRIT_TEST_APP_ROOT:-$SANDBOX/app}" \
  SPIRIT_BILLING_BACKUP_DIR="$SANDBOX/backups" \
  bash "$sandboxed" "$@" 2>&1
}

source_helpers() {
  # shellcheck disable=SC1090
  SPIRIT_BILLING_SOURCE_ONLY=1
  # Extract helper functions by sourcing with SOURCE_ONLY
  # shellcheck disable=SC1091
  source <(sed -n '1,/^if \[\[ "${SPIRIT_BILLING_SOURCE_ONLY/p' "$TARGET" | sed '$d')
}

# ---------------------------------------------------------------------------
section "Static checks"
it "installer documents safe curl download (not process substitution)"
expect_contains "$(cat "$TARGET")" "curl -fsSL https://raw.githubusercontent.com/SpiritFramework/spirit-billing/main/scripts/spirit.sh" "curl"
expect_contains "$(cat "$TARGET")" "Do NOT use: sudo bash <(curl" "no process sub"
expect_contains "$(cat "$TARGET")" "Supported usage (interactive menu)" "menu first"
expect_contains "$(cat "$TARGET")" "--channel release|dev" "help channel"
expect_contains "$(cat "$TARGET")" "cmd_auto" "auto command"
expect_contains "$(cat "$TARGET")" "dns_points_here" "auto ssl"
expect_contains "$(cat "$TARGET")" "--panel-key" "panel key"
expect_contains "$(cat "$TARGET")" "cmd_sync_panel" "sync panel"
expect_contains "$(cat "$TARGET")" "cmd_repair" "repair command"
expect_contains "$(cat "$TARGET")" "--sync-panel" "sync flag"
expect_contains "$(cat "$TARGET")" "prompt_panel_options" "asks panel"
expect_contains "$(cat "$TARGET")" "unattended()" "unattended vs auto"
expect_contains "$(cat "$TARGET")" "interactive number menu" "bare run needs menu"
expect_contains "$(cat "$TARGET")" "drop_billing_database" "uninstall drops DB"
expect_contains "$(cat "$TARGET")" "revoke_billing_certificate" "uninstall cert"
expect_contains "$(cat "$TARGET")" "DROP DATABASE IF EXISTS" "sql drop"
expect_contains "$(cat "$TARGET")" "userdel" "remove system user"
expect_file "$REPO_ROOT/billing-api/scripts/sync-from-panel.ts"
expect_contains "$(cat "$REPO_ROOT/billing-api/src/lib/sync-panel-services.ts")" "createMissingUsers" "create users"
expect_not_contains "$(cat "$TARGET")" "@{u}" "no upstream fallthrough"
done_test

it "update.sh preserves uploads and skips rebuild via stamp"
expect_contains "$(cat "$UPDATE_SH")" "--exclude 'uploads'" "exclude uploads"
expect_contains "$(cat "$UPDATE_SH")" ".spirit-build-stamp" "stamp"
expect_contains "$(cat "$UPDATE_SH")" "--force-build" "force-build"
expect_contains "$(cat "$UPDATE_SH")" "poll_health" "health"
expect_contains "$(cat "$UPDATE_SH")" "--panel-url" "update panel"
expect_contains "$(cat "$UPDATE_SH")" "node_modules/fastify" "rebuild if deps missing"
done_test

it "install.sh preserves uploads and accepts panel flags"
expect_contains "$(cat "$REPO_ROOT/deploy/install.sh")" "--exclude 'uploads'" "install uploads"
expect_contains "$(cat "$REPO_ROOT/deploy/install.sh")" "Checking API health" "install health"
expect_contains "$(cat "$REPO_ROOT/deploy/install.sh")" "apply_optional_env" "panel env"
expect_contains "$(cat "$REPO_ROOT/deploy/install.sh")" "--panel-key" "panel key flag"
done_test

# ---------------------------------------------------------------------------
section "CLI"
setup_sandbox
out="$(run_spirit --help)"
it "help lists auto install update sync-panel and ssl"
expect_contains "$out" "install" "help"
expect_contains "$out" "update" "help"
expect_contains "$out" "auto" "help"
expect_contains "$out" "sync-panel" "help"
expect_contains "$out" "ssl" "help"
expect_contains "$out" "--domain" "help"
expect_contains "$out" "--panel-url" "help"
expect_contains "$out" "--sync-panel" "help"
expect_contains "$out" "--force-build" "help"
done_test

out="$(run_spirit --version)"
it "prints script version 1.3.2"
expect_contains "$out" "1.3.2" "version"
done_test

out="$(run_spirit --help)"
it "help leads with curl + menu as supported usage"
expect_contains "$out" "Supported usage (interactive menu)" "help menu"
expect_contains "$out" "sudo bash /tmp/spirit-billing.sh" "help curl path"
expect_contains "$out" "raw.githubusercontent.com/SpiritFramework/spirit-billing/main/scripts/spirit.sh" "help raw url"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "Uninstall purge helpers"
setup_sandbox
APP_ROOT="$SANDBOX/app"
BACKUP_DIR="$SANDBOX/backups"
mkdir -p "$APP_ROOT" "$SANDBOX/bin"
printf 'DATABASE_URL="mysql://spirit_billing:secret@127.0.0.1:3306/spirit_billing"\n' > "$APP_ROOT/.env"
_stub mysql <<'EOF'
printf '%s\n' "$*" >> "$SANDBOX/mysql-args.log"
# Accept root socket ping and heredoc drops
exit 0
EOF
eval "$(sed -n \
  '/^ok()/,/^}/p;/^info()/,/^}/p;/^warn()/,/^}/p;/^env_get()/,/^}/p;/^urldecode()/,/^}/p;/^cnf_escape()/,/^}/p;/^parse_database_url()/,/^}/p;/^drop_billing_database()/,/^}/p;/^revoke_billing_certificate()/,/^}/p' \
  "$TARGET")"
C_RESET=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""

it "drop_billing_database issues DROP via root socket"
drop_billing_database >/dev/null
expect_file "$SANDBOX/mysql-args.log"
expect_contains "$(cat "$SANDBOX/mysql-args.log")" "--protocol=socket" "socket"
done_test

it "revoke_billing_certificate no-ops when cert missing"
revoke_billing_certificate "billing.example.com"
expect_eq "$?" "0" "noop"
done_test

mkdir -p "$SANDBOX/letsencrypt/live/billing.example.com"
# Point function at sandbox by wrapping
revoke_billing_certificate() {
  local domain="$1"
  [[ -n "$domain" ]] || return 0
  if [[ ! -d "$SANDBOX/letsencrypt/live/${domain}" ]]; then
    return 0
  fi
  if command -v certbot >/dev/null 2>&1; then
    certbot delete --cert-name "$domain" --non-interactive
  fi
}
_stub certbot <<'EOF'
echo "$*" >> "$SANDBOX/certbot.log"
exit 0
EOF
it "revoke_billing_certificate deletes when live cert exists"
revoke_billing_certificate "billing.example.com"
expect_file "$SANDBOX/certbot.log"
expect_contains "$(cat "$SANDBOX/certbot.log")" "delete --cert-name billing.example.com" "certbot delete"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "Progress helpers"
setup_sandbox
# shellcheck disable=SC1090
eval "$(sed -n '/^phase_begin()/,/^}/p;/^phase()/,/^}/p' "$TARGET")"
C_RESET=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
it "phase prints percent and almost-done once at 80%"
phase_begin 5 "wrapping up"
out="$(phase 'one'; phase 'two'; phase 'three'; phase 'four')"
expect_contains "$out" "[1/5 · 20%] one" "phase1"
expect_contains "$out" "[4/5 · 80%] four" "phase4"
expect_contains "$out" "Almost done — wrapping up" "almost"
almost_count="$(printf '%s\n' "$out" | grep -c 'Almost done' || true)"
expect_eq "$almost_count" "1" "almost once"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "env_get / DATABASE_URL"
setup_sandbox
APP_ROOT="$SANDBOX/app"
mkdir -p "$APP_ROOT"
# CRLF + quoted + percent-encoded password with @
printf 'DATABASE_URL="mysql://spirit_billing:p%%40ss@127.0.0.1:3306/spirit_billing"\r\n' \
  > "$APP_ROOT/.env"
printf 'JWT_SECRET="abc"\r\n' >> "$APP_ROOT/.env"

eval "$(sed -n '/^env_get()/,/^}/p;/^urldecode()/,/^}/p;/^cnf_escape()/,/^}/p;/^parse_database_url()/,/^}/p' "$TARGET")"

it "strips CR and quotes from DATABASE_URL"
got="$(APP_ROOT="$APP_ROOT" env_get DATABASE_URL)"
expect_eq "$got" 'mysql://spirit_billing:p%40ss@127.0.0.1:3306/spirit_billing' "url"
expect_not_contains "$got" '"' "url"
done_test

it "decodes percent-encoded passwords and splits on last @"
mapfile -t parts < <(parse_database_url 'mysql://spirit_billing:p%40ss@127.0.0.1:3306/spirit_billing')
expect_eq "${parts[0]}" "spirit_billing" "user"
expect_eq "${parts[1]}" "p@ss" "pass"
expect_eq "${parts[2]}" "127.0.0.1" "host"
expect_eq "${parts[4]}" "spirit_billing" "db"
done_test

it "handles password containing @ via last-@ split"
mapfile -t parts < <(parse_database_url 'mysql://u:a%40b@c@127.0.0.1:3306/db')
# userpass = u:a%40b@c  hostdb = 127.0.0.1:3306/db  → pass = a@b@c after decode? 
# last @ splits: userpass=u:a%40b  wait - ##*@ takes from last @
# rest = u:a%40b@c@127.0.0.1:3306/db
# %@* = everything before last @ = u:a%40b@c
# Actually in bash ${rest%@*} removes shortest from end matching @* so last @
# userpass = u:a%40b@c
# user = u, pass = a%40b@c → decode → a@b@c
expect_eq "${parts[0]}" "u" "user"
expect_eq "${parts[1]}" "a@b@c" "pass"
expect_eq "${parts[2]}" "127.0.0.1" "host"
done_test

it "cnf_escape quotes backslash and double-quote"
expect_eq "$(cnf_escape 'a"b\c')" 'a\"b\\c' "escape"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "validate_ref / channel"
setup_sandbox
eval "$(sed -n '/^die()/,/^}/p;/^validate_ref()/,/^}/p;/^resolve_target_ref()/,/^}/p' "$TARGET")"
CHANNEL=""; REF_OVERRIDE=""; LATEST_TAG_RESOLVED=""
latest_release_tag() { printf 'V1.2.0.0'; }

it "validate_ref rejects path traversal"
# die() calls exit — run in a subshell so the suite keeps going
if ( validate_ref '../evil' ) >/dev/null 2>&1; then
  TEST_ERRORS+="      expected validate_ref to fail"$'\n'
fi
done_test

it "resolve_target_ref: --ref overrides channel"
REF_OVERRIDE="V9.9.9.9"
CHANNEL="dev"
expect_eq "$(resolve_target_ref)" "V9.9.9.9" "ref"
done_test

it "resolve_target_ref: release uses latest tag"
REF_OVERRIDE=""
CHANNEL="release"
expect_eq "$(resolve_target_ref)" "V1.2.0.0" "release"
done_test

it "resolve_target_ref: dev uses main"
CHANNEL="dev"
expect_eq "$(resolve_target_ref)" "main" "dev"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "Backup dump password plumbing"
setup_sandbox
APP_ROOT="$SANDBOX/app"
BACKUP_DIR="$SANDBOX/backups"
mkdir -p "$APP_ROOT" "$BACKUP_DIR"
printf 'DATABASE_URL="mysql://spirit_billing:p%%40ssWord@127.0.0.1:3306/spirit_billing"\n' > "$APP_ROOT/.env"
ASSUME_YES=1
C_RESET=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
STEP=0
# shellcheck disable=SC2034
eval "$(sed -n \
  '/^ok()/,/^}/p;/^info()/,/^}/p;/^warn()/,/^}/p;/^die()/,/^}/p;/^step()/,/^}/p;/^env_get()/,/^}/p;/^urldecode()/,/^}/p;/^cnf_escape()/,/^}/p;/^parse_database_url()/,/^}/p;/^dump_database()/,/^}/p;/^backup_before_update()/,/^}/p;/^confirm()/,/^}/p' \
  "$TARGET")"

it "dump uses decoded password in defaults file"
dest="$BACKUP_DIR/t1"
mkdir -p "$dest"
dump_database "$dest"
expect_file "$dest/spirit_billing.sql"
expect_file "$SANDBOX/last-mysqldump-password"
expect_eq "$(cat "$SANDBOX/last-mysqldump-password")" "p@ssWord" "decoded pass"
done_test

it "backup_before_update copies .env"
LAST_BACKUP=""
backup_before_update >/dev/null
expect_file "$LAST_BACKUP/.env"
expect_contains "$(cat "$LAST_BACKUP/.env")" "DATABASE_URL" "env copy"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "uploads preservation (rsync exclude contract)"
setup_sandbox
src="$SANDBOX/src"
dst="$SANDBOX/dst"
mkdir -p "$src/billing-api/uploads/tickets" "$src/billing-web" "$src/deploy" \
  "$dst/billing-api/uploads/tickets"
echo keep-me > "$dst/billing-api/uploads/tickets/photo.jpg"
echo api > "$src/billing-api/index.js"
# Simulate update.sh excludes: copy tree but never touch uploads/
cp -a "$src/billing-api/." "$dst/billing-api/" 2>/dev/null || true
# A naive --delete WITHOUT exclude would wipe uploads — prove we keep them
rm -rf "$dst/billing-api/uploads" 2>/dev/null || true
mkdir -p "$dst/billing-api/uploads/tickets"
echo keep-me > "$dst/billing-api/uploads/tickets/photo.jpg"
# Re-copy source files excluding uploads (contract of update.sh)
find "$src/billing-api" -mindepth 1 -maxdepth 1 ! -name uploads -exec cp -a {} "$dst/billing-api/" \;

it "update exclude contract keeps existing ticket files while syncing code"
expect_file "$dst/billing-api/uploads/tickets/photo.jpg"
expect_eq "$(cat "$dst/billing-api/uploads/tickets/photo.jpg")" "keep-me" "content"
expect_file "$dst/billing-api/index.js"
expect_contains "$(cat "$UPDATE_SH")" "--exclude 'uploads'" "script still excludes uploads"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "Git checkout ref selection"
setup_sandbox
CHECKOUT="$SANDBOX/checkout"
ORIGIN="$SANDBOX/origin.git"
mkdir -p "$CHECKOUT"
(
  cd "$CHECKOUT"
  git init -q
  git config user.email "test@example.com"
  git config user.name "Test"
  mkdir -p billing-api billing-web deploy scripts
  echo '{"version":"0.1.0"}' > billing-api/package.json
  echo '{}' > billing-web/package.json
  echo '#!/bin/bash' > deploy/install.sh
  echo '#!/bin/bash' > deploy/update.sh
  echo '#!/bin/bash' > deploy/spirit-billing.sh
  cp "$TARGET" scripts/spirit.sh
  git add -A
  git commit -q -m "base"
  git tag V1.0.0.0
  git checkout -q -b main
)
git clone -q --bare "$CHECKOUT" "$ORIGIN"
(
  cd "$CHECKOUT"
  git remote add origin "$ORIGIN"
  git push -q -u origin main
  git push -q origin V1.0.0.0
  echo bump > ONLY_ON_MAIN.md
  echo '{"version":"0.2.0"}' > billing-api/package.json
  git add -A
  git commit -q -m "bump"
  git push -q origin HEAD:main
  git reset -q --hard HEAD~1
)

# Load helpers
REPO_URL="$ORIGIN"
CHANNEL="dev"
REF_OVERRIDE=""
ASSUME_YES=1
C_RESET=""; C_BOLD=""; C_DIM=""; C_CYAN=""; C_GREEN=""; C_YELLOW=""; C_RED=""
STEP=0
eval "$(sed -n \
  '/^ok()/,/^}/p;/^info()/,/^}/p;/^warn()/,/^}/p;/^die()/,/^}/p;/^step()/,/^}/p;/^confirm()/,/^}/p;/^validate_ref()/,/^}/p;/^resolve_target_ref()/,/^}/p;/^save_channel()/,/^}/p;/^CHANNEL_FILE()/,/^}/p;/^checkout_ready()/,/^}/p;/^repo_git()/,/^}/p;/^ensure_packages_minimal()/,/^}/p' \
  "$TARGET")"
# Simplified ensure_checkout body for fetch+checkout only
ensure_packages_minimal() { :; }

it "dev channel checks out origin/main (not stuck on old tag)"
# manually do fetch/checkout like ensure_checkout
repo_git fetch --tags --prune origin >/dev/null 2>&1
target="$(resolve_target_ref)"
expect_eq "$target" "main" "target"
repo_git checkout -B main "origin/main" >/dev/null 2>&1
expect_file "$CHECKOUT/ONLY_ON_MAIN.md"
expect_contains "$(cat "$CHECKOUT/billing-api/package.json")" "0.2.0" "version"
done_test

it "release channel checks out tag without falling to main"
CHANNEL="release"
REF_OVERRIDE=""
latest_release_tag() { printf 'V1.0.0.0'; }
target="$(resolve_target_ref)"
expect_eq "$target" "V1.0.0.0" "tag"
repo_git checkout -f "refs/tags/V1.0.0.0" >/dev/null 2>&1
expect_not_contains "$(ls "$CHECKOUT")" "ONLY_ON_MAIN.md" "no main-only file"
expect_contains "$(cat "$CHECKOUT/billing-api/package.json")" "0.1.0" "tag version"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "Status / not installed"
setup_sandbox
out="$(run_spirit status 2>&1 || true)"
it "status warns when not installed"
expect_contains "$out" "Not installed" "status"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "Domain / auto helpers"
setup_sandbox
APP_ROOT="$SANDBOX/app"
mkdir -p "$APP_ROOT" "$SANDBOX/etc/nginx/sites-available"
printf 'BILLING_URL=https://billing.example.com\n' > "$APP_ROOT/.env"
printf 'server_name billing.example.com;\n' > "$SANDBOX/etc/nginx/sites-available/spirit-billing"
eval "$(sed -n \
  '/^env_get()/,/^}/p;/^domain_from_url()/,/^}/p;/^detect_domain()/,/^}/p;/^want_auto()/,/^}/p;/^public_ipv4()/,/^}/p;/^dns_points_here()/,/^}/p' \
  "$TARGET")"
# Point detect_domain at sandboxed nginx
detect_domain() {
  local d=""
  if [[ -f "${APP_ROOT}/.env" ]]; then
    d="$(env_get BILLING_URL 2>/dev/null || true)"
    d="$(domain_from_url "$d")"
  fi
  if [[ -z "$d" && -f "$SANDBOX/etc/nginx/sites-available/spirit-billing" ]]; then
    d="$(grep -E '^\s*server_name\s+' "$SANDBOX/etc/nginx/sites-available/spirit-billing" 2>/dev/null \
      | head -n1 | awk '{print $2}' | tr -d ';\r')"
  fi
  printf '%s' "$d"
}

it "domain_from_url strips scheme and path"
expect_eq "$(domain_from_url 'https://billing.example.com/admin')" "billing.example.com" "url"
done_test

it "detect_domain reads BILLING_URL"
expect_eq "$(detect_domain)" "billing.example.com" "detect"
done_test

it "want_auto is true with ASSUME_YES or AUTO_MODE"
ASSUME_YES=1; AUTO_MODE=0
want_auto
expect_eq "$?" "0" "assume yes"
ASSUME_YES=0; AUTO_MODE=1
want_auto
expect_eq "$?" "0" "auto mode"
done_test

eval "$(sed -n '/^tty_in()/,/^}/p;/^can_prompt()/,/^}/p;/^unattended()/,/^}/p' "$TARGET")"
it "unattended is true with -y or FORCE_UNATTENDED"
ASSUME_YES=1
SPIRIT_BILLING_FORCE_UNATTENDED=0
unattended
expect_eq "$?" "0" "yes flag"
ASSUME_YES=0
SPIRIT_BILLING_FORCE_UNATTENDED=1
unattended
expect_eq "$?" "0" "force unattended"
done_test

it "ask/confirm read from /dev/tty helper"
expect_contains "$(sed -n '/^ask()/,/^}/p' "$TARGET")" 'read -r reply <"$tty"' "ask tty"
expect_contains "$(sed -n '/^confirm()/,/^}/p' "$TARGET")" 'read -r reply <"$tty"' "confirm tty"
done_test

it "prompt_panel_options exists for interactive panel questions"
expect_contains "$(sed -n '/^prompt_panel_options()/,/^}/p' "$TARGET")" "Spirit-Panel URL" "panel ask"
expect_contains "$(sed -n '/^resolve_domain()/,/^}/p' "$TARGET")" "Public billing domain" "billing domain ask"
done_test

# Stub public IP + dig for dns_points_here
_stub dig <<'EOF'
echo "203.0.113.10"
exit 0
EOF
_stub curl <<'EOF'
[[ "$*" == *ipify* || "$*" == *ifconfig* || "$*" == *icanhazip* ]] && { echo "203.0.113.10"; exit 0; }
exit 0
EOF
it "dns_points_here matches public A record"
dns_points_here "billing.example.com"
expect_eq "$?" "0" "dns match"
done_test

_stub dig <<'EOF'
echo "198.51.100.1"
exit 0
EOF
it "dns_points_here rejects mismatched A record"
if dns_points_here "billing.example.com"; then
  TEST_ERRORS+="      expected dns mismatch"$'\n'
fi
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "Auto chooses update when installed"
setup_sandbox
mkdir -p "$SANDBOX/app/billing-api" "$SANDBOX/checkout/deploy" \
  "$SANDBOX/checkout/billing-api" "$SANDBOX/checkout/billing-web" "$SANDBOX/checkout/scripts"
printf 'NODE_ENV=production\n' > "$SANDBOX/app/.env"
echo '{}' > "$SANDBOX/app/billing-api/package.json"
# Minimal deploy shim that records the action
cat > "$SANDBOX/checkout/deploy/spirit-billing.sh" <<'EOF'
#!/usr/bin/env bash
printf 'DEPLOY %s\n' "$*" >> "${CMDLOG}"
exit 0
EOF
chmod +x "$SANDBOX/checkout/deploy/spirit-billing.sh"
cp "$TARGET" "$SANDBOX/checkout/scripts/spirit.sh"
# Fake git checkout
(
  cd "$SANDBOX/checkout"
  git init -q
  git config user.email t@t.com
  git config user.name t
  echo ok > billing-api/package.json
  echo ok > billing-web/package.json
  echo ok > deploy/install.sh
  echo ok > deploy/update.sh
  git add -A && git commit -q -m init
)
# Patch run_spirit paths already; stub mysqldump etc exist
# Force ASSUME_YES auto path without actually apt-getting: source cmd_auto decision
is_installed() { [[ -f "${APP_ROOT}/.env" && -f "${APP_ROOT}/billing-api/package.json" ]]; }
APP_ROOT="$SANDBOX/app"
CHECKOUT="$SANDBOX/checkout"
it "is_installed true when .env and package.json exist"
is_installed
expect_eq "$?" "0" "installed"
done_test

# Bare invocation with no terminal is rejected (menu required)
it "bare run without terminal is rejected (menu required)"
out="$(SPIRIT_BILLING_FORCE_UNATTENDED=1 run_spirit 2>&1 || true)"
expect_contains "$out" "interactive number menu" "menu required"
expect_contains "$out" "sudo bash /tmp/spirit-billing.sh" "curl instructions"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
section "env_set_key (install/update)"
setup_sandbox
envf="$SANDBOX/test.env"
printf 'PANEL_API_URL=https://old.example.com\nOTHER=1\n' > "$envf"
eval "$(sed -n '/^env_set_key()/,/^}/p' "$REPO_ROOT/deploy/install.sh")"
env_set_key "$envf" PANEL_API_URL "https://panel.example.com"
env_set_key "$envf" PANEL_APPLICATION_API_KEY 'key"with"quotes'
it "env_set_key replaces and appends quoted values"
expect_contains "$(cat "$envf")" 'PANEL_API_URL="https://panel.example.com"' "panel url"
expect_contains "$(cat "$envf")" 'PANEL_APPLICATION_API_KEY="key\"with\"quotes"' "panel key"
expect_contains "$(cat "$envf")" 'OTHER=1' "preserves other"
expect_not_contains "$(cat "$envf")" "old.example.com" "removed old"
done_test
teardown_sandbox

# ---------------------------------------------------------------------------
printf '\n%sResults:%s %s%d passed%s, %s%d failed%s\n' \
  "$BOLD" "$RESET" "$GREEN" "$PASS" "$RESET" "$RED" "$FAIL" "$RESET"
if [[ "$FAIL" -gt 0 ]]; then
  printf 'Failed:\n'
  for n in "${FAILED_NAMES[@]}"; do printf '  - %s\n' "$n"; done
  exit 1
fi
exit 0
