import { api, phases } from './data.js';
import { paint } from './visuals.js';
const phase = document.getElementById('public-phase'),
  message = document.getElementById('watch-message'),
  action = document.getElementById('viewer-action'),
  media = document.getElementById('media'),
  copy = document.querySelector('.audience-copy');
let room = null,
  checking = false,
  joining = false,
  pendingAudio = false,
  participantIdentity = '',
  sessionStart = null,
  joinable = false,
  attempt = 0;
function button(text, hidden = false) {
  action.textContent = text;
  action.hidden = hidden;
  action.disabled = joining;
}
function detach() {
  media.replaceChildren();
  copy.hidden = false;
}
function updatePhase(name) {
  phase.className = 'badge' + (name === 'live' ? ' red' : name === 'starting' ? ' orange' : '');
  phase.textContent = phases[name] || 'خارج الهواء';
}
function leave() {
  const old = room;
  attempt++;
  room = null;
  sessionStart = null;
  pendingAudio = false;
  joining = false;
  detach();
  if (old) void old.disconnect();
}
function useTrack(track, participant) {
  if (!track || participant.identity !== participantIdentity || !['video', 'audio'].includes(track.kind)) return;
  const existing = media.querySelector(track.kind);
  const trackId = track.sid || track.mediaStreamTrack?.id;
  if (existing && trackId && existing.dataset.sid === trackId) return;
  if (existing) existing.remove();
  const el = track.attach();
  el.dataset.sid = trackId || '';
  el.autoplay = true;
  el.playsInline = true;
  if (track.kind === 'video') {
    el.muted = true;
    copy.hidden = true;
  }
  media.append(el);
}
function subscribe(publication, participant) {
  if (participant.identity !== participantIdentity) return;
  publication.setSubscribed(true);
  if (publication.track) useTrack(publication.track, participant);
}
async function check() {
  if (checking || joining || document.hidden) return;
  checking = true;
  try {
    const s = await api('status'),
      b = s.broadcast || {};
    updatePhase(b.phase || 'idle');
    joinable = Boolean(b.joinable || b.phase === 'live');
    if (room && (!['live', 'starting'].includes(b.phase) || (sessionStart && b.startedAt !== sessionStart)))
      leave();
    if (room) return;
    if (b.phase === 'live') {
      message.textContent = 'النشرة على الهواء الآن.';
      button('مشاهدة البث');
    } else if (b.phase === 'starting') {
      message.textContent = 'يجري تجهيز الاستوديو لبدء البث.';
      button('انتظار البث في الاستوديو', !joinable);
    } else {
      message.textContent = b.phase === 'failed' ? 'انقطع اتصال الاستوديو.' : 'تبدأ المشاهدة عند انطلاق النشرة.';
      button('تحديث الحالة');
    }
  } catch {
    if (!room) {
      phase.textContent = 'الاتصال غير متاح';
      message.textContent = 'تعذّر جلب حالة الاستوديو الآن.';
      button('إعادة المحاولة');
    }
  } finally {
    checking = false;
  }
}
async function join() {
  if (joining || room) return;
  joining = true;
  button('جارٍ الاتصال…');
  const sequence = ++attempt;
  try {
    const [sdk, token, status] = await Promise.all([import('/assets/livekit.mjs'), api('viewer'), api('status')]);
    if (sequence !== attempt) return;
    participantIdentity = token.avatarIdentity || 'bulletin-avatar';
    const r = new sdk.Room();
    room = r;
    sessionStart = status.broadcast.startedAt;
    r.on(sdk.RoomEvent.TrackPublished, (publication, p) => {
      if (room === r) subscribe(publication, p);
    });
    r.on(sdk.RoomEvent.TrackSubscribed, (track, pub, p) => {
      if (room === r) useTrack(track, p);
    });
    r.on(sdk.RoomEvent.TrackUnsubscribed, (track) => {
      if (room !== r) return;
      for (const el of track.detach()) el.remove();
      if (!media.querySelector('video')) copy.hidden = false;
    });
    r.on(sdk.RoomEvent.AudioPlaybackStatusChanged, () => {
      if (room !== r) return;
      pendingAudio = !r.canPlaybackAudio;
      if (pendingAudio) button('تفعيل الصوت');
      else button('مغادرة المشاهدة');
    });
    r.on(sdk.RoomEvent.Disconnected, () => {
      if (room !== r) return;
      room = null;
      detach();
      pendingAudio = false;
      button('إعادة الاتصال');
      message.textContent = 'انتهى اتصال المشاهدة.';
      void check();
    });
    await r.connect(token.url, token.token, { autoSubscribe: false });
    if (sequence !== attempt) {
      await r.disconnect();
      return;
    }
    for (const p of r.remoteParticipants.values())
      for (const publication of p.trackPublications.values()) subscribe(publication, p);
    try {
      await r.startAudio();
    } catch {}
    pendingAudio = !r.canPlaybackAudio;
    message.textContent = 'متصل بالاستوديو. بانتظار صورة المراسل.';
    joining = false;
    button(pendingAudio ? 'تفعيل الصوت' : 'مغادرة المشاهدة');
  } catch {
    if (sequence === attempt) {
      leave();
      message.textContent = 'تعذّر الاتصال بالبث. أعد المحاولة بعد لحظات.';
      button('إعادة الاتصال');
    }
  } finally {
    if (sequence === attempt) {
      joining = false;
      action.disabled = false;
    }
  }
}
action.addEventListener('click', async () => {
  if (room && pendingAudio) {
    try {
      await room.startAudio();
      pendingAudio = !room.canPlaybackAudio;
    } catch {}
    button(pendingAudio ? 'تفعيل الصوت' : 'مغادرة المشاهدة');
    return;
  }
  if (room) {
    leave();
    void check();
    return;
  }
  if (joinable) await join();
  else await check();
});
window.addEventListener('pagehide', leave);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void check();
});
paint();
void check();
setInterval(check, 15000);
