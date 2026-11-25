import { ic, paint, drawIcons } from './visuals.js';
import { routes, states, esc, fmtNum, ordered, clockFmt, safeUrl, api, demoSnapshot } from './data.js';
import {
  providerCard,
  btn,
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
} from './views.js';
const byId = (id) => document.getElementById(id);
const main = byId('main'),
  dialog = byId('dialog');
let demo = demoSnapshot(),
  state = demo,
  setup = {},
  serverError = '',
  noticeTimer,
  pending = false,
  fetched = [],
  catalogs = {},
  route = 'desk',
  rehearsal = [],
  rehearsalIndex = 0,
  actionNumber = 0;
let lastFocus = null;
function notify(message) {
  const t = byId('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => t.classList.remove('show'), 5200);
}
function navItem(key) {
  const [name, icon] = routes[key];
  return `<a href="#${key}" class="nav-item ${route === key ? 'active' : ''}" ${route === key ? 'aria-current="page"' : ''}>${ic(icon)}${name}</a>`;
}
function navigation() {
  byId('navigation').innerHTML =
    `<span class="nav-heading">مساحة العمل</span>${navItem('desk')}<hr class="nav-break"><span class="nav-heading">فريق النشرة</span>${['research', 'manager', 'editor', 'production', 'presenter'].map(navItem).join('')}<hr class="nav-break"><span class="nav-heading">الإعدادات</span>${navItem('providers')}`;
  byId('account').innerHTML =
    `<a href="#login" class="account-link"><span class="avatar-square">${ic(state.authenticated ? 'user' : 'lock')}</span><span><b>${state.authenticated ? 'حساب المشغّل' : 'دخول المشغّل'}</b><small>${state.authenticated ? 'إدارة الجلسة' : 'المفاتيح والصلاحيات'}</small></span>${ic('login')}</a>`;
  const mode = byId('mode');
  mode.classList.toggle('actual', state.authenticated);
  mode.textContent = state.authenticated ? 'مساحة المشغّل' : 'مساحة تجريبية';
  byId('crumb').textContent = routes[route][0];
  document.title = routes[route][0] + ' | نشرة أفاتار';
}
function refreshProvider(k) {
  const form = main.querySelector('form[data-provider="' + k + '"]');
  if (form) {
    form.outerHTML = providerCard(k, state, catalogs);
    drawIcons(main.querySelector('form[data-provider="' + k + '"]'));
  }
}
function syncTime() {
  const now = clockFmt.format(new Date());
  for (const el of document.querySelectorAll('.signal-time')) el.textContent = now + ' AST';
}
function render() {
  navigation();
  const content = {
    desk: () => desk(state),
    research: () => research(state, fetched),
    manager: () => manager(state),
    editor: () => editor(state),
    production: () => production(state),
    presenter: () => presenter(state),
    providers: () => providers(state, catalogs),
    login: () => login(state, setup, serverError),
  };
  main.innerHTML = content[route]();
  if (state.authenticated && state.channel) {
    for (const link of document.querySelectorAll('a[href*="watch.html"]:not([data-language])')) {
      const audience = new URL(link.href);
      audience.searchParams.set('channel', state.channel);
      link.href = audience.href;
    }
  } else {
    document.querySelector('.watch-link')?.removeAttribute('data-channel');
    const link = document.querySelector('.watch-link');
    if (link) link.href = link.pathname;
  }
  if (route === 'login' && !state.authenticated) {
    main.querySelector('form[data-form=login]')?.insertAdjacentHTML('beforeend',
      '<button type="button" class="button" id="new-studio">إنشاء استوديو شخصي</button>');
    main.querySelector('#new-studio')?.addEventListener('click', () => {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const code = 'studio_' + Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
      openDialog('إنشاء استوديو شخصي', '<p>احفظ رمز الدخول في مدير كلمات المرور. استخدمه للعودة إلى استوديو الأخبار الخاص بك من أي جهاز.</p><input dir="ltr" readonly autocomplete="off" aria-label="رمز الدخول" value="' + code + '"><button type="button" class="button primary" id="enter-studio">حفظت الرمز، افتح الاستوديو</button>');
      dialog.querySelector('#enter-studio').addEventListener('click', () => {
        const form = main.querySelector('form[data-form=login]');
        form.elements.password.value = code;
        dialog.close();
        form.requestSubmit();
      });
    });
  }
  paint();
  syncTime();
}
function navigate(focus = false) {
  const hash = location.hash.slice(1);
  if (hash === 'main') {
    main.focus();
    return;
  }
  route = Object.hasOwn(routes, hash) ? hash : 'desk';
  closeMenu();
  if (dialog.open) dialog.close();
  render();
  if (focus) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    main.focus({ preventScroll: true });
  }
}
function setState(payload) {
  setup = payload.setup || setup;
  if (payload.authenticated && payload.studio && payload.providers) {
    state = payload;
  } else {
    if (state.authenticated) {
      catalogs = {};
      fetched = [];
      demo = demoSnapshot();
    }
    state = demo;
  }
  serverError = '';
}
function closeMenu() {
  byId('sidebar').classList.remove('open');
  byId('scrim').hidden = true;
  byId('menu').setAttribute('aria-expanded', 'false');
}
byId('menu').addEventListener('click', () => {
  byId('sidebar').classList.add('open');
  byId('scrim').hidden = false;
  byId('menu').setAttribute('aria-expanded', 'true');
  byId('sidebar').querySelector('.nav-item')?.focus();
});
byId('scrim').addEventListener('click', closeMenu);
window.addEventListener('hashchange', () => navigate(true));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !byId('scrim').hidden) {
    closeMenu();
    byId('menu').focus();
  }
});
byId('navigation').addEventListener('click', (e) => {
  if (e.target.closest('a')) closeMenu();
});
function openDialog(title, body) {
  if (!dialog.open) lastFocus = document.activeElement;
  dialog.innerHTML = `<div class="dialog-inner"><div class="dialog-heading"><h2 id="dialog-title">${esc(title)}</h2><button type="button" class="icon-button" aria-label="إغلاق" data-act="dismiss">${ic('close')}</button></div>${body}</div>`;
  drawIcons(dialog);
  if (!dialog.open) dialog.showModal();
}
dialog.addEventListener('close', () => {
  dialog.replaceChildren();
  if (lastFocus?.isConnected) lastFocus.focus();
  lastFocus = null;
});
dialog.addEventListener('click', (e) => {
  if (e.target === dialog) {
    const r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
  }
});
async function refresh() {
  const seq = actionNumber;
  try {
    const data = await api('status');
    if (seq !== actionNumber || pending) return;
    const changed =
      data.authenticated !== state.authenticated ||
      JSON.stringify(setup) !== JSON.stringify(data.setup) ||
      JSON.stringify(state.authenticated && state.broadcast) !==
        JSON.stringify(data.authenticated && data.broadcast) ||
      (state.authenticated && state.studio.version !== data.studio?.version);
    // Preserve an operator's in-progress text. Server version checks catch conflicts.
    if (document.activeElement?.matches('input,textarea,select') && state.authenticated && data.authenticated)
      return;
    setState(data);
    if (changed && !dialog.open) render();
  } catch (error) {
    serverError = error.message;
    if (route === 'login' && !pending && !document.activeElement?.matches('input')) render();
  }
}
function lockedControl(target, busy) {
  if (!target?.isConnected) return;
  target.setAttribute('aria-busy', String(busy));
  target.disabled = busy;
}
async function perform(el, fn) {
  if (pending) return;
  pending = true;
  actionNumber++;
  const form = el?.closest('form');
  const original = el?.disabled;
  lockedControl(el, true);
  const out = form?.querySelector('.form-message');
  if (out) out.textContent = '';
  try {
    await fn();
  } catch (error) {
    if (error.status === 401 && state.authenticated) {
      setState({ authenticated: false });
      dialog.close();
      location.hash = 'login';
      render();
    }
    if (error.status === 409 && state.authenticated) {
      try {
        const latest = await api('status');
        setState(latest);
        render();
      } catch {}
    }
    if (out?.isConnected) out.textContent = error.message;
    else notify(error.message);
  } finally {
    pending = false;
    lockedControl(el, !!original);
  }
}
function story(id) {
  return state.studio.stories.find((s) => s.id === id);
}
async function changeStudio(change, message) {
  const draft = structuredClone(state.studio);
  change(draft);
  if (state.authenticated) {
    setState(await api('studio', { version: draft.version, stories: draft.stories, order: draft.order }));
  } else {
    draft.version++;
    demo.studio = draft;
    state = demo;
  }
  render();
  if (message) notify(message);
}
let proposal = null;
function demoProposal(seconds) {
  const s = state.studio;
  const priority = s.order.concat(s.stories.filter((x) => !s.order.includes(x.id)).map((x) => x.id));
  const candidates = priority.map((id) => story(id)).filter((x) => x?.status === 'approved' && x.script);
  const urgent = (x) => /(?:^|[\s،:：–—-])عاجل(?:$|[\s،:：–—-])/.test(x.title);
  candidates.sort((a, b) => Number(urgent(b)) - Number(urgent(a)));
  const order = [];
  let estimatedSeconds = 0,
    characters = 0;
  for (const item of candidates) {
    const duration = Math.ceil((item.script.trim().split(/\s+/u).length * 60) / 135) + 2;
    if (estimatedSeconds + duration > seconds || characters + item.script.length > 3000 || order.length >= 12)
      continue;
    order.push(item.id);
    estimatedSeconds += duration;
    characters += item.script.length;
  }
  return {
    order,
    estimatedSeconds,
    omitted: candidates.length - order.length,
    reason: 'عناوين العاجل أولًا، ثم ترتيب المشغّل ضمن الزمن المتاح.',
  };
}
function planDialog(plan, seconds) {
  proposal = { ...plan, version: state.studio.version };
  const list = plan.order.map((id) => story(id)).filter(Boolean);
  const rows = list
    .map((s, i) => `<div class="stage-row"><span class="rundown-no">${i + 1}</span><b>${esc(s.title)}</b></div>`)
    .join('');
  openDialog(
    'الترتيب المقترح',
    `<p>${esc(plan.reason || '')}</p><p class="tiny">زمن التقديم التقديري ${fmtNum(plan.estimatedSeconds || 0)} من ${fmtNum(seconds)} ثانية · فقرات خارج المقترح ${fmtNum(plan.omitted || 0)}</p>${rows || '<p>لا تتسع المدة لفقرة جاهزة. زد الزمن أو اختصر النص.</p>'}<div class="form-actions">${list.length ? btn('تطبيق الترتيب', 'apply-plan', 'primary') : ''}${btn('إغلاق', 'dismiss')}</div>`,
  );
}
function rehearsalDialog() {
  const s = rehearsal[rehearsalIndex];
  if (!s) return;
  openDialog(
    'بروفة محلية',
    `<p>${badge('الفقرة ' + fmtNum(rehearsalIndex + 1) + ' من ' + fmtNum(rehearsal.length), 'orange')}</p><h3>${esc(s.title)}</h3><p class="preline">${esc(s.script)}</p><p class="hint">قراءة للنص والترتيب على هذا الجهاز. لا تُشغَّل خدمات الصوت أو الصورة.</p><div class="form-actions">${rehearsalIndex + 1 < rehearsal.length ? btn('الفقرة التالية', 'rehearsal-next', 'dark') : btn('إنهاء البروفة', 'dismiss', 'dark')}</div>`,
  );
}
function detail(s) {
  openDialog(
    s.title,
    `<p>${sourceRef(s)} · ${readRevision(s)} · ${states[s.status][0]}</p><p class="preline">${esc(s.script || 'بانتظار كتابة نص التقديم.')}</p><div class="form-actions">${btn('إغلاق', 'dismiss')}</div>`,
  );
}
function editorAssist(item) {
  return `<details class="editor-assist"><summary>مساعدة في صياغة النص</summary><label class="field"><span>حقائق أو مقتطفات من المصدر</span><textarea name="notes" maxlength="5000" rows="3" placeholder="ألصق الحقائق الموثّقة التي تريد استخدامها في المسودة.">${esc(item.notes || '')}</textarea></label><div class="form-actions">${btn('استخراج مسودة', 'draft-text', 'soft', 'edit')}${state.authenticated && setup.editorialAi ? btn('صياغة بالذكاء الاصطناعي', 'ai-draft-confirm', '', 'edit') : ''}</div><div class="ai-confirm"></div><div class="draft-result" role="status"></div></details>`;
}
let editorProposal = null;
function edit(s) {
  editorProposal = null;
  openDialog(
    'تحرير نص التقديم',
    `<form data-form="edit" data-id="${esc(s.id)}" data-revision="${s.revision}">${input('عنوان الخبر', 'title', { val: s.title, max: 240, required: true })}<p class="tiny">${sourceRef(s)} · ${readRevision(s)}</p>${s.status === 'selected' ? editorAssist(s) : ''}<label class="field"><span>النص الذي يقدّمه المراسل</span><textarea name="script" maxlength="8000" rows="6">${esc(s.script)}</textarea></label>${s.status === 'approved' ? '<p class="hint">تعديل النص المعتمد يعيده إلى التحرير ويسحبه من ترتيب النشرة حتى اعتماده مجددًا.</p>' : ''}<div class="form-actions"><button type="submit" name="intent" value="draft" class="button">${s.status === 'approved' ? 'إعادة للتحرير' : 'حفظ المسودة'}</button>${s.status === 'approved' ? '' : '<button type="submit" name="intent" value="approve" class="button primary">اعتماد النص</button>'}</div><p class="form-message" role="alert"></p></form>`,
  );
}
async function clickAction(el) {
  const a = el.dataset.act,
    s = el.dataset.id ? story(el.dataset.id) : null;
  if (a === 'dismiss') {
    dialog.close();
    return;
  }
  if (a === 'detail' && s) {
    detail(s);
    return;
  }
  if (a === 'edit-story' && s) {
    edit(s);
    return;
  }
  if (a === 'rehearse') {
    rehearsal = structuredClone(ordered(state.studio));
    rehearsalIndex = 0;
    rehearsalDialog();
    return;
  }
  if (a === 'rehearsal-next') {
    if (rehearsalIndex + 1 < rehearsal.length) rehearsalIndex++;
    rehearsalDialog();
    return;
  }
  if (a === 'ai-draft-confirm') {
    const form = el.closest('form');
    if (!state.authenticated || !form) return;
    if (!form.querySelector('[name=notes]').value.trim()) {
      form.querySelector('.form-message').textContent = 'أدخل حقائق المصدر أولًا.';
      return;
    }
    form.querySelector('.ai-confirm').innerHTML =
      '<div class="notice providers-help">ستُرسل ملاحظات المصدر والعنوان إلى Vercel AI Gateway لإنشاء اقتراح. قد تُحتسب تكلفة الاستدلال على حساب الاستوديو.<div class="form-actions">' +
      btn('تأكيد إرسال الطلب', 'draft-ai', 'primary') +
      btn('إلغاء', 'cancel-ai') +
      '</div></div>';
    drawIcons(form);
    return;
  }
  if (a === 'cancel-ai') {
    el.closest('.ai-confirm').replaceChildren();
    return;
  }
  if (a === 'accept-draft') {
    const form = el.closest('form');
    if (editorProposal && form) {
      form.querySelector('[name=script]').value = editorProposal;
      form.querySelector('.draft-result').replaceChildren();
      editorProposal = null;
      notify('أُدرج الاقتراح في حقل النص للمراجعة.');
    }
    return;
  }
  if (a === 'start-confirm') {
    if (!state.authenticated || livePhase(state)) return;
    const list = ordered(state.studio);
    openDialog(
      'تأكيد بدء البث',
      `<p>سيبدأ تقديم ${fmtNum(list.length)} فقرات من النشرة المعتمدة على شاشة الجمهور.</p><p class="notice">يستخدم التشغيل Runway للشخصية، وElevenLabs للصوت، وLiveKit للبث، وVercel لتشغيل العامل. قد تُحتسب رسوم أو يُخصم من رصيد هذه الخدمات، بما في ذلك وقت اتصال الشخصية أثناء الصمت.</p><p>قد يستغرق تجهيز الاستوديو نحو دقيقتين. سقف جلسة الشخصية خمس دقائق.</p><div class="form-actions">${btn('تأكيد وبدء البث', 'start', 'danger', 'radio')}${btn('إلغاء', 'dismiss')}</div>`,
    );
    return;
  }
  await perform(el, async () => {
    if (a === 'draft-text' || a === 'draft-ai') {
      const form = el.closest('form');
      if (!form) return;
      const item = story(form.dataset.id),
        notes = form.querySelector('[name=notes]').value.trim(),
        mode = a === 'draft-ai' ? 'ai' : 'extractive';
      if (!item || !notes) throw new Error('أدخل حقائق المصدر أولًا.');
      if (mode === 'ai' && (!state.authenticated || !el.closest('.ai-confirm'))) return;
      const words = notes
        .split(/(?<=[.!؟])\s+|[\r\n]+/u)
        .map((v) => v.trim())
        .filter(Boolean)
        .slice(0, 3);
      const proposal = state.authenticated
        ? await api('editorialDraft', {
            storyId: item.id,
            title: form.querySelector('[name=title]').value.trim(),
            source: item.source,
            notes,
            mode,
            confirmCost: mode === 'ai',
          })
        : { script: words.join(' '), evidence: words };
      if (!form.isConnected) return;
      if (!proposal.script) throw new Error('تعذّرت صياغة مسودة من هذه الملاحظات.');
      editorProposal = proposal.script;
      form.querySelector('.ai-confirm').replaceChildren();
      const evidence = Array.isArray(proposal.evidence) ? proposal.evidence.filter(x => typeof x === 'string').slice(0, 3) : [];
      const passages = evidence.length ? '<details><summary>مقتطفات المصدر</summary><ul>' +
        evidence.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul></details>' : '';
      form.querySelector('.draft-result').innerHTML =
        '<div class="notice neutral providers-help"><b>اقتراح للمراجعة</b><p class="preline">' +
        esc(proposal.script) +
        '</p>' +
        passages +
        btn('استخدام الاقتراح في النص', 'accept-draft', 'soft') +
        '</div>';
      drawIcons(form);
      return;
    }
    if (a === 'select-story' && s) {
      await changeStudio((d) => {
        d.stories.find((x) => x.id === s.id).status = 'selected';
      }, 'أُرسل الخبر إلى مكتب المحرّر.');
      return;
    }
    if (a === 'apply-plan') {
      if (!proposal || proposal.version !== state.studio.version)
        throw new Error('تغيّرت الفقرات. اطلب اقتراحًا جديدًا.');
      if (livePhase(state)) throw new Error('بدأ البث. عدّل الفقرات التالية من ترتيب النشرة.');
      await changeStudio((d) => {
        d.order = [...proposal.order];
      }, 'طُبّق الترتيب المقترح.');
      proposal = null;
      dialog.close();
      return;
    }
    if (a === 'order-break' && s) {
      if (!state.broadcast.dynamic || !livePhase(state)) throw new Error('تغيّرت حالة البث. حدّث قائمة الفقرات.');
      await changeStudio((d) => {
        const locks = new Set(state.broadcast.lockedIds || []);
        if (locks.has(s.id)) throw new Error('سُلّمت هذه الفقرة للبث بالفعل.');
        d.order = d.order.filter((id) => id !== s.id);
        const next = d.order.reduce((position, id, i) => (locks.has(id) ? i + 1 : position), 0);
        d.order.splice(next, 0, s.id);
      }, 'أُدرج الخبر العاجل بعد الفقرات التي سُلّمت للبث.');
      return;
    }
    if (a.startsWith('order-') && s) {
      await changeStudio((d) => {
        const i = d.order.indexOf(s.id);
        if (a === 'order-add') {
          if (i < 0 && s.status === 'approved') d.order.push(s.id);
        } else if (i >= 0 && a === 'order-close') {
          d.order.splice(i, 1);
        } else if (i >= 0) {
          const j = i + (a === 'order-up' ? -1 : 1);
          if (j >= 0 && j < d.order.length) [d.order[i], d.order[j]] = [d.order[j], d.order[i]];
        }
      }, 'حُفظ ترتيب النشرة.');
      return;
    }
    if (a === 'import') {
      const row = fetched[Number(el.dataset.index)];
      if (!row) return;
      if (state.studio.stories.some((s) => s.id === row.id || (row.sourceUrl && s.sourceUrl === row.sourceUrl)))
        throw new Error('هذا الخبر موجود في الغرفة.');
      await changeStudio((d) => d.stories.unshift(row), 'أُضيف الخبر إلى المرشّحات.');
      fetched = fetched.filter((x) => x.id !== row.id);
      render();
      return;
    }
    if (!state.authenticated) return;
    if (a === 'logout') {
      setState(await api('logout', {}));
      location.hash = 'desk';
      render();
      notify('تم تسجيل الخروج.');
      return;
    }
    if (a === 'research') {
      fetched = (await api('research', {})).stories.filter(
        (x) => !state.studio.stories.some((s) => s.id === x.id || s.sourceUrl === x.sourceUrl),
      );
      render();
      notify(fetched.length ? 'جُلبت العناوين المتاحة.' : 'لا توجد عناوين جديدة.');
      return;
    }
    if (a === 'catalog' || a === 'more-catalog') {
      const k = el.dataset.provider;
      if (el.closest('form')?.getAttribute('data-dirty') === 'true')
        throw new Error('احفظ التغييرات قبل جلب القائمة أو فحص الاتصال.');
      const previous = catalogs[k];
      const result = await api('catalog', {
        provider: k,
        ...(a === 'more-catalog' && previous?.nextCursor ? { cursor: previous.nextCursor } : {}),
      });
      catalogs[k] = {
        ...result,
        items: a === 'more-catalog' ? [...previous.items, ...result.items] : result.items,
        checked: true,
      };
      refreshProvider(k);
      notify(k === 'livekit' ? 'نجح الاتصال بالمشروع.' : 'اكتمل فحص القائمة.');
      return;
    }
    if (a === 'start' || a === 'stop') {
      if (a === 'start' && !dialog.open) return;
      if (a === 'start') {
        dialog.close();
        openDialog(
          'تجهيز الاستوديو',
          '<p role="status">جارٍ تجهيز عامل البث وإرسال النشرة. قد يستغرق التشغيل الأول نحو دقيقتين.</p>',
        );
      }
      try {
        setState(await api(a, a === 'start' ? { confirm: true } : {}));
        render();
        notify(a === 'start' ? 'أُرسل طلب تشغيل البث.' : 'أُرسل طلب إيقاف البث.');
      } finally {
        if (dialog.open) dialog.close();
        void refresh();
      }
    }
  });
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) void clickAction(el);
});
document.addEventListener('input', (e) => {
  e.target.closest('form[data-form=provider]')?.setAttribute('data-dirty', 'true');
});
document.addEventListener('change', (e) => {
  const k = e.target.dataset.catalog,
    form = e.target.closest('form');
  if (!form) return;
  if (k && e.target.value) {
    form.elements[k === 'runway' ? 'characterId' : 'voiceId'].value = e.target.value;
    if (k === 'runway') form.elements.runwayType.value = 'avatarId';
    form.dataset.dirty = 'true';
  }
  if (e.target.name === 'runwayType') {
    form.elements.characterId.value = '';
    if (form.elements.fromCatalog) form.elements.fromCatalog.value = '';
    form.dataset.dirty = 'true';
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (!f.matches('[data-form]')) return;
  e.preventDefault();
  const raw = new FormData(f),
    intent = e.submitter?.value;
  void perform(e.submitter, async () => {
    if (f.dataset.form === 'director') {
      const seconds = Number(raw.get('targetSeconds'));
      if (!Number.isInteger(seconds) || seconds < 15 || seconds > 300)
        throw new Error('اختر عددًا صحيحًا بين ١٥ و٣٠٠ ثانية.');
      const plan = state.authenticated ? await api('director', { targetSeconds: seconds }) : demoProposal(seconds);
      planDialog(plan, seconds);
      return;
    }
    if (f.dataset.form === 'login') {
      const data = await api('login', { password: raw.get('password') });
      f.reset();
      setState(data);
      location.hash = 'desk';
      render();
      notify('تم الدخول إلى الاستوديو.');
      return;
    }
    if (f.dataset.form === 'story') {
      const title = raw.get('title').trim(),
        source = raw.get('source').trim(),
        sourceUrl = safeUrl(raw.get('sourceUrl').trim());
      if (!title || !source || !sourceUrl) throw new Error('أدخل العنوان والمصدر ورابطًا صالحًا.');
      const item = {
        id: crypto.randomUUID(),
        title,
        source,
        sourceUrl,
        notes: String(raw.get('notes') || '').trim(),
        script: '',
        revision: 1,
        status: 'candidate',
      };
      await changeStudio(
        (d) => d.stories.unshift(item),
        state.authenticated ? 'حُفظ الخبر المرشّح.' : 'أُضيف الخبر إلى المعاينة المحلية.',
      );
      return;
    }
    if (f.dataset.form === 'edit') {
      const s = story(f.dataset.id);
      if (!s || s.revision !== Number(f.dataset.revision))
        throw new Error('تغيّر الخبر. أعد فتح النص لأحدث مراجعة.');
      const title = raw.get('title').trim(),
        script = raw.get('script').trim(),
        approve = intent === 'approve';
      if (!title || (approve && !script)) throw new Error('أدخل العنوان ونص التقديم قبل الاعتماد.');
      await changeStudio(
        (d) => {
          const row = d.stories.find((x) => x.id === s.id);
          if (s.title !== title || s.script !== script) row.revision++;
          Object.assign(row, { title, script, status: approve ? 'approved' : 'selected' });
          if (!approve) d.order = d.order.filter((x) => x !== s.id);
        },
        approve ? 'اعتُمد النص وأصبح متاحًا في غرفة الإنتاج.' : 'حُفظت المراجعة في مكتب المحرّر.',
      );
      dialog.close();
      return;
    }
    if (f.dataset.form === 'provider' && state.authenticated) {
      const k = f.dataset.provider,
        p = {};
      for (const field of ['apiKey', 'apiSecret', 'url', 'voiceId'])
        if (raw.has(field) && (raw.get(field).trim() || !['apiKey', 'apiSecret'].includes(field)))
          p[field] = raw.get(field).trim();
      if (k === 'runway') {
        p.avatarId = '';
        p.presetId = '';
        p[raw.get('runwayType') === 'presetId' ? 'presetId' : 'avatarId'] = raw.get('characterId').trim();
      }
      setState(await api('providers', { [k]: p }));
      f.reset();
      delete catalogs[k];
      refreshProvider(k);
      notify('حُفظت إعدادات المزوّد.');
      return;
    }
  });
});
navigate();
void refresh();
setInterval(syncTime, 1000);
setInterval(() => {
  if (
    !document.hidden &&
    state.authenticated &&
    ['production', 'desk', 'presenter'].includes(route) &&
    !pending &&
    !dialog.open
  )
    void refresh();
}, 7500);
window.addEventListener('focus', () => {
  if (!pending && !dialog.open) void refresh();
});
