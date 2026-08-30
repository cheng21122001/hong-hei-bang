/* sw.js — 装上之后完全离线可用。
   只管静态外壳；菜品存在 localStorage、同步走 Supabase，这里一律不碰
   （跨域请求在 fetch 处直接放行，不进缓存）。

   改了任何静态文件，就把 VERSION 加一，否则一直喂旧缓存。
*/

const VERSION = "hhb-v2";

const ASSETS = [
  "./",
  "index.html",
  "app.css",
  "manifest.webmanifest",
  "seed.json",
  "js/app.js",
  "js/store.js",
  "js/cloud.js",
  "js/sync.js",
  "js/board.js",
  "js/sheet.js",
  "js/account.js",
  "js/config.js",
  "js/vendor/supabase.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon.svg"
];

self.addEventListener("install", e => {
  // 必须 cache:"reload"：addAll 会走浏览器 HTTP 缓存，
  // 结果新版本的缓存里装的还是旧文件，改了也看不见。
  e.waitUntil(
    caches.open(VERSION)
      .then(c => Promise.all(ASSETS.map(u =>
        fetch(u, { cache: "reload" }).then(r => {
          if (!r.ok) throw new Error("装不下 " + u);
          return c.put(u, r);
        })
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (new URL(req.url).origin !== location.origin) return;   // Supabase 的请求不经手

  // 页面导航：离线时回落到缓存里的首页
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
