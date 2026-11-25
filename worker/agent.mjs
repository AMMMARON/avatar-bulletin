import { cli, defineAgent, ServerOptions, voice } from '@livekit/agents';
import { AvatarSession } from '@livekit/agents-plugin-runway';
import { RoomEvent } from '@livekit/rtc-node';
import { RoomServiceClient } from 'livekit-server-sdk';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openJob } from './job-envelope.mjs';
import { frameStream, maxSeconds, renderVoice, secondsOf } from './audio.mjs';
import { createRundown } from './rundown.mjs';

function cancellable(promise, signal) {
  signal.throwIfAborted();
  let rejectOnStop;
  const stopped = new Promise((_, reject) => {
    rejectOnStop = () => reject(signal.reason);
    signal.addEventListener('abort', rejectOnStop, { once: true });
  });
  return Promise.race([promise, stopped]).finally(() => signal.removeEventListener('abort', rejectOnStop));
}

async function reportCompletion(room, status) {
  const { BULLETIN_COMPLETION_URL: url, BULLETIN_COMPLETION_TOKEN: token, BULLETIN_BROADCAST_ID: id } = process.env;
  if (!url || !token || !id || new URL(url).protocol !== 'https:') return;
  // The callback also retires an on-demand sandbox. Retry transient failures while it is alive.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await fetch(url, {
        method: 'POST', redirect: 'error',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ id, room, status }), signal: AbortSignal.timeout(5000),
      });
      await result.body?.cancel();
      if (result.ok || result.status < 500) return;
    } catch {
      // The sandbox lifetime also bounds cleanup when its owner is unreachable.
    }
  }
}

export default defineAgent({
  entry: async (ctx) => {
    const roomName = ctx.job.room?.name;
    const job = openJob(ctx.job.metadata, roomName, process.env.BULLETIN_WORKER_SECRET);
    await ctx.connect();

    const roomMeta = JSON.parse(ctx.room.metadata || '{}');
    // Never replay a charged job after the media process is restarted.
    if (roomMeta.bulletinPlayback?.jobId) {
      ctx.shutdown('rundown already claimed');
      return;
    }
    const rooms = new RoomServiceClient(process.env.LIVEKIT_URL, process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET, { requestTimeout: 4, failover: false });
    const controller = new AbortController();
    const { signal } = controller;
    const stop = () => controller.abort(new Error('broadcast_stopped'));
    ctx.room.once(RoomEvent.Disconnected, stop);
    const session = new voice.AgentSession({ turnDetection: 'manual' });
    const avatar = new AvatarSession({
      apiKey: job.runwayApiKey, avatarId: job.avatarId, presetId: job.presetId,
      avatarParticipantIdentity: 'bulletin-avatar', avatarParticipantName: 'المراسل',
      maxDuration: maxSeconds, connOptions: { maxRetry: 0, retryIntervalMs: 0, timeoutMs: 20_000 },
    });
    let finished = 'failed';
    let errorCode = 'playback_failed';
    let segmentIndex = 0;
    let currentSegment;
    let deadline;
    let cleanup;
    let startAvatar;
    let avatarAttempted = false;
    let sessionStarted = false;
    const closeMedia = () => {
      cleanup ??= (async () => {
        stop();
        // A STOP can arrive before Runway returns its newly-created session id.
        if (startAvatar) await startAvatar.catch(() => {});
        await Promise.allSettled([
          sessionStarted ? session.close() : undefined,
          avatarAttempted ? avatar.aclose() : undefined,
        ]);
      })();
      return cleanup;
    };
    ctx.addShutdownCallback(closeMedia);

    async function setState(state, error) {
      const playback = {
        jobId: ctx.job.id, state, segmentId: currentSegment?.id ?? '', revision: currentSegment?.revision ?? 0,
        index: segmentIndex, updatedAt: new Date().toISOString(), ...(error && { error }),
      };
      // Persist progress even after both participants leave. The server exclusively owns all
      // other metadata on this room and writes it before dispatch.
      await rooms.updateRoomMetadata(roomName, JSON.stringify({ ...roomMeta, bulletinPlayback: playback }));
      await ctx.room.localParticipant?.setAttributes({
        'bulletin.state': state, 'bulletin.segmentId': playback.segmentId,
        'bulletin.revision': String(playback.revision), 'bulletin.index': String(segmentIndex),
      }).catch(() => {});
    }

    const nextSegment = createRundown(job);
    async function prepare(index, prefetch = false) {
      let lease;
      try {
        lease = await nextSegment(index, prefetch, signal);
      } catch {
        return { error: 'rundown_failed' };
      }
      if (!lease.segment) return lease;
      try {
        signal.throwIfAborted();
        return { segment: lease.segment, pcm: await renderVoice(job, lease.segment, signal) };
      } catch (cause) {
        return { error: cause?.message === 'session_limit' ? 'session_limit' : 'voice_failed' };
      }
    }

    try {
      await setState('preparing');
      signal.throwIfAborted();
      let audio = await prepare(0);
      if (audio.done) {
        finished = 'ended';
        return;
      }
      if (!audio.pcm) throw new Error(audio.error);
      currentSegment = audio.segment;

      errorCode = 'avatar_failed';
      const expiresAt = Date.now() + maxSeconds * 1000;
      deadline = setTimeout(() => controller.abort(new Error('session_limit')), maxSeconds * 1000);
      signal.throwIfAborted();
      avatarAttempted = true;
      startAvatar = avatar.start(session, ctx.room);
      await startAvatar;
      signal.throwIfAborted();
      sessionStarted = true;
      await session.start({
        agent: new voice.Agent({ instructions: 'Present the approved Arabic bulletin.' }),
        room: ctx.room, record: false,
        inputOptions: { audioEnabled: false, videoEnabled: false, textEnabled: false, closeOnDisconnect: false },
        outputOptions: { audioEnabled: false, transcriptionEnabled: false, syncTranscription: false },
      });
      await cancellable(avatar.waitForJoin({ timeout: 40_000 }), signal);
      errorCode = 'playback_failed';
      for (let index = 0; !audio.done; index++) {
        segmentIndex = index;
        if (!audio.pcm) throw new Error(audio.error);
        currentSegment = audio.segment;
        if (Date.now() + secondsOf(audio.pcm) * 1000 > expiresAt) throw new Error('session_limit');
        signal.throwIfAborted();
        const speech = session.say(currentSegment.text, {
          audio: frameStream(audio.pcm), allowInterruptions: false, addToChatCtx: false,
        });
        const next = prepare(index + 1, true);
        await setState('playing');
        await cancellable(speech.waitForPlayout(), signal);
        if (speech.interrupted || speech.exception()) throw new Error('playback_failed');
        audio = await next;
        if (audio.pending) audio = await prepare(index + 1);
      }
      finished = 'ended';
    } catch (error) {
      if (['session_limit', 'voice_failed', 'broadcast_stopped', 'rundown_failed'].includes(error?.message)) errorCode = error.message;
    } finally {
      clearTimeout(deadline);
      await closeMedia();
      // Stop and success reach the callback only after provider release was attempted.
      if (ctx.room.isConnected) await setState(finished, finished === 'failed' ? errorCode : undefined).catch(() => {});
      await reportCompletion(roomName, finished).catch(() => {});
      ctx.room.off(RoomEvent.Disconnected, stop);
      ctx.shutdown(finished);
    }
  },
});

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  cli.runApp(new ServerOptions({
    agent: fileURLToPath(import.meta.url), agentName: process.env.BULLETIN_AGENT_NAME || 'bulletin-newsroom',
    numIdleProcesses: 1, host: '127.0.0.1', port: 8081,
  }));
}
