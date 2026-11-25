(() => {
  const current = document.documentElement.lang;
  const url = new URL(location.href);
  const watch = /\/watch(?:\.html)?\/?$/.test(url.pathname);
  const page = watch ? 'watch.html' : 'index.html';
  const preferred = url.searchParams.get('lang');
  const storageKey = 'bulletin.interface.language';
  let language = current;
  try {
    if (preferred === 'ar' || preferred === 'en') language = preferred;
    else if (current === 'ar' && localStorage.getItem(storageKey) === 'en') language = 'en';
    localStorage.setItem(storageKey, language);
  } catch {}
  if (language !== current) {
    url.pathname = (language === 'en' ? '/en/' : '/') + page;
    location.replace(url.href);
    return;
  }
  if (preferred) {
    url.searchParams.delete('lang');
    history.replaceState(history.state, '', url);
  }
  function updateLink() {
    const link = document.querySelector('[data-language]');
    if (!link) return;
    const next = current === 'ar' ? 'en' : 'ar';
    const target = new URL(location.href);
    target.pathname = (next === 'en' ? '/en/' : '/') + page;
    target.searchParams.set('lang', next);
    link.href = target.href;
  }
  document.addEventListener('DOMContentLoaded', updateLink);
  window.addEventListener('hashchange', updateLink);
})();
