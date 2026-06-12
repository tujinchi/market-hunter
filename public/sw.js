// =============================================
// 市场猎手 Service Worker
// 提供离线缓存 + 后台同步 + 推送通知基础
// =============================================

const CACHE_NAME = 'market-hunter-v2.0.0';
const RUNTIME_CACHE = 'market-hunter-runtime';

// 预缓存资源列表
const PRE_CACHE_URLS = [
  '/standalone.html',
  '/manifest.json',
  '/data/latest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// =============================================
// INSTALL: 预缓存核心资源
// =============================================
self.addEventListener('install', event => {
  console.log('[SW] 安装中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] 预缓存核心资源');
        return cache.addAll(PRE_CACHE_URLS).catch(err => {
          console.warn('[SW] 部分资源预缓存失败（可忽略）:', err.message);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// =============================================
// ACTIVATE: 清理旧缓存
// =============================================
self.addEventListener('activate', event => {
  console.log('[SW] 激活');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// =============================================
// FETCH: 缓存策略（Network First + Cache Fallback）
// =============================================
self.addEventListener('fetch', event => {
  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // API / JSON 数据: Network First
  if (event.request.url.includes('/data/') || event.request.url.includes('.json')) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // 静态资源: Cache First
  if (event.request.url.match(/\.(css|js|png|jpg|jpeg|svg|ico|woff2?)$/)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML / 默认: Network First
  event.respondWith(networkFirst(event.request));
});

// -------------------------------------------
// Network First 策略
// -------------------------------------------
async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request, { credentials: 'same-origin' });
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    // 离线回退：返回离线页面或空响应
    return new Response(
      JSON.stringify({ error: 'offline', message: '当前无网络连接' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// -------------------------------------------
// Cache First 策略
// -------------------------------------------
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return new Response('', { status: 503 });
  }
}

// =============================================
// PUSH NOTIFICATIONS (预留)
// =============================================
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || '有新的供应链分析结果',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/standalone.html' },
    actions: [
      { action: 'open', title: '查看详情' },
      { action: 'close', title: '关闭' }
    ]
  };
  event.waitUntil(self.registration.showNotification('🦅 市场猎手', options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    const url = event.notification.data.url || '/standalone.html';
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(windowClients => {
        for (const client of windowClients) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
    );
  }
});

// =============================================
// BACKGROUND SYNC (预留)
// =============================================
self.addEventListener('sync', event => {
  if (event.tag === 'refresh-data') {
    event.waitUntil(
      fetch('/data/latest.json')
        .then(res => res.json())
        .then(data => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put('/data/latest.json', new Response(JSON.stringify(data)));
          });
        })
        .catch(err => console.warn('[SW] 后台同步失败:', err))
    );
  }
});
