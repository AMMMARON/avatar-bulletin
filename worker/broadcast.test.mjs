import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { openJob, sealJob } from './job-envelope.mjs';
import { frameStream, renderVoice, secondsOf } from './audio.mjs';
import { createRundown } from './rundown.mjs';
import { initializeLogger, voice } from '@livekit/agents';

const secret = randomBytes(32).toString('base64url');
const key = 'synthetic-test-runway-key';
const job = {
  room: 'test-room', segments: [{ id: 'one', revision: 2, text: 'النشرة' }],
  runwayApiKey: key, elevenlabsApiKey: 'synthetic-eleven-key', voiceId: 'test-voice', avatarId: 'test-avatar',
};

test('an authenticated dispatch is private, tied to a room, time-limited, and tamper-evident', () => {
  const envelope = sealJob(job, secret, 1000);
  assert.equal(envelope.includes(key), false);
  assert.deepEqual(openJob(envelope, job.room, secret, 1100), job);
  assert.throws(() => openJob(envelope, 'other', secret, 1100));
  assert.throws(() => openJob(envelope, job.room, secret, 100000));
  assert.throws(() => openJob(envelope, job.room, randomBytes(32).toString('base64url'), 1100));
  const parts = envelope.split('.');
  parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
  assert.throws(() => openJob(parts.join('.'), job.room, secret, 1100));
});

test('reject ambiguous characters and invalid rundown snapshots before dispatch', () => {
  assert.throws(() => sealJob({ ...job, presetId: 'another' }, secret));
  assert.throws(() => sealJob({ ...job, segments: [] }, secret));
  assert.throws(() => sealJob({ ...job, segments: [job.segments[0], job.segments[0]] }, secret));
  assert.throws(() => sealJob({ ...job, segments: [{ ...job.segments[0], text: 'a'.repeat(3001) }] }, secret));
});

test('selected ElevenLabs voice produces exact mono 16 kHz frames, including a partial last frame', async () => {
  const signal = new AbortController().signal;
  const raw = Buffer.alloc(702);
  for (let sample = 0; sample < raw.length / 2; sample++) raw.writeInt16LE(sample - 128, sample * 2);
  const pcm = await renderVoice(job, job.segments[0], signal, async (url, options) => {
    assert.equal(new URL(url).origin, 'https://api.elevenlabs.io');
    assert.equal(new URL(url).pathname, '/v1/text-to-speech/test-voice');
    assert.equal(new URL(url).searchParams.get('output_format'), 'pcm_16000');
    assert.equal(options.headers['xi-api-key'], job.elevenlabsApiKey);
    assert.deepEqual(JSON.parse(options.body), { text: job.segments[0].text, model_id: 'eleven_multilingual_v2' });
    return new Response(raw);
  });
  assert.equal(secondsOf(pcm), 351 / 16000);
  const frames = [];
  for await (const frame of frameStream(pcm)) {
    assert.equal(frame.channels, 1);
    assert.equal(frame.sampleRate, 16000);
    assert.equal(frame.data.buffer.byteLength, frame.samplesPerChannel * 2);
    frames.push(frame);
  }
  assert.deepEqual(frames.map((frame) => frame.samplesPerChannel), [320, 31]);
  assert.deepEqual(Buffer.concat(frames.map((frame) => Buffer.from(frame.data.buffer))), raw);
});

test('an unsuccessful synthesis is never retried or used as audio', async () => {
  let calls = 0;
  const request = () => {
    calls++;
    return Promise.resolve(new Response('private provider response', { status: 402 }));
  };
  await assert.rejects(renderVoice(job, job.segments[0], new AbortController().signal, request), /voice_failed/);
  assert.equal(calls, 1);
});

test('an empty lookahead picks up a breaking insert at the next boundary', async () => {
  const segment = { id: 'breaking', revision: 3, text: 'خبر عاجل' };
  const calls = [];
  const reader = createRundown(job, {
    BULLETIN_NEXT_URL: 'https://stub.example/api/next', BULLETIN_COMPLETION_TOKEN: 'test-capability', BULLETIN_BROADCAST_ID: 'test-id',
  }, async (_, options) => {
    const input = JSON.parse(options.body);
    calls.push([input.sequence, input.prefetch]);
    assert.equal(options.headers.authorization, 'Bearer test-capability');
    return Response.json({ segment: input.prefetch ? null : segment });
  });
  const signal = new AbortController().signal;
  assert.deepEqual(await reader(1, true, signal), { pending: true });
  assert.deepEqual(await reader(1, false, signal), { segment });
  assert.deepEqual(calls, [[1, true], [1, false]]);
  await assert.rejects(reader(2, false, signal));
});

test('an unavailable producer can never silently fall back to outdated script text', async () => {
  const reader = createRundown(job, {
    BULLETIN_NEXT_URL: 'https://stub.example/api/next', BULLETIN_COMPLETION_TOKEN: 'test-capability', BULLETIN_BROADCAST_ID: 'test-id',
  }, async () => new Response('', { status: 401 }));
  await assert.rejects(reader(0, false, new AbortController().signal));
});

test('LiveKit plays supplied audio and acknowledges completion with no TTS or LLM connected', async () => {
  initializeLogger({ pretty: false, level: 'silent' });
  class TestOutput extends voice.AudioOutput {
    samples = 0;
    async captureFrame(frame) {
      await super.captureFrame(frame);
      this.samples += frame.samplesPerChannel;
    }
    flush() {
      super.flush();
      if (this.samples) this.onPlaybackFinished({ playbackPosition: this.samples / 16000, interrupted: false });
    }
    clearBuffer() {}
  }
  const session = new voice.AgentSession({ turnDetection: 'manual' });
  const output = new TestOutput(16000);
  session.output.audio = output;
  await session.start({ agent: new voice.Agent({ instructions: 'Present the approved bulletin.' }), record: false });
  try {
    const speech = session.say('النشرة', { audio: frameStream(Buffer.alloc(16000)), allowInterruptions: false, addToChatCtx: false });
    await speech.waitForPlayout();
    assert.equal(speech.interrupted, false);
    assert.ok(!speech.exception());
    assert.equal(output.samples, 8000);
  } finally {
    await session.close();
  }
});
