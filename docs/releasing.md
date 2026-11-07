# Releasing Spirit-Billing

Use this checklist every time you ship so `docs/CHANGELOG.md` stays accurate.

## 1. Record the change

While working (or just before tag):

1. Open [CHANGELOG.md](./CHANGELOG.md).
2. Under **`[Unreleased]`**, add bullets in the right section:
   - **Added** — new capabilities
   - **Changed** — behaviour / UX changes
   - **Fixed** — bug fixes
   - **Security** — vulnerability fixes
3. If `scripts/spirit.sh` `SCRIPT_VERSION` changed, mention it under Installer / Changed.

Keep bullets short and user-facing (what an operator or admin notices), not every internal commit.

## 2. Cut a version

1. Choose the next semver:
   - **patch** `0.1.x` — fixes, installer polish
   - **minor** `0.x.0` — features (sync, new admin tools, API)
   - **major** `x.0.0` — breaking deploy / API / schema changes
2. Move `[Unreleased]` notes into a new section:

   ```md
   ## [X.Y.Z] — YYYY-MM-DD
   ```

3. Leave empty `[Unreleased]` stubs for the next cycle.
4. Bump `"version"` in:
   - `billing-api/package.json`
   - `billing-web/package.json`
5. Update the **Version map** table at the bottom of the changelog.
6. Update compare links at the bottom of the changelog to match the new tag.

## 3. Tag and publish

```bash
git add docs/CHANGELOG.md docs/releasing.md billing-api/package.json billing-web/package.json
git commit -m "Release vX.Y.Z."
git tag -a vX.Y.Z -m "Spirit-Billing vX.Y.Z"
git push origin main --tags
```

On GitHub: **Releases → Draft a release** from tag `vX.Y.Z`, paste the changelog section for that version as the body.

Optional: rebuild `Spirit-Billing.zip` at the repo root after the release commit (see workspace deploy-zip rule).

## 4. Installer channel

- **`dev`** — tracks `main` (default until you rely on Releases)
- **`release`** — latest non-draft, non-prerelease GitHub Release tag

After the first proper GitHub Release exists:

```bash
sudo bash /tmp/spirit-billing.sh update --channel release -y
```

## Tag naming

Prefer **`v0.1.1`** (semver with a `v` prefix) for Billing so GitHub Releases and `scripts/spirit.sh --channel release` resolve cleanly.

If you later adopt four-part tags like Panel (`V1.2.0.0`), document the switch in the changelog and keep `latest_release_tag` compatible.
