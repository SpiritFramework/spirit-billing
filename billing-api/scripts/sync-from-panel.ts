#!/usr/bin/env tsx
/**
 * Import existing Spirit-Panel servers (and missing billing users) into Billing.
 *
 *   cd /opt/spirit-billing/billing-api
 *   set -a && . /opt/spirit-billing/.env && set +a
 *   npx tsx scripts/sync-from-panel.ts
 *   npx tsx scripts/sync-from-panel.ts --no-create-users
 *
 * Prefer the bootstrap:
 *   sudo bash /home/Spirit-Billing/scripts/spirit.sh sync-panel
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { syncPanelServersIntoBilling } from '../src/lib/sync-panel-services.js';
import { prisma } from '../src/lib/prisma.js';

const envFile = process.env.SPIRIT_BILLING_ENV_FILE || resolve(process.cwd(), '../.env');
loadEnv({ path: envFile });
loadEnv(); // also allow cwd .env

const createMissingUsers = !process.argv.includes('--no-create-users');
const passwordsOut =
  process.env.SPIRIT_BILLING_IMPORT_PASSWORDS_FILE ||
  resolve(process.cwd(), '../.panel-import-passwords');

async function main() {
  console.log(
    createMissingUsers
      ? 'Syncing panel → billing (creating missing client accounts)…'
      : 'Syncing panel → billing (existing billing users only)…',
  );

  const result = await syncPanelServersIntoBilling({ createMissingUsers });

  console.log(
    JSON.stringify(
      {
        imported: result.imported.length,
        updated: result.updated.length,
        backfilled: result.backfilled.length,
        skipped: result.skipped.length,
        usersCreated: result.usersCreated.length,
        usersLinked: result.usersLinked.length,
      },
      null,
      2,
    ),
  );

  if (result.skipped.length) {
    console.log('\nSkipped:');
    for (const row of result.skipped.slice(0, 50)) {
      console.log(`  - ${row.name} (${row.panelServerId}): ${row.reason}${row.email ? ` <${row.email}>` : ''}${row.detail ? ` — ${row.detail}` : ''}`);
    }
    if (result.skipped.length > 50) {
      console.log(`  … and ${result.skipped.length - 50} more`);
    }
  }

  const withPass = result.usersCreated.filter((u) => u.temporaryPassword);
  if (withPass.length) {
    const lines = [
      `# Spirit Billing — temporary passwords for accounts created during panel sync`,
      `# Generated: ${new Date().toISOString()}`,
      `# Delete this file after clients change their passwords.`,
      `# Panel passwords were NOT changed.`,
      '',
      ...withPass.map(
        (u) =>
          `${u.email}\t${u.username}\t${u.temporaryPassword}\tpanelUserId=${u.panelUserId ?? ''}`,
      ),
      '',
    ];
    writeFileSync(passwordsOut, lines.join('\n'), { mode: 0o600 });
    console.log(`\nTemporary billing passwords written to: ${passwordsOut}`);
    console.log('Tell clients to log into Billing and change their password. Panel login is unchanged.');
  } else if (result.usersLinked.length) {
    console.log(`\nLinked ${result.usersLinked.length} existing billing user(s) to panel accounts (no new passwords).`);
  }

  if (result.imported.length) {
    console.log(
      `\nImported ${result.imported.length} service(s) at £0/month — set pricing in Admin → Services before renewals.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
