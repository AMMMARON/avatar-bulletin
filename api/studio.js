import { adminReady, login, logout, requireSameOrigin, signedIn } from '../server/auth.js';
import { channel, workspace } from '../server/store.js';
import { canJoin, finishWorker, nextSegment, observe, startBroadcast, stopBroadcast, viewerToken, workerReady } from '../server/broadcast.js';
import { proposeRundown } from '../server/director.js';
import { createEditorialDraft, editorialAiAvailable } from '../server/editorial.js';
import { research, saveStudio } from '../server/newsroom.js';
import { listCatalog, publicProviders, saveProviders } from '../server/providers.js';
import { changeState, initialState, readState, requireValue, storageReady, StudioError } from '../server/store.js';

const reads = new Set(['status', 'viewer']);
const writes = new Set(['login', 'logout', 'providers', 'catalog', 'research', 'studio', 'director', 'editorialDraft', 'start', 'stop', 'workerComplete', 'workerNext']);

function snapshot(state, authenticated) {
  const session = state.broadcast;
  const {phase, startedAt, endedAt, segmentId} = session;
  const locked = session.dynamic ? session.leases : session.segments;
  return {
    authenticated:!!authenticated, channel:authenticated ? channel() : undefined,
    setup: {admin:!!adminReady(), storage:storageReady(), worker:workerReady(), editorialAi:authenticated && channel() === 'main' && editorialAiAvailable()},
    broadcast: {
      phase, startedAt, joinable:canJoin(session), ...(endedAt ? {endedAt} : {}),
      ...(authenticated ? {lockedIds:(locked || []).map(item => item.id), dynamic:!!session.dynamic, segmentId:segmentId || null} : {}),
    },
    ...(authenticated ? {studio:state.studio, providers:publicProviders(state.providers)} : {}),
  };
}

async function load() {
  return storageReady() ? (await readState()).state : initialState();
}

async function parseBody(req) {
  const limit = 550_000;
  requireValue(Number(req.headers['content-length'] || 0) <= limit, 'بيانات الطلب كبيرة جداً.', 413);
  let body = req.body;
  if (body === undefined) {
    const chunks = [];
    let length = 0;
    for await (const chunk of req) {
      length += Buffer.byteLength(chunk);
      requireValue(length <= limit, 'بيانات الطلب كبيرة جداً.', 413);
      chunks.push(Buffer.from(chunk));
    }
    body = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { throw new StudioError(400, 'صيغة JSON غير صالحة.'); }
  }
  requireValue(body && typeof body === 'object' && !Array.isArray(body), 'بيانات طلب غير صالحة.');
  requireValue(Buffer.byteLength(JSON.stringify(body)) <= limit, 'بيانات الطلب كبيرة جداً.', 413);
  return body;
}

async function route(req, res) {
  const action = new URL(req.url, 'http://localhost').searchParams.get('action') || 'status';
  requireValue(reads.has(action) || writes.has(action), 'المسار غير موجود.', 404);
  requireValue(req.method === (reads.has(action) ? 'GET' : 'POST'), 'طريقة الطلب غير مدعومة.', 405);
  const authenticated = signedIn(req) === channel();
  if (action === 'status') return snapshot(await observe(await load()), authenticated);
  if (action === 'viewer') return viewerToken(await observe(await load()));

  requireSameOrigin(req);
  const body = await parseBody(req);
  if (action === 'workerComplete' || action === 'workerNext') {
    const token = /^Bearer ([A-Za-z0-9_.-]{16,256})$/.exec(req.headers.authorization || '')?.[1];
    requireValue(token, 'تنقص صلاحية إغلاق الجلسة.', 403);
    if (action === 'workerNext') return nextSegment(body, token);
    await finishWorker(body, token);
    return {ok:true};
  }
  if (action === 'login') {
    const id = login(req, res, body.password);
    return workspace.run(id, async () => snapshot(await load(), true));
  }
  if (action === 'logout') {
    logout(req, res);
    return snapshot(await load(), false);
  }
  requireValue(authenticated, 'سجّل دخول المشغّل أولاً.', 401);
  if (action === 'research') return research();
  if (action === 'director') return proposeRundown((await readState()).state.studio, body.targetSeconds ?? 90);
  if (action === 'editorialDraft') {
    requireValue(body.mode !== 'ai' || channel() === 'main', 'الصياغة عبر Vercel غير متاحة الآن. يمكنك استخدام الاقتباس المحلي.', 403);
    const {state} = await readState();
    const item = state.studio.stories.find(story => story.id === body.storyId);
    requireValue(item?.status === 'selected', 'اختر الخبر للتحرير قبل اقتراح مسودة.');
    return createEditorialDraft({
      source:item.source, title:item.title, notes:body.notes ?? item.notes, mode:body.mode, confirmCost:body.confirmCost,
    });
  }
  if (action === 'catalog') return listCatalog((await readState()).state.providers, body);
  let state;
  if (action === 'providers') state = await changeState(s => saveProviders(s, body));
  if (action === 'studio') state = await changeState(s => saveStudio(s, body));
  if (action === 'start') state = await startBroadcast(body.confirm);
  if (action === 'stop') state = await stopBroadcast();
  return snapshot(state, true);
}

// Vercel Node Function. The local development server calls the same handler.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Cookie');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const query = new URL(req.url, 'http://localhost').searchParams;
    const requested = query.get('channel');
    const action = query.get('action') || 'status';
    const scopedPublic = reads.has(action) || ['workerNext','workerComplete'].includes(action);
    requireValue(!requested || scopedPublic && /^(?:main|[a-f0-9]{32})$/.test(requested), 'بيانات طلب غير صالحة.');
    const id = requested || signedIn(req) || 'main';
    const result = await workspace.run(id, () => route(req, res));
    res.statusCode = 200;
    res.end(JSON.stringify(result));
  } catch (error) {
    res.statusCode = error instanceof StudioError ? error.status : 503;
    if (!(error instanceof StudioError)) console.error('studio_request_failed', error?.name || 'Error');
    res.end(JSON.stringify({error:error instanceof StudioError ? error.message : 'تعذّر الوصول إلى خدمة الاستوديو الآن. تحقّق من إعدادات الخادم وأعد المحاولة.'}));
  }
}
