import { existsSync, mkdirSync } from 'node:fs';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
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
const TICKET_SIGN_TTL_SEC = 60 * 60;

export type UploadedTicketImage = {
  url: string;
  name: string;
  mime: string;
  size: number;
};

export type TicketUploadMeta = {
  userId: string;
  createdAt: string;
  mime: string;
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
    mkdirSync(join(root, 'branding'), { recursive: true });
  } catch {
    // spirit-billing may lack write access until update.sh owns uploads/
  }
  return root;
}

export function uploadsRootReady() {
  return existsSync(getUploadsRoot());
}

/** Magic-byte sniff so MIME spoofing cannot smuggle SVG/HTML. */
export function sniffImageMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (
    buffer[0] === 0x47
    && buffer[1] === 0x49
    && buffer[2] === 0x46
    && buffer[3] === 0x38
    && (buffer[4] === 0x39 || buffer[4] === 0x37)
    && buffer[5] === 0x61
  ) {
    return 'image/gif';
  }
  // RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function assertImageBuffer(buffer: Buffer, claimedMime: string): string {
  const sniffed = sniffImageMime(buffer);
  if (!sniffed) {
    throw Object.assign(new Error('File is not a valid JPEG, PNG, WebP, or GIF image'), {
      statusCode: 422,
    });
  }
  const claimed = claimedMime.toLowerCase();
  const claimedFamily =
    claimed.includes('jpeg') || claimed.includes('jpg')
      ? 'image/jpeg'
      : claimed.includes('png')
        ? 'image/png'
        : claimed.includes('webp')
          ? 'image/webp'
          : claimed.includes('gif')
            ? 'image/gif'
            : '';
  if (claimedFamily && claimedFamily !== sniffed) {
    throw Object.assign(new Error('Image content does not match the declared type'), {
      statusCode: 422,
    });
  }
  return sniffed;
}

function ticketMetaPath(safeName: string) {
  return join(getUploadsRoot(), 'tickets', `${safeName}.meta.json`);
}

export async function readTicketUploadMeta(safeName: string): Promise<TicketUploadMeta | null> {
  try {
    const raw = await readFile(ticketMetaPath(safeName), 'utf8');
    const parsed = JSON.parse(raw) as TicketUploadMeta;
    if (!parsed?.userId || typeof parsed.userId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveTicketImage(input: {
  buffer: Buffer;
  filename: string;
  mimetype: string;
  userId: string;
}): Promise<UploadedTicketImage> {
  if (!input.userId?.trim()) {
    throw Object.assign(new Error('Upload requires an authenticated user'), { statusCode: 401 });
  }
  const sniffed = assertImageBuffer(input.buffer, input.mimetype);
  const ext = ALLOWED_MIME[sniffed];
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
  await writeFile(
    ticketMetaPath(safeName),
    JSON.stringify({
      userId: input.userId,
      createdAt: new Date().toISOString(),
      mime: sniffed,
    } satisfies TicketUploadMeta),
  );

  const original = input.filename.replace(/[^\w.\- ()]+/g, '_').slice(0, 80) || `image${ext}`;
  return {
    url: `/uploads/tickets/${safeName}`,
    name: original,
    mime: sniffed,
    size: input.buffer.length,
  };
}

export async function assertUploadReadable(relativeUrl: string) {
  if (!relativeUrl.startsWith('/uploads/tickets/')) return false;
  const name = relativeUrl.replace('/uploads/tickets/', '').split('?')[0];
  if (!/^[\w.\-]+$/.test(name)) return false;
  try {
    await access(join(getUploadsRoot(), 'tickets', name));
    return true;
  } catch {
    return false;
  }
}

export async function assertUploadOwnedBy(relativeUrl: string, userId: string) {
  if (!(await assertUploadReadable(relativeUrl))) return false;
  const name = relativeUrl.replace('/uploads/tickets/', '').split('?')[0];
  const meta = await readTicketUploadMeta(name);
  // Legacy files without meta remain readable only via signed URL / staff auth.
  if (!meta) return false;
  return meta.userId === userId;
}

function signingKey(): Buffer {
  return createHmac('sha256', getConfig().secretsEncryptionKey)
    .update('spirit-billing-ticket-upload')
    .digest();
}

export function signTicketUploadUrl(relativeUrl: string, ttlSec = TICKET_SIGN_TTL_SEC): string {
  const pathOnly = relativeUrl.split('?')[0];
  if (!pathOnly.startsWith('/uploads/tickets/')) return pathOnly;
  const name = pathOnly.replace('/uploads/tickets/', '');
  if (!/^[\w.\-]+$/.test(name)) return pathOnly;
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const sig = createHmac('sha256', signingKey()).update(`${name}.${exp}`).digest('base64url');
  return `${pathOnly}?exp=${exp}&sig=${sig}`;
}

export function verifyTicketUploadSignature(name: string, expRaw: string | undefined, sig: string | undefined): boolean {
  if (!expRaw || !sig || !/^[\w.\-]+$/.test(name)) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac('sha256', signingKey()).update(`${name}.${exp}`).digest('base64url');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type BrandingAssetKind = 'logo' | 'favicon';

export type UploadedBrandingAsset = UploadedTicketImage & {
  kind: BrandingAssetKind;
};

export async function saveBrandingAsset(input: {
  kind: BrandingAssetKind;
  buffer: Buffer;
  filename: string;
  mimetype: string;
}): Promise<UploadedBrandingAsset> {
  const sniffed = assertImageBuffer(input.buffer, input.mimetype);
  const ext = ALLOWED_MIME[sniffed];
  if (!ext) {
    throw Object.assign(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'), { statusCode: 422 });
  }
  if (input.buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('Images must be 5 MB or smaller'), { statusCode: 422 });
  }

  const root = ensureUploadsRoot();
  const dir = join(root, 'branding');
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    throw Object.assign(
      new Error('Uploads directory is not writable. Fix ownership of billing-api/uploads.'),
      { statusCode: 503 },
    );
  }
  const safeName = `${input.kind}-${Date.now()}-${randomBytes(8).toString('hex')}${ext}`;
  const absolute = join(dir, safeName);
  await writeFile(absolute, input.buffer);

  const original = input.filename.replace(/[^\w.\- ()]+/g, '_').slice(0, 80) || `${input.kind}${ext}`;
  return {
    kind: input.kind,
    url: `/uploads/branding/${safeName}`,
    name: original,
    mime: sniffed,
    size: input.buffer.length,
  };
}

export function uploadsPublicBase() {
  return getConfig().billingUrl.replace(/\/$/, '');
}
