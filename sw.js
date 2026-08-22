// ===== V7.0 · 22/08/26 16:17 =====
// Service Worker — Ancona Centro Guida Ospiti V7.0
// V7.0: versioning centralizzato in version.json
// Il SW ora legge SOLO da version.json (timestamp) per invalidare cache.
// Non serve più aggiornare sw.js ad ogni release.

let CACHE_NAME = 'ancona-guida-v7.0-22081640';
let TILES_CACHE_NAME = CACHE_NAME + '-tiles';
const MAX_TILES = 60; // V7.0: ridotto da 200 a 60 per risparmiare storage

// V6.0: nome FISSO, non derivato da CACHE_NAME — deve restare identico release dopo release
const APP_FILES_CACHE_NAME = 'ancona-guida-appfiles';
const MAX_APP_FILES = 6;

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './version.json',
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

async function trimAppFilesCache() {
    const cache = await caches.open(APP_FILES_CACHE_NAME);
    const keys = await cache.keys();
    if (keys.length > MAX_APP_FILES) {
        const toDelete = keys.slice(0, keys.length - MAX_APP_FILES);
        for (const req of toDelete) {
            await cache.delete(req);
        }
    }
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                    console.warn('⚠️ Alcuni assets non cachati:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// V7.0: legge version.json (no-store) e invalida cache se timestamp è diverso
async function checkAndClearCacheIfVersionChanged() {
    try {
        const response = await fetch('./version.json', { cache: 'no-store' });
        if (!response.ok) {
            console.warn('⚠️ version.json non trovato (HTTP ' + response.status + ')');
            return;
        }
        const versionData = await response.json();
        const savedTimestamp = typeof self !== 'undefined' && self.registration ? 
            localStorage.getItem('app-timestamp') : null;
        
        if (versionData.timestamp && versionData.timestamp !== savedTimestamp) {
            console.log('🔄 Nuova versione rilevata:', versionData.appVersion, 'timestamp:', versionData.timestamp);
            
            // Invalida TUTTE le cache
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(name => caches.delete(name)));
            
            // Salva la nuova versione
            localStorage.setItem('app-version', versionData.appVersion);
            localStorage.setItem('app-timestamp', versionData.timestamp);
            localStorage.setItem('app-lastModified', versionData.lastModified);
            
            // Notifica i client
            self.clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ 
                        type: 'VERSION_UPDATED',
                        newVersion: versionData.appVersion,
                        timestamp: versionData.timestamp
                    });
                });
            });
        } else if (versionData.timestamp) {
            // Salva comunque se non era stato fatto
            localStorage.setItem('app-version', versionData.appVersion);
            localStorage.setItem('app-timestamp', versionData.timestamp);
            localStorage.setItem('app-lastModified', versionData.lastModified);
        }
    } catch (error) {
        console.warn('⚠️ Version check fallito:', error);
    }
}

self.addEventListener('activate', (event) => {
    event.waitUntil(
        checkAndClearCacheIfVersionChanged().then(() => {
            return caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== TILES_CACHE_NAME && cacheName !== APP_FILES_CACHE_NAME) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }).then(() => self.clients.claim());
        })
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (event.request.method !== 'GET') return;

    if (url.hostname.includes('google-analytics.com') ||
        url.hostname.includes('facebook.com/tr')) return;

    // version.json: sempre network-first, no-store
    if (url.pathname.endsWith('/version.json')) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).then((response) => {
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(() => {
                return caches.match(event.request).then(cached => cached || new Response('', { status: 503 }));
            })
        );
        return;
    }

    // HTML: Network-First
    if (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname === './') {
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseClone);
                });
                return networkResponse;
            }).catch(() => {
                return caches.match(event.request).then(cached => cached || offlineFallback());
            })
        );
        return;
    }

    // data.js / engine.js — cache-first in una cache dedicata e persistente
    if (url.pathname.endsWith('/data.js') || url.pathname.endsWith('/engine.js')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(event.request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(APP_FILES_CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                        trimAppFilesCache();
                    });
                    return response;
                }).catch(() => {
                    return new Response('', { status: 503 });
                });
            })
        );
        return;
    }

    if (url.hostname.includes('tile.openstreetmap.org')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) return cachedResponse;
                return fetch(event.request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(TILES_CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                        trimTilesCache();
                    });
                    return response;
                }).catch(() => {
                    return new Response('', { status: 404 });
                });
            })
        );
        return;
    }

    // GitHub assets: network-first (stesso di V6.10)
    if (url.hostname.includes('raw.githubusercontent.com')) {
        event.respondWith(
            fetch(event.request).then((response) => {
                if (response.ok) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, responseClone); });
                }
                return response;
            }).catch(() => {
                return caches.match(event.request).then(cached => cached || new Response('', { status: 503 }));
            })
        );
        return;
    }

    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, responseClone); });
                    return response;
                }).catch(() => new Response('', { status: 503 }));
            })
        );
        return;
    }

    if (url.hostname.includes('unpkg.com')) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                return cachedResponse || fetch(event.request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, responseClone); });
                    return response;
                }).catch(() => new Response('', { status: 503 }));
            })
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => { cache.put(event.request, responseClone); });
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
        return;
    }
    // V7.0: CACHE_NAME non è più ricevuto via postMessage (derivato da version.json)
    if (event.data && event.data.type === 'SET_CACHE_NAME' && event.data.cacheName) {
        CACHE_NAME = event.data.cacheName;
        TILES_CACHE_NAME = CACHE_NAME + '-tiles';
    }
});
