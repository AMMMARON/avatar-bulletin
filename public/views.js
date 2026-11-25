import { ic } from './visuals.js';
import { states, phases, esc, safeUrl, fmtNum, dateFmt, ordered } from './data.js';
const btn = (label, action, cl = '', icon = '', extra = '') =>
  `<button type="button" class="button ${cl}" data-act="${action}" ${extra}>${icon ? ic(icon) : ''}${label}</button>`;
const link = (label, href, cl = '', icon = '') =>
  `<a class="button ${cl}" href="${href}">${icon ? ic(icon) : ''}${label}</a>`;
const badge = (label, cl = '') => `<span class="badge ${cl}">${esc(label)}</span>`;
const storyBadge = (s) => badge(...(states[s.status] || ['غير محدد', '']));
const empty = (label) => `<div class="empty">${label}</div>`;
const head = (title, sub, action = '') =>
  `<div class="page-heading"><div><h1>${title}</h1><p>${sub}</p></div><div class="title-actions">${action}</div></div>`;
const heading = (title, icon) => `<h2 class="heading-icon">${ic(icon)}${title}</h2>`;
const storyBtn = (s, act, label, cl = '') => btn(label, act, cl, '', `data-id="${esc(s.id)}"`);
const runPhase = (s) => phases[s.broadcast?.phase] || phases.idle;
const livePhase = (s) => ['live', 'starting', 'stopping'].includes(s.broadcast?.phase);
const sourceRef = (s) =>
  safeUrl(s.sourceUrl)
    ? `<a class="source-link" href="${esc(safeUrl(s.sourceUrl))}" target="_blank" rel="noopener noreferrer">${esc(s.source || 'المصدر')}</a>`
    : `<span class="tiny muted">${esc(s.source || 'غرفة الأخبار')}</span>`;
