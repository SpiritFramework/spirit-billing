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

- Admin **Analytics** rebuilt as an intelligence desk: stage chart with its own controls, metric rail, share rings, and a promotions/health band. Empty revenue windows and zero-share rows stay out of the way
- Admin **Overview** is a command desk: collectable figure, settled trend, a due-today queue, and an activity stream that leads with billing events. Repeated log lines collapse, and database errors no longer paste source paths onto the page
- Admin **user detail** is one account desk: identity, metrics, and section switcher share a stage, and profile, panel, password, wallet, services, invoices, and delete use the same cards
- Admin **service detail** is one server desk: identity, price, due date, panel, and unpaid share a stage. Overview, invoices, and the whole settings tab (name, price, limits, features, jobs, and delete) use the same cards. Resource limits show the real values, without decorative meters
- Client **Dashboard** adds the next renewal and recent support tickets beside account credit. The services count notes plans still waiting on payment
- Client **Game hosting** opens with a catalog hero, then Popular games as cards, then Online in three steps in one strip. The cart sits under those sections
- Client **service detail** Resources includes backups, databases, and ports alongside RAM, CPU, and disk. A limit of zero shows as Off
- Client **service detail** Manage server opens that server on the panel (`/servers/{id}`) when a panel server is assigned
- Client **invoice detail** plan resources include backups, databases, and ports. A limit of zero shows as Off

### Fixed

### Security

---

## [1.0.0.0] — 2026-11-08

First 1.0 product release (four-part tag scheme, aligned with Spirit-Panel). Includes the ops UI rebuild, Settings/About polish, and hard security hardening. Schema change: new `sessions` table (`prisma db push` on update).

### Added

- Admin Settings → **About** — polished product desk (status hero, capability sheet, product/runtime board, recommended update commands)
- Admin **Analytics** page (`/admin/analytics`) — revenue hero, WoW/MoM pulses, 6m/12m trend desk, 14-day spark, health gauges, category/product leaders, overdue queue, fleet/support/invoice mixes, coupons + credits
- Branding theme/layout settings: `theme_mode`, `theme_preset`, `ui_radius`, `ui_density`, `sidebar_style` (admin settings + public `/auth/branding`)
- Layout Atmosphere presets: `auth_atmosphere` (login), `client_atmosphere`, and `admin_atmosphere` (separate shells)
- Layout Navigation: `client_nav_layout` / `admin_nav_layout` — choose sidebar or top navbar per shell
- Navigation chrome themes: expanded `sidebar_style` (solid / glass / frosted / transparent / rail) and new `navbar_style` (solid / glass / frosted / float / line)
- Login atmospheres redesigned around the auth stage look: Stage, Blueprint, Beacon, Ember, Halo, Night, Skyline, Plain
- Brand Theme look uses Spirit-Panel surface presets; Colors uses Panel accent pairs (primary → secondary)
- Surface presets apply panel chrome tokens; accents stay independently editable
- Admin user + service detail APIs enrich category logos / marks for fleet and account tables
- Admin service Settings: sticky unsaved bar, resource presets, feature toggles, lifecycle jobs/power panel

### Changed

