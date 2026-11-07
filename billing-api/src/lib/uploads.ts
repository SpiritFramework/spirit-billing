import { existsSync, mkdirSync } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getConfig } from './env.js';

const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/pjpeg': '.jpg',
  'image/png': '.png',
  'image/x-png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const MAX_BYTES = 5 * 1024 * 1024;

export type UploadedTicketImage = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

export function getUploadsRoot() {
  const fromEnv = process.env.UPLOADS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  // WorkingDirectory is billing-api in production → /opt/spirit-billing/billing-api/uploads
  return resolve(process.cwd(), 'uploads');
}

/** Create uploads tree when possible. Never throw — deploy perms can lag behind code. */
export function ensureUploadsRoot() {
  const root = getUploadsRoot();
  try {
    mkdirSync(join(root, 'tickets'), { recursive: true });
  } catch {
    // spirit-billing may lack write access until update.sh owns uploads/
  }
  return root;
}

export function uploadsRootReady() {
  return existsSync(getUploadsRoot());
}

export async function saveTicketImage(input: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}): Promise<UploadedTicketImage> {
  const mime = input.mimetype.toLowerCase();
  const ext = ALLOWED_MIME[mime];
  if (!ext) {
    throw Object.assign(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'), { statusCode: 422 });
  }
  if (input.buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('Images must be 5 MB or smaller'), { statusCode: 422 });
  }

  const root = ensureUploadsRoot();
  const dir = join(root, 'tickets');
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    throw Object.assign(
      new Error('Uploads directory is not writable. Fix ownership of billing-api/uploads.'),
      { statusCode: 503 },
    );
  }
  const safeName = `${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
  const absolute = join(dir, safeName);
  await writeFile(absolute, input.buffer);

  const original = input.filename.replace(/[^\w.\- ()]+/g, '_').slice(0, 80) || `image${ext}`;
  return {
    url: `/uploads/tickets/${safeName}`,
    name: original,
    mime,
    size: input.buffer.length,
  };
}

export async function assertUploadReadable(relativeUrl: string) {
  if (!relativeUrl.startsWith('/uploads/tickets/')) return false;
  const name = relativeUrl.replace('/uploads/tickets/', '');
  if (!/^[\w.\-]+$/.test(name)) return false;
  try {
    await access(join(getUploadsRoot(), 'tickets', name));
    return true;
  } catch {
    return false;
  }
}

export function uploadsPublicBase() {
  return getConfig().billingUrl.replace(/\/$/, '');
}
