import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/studio.js';

test('personal studios keep credentials and editorial state separate from audience links', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'bulletin-channels-'));
  t.after(() => rm(dir, {recursive:true, force:true}));
  process.env.BULLETIN_LOCAL_STORE = join(dir, 'state');
  process.env.ADMIN_PASSWORD = randomBytes(32).toString('hex');
  process.env.STUDIO_SECRET = randomBytes(32).toString('hex');
  delete process.env.BLOB_READ_WRITE_TOKEN;
  async function call(action, body, cookie) {
    const res = {headers:{}, setHeader(k,v){this.headers[k]=v},end(v){this.data=JSON.parse(v)}};
    await handler({url:'/api/studio?action='+action,method:body?'POST':'GET',body,
      headers:{host:'localhost','content-type':'application/json',cookie}},res);
    return res;
  }
  const code = () => 'studio_' + randomBytes(32).toString('hex');
  const firstCode = code();
  const a = await call('login',{password:firstCode});
  const b = await call('login',{password:code()});
  const ac = a.headers['Set-Cookie'].split(';')[0];
  const bc = b.headers['Set-Cookie'].split(';')[0];
  const id = a.data.channel;
  assert.notEqual(id,b.data.channel);
  assert.equal((await call('login',{password:firstCode})).data.channel,id);
  assert.equal((await call('providers',{runway:{apiKey:'dummy',avatarId:'test-avatar'}},ac)).statusCode,200);
  assert.equal((await call('status',undefined,bc)).data.providers.runway.hasKey,false);
  assert.equal((await call('status',undefined,ac)).data.providers.runway.avatarId,'test-avatar');
  assert.equal((await call('status&channel='+id,undefined,bc)).data.providers,undefined);
  assert.equal((await call('providers&channel='+id,{},bc)).statusCode,400);
});
