// Network-first: zawsze najnowsza wersja strony, a z cache tylko gdy brak sieci
// albo sieć nie odpowiada w ciągu 3 s.
const CACHE = 'banki-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith((async () => {
    const network = fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    });
    const timeout = new Promise(resolve => setTimeout(resolve, 3000));
    const res = await Promise.race([network.catch(() => null), timeout]);
    if (res) return res;
    const cached = await caches.match(req, { ignoreSearch: true });
    return cached || network;
  })());
});
