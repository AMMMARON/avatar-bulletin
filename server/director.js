import { requireValue } from './store.js';

// The director uses only editorially approved copy. Timings are estimates at
// 135 words/minute plus a short handoff between stories.
export function proposeRundown(studio, targetSeconds = 90) {
  requireValue(Number.isInteger(targetSeconds) && targetSeconds >= 15 && targetSeconds <= 300,
    'اختر مدة بين ١٥ و٣٠٠ ثانية.');
  const ranked = new Map(studio.order.map((id, index) => [id, index]));
  const entries = studio.stories.filter(s => s.status === 'approved' && s.script.trim());
  entries.sort((a, b) => {
    const urgent = story => /(?:^|\s)عاجل(?:\s|$|[:،])/u.test(story.title);
    return Number(urgent(b)) - Number(urgent(a)) ||
      (ranked.get(a.id) ?? Infinity) - (ranked.get(b.id) ?? Infinity) ||
      (b.publishedAt || 0) - (a.publishedAt || 0);
  });
  let estimatedSeconds = 0;
  let chars = 0;
  const order = [];
  for (const story of entries) {
    const duration = Math.ceil(story.script.trim().split(/\s+/u).length / 2.25) + 2;
    if (estimatedSeconds + duration > targetSeconds || order.length === 12 || chars + story.script.length > 3000) continue;
    estimatedSeconds += duration;
    chars += story.script.length;
    order.push(story.id);
  }
  const omitted = entries.length - order.length;
  const reason = order.length
    ? 'قدّم مدير الإنتاج الأخبار المعتمدة الموسومة بعاجل، ثم احترم ترتيب المحرّر ضمن الوقت المتاح. المدة تقديرية حتى تجهيز الصوت.'
    : entries.length ? 'مدة الفقرات المعتمدة تتجاوز الوقت المتاح. زد مدة النشرة أو اختصر النص في التحرير.' : 'اعتمد فقرة واحدة على الأقل ليقترح مدير الإنتاج ترتيب النشرة.';
  return {order, estimatedSeconds, reason, omitted};
}
