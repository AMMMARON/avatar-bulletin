import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Sandbox } from './sandbox-sdk.mjs';
import { channel } from './store.js';

const sandboxPrefix = 'bulletin-air-';
const startupLimitMs = 120_000;
const sessionLimitMs = 5 * 60_000;

function completionToken(id, room) {
  return createHmac('sha256', process.env.BULLETIN_WORKER_SECRET)
    .update(JSON.stringify(['worker-complete-v1', id, room]))
    .digest('base64url');
}

export function verifyCompletionToken(id, room, token) {
  if (!process.env.BULLETIN_WORKER_SECRET || typeof token !== 'string' ||
      typeof id !== 'string' || typeof room !== 'string') return false;
  const expected = Buffer.from(completionToken(id, room));
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function stopRuntime(runtimeId) {
  if (!runtimeId || !runtimeId.startsWith(sandboxPrefix)) return;
  try {
    const sandbox = await Sandbox.get({ name: runtimeId, resume: false });
    await sandbox.stop();
  } catch (error) {
    // An expired or already-stopped one-shot VM needs no further cleanup.
    if (error?.status !== 404 && error?.response?.status !== 404) throw error;
  }
}

export async function startRuntime({ id, room, livekitUrl, livekitKey, livekitSecret }) {
  if (!process.env.VERCEL || process.env.BULLETIN_RUNTIME === 'external') {
    return { runtimeId: null, agentName: process.env.BULLETIN_AGENT_NAME || 'bulletin-newsroom' };
  }
  const files = JSON.parse(await readFile(new URL('./worker-files.json', import.meta.url), 'utf8'));
  const runtimeId = sandboxPrefix + id;
  const agentName = 'bulletin-' + id;
  const origin = process.env.STUDIO_ORIGIN || ('https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL);
  const sandbox = await Sandbox.create({
    name: runtimeId, runtime: 'node24', persistent: false, resources: { vcpus: 2 },
    timeout: startupLimitMs + sessionLimitMs + 30_000,
  });
  try {
    await sandbox.writeFiles(Object.entries(files).map(([path, data]) =>
      ({ path, content: Buffer.from(data, 'utf8') })
    ));
    // Install dependencies before injecting any LiveKit credentials.
    const install = await sandbox.runCommand({ cmd: 'npm', args: ['ci', '--omit=dev', '--no-fund', '--no-audit'], timeoutMs: 80_000 });
    if (install.exitCode !== 0) throw new Error('worker_install_failed');
    await sandbox.runCommand({
      cmd: 'node', args: ['agent.mjs', 'start'], detached: true,
      env: {
        NODE_ENV: 'production', LIVEKIT_URL: livekitUrl, LIVEKIT_API_KEY: livekitKey,
        LIVEKIT_API_SECRET: livekitSecret, BULLETIN_WORKER_SECRET: process.env.BULLETIN_WORKER_SECRET,
        BULLETIN_AGENT_NAME: agentName, BULLETIN_BROADCAST_ID: id,
        BULLETIN_COMPLETION_URL: new URL('/api/studio?action=workerComplete&channel=' + channel(), origin).href,
        BULLETIN_NEXT_URL: new URL('/api/studio?action=workerNext&channel=' + channel(), origin).href,
        BULLETIN_COMPLETION_TOKEN: completionToken(id, room),
      },
    });
    const ready = await sandbox.runCommand({
      cmd: 'node', args: ['--input-type=module', '-e',
        "for (let i=0;i<40;i++) { try { if ((await fetch('http://127.0.0.1:8081/')).ok) process.exit(0); } catch {} await new Promise(r=>setTimeout(r,750)); } process.exit(1);"],
      timeoutMs: 32_000,
    });
    if (ready.exitCode !== 0) throw new Error('worker_register_failed');
    return { runtimeId, agentName };
  } catch (error) {
    await sandbox.stop().catch(() => {});
    throw error;
  }
}
