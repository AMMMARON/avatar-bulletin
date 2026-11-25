import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { BlobPreconditionFailedError, get, put } from '@vercel/blob';

import { AsyncLocalStorage } from 'node:async_hooks';

export const workspace = new AsyncLocalStorage();
export const channel = () => workspace.getStore() || 'main';
const pathname = () => channel() === 'main' ? 'studio/v1/state.sealed' : 'channels/' + channel() + '/state.sealed';
const conflictText = 'تغيّرت النشرة أثناء العمل. حدّث الصفحة وأعد المحاولة.';

export class StudioError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireValue(ok, message, status = 400) {
  if (!ok) throw new StudioError(status, message);
}

export function initialState() {
  return {
    studio: { stories: [], order: [], updatedAt: 0, version: 0 },
    providers: { livekit: {}, runway: {}, elevenlabs: {} },
    broadcast: { phase: 'idle', startedAt: null },
  };
}

function localFile() {
  const path = process.env.BULLETIN_LOCAL_STORE;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production' || !path || !isAbsolute(path)) return null;
  return channel() === 'main' ? path : path + '.' + channel();
}

export function storageReady() {
  return Boolean((process.env.BLOB_READ_WRITE_TOKEN || localFile()) && process.env.STUDIO_SECRET?.length >= 32);
}

function storageKey() {
  return createHash('sha256').update((process.env.STUDIO_VAULT_CONTEXT || 'bulletin-vault-v1') + '\0').update(process.env.STUDIO_SECRET).digest();
}

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', storageKey(), iv);
  cipher.setAAD(Buffer.from(pathname()));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function decrypt(text) {
  const bytes = Buffer.from(text, 'base64url');
  const cipher = createDecipheriv('aes-256-gcm', storageKey(), bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(pathname()));
  cipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
}

async function localRead(path) {
  try {
    const value = await readFile(path, 'utf8');
    return { state: decrypt(value), etag: createHash('sha256').update(value).digest('hex') };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { state: initialState(), etag: null };
  }
}

export async function readState() {
  requireValue(storageReady(), 'أكمل إعداد التخزين الخاص ومفتاح التشفير في الخادم.', 503);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return localRead(localFile());
  const blob = await get(pathname(), { access: 'private', useCache: false });
  if (!blob) return { state: initialState(), etag: null };
  requireValue(blob.statusCode === 200 && blob.blob?.etag && blob.stream, 'تعذرت قراءة بيانات الاستوديو.', 503);
  return { state: decrypt(await new Response(blob.stream).text()), etag: blob.blob.etag };
}

async function localWrite(path, text, etag) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = path + '.lock';
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new StudioError(409, conflictText);
    throw error;
  }
  const temp = path + '.' + randomUUID() + '.tmp';
  try {
    requireValue((await localRead(path)).etag === etag, conflictText, 409);
    const file = await open(temp, 'wx', 0o600);
    try { await file.writeFile(text); } finally { await file.close(); }
    await rename(temp, path);
  } finally {
    await unlink(temp).catch(() => {});
    await lock.close();
    await unlink(lockPath);
  }
}

async function writeState(state, etag) {
  const text = encrypt(state);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return localWrite(localFile(), text, etag);
  try {
    await put(pathname(), text, {
      access: 'private', addRandomSuffix: false, allowOverwrite: Boolean(etag),
      ...(etag ? { ifMatch: etag } : {}), contentType: 'application/octet-stream',
    });
  } catch (error) {
    if (error instanceof BlobPreconditionFailedError || /already exists|already been uploaded/i.test(error.message)) {
      throw new StudioError(409, conflictText);
    }
    throw error;
  }
}

// Retry storage-level conflicts. Logical conflicts (for example a stale script revision)
// are thrown by the callback and reported immediately.
export async function changeState(change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { state, etag } = await readState();
    if (change(state) === false) return state;
    try {
      await writeState(state, etag);
      return state;
    } catch (error) {
      if (error.status !== 409 || attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 20 + Math.random() * 70));
    }
  }
}
