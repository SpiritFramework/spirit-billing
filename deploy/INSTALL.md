# Spirit Billing — Ubuntu 22.04 production install

Target OS: **Ubuntu 22.04 LTS**  
Stack: nginx (TLS) → static SPA + reverse proxy → Node API on `127.0.0.1:3001` → MariaDB  
Repo: https://github.com/SpiritFramework/spirit-billing

---

## One-command install / update (recommended)

Same pattern as Spirit-Panel: download the bootstrap script, then run it.

```bash
curl -fsSL https://raw.githubusercontent.com/SpiritFramework/spirit-billing/main/scripts/spirit.sh -o /tmp/spirit-billing.sh
sudo bash /tmp/spirit-billing.sh auto --domain billing.example.com -y
```

That single command installs (first run) or updates (later runs): packages, MariaDB, nginx, build, systemd, health check. If DNS already points at the server, Let's Encrypt is enabled automatically. Panel can be wired in the same run:

```bash
sudo bash /tmp/spirit-billing.sh auto --domain billing.example.com \
  --panel-url https://panel.example.com --panel-key YOUR_APP_KEY -y
```

If **Spirit-Panel was already live** (users + servers), import them in the same run:

```bash
sudo bash /tmp/spirit-billing.sh auto --domain billing.example.com \
  --panel-url https://panel.example.com --panel-key YOUR_APP_KEY \
  --sync-panel -y
```

Or any time after install:

```bash
sudo bash /home/Spirit-Billing/scripts/spirit.sh sync-panel \
  --panel-url https://panel.example.com --panel-key YOUR_APP_KEY -y
```

That creates missing Billing client accounts (temporary passwords in `/opt/spirit-billing/.panel-import-passwords`), links them to Panel users, and imports servers as £0 custom services. Panel passwords are not changed.

Interactive menu (no flags): pick **Auto install / Auto update**, or **Sync panel**.

> **Do not use** `sudo bash <(curl ...)`. Process substitution breaks under `sudo` (`/dev/fd/…: No such file or directory`). Download to a file, or pipe: `curl … | sudo bash -s -- auto --domain billing.example.com -y`.

### Non-interactive

```bash
# Fully automatic install-or-update
sudo bash /tmp/spirit-billing.sh auto --domain billing.example.com -y

# Force Let's Encrypt even if DNS check is unsure
sudo bash /tmp/spirit-billing.sh auto --domain billing.example.com --with-ssl -y

# Later updates (keeps /opt/spirit-billing/.env + database)
sudo bash /tmp/spirit-billing.sh auto -y
sudo bash /home/Spirit-Billing/scripts/spirit.sh auto -y

# Enable TLS after DNS is ready
sudo bash /home/Spirit-Billing/scripts/spirit.sh ssl
```

### Channels

| Channel | Source |
|---------|--------|
| `dev` (default) | `main` branch |
| `release` | Latest non-draft GitHub Release tag |

```bash
sudo bash /tmp/spirit-billing.sh update --channel release -y
sudo bash /tmp/spirit-billing.sh update --ref V1.0.0.0 -y
```

### What the bootstrap does

1. Clones or updates **`/home/Spirit-Billing`** from GitHub  
2. **`auto`** → install if missing, otherwise update (no extra prompts with `-y`)  
3. Detects domain from existing `.env` / nginx when possible  
4. Auto-enables Let's Encrypt when DNS already points here (`--no-ssl` to skip, `--with-ssl` to force)  
5. Optional `--panel-url` / `--panel-key` / `--admin-email` written straight into `.env`  
6. **Update** → backs up `.env`, ticket uploads, and a DB dump; pulls the selected ref; runs `deploy/update.sh`  
7. Skips npm rebuild when commit + lockfiles + Prisma schema are unchanged (`--force-build` to override)  
8. Preserves `billing-api/uploads/`; polls `/health`; prints admin URL + password on first install  
9. Menu also covers **ssl**, **status**, **restart**, **logs**, **uninstall**

### Installer tests

From a checkout (Git Bash / Linux):

```bash
bash scripts/spirit.test.sh
```

After install the script prints the admin URL and password. Only edit `.env` if you did not pass `--panel-url` / `--panel-key`.

If DNS was not ready during install:

```bash
sudo bash /home/Spirit-Billing/scripts/spirit.sh ssl
```

---

## Local helper (already-cloned tree)

If the repo is already on the server:

```bash
sudo bash deploy/spirit-billing.sh install --domain billing.example.com
sudo bash deploy/spirit-billing.sh update
sudo bash deploy/spirit-billing.sh status
sudo bash deploy/spirit-billing.sh restart
sudo bash deploy/spirit-billing.sh logs
```

Optional flags for `update`:

| Flag | Meaning |
|------|---------|
| `--repo-dir PATH` | Source tree to sync from (default: parent of `deploy/`) |
| `--skip-web` | Only rebuild/restart API |
| `--skip-api` | Only rebuild SPA |

### Zip / WinSCP fallback

```bash
sudo unzip -o Spirit-Billing.zip -d /home/Spirit-Billing
sudo find /home/Spirit-Billing/deploy /home/Spirit-Billing/scripts -name '*.sh' -exec sed -i 's/\r$//' {} +
cd /home/Spirit-Billing
sudo bash deploy/spirit-billing.sh auto --domain billing.example.com --repo-dir /home/Spirit-Billing
```

---

## Spirit-Panel (game panel) updates

Billing and Spirit-Panel are **separate apps**. Updating billing does **not** update the panel.

1. Deploy/update **Spirit-Panel** with its own panel-api/panel-web process (your panel host).
2. In billing Admin → Settings → Panel, set API URL, web URL, and Application API key.
3. Restart billing if you changed `.env`: `sudo bash deploy/spirit-billing.sh restart`

