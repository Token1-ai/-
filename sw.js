const CACHE = 'opengate-v1.1';
// ВАЖЛИВО: Якщо ваш файл називається index1.html, вкажіть його тут замість /index.html
const ASSETS = [
  '/',
  '/index1.html', 
  '/manifest.json'
];

// Інсталяція: кешуємо лише базові локальні файли
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => {
        console.log('Кешування базових ресурсів OpenGate...');
        return c.addAll(ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('Помилка кешування при інсталяції:', err))
  );
});

// Активація: видаляємо старі версії кешу
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Перехоплення запитів: "Network First, Falling Back to Cache" 
// (Найкраща стратегія для Web3 соцмереж, де контент постійно оновлюється)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  // Не кешуємо запити до API Supabase або блокчейн-нод (RPC), щоб не багувалися дані
  if (e.request.url.includes('supabase.co') || e.request.url.includes('rpc') || e.request.url.includes('eth_')) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Якщо відповідь успішна (і це не opaque/сторонній збійний запит), копіюємо в кеш
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => {
        // Якщо немає інтернету — віддаємо файл з кешу
        return caches.match(e.request).then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // Якщо в кеші теж немає (наприклад, для нової сторінки)
          if (e.request.mode === 'navigate') {
            return caches.match('/index1.html');
          }
        });
      })
  );
});
