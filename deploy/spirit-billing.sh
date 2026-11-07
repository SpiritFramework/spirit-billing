#!/usr/bin/env bash
# Spirit Billing — single entrypoint for install, update, and ops.
#
# Usage (from repo root, as root):
#   sudo bash deploy/spirit-billing.sh install --domain client.example.com
#   sudo bash deploy/spirit-billing.sh update [--repo-dir PATH]
#   sudo bash deploy/spirit-billing.sh status
#   sudo bash deploy/spirit-billing.sh restart
#   sudo bash deploy/spirit-billing.sh logs
#
# Auto mode (install if missing, otherwise update):
#   sudo bash deploy/spirit-billing.sh auto --domain client.example.com [--repo-dir PATH]
#
# WinSCP / zip workflow example:
#   sudo unzip -o Spirit-Billing.zip -d /home/Spirit-Billing
#   sudo find /home/Spirit-Billing/deploy -name '*.sh' -exec sed -i 's/\r$//' {} +
#   cd /home/Spirit-Billing && sudo bash deploy/spirit-billing.sh update --repo-dir /home/Spirit-Billing

set -euo pipefail

strip_crlf() {
  local f
  for f in "$@"; do
    [[ -f "$f" ]] || continue
    sed -i 's/\r$//' "$f"
  done
}

die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

[[ "$(id -u)" -eq 0 ]] || die "Run as root (sudo)"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_ROOT="/opt/spirit-billing"
CMD="${1:-}"
shift || true

usage() {
  cat <<'EOF'
Spirit Billing deploy helper

Commands:
  install   First-time production install
  update    Redeploy API + web from this repo (keeps .env / DB)
  auto      install if /opt/spirit-billing/.env is missing, else update
  status    Show systemd + health
  restart   Restart spirit-billing
  logs      Tail API journal

Examples:
  sudo bash deploy/spirit-billing.sh install --domain client.spirithost.co.uk
  sudo bash deploy/spirit-billing.sh update --repo-dir /home/Spirit-Billing
  sudo bash deploy/spirit-billing.sh auto --domain client.spirithost.co.uk --repo-dir /home/Spirit-Billing
  sudo bash deploy/spirit-billing.sh status

Forward any install/update flags after the command (e.g. --skip-packages, --with-ssl, --skip-web).
EOF
  exit "${1:-0}"
}

case "$CMD" in
  ""|-h|--help|help) usage 0 ;;
esac

strip_crlf "$SCRIPT_DIR/install.sh" "$SCRIPT_DIR/update.sh" "$SCRIPT_DIR/spirit-billing.sh"
chmod +x "$SCRIPT_DIR/install.sh" "$SCRIPT_DIR/update.sh" "$SCRIPT_DIR/spirit-billing.sh" 2>/dev/null || true

# Ensure --repo-dir defaults to this checkout when not passed
has_repo_dir=0
for arg in "$@"; do
  if [[ "$arg" == "--repo-dir" ]]; then
    has_repo_dir=1
    break
  fi
done
EXTRA=()
if [[ "$has_repo_dir" -eq 0 ]]; then
  EXTRA=(--repo-dir "$REPO_DIR")
fi

case "$CMD" in
  install)
    log "Running first-time install"
    exec bash "$SCRIPT_DIR/install.sh" "${EXTRA[@]}" "$@"
    ;;
  update)
    log "Running update / redeploy"
    exec bash "$SCRIPT_DIR/update.sh" "${EXTRA[@]}" "$@"
    ;;
  auto)
    if [[ -f "$APP_ROOT/.env" ]]; then
      log "Existing install detected ($APP_ROOT) — updating"
      exec bash "$SCRIPT_DIR/update.sh" "${EXTRA[@]}" "$@"
    else
      log "No existing install — running first-time install"
      exec bash "$SCRIPT_DIR/install.sh" "${EXTRA[@]}" "$@"
    fi
    ;;
  status)
    systemctl --no-pager --full status spirit-billing || true
    echo
    curl -sS --max-time 5 http://127.0.0.1:3001/health || echo "API health check failed"
    echo
    ;;
  restart)
    systemctl restart spirit-billing
    systemctl --no-pager --full status spirit-billing || true
    ;;
  logs)
    journalctl -u spirit-billing -f
    ;;
  *)
    die "Unknown command: $CMD (try: install | update | auto | status | restart | logs)"
    ;;
esac
