const states = {
  candidate: ['مرشّح', 'orange'],
  selected: ['قيد التحرير', 'orange'],
  approved: ['معتمد', 'green'],
};
const phases = {
  idle: 'خارج الهواء',
  starting: 'جارٍ التجهيز',
  live: 'على الهواء',
  stopping: 'جارٍ الإيقاف',
  failed: 'تعذّر البث',
  ended: 'انتهى البث',
};
const routes = {
  desk: ['غرفة الأخبار', 'desk'],
  research: ['الباحث', 'search'],
  manager: ['مدير النشرة', 'select'],
  editor: ['المحرّر', 'edit'],
  production: ['مدير الإنتاج', 'sliders'],
  presenter: ['المراسل الافتراضي', 'mic'],
  providers: ['ربط المزوّدين', 'plug'],
  login: ['دخول المشغّل', 'login'],
};
const sample = [
  [
    'نشرة المساء من الاستوديو الرئيسي',
    'مكتب النشرة',
    'approved',
    'أهلًا بكم في نشرة أفاتار. نستعرض معكم اليوم أبرز فقرات هذه النشرة التجريبية.',
  ],
  [
    'الفنون الرقمية في قلب المدينة',
    'القسم الثقافي',
    'approved',
    'في فقرتنا الثقافية، نستكشف كيف يستخدم الفنانون الضوء والصوت لصناعة تجربة جديدة في المدينة.',
  ],
  [
    'مسارات جديدة أمام المواهب الرياضية',
    'القسم الرياضي',
    'approved',
    'ونختتم نشرتنا مع الرياضة، ونتابع دور الأندية المحلية في رعاية المواهب الصاعدة.',
  ],
  ['توسّع مبادرات التعليم الرقمي', 'مكتب المجتمع', 'selected', ''],
  ['الأرشيف الصوتي يحفظ ذاكرة المكان', 'مكتب الثقافة', 'candidate', ''],
  ['قراءة في مستقبل النقل الحضري', 'مكتب الاقتصاد', 'candidate', ''],
];
const demoId = (n) => 'd' + n;
function demoSnapshot() {
  const stories = sample.map(([title, source, status, script], i) => ({
    id: demoId(i + 1),
    title,
    source,
    status,
    script,
    sourceUrl: '',
    revision: 1,
  }));
  return {
    authenticated: false,
    setup: {},
    studio: { stories, order: stories.filter((s) => s.status === 'approved').map((s) => s.id), version: 0 },
    broadcast: { phase: 'idle', startedAt: null },
    providers: { livekit: {}, elevenlabs: {}, runway: {} },
  };
}
const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const safeUrl = (value) => {
  try {
    const u = new URL(value);
    return ['https:', 'http:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
};
const fmtNum = (v) => new Intl.NumberFormat('ar-SA').format(v);
const clockFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Riyadh',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const dateFmt = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Riyadh',
});
const ordered = (studio) =>
  studio.order.map((id) => studio.stories.find((s) => s.id === id && s.status === 'approved')).filter(Boolean);
async function api(action, body) {
  let response;
  try {
    const params = new URLSearchParams({action});
    const audienceChannel = new URL(location.href).searchParams.get('channel');
    if (document.body.classList.contains('watch-page') && audienceChannel && ['status','viewer'].includes(action)) params.set('channel', audienceChannel);
    response = await fetch('/api/studio?' + params, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('تعذّر الوصول إلى الخادم. تحقق من الاتصال وأعد المحاولة.');
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('واجهة الخادم غير متاحة حاليًا.');
  }
  if (!response.ok) {
    const error = new Error(payload.error || 'تعذّر إكمال الطلب.');
    error.status = response.status;
    throw error;
  }
  return payload;
}
export { states, phases, routes, demoSnapshot, esc, safeUrl, fmtNum, clockFmt, dateFmt, ordered, api };
