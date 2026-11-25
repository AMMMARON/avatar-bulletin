import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const format = 'bulletin-job-v1';
const ttl = 90_000;
const maxEnvelope = 16 * 1024;

function required(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validate(job) {
  if (!job || !required(job.room, 128) || !required(job.runwayApiKey, 1024) ||
      !required(job.elevenlabsApiKey, 1024) || !required(job.voiceId, 128) ||
      Boolean(job.avatarId) === Boolean(job.presetId) || !required(job.avatarId || job.presetId, 128)) {
    throw new Error('Invalid broadcast configuration');
  }
  if (!Array.isArray(job.segments) || !job.segments.length || job.segments.length > 12) {
    throw new Error('Invalid rundown length');
  }
  let total = 0;
  const ids = new Set();
  for (const segment of job.segments) {
    if (!segment || !required(segment.id, 100) || ids.has(segment.id) ||
        !Number.isSafeInteger(segment.revision) || segment.revision < 1 || !required(segment.text, 3000)) {
      throw new Error('Invalid approved revision');
    }
    ids.add(segment.id);
    total += segment.text.length;
  }
  if (total > 3000) throw new Error('Rundown exceeds 3000 characters');
}

function decodeKey(secret) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(secret)) {
    throw new Error('Invalid worker encryption key');
  }
  const key = Buffer.from(secret, 'base64url');
  if (key.length !== 32 || key.toString('base64url') !== secret) throw new Error('Invalid worker encryption key');
  return key;
}

export function sealJob(job, secret, now = Date.now()) {
  validate(job);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', decodeKey(secret), iv);
  cipher.setAAD(Buffer.from(format));
  const plaintext = JSON.stringify({ issuedAt: now, job });
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const envelope = [format, iv.toString('base64url'), data.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
  if (envelope.length > maxEnvelope) throw new Error('Rundown exceeds dispatch capacity');
  return envelope;
}

export function openJob(envelope, roomName, secret, now = Date.now()) {
  if (typeof envelope !== 'string' || envelope.length > maxEnvelope) throw new Error('Invalid dispatch envelope');
  const [version, iv, data, tag, extra] = envelope.split('.');
  if (version !== format || extra !== undefined || !/^[\w-]{16}$/.test(iv ?? '') ||
      !/^[\w-]+$/.test(data ?? '') || !/^[\w-]{22}$/.test(tag ?? '')) throw new Error('Invalid dispatch envelope');
  const authTag = Buffer.from(tag, 'base64url');
  const ciphertext = Buffer.from(data, 'base64url');
  if (authTag.toString('base64url') !== tag || ciphertext.toString('base64url') !== data) throw new Error('Invalid dispatch encoding');
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(secret), Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(format));
  decipher.setAuthTag(authTag);
  const content = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const { issuedAt, job } = JSON.parse(content.toString('utf8'));
  if (!Number.isSafeInteger(issuedAt) || issuedAt > now + 5000 || issuedAt + ttl < now || job?.room !== roomName) {
    throw new Error('Expired or misdirected dispatch');
  }
  validate(job);
  return job;
}