Panel Application API features billing expects (deploy panel-api with these):

- `GET /api/application/users/:id`
- `GET /api/application/servers?externalId=…`
- Clear `409` when a server `externalId` already exists

---

## What gets installed

| Component | Package / unit |
|-----------|----------------|
| Node.js 20 | NodeSource |
| MariaDB | `mariadb-server` |
| nginx | `nginx` |
| Certbot | `certbot` + `python3-certbot-nginx` |
| Firewall | `ufw` (OpenSSH + Nginx Full) |
| API process | `spirit-billing.service` |

---

## File layout (where everything lives)

```
/opt/spirit-billing/                    # Application (NOT public)
├── .env                                # ★ SECRETS — mode 640, root:spirit-billing
├── .adminpass                          # One-time admin password (delete after login)
├── .dbpass                             # One-time DB password copy (delete after install)
├── billing-api/                        # API source + dist + node_modules
│   ├── .env -> ../.env                 # Symlink for Prisma/dotenv
│   └── dist/index.js                   # systemd ExecStart
├── billing-web/                        # Web source (build input)
└── deploy/                             # Scripts + nginx/systemd templates

/var/www/spirit-billing/                # ★ PUBLIC SPA only (www-data)
├── index.html
└── assets/…

/etc/nginx/sites-available/spirit-billing
/etc/nginx/sites-enabled/spirit-billing → …/sites-available/spirit-billing

/etc/systemd/system/spirit-billing.service

/var/lock/spirit-billing-install.lock   # flock during install
/var/lock/spirit-billing-update.lock    # flock during update
```

**Never** put `.env`, API source, or `node_modules` under `/var/www/`.

---

## File locks / permissions

| Path | Owner | Mode | Why |
|------|-------|------|-----|
| `/opt/spirit-billing/.env` | `root:spirit-billing` | **640** | Secrets readable only by root + service group |
| `/opt/spirit-billing/.adminpass` | `root:root` | **600** | One-time; delete after first login |
| `/opt/spirit-billing/` | `root:spirit-billing` | `755` dirs / `644` files | Service can read, not write app tree |
| `/opt/spirit-billing/billing-api/uploads/` | `spirit-billing:spirit-billing` | `u+rwX` | Ticket image uploads (service must write here) |
| `/var/www/spirit-billing/` | `www-data:www-data` | `755`/`644` | nginx serves static files only |
| API listen | `127.0.0.1:3001` | — | Not exposed on public interfaces |
| Install lock | `/var/lock/spirit-billing-*.lock` | flock | Blocks concurrent install/update |

Verify `.env` lock after any edit:

```bash
sudo chown root:spirit-billing /opt/spirit-billing/.env
sudo chmod 640 /opt/spirit-billing/.env
ls -l /opt/spirit-billing/.env
# -rw-r----- 1 root spirit-billing …
```

---

## nginx

Templates in this repo:

| File | Use |
|------|-----|
| `deploy/nginx/spirit-billing.http-only.conf` | First install (HTTP until Certbot) |
| `deploy/nginx/spirit-billing.conf` | Full HTTPS + HSTS + API proxy |

Behaviour:

- `/` → SPA at `/var/www/spirit-billing` (`try_files` → `index.html`)
- `/api/` → `http://127.0.0.1:3001`
- Security headers: `X-Frame-Options`, `nosniff`, `Referrer-Policy`, HSTS (HTTPS template)

Replace `billing.example.com` with your domain (install script does this automatically).

---

## systemd

Unit: `deploy/systemd/spirit-billing.service`

```bash
sudo bash deploy/spirit-billing.sh status
sudo bash deploy/spirit-billing.sh restart
sudo bash deploy/spirit-billing.sh logs
```

Environment is loaded from `/opt/spirit-billing/.env` via `EnvironmentFile=`.  
API binds to `HOST=127.0.0.1` in production.

---

## Required `.env` values

Copy from `deploy/env.production.example`. Critical fields:

| Variable | Notes |
|----------|--------|
| `NODE_ENV` | `production` |
| `BILLING_URL` / `CORS_ORIGINS` | `https://your-domain` |
| `DATABASE_URL` | Dedicated MySQL user (not root) |
| `JWT_SECRET` | ≥32 chars, not containing `change-me` |
| `SECRETS_ENCRYPTION_KEY` | Separate from JWT; ≥32 chars |
| `PANEL_*` | Spirit-Panel Application API |
| `ADMIN_PASSWORD` | ≥16 chars, letter + number (seed only) |

Generate secrets:

```bash
openssl rand -base64 48
```

---

## Manual checklist (if not using the script)

1. Create user `spirit-billing`, dirs as above  
2. Install Node 20, MariaDB, nginx, certbot  
3. Create DB `spirit_billing` + user  
4. Place `.env` at `/opt/spirit-billing/.env` (640)  
5. `cd billing-api && npm ci && npx prisma db push && npm run build && npm prune --omit=dev`  
6. Seed admin: `npx tsx prisma/seed.ts` (with env loaded)  
7. `cd billing-web && npm ci && npm run build` → copy `dist/` to `/var/www/spirit-billing`  
8. Install systemd unit + nginx site  
9. `ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable`  
10. Certbot for TLS  

---

## Health checks

```bash
curl -sS http://127.0.0.1:3001/health
curl -sS https://client.spirithost.co.uk/api/health
curl -sI https://client.spirithost.co.uk/
```

---

## Security notes for this layout

- API is loopback-only; only nginx faces the internet  
- Secrets never live in the web root  
- `trustProxy` is on in production — nginx must be the only public front (do not expose Node)  
- `SECRETS_ENCRYPTION_KEY` must differ from `JWT_SECRET` in production  