- Admin **Overview** rebuilt as a command center: hero settled-revenue band, collect/fleet/inbox/client pulses, prioritized Needs action queue, platform vitals, revenue trend, live activity stream, fleet composition, due calendar, and quick-ops launch pad
- Admin Overview uses the full content width (fluid page), same as Settings
- Admin Overview polish: actionable unpaid invoice queue, wider fluid columns, activity timeline rail, cleaner fleet composition bar
- `/admin/stats` expands with month-over-month revenue, overdue + due-soon invoices, renewals due, new clients / 30d, overdue invoice rows, ticket queue, and recent system logs
- Client dashboard rebuilt as **Client home**: quiet intro, attention notices, compact pulse strip, services-first list, invoices + credit redeem — replaces the marketing hero / metric-card stack
- Client main page heading is **Dashboard** (matches the nav label)
- Topbar **Notifications** panel redesigned as a denser inbox (unread chip, icon actions, relative time, tone rail, quieter empty state)
- Client **Services**, **Profile**, **Invoices**, **Service detail**, **Tickets**, and **Game hosting** rebuilt in the Client home language (ops list / detail shells, richer invoice + ticket surfaces)
- Client **Cart** rebuilt as a clearer checkout flow (plan summary, config, totals) instead of the prior stacked form
- Admin **Users** and **User detail** rebuilt as an ops console (denser tables, filters, icons, invoice/service rows with category marks) — not the client-* look
- Admin **Services** fleet list + **Service detail** rebuilt (Overview / Invoices / Settings; attention strip, metrics, recent invoices, resource cards)
- Admin **Invoices** rebuilt as an ops ledger (status / overdue / kind rails, mast chips for unpaid + paid value, denser invoice rows with category marks)
- Admin **Tickets** inbox rebuilt as an ops queue (mast chips, status / priority / category rails, dense ticket rows with category marks + client avatars)
- Admin **Ticket detail** rebuilt as an ops desk (mast + metrics, attention strip, unified chat shell with docked composer, sticky client / service / triage / delete aside)
- Admin **Categories** rebuilt as an ops catalog desk (mast chips, visibility / egg / artwork rails, dense rows) — create/edit uses mast + metrics + sticky preview aside
- Admin category / ticket-category preview marks center their icons correctly (footer meta selector no longer overrides `CategoryMark`)
- Admin **Products** rebuilt as an ops catalog desk (mast chips, visibility / provision / category rails, dense reorderable rows) — create/edit uses mast + metrics + sticky storefront preview aside
- Admin **Coupons** rebuilt as an ops promotions desk (campaigns table + redemptions audit, status/type rails, create panel with live preview)
- Admin **Ticket categories** rebuilt as an ops support-labels desk (mast chips, visibility rail, dense rows, create/edit with colour/icon picker + sticky preview)
- Admin **Logs** rebuilt as an ops event stream (mast chips, level + category rails, dense rows, sticky event detail with people links + metadata, prune + copy)
- Admin log categories expanded with **Support** and **Provision**; tickets / renewals / panel sync remapped out of catch-all Billing/Admin buckets
- Admin product edit attention strip polished (warn rail, icon tile, missing-field chips)
- Admin product create/edit polish: resource presets, £ price input, panel health cards, richer preview / launch aside
- Admin service/ticket mast category marks center their icons correctly inside the status ring
- Admin ticket detail client aside drops the cramped email fact row (profile is one click away)
- Admin **Invoice detail** rebuilt as an ops shell (mast + metrics, attention for unpaid/overdue, line items / client / service / lifecycle panels)
- Admin invoice detail polish: desk layout with sticky aside, upgrade compare, lifecycle timeline, richer client/service cards, pay CTA in attention strip
- Admin invoice detail client card shows the user’s profile picture when set
- Admin invoice detail document panel explains the charge (service, plan, resources, coverage window)
- Admin invoice detail client/service rows are clickable (no separate open buttons)
- Admin invoice detail polish: cleaner mast actions, charge meta strip, clickable purpose cells, tighter aside hierarchy
- Admin mast filter chips (Users / Services / Invoices) restyled with icons, accent rail, and clearer active / warn / ok states
- Admin nav reordered ops-first (Overview → Users → Services → Invoices → Tickets, then catalog)
- Login / register rebuilt as a full-bleed auth stage: hero brand, server-rack horizon, and a single interaction panel (replaces the old split-card shell)
- Admin **Settings** rebuilt as an ops desk (mast chips, one section rail, billing/panel/security sheets with sticky health asides)
- Settings → **Panel** rebuilt as a link desk (status hero with inline readiness, endpoints + key board, probe strip)
- Settings → Brand embeds the brand editor (Theme look / Colors / Identity / Layout / Assets as rail sub-nav; no nested brand mast)
- Layout tab splits into Navigation (radius / density / sidebar) and Atmosphere (login + panel animated presets)
- Theme look inspector: visual mode cards (light / dark / system) and preset gallery with live swatches
- Settings deep-links via `?tab=billing|panel|security|about`
- Install / update is **menu-only** by default:  
  `curl … -o /tmp/spirit-billing.sh` then `sudo bash /tmp/spirit-billing.sh`  
  (installer **v1.3.0**). Docs no longer push flag-heavy one-liners as the primary path.

### Fixed

- Branding theme/atmosphere no longer flashes the default look on refresh — last applied theme is cached and reapplied before React boots
- Service delete refund window no longer fails early on recently created services (min-age guard)
- Update now re-applies `chmod -R a+rX` on `billing-api/dist` + `node_modules` after rebuild so `User=spirit-billing` can read new files (fixes crash-loop `EACCES …/dist/lib/*.js`) (installer **v1.3.4**)
- Update always **verifies** API deps (package files + `import('fastify')` / `@prisma/client`) and rebuilds when anything is missing or broken — not only when the source stamp changes (installer **v1.3.3**)
- Installer prompts (domain / Panel URL / API key) were skipped under `sudo` when stdin was not a TTY — now always use `/dev/tty` (installer **v1.3.1**)
- Password changes no longer fail with “Could not sync changes to the game panel” for elevated Panel accounts — billing password still updates; Panel password must be changed in the panel
- Updater rebuilds when `node_modules` is missing/corrupt even if the source stamp is unchanged (fixes `Cannot find package …/fastify`)
- Installer menu **Repair deps** / `spirit.sh repair` force-reinstalls `node_modules` and rebuilds (installer **v1.3.2**)

### Security

- Ticket `serviceId` links must belong to the ticket owner; client ticket detail no longer exposes panel server IDs
- Ticket uploads use magic-byte sniffing, uploader binding, signed URLs, and auth-gated `/uploads/tickets/` serving
- Short-lived access JWTs with rotating DB-backed refresh sessions, CSRF header checks, and Secure/`SameSite` cookie hardening (`__Host-` when HTTPS)
- Staff capability checks + step-up password for role/password changes; unsuspend is full-admin only; full-admin UI route guards
- Public `/health` trimmed; staff About payload reduced; SSRF denylist adds CGNAT/`198.18`; nginx CSP + nested security headers
- Theme DOM cache allowlisted; tighter login rate limits + lockout; loud alerts when Panel/Turnstile secret decrypt fails

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
| `1.0.0.0` | `1.0.0.0` | `1.3.4` | First 1.0; four-part tags; security hardening + ops UI |
| `0.1.1` | `0.1.1` | `1.2.2` | Installer / sync / uninstall |
| `0.1.0` | `0.1.0` | — | First GitHub publish |

Git tags use the four-part `vX.Y.Z.W` scheme from **v1.0.0.0** onward (see [releasing.md](./releasing.md)).

[Unreleased]: https://github.com/SpiritFramework/spirit-billing/compare/v1.0.0.0...HEAD
[1.0.0.0]: https://github.com/SpiritFramework/spirit-billing/compare/v0.1.1...v1.0.0.0
[0.1.1]: https://github.com/SpiritFramework/spirit-billing/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/SpiritFramework/spirit-billing/releases/tag/v0.1.0
