# Spirit-Billing

Spirit-Billing is the **client billing and storefront** for Spirit Host game server hosting, built by **SpiritFramework**.

It provides a branded web portal where customers browse plans, place orders, pay invoices, and manage services — while admins run catalog, billing, support, and provisioning from one dashboard. Spirit-Billing integrates with **[Spirit-Panel](https://github.com/SpiritFramework/SpiritPanel)** via the Application API to create Panel users and game servers automatically when invoices are paid.

> Billing and Panel are **separate applications** with separate deploys. This repo contains only the billing API, web UI, and production scripts.

**Docs:** [docs/](docs/) · **Changelog:** [docs/CHANGELOG.md](docs/CHANGELOG.md) · **Install:** [deploy/INSTALL.md](deploy/INSTALL.md)

---

## Preview

| Area | What it does |
|------|----------------|
| **Storefront** | Landing page, game categories, plan cards, cart |
| **Client area** | Dashboard, services, invoices, profile, support tickets |
| **Admin** | Catalog, users, invoices, renewals, Panel sync, settings |

Payment is **manual/offline** (bank transfer instructions on invoices). Clients can also pay with **account credits**; zero-balance orders provision automatically after checkout.

---

## Features

### Client storefront

* Browse game hosting plans **without logging in** — cart saved in the browser
* **Checkout requires an account** linked to Spirit-Panel
* Single-product orders and **multi-item cart checkout** (up to 10 items)
* **Coupons** — percent discount, fixed discount, or credit bonus
* **Account credits** — apply at checkout or pay open invoices
* **Service upgrades** — move to a higher plan (same egg) via upgrade invoice
* **Billing cycles** — monthly, quarterly, yearly
* **Support tickets** with image attachments
* In-app **notifications**

### Admin dashboard

* **Overview** — revenue, users, services, invoices
* **Categories & products** — game groupings; each plan maps to a Panel **egg** and **node**
* **Plan feature flags** — subdomain access, FiveM marketplace, Minecraft plugins (passed to Panel on provision)
* **Services** — suspend/unsuspend, custom servers, renewal invoices, overdue enforcement
* **Invoices** — mark paid (triggers Panel provisioning), cancel unpaid
* **Users** — roles, credits, Panel relink, enable/disable
* **Coupons** — create and track redemptions
* **Tickets** — staff queue with categories
* **System logs** — auth, billing, admin, panel, system events
* **Settings** — branding, company info, Panel connection, invoice rules, maintenance mode, Turnstile, registration toggle

### Spirit-Panel integration

| Event | Panel action |
|-------|----------------|
| Client registers | Creates matching Panel user (same email, username, password) |
| Invoice marked paid | Creates server with plan resources + feature flags; `externalId` = billing service id |
| Service suspended / unsuspended | Suspends or unsuspends Panel server |
| Service cancelled | Deletes Panel server |
| Admin sync | Import existing Panel servers into billing |

Requires a **Spirit-Panel Application API key** with users and servers scopes.

---

## Architecture

```
Internet → Nginx (HTTPS)
              ↓
     billing-web (React SPA)
              ↓  /api/*
     billing-api (Fastify, 127.0.0.1:3001)
              ↓
          MariaDB / MySQL
              ↓
     Spirit-Panel Application API  →  FeatherWings game nodes
```

| Component | Path | Role |
|-----------|------|------|
| **billing-api** | `billing-api/` | REST API, Prisma, provisioning logic |
| **billing-web** | `billing-web/` | React (Vite) storefront + admin UI |
| **deploy** | `deploy/` | nginx, systemd, install/update scripts |

---

## Tech stack

| Layer | Technology |
|-------|------------|
| API | Node.js 20+, Fastify 5, TypeScript, Zod |
| Database | Prisma 6, MySQL / MariaDB |
| Auth | bcrypt, JWT in HttpOnly cookie (`spirit_billing_session`) |
| Web | React 19, React Router 7, Vite 6, Tailwind CSS 4 |
| Production | nginx, systemd, Ubuntu 22.04+ |

---

## Roles

| Role | Access |
|------|--------|
| **client** | Storefront, dashboard, services, invoices, profile, tickets |
| **staff** | Admin overview, services (suspend), invoices (cancel unpaid), tickets, users (read), logs — no catalog, settings, or mark-paid |
| **admin** | Full admin — catalog, coupons, mark paid (provisions servers), credits, settings, Panel sync, renewals |

Staff and admin sessions expire after **24 hours**; client sessions after **7 days**.

---

## Local development

### Requirements

* Node.js **20+**
* MySQL or MariaDB (XAMPP works on Windows)
* Spirit-Panel running locally for provisioning tests ([SpiritPanel](https://github.com/SpiritFramework/SpiritPanel))

### Ports (default)

| Service | URL |
|---------|-----|
| Billing web | http://localhost:5174 |
| Billing API | http://localhost:3001 |
| Panel web | http://localhost:5173 |
| Panel API | http://localhost:3000 |

### 1. Database

Create database `spirit_billing` (utf8mb4). Default dev connection:

```
mysql://root@127.0.0.1:3306/spirit_billing
```

### 2. Billing API

```bash
cd billing-api
cp .env.example .env          # Windows: copy .env.example .env
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Seed admin (change after first login):

| Field | Default |
|-------|---------|
| Email | `admin@spirithost.local` |
| Username | `admin` |
| Password | `ChangeMe123!` (or value in `.env`) |

Health check: http://localhost:3001/health

### 3. Spirit-Panel Application API key

In Spirit-Panel admin:

1. **Admin → API Keys** → create an **Application** key with **users** and **servers** scopes
2. Add to `billing-api/.env`:

```env
PANEL_API_URL="http://localhost:3000"
PANEL_WEB_URL="http://localhost:5173"
PANEL_APPLICATION_API_KEY="sp_identifier.secret"
```

Ensure Panel API is running on port 3000.

### 4. Billing web

```bash
cd billing-web
npm install
npm run dev
```

Open http://localhost:5174 — Vite proxies `/api` to the billing API.

### Test flow

1. **Register** a client → user appears in Spirit-Panel
2. **Admin → Products** → create a plan (pick egg + node from Panel catalog)
3. Client **orders from the store** → unpaid invoice
4. **Admin → Invoices → Mark paid** → server is created on the panel

Or: apply credits / a 100% coupon for zero-balance auto-provision.

---

## Configuration

### Environment variables (`billing-api/.env`)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | MySQL connection string |
| `JWT_SECRET` | Session signing (required; 32+ chars in production) |
| `SECRETS_ENCRYPTION_KEY` | Encrypts Panel API key in DB (required in production; must differ from JWT) |
| `BILLING_URL` | Public billing URL (HTTPS in production) |
| `CORS_ORIGINS` | Allowed browser origins |
| `PANEL_API_URL` | Spirit-Panel API base URL |
| `PANEL_WEB_URL` | Spirit-Panel client URL (links from billing) |
| `PANEL_APPLICATION_API_KEY` | Application API key from Panel |
| `INVOICE_PREFIX` | Invoice number prefix (default `INV`) |
| `DEFAULT_CURRENCY` | Default currency (default `GBP`) |
| `COMPANY_NAME` | Company name on invoices |
| `PAYMENT_INSTRUCTIONS` | Bank transfer text shown to clients |

Templates: `billing-api/.env.example`, `deploy/env.production.example`

### Admin settings (database)

Branding, logo, accent colours, support email/URL, invoice due days, overdue suspend/terminate rules, maintenance mode, registration toggle, Turnstile keys, and Panel connection can be managed in **Admin → Settings** without editing `.env`.

---

## Production deployment

Target: **Ubuntu 22.04 LTS** — nginx (TLS) → static SPA + API reverse proxy → MariaDB.  
GitHub: https://github.com/SpiritFramework/spirit-billing

### One-command install / update (like Spirit-Panel)

```bash
curl -fsSL https://raw.githubusercontent.com/SpiritFramework/spirit-billing/main/scripts/spirit.sh -o /tmp/spirit-billing.sh
sudo bash /tmp/spirit-billing.sh auto --domain billing.example.com -y
```

That installs on first run and updates on later runs (keeps `.env` + database). DNS-ready hosts get Let's Encrypt automatically. Optional Panel wiring: `--panel-url` / `--panel-key`. If Panel was already live, add `--sync-panel` to import existing users/servers (or run `sync-panel` later). Prefer `--channel release` once you publish GitHub Releases.

Installer self-tests:

```bash
bash scripts/spirit.test.sh
```

Full guide — paths, nginx, systemd, troubleshooting:

→ **[deploy/INSTALL.md](deploy/INSTALL.md)**

| Path (default) | Purpose |
|----------------|---------|
| `/home/Spirit-Billing/` | Git checkout (source for install/update) |
| `/opt/spirit-billing/` | Live API, `.env`, built API `dist/` |
| `/var/www/spirit-billing/` | Built SPA (nginx root) |
| `/etc/systemd/system/spirit-billing.service` | API service |

---

## Typical workflows

### New customer

Register → browse store → checkout → receive unpaid invoice → pay (bank transfer) → admin marks paid → Panel server provisioned → client opens server in Panel.

### Renewal

Admin runs renewal job (or scheduled) → unpaid renewal invoice → client pays → service stays active. Overdue rules can suspend after N days and terminate after M days (configurable in settings).

### Custom server (admin)

**Admin → Services → Create custom** — pick user, egg, node, resources, feature flags, price. Can provision immediately or invoice first.

### Import existing Panel servers

**Admin → Services → Sync from Panel** — links existing Panel servers to billing users/services.

---

## Building for production

```bash
cd billing-api && npm install && npm run build
cd ../billing-web && npm install && npm run build
```

Schema updates on the server:

```bash
cd /opt/spirit-billing/billing-api
npx prisma db push    # or migrate deploy if using migrations
sudo systemctl restart spirit-billing
```

---

## Documentation

| Doc | Description |
|-----|-------------|
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Release history — add an entry for every update |
| [docs/releasing.md](docs/releasing.md) | How to version, tag, and publish |
| [docs/README.md](docs/README.md) | Docs index |
| [deploy/INSTALL.md](deploy/INSTALL.md) | VPS install / update / sync-panel / uninstall |

---

## Related projects

| Project | Repository | Role |
|---------|------------|------|
| **Spirit-Panel** | [SpiritFramework/SpiritPanel](https://github.com/SpiritFramework/SpiritPanel) | Game server control panel (FeatherWings) |
| **Spirit-Billing** | [SpiritFramework/spirit-billing](https://github.com/SpiritFramework/spirit-billing) | Client billing & storefront |

Spirit-Billing provisions and manages servers on Spirit-Panel; it does not run game workloads itself.

---

## License

See repository license file. Spirit-Billing is part of the SpiritFramework hosting stack.