const readRevision = (s) => `مراجعة ${fmtNum(s.revision || 1)}`;
function stat(label, value, icon, color, words = false) {
  return `<div class="stat"><span class="stat-label">${label}</span><strong class="stat-value ${words ? 'words' : ''}">${value}</strong><span class="icon-tile ${color}">${ic(icon)}</span></div>`;
}
function monitor(s) {
  return `<section class="panel"><div class="panel-head">${heading('شاشة الاستوديو', 'screen')}${badge(s.broadcast?.phase === 'live' ? 'مباشر' : 'معاينة الإشارة', s.broadcast?.phase === 'live' ? 'red' : '')}</div><div class="signal-wrap"><div class="signal" aria-label="بطاقة الاستوديو"><canvas class="signal-art" aria-hidden="true"></canvas><span class="signal-tag">${s.broadcast?.phase === 'live' ? 'STUDIO FEED' : 'STANDBY'}</span><span class="signal-freq">AVATAR / TV</span><span class="signal-copy"><small>الاستوديو الرئيسي</small><strong>نشرة أفاتار</strong><em></em></span><time class="signal-time"></time></div></div><div class="signal-footer"><span>استوديو الرياض</span><a href="/watch.html" class="panel-link">فتح شاشة البث</a></div></section>`;
}
function rundown(s) {
  const items = ordered(s.studio);
  return `<section class="panel"><div class="panel-head">${heading('ترتيب النشرة', 'list')}${badge(fmtNum(items.length) + ' فقرات')}</div><div class="rundown-list">${
    items.length
      ? items
          .slice(0, 3)
          .map(
            (v, i) =>
              `<div class="rundown-item"><span class="rundown-no">${String(i + 1).padStart(2, '0')}</span><div><strong><button type="button" data-act="detail" data-id="${esc(v.id)}" class="story-button">${esc(v.title)}</button></strong><small>${esc(v.source)} · ${readRevision(v)}</small></div></div>`,
          )
          .join('')
      : empty('ستظهر الفقرات المعتمدة هنا بعد إضافتها إلى ترتيب النشرة.')
  }</div><div class="rundown-bottom">${ic('sliders')}<a class="panel-link" href="#production">إدارة ترتيب الفقرات</a></div></section>`;
}
function table(stories) {
  return stories.length
    ? `<div class="panel table-panel"><div class="table-scroll"><table class="story-table"><thead><tr><th>عنوان الخبر</th><th>المصدر</th><th>الحالة</th><th>المراجعة</th></tr></thead><tbody>${stories.map((s) => `<tr><td><button type="button" class="story-button" data-act="detail" data-id="${esc(s.id)}">${esc(s.title)}</button></td><td>${esc(s.source)}</td><td>${storyBadge(s)}</td><td>${fmtNum(s.revision || 1)}</td></tr>`).join('')}</tbody></table></div></div>`
    : `<div class="panel">${empty('قائمة الأخبار فارغة. أضف أول خبر من مكتب الباحث.')}</div>`;
}
function desk(s) {
  const stories = s.studio.stories,
    ready = ordered(s.studio).length;
  return (
    head(
      'غرفة الأخبار',
      `<span class="date">${esc(dateFmt.format(new Date()))}</span>`,
      link('غرفة الإنتاج', '#production', 'primary', 'sliders'),
    ) +
    `<div class="stat-grid">${stat('مواد التحرير', fmtNum(stories.filter((x) => x.status === 'selected').length), 'edit', 'coral')}${stat('فقرات النشرة', fmtNum(ready), 'list', 'olive')}${stat('أخبار مرشّحة', fmtNum(stories.filter((x) => x.status === 'candidate').length), 'clip', '')}${stat('حالة البث', runPhase(s), 'radio', 'wine', true)}</div><div class="desk-grid">${monitor(s)}${rundown(s)}</div><section class="desk-lower"><div class="section-head">${heading('مكتب الأخبار', 'layers')}<a href="#research" class="panel-link">فتح مكتب الباحث</a></div>${table(stories.slice(0, 6))}</section>`
  );
}
const input = (label, name, opts = {}) =>
  `<label class="field ${opts.code ? 'code' : ''}"><span>${label}</span><input name="${name}" type="${opts.type || 'text'}" ${opts.code ? 'dir="ltr"' : ''} maxlength="${opts.max || 500}" value="${esc(opts.val || '')}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''} ${opts.required ? 'required' : ''} ${opts.disabled ? 'disabled' : ''} ${opts.autocomplete ? `autocomplete="${opts.autocomplete}"` : 'autocomplete="off"'}></label>`;
