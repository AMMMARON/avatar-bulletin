import { randomUUID } from 'node:crypto';
import { AccessToken, AgentDispatchClient } from 'livekit-server-sdk';
import { sealJob } from '../worker/job-envelope.mjs';
import { startRuntime, stopRuntime, verifyCompletionToken } from './runtime.js';
import { channel } from './store.js';
import { changeState, readState, requireValue, StudioError } from './store.js';
import { isActive, rundown } from './newsroom.js';
import { publicProviders, roomClient } from './providers.js';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const avatarIdentity = 'bulletin-avatar';
const startDeadline = 130_000;
const wallClockLimit = 10 * 60_000;
const notFound = error => error?.code === 'not_found' || error?.status === 404;

export function workerReady() {
  const secret = process.env.BULLETIN_WORKER_SECRET || '';
  return /^[A-Za-z0-9_-]{43}$/.test(secret) && Buffer.from(secret, 'base64url').toString('base64url') === secret;
}

function matching(state, id) {
  return state.broadcast.id === id && isActive(state.broadcast.phase);
}

async function releaseRoom(config, name) {
  try { await roomClient(config).deleteRoom(name); }
  catch (error) { if (!notFound(error)) throw error; }
}

async function retire(id, phase, { grace = 0 } = {}) {
  const pending = await changeState(state => {
    if (!matching(state, id)) return false;
    if (state.broadcast.phase === 'stopping') return false;
    state.broadcast.phase = 'stopping';
    state.broadcast.outcome = phase;
  });
  if (!matching(pending, id)) return pending;
  const { broadcast, providers } = pending;
  const outcomes = await Promise.allSettled([
    broadcast.roomRequested ? releaseRoom(providers.livekit, broadcast.room) : Promise.resolve(),
    (async () => {
      if (!broadcast.runtimeId) return;
      if (grace) await sleep(grace);
      await stopRuntime(broadcast.runtimeId);
    })(),
  ]);
  if (outcomes.some(result => result.status === 'rejected')) {
    throw new StudioError(502, 'طلبنا إيقاف البث وتعذّر تأكيد تحرير موارده. أعد الضغط على إيقاف.');
  }
  return changeState(state => {
    if (!matching(state, id)) return false;
    state.broadcast = { id, room: broadcast.room, phase: state.broadcast.outcome || phase, startedAt: broadcast.startedAt, endedAt: Date.now() };
  });
}

