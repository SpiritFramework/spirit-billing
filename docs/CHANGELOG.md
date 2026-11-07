# Changelog

All notable changes to **Spirit-Billing** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(`MAJOR.MINOR.PATCH`). Installer script versions (`scripts/spirit.sh` → `SCRIPT_VERSION`)
are noted under **Installer** when they change.

How to add an entry when you ship: see [releasing.md](./releasing.md).

---

## [Unreleased]

### Added

### Changed

- Install / update is **menu-only** by default:  
  `curl … -o /tmp/spirit-billing.sh` then `sudo bash /tmp/spirit-billing.sh`  
  (installer **v1.3.0**). Docs no longer push flag-heavy one-liners as the primary path.

### Fixed

### Security

---

## [0.1.1] — 2026-11-07

Installer and ops tooling focused release. App package version remains `0.1.x`;
bootstrap script is **v1.2.2**.

### Added

- GitHub one-command bootstrap (`scripts/spirit.sh`) with channels (`dev` / `release`), `--ref`, status / restart / logs
- Fully automatic `auto` command (install-or-update) with domain detection and DNS-aware Let's Encrypt
- Panel wiring flags: `--panel-url`, `--panel-web-url`, `--panel-key`, `--admin-email`, `--email`
- **`sync-panel` / `--sync-panel`** — import existing Spirit-Panel servers; create missing billing clients; write temp passwords to `/opt/spirit-billing/.panel-import-passwords`
- Interactive auto prompts for Panel URL, API key, and sync (when not using `-y`)
- Full **`uninstall`** purge (service, nginx, app/web/checkout/backups, MariaDB DB + user, system user, billing TLS cert)
- Installer self-test suite: `bash scripts/spirit.test.sh`
- `billing-api` CLI: `npm run sync:panel` / `scripts/sync-from-panel.ts`
- Admin **Sync panel** creates missing billing users and returns temporary passwords once

### Changed

- Update path preserves `billing-api/uploads/`, skips npm rebuild via build stamp (`--force-build` to override)
- DB dumps decode percent-encoded `DATABASE_URL` passwords; root-socket fallback
- Health poll after install/update/restart
- Docs index under `docs/`; install guide remains `deploy/INSTALL.md`

### Fixed

- Interactive `auto` no longer forces `-y`, so Panel / sync questions appear on a TTY

---

## [0.1.0] — 2026-11-07

Initial public tree for [SpiritFramework/spirit-billing](https://github.com/SpiritFramework/spirit-billing).

### Added

- `billing-api` — Fastify + Prisma storefront/admin API (orders, invoices, credits, coupons, tickets, renewals, Panel provisioning)
- `billing-web` — React client + admin UI
- `deploy/` — production install/update, nginx, systemd, env example
- Manual / zip deploy path via `deploy/spirit-billing.sh`

---

## Version map

| Product tag | `billing-api` `package.json` | `scripts/spirit.sh` | Notes |
|-------------|------------------------------|---------------------|--------|
| `0.1.1` | `0.1.1` | `1.2.2` | Installer / sync / uninstall |
| `0.1.0` | `0.1.0` | — | First GitHub publish |

When cutting a GitHub Release, create a matching git tag (`v0.1.1` or `V0.1.1.0` — pick one scheme and stick to it; see [releasing.md](./releasing.md)).

[Unreleased]: https://github.com/SpiritFramework/spirit-billing/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/SpiritFramework/spirit-billing/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/SpiritFramework/spirit-billing/releases/tag/v0.1.0
