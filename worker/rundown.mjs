import { setTimeout as delay } from 'node:timers/promises';

async function lease(url, token, id, room, sequence, prefetch, signal, request) {
  if (new URL(url).protocol !== 'https:' || !token || !id) throw new Error('Invalid producer connection');
  for (let attempt = 0; attempt < 2; attempt++) {
    signal.throwIfAborted();
    let response;
    try {
      response = await request(url, {
        method: 'POST', redirect: 'error',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id, room, sequence, prefetch }),
        signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]),
      });
    } catch (error) {
      if (attempt === 1 || signal.aborted) throw error;
    }
    if (response?.ok) return response.json();
    if (response) {
      await response.body?.cancel();
      if (response.status < 500 && response.status !== 429) break;
    }
    if (attempt === 0) await delay(350, undefined, { signal });
  }
  throw new Error('Producer unavailable');
}

export function createRundown(job, env = process.env, request = fetch) {
  let characters = 0;
  const seen = new Set();
  return async (sequence, prefetch, signal) => {
    const url = env.BULLETIN_NEXT_URL;
    const result = url
      ? await lease(url, env.BULLETIN_COMPLETION_TOKEN, env.BULLETIN_BROADCAST_ID, job.room, sequence, prefetch, signal, request)
      : { segment: job.segments[sequence] ?? null };
    const segment = result?.segment;
    if (segment === null) {
      // An empty speculative lease leaves space for an insert before this clip finishes.
      return prefetch && url ? { pending: true } : { done: true };
    }
    if (!segment || typeof segment.id !== 'string' || !segment.id.trim() || segment.id.length > 100 ||
        typeof segment.text !== 'string' || !segment.text.trim() || !Number.isSafeInteger(segment.revision) ||
        segment.revision < 1 || seen.has(segment.id) || seen.size >= 12 ||
        characters + segment.text.length > 3000) throw new Error('Invalid approved rundown');
    seen.add(segment.id);
    characters += segment.text.length;
    return { segment };
  };
}