export async function startBroadcast(confirmation) {
  requireValue(confirmation === true, 'يلزم تأكيد بدء جلسة البث وتكاليف المزوّدين.');
  requireValue(workerReady(), 'أكمل إعداد عامل البث في الخادم.', 503);
  const id = randomUUID();
  const room = 'bulletin-' + id;
  const reserved = await changeState(state => {
    requireValue(!isActive(state.broadcast.phase), 'هناك جلسة بث قيد التشغيل أو الإيقاف.', 409);
    requireValue(Object.values(publicProviders(state.providers)).every(value => value.configured), 'أكمل إعدادات المزوّدين واختر الشخصية والصوت.');
    const segments = rundown(state.studio);
    const dynamic = Boolean(process.env.VERCEL && process.env.BULLETIN_RUNTIME !== 'external');
    state.broadcast = {
      id, room, phase: 'starting', startedAt: Date.now(), dynamic, leases:[],
      segments: segments.map(({id,revision}) => ({id,revision})),
    };
  });
  const {livekit, runway, elevenlabs} = reserved.providers;
  let runtime;
  let roomRequested = false;
  try {
    if (channel() !== 'main') await roomClient(livekit).listRooms();
    runtime = await startRuntime({id, room, livekitUrl:livekit.url, livekitKey:livekit.apiKey, livekitSecret:livekit.apiSecret});
    await changeState(state => {
      requireValue(matching(state, id) && state.broadcast.phase === 'starting', 'أوقف المشغّل تجهيز البث.', 409);
      Object.assign(state.broadcast, {runtimeId:runtime.runtimeId, roomRequested:true});
    });
    roomRequested = true;
    await roomClient(livekit).createRoom({ name: room, emptyTimeout: 120, departureTimeout: 12, metadata: JSON.stringify({broadcastId:id}) });
    await changeState(state => {
      requireValue(matching(state, id) && state.broadcast.phase === 'starting', 'أوقف المشغّل تجهيز البث.', 409);
      state.broadcast.roomReady = true;
    });
    const metadata = sealJob({
      room, segments:rundown(reserved.studio), runwayApiKey:runway.apiKey, elevenlabsApiKey:elevenlabs.apiKey,
      voiceId:elevenlabs.voiceId, ...(runway.avatarId ? {avatarId:runway.avatarId} : {presetId:runway.presetId}),
    }, process.env.BULLETIN_WORKER_SECRET);
    const dispatcher = new AgentDispatchClient(livekit.url.replace('wss:', 'https:'), livekit.apiKey, livekit.apiSecret, {requestTimeout: 9, failover:false});
    await dispatcher.createDispatch(room, runtime.agentName, {metadata});
    return await changeState(state => {
      requireValue(matching(state, id) && state.broadcast.phase !== 'stopping', 'توقّف تجهيز البث.', 409);
      state.broadcast.dispatchedAt = Date.now();
    });
  } catch (error) {
    // An operator may have stopped this session while the remote resource was being created.
    // Clean the exact resources for our UUID even if a different session now owns the state.
    const cleaned = await Promise.allSettled([
      roomRequested ? releaseRoom(livekit, room) : Promise.resolve(),
      runtime?.runtimeId ? stopRuntime(runtime.runtimeId) : Promise.resolve(),
    ]);
    const incomplete = cleaned.some(result => result.status === 'rejected');
    await changeState(state => {
      if (!matching(state, id)) return false;
      Object.assign(state.broadcast, {phase:incomplete ? 'stopping' : 'failed', outcome:'failed', runtimeId:runtime?.runtimeId, roomRequested});
    });
    if (error instanceof StudioError) throw error;
    throw new StudioError(502, 'تعذّر تجهيز العامل أو إرساله إلى غرفة LiveKit. تحقّق من المفاتيح وصلاحيات المشروع.');
  }
}

export async function stopBroadcast() {
  const {state} = await readState();
  if (!isActive(state.broadcast.phase)) return state;
  return retire(state.broadcast.id, 'ended', {grace: state.broadcast.dispatchedAt ? 5_000 : 0});
}

export async function finishWorker(body, token) {
  requireValue(typeof body.id === 'string' && typeof body.room === 'string' && ['ended','failed'].includes(body.status)
    && verifyCompletionToken(body.id, body.room, token), 'طلب إنهاء غير صالح.', 403);
  const {state} = await readState();
  if (state.broadcast.id === body.id && state.broadcast.room === body.room && isActive(state.broadcast.phase)) {
    await retire(body.id, body.status);
  }
}

export async function nextSegment(body, token) {
  const { id, room, sequence } = body;
  requireValue(Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= 12, 'رقم الفقرة غير صالح.');
  requireValue(verifyCompletionToken(id, room, token), 'طلب عامل البث غير صالح.', 403);
  const state = await changeState(state => {
    const session = state.broadcast;
    if (session.id !== id || session.room !== room || !['starting','live'].includes(session.phase)) return false;
    requireValue(session.dynamic, 'البث يعمل بنسخة ثابتة.', 409);
    const leases = session.leases;
    requireValue(sequence <= leases.length, 'ترتيب طلب الفقرة غير صحيح.', 409);
    if (sequence < leases.length || session.leaseClosed) return false;
    const delivered = new Set(leases.map(clip => clip.id));
    const remaining = 3000 - leases.reduce((n, clip) => n + clip.text.length, 0);
    const available = new Map(state.studio.stories.map(story => [story.id, story]));
    const story = state.studio.order.map(key => available.get(key)).find(story =>
      story?.status === 'approved' && !delivered.has(story.id) && story.script.length > 0 && story.script.length <= remaining);
    if (leases.length >= 12 || remaining <= 0) session.leaseClosed = true;
    else if (story) leases.push({ id:story.id, revision:story.revision, text:story.script });
    else if (body.prefetch === true) return false;
    else session.leaseClosed = true;
  });
  const session = state.broadcast;
  const active = session.id === id && session.room === room && ['starting','live'].includes(session.phase);
  const segment = active ? session.leases[sequence] || null : null;
  return { segment, pending: !!(active && !segment && !session.leaseClosed && body.prefetch === true) };
}

