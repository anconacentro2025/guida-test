// ===== V6.16 · 23/08/26 13:20 =====
// Service Worker — Affittacamere Ancona Centro · Guida Ospiti V6.16 23/08/26
// V6.0: aggiunta cache dedicata e persistente per data.js/engine.js (vedi APP_FILES_CACHE_NAME
// più sotto). A differenza di CACHE_NAME, questa cache NON viene svuotata ad ogni release:
// serve proprio a evitare che un piccolo aggiornamento di contenuto (data.js) costringa a
// riscaricare anche la logica (engine.js) quando questa non è cambiata. L'invalidazione
// avviene tramite la query string "?v=" nell'URL dei due file, scritta in index.html.

// CACHE_NAME non è più hardcoded: viene ricevuto da index.html tramite postMessage
// {type:'SET_CACHE_NAME', cacheName:'...'} subito dopo la registrazione.
// Il valore di fallback copre il primo avvio prima che il messaggio arrivi.
let CACHE_NAME = 'ancona-guida-v6.16-23081320';
let TILES_CACHE_NAME = CACHE_NAME + '-tiles';
const MAX_TILES = 200;

// V6.0: nome FISSO, non derivato da CACHE_NAME — deve restare identico release dopo release,
// altrimenti verrebbe cancellata dal cleanup in 'activate' a ogni bump di versione, vanificando
// lo scopo (persistere data.js/engine.js tra una release e l'altra).
const APP_FILES_CACHE_NAME = 'ancona-guida-appfiles';
const MAX_APP_FILES = 6; // ~3 versioni di data.js + engine.js prima del trim

// FIX 22/08/26: nome FISSO come APP_FILES_CACHE_NAME — deve sopravvivere al cleanup
// in 'activate'. Usata come sostituto di localStorage (NON disponibile in un Service
// Worker: è un'API sincrona legata al DOM/window, assente in ServiceWorkerGlobalScope).
// Prima di questo fix, checkAndClearCacheIfVersionChanged() chiamava localStorage
// direttamente, lanciando un ReferenceError intercettato silenziosamente dal try/catch
// esterno: l'intera funzione di sicurezza non ha mai eseguito il suo compito.
const VERSION_META_CACHE_NAME = 'ancona-guida-version-meta';
const VERSION_META_KEY = new Request('https://internal.local/__app_version__');

async function getSavedVersion() {
    try {
        const cache = await caches.open(VERSION_META_CACHE_NAME);
        const match = await cache.match(VERSION_META_KEY);
        if (!match) return null;
        return await match.text();
    } catch (e) { return null; }
}

async function setSavedVersion(version) {
    try {
        const cache = await caches.open(VERSION_META_CACHE_NAME);
        await cache.put(VERSION_META_KEY, new Response(version));
    } catch (e) {}
}

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
    // Nota: data.js/engine.js NON vanno precaricati qui — sono gestiti dal branch dedicato
    // più sotto con cache-first-persistente, e vengono popolati al primo utilizzo reale.
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

// V6.0: trim leggero della cache persistente data.js/engine.js — evita accumulo indefinito
// di vecchie versioni (ogni versione diversa di ?v= è una entry distinta nella cache).
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

async function checkAndClearCacheIfVersionChanged() {
    try {
        // {cache:'no-store'} esplicito: non basta fare fetch() e sperare che il browser
        // vada in rete. Senza questa opzione, la cache HTTP del browser (un livello SOTTO
        // la Cache Storage API, invisibile qui) può restituire una index.html non aggiornata
        // se il server invia header di cache standard — vanificando il controllo "fresco"
        // che questa funzione dovrebbe fare.
        const response = await fetch('./index.html', { cache: 'no-store' });
        const html = await response.text();

        // Estrai version dal meta tag usando regex
        const versionMatch = html.match(/meta name="version" content="([^"]+)"/);
        const newVersion = versionMatch ? versionMatch[1] : null;
        const savedVersion = await getSavedVersion();

        if (newVersion && newVersion !== savedVersion) {
            // Versione diversa — svuota tutti i cache, INCLUSA APP_FILES_CACHE_NAME.
            // Questo è il paracadute per il caso "ho dimenticato di alzare ?v= in
            // index.html": anche se la query string non cambia, un meta version diverso
            // forza comunque lo svuotamento della cache persistente di data.js/engine.js.
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames
                .filter(name => name !== VERSION_META_CACHE_NAME)
                .map(name => caches.delete(name)));
            await setSavedVersion(newVersion);
            console.log('Cache cleared: version changed from', savedVersion, 'to', newVersion);
            // Notifica i client
            self.clients.matchAll().then(clients => {
                clients.forEach(client => client.postMessage({ type: 'VERSION_UPDATED' }));
            });
        } else if (newVersion) {
            await setSavedVersion(newVersion);
        }
    } catch (error) {
        console.error('Cache version check failed:', error);
    }
}