function sourceCard(s, actions = '') {
  return `<article class="panel story-card"><div class="card-meta">${storyBadge(s)}${sourceRef(s)}</div><h3>${esc(s.title)}</h3>${s.script ? `<p>${esc(s.script.length > 125 ? s.script.slice(0, 125) + '…' : s.script)}</p>` : ''}${actions ? `<div class="form-actions">${actions}</div>` : ''}</article>`;
}
function research(s, fetched) {
  const candidates = s.studio.stories.filter((x) => x.status === 'candidate');
  const disabled = s.authenticated ? '' : 'disabled';
  return (
    head('مكتب الباحث', 'اجمع المصادر وأرسل الأخبار المرشّحة إلى مدير النشرة.') +
    `<div class="content-grid"><section class="stack"><form class="panel form-card" data-form="story"><h2>إضافة خبر مرشّح</h2>${input('عنوان الخبر', 'title', { required: true, max: 180 })}<div class="field-row">${input('اسم المصدر', 'source', { required: true, max: 120 })}${input('رابط المصدر', 'sourceUrl', { required: true, type: 'url', code: true, max: 1000, placeholder: 'https://…' })}</div><label class="field"><span>حقائق من المصدر (اختياري)</span><textarea name="notes" maxlength="5000" rows="3" placeholder="أضف المعلومات التي يحتاجها المحرّر لصياغة الخبر."></textarea></label><button class="button primary" type="submit">${ic('plus')}إضافة إلى المرشّحات</button><p class="form-message" role="alert"></p></form><div class="section-head">${heading('الأخبار المرشّحة', 'clip')}${badge(fmtNum(candidates.length))}</div>${candidates.length ? candidates.map((x) => sourceCard(x, storyBtn(x, 'detail', 'عرض الخبر'))).join('') : `<div class="panel">${empty('لا توجد أخبار مرشّحة حاليًا.')}</div>`}</section><section class="panel form-card"><h2>البحث في المصادر</h2><p class="intro">اجلب أحدث العناوين من مصادر الأخبار ثم اختر ما يدخل غرفة التحرير.</p>${btn('جلب العناوين', 'research', 'dark', 'search', disabled)}${!s.authenticated ? '<p class="hint">يتاح جلب المصادر بعد دخول المشغّل.</p>' : ''}${fetched.map((x, i) => `<div class="story-card"><small class="muted">${esc(x.source)}</small><h3>${esc(x.title)}</h3>${btn('إضافة للمرشّحات', 'import', 'soft', 'plus', `data-index="${i}"`)}</div>`).join('')}</section></div>`
  );
}
function manager(s) {
  const incoming = s.studio.stories.filter((x) => x.status === 'candidate'),
    selected = s.studio.stories.filter((x) => x.status === 'selected');
  return (
    head('مكتب مدير النشرة', 'راجع المصدر واختر الأخبار التي تنتقل إلى المحرّر.') +
    `<div class="content-grid"><section class="stack"><div class="section-head">${heading('بانتظار قرار النشرة', 'select')}${badge(fmtNum(incoming.length))}</div>${incoming.length ? incoming.map((x) => sourceCard(x, storyBtn(x, 'select-story', 'اختيار للتحرير', 'primary') + storyBtn(x, 'detail', 'التفاصيل'))).join('') : `<div class="panel">${empty('اكتملت مراجعة الأخبار المرشّحة.')}</div>`}</section><section class="panel form-card"><h2>أُرسلت إلى المحرّر</h2>${selected.length ? selected.map((x) => `<div class="stage-row"><button class="story-button" data-act="detail" data-id="${esc(x.id)}">${esc(x.title)}</button>${ic('edit')}</div>`).join('') : empty('لا توجد مواد في التحرير.')}</section></div>`
  );
}
function editor(s) {
  const editable = s.studio.stories.filter((x) => ['selected', 'approved'].includes(x.status));
  return (
    head('مكتب المحرّر', 'حرّر نص التقديم واعتمد المراجعة الجاهزة للنطق.') +
    `<section class="stack">${editable.length ? editable.map((x) => sourceCard(x, storyBtn(x, 'edit-story', x.status === 'approved' ? 'مراجعة النص' : 'تحرير واعتماد', x.status === 'approved' ? '' : 'primary') + `<small class="muted">${readRevision(x)}</small>`)).join('') : `<div class="panel">${empty('أرسل خبرًا إلى هذا المكتب من شاشة مدير النشرة.')}</div>`}</section>`
  );
}
function production(s) {
  const items = ordered(s.studio);
  const others = s.studio.stories.filter((x) => x.status === 'approved' && !s.studio.order.includes(x.id));
  const providersReady =
    s.providers && ['livekit', 'elevenlabs', 'runway'].every((p) => s.providers[p]?.configured);
  const active = livePhase(s);
  const dynamic = active && s.broadcast.dynamic;
  const locks = active ? new Set(s.broadcast.lockedIds || []) : new Set();
  const startingOk = s.authenticated && items.length && providersReady && s.setup?.worker && !active;
  function orderButton(act, label, id, disabled) {
    return `<button type="button" class="icon-button" aria-label="${label}" title="${label}" data-act="order-${act}" data-id="${esc(id)}" ${disabled ? 'disabled' : ''}>${ic(act)}</button>`;
  }
  function row(x, i) {
    const locked = locks.has(x.id) || (active && !dynamic);
    const label =
      x.id === s.broadcast.segmentId ? 'على الهواء' : locks.has(x.id) ? 'سُلّمت للبث' : readRevision(x);
    const actions =
      orderButton('up', 'تقديم الفقرة', x.id, !i || locked || locks.has(items[i - 1]?.id)) +
      orderButton('down', 'تأخير الفقرة', x.id, i === items.length - 1 || locked || locks.has(items[i + 1]?.id)) +
      orderButton('close', 'إزالة من الترتيب', x.id, locked);
    return `<div class="order-card"><span class="rundown-no">${String(i + 1).padStart(2, '0')}</span><div><b>${esc(x.title)}</b><br><small class="muted">${label}</small></div><div class="order-actions">${actions}</div></div>`;
  }
  const extraRows = others
    .map(
      (x) =>
        `<div class="stage-row"><b>${esc(x.title)}</b><div class="row-inline">${dynamic ? storyBtn(x, 'order-break', 'عاجل تالي', 'soft') : ''}${storyBtn(x, 'order-add', 'إضافة')}</div></div>`,
    )
    .join('');
  const reason = !s.authenticated
    ? 'سجّل دخول المشغّل للتحكّم بالبث.'
    : !items.length
      ? 'أضف فقرة معتمدة إلى النشرة.'
      : !providersReady
        ? 'أكمل ربط المزوّدين الثلاثة أولًا.'
        : 'يتطلب التشغيل تهيئة عامل البث في الخادم.';
  const planner = `<form class="panel form-card" data-form="director"><h2>مقترح مدير الإنتاج</h2><p class="intro">اختر زمن النشرة ليقترح المدير ترتيبًا من المواد المعتمدة يناسب وقت التقديم.</p><label class="field"><span>مدة النشرة بالثواني</span><input type="number" name="targetSeconds" min="15" max="300" value="90" required></label><button type="submit" class="button soft" ${active || !s.studio.stories.some((x) => x.status === 'approved') ? 'disabled' : ''}>${ic('sliders')}اقتراح ترتيب</button><p class="form-message" role="alert"></p></form>`;
  return (
    head('غرفة الإنتاج', 'رتّب الفقرات المعتمدة وتحكّم بجلسة البث.', badge(runPhase(s), active ? 'red' : '')) +
    `<div class="content-grid"><div class="stack"><section class="panel form-card"><h2>ترتيب النشرة</h2>${dynamic ? '<p class="hint">يمكن إدراج خبر عاجل بعد آخر فقرة سُلّمت للبث، ثم يواصل المراسل الترتيب المعدّل.</p>' : ''}${items.length ? items.map(row).join('') : empty('اختر فقرة معتمدة لإضافتها إلى النشرة.')}</section><section class="panel form-card"><h2>فقرات جاهزة للإضافة</h2>${others.length ? extraRows : empty('لا توجد فقرات معتمدة إضافية.')}</section>${planner}</div><div class="stack"><section class="panel form-card"><h2>التحكّم بالبث</h2><p class="intro">${s.broadcast?.phase === 'starting' ? 'يجري تجهيز الاستوديو. قد يستغرق التشغيل الأول نحو دقيقتين.' : 'يبدأ المراسل تقديم الفقرات بالترتيب المعتمد عند تأكيد التشغيل.'}</p><div class="form-actions">${active ? btn('إيقاف البث', 'stop', 'danger', 'stop', s.broadcast?.phase === 'stopping' ? 'disabled' : '') : btn('بدء البث', 'start-confirm', 'primary', 'play', startingOk ? '' : 'disabled')}${items.length ? btn('بروفة محلية', 'rehearse', '', 'clip') : ''}</div>${!active && !startingOk ? `<p class="hint">${reason}</p>` : ''}${s.broadcast?.phase === 'failed' ? '<p class="form-message">تعذّر تشغيل الجلسة السابقة. راجع ربط المزوّدين والعامل.</p>' : ''}</section><section class="panel form-card"><h2>جاهزية الاستوديو</h2>${providerRows(s)}<div class="form-actions">${link('ربط المزوّدين', '#providers', '', 'plug')}</div></section></div></div>`
  );
}
function providerRows(s) {
  return [
    ['LiveKit', 'livekit'],
    ['Runway', 'runway'],
    ['ElevenLabs', 'elevenlabs'],
  ]
    .map(
      ([label, k]) =>
        `<div class="stage-row"><b lang="en">${label}</b><span class="indicator ${s.providers[k]?.configured ? 'ready' : ''}">${s.providers[k]?.configured ? 'مكتمل' : 'بانتظار الإعداد'}</span></div>`,
    )
    .join('');
}
function presenter(s) {
  const items = ordered(s.studio),
    first = items[0],
    r = s.providers.runway || {},
    e = s.providers.elevenlabs || {};
  return (
    head(
      'المراسل الافتراضي',
      'النص المعتمد وهوية المراسل المستخدمة في الاستوديو.',
      link('إعداد الشخصية', '#providers', '', 'sliders'),
    ) +
    `<div class="content-grid"><div class="stack">${monitor(s)}<section class="panel form-card"><h2>نص الفقرة الافتتاحية</h2>${first ? `<p class="tiny muted">${esc(first.title)} · ${readRevision(first)}</p><p class="preline">${esc(first.script)}</p>` : empty('أضف فقرة إلى ترتيب النشرة لعرض نص التقديم.')}</section></div><section class="panel form-card"><h2>هوية المراسل</h2><div class="stage-row"><span>الشخصية المرئية</span><b lang="en">Runway</b></div><p class="hint" dir="auto">${esc(r.avatarId || r.presetId || 'بانتظار اختيار الشخصية')}</p><div class="stage-row"><span>صوت التقديم</span><b lang="en">ElevenLabs</b></div><p class="hint" dir="auto">${esc(e.voiceId || 'بانتظار اختيار الصوت')}</p><div class="stage-row"><span>غرفة البث</span><b lang="en">LiveKit</b></div></section></div>`
  );
}
const names = { livekit: 'LiveKit', elevenlabs: 'ElevenLabs', runway: 'Runway' };
function providerCard(k, s, catalogs) {
  const p = s.providers[k] || {},
    disabled = !s.authenticated,
    pref = { code: true, disabled },
    sec = { ...pref, type: 'password', placeholder: 'أدخل المفتاح', autocomplete: 'new-password' },
    idopts = { ...pref, max: 300 },
    items = catalogs[k]?.items || [];
  const isLive = k === 'livekit',
    isRun = k === 'runway',
    role = isLive ? 'الغرفة ونقل البث' : isRun ? 'الشخصية وتزامن الشفاه' : 'صوت الشخصية';
  const select = items.length
    ? `<label class="field"><span>${isRun ? 'شخصيات الحساب' : 'أصوات الحساب'}</span><select name="fromCatalog" data-catalog="${k}"><option value="">اختر من القائمة</option>${items.map((x) => `<option value="${esc(x.id)}">${esc(x.name || x.id)}</option>`).join('')}</select></label>`
    : '';
  return `<form data-form="provider" data-provider="${k}" class="panel form-card"><div class="provider-head"><h2 lang="en">${names[k]}</h2>${badge(p.configured ? 'مكتمل' : p.hasKey ? 'مفتاح محفوظ' : 'غير مربوط', p.configured ? 'green' : '')}</div><p class="intro">${role}</p>${isLive ? input('رابط المشروع', 'url', { ...pref, val: p.url, placeholder: 'wss://project.livekit.cloud' }) : ''}${input('API Key', 'apiKey', { ...sec, placeholder: p.hasKey ? 'محفوظ · اتركه دون تعديل' : 'أدخل المفتاح' })}${isLive ? input('API Secret', 'apiSecret', { ...sec, placeholder: p.hasSecret ? 'محفوظ · اتركه دون تعديل' : 'أدخل السر' }) : ''}${select}${isRun ? `<label class="field"><span>نوع الشخصية</span><select name="runwayType" ${disabled ? 'disabled' : ''}><option value="avatarId">شخصية مخصّصة</option><option value="presetId" ${p.presetId ? 'selected' : ''}>شخصية جاهزة</option></select></label>${input('معرّف الشخصية', 'characterId', { ...idopts, val: p.avatarId || p.presetId, placeholder: 'Avatar ID / Preset ID' })}` : isLive ? '' : input('معرّف الصوت', 'voiceId', { ...idopts, val: p.voiceId, placeholder: 'Voice ID' })}<div class="form-actions"><button type="submit" class="button primary" ${disabled ? 'disabled' : ''}>حفظ</button>${btn(isLive ? 'فحص الاتصال' : isRun ? 'جلب الشخصيات' : 'جلب الأصوات', 'catalog', '', '', `data-provider="${k}" ${!s.authenticated || !p.hasKey ? 'disabled' : ''}`)}</div>${catalogs[k]?.nextCursor ? btn('المزيد', 'more-catalog', 'linklike', '', `data-provider="${k}"`) : ''}${catalogs[k]?.checked ? `<p class="hint">${isLive ? 'نجح فحص الاتصال.' : items.length ? 'اختر عنصرًا من القائمة ثم اضغط حفظ.' : 'لم يُرجع الحساب أي عناصر.'}</p>` : ''}<p class="form-message" role="alert"></p></form>`;
}
function providers(s, catalogs) {
  return (
    head('ربط المزوّدين', 'احفظ مفاتيح الاستوديو واختر شخصية المراسل وصوته.') +
    (!s.authenticated
      ? `<div class="notice">سجّل دخول المشغّل لتفعيل حقول المفاتيح. ${link('دخول المشغّل', '#login', 'linklike')}</div>`
      : '') +
    `<div class="provider-grid">${['runway', 'elevenlabs', 'livekit'].map((k) => providerCard(k, s, catalogs)).join('')}</div><div class="notice neutral providers-help">يحفظ الخادم المفاتيح دون إظهار قيمها بعد الحفظ. يبدأ استهلاك خدمات البث عند تأكيد «بدء البث» في غرفة الإنتاج.</div>`
  );
}
function login(s, setup, serverError) {
  return (
    head('دخول المشغّل', 'الدخول إلى مساحة الأخبار والمزوّدين الخاصة بالاستوديو.') +
    `<section class="panel form-card login-card">${s.authenticated ? `<h2>حساب المشغّل</h2><p class="intro">أنت متصل بمساحة الاستوديو.</p>${btn('تسجيل الخروج', 'logout', '', 'login')}` : `<h2>حساب المشغّل</h2><form data-form="login">${input('كلمة المرور', 'password', { type: 'password', required: true, autocomplete: 'current-password' })}<button type="submit" class="button primary">دخول</button><p class="form-message" role="alert"></p></form>${serverError ? `<p class="notice providers-help">${esc(serverError)}</p>` : setup?.admin === false || setup?.storage === false ? '<p class="notice providers-help">إعداد الاستوديو على الخادم غير مكتمل. يحتاج المشغّل إلى تهيئة كلمة المرور والتخزين الآمن قبل حفظ المفاتيح.</p>' : ''}`}</section>`
  );
}
export {
  providerCard,
  btn,
  link,
  badge,
  desk,
  research,
  manager,
  editor,
  production,
  presenter,
  providers,
  login,
  sourceRef,
  readRevision,
  input,
  livePhase,
};