// Coalesce probes within a function instance. An idle newsroom never contacts LiveKit.
let pendingProbe;
export async function observe(state) {
  const session = state.broadcast;
  if (!['starting','live'].includes(session.phase)) return state;
  if (Date.now() - session.startedAt > wallClockLimit) return retire(session.id, 'failed');
  if (!session.dispatchedAt) return state;
  if (pendingProbe?.id === session.id && Date.now() - pendingProbe.at < 4000) {
    const observed = await pendingProbe.promise;
    return { ...state, broadcast: observed.id === session.id ? observed : state.broadcast };
  }
  const promise = probe(state);
  pendingProbe = {id: session.id, at: Date.now(), promise};
  return { ...state, broadcast: await promise };
}

async function probe({broadcast, providers}) {
  const rooms = roomClient(providers.livekit);
  const age = Date.now() - broadcast.dispatchedAt;
  let metadata, participants;
  try {
    const [result] = await rooms.listRooms([broadcast.room]);
    if (result) {
      try { metadata = JSON.parse(result.metadata || '{}').bulletinPlayback; } catch {}
      if (metadata?.state === 'ended' || metadata?.state === 'failed') {
        return (await retire(broadcast.id, metadata.state)).broadcast;
      }
      participants = await rooms.listParticipants(broadcast.room);
    } else participants = [];
  } catch (error) {
    if (error instanceof StudioError) throw error;
    throw new StudioError(502, 'تعذّر التحقق من حالة غرفة البث الآن.');
  }
  const avatar = participants.find(participant => participant.identity === avatarIdentity);
  const hasTracks = avatar?.tracks.some(track => track.type === 1) && avatar.tracks.some(track => track.type === 0);
  if (hasTracks && metadata?.state === 'playing') {
    const issued = broadcast.dynamic ? broadcast.leases : broadcast.segments;
    const id = issued.find(item => item.id === metadata.segmentId && item.revision === metadata.revision)?.id;
    if (broadcast.phase === 'live' && broadcast.segmentId === id) return broadcast;
    return (await changeState(state => {
      if (!matching(state, broadcast.id) || state.broadcast.phase === 'stopping') return false;
      Object.assign(state.broadcast, {phase:'live', signalLostAt:null, segmentId:id, revision:metadata.revision});
    })).broadcast;
  }
  if (broadcast.phase === 'live' && !hasTracks) {
    return (await changeState(state => {
      if (state.broadcast.id !== broadcast.id || state.broadcast.phase !== 'live') return false;
      Object.assign(state.broadcast, {phase:'starting', signalLostAt:Date.now(), segmentId:null});
    })).broadcast;
  }
  const timedOut = broadcast.signalLostAt ? Date.now() - broadcast.signalLostAt > 25_000 : age > startDeadline;
  if (broadcast.phase === 'starting' && timedOut) return (await retire(broadcast.id, 'failed')).broadcast;
  return broadcast;
}

export async function viewerToken(state) {
  requireValue(canJoin(state.broadcast), 'لا توجد نشرة جاهزة للمشاهدة الآن.', 409);
  const {livekit} = state.providers;
  const access = new AccessToken(livekit.apiKey, livekit.apiSecret, {identity:'viewer-' + randomUUID(), ttl:'60s'});
  access.addGrant({roomJoin:true, room:state.broadcast.room, canSubscribe:true, canPublish:false, canPublishData:false, canUpdateOwnMetadata:false});
  return {url:livekit.url, token:await access.toJwt(), avatarIdentity};
}

export function canJoin(session) {
  return session.phase === 'live' || (session.phase === 'starting' && session.roomReady === true);
}
