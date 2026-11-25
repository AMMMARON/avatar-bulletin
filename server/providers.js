import { RoomServiceClient } from 'livekit-server-sdk';
import { cleanText, isActive } from './newsroom.js';
import { requireValue } from './store.js';

export function publicProviders({livekit, runway, elevenlabs}) {
  return {
    livekit: { hasKey: !!livekit.apiKey, hasSecret: !!livekit.apiSecret, configured: !!(livekit.apiKey && livekit.apiSecret && livekit.url), url: livekit.url || '' },
    runway: { hasKey: !!runway.apiKey, configured: !!(runway.apiKey && (runway.avatarId || runway.presetId)), avatarId: runway.avatarId || '', presetId: runway.presetId || '' },
    elevenlabs: { hasKey: !!elevenlabs.apiKey, configured: !!(elevenlabs.apiKey && elevenlabs.voiceId), voiceId: elevenlabs.voiceId || '' },
  };
}

function projectUrl(value) {
  let url;
  try { url = new URL(value); } catch {}
  requireValue(
    url?.protocol === 'wss:' && /^[a-z0-9-]+\.livekit\.cloud$/i.test(url.hostname)
      && !url.username && !url.password && !url.port && !url.search && !url.hash && url.pathname === '/',
    'أدخل رابط مشروع LiveKit Cloud بصيغة wss://project.livekit.cloud.'
  );
  return url.origin;
}

export function saveProviders(state, input) {
  requireValue(!isActive(state.broadcast.phase), 'أوقف البث قبل تغيير إعدادات المزوّدين.', 409);
  for (const [name, fields] of Object.entries({
    livekit: ['url', 'apiKey', 'apiSecret'], runway: ['apiKey','avatarId','presetId'], elevenlabs: ['apiKey','voiceId'],
  })) {
    const patch = input[name];
    if (!patch) continue;
    requireValue(typeof patch === 'object' && !Array.isArray(patch), 'تحقق من إعدادات المزوّد.');
    const provider = state.providers[name];
    for (const field of fields) {
      if (!Object.hasOwn(patch, field)) continue;
      const secret = field === 'apiKey' || field === 'apiSecret';
      const value = cleanText(patch[field], secret ? 700 : field === 'url' ? 250 : 128, field);
      if (secret && !value) continue;
      requireValue(!/[\u0000-\u0020\u007f]/.test(value), 'المعرّفات والمفاتيح لا تقبل المسافات.');
      provider[field] = field === 'url' && value ? projectUrl(value) : value;
    }
  }
  const { avatarId, presetId } = state.providers.runway;
  requireValue(!(avatarId && presetId), 'اختر شخصية مخصّصة أو شخصية جاهزة واحدة.');
}

export function roomClient(livekit) {
  return new RoomServiceClient(livekit.url.replace('wss:', 'https:'), livekit.apiKey, livekit.apiSecret, {requestTimeout: 9});
}

export async function listCatalog(providers, input) {
  const provider = input.provider;
  requireValue(['runway','elevenlabs','livekit'].includes(provider), 'مزوّد غير مدعوم.');
  const cursor = cleanText(input.cursor, 1000, 'مؤشر الصفحة');
  const config = providers[provider];
  requireValue(config.apiKey, 'احفظ مفتاح المزوّد أولاً.');
  if (provider === 'livekit') {
    requireValue(config.url && config.apiSecret, 'أكمل إعدادات LiveKit أولاً.');
    try { await roomClient(config).listRooms(); }
    catch { requireValue(false, 'تعذّر التحقق من اتصال LiveKit وصلاحية قراءة الغرف.', 502); }
    return { items: [], nextCursor: null };
  }
  const runway = provider === 'runway';
  const url = new URL(runway ? 'https://api.dev.runwayml.com/v1/avatars' : 'https://api.elevenlabs.io/v2/voices');
  url.searchParams.set(runway ? 'limit' : 'page_size', '100');
  if (cursor) url.searchParams.set(runway ? 'cursor' : 'next_page_token', cursor);
  let result;
  try {
    const response = await fetch(url, {
      headers: runway ? { authorization: 'Bearer ' + config.apiKey, 'X-Runway-Version': '2024-11-06' } : { 'xi-api-key': config.apiKey },
      redirect: 'error', signal: AbortSignal.timeout(9000),
    });
    if (response.ok) result = await response.json();
  } catch {}
  const records = runway ? result?.data : result?.voices;
  requireValue(Array.isArray(records), 'تعذّرت قراءة القائمة. تحقّق من مفتاح API وصلاحيات القراءة لدى المزوّد.', 502);
  const items = records
    .filter(item => item && (!runway || item.status === 'READY'))
    .map(item => ({ id: runway ? item.id : item.voice_id, name: item.name }))
    .filter(item => typeof item.id === 'string' && typeof item.name === 'string');
  return { items, nextCursor: (runway ? result.nextCursor : result.next_page_token) || null };
}