self.addEventListener('activate', (event) => {
    event.waitUntil(
        checkAndClearCacheIfVersionChanged().then(() => {
            return caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        // V6.0: APP_FILES_CACHE_NAME aggiunta alla whitelist — è l'unica cache
                        // che deve sopravvivere anche quando CACHE_NAME cambia ad ogni release.
                        // VERSION_META_CACHE_NAME idem: deve persistere per poter fare il confronto
                        // di versione al prossimo 'activate'.
                        if (cacheName !== CACHE_NAME && cacheName !== TILES_CACHE_NAME && cacheName !== APP_FILES_CACHE_NAME && cacheName !== VERSION_META_CACHE_NAME) {
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

    // HTML: Network-First — prova sempre la rete, fallback alla cache solo se offline.
    // Garantisce che l'utente veda sempre la versione aggiornata quando è connesso.
    // FIX 22/08/26: {cache:'no-store'} esplicito. Senza questa opzione, fetch() da solo
    // NON garantisce di raggiungere davvero la rete: la cache HTTP del browser (livello
    // sotto la Cache Storage API, invisibile qui) può intercettare la richiesta e restituire
    // una index.html non aggiornata se il server invia header di cache standard — la
    // strategia "network-first" resterebbe network-first solo sulla carta.
    if (url.pathname.endsWith('/') || url.pathname.endsWith('.html') || url.pathname === './') {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).then((networkResponse) => {
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

    // V6.0: data.js / engine.js — cache-first in una cache dedicata e persistente
    // (non svuotata ad ogni release). La query string "?v=" nell'URL fa da chiave di
    // versione: cambiando ?v= in index.html si ottiene automaticamente un cache-miss e
    // il file viene riscaricato, mentre versioni invariate restano servite dalla cache
    // senza nuova richiesta di rete — è il punto centrale dell'intera ottimizzazione.
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
                    // Offline e mai cachato prima: non c'è un fallback sensato per questi file,
                    // l'app non può funzionare senza. 503 esplicito invece di un errore silenzioso.
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
                    // FIX #10 V4.2.1 27/06/26: restituisce 404 senza Content-Type
                    // invece di body vuoto con 'image/png', che causa errori di decodifica
                    // PNG in Leaflet. Con 404, Leaflet gestisce il tile mancante con il
                    // suo fallback nativo senza errori silenziosi nel canvas.
                    return new Response('', { status: 404 });
                });
            })
        );
        return;
    }

    // V6.10: cambiata da cache-first a network-first (stessa strategia già usata per l'HTML).
    // Prima, sostituire un file caricato su GitHub con lo stesso nome ma contenuto diverso
    // (es. una foto migliore al posto di una vecchia) non aggiornava mai l'app: l'URL restava
    // identico, quindi la cache-first continuava a servire la versione vecchia all'infinito.
    // Ora si prova sempre la rete per primo; la cache interviene solo come fallback se offline.
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
    // Riceve il CACHE_NAME da index.html — non serve più aggiornare sw.js ad ogni versione
    if (event.data && event.data.type === 'SET_CACHE_NAME' && event.data.cacheName) {
        CACHE_NAME = event.data.cacheName;
        TILES_CACHE_NAME = CACHE_NAME + '-tiles';
        // Nota: APP_FILES_CACHE_NAME NON viene derivata da CACHE_NAME — resta fissa di proposito.
    }
});
