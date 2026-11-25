import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorialDraft } from '../server/editorial.js';

const story = {
  source: 'نشرة تجريبية', title: 'برنامج للتدريب',
  notes: 'أعلنت الجهة إطلاق برنامج للتدريب. ويتسع البرنامج لـ ٢٠ متدرباً في مرحلته الأولى.',
};

test('local Arabic proposal uses actual source passages and cannot call a provider', async () => {
  const draft = await createEditorialDraft(story, { fetch() { throw new Error('unexpected request'); } });
  assert.equal(draft.mode, 'extractive');
  assert.equal(draft.source, story.source);
  assert.ok(draft.script.startsWith('بحسب نشرة تجريبية، '));
  assert.ok(draft.evidence.length >= 1);
  for (const quote of draft.evidence) assert.ok(story.notes.includes(quote) && draft.script.includes(quote));
  assert.deepEqual(Object.keys(draft).sort(), ['evidence', 'mode', 'script', 'source']);
});

test('a headline alone cannot become a source-supported bulletin', async () => {
  await assert.rejects(createEditorialDraft({ ...story, notes: story.title }), { status: 400 });
});

test('AI drafting requires explicit opt-in and rejects hidden assumptions about numbers or evidence', async () => {
  const input = { ...story, mode: 'ai' };
  let calls = 0;
  const responseWith = (sentence, quote) => ({
    token: 'synthetic-token', fetch: async (url, options) => {
      calls++;
      assert.equal(url, 'https://ai-gateway.vercel.sh/v1/chat/completions');
      assert.equal(JSON.parse(options.body).messages[1].content, JSON.stringify(story));
      return Response.json({ choices: [{ message: { content: JSON.stringify({ lines: [{ sentence, quote }] }) } }] });
    },
  });
  const quote = 'ويتسع البرنامج لـ ٢٠ متدرباً في مرحلته الأولى.';
  const gateway = responseWith('تستوعب المرحلة الأولى 20 متدرباً.', quote);
  await assert.rejects(createEditorialDraft(input, gateway), { status: 400 });
  assert.equal(calls, 0);
  const accepted = await createEditorialDraft({ ...input, confirmCost: true }, gateway);
  assert.equal(accepted.mode, 'ai');
  assert.deepEqual(accepted.evidence, [quote]);
  assert.equal(calls, 1);
  await assert.rejects(createEditorialDraft({ ...input, confirmCost: true }, responseWith('يشارك ٢١ متدرباً.', quote)), { status: 422 });
  await assert.rejects(createEditorialDraft({ ...input, confirmCost: true }, responseWith('أُعلن الخبر.', 'مقطع غير وارد في ملاحظات الخبر')), { status: 422 });
});

test('provider errors surface once and never trigger another inference request', async () => {
  let calls = 0;
  const gateway = { token: 'synthetic', fetch: async () => { calls++; return new Response('', { status: 402 }); } };
  await assert.rejects(createEditorialDraft({ ...story, mode: 'ai', confirmCost: true }, gateway), { status: 502 });
  assert.equal(calls, 1);
});
