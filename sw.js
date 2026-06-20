// Service Worker per Affittacamere Ancona Centro - Guida Ospiti V4.1.2
// FIX CRIT-4: fallback offline restituisce Response valida invece di undefined
// FIX CRIT-5: cache name allineato alla versione app

const CACHE_NAME = 'ancona-guida-v4.1.2'; // FIX CRIT-5: allineato a V4.1.2
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

// Risposta offline generica per quando rete e cache falliscono entrambe
// FIX CRIT-4: invece di restituire undefined, restituiamo una Response valida
function offlineFallback() {
    return new Response(
        '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#F3F0EA;color:#1A2332;text-align:center;padding:20px}.card{background:#fff;border-radius:16px;padding:32px;max-width:320px;box-shadow:0 4px 20px rgba(0,0,0,.1)}h1{color:#0B1F33;font-size:1.4rem;margin-bottom:8px}p{font-size:.9rem;color:#6B7280;line-height:1.5}</style></head><body><div class="card"><h1>📡 Offline</h1><p>Non è disponibile una connessione internet.<br>Riprova quando sei di nuovo connesso.</p></div></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

// Installazione: cache degli asset statici
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

// Attivazione: pulizia cache vecchie
self.addEventListener('activate', (event) => {
    console.log('🔄 Service Worker: attivazione');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== CACHE_NAME + '-tiles') {
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

// Strategia di caching: Network First per pagine HTML, Cache First per assets statici
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Ignora richieste non GET
    if (event.request.method !== 'GET') return;

    // Ignora richieste a Google Analytics, Facebook Pixel, etc.
    if (url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('facebook.com/tr')) return;

    // Per la pagina HTML principale: Network First (sempre fresco)
    if (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname === './') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Aggiorna la cache con la versione fresca
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    // FIX CRIT-4: garantisce Response valida anche se cache mancante
                    return caches.match(event.request).then(cached => cached || offlineFallback());
                })
        );
        return;
    }

    // Per mappe Leaflet (tiles): Cache First con fallback
    if (url.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.match(event.request)
                .then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request).then((response) => {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME + '-tiles').then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                        return response;
                    }).catch(() => {
                        // FIX CRIT-4: tile non disponibile offline → risposta vuota valida
                        return new Response('', { status: 503, headers: { 'Content-Type': 'image/png' } });
                    });
                })
        );
        return;
    }

    // Per GitHub raw images: Cache First
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
                        // FIX CRIT-4: immagine non disponibile → 503 valido
                        return new Response('', { status: 503 });
                    });
                })
        );
        return;
    }

    // Per Google Fonts e altri assets CDN: Cache First
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('unpkg.com')) {
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
                        // FIX CRIT-4: font/CDN non disponibile → 503 valido
                        return new Response('', { status: 503 });
                    });
                })
        );
        return;
    }

    // Per tutto il resto: Network First con fallback cache
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
                // FIX CRIT-4: garantisce Response valida (mai undefined)
                return caches.match(event.request).then(cached => cached || offlineFallback());
            })
    );
});

// Gestione messaggi dal client
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});
