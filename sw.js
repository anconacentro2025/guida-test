// Service Worker per Affittacamere Ancona Centro - Guida Ospiti V4.1.2
// FIX CRIT-4: fallback offline restituisce Response valida invece di undefined
// FIX CRIT-5: cache name allineato alla versione app
// FIX CRIT-2: strategia HTML cambiata in Stale-While-Revalidate
// FIX CRIT-5b: aggiunta cache fonts.gstatic.com per woff2

const CACHE_NAME = 'ancona-guida-v4.1.2';
const TILES_CACHE_NAME = CACHE_NAME + '-tiles';
const MAX_TILES = 200;

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    'https://raw.githubusercontent.com/anconacentro2025/Guida-v-4.0/main/img/home.jpg',
    'https://raw.githubusercontent.com/anconacentro2025/Guida-v-4.0/main/img/host.jpg',
    'https://raw.githubusercontent.com/anconacentro2025/Guida-v-4.0/main/img/icon-192.png',
    'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,400&family=Outfit:wght@300;400;500;600&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

function offlineFallback() {
    return new Response(
        '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F3F0EA;color:#1A2332;text-align:center;padding:20px}.card{background:#fff;border-radius:16px;padding:32px;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.1)}h1{color:#0B1F33;font-size:1.4rem;margin-bottom:8px}p{font-size:.9rem;color:#6B7280;line-height:1.5}</style></head><body><div class="card"><h1>📡 Offline</h1><p>Non è disponibile una connessione internet.<br>Riprova quando sei di nuovo connesso.</p></div></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

async function trimTilesCache() {
    const cache = await caches.open(TILES_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length > MAX_TILES) {
        const toDelete = keys.slice(0, keys.length - MAX_TILES);
        for (const req of toDelete) {
            await cache.delete(req);
        }
    }
}

self.addEventListener('install', (event) => {
    console.log('🔄 Service Worker: installazione in corso...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('✅ Cache aperta, salvataggio assets...');
                return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                    console.warn('⚠️ Alcuni assets non sono stati cachati:', err);
                });
            })
            .then(() => {
                console.log('✅ Installazione completata');
                return self.skipWaiting();
            })
    );
});

self.addEventListener('activate', (event) => {
    console.log('🔄 Service Worker: attivazione');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== TILES_CACHE_NAME) {
                        console.log('🗑️ Rimozione vecchia cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('✅ Attivazione completata');
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;

    if (url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('facebook.com/tr')) return;

    if (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname === './') {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return networkResponse;
                }).catch(() => {
                    return cachedResponse || offlineFallback();
                });
                return cachedResponse || fetchPromise;
            })
        );
        return;
    }

    if (url.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    return fetch(event.request).then((response) => {
                        const responseClone = response.clone();
                        caches.open(TILES_CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                            trimTilesCache();
                        });
                        return response;
                    }).catch(() => {
                        return new Response('', { status: 503, headers: { 'Content-Type': 'image/png' } });
                    });
                })
        );
        return;
    }

    if (url.hostname.includes('raw.githubusercontent.com')) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    return cachedResponse || fetch(event.request).then((response) => {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                        return response;
                    }).catch(() => {
                        return new Response('', { status: 503 });
                    });
                })
        );
        return;
    }

    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    return cachedResponse || fetch(event.request).then((response) => {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                        return response;
                    }).catch(() => {
                        return new Response('', { status: 503 });
                    });
                })
        );
        return;
    }

    if (url.hostname.includes('unpkg.com')) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    return cachedResponse || fetch(event.request).then((response) => {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                        return response;
                    }).catch(() => {
                        return new Response('', { status: 503 });
                    });
                })
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then(cached => cached || offlineFallback());
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
