import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';
import { requireValue } from './store.js';

export const isActive = phase => ['starting', 'live', 'stopping'].includes(phase);

export function cleanText(value, max, label, required = false) {
  requireValue(value == null || typeof value === 'string', 'قيمة غير صحيحة في ' + label);
  const text = (value ?? '').trim();
  requireValue(text.length <= max && (!required || text.length > 0), 'تحقق من ' + label + ' وطوله.');
  return text;
}

function urlValue(value) {
  if (!value) return '';
  let url;
  try { url = new URL(value); } catch {}
  requireValue(url && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password, 'رابط المصدر غير صالح.');
  return url.href;
}

export function saveStudio(state, draft) {
  const { studio, broadcast } = state;
  requireValue(studio.version === draft.version, 'تغيّرت نسخة النشرة. حدّث الصفحة قبل الحفظ.', 409);
  requireValue(Array.isArray(draft.stories) && draft.stories.length <= 180 && Array.isArray(draft.order), 'بيانات قائمة الأخبار غير صحيحة.');
  const oldStories = new Map(studio.stories.map(story => [story.id, story]));
  const records = new Map();
  for (const raw of draft.stories) {
    requireValue(raw && typeof raw === 'object', 'بيانات الخبر غير صحيحة.');
    const id = cleanText(raw.id, 100, 'معرّف الخبر', true);
    requireValue(/^[A-Za-z0-9_-]+$/.test(id) && !records.has(id), 'معرّف الخبر غير صالح أو مكرّر.');
    const title = cleanText(raw.title, 240, 'عنوان الخبر', true);
    const script = cleanText(raw.script, 8000, 'نص الخبر');
    const source = cleanText(raw.source, 200, 'اسم المصدر');
    const sourceUrl = urlValue(cleanText(raw.sourceUrl, 1600, 'رابط المصدر'));
    const status = raw.status;
    requireValue(['candidate', 'selected', 'approved'].includes(status), 'حالة الخبر غير صالحة.');
    const old = oldStories.get(id);
    const notes = cleanText(raw.notes ?? old?.notes, 8000, 'ملاحظات المصدر');
    requireValue(old || status === 'candidate', 'أضف الخبر للبحث أولاً قبل اختياره.');
    const changed = old && (old.title !== title || old.script !== script || old.source !== source || old.sourceUrl !== sourceUrl || (old.notes || '') !== notes);
    if (status === 'approved') {
      requireValue(old?.status !== 'candidate' && script && source, 'اختر الخبر وأدخل نصه ومصدره قبل الاعتماد.');
      requireValue(!(changed && old.status === 'approved'), 'أعد الخبر للتحرير قبل اعتماد تعديلاته.');
    }
    const revision = old ? old.revision + (changed ? 1 : 0) : 1;
    const publishedAt = old?.publishedAt ?? raw.publishedAt;
    const validDate = Number.isSafeInteger(publishedAt) && publishedAt > 0 && publishedAt <= Date.now() + 24 * 60 * 60_000;
    records.set(id, { id, title, source, sourceUrl, script, status, revision, notes, ...(validDate ? {publishedAt} : {}) });
  }
  const order = draft.order;
  requireValue(new Set(order).size === order.length && order.every(id => records.get(id)?.status === 'approved'), 'يمكن ترتيب الفقرات المعتمدة فقط.');
  if (isActive(broadcast.phase)) {
    const locked = broadcast.dynamic ? broadcast.leases : broadcast.segments;
    for (const item of locked || []) {
      const next = records.get(item.id);
      requireValue(next?.status === 'approved' && next.revision === item.revision, 'هذه النسخة سُلّمت لعامل البث. أوقف البث قبل سحبها أو تعديلها.', 409);
      requireValue(order.includes(item.id), 'تسلّم عامل البث هذه الفقرة بالفعل. أبقها في القائمة حتى نهاية النشرة.', 409);
    }
  }
  state.studio = { stories: [...records.values()], order, updatedAt: Date.now(), version: studio.version + 1 };
}

export function rundown(studio) {
  const stories = new Map(studio.stories.map(story => [story.id, story]));
  const segments = studio.order.map(id => {
    const story = stories.get(id);
    requireValue(story?.status === 'approved' && story.script, 'النشرة تحتوي على فقرة غير جاهزة.');
    return { id, revision: story.revision, text: story.script };
  });
  requireValue(segments.length >= 1 && segments.length <= 12, 'أدرج فقرة معتمدة واحدة على الأقل وحتى ١٢ فقرة.');
  requireValue(segments.reduce((n, item) => n + item.text.length, 0) <= 3000, 'الحد الأقصى لمجموع نصوص النشرة ٣٠٠٠ حرف.');
  return segments;
}

const feeds = [
  ['أخبار الأمم المتحدة', 'https://news.un.org/feed/subscribe/ar/news/all/rss.xml'],
  ['الجزيرة', 'https://www.aljazeera.net/aljazeerarss/ahg.xml'],
];
const parser = new XMLParser({ processEntities: false, ignoreAttributes: true });
const plain = value => typeof value === 'string' ? value
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim() : '';

async function readFeed([source, url]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { accept: 'application/rss+xml, application/xml' } });
  if (!response.ok) throw new Error('feed');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2_000_000) { await reader.cancel(); throw new Error('feed size'); }
    chunks.push(value);
  }
  const xml = Buffer.concat(chunks).toString('utf8');
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('feed format');
  const items = parser.parse(xml)?.rss?.channel?.item;
  if (!Array.isArray(items)) throw new Error('feed format');
  return items.slice(0, 12).flatMap(item => {
    const title = plain(item.title).slice(0, 240);
    const sourceUrl = plain(item.link);
    if (!title || !URL.canParse(sourceUrl) || !sourceUrl.startsWith('https://')) return [];
    const publishedAt = Date.parse(item.pubDate);
    return [{
      id: 'rss-' + createHash('sha256').update(sourceUrl).digest('hex').slice(0, 20),
      title, source, sourceUrl, notes:plain(item.description).slice(0, 1200), script: '', revision: 1, status: 'candidate',
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : null,
    }];
  });
}

export async function research() {
  const results = await Promise.allSettled(feeds.map(readFeed));
  const candidates = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  requireValue(candidates.length, 'تعذّر جلب الأخبار من المصادر الآن. يمكنك إدخال الخبر ومصدره يدوياً.', 502);
  const unique = [...new Map(candidates.map(item => [item.sourceUrl, item])).values()];
  return { stories: unique.sort((a,b) => (b.publishedAt || 0) - (a.publishedAt || 0)) };
}
