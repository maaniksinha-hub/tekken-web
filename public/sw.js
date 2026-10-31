/* Offline support: the game is static, so cache what is fetched and serve it when the network is missing.
   Strategy: stale-while-revalidate for same-origin GETs, so a new deploy shows up on the next visit. */
const CACHE = "tekken-web-v1";
const PRECACHE = ["./", "./manifest.webmanifest", "./favicon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./characters/index.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
