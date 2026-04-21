const CACHE_NAME = 'lich-lam-viec-v16';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json'
  // Icons should also be cached if they exist
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Network first, fallback to cache
self.addEventListener('fetch', event => {
  // Bỏ qua các request không phải GET hoặc các request đến OneSignal
  if (event.request.method !== 'GET' || event.request.url.includes('onesignal.com')) {
    return; // Để browser tự xử lý bình thường
  }

  // Đối với API từ Google Apps Script, luôn ưu tiên Network, nếu lỗi thì dùng Cache
  if (event.request.url.includes('script.google.com') || event.request.url.includes('script.googleusercontent.com')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const resClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, resClone);
          });
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Đối với các file tĩnh, dùng stale-while-revalidate strategy (Ưu tiên cache, tải ngầm bản mới)
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request).then(networkResponse => {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        }).catch(() => {
          console.log("Offline and no cache found for", event.request.url);
        });
        return cachedResponse || fetchPromise;
      })
    );
  }
});

// Setup for push notifications in the future
self.addEventListener('push', function(event) {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body || 'Bạn có thông báo mới',
      icon: './images/icon-192x192.png',
      badge: './images/icon-192x192.png'
    };
    event.waitUntil(
      self.registration.showNotification(data.title || 'Thông báo lịch làm việc', options)
    );
  }
});
