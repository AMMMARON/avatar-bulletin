import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/studio.js';
import { changeState } from './store.js';
import { openJob } from '../worker/job-envelope.mjs';

test('operator keys, revision conflicts, approvals and live segment leases', async t => {
  // Explicit disposable credentials. Never use configured provider accounts in this suite.
  const directory = await mkdtemp(join(tmpdir(), 'bulletin-test-'));
  const file = join(directory, 'state.sealed');
  const password = randomBytes(32).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const settings = {
    STUDIO_SECRET:password, ADMIN_PASSWORD:password, BULLETIN_WORKER_SECRET:secret,
    BULLETIN_LOCAL_STORE:file, VERCEL:'', NODE_ENV:'test', BLOB_READ_WRITE_TOKEN:'',
  };
  for (const [key, value] of Object.entries(settings)) setenv(t,key,value);
  t.after(async () => { await unlink(file).catch(() => {}); await rmdir(directory); });
  async function call(action, body, headers={}) {
    const res = {
      headers:{}, setHeader(k,v) { this.headers[k] = v; }, end(text) { this.data = JSON.parse(text); },
    };
    const req = {url:'/api/studio?action=' + action, method: body ? 'POST' : 'GET',
      headers:{host:'studio.test', ...(body ? {'content-type':'application/json'} : {}), ...headers}, body};
    await handler(req, res);
    return res;
  }
  const publicState = await call('status');
  assert.equal(publicState.statusCode, 200);
  assert.equal(publicState.data.broadcast.phase, 'idle');
  assert.equal(publicState.data.providers, undefined);
  assert.equal((await call('providers', {})).statusCode, 401);
  assert.equal((await call('login', {password}, {origin:'https://elsewhere.test'})).statusCode, 403);
  assert.equal((await call('login', {password:'invalid'})).statusCode, 401);
  const signed = await call('login', {password});
  assert.equal(signed.statusCode, 200);
  assert.match(signed.headers['Set-Cookie'], /HttpOnly/);
  const headers = {cookie:signed.headers['Set-Cookie'].split(';')[0]};
  const runwayKey = 'dummy-runway-' + secret;
  const keys = {runway:{apiKey:runwayKey, avatarId:'demo'}, elevenlabs:{apiKey:'fake-key',voiceId:'voice-v1'},
    livekit:{url:'wss://test.livekit.cloud',apiKey:'local',apiSecret:'unused'}};
  const saved = await call('providers', keys, headers);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.data.providers.runway.configured, true);
  assert.ok(!JSON.stringify(saved.data).includes(runwayKey));
  assert.ok(!(await readFile(file,'utf8')).includes(runwayKey));
  assert.equal((await call('providers', {livekit:{url:'https://example.test'}}, headers)).statusCode, 400);
  assert.equal((await call('providers', {runway:{presetId:'a'}}, headers)).statusCode, 400);
  assert.equal((await call('providers', {runway:{apiKey:'',presetId:'a',avatarId:''}}, headers)).data.providers.runway.hasKey, true);
  assert.equal((await call('viewer')).statusCode, 409);
  assert.equal((await call('start', {confirm:false}, headers)).statusCode, 400);

  let version = 0;
  const stories = ['a','b','c'].map(id => ({id,title:'خبر ' + id,source:'المصدر',script:'النص '+id,status:'candidate'}));
  const update = (order=[]) => call('studio', {version,stories,order}, headers);
  const concurrent = await Promise.all([update(),update()]);
  assert.deepEqual(concurrent.map(r => r.statusCode).sort(), [200,409]);
  version++;
  stories[0].status = 'approved';
  assert.equal((await update()).statusCode, 400);
  for (const s of stories) s.status = 'selected';
  assert.equal((await update()).statusCode, 200);
  version++;
  for (const s of stories) s.status = 'approved';
  assert.equal((await update(['a','b'])).statusCode, 200);
  version++;

  const id = 'test-broadcast', room = 'test-room';
  const bearer = createHmac('sha256', secret).update(JSON.stringify(['worker-complete-v1',id,room])).digest('base64url');
  const worker = {authorization:'Bearer ' + bearer};
  await changeState(state => { state.broadcast = {id,room,dynamic:true,phase:'starting',leases:[],startedAt:Date.now()}; });
  const lease = (sequence, prefetch=false) => call('workerNext', {id,room,sequence,prefetch}, worker);
  assert.equal((await call('workerNext',{id,room,sequence:0})).statusCode,403);
  assert.equal((await lease(1)).statusCode,409);
  const first = await Promise.all([lease(0),lease(0)]);
  assert.deepEqual(first[0].data.segment, first[1].data.segment);
  assert.equal(first[0].data.segment.id, 'a');
  stories[0].script = 'مراجعة';
  stories[0].status = 'selected';
  assert.equal((await update(['b'])).statusCode,409);
  stories[0].script = 'النص a';
  stories[0].status = 'approved';
  assert.equal((await update(['a','c'])).statusCode,200);
  version++;
  assert.equal((await lease(1)).data.segment.id,'c');
  assert.deepEqual((await lease(2,true)).data,{segment:null,pending:true});
  assert.equal((await update(['a','c','b'])).statusCode,200);
  assert.equal((await lease(2)).data.segment.id,'b');
  assert.deepEqual((await lease(3)).data,{segment:null,pending:false});
  assert.equal((await call('workerComplete',{id,room,status:'ended'},worker)).statusCode,200);
  assert.equal((await call('workerComplete',{id,room,status:'ended'},worker)).statusCode,200);
  assert.equal((await call('status')).data.broadcast.phase,'ended');

  // Keep the real SDK, token signer, envelope and dispatch flow. Replace only the network.
  let simulatedRoom, dispatchCount = 0, created = 0, deleted = 0;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'test.livekit.cloud');
    const method = new URL(url).pathname.split('/').pop();
    const req = JSON.parse(options.body);
    if (method === 'CreateRoom') {
      created++; simulatedRoom = {name:req.name,metadata:req.metadata};
      return Response.json(simulatedRoom);
    }
    if (method === 'CreateDispatch') {
      dispatchCount++;
      assert.ok(!req.metadata.includes(runwayKey));
      const job = openJob(req.metadata, simulatedRoom.name, secret);
      assert.deepEqual(job.segments.map(s => s.id), ['a','c','b']);
      assert.equal(job.segments[0].text, 'النص a');
      return Response.json({id:'dispatch-test',room:req.room,agentName:req.agentName});
    }
    if (method === 'ListRooms') return Response.json({rooms:[simulatedRoom]});
    if (method === 'ListParticipants') return Response.json({participants:[]});
    if (method === 'DeleteRoom') { deleted++; return Response.json({}); }
    throw new Error('Unexpected network operation');
  });
  const launches = await Promise.all([call('start',{confirm:true},headers),call('start',{confirm:true},headers)]);
  assert.deepEqual(launches.map(result => result.statusCode).sort(),[200,409]);
  assert.equal(created,1);
  assert.equal(dispatchCount,1);
  assert.equal((await call('status')).data.broadcast.phase,'starting');
  const audience = await call('viewer');
  assert.equal(audience.statusCode,200);
  const grants = JSON.parse(Buffer.from(audience.data.token.split('.')[1], 'base64url')).video;
  assert.equal(grants.room,simulatedRoom.name);
  assert.equal(grants.canPublish,false);
  assert.equal(grants.canPublishData,false);
  assert.ok(!grants.roomAdmin);
  const {broadcastId} = JSON.parse(simulatedRoom.metadata);
  const capability = createHmac('sha256',secret).update(JSON.stringify(['worker-complete-v1',broadcastId,simulatedRoom.name])).digest('base64url');
  const completion = await call('workerComplete',{id:broadcastId, room:simulatedRoom.name,status:'ended'},{authorization:'Bearer ' + capability});
  assert.equal(completion.statusCode,200);
  assert.equal(deleted,1);
  assert.equal((await call('viewer')).statusCode,409);
});

function setenv(t, key, value) {
  const old = process.env[key];
  process.env[key] = value;
  t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
}
