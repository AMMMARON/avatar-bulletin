import { AudioFrame } from '@livekit/rtc-node';

const sampleRate = 16000;
export const maxSeconds = 300;

export async function renderVoice(job, segment, signal, request = fetch) {
  const voice = encodeURIComponent(job.voiceId);
  const response = await request(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_16000`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'xi-api-key': job.elevenlabsApiKey, 'content-type': 'application/json' },
    body: JSON.stringify({ text: segment.text, model_id: 'eleven_multilingual_v2' }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('voice_failed');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('voice_failed');
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > maxSeconds * sampleRate * 2) {
        await reader.cancel();
        throw new Error('session_limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!bytes || bytes % 2 !== 0) throw new Error('voice_failed');
  return Buffer.concat(chunks, bytes);
}

export function frameStream(pcm) {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset === pcm.length) {
        controller.close();
        return;
      }
      // The avatar transport sends the entire backing ArrayBuffer of every frame.
      // A new 20 ms buffer per frame avoids transmitting the whole clip repeatedly.
      const count = Math.min(320, (pcm.length - offset) / 2);
      const samples = new Int16Array(count);
      for (let i = 0; i < count; i++) samples[i] = pcm.readInt16LE(offset + i * 2);
      offset += count * 2;
      controller.enqueue(new AudioFrame(samples, sampleRate, 1, count));
    },
  });
}

export function secondsOf(pcm) {
  return pcm.length / (2 * sampleRate);
}
