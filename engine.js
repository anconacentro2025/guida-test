// ===== V6.16 · 23/08/26 13:20 =====
// engine.js — Ancona Centro Guida Ospiti
// Contiene SOLO la logica (rendering, mappa, GPS, meteo, ecc). Richiede che data.js sia
// caricato PRIMA di questo file nello stesso documento (le const/let di data.js sono
// condivise come scope globale tra script classici caricati in sequenza).
// Versione motore: v7 — bump solo quando si modifica la logica in questo file, indipendente
// dalla versione generale della guida.
    const NO_GPS_SECTIONS = ['apartment', 'contact', 'usefulinfo'];
    const HOST_PHONE = '3356750269';
    const HOST_EMAIL = 'anconacentro@yahoo.com';
    const PHOTO_BASE = 'https://raw.githubusercontent.com/anconacentro2025/Guida-v-4.0/main/img/';
    // Unica fonte di verità per la versione cache.
    // Aggiornare solo questo valore ad ogni release — il SW lo riceve via postMessage,
    // non serve più modificare sw.js ad ogni versione.
    const APP_CACHE_NAME = 'ancona-guida-v6.16-23081320';
    const HOME_COORDS = { lat: 43.6181895, lng: 13.5129489 };
    const headerSubTr = { it: 'Guida Ospiti · Piazza Roma 3', en: 'Guest Guide · Piazza Roma 3', de: 'Gästeführer · Piazza Roma 3', pl: 'Przewodnik dla gości · Piazza Roma 3' };
    const ANCONA_LAT = 43.6181895, ANCONA_LNG = 13.5129489;
    let distSortActive = false;
    let homeStaticMap = null;
    let _countdownInterval = null; // FIX #5 V5.0 27/06/26: refresh countdown ogni minuto
    // FIX #A V5.0 27/06/26: dirty flag per evitare re-render identici in renderAll
    let _rf_lang = null, _rf_section = null, _rf_sub = null, _rf_detail = null, _rf_distSort = null;

    // === FULLSCREEN MAP VARIABLES ===
    let fullscreenMapInstance = null;
    let isFullscreenOpening = false; // Item 10: guard anti-double-open
    let fsStoredPlaces = [];
    let fsIsHome = false;
    let fsSubItineraryId = null;
    let fsListenersInitialized = false;
    let _fsCloseHandler = null; // FIX #4 V5.0 27/06/26: handler persistente per evitare accumulo listener

    // Item 1 V5.0: debounce utility – previene chiamate ravvicinate (es. resize)
    function debounce(fn, delay) { let timer; return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); }; }

    ;

;
    // V5.1: indice dopo cui inserire un separatore visibile nei pulsanti (nav pills e tile home)
    const NAV_DIVIDER_AFTER_INDEX = 3;

    ;

    let currentLang = 'it', currentSection = -1, currentPlaceDetail = -1, currentSectionPlaces = [], leafletMap = null, currentSubItinerary = null;
    let placeDataMap = {}, _mapRetryCount = 0;
    let gpsConsentGiven = null, deferredPrompt = null;
    // V5.11: gpsState/fsGpsState (definiti sopra, vicino alle funzioni GPS) sostituiscono
    // le otto variabili separate gpsWatchId/gpsMarker/gpsCircle/gpsBoxCollapsed +
    // fsGpsWatchId/fsGpsMarker/fsGpsCircle/fsGpsBoxCollapsed.
    try { gpsConsentGiven = sessionStorage.getItem('gpsConsent'); } catch(e) {}
    try {
        const urlLang = new URLSearchParams(window.location.search).get('lang');
        const stored = localStorage.getItem('guida_lang');
        const valid = ['it','en','de','pl'];
        if (urlLang && valid.includes(urlLang)) currentLang = urlLang;
        else if (stored && valid.includes(stored)) currentLang = stored;
    } catch(e) {}


    function tr(it, en, de, pl) {
        const val = (currentLang === 'en') ? (en || it) : (currentLang === 'de') ? (de || en || it) : (currentLang === 'pl') ? (pl || en || it) : it;
        return val || '';
    }
    function setLang(lang) { currentLang=lang; document.documentElement.lang=lang; try{localStorage.setItem('guida_lang',lang);}catch(e){} document.querySelectorAll('.lang-btn').forEach(btn=>{ const isActive=btn.id==='btn-'+lang; btn.classList.toggle('active',isActive); btn.setAttribute('aria-checked',isActive?'true':'false'); }); if(leafletMap){leafletMap.remove();leafletMap=null;} if(homeStaticMap){homeStaticMap.remove();homeStaticMap=null;} _rf_lang=null; renderAll(); }
    document.querySelectorAll('.lang-btn').forEach(btn => { btn.addEventListener('click', function() { setLang(this.id.replace('btn-', '')); }); });

    // V5.9: controllo dimensione testo (accessibilità) — scala il font-size della root,
    // così tutte le dimensioni in rem del foglio di stile si adattano di conseguenza.
    const FONT_SCALE_MIN=0.85, FONT_SCALE_MAX=1.3, FONT_SCALE_STEP=0.1, FONT_SCALE_BASE_PX=16;
    let fontScale=1;
    try{ const storedScale=parseFloat(localStorage.getItem('guida_font_scale')); if(!isNaN(storedScale)) fontScale=Math.min(FONT_SCALE_MAX,Math.max(FONT_SCALE_MIN,storedScale)); }catch(e){}
    function applyFontScale(){ document.documentElement.style.fontSize=(FONT_SCALE_BASE_PX*fontScale)+'px'; }
    function setFontScale(newScale){ fontScale=Math.min(FONT_SCALE_MAX,Math.max(FONT_SCALE_MIN,+newScale.toFixed(2))); try{localStorage.setItem('guida_font_scale',fontScale);}catch(e){} applyFontScale(); }
    document.getElementById('font-decrease')?.addEventListener('click', ()=>setFontScale(fontScale-FONT_SCALE_STEP));
    document.getElementById('font-increase')?.addEventListener('click', ()=>setFontScale(fontScale+FONT_SCALE_STEP));
    document.getElementById('font-reset')?.addEventListener('click', ()=>setFontScale(1));
    applyFontScale();

    // Item 4 V5.0: controllo query undefined/null prima di encodeURIComponent
    function getMapLink(query, noSuffix) { if (!query || typeof query !== 'string') return '#'; const q = noSuffix ? query : query + ', Ancona Italia'; return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
    function getImgSearchUrl(p) { const q = p.imgQuery || (p.name + ' Ancona'); return 'https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q); }

    // Item 2 V5.0: versione semplificata — solo testo orario statico, rimuove badge colorato
    // FIX 23/08/26: closedOn (giorno/i della settimana di chiusura, 0=domenica...6=sabato,
    // stessa convenzione di Date.getDay()) era presente su 22 locali in data.js ma mai
    // letto da nessuna funzione — il dato esisteva ma non veniva mai mostrato all'ospite.
    function getHoursBadge(p) {
        if (!p.hours) return '';
        let closedTodayHtml = '';
        if (Array.isArray(p.closedOn) && p.closedOn.length && p.closedOn.includes(new Date().getDay())) {
            closedTodayHtml = '<div class="hours-badge closed">⚠️ ' + tr('Chiuso oggi', 'Closed today', 'Heute geschlossen', 'Dziś zamknięte') + '</div>';
        }
        return closedTodayHtml + '<div class="hours-text">🕐 ' + p.hours + '</div>';
    }

    // Item 3 V5.0: aggiunta validazione regex formato data; no timezone hardcoded (usa locale browser)
    function getCountdownHtml() {
        try {
            const co = new URLSearchParams(window.location.search).get('checkout');
            if (!co || !/^\d{4}-\d{2}-\d{2}$/.test(co)) return '';
            const target = new Date(co + 'T11:00:00');
            if (isNaN(target.getTime())) return '';
            const now = new Date();
            const diff = target - now;
            if (diff <= 0 || diff > 30*24*3600*1000) return '';
            const d = Math.floor(diff/86400000);
            const h = Math.floor((diff%86400000)/3600000);
            const m = Math.floor((diff%3600000)/60000);
            // Data leggibile localizzata
            const months_it=['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
            const months_en=['January','February','March','April','May','June','July','August','September','October','November','December'];
            const months_de=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
            const months_pl=['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
            const day=target.getDate();
            const mi=target.getMonth();
            const dateStr=tr(day+' '+months_it[mi], day+' '+months_en[mi], day+'. '+months_de[mi], day+' '+months_pl[mi]);
            // Stringa tempo mancante
            const timeStr = d > 0 ? d+'g '+h+'h' : h > 0 ? h+'h '+m+'m' : m+' min';
            const labelLeft = tr('Check-out entro le 11:00','Check-out by 11:00','Check-out bis 11:00 Uhr','Wymeldowanie do 11:00');
            const labelCenter = tr('Mancano','Remaining','Noch','Pozostało');
            return '<div class="checkout-countdown">'
                +'<div class="countdown-left">'
                +'<div class="countdown-left-label">'+labelLeft+'</div>'
                +'<div class="countdown-left-date">'+dateStr+'</div>'
                +'</div>'
                +'<div class="countdown-center">'
                +'<div class="countdown-center-label">'+labelCenter+'</div>'
                +'<div class="countdown-center-value">'+timeStr+'</div>'
                +'</div>'
                +'</div>';
        } catch(e) { return ''; }
    }

    function photoFallback(wrapId) { const el = document.getElementById(wrapId); const p = placeDataMap[wrapId]; if (el && p) el.innerHTML = '<a href="'+getImgSearchUrl(p)+'" target="_blank" rel="noopener noreferrer" class="detail-photo-link" aria-label="Cerca foto di '+p.name+' su Google Immagini"><span class="placeholder-emoji" aria-hidden="true">🖼️</span><span class="placeholder-text">'+tr('Clicca per vedere le foto','Click to see photos','Klicken, um Fotos zu sehen','Kliknij, aby zobaczyć zdjęcia')+'</span></a>'; }

    // V6.12: lightbox riutilizzabile — richiamabile da un link inline nel testo (non solo
    // dalla scheda di un luogo) per mostrare 1-4 foto scorrevoli senza uscire dall'app.
    // Il parametro photosCsv è una stringa con i nomi file separati da virgola (più semplice
    // da incorporare in un attributo onclick rispetto a un array letterale con virgolette).
    function openLightbox(photosCsv){
        closeLightbox();
        const photos = photosCsv.split(',').map(f => f.trim());
        const linkGalleryIndex = 'link-' + Math.random().toString(36).substr(2,9);
        _detailGalleryData[linkGalleryIndex] = { photos: photos.slice(0,4), caption: '' };
        openDetailGalleryFullscreen(linkGalleryIndex);
    }
    function closeLightbox(){
        const overlay = document.querySelector('.lightbox-overlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
    }
    function calcDistance(lat1, lon1, lat2, lon2) { const R=6371; const dLat=(lat2-lat1)*Math.PI/180; const dLon=(lon2-lon1)*Math.PI/180; const a=Math.sin(dLat/2)*Math.sin(dLat/2)+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2); return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); }

    function openSubItinerary(subId) { currentSubItinerary=subId; currentPlaceDetail=-1; placeDataMap={}; if(leafletMap){leafletMap.remove();leafletMap=null;} renderAll(); window.scrollTo({top:0,behavior:'smooth'}); }
    function closeSubItinerary() { currentSubItinerary=null; currentPlaceDetail=-1; placeDataMap={}; if(leafletMap){leafletMap.remove();leafletMap=null;} renderAll(); window.scrollTo({top:0,behavior:'smooth'}); }

    function goTo(i) {
        // V5.11: il GPS non si spegne più automaticamente cambiando pagina — resta attivo
        // finché non è l'utente a premere "Spegni GPS". Marker/cerchio vanno comunque azzerati
        // perché legati all'istanza leafletMap che sta per essere distrutta: verranno ricreati
        // automaticamente sulla nuova mappa al prossimo aggiornamento di posizione.
        if(gpsState.marker&&leafletMap)leafletMap.removeLayer(gpsState.marker);
        if(gpsState.circle&&leafletMap)leafletMap.removeLayer(gpsState.circle);
        gpsState.marker=null;gpsState.circle=null;
        distSortActive=false;
        currentSection=i;currentPlaceDetail=-1;currentSubItinerary=null;placeDataMap={};
        if(leafletMap){leafletMap.remove();leafletMap=null;}
        try{const hash=i>=0&&sections[i]?'#'+sections[i].id:'';history.replaceState(null,'',hash||window.location.pathname);}catch(e){}
        renderAll();window.scrollTo({top:0,behavior:'smooth'});
    }


    // V6.12: auto-expands photos array based on naming convention (base.webp, base-2.webp, base-3.webp, base-4.webp)
    async function expandPhotosAsync(p) {
        if (!p.photos || !p.photos.length) return;
        const baseFile = p.photos[0];
        const baseName = baseFile.replace(/\.webp$/, '');
        const expandedPhotos = [baseFile];
        for (let i = 2; i <= 4; i++) {
            const filename = baseName + '-' + i + '.webp';
            const url = PHOTO_BASE + filename;
            try {
                const response = await fetch(url, { method: 'HEAD' });
                if (response.ok) expandedPhotos.push(filename);
            } catch (e) {}
        }
        p.photos = expandedPhotos.slice(0, 4);
    }

    async function selectPlaceDetail(i) {
        const items=currentSubItinerary?(appData.subItineraries[currentSubItinerary]||[]):currentSectionPlaces;
        const p=items[i];
        if(p&&p.isSubItinerary&&p.subId){openSubItinerary(p.subId);return;}
        if(p) await expandPhotosAsync(p);
        currentPlaceDetail=i;
        if(leafletMap){leafletMap.remove();leafletMap=null;}
        renderAll();window.scrollTo({top:0,behavior:'smooth'});
    }

    function backToMap(){currentPlaceDetail=-1;renderAll();window.scrollTo({top:0,behavior:'smooth'});}
    function panToHome(){if(leafletMap)leafletMap.setView([HOME_COORDS.lat,HOME_COORDS.lng],15);}

    function getDisplayNumber(p,index){
        if(currentSubItinerary)return String.fromCharCode(65+index);
        if(typeof p.order==='string'&&p.order.indexOf('bis')>-1)return p.order.replace('-bis','b');
        if(typeof p.order==='number')return p.order;
        return index+1;
    }

    function getTotalDisplay(items,total){
        if(!total||!items||!items.length)return 0;
        if(currentSubItinerary)return String.fromCharCode(64+total);
        const last=items[total-1];
        if(last&&typeof last.order==='string'&&last.order.indexOf('bis')>-1)return last.order.replace('-bis','b');
        if(last&&typeof last.order==='number')return last.order;
        return total;
    }

    function sortMustSee(a,b){function toNum(val){if(typeof val==='string'&&val.indexOf('bis')>-1)return parseFloat(val.split('-')[0])+.5;return Number(val);}return toNum(a.order)-toNum(b.order);}

    window._reachTexts={};
    window._activeReachTab='auto';
    window._toggleReach=function(type){
        window._activeReachTab=type;
        const contentEl=document.getElementById('reach-content');
        if(contentEl)contentEl.innerHTML=window._reachTexts[type]||'';
        document.querySelectorAll('.reach-sub-btn').forEach(b=>{
            const isActive=b.dataset.reach===type;
            b.classList.toggle('active',isActive);
        });
    };

    // V5.11: GPS unificato — un'unica implementazione parametrizzata su uno "state object",
    // invece di due copie quasi identiche (sezione + fullscreen). Elimina il rischio di
    // applicare un fix a una sola delle due copie (successo più volte nella cronologia FIX #1-#5).
    function createGpsState(containerSelector, getMapFn){ return { watchId:null, marker:null, circle:null, boxCollapsed:false, containerSelector:containerSelector, getMap:getMapFn }; }
    let gpsState = createGpsState('.gps-container', ()=>leafletMap);
    let fsGpsState = createGpsState('.fs-gps-container', ()=>fullscreenMapInstance);

    function updateGpsUIFor(state){
        const container=document.querySelector(state.containerSelector),box=container?container.querySelector('.gps-box'):null,overlay=container?container.querySelector('.gps-icon-overlay'):null;
        if(!container||!box||!overlay)return;
        const isSectionMap = (state===gpsState);
        if(isSectionMap){ if(currentPlaceDetail>=0||state.boxCollapsed)box.classList.add('collapsed');else box.classList.remove('collapsed'); }
        else { box.classList.toggle('collapsed', state.boxCollapsed); }
        overlay.classList.toggle('active', state.watchId!==null);
        const textEl=box.querySelector('.gps-text'),btnsEl=box.querySelector('.gps-buttons');
        if(textEl){
            if(state.watchId!==null)textEl.innerHTML='<strong>'+tr('GPS attivo','GPS active','GPS aktiv','GPS aktywny')+'</strong> – '+tr('La tua posizione viene aggiornata in tempo reale.','Your position is updating in real time.','Ihre Position wird in Echtzeit aktualisiert.','Twoja pozycja jest aktualizowana w czasie rzeczywistym.');
            else if(gpsConsentGiven===null)textEl.innerHTML = isSectionMap
                ? tr('🧭 <strong>Navigazione in tempo reale</strong><br>Attiva la geolocalizzazione per vedere la tua posizione sulla mappa e seguire l\'itinerario passo dopo passo.','🧭 <strong>Real-time navigation</strong><br>Enable geolocation to see your position on the map and follow the route step by step.','🧭 <strong>Echtzeit-Navigation</strong><br>Aktivieren Sie die Standortermittlung, um Ihre Position auf der Karte zu sehen und der Route Schritt für Schritt zu folgen.','🧭 <strong>Nawigacja w czasie rzeczywistym</strong><br>Włącz geolokalizację, aby zobaczyć swoją pozycję na mapie i podążać trasą krok po kroku.')
                : tr('🧭 <strong>Navigazione in tempo reale</strong><br>Attiva la geolocalizzazione per vedere la tua posizione sulla mappa.','🧭 <strong>Real-time navigation</strong><br>Enable geolocation to see your position on the map.','🧭 <strong>Echtzeit-Navigation</strong><br>Aktivieren Sie die Standortermittlung, um Ihre Position auf der Karte zu sehen.','🧭 <strong>Nawigacja w czasie rzeczywistym</strong><br>Włącz geolokalizację, aby zobaczyć swoją pozycję na mapie.');
            else textEl.innerHTML=tr('GPS non attivo. Clicca su "Riattiva" per attivarlo.','GPS not active. Click "Reactivate" to enable it.','GPS nicht aktiv. Klicken Sie auf "Reaktivieren", um ihn zu aktivieren.','GPS nieaktywny. Kliknij "Ponownie włącz", aby go włączyć.');
        }
        if(btnsEl){
            btnsEl.innerHTML='';
            if(state.watchId!==null){
                const stopBtn=document.createElement('button');stopBtn.className='btn-gps-toggle active';stopBtn.textContent='⏹ '+tr('Spegni GPS','Stop GPS','GPS ausschalten','Wyłącz GPS');stopBtn.addEventListener('click',function(e){e.stopPropagation();toggleGpsTracking(state);});btnsEl.appendChild(stopBtn);
            }else if(gpsConsentGiven===null){
                const acceptBtn=document.createElement('button');acceptBtn.className='btn-gps-accept';acceptBtn.textContent='✅ '+tr('Accetta','Accept','Akzeptieren','Akceptuj');acceptBtn.addEventListener('click',function(e){e.stopPropagation();gpsConsentGiven='true';try{sessionStorage.setItem('gpsConsent','true');}catch(ex){}toggleGpsTracking(state);});btnsEl.appendChild(acceptBtn);
                const denyBtn=document.createElement('button');denyBtn.className='btn-gps-deny';denyBtn.textContent='❌ '+tr('Nega','Deny','Ablehnen','Odrzuć');denyBtn.addEventListener('click',function(e){e.stopPropagation();gpsConsentGiven='false';try{sessionStorage.setItem('gpsConsent','false');}catch(ex){}state.boxCollapsed=true;updateGpsUIFor(state);});btnsEl.appendChild(denyBtn);
            }else{
                const reactivateBtn=document.createElement('button');reactivateBtn.className='btn-gps-accept';reactivateBtn.textContent='✅ '+tr('Riattiva GPS','Reactivate GPS','GPS reaktivieren','Ponownie włącz GPS');reactivateBtn.addEventListener('click',function(e){e.stopPropagation();toggleGpsTracking(state);});btnsEl.appendChild(reactivateBtn);
            }
        }
    }

    function toggleGpsBoxFor(state){ state.boxCollapsed=!state.boxCollapsed; updateGpsUIFor(state); }

    function toggleGpsTracking(state){
        if(state.watchId!==null){
            navigator.geolocation.clearWatch(state.watchId); state.watchId=null;
            const map=state.getMap();
            if(state.marker&&map){map.removeLayer(state.marker);state.marker=null;}
            if(state.circle&&map){map.removeLayer(state.circle);state.circle=null;}
            updateGpsUIFor(state); return;
        }
        if(!navigator.geolocation){
            const container=document.querySelector(state.containerSelector);
            const textEl=container?container.querySelector('.gps-text'):null, btnsEl=container?container.querySelector('.gps-buttons'):null;
            if(textEl)textEl.innerHTML='<strong>⚠️ '+tr('GPS non supportato','GPS not supported','GPS nicht unterstützt','GPS nieobsługiwany')+'</strong><br>'+tr('Il tuo dispositivo non supporta la geolocalizzazione.','Your device does not support geolocation.','Ihr Gerät unterstützt keine Geolokalisierung.','Twoje urządzenie nie obsługuje geolokalizacji.');
            if(btnsEl)btnsEl.innerHTML='';
            return;
        }
        // FIX #1 V5.0 27/06/26: throttle 4s per ridurre consumo batteria GPS
        let _lastGpsUpdate=0;
        state.watchId=navigator.geolocation.watchPosition((position)=>{
            const now=Date.now();
            if(now-_lastGpsUpdate<4000)return; // throttle: ignora aggiornamenti più veloci di 4s
            _lastGpsUpdate=now;
            const lat=position.coords.latitude,lng=position.coords.longitude,accuracy=position.coords.accuracy;
            const map=state.getMap();
            if(!map)return;
            if(state.marker)state.marker.setLatLng([lat,lng]);
            else{
                const gpsIcon=L.divIcon({html:'<div class="gps-blue-dot-wrap"><div class="gps-blue-dot"></div><div class="gps-blue-dot-pulse"></div></div>',className:'',iconSize:[20,20],iconAnchor:[10,10]});
                state.marker=L.marker([lat,lng],{icon:gpsIcon,zIndexOffset:2000}).addTo(map);
            }
            if(state.circle){state.circle.setLatLng([lat,lng]);state.circle.setRadius(accuracy);}
            else state.circle=L.circle([lat,lng],{radius:accuracy,color:'#007aff',fillColor:'#007aff',fillOpacity:.15,weight:1}).addTo(map);
            updateGpsUIFor(state);
        },
        // Item 9 V5.0: messaggi GPS specifici per ogni codice di errore
        (error)=>{
            const container=document.querySelector(state.containerSelector);
            const textEl=container?container.querySelector('.gps-text'):null, btnsEl=container?container.querySelector('.gps-buttons'):null;
            let msg='';
            if(error.code===error.PERMISSION_DENIED){
                msg='<strong>🔒 '+tr('Accesso GPS negato','GPS access denied','GPS-Zugriff verweigert','Odmowa dostępu GPS')+'</strong><br>'+tr('Abilita i permessi di localizzazione nelle impostazioni del browser.','Enable location permissions in your browser settings.','Aktivieren Sie die Standortberechtigungen in den Browser-Einstellungen.','Włącz uprawnienia lokalizacji w ustawieniach przeglądarki.');
                if(state.watchId!==null){navigator.geolocation.clearWatch(state.watchId);state.watchId=null;}
            }else if(error.code===error.POSITION_UNAVAILABLE){
                msg='<strong>📡 '+tr('Posizione non disponibile','Position unavailable','Position nicht verfügbar','Pozycja niedostępna')+'</strong><br>'+tr('Impossibile determinare la posizione. Riprova in un\'area con segnale migliore.','Cannot determine position. Try again in an area with better signal.','Position kann nicht ermittelt werden. Versuchen Sie es in einem Bereich mit besserem Signal.','Nie można określić pozycji. Spróbuj ponownie w miejscu z lepszym sygnałem.');
            }else if(error.code===error.TIMEOUT){
                msg='<strong>⏱ '+tr('GPS: timeout','GPS timeout','GPS-Zeitüberschreitung','Limit czasu GPS')+'</strong><br>'+tr('La richiesta di posizione ha impiegato troppo. Riprova.','Location request timed out. Please try again.','Standortanfrage hat zu lange gedauert. Bitte erneut versuchen.','Przekroczono czas żądania lokalizacji. Spróbuj ponownie.');
            }
            if(textEl&&msg)textEl.innerHTML=msg;
            if(btnsEl&&error.code===error.PERMISSION_DENIED)btnsEl.innerHTML='';
        },{enableHighAccuracy:true,timeout:10000,maximumAge:5000});
        updateGpsUIFor(state);
    }

    // === FULLSCREEN MAP FUNCTIONS ===
    function openFullscreenMap() {
        // Item 10 V5.0: guard anti-double-open
        if (isFullscreenOpening) return;
        const overlay = document.getElementById('map-fullscreen-overlay');
        if (!overlay) return;
        if (overlay.classList.contains('active')) return;
        isFullscreenOpening = true;
        
        fsIsHome = (currentSection === -1);
        fsSubItineraryId = currentSubItinerary || null;
        
        if (fsIsHome) {
            fsStoredPlaces = [];
        } else {
            const places = currentSectionPlaces || [];
            fsStoredPlaces = places
                .filter(p => p && p.lat && p.lng)
                .map(p => {
                    const copy = { ...p };
                    copy._originalIndex = places.indexOf(p);
                    return copy;
                });
        }
        
        const titleEl = document.getElementById('map-fs-title');
        if (titleEl) {
            if (fsIsHome) {
                titleEl.textContent = '🗺️ Ancona Centro';
            } else if (fsSubItineraryId) {
                const parent = appData.mustsee.find(m => m.subId === fsSubItineraryId);
                titleEl.textContent = '🗺️ ' + (parent ? parent.name : 'Percorso');
            } else if (currentSection >= 0 && sections[currentSection]) {
                const s = sections[currentSection];
                titleEl.textContent = '🗺️ ' + tr(s.it, s.en, s.de, s.pl);
            } else {
                titleEl.textContent = '🗺️ Mappa';
            }
        }
        
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        isFullscreenOpening = false; // guard rilasciato dopo apertura effettiva

        // FIX #4 V5.0 27/06/26: handler persistente — removeEventListener funziona solo se
        // si rimuove la stessa istanza di funzione. La versione precedente creava _handler
        // come nuova funzione ad ogni apertura, rendendo il removeEventListener un no-op
        // e accumulando N listener touchend/click dopo N aperture del fullscreen.
        const closeBtn = document.getElementById('map-fs-close');
        if (closeBtn) {
            if (_fsCloseHandler) {
                closeBtn.removeEventListener('touchend', _fsCloseHandler);
                closeBtn.removeEventListener('click', _fsCloseHandler);
            }
            _fsCloseHandler = function(e) {
                e.preventDefault();
                e.stopPropagation();
                closeFullscreenMap();
            };
            closeBtn.addEventListener('touchend', _fsCloseHandler, { passive: false });
            closeBtn.addEventListener('click', _fsCloseHandler);
        }

        requestAnimationFrame(() => {
            initFullscreenMap();
        });
    }

    function closeFullscreenMap() {
        const overlay = document.getElementById('map-fullscreen-overlay');
        if (!overlay) return;
        if (!overlay.classList.contains('active')) return; // Item 6/10: no-op se già chiusa
        
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        
        // V5.11: il GPS fullscreen non si spegne più alla chiusura — stesso principio della
        // mappa di sezione, resta attivo finché non è l'utente a spegnerlo esplicitamente.
        fsGpsState.marker = null; fsGpsState.circle = null;
        
        if (fullscreenMapInstance) {
            if (fullscreenMapInstance._resizeHandler) {
                window.removeEventListener('resize', fullscreenMapInstance._resizeHandler);
            }
            fullscreenMapInstance.remove();
            fullscreenMapInstance = null;
        }
        fsStoredPlaces = [];
        fsIsHome = false;
        fsSubItineraryId = null;
    }

    function initFullscreenMap() {
        // Item 6 V5.0: check overlay attivo prima di inizializzare
        const overlay = document.getElementById('map-fullscreen-overlay');
        if (!overlay || !overlay.classList.contains('active')) return;

        const el = document.getElementById('fullscreenMap');
        if (!el) return;
        
        if (typeof L === 'undefined') {
            setTimeout(initFullscreenMap, 300);
            return;
        }
        
        if (fullscreenMapInstance) {
            if (fullscreenMapInstance._resizeHandler) {
                window.removeEventListener('resize', fullscreenMapInstance._resizeHandler);
            }
            fullscreenMapInstance.remove();
            fullscreenMapInstance = null;
        }
        
        fullscreenMapInstance = L.map('fullscreenMap', {
            zoomControl: true,
            attributionControl: true
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(fullscreenMapInstance);
        
        const bounds = [];
        const places = fsStoredPlaces || [];
        const isSub = !!fsSubItineraryId;
        
        places.forEach((p, idx) => {
            if (!p.lat || !p.lng) return;
            
            let displayNum;
            if (isSub) {
                displayNum = String.fromCharCode(65 + idx);
            } else if (typeof p.order === 'number') {
                displayNum = p.order;
            } else if (typeof p.order === 'string' && p.order.indexOf('bis') > -1) {
                displayNum = p.order.replace('-bis', 'b');
            } else {
                displayNum = idx + 1;
            }
            
            let markerClass = 'map-marker-num';
            if (isSub && (fsSubItineraryId === 'cardeto' || fsSubItineraryId === 'cittadella')) {
                markerClass += ' ' + fsSubItineraryId;
            }
            if (p.isSubItinerary) markerClass += ' has-sub';
            
            const icon = L.divIcon({
                html: '<div class="' + markerClass + '" aria-label="' + p.name + '" role="img">' + displayNum + '</div>',
                className: '',
                iconSize: [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -14]
            });
            
            const m = L.marker([p.lat, p.lng], { icon: icon }).addTo(fullscreenMapInstance);
            m.bindPopup('<b style="font-size:.78rem">' + p.emoji + ' ' + p.name + '</b><br><span style="font-size:.68rem;color:#888">' + (p.dist || '') + '</span>');
            
            m.on('click', function() {
                const originalIndex = p._originalIndex !== undefined ? p._originalIndex : idx;
                closeFullscreenMap();
                if (originalIndex >= 0 && typeof selectPlaceDetail === 'function') {
                    setTimeout(() => { selectPlaceDetail(originalIndex); }, 400);
                }
            });
            bounds.push([p.lat, p.lng]);
        });
        
        const starIcon = L.divIcon({
            html: '<div class="map-marker-star" aria-label="Ancona Centro" role="img">★</div>',
            className: '',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -16]
        });
        L.marker([HOME_COORDS.lat, HOME_COORDS.lng], { icon: starIcon, zIndexOffset: 1000 })
            .addTo(fullscreenMapInstance)
            .bindPopup('<b style="font-size:.78rem">★ Ancona Centro</b><br><span style="font-size:.68rem;color:#888">📍 Piazza Roma 3</span>');
        bounds.push([HOME_COORDS.lat, HOME_COORDS.lng]);
        
        if (bounds.length > 1) {
            fullscreenMapInstance.fitBounds(bounds, { padding: [30, 30] });
        } else {
            fullscreenMapInstance.setView([HOME_COORDS.lat, HOME_COORDS.lng], 15);
        }
        
        // V5.0 12/07/26: geolocalizzazione live sulla mappa fullscreen (home + itinerari),
        // stessa logica/UI (box con Accetta/Nega/Riattiva) delle mappe di sezione.
        fsGpsState.marker = null; fsGpsState.circle = null;
        updateGpsUIFor(fsGpsState);
        
        setTimeout(() => { if (fullscreenMapInstance) fullscreenMapInstance.invalidateSize(); }, 500);
        
        // Item 6 V5.0: debounce sul resize handler per evitare chiamate eccessive
        const resizeHandler = debounce(function() {
            if (fullscreenMapInstance) fullscreenMapInstance.invalidateSize();
        }, 150);
        window.addEventListener('resize', resizeHandler);
        fullscreenMapInstance._resizeHandler = resizeHandler;
    }

    function initFullscreenListeners() {
        if (fsListenersInitialized) return;
        fsListenersInitialized = true;
        // Nota: il listener del close button è agganciato in openFullscreenMap
        // ad ogni apertura con touchend+click espliciti per compatibilità iOS
        
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('map-fullscreen-overlay');
                if (overlay && overlay.classList.contains('active')) {
                    closeFullscreenMap();
                }
            }
        });
        
        const overlay = document.getElementById('map-fullscreen-overlay');
        if (overlay) {
            overlay.addEventListener('click', function(e) {
                if (e.target === this) closeFullscreenMap();
            });
        }

        // V5.0 12/07/26: pin per espandere/collassare il box GPS della mappa fullscreen
        document.getElementById('fs-gps-overlay-icon')?.addEventListener('click', function(){ toggleGpsBoxFor(fsGpsState); });
    }

    // FIX #5 V5.0 27/06/26: aggiorna il countdown ogni minuto senza re-render completo
    function startCountdownRefresh() {
        clearInterval(_countdownInterval);
        _countdownInterval = setInterval(function() {
            if (currentSection !== -1) { clearInterval(_countdownInterval); return; }
            const el = document.querySelector('.checkout-countdown');
            if (!el) { clearInterval(_countdownInterval); return; }
            const newHtml = getCountdownHtml();
            if (newHtml) {
                // FIX B1 V5.0 30/06/26: el.outerHTML = temp.innerHTML iniettava il contenuto
                // del wrapper temporaneo grezzo invece di sostituire il nodo. replaceWith(newEl)
                // sostituisce correttamente l'elemento mantenendo la struttura DOM intatta.
                const temp = document.createElement('div');
                temp.innerHTML = newHtml;
                const newEl = temp.firstElementChild;
                if (newEl) el.replaceWith(newEl);
            } else {
                el.remove();
                clearInterval(_countdownInterval);
            }
        }, 60000);
    }

    function renderAll(){
        // FIX #A V5.0 27/06/26: skip re-render se nessuno stato rilevante è cambiato
        const _same = (_rf_lang===currentLang && _rf_section===currentSection && _rf_sub===currentSubItinerary && _rf_detail===currentPlaceDetail && _rf_distSort===distSortActive);
        if(_same) return;
        _rf_lang=currentLang; _rf_section=currentSection; _rf_sub=currentSubItinerary; _rf_detail=currentPlaceDetail; _rf_distSort=distSortActive;

        document.getElementById('header-sub').textContent=tr(headerSubTr.it,headerSubTr.en,headerSubTr.de,headerSubTr.pl);
        document.documentElement.lang=currentLang;
        const hero=document.getElementById('hero'),nav=document.getElementById('nav'),cont=document.getElementById('content');
        // FIX #5 V5.0 27/06/26: ferma il countdown refresh quando non si è più in home
        if(currentSection!==-1) clearInterval(_countdownInterval);
        if(currentSection===-1&&leafletMap){if(gpsState.marker)leafletMap.removeLayer(gpsState.marker);if(gpsState.circle)leafletMap.removeLayer(gpsState.circle);gpsState.marker=null;gpsState.circle=null;leafletMap.remove();leafletMap=null;}
        hero.classList.toggle('section-mode',currentSection!==-1);
        if(currentSection===-1){nav.style.display='none';renderHome();return;}
        nav.style.display='flex';
        nav.innerHTML=sections.map((s,i)=>(i===NAV_DIVIDER_AFTER_INDEX+1?'<span class="nav-pill-divider" aria-hidden="true"></span>':'')+'<button class="nav-pill'+(i===currentSection?' active':'')+'" data-index="'+i+'" role="tab" aria-selected="'+(i===currentSection?'true':'false')+'">'+s.icon+' '+tr(s.it,s.en,s.de,s.pl)+'</button>').join('');
        nav.querySelectorAll('.nav-pill').forEach(btn=>btn.addEventListener('click',function(){
            // U2 V5.0 01/07/26: feedback immediato al click — riduce opacità del contenuto
            // corrente prima che renderAll scriva nel DOM, eliminando la latenza percepita
            const cont=document.getElementById('content');
            if(cont)cont.style.opacity='0.4';
            requestAnimationFrame(function(){goTo(parseInt(btn.dataset.index));if(cont)cont.style.opacity='';});
        }));
        const s=sections[currentSection],body=renderSection(s.id);
        cont.innerHTML='<section class="section active"><div class="section-header"><div class="section-header-inner"><div class="section-icon" aria-hidden="true">'+s.icon+'</div><div><div class="section-title">'+tr(s.it,s.en,s.de,s.pl)+'</div></div></div></div><div class="cards">'+body+'<div class="goto-home"><button class="home-btn" id="home-btn">🏠 Home</button></div></div></section>';
        document.getElementById('home-btn')?.addEventListener('click',function(){goTo(-1);});
        document.getElementById('sub-back-btn')?.addEventListener('click',closeSubItinerary);
        attachDetailListeners();attachPlaceSectionListeners();attachReachListeners();
        if(currentPlaceDetail<0&&!NO_GPS_SECTIONS.includes(s.id)){
            const cardsEl=cont.querySelector('.cards'),gpsContainer=document.createElement('div');gpsContainer.className='gps-container';
            gpsContainer.innerHTML='<div class="gps-box"><div class="gps-row"><div class="gps-icon">🧭</div><div class="gps-text"></div><div class="gps-buttons"></div></div></div><div class="gps-icon-overlay" id="gps-overlay-icon">📍</div>';
            if(cardsEl)cardsEl.insertBefore(gpsContainer,cardsEl.firstChild);
            document.getElementById('gps-overlay-icon')?.addEventListener('click',function(){ toggleGpsBoxFor(gpsState); });
            updateGpsUIFor(gpsState);requestAnimationFrame(initSectionMap);
        } else if(currentPlaceDetail<0&&document.getElementById('sectionMap')){
            // Sezioni in NO_GPS_SECTIONS (es. Servizi) che comunque mostrano una mappa statica, senza box GPS
            requestAnimationFrame(initSectionMap);
        }
    }

    // I1 V5.0 30/06/26: meteo inline tramite Open-Meteo (gratuito, nessuna API key richiesta)
    // Mappa i WMO weather code (standard meteorologico usato da Open-Meteo) a emoji e testo IT/EN/DE/PL
    const WMO_CODE_MAP = {
        0:{emoji:'☀️',it:'Sereno',en:'Clear sky',de:'Klarer Himmel',pl:'Bezchmurnie'},
        1:{emoji:'🌤️',it:'Prevalentemente sereno',en:'Mainly clear',de:'Überwiegend klar',pl:'Przeważnie bezchmurnie'},
        2:{emoji:'⛅',it:'Parzialmente nuvoloso',en:'Partly cloudy',de:'Teilweise bewölkt',pl:'Częściowo pochmurno'},
        3:{emoji:'☁️',it:'Nuvoloso',en:'Overcast',de:'Bedeckt',pl:'Pochmurno'},
        45:{emoji:'🌫️',it:'Nebbia',en:'Fog',de:'Nebel',pl:'Mgła'},
        48:{emoji:'🌫️',it:'Nebbia con brina',en:'Depositing rime fog',de:'Reifnebel',pl:'Mgła z szadzią'},
        51:{emoji:'🌦️',it:'Pioviggine leggera',en:'Light drizzle',de:'Leichter Nieselregen',pl:'Lekka mżawka'},
        53:{emoji:'🌦️',it:'Pioviggine moderata',en:'Moderate drizzle',de:'Mäßiger Nieselregen',pl:'Umiarkowana mżawka'},
        55:{emoji:'🌧️',it:'Pioviggine intensa',en:'Dense drizzle',de:'Starker Nieselregen',pl:'Intensywna mżawka'},
        61:{emoji:'🌦️',it:'Pioggia leggera',en:'Slight rain',de:'Leichter Regen',pl:'Lekki deszcz'},
        63:{emoji:'🌧️',it:'Pioggia moderata',en:'Moderate rain',de:'Mäßiger Regen',pl:'Umiarkowany deszcz'},
        65:{emoji:'🌧️',it:'Pioggia intensa',en:'Heavy rain',de:'Starker Regen',pl:'Intensywny deszcz'},
        71:{emoji:'🌨️',it:'Neve leggera',en:'Slight snow',de:'Leichter Schneefall',pl:'Lekki śnieg'},
        73:{emoji:'🌨️',it:'Neve moderata',en:'Moderate snow',de:'Mäßiger Schneefall',pl:'Umiarkowany śnieg'},
        75:{emoji:'❄️',it:'Neve intensa',en:'Heavy snow',de:'Starker Schneefall',pl:'Intensywny śnieg'},
        80:{emoji:'🌦️',it:'Rovesci leggeri',en:'Slight rain showers',de:'Leichte Regenschauer',pl:'Lekkie przelotne opady'},
        81:{emoji:'🌧️',it:'Rovesci moderati',en:'Moderate rain showers',de:'Mäßige Regenschauer',pl:'Umiarkowane przelotne opady'},
        82:{emoji:'⛈️',it:'Rovesci violenti',en:'Violent rain showers',de:'Heftige Regenschauer',pl:'Gwałtowne przelotne opady'},
        95:{emoji:'⛈️',it:'Temporale',en:'Thunderstorm',de:'Gewitter',pl:'Burza'},
        96:{emoji:'⛈️',it:'Temporale con grandine',en:'Thunderstorm with hail',de:'Gewitter mit Hagel',pl:'Burza z gradem'},
        99:{emoji:'⛈️',it:'Temporale forte con grandine',en:'Thunderstorm with heavy hail',de:'Schweres Gewitter mit Hagel',pl:'Silna burza z gradem'}
    };
    function wmoInfo(code){return WMO_CODE_MAP[code]||{emoji:'🌡️',it:'N/D',en:'N/A',de:'k.A.',pl:'b/d'};}

    // Fetch con cache in sessionStorage (30 minuti) per limitare le chiamate API
    async function fetchWeather(){
        const CACHE_KEY='guida_weather_cache_v1',CACHE_MS=30*60*1000;
        try{
            const cached=sessionStorage.getItem(CACHE_KEY);
            if(cached){
                const parsed=JSON.parse(cached);
                if(Date.now()-parsed.ts<CACHE_MS)return parsed.data;
            }
        }catch(e){}
        try{
            const url='https://api.open-meteo.com/v1/forecast?latitude='+HOME_COORDS.lat+'&longitude='+HOME_COORDS.lng+'&current=temperature_2m,weather_code&timezone=Europe%2FRome';
            const res=await fetch(url);
            if(!res.ok)return null;
            const json=await res.json();
            const data={temp:Math.round(json.current.temperature_2m),code:json.current.weather_code};
            try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),data:data}));}catch(e){}
            return data;
        }catch(e){return null;}
    }

    function meteoWidgetHtml(){
        return '<a href="https://www.meteoam.it/it/meteo-citta/ancona" target="_blank" rel="noopener noreferrer" class="meteo-widget" id="meteo-widget" style="display:none;text-decoration:none"><div class="meteo-left"><span class="meteo-icon" id="meteo-icon" aria-hidden="true">🌡️</span><div><div class="meteo-temp" id="meteo-temp">--°</div><div class="meteo-desc" id="meteo-desc">'+tr('Caricamento...','Loading...','Lädt...','Ładowanie...')+'</div></div></div><div class="meteo-right">Ancona<br>'+tr('ora','now','jetzt','teraz')+'</div></a>';
    }

    function loadMeteoWidget(){
        const widget=document.getElementById('meteo-widget');
        if(!widget)return;
        fetchWeather().then(data=>{
            const w=document.getElementById('meteo-widget');
            if(!w)return; // l'utente potrebbe aver navigato via nel frattempo
            if(!data){w.style.display='none';return;}
            const info=wmoInfo(data.code);
            document.getElementById('meteo-icon').textContent=info.emoji;
            document.getElementById('meteo-temp').textContent=data.temp+'°C';
            document.getElementById('meteo-desc').textContent=tr(info.it,info.en,info.de,info.pl);
            w.style.display='flex';
        });
    }

    // === Box Protezione Civile: allerte meteo ufficiali (dati DPC via allertameteo.app, API REST gratuita) ===
    const PC_ALERT_LEVELS = {
        1:{icon:'🟢', it:'Nessuna allerta attiva', en:'No active alert', de:'Keine aktive Warnung', pl:'Brak aktywnego alertu', cls:'level-1'},
        2:{icon:'🟡', it:'Allerta gialla', en:'Yellow alert', de:'Gelbe Warnstufe', pl:'Żółty alert', cls:'level-2'},
        3:{icon:'🟠', it:'Allerta arancione', en:'Orange alert', de:'Orangene Warnstufe', pl:'Pomarańczowy alert', cls:'level-3'},
        4:{icon:'🔴', it:'Allerta rossa', en:'Red alert', de:'Rote Warnstufe', pl:'Czerwony alert', cls:'level-4'}
    };
    function pcLevelInfo(l){return PC_ALERT_LEVELS[l]||PC_ALERT_LEVELS[1];}

    async function fetchCivilProtectionAlert(){
        const CACHE_KEY='guida_pc_alert_cache_v1',CACHE_MS=30*60*1000;
        try{
            const cached=sessionStorage.getItem(CACHE_KEY);
            if(cached){
                const parsed=JSON.parse(cached);
                if(Date.now()-parsed.ts<CACHE_MS)return parsed.data;
            }
        }catch(e){}
        try{
            const res=await fetch('https://allertameteo.app/api/alert/Ancona');
            if(!res.ok)return null;
            const json=await res.json();
            if(!json||!json.success||!json.data||!json.data.oggi||!json.data.oggi.allerta)return null;
            const data={livello:json.data.oggi.allerta.livello||1};
            try{sessionStorage.setItem(CACHE_KEY,JSON.stringify({ts:Date.now(),data:data}));}catch(e){}
            return data;
        }catch(e){return null;}
    }

    function civilProtectionWidgetHtml(){
        return '<a href="https://allertameteo.regione.marche.it/allerte-e-bollettini" target="_blank" rel="noopener noreferrer" class="pc-alert-widget level-1" id="pc-alert-widget" style="display:none"><div class="pc-alert-left"><span class="pc-alert-icon" id="pc-alert-icon" aria-hidden="true">🟢</span><div><div class="pc-alert-title" id="pc-alert-title">'+tr('Caricamento...','Loading...','Lädt...','Ładowanie...')+'</div><div class="pc-alert-desc">'+tr('Protezione Civile · Marche','Civil Protection · Marche','Zivilschutz · Marken','Ochrona Cywilna · Marchia')+'</div></div></div><div class="pc-alert-link">'+tr('Bollettino →','Bulletin →','Bericht →','Biuletyn →')+'</div></a>';
    }

    function loadCivilProtectionWidget(){
        const widget=document.getElementById('pc-alert-widget');
        if(!widget)return;
        fetchCivilProtectionAlert().then(data=>{
            const w=document.getElementById('pc-alert-widget');
            if(!w)return; // l'utente potrebbe aver navigato via nel frattempo
            if(!data){w.style.display='none';return;}
            const info=pcLevelInfo(data.livello);
            document.getElementById('pc-alert-icon').textContent=info.icon;
            document.getElementById('pc-alert-title').textContent=tr(info.it,info.en,info.de,info.pl);
            w.className='pc-alert-widget '+info.cls+(data.livello>=2?' flashing':'');
            w.style.display='flex';
        });
    }

    function renderHome(){
        const cont=document.getElementById('content'),hostImgSrc='https://raw.githubusercontent.com/anconacentro2025/Guida-v-4.0/main/img/host.jpg';
        const tiles=sections.map((s,i)=>(i===NAV_DIVIDER_AFTER_INDEX+1?'<div class="nav-tile-divider" aria-hidden="true"></div>':'')+'<button class="nav-tile" data-index="'+i+'" aria-label="'+tr(s.it,s.en,s.de,s.pl)+'"><div class="nav-tile-icon" aria-hidden="true">'+s.icon+'</div><div class="nav-tile-label">'+tr(s.it,s.en,s.de,s.pl)+'</div></button>').join('');
        const installBtnHtml='<button id="install-btn" class="install-btn" style="display:none">📲 '+tr('Aggiungi alla schermata Home','Add to Home Screen','Zum Startbildschirm hinzufügen','Dodaj do ekranu głównego')+'</button>';
        const whatsappBtnHtml='<a href="https://wa.me/39'+HOST_PHONE+'" target="_blank" rel="noopener noreferrer" class="home-whatsapp-btn" aria-label="Contatta l\'host su WhatsApp">💬 '+tr('Live Chat','Live Chat','Live-Chat','Czat na żywo')+'</a>';
        const countdownHtml=getCountdownHtml();
        const meteoHtml=meteoWidgetHtml();
        const pcAlertHtml=civilProtectionWidgetHtml();
        const socialInfoHtml='<div style="padding:6px 16px 0;font-size:.75rem;color:var(--muted);text-align:center">'+tr('Informazioni e aggiornamenti continui sui profili social','Constant information and updates on social profiles','Ständige Informationen und Updates auf den Social-Media-Profilen','Stałe informacje i aktualizacje na profilach społecznościowych')+'</div>';
        // V5.5: banner Ancona Capitale Italiana della Cultura 2028 (dossier "Ancona. Questo adesso", ancona2028.it)
        const cultura2028Html='<a href="https://ancona2028.it/" target="_blank" rel="noopener noreferrer" class="cultura2028-banner"><span class="cultura2028-emoji" aria-hidden="true">🎭</span><div><div class="cultura2028-title">Ancona 2028</div><div class="cultura2028-sub">'+tr('Capitale Italiana della Cultura','Italian Capital of Culture','Italienische Kulturhauptstadt','Włoska Stolica Kultury')+'</div></div><span class="cultura2028-arrow" aria-hidden="true">→</span></a>';
        const html='<section class="section active"><div class="home-welcome"><div class="home-welcome-left"><img src="'+hostImgSrc+'" alt="Foto dell\'host" class="host-photo" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\';"><div class="host-photo-placeholder" style="display:none">👋</div></div><div class="home-welcome-right"><div class="home-welcome-title">'+tr('Benvenuti!','Welcome!','Willkommen!','Witamy!')+'</div><div class="home-welcome-sub">'+tr('Siete in Piazza Roma, nel cuore pedonale di Ancona, a pochi passi dal porto e dai principali monumenti della città. Questa guida vi accompagnerà durante tutto il soggiorno, con itinerari, luoghi da scoprire, indirizzi selezionati e informazioni utili, raccolti e consigliati personalmente dall\'host.','You are in Piazza Roma, in the heart of Ancona\'s pedestrian centre, just steps from the port and the city\'s main monuments. This guide will accompany you throughout your stay, with itineraries, places to discover, selected addresses and useful information, personally collected and recommended by your host.','Sie sind auf der Piazza Roma, im Herzen von Anconas Fußgängerzone, nur wenige Schritte vom Hafen und den wichtigsten Denkmälern der Stadt entfernt. Dieser Leitfaden begleitet Sie während Ihres gesamten Aufenthalts mit Routen, Orten zum Entdecken, ausgewählten Adressen und nützlichen Informationen, die persönlich von Ihrem Gastgeber zusammengestellt und empfohlen wurden.','Jesteście na Piazza Roma, w sercu pieszej strefy Ankony, zaledwie kilka kroków od portu i głównych zabytków miasta. Ten przewodnik będzie Wam towarzyszyć przez cały pobyt, z trasami, miejscami do odkrycia, wybranymi adresami i przydatnymi informacjami, osobiście zebranymi i rekomendowanymi przez gospodarza.')+'</div></div>'+whatsappBtnHtml+'</div>'+socialInfoHtml+installBtnHtml+countdownHtml+'<div class="widgets-row">'+meteoHtml+pcAlertHtml+'</div>'+cultura2028Html+'<div class="nav-grid">'+tiles+'</div>'+'</section>';
        cont.innerHTML=html;
        // FIX #5 V5.0 27/06/26: avvia refresh countdown se presente
        if(countdownHtml) startCountdownRefresh(); else clearInterval(_countdownInterval);
        // I1 V5.0 30/06/26: carica il meteo in modo asincrono dopo il render
        loadMeteoWidget();
        loadCivilProtectionWidget();

        document.querySelectorAll('.nav-tile').forEach(btn=>btn.addEventListener('click',function(){goTo(parseInt(this.dataset.index));}));
        const installBtn=document.getElementById('install-btn');
        if(installBtn){installBtn.addEventListener('click',async()=>{if(deferredPrompt){deferredPrompt.prompt();const{outcome}=await deferredPrompt.userChoice;deferredPrompt=null;installBtn.style.display='none';}});if(deferredPrompt)installBtn.style.display='inline-flex';else if(window.matchMedia('(display-mode:standalone)').matches)installBtn.style.display='none';}
    }

    function renderSection(id){
        if(id==='contact')return renderContact();
        if(id==='apartment')return renderApartment();
        if(id==='restaurants')return renderRestaurants();
        if(id==='services')return renderServices();
        if(id==='usefulinfo')return renderUsefulInfo();
        if(id==='conero')return renderConero();
        if(id==='portonovo')return renderPortonovo();
        const map={
            mustsee:()=>{if(currentSubItinerary)return appData.subItineraries[currentSubItinerary]||[];return appData.mustsee.slice().sort(sortMustSee);},
            passetto:()=>appData.passetto||[],
            cardeto:()=>appData.cardeto||[],
            porto:()=>appData.porto||[],
            beaches:()=>appData.beaches,
            portonovo:()=>appData.portonovo||{intro:{it:'',en:'',de:'',pl:''},points:[]},
            borghi:()=>appData.borghi||[]
        };
        if(map[id])return renderPlaceSection(map[id](),id);
        console.warn('Sezione non trovata:',id);return'';
    }

    function starBtnHtml(){
        // U3 V5.0 01/07/26: usa sempre la distanza fissa da HOME_COORDS per decidere se
        // mostrare il tasto ★, non _dist che viene ricalcolato dal GPS quando distSortActive=true.
        // Senza questo fix il tasto spariva se l'utente era fuori Ancona con distSort attivo,
        // proprio quando il tasto "centra su Ancona" sarebbe stato più utile.
        if(currentSectionPlaces&&currentSectionPlaces.length>0){
            let minDistHome=Infinity;
            for(let i=0;i<currentSectionPlaces.length;i++){
                const p=currentSectionPlaces[i];
                if(p.lat&&p.lng){
                    const d=calcDistance(HOME_COORDS.lat,HOME_COORDS.lng,p.lat,p.lng);
                    if(d<minDistHome)minDistHome=d;
                }
            }
            if(minDistHome>30)return'';
        }
        return '<button class="star-list-btn" id="star-home-btn" aria-label="Centra la mappa su Ancona Centro">★ Ancona Centro</button>';
    }

    function renderPlaceSection(items,sectionId){
        currentSectionPlaces=items;
        for(let i=0;i<items.length;i++){const p=items[i];p._dist=(p.lat&&p.lng)?calcDistance(HOME_COORDS.lat,HOME_COORDS.lng,p.lat,p.lng):Infinity;}
        const parkingInfoBox=(sectionId==='parking')?'<div class="card" style="margin-top:8px"><div class="card-header"><span class="card-header-icon">🅿️</span><span class="card-title">'+tr('Strisce blu (zona centro)','Blue bays (city centre)','Blaue Parkbuchten (Zentrum)','Niebieskie pasy (centrum)')+'</span></div><div class="card-body">'+tr('Parcheggio a pagamento su strada, posto difficile.','Paid street parking, difficult to find a spot.','Gebührenpflichtige Straßenparkplätze, schwer zu finden.','Płatny parking uliczny, trudno znaleźć miejsce.')+'</div></div>':'';
        const beachTipBox=(sectionId==='beaches')?'<div class="card" style="margin-top:8px;border-left:3px solid var(--gold)"><div class="card-header"><span class="card-header-icon">👡</span><span class="card-title">'+tr('Consiglio dell\'host','Host tip','Tipp des Gastgebers','Porada gospodarza')+'</span></div><div class="card-body"><div style="font-weight:600;color:var(--navy);margin-bottom:4px">'+tr('Scarpe da scoglio','Water shoes','Badeschuhe','Buty do wody')+'</div>'+tr('A parte la spiaggia di Palombina, le spiagge del Conero hanno generalmente fondali e accessi con sassi o scogli. È quindi consigliabile portare con sé un paio di scarpe da scoglio, utili per camminare più comodamente e in sicurezza sia sulla riva sia in acqua.','Except for Palombina beach, the Conero beaches generally have pebbly or rocky seabeds and access points. It\'s therefore advisable to bring a pair of water shoes, useful for walking more comfortably and safely both on the shore and in the water.','Abgesehen vom Strand von Palombina haben die Strände des Conero im Allgemeinen steinige oder felsige Böden und Zugänge. Es empfiehlt sich daher, ein Paar Badeschuhe mitzubringen, die das Gehen sowohl am Ufer als auch im Wasser bequemer und sicherer machen.','Poza plażą Palombina, plaże Conero mają zazwyczaj kamieniste lub skaliste dno i dojścia. Warto więc zabrać ze sobą buty do wody, które ułatwiają wygodne i bezpieczne poruszanie się zarówno na brzegu, jak i w wodzie.')+'</div></div>':'';
        const extraInfoBox=parkingInfoBox+beachTipBox;
        if(currentSubItinerary){
            let parent=null;for(let k=0;k<appData.mustsee.length;k++){if(appData.mustsee[k].subId===currentSubItinerary){parent=appData.mustsee[k];break;}}
            const descHtml=parent?'<div class="card"><div class="place-body"><div class="place-emoji-sm" aria-hidden="true">'+parent.emoji+'</div><div><div class="place-name">'+parent.name+'</div><div class="place-desc" style="margin-top:5px">'+tr(parent.it,parent.en,parent.de,parent.pl)+'</div></div></div></div>':'';
            if(currentPlaceDetail>=0&&currentPlaceDetail<items.length)return renderAnyPlaceDetail(items[currentPlaceDetail],currentPlaceDetail,items.length,true)+extraInfoBox;
            const subBtns=items.map((p,i)=>{const dn=getDisplayNumber(p,i),sel=(i===currentPlaceDetail)?' selected':'';return'<button class="place-btn-mini'+sel+'" data-index="'+i+'" aria-label="'+p.name+'">'+dn+'. '+p.name+'</button>';}).join('');
            return'<button class="back-btn" id="sub-back-btn">← '+tr('Torna al tour principale','Back to main tour','Zurück zur Haupttour','Powrót do głównej trasy')+'</button>'+descHtml+'<div class="map-list-wrap"><div id="sectionMap" class="section-map-el" role="application" aria-label="Mappa dei luoghi"></div><div class="place-btn-col">'+starBtnHtml()+subBtns+'</div></div>'+extraInfoBox;
        }
        if(currentPlaceDetail>=0&&currentPlaceDetail<items.length)return renderAnyPlaceDetail(items[currentPlaceDetail],currentPlaceDetail,items.length,false)+extraInfoBox;
        const sortedItems = distSortActive ? items.slice().sort((a,b)=>(a._dist||Infinity)-(b._dist||Infinity)) : items;
        const distSortLabel = distSortActive ? '📍 '+tr('Ordine distanza','By distance','Nach Entfernung','Wg odległości') : '📍 '+tr('Ordina per distanza','Sort by distance','Nach Entfernung sortieren','Sortuj wg odl.');
        const distSortBtn = '<button class="dist-sort-btn'+(distSortActive?' active':'')+'" id="dist-sort-btn">'+distSortLabel+'</button>';
        const btns=sortedItems.map((p,i)=>{const origIdx=items.indexOf(p),dn=getDisplayNumber(p,origIdx),sel=(origIdx===currentPlaceDetail)?' selected':'',subBadge=p.isSubItinerary?' 🔀':'',subHint=p.isSubItinerary?' – '+tr('mini-percorso','mini-tour','Mini-Tour','mini-trasa'):'';return'<button class="place-btn-mini'+sel+'" data-index="'+origIdx+'" aria-label="'+p.name+subHint+'">'+dn+'. '+p.name+subBadge+'</button>';}).join('');
        return'<div class="map-list-wrap"><div id="sectionMap" class="section-map-el" role="application" aria-label="Mappa dei luoghi"></div><div class="place-btn-col">'+starBtnHtml()+distSortBtn+btns+'</div></div>'+extraInfoBox;
    }

    function attachPlaceSectionListeners(){
        document.querySelectorAll('.place-btn-mini').forEach(btn=>btn.addEventListener('click',function(){selectPlaceDetail(parseInt(this.dataset.index));}));
        document.getElementById('star-home-btn')?.addEventListener('click',panToHome);
        document.getElementById('dist-sort-btn')?.addEventListener('click',function(){distSortActive=!distSortActive;renderAll();});
    }

    // V6.13: fullscreen gallery overlay con didascalia da itPhoto/enPhoto
    let _detailGalleryData = {};
    function openDetailGalleryFullscreen(index) {
        const data = _detailGalleryData[index];
        if (!data || !data.photos.length) return;
        let slidesHtml = '';
        data.photos.forEach((filename, i) => {
            slidesHtml += '<div class="gallery-slide"><img class="detail-photo loaded" src="' + PHOTO_BASE + filename + '" alt="Foto ' + (i + 1) + '" id="fs-img-' + i + '"></div>';
        });
        const dotsHtml = data.photos.length > 1 ? ('<div class="gallery-dots" id="fs-dots">' + data.photos.map((_, i) => '<span class="dot' + (i === 0 ? ' active' : '') + '"></span>').join('') + '</div>') : '';
        const captionHtml = data.caption ? '<div class="fs-gallery-caption">' + data.caption + '</div>' : '';
        const overlay = document.createElement('div');
        overlay.className = 'fullscreen-gallery-overlay';
        overlay.innerHTML = '<button class="fs-gallery-close" aria-label="' + tr('Chiudi', 'Close', 'Schließen', 'Zamknij') + '">✕</button>' + captionHtml + '<div class="fs-detail-gallery" id="fs-gallery-' + index + '">' + slidesHtml + '</div>' + dotsHtml;
        document.body.appendChild(overlay);
        overlay.querySelector('.fs-gallery-close').addEventListener('click', closeDetailGalleryFullscreen);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDetailGalleryFullscreen(); });
        if (data.photos.length > 1) {
            const galleryEl = overlay.querySelector('#fs-gallery-' + index), dotsEl = overlay.querySelector('#fs-dots');
            if (galleryEl && dotsEl) {
                galleryEl.addEventListener('scroll', debounce(function () {
                    const w = galleryEl.clientWidth || 1;
                    const idx = Math.round(galleryEl.scrollLeft / w);
                    dotsEl.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === idx));
                }, 80));
            }
        }
        document.body.style.overflow = 'hidden';
    }
    function closeDetailGalleryFullscreen() {
        const overlay = document.querySelector('.fullscreen-gallery-overlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
    }

    function renderAnyPlaceDetail(p,index,total,isSubMode){
        const wrapId='photowrap_'+index;placeDataMap[wrapId]=p;
        const desc=tr(p.it,p.en,p.de,p.pl);
        const hoursBadge=getHoursBadge(p);
        const priceBadge=p.price?'<span class="price-badge" aria-label="Fascia di prezzo">'+p.price+'</span>':'';
        // V6.3: galleria multi-foto (max 4) — p.photos è un array; p.photo (singolare) è
        // mantenuto solo come fallback di compatibilità nel caso residuasse in qualche voce.
        const photos=(p.photos&&p.photos.length?p.photos:(p.photo?[p.photo]:[])).slice(0,4);
        // V6.13: calcola photoTip prima di usarlo in photoHtml (per l'onclick del fullscreen)
        const photoTip=tr(p.itPhoto,p.enPhoto,p.dePhoto,p.plPhoto);
        // Memorizzo i dati per il fullscreen
        _detailGalleryData[index] = { photos: photos, caption: photoTip };
        let photoHtml;
        if(photos.length){
            let slidesHtml='';
            photos.forEach((filename,i)=>{
                const src=PHOTO_BASE+filename;
                slidesHtml+='<div class="gallery-slide"><div class="detail-photo-placeholder" id="ph_'+index+'_'+i+'" aria-hidden="true">'+p.emoji+'</div><img class="detail-photo" src="'+src+'" alt="Foto di '+p.name+' '+(i+1)+'" loading="lazy" id="img_'+index+'_'+i+'"></div>';
            });
            const dotsHtml=photos.length>1?('<div class="gallery-dots" id="dots_'+index+'">'+photos.map((_,i)=>'<span class="dot'+(i===0?' active':'')+'" data-idx="'+i+'"></span>').join('')+'</div>'):'';
            photoHtml='<div class="detail-photo-wrap" id="'+wrapId+'"><div class="detail-gallery" id="gallery_'+index+'" onclick="openDetailGalleryFullscreen('+index+')" style="cursor:pointer">'+slidesHtml+'</div>'+dotsHtml+'</div>';
        }
        else photoHtml='<div class="detail-photo-wrap" id="'+wrapId+'"><a href="'+getImgSearchUrl(p)+'" target="_blank" rel="noopener noreferrer" class="detail-photo-link" aria-label="Cerca foto di '+p.name+' su Google Immagini"><span class="placeholder-emoji" aria-hidden="true">🖼️</span><span class="placeholder-text">'+tr('Clicca per vedere le foto','Click to see photos','Klicken, um Fotos zu sehen','Kliknij, aby zobaczyć zdjęcia')+'</span></a></div>';
        let btns='<a href="'+getMapLink(p.mapQuery||p.name,!!p.mapQuery)+'" target="_blank" rel="noopener noreferrer" class="map-button" aria-label="Apri mappa per '+p.name+'">🗺️ '+tr('Apri mappa','Open map','Karte öffnen','Otwórz mapę')+'</a>';
        if(!isSubMode&&p.extraMap){const extraHref=p.extraMap.url||getMapLink(p.extraMap.query,true);btns+=' <a href="'+extraHref+'" target="_blank" rel="noopener noreferrer" class="map-button" aria-label="'+p.extraMap.label+'">'+p.extraMap.label+'</a>';}
        // V5.0: sezione 📖 Approfondisci
        const deepId='deep_'+index;
        let deepHtml='';
        if(p.itLong||p.enLong||p.deLong||p.plLong){
            const longDesc=tr(p.itLong||p.it,p.enLong||p.en,p.deLong||p.de,p.plLong||p.pl);
            deepHtml='<div class="place-section-block"><button class="place-deep-toggle" onclick="(function(btn){btn.classList.toggle(\'open\');var b=document.getElementById(\''+deepId+'\');b.classList.toggle(\'open\');btn.setAttribute(\'aria-expanded\',b.classList.contains(\'open\'));this})(this)" aria-expanded="false">📖 '+tr('Approfondisci','Learn more','Mehr erfahren','Dowiedz się więcej')+'</button><div class="place-deep-body" id="'+deepId+'">'+longDesc+'</div></div>';
        }
        // V5.0: meta-sezioni (👀 Da non perdere, 📸 Foto, ⏱ Tempo, 🚶 Prossima tappa)
        const noteStr=tr(p.itNote,p.enNote,p.deNote,p.plNote);
        const timeStr=tr(p.itTime,p.enTime,p.deTime,p.plTime);
        let metaHtml='';
        if(noteStr||photoTip||timeStr){
            metaHtml='<div class="place-section-block"><div class="place-meta">';
            if(noteStr) metaHtml+='<div class="place-meta-row"><span class="place-meta-icon">👀</span><span>'+noteStr+'</span></div>';
            if(photoTip) metaHtml+='<div class="place-meta-row"><span class="place-meta-icon">📸</span><span>'+photoTip+'</span></div>';
            if(timeStr) metaHtml+='<div class="place-meta-row"><span class="place-meta-icon">⏱</span><span>'+timeStr+'</span></div>';
            metaHtml+='</div></div>';
        }
        const displayNum=getDisplayNumber(p,index),totalDisplay=getTotalDisplay(currentSectionPlaces,total);
        const backLabel=tr('Tutti i luoghi','All places','Alle Orte','Wszystkie miejsca');
        const prev=index>0?'<button class="nav-detail-btn" data-prev="'+(index-1)+'" aria-label="Luogo precedente">◀ '+tr('Prec.','Prev','Vor.','Poprz.')+'</button>':'<span></span>';
        const next=index<total-1?'<button class="nav-detail-btn" data-next="'+(index+1)+'" aria-label="Luogo successivo">'+tr('Succ.','Next','Näch.','Nast.')+' ▶</button>':'<span></span>';
        const html='<button class="back-btn" id="detail-back-btn" aria-label="Torna alla lista dei luoghi">← '+backLabel+'</button><div class="place-card">'+photoHtml+'<div class="place-body"><div class="place-emoji-sm" aria-hidden="true">'+p.emoji+'</div><div style="width:100%"><div class="place-name">'+p.name+'</div><div class="place-dist">'+p.dist+priceBadge+'</div>'+hoursBadge+'<div class="place-desc" style="margin-top:6px">'+desc+'</div>'+deepHtml+metaHtml+'</div></div><div class="place-actions">'+btns+'</div></div><div class="detail-nav">'+prev+'<span class="detail-counter">'+displayNum+' / '+totalDisplay+'</span>'+next+'</div>';
        // V6.3: gestione caricamento/errore per-immagine + fallback completo solo se
        // TUTTE le immagini della galleria falliscono; sincronizzazione dots via scroll.
        setTimeout(()=>{
            const total=photos.length;
            if(!total)return;
            let settled=0,errors=0;
            const checkAllFailed=()=>{
                if(settled===total&&errors===total)photoFallback(wrapId);
            };
            for(let i=0;i<total;i++){
                const img=document.getElementById('img_'+index+'_'+i),placeholder=document.getElementById('ph_'+index+'_'+i);
                if(!img)continue;
                const onLoad=()=>{settled++;img.classList.add('loaded');if(placeholder)placeholder.classList.add('hidden');checkAllFailed();};
                const onError=()=>{settled++;errors++;checkAllFailed();};
                img.addEventListener('load',onLoad);
                img.addEventListener('error',onError);
                if(img.complete){if(img.naturalWidth>0)onLoad();else onError();}
            }
            if(total>1){
                const galleryEl=document.getElementById('gallery_'+index),dotsEl=document.getElementById('dots_'+index);
                if(galleryEl&&dotsEl){
                    galleryEl.addEventListener('scroll',debounce(()=>{
                        const w=galleryEl.clientWidth||1;
                        const idx=Math.round(galleryEl.scrollLeft/w);
                        dotsEl.querySelectorAll('.dot').forEach((d,i)=>d.classList.toggle('active',i===idx));
                    },80));
                }
            }
        },0);
        return html;
    }

    function attachDetailListeners(){document.getElementById('detail-back-btn')?.addEventListener('click',backToMap);document.querySelectorAll('.nav-detail-btn[data-prev]').forEach(btn=>btn.addEventListener('click',function(){selectPlaceDetail(parseInt(this.dataset.prev));}));document.querySelectorAll('.nav-detail-btn[data-next]').forEach(btn=>btn.addEventListener('click',function(){selectPlaceDetail(parseInt(this.dataset.next));}));}

    function attachReachListeners(){
        document.querySelectorAll('.reach-sub-btn').forEach(btn=>{
            btn.addEventListener('click',function(){window._toggleReach(this.dataset.reach);});
        });
        if(window._toggleReach)window._toggleReach(window._activeReachTab||'auto');
    }

    function renderApartment(){
        const a=appData.apartment;
        const r=a.reach||{};

        // FIX 23/08/26: reachCardHtml/cards non erano mai definiti da nessuna parte —
        // ReferenceError ad ogni apertura della sezione. Ricostruita usando i campi reali
        // di appData.apartment e l'infrastruttura .reach-sub-btn/.reach-content già presente
        // in CSS ed engine.js (window._toggleReach, attachReachListeners) ma mai alimentata.
        const reachTabs=[
            {key:'auto',   icon:'🚗', label:tr('Auto','Car','Auto','Samochód')},
            {key:'train',  icon:'🚆', label:tr('Treno','Train','Zug','Pociąg')},
            {key:'ferry',  icon:'⛴️', label:tr('Traghetto','Ferry','Fähre','Prom')},
            {key:'airport',icon:'✈️', label:tr('Aeroporto','Airport','Flughafen','Lotnisko')}
        ];

        // window._reachTexts DEVE essere popolato qui, prima del render: attachReachListeners()
        // (chiamata da renderAll subito dopo l'inserimento nel DOM) legge subito da qui per
        // riempire #reach-content con la tab attiva, senza un secondo giro di render.
        window._reachTexts={};
        reachTabs.forEach(t=>{
            const entry=r[t.key];
            window._reachTexts[t.key]=entry?tr(entry.it,entry.en,entry.de,entry.pl):'';
        });
        if(!reachTabs.some(t=>t.key===window._activeReachTab))window._activeReachTab='auto';

        const reachTabsHtml=reachTabs.map(t=>'<button class="reach-sub-btn'+(t.key===window._activeReachTab?' active':'')+'" data-reach="'+t.key+'" aria-label="'+t.label+'">'+t.icon+' '+t.label+'</button>').join('');
        const reachCardHtml='<div class="practical-block"><div class="practical-header"><span class="practical-icon" aria-hidden="true">🧭</span><span class="practical-title">'+tr('Come raggiungerci','How to reach us','Anreise','Jak do nas dotrzeć')+'</span></div><div class="practical-body"><div style="display:flex;gap:6px;margin-bottom:10px">'+reachTabsHtml+'</div><div class="reach-content" id="reach-content"></div></div></div>';

        const cards=[
            a.wifi       && {icon:'📶', title:tr('WiFi','WiFi','WLAN','WiFi'), body:tr(a.wifi.it,a.wifi.en,a.wifi.de,a.wifi.pl)},
            a.access     && {icon:'🚪', title:tr('Accesso e citofono','Access & intercom','Zugang & Gegensprechanlage','Dostęp i domofon'), body:tr(a.access.it,a.access.en,a.access.de,a.access.pl)},
            a.keys       && {icon:'🔑', title:tr('Consegna chiavi','Key handover','Schlüsselübergabe','Przekazanie kluczy'), body:tr(a.keys.it,a.keys.en,a.keys.de,a.keys.pl)},
            a.checkin    && {icon:'🛬', title:tr('Check-in','Check-in','Check-in','Zameldowanie'), body:tr(a.checkin.it,a.checkin.en,a.checkin.de,a.checkin.pl)},
            a.checkout   && {icon:'🛫', title:tr('Check-out','Check-out','Check-out','Wymeldowanie'), body:tr(a.checkout.it,a.checkout.en,a.checkout.de,a.checkout.pl)},
            a.quietHours && {icon:'🤫', title:tr('Silenzio','Quiet hours','Ruhezeiten','Cisza nocna'), body:tr(a.quietHours.it,a.quietHours.en,a.quietHours.de,a.quietHours.pl)},
            a.recycling  && {icon:'♻️', title:tr('Differenziata','Recycling','Mülltrennung','Segregacja odpadów'), body:tr(a.recycling.it,a.recycling.en,a.recycling.de,a.recycling.pl)},
            a.water      && {icon:'🚰', title:tr('Acqua del rubinetto','Tap water','Leitungswasser','Woda z kranu'), body:tr(a.water.it,a.water.en,a.water.de,a.water.pl)}
        ].filter(Boolean);

        let html=reachCardHtml;
        for(let i=0;i<cards.length;i++)html+='<div class="card"><div class="card-header"><span class="card-header-icon" aria-hidden="true">'+cards[i].icon+'</span><span class="card-title">'+cards[i].title+'</span></div><div class="card-body">'+cards[i].body+'</div></div>';
        return html;
    }

    function renderRestaurants(){
        const places=appData.restaurants;
        currentSectionPlaces=places;
        for(let i=0;i<places.length;i++){const p=places[i];p._dist=(p.lat&&p.lng)?calcDistance(HOME_COORDS.lat,HOME_COORDS.lng,p.lat,p.lng):Infinity;}

        if(currentPlaceDetail>=0&&currentPlaceDetail<places.length)return renderAnyPlaceDetail(places[currentPlaceDetail],currentPlaceDetail,places.length,false);

        // Mappa + lista numerata, stesso pattern delle altre sezioni-luogo
        const btns=places.map((p,i)=>{const price=p.price?' '+p.price:'';return'<button class="place-btn-mini" data-index="'+i+'" aria-label="'+p.name+'">'+(i+1)+'. '+p.emoji+' '+p.name+price+'</button>';}).join('');
        let html='<div class="map-list-wrap"><div id="sectionMap" class="section-map-el" role="application" aria-label="Mappa dei ristoranti"></div><div class="place-btn-col">'+starBtnHtml()+btns+'</div></div>';
        return html;
    }

    function renderConero(){
        const c=appData.conero;
        const points=c.points;
        currentSectionPlaces=points;
        for(let i=0;i<points.length;i++){const p=points[i];p._dist=(p.lat&&p.lng)?calcDistance(HOME_COORDS.lat,HOME_COORDS.lng,p.lat,p.lng):Infinity;}

        if(currentPlaceDetail>=0&&currentPlaceDetail<points.length)return renderAnyPlaceDetail(points[currentPlaceDetail],currentPlaceDetail,points.length,false);

        const introTxt=tr(c.intro.it,c.intro.en,c.intro.de,c.intro.pl);
        let html='<div class="card" style="margin-bottom:8px"><div class="card-body" style="font-size:.82rem;line-height:1.6;color:var(--text)">'+introTxt+'</div></div>';
        // Link utili
        html+='<div class="card" style="margin-bottom:8px"><div class="card-header"><span class="card-header-icon">🔗</span><span class="card-title">'+tr('Link utili','Useful links','Nützliche Links','Przydatne linki')+'</span></div><div class="card-body" style="padding:0">';
        for(let i=0;i<c.links.length;i++){const l=c.links[i];const label=tr(l.it,l.en,l.de,l.pl);html+='<div class="link-row"><span class="link-icon" aria-hidden="true">'+l.icon+'</span><div class="link-info"><div class="link-name">'+label+'</div></div><a href="'+l.url+'" target="_blank" rel="noopener noreferrer" class="link-action" aria-label="'+label+'">↗</a></div>';}
        html+='</div></div>';
        // Mappa + lista dei punti (numerati, stesso pattern di Cardeto/Passetto)
        const btns=points.map((p,i)=>{const dn=getDisplayNumber(p,i);return'<button class="place-btn-mini" data-index="'+i+'" aria-label="'+p.name+'">'+dn+'. '+p.name+'</button>';}).join('');
        html+='<div class="map-list-wrap"><div id="sectionMap" class="section-map-el" role="application" aria-label="Mappa Monte Conero"></div><div class="place-btn-col">'+starBtnHtml()+btns+'</div></div>';
        return html;
    }

    function renderPortonovo(){
        const p=appData.portonovo;
        const points=p.points;
        currentSectionPlaces=points;
        for(let i=0;i<points.length;i++){const pt=points[i];pt._dist=(pt.lat&&pt.lng)?calcDistance(HOME_COORDS.lat,HOME_COORDS.lng,pt.lat,pt.lng):Infinity;}

        if(currentPlaceDetail>=0&&currentPlaceDetail<points.length)return renderAnyPlaceDetail(points[currentPlaceDetail],currentPlaceDetail,points.length,false);

        const introTxt=tr(p.intro.it,p.intro.en,p.intro.de,p.intro.pl);
        let html='<div class="card" style="margin-bottom:8px"><div class="card-body" style="font-size:.82rem;line-height:1.6;color:var(--text)">'+introTxt+'</div></div>';
        // Mappa + lista dei punti (numerati)
        const btns=points.map((pt,i)=>{const dn=getDisplayNumber(pt,i);return'<button class="place-btn-mini" data-index="'+i+'" aria-label="'+pt.name+'">'+dn+'. '+pt.name+'</button>';}).join('');
        html+='<div class="map-list-wrap"><div id="sectionMap" class="section-map-el" role="application" aria-label="Mappa Portonovo"></div><div class="place-btn-col">'+starBtnHtml()+btns+'</div></div>';
        return html;
    }

    function renderServices(){
        const s=appData.services;
        const allPlaces=[...s.supermarkets,...s.parking,...(s.other||[])];
        const smLen=s.supermarkets.length;
        const pkLen=s.parking.length;
        currentSectionPlaces=allPlaces;
        for(let i=0;i<allPlaces.length;i++){const p=allPlaces[i];p._dist=(p.lat&&p.lng)?calcDistance(HOME_COORDS.lat,HOME_COORDS.lng,p.lat,p.lng):Infinity;}

        if(currentPlaceDetail>=0&&currentPlaceDetail<allPlaces.length)return renderAnyPlaceDetail(allPlaces[currentPlaceDetail],currentPlaceDetail,allPlaces.length,false);

        // Mappa con tutti i servizi (stesso pattern delle altre sezioni-luogo)
        const mapBtns=allPlaces.map((p,i)=>'<button class="place-btn-mini" data-index="'+i+'" aria-label="'+p.name+'">'+(i+1)+'. '+p.emoji+' '+p.name+'</button>').join('');
        let html='<div class="map-list-wrap"><div id="sectionMap" class="section-map-el" role="application" aria-label="Mappa dei servizi"></div><div class="place-btn-col">'+starBtnHtml()+mapBtns+'</div></div>';

        // Supermercati
        html+='<div class="section-list-header" style="margin-top:8px"><span class="section-list-title">'+tr('Supermercati e mercati','Supermarkets & markets','Supermärkte & Märkte','Supermarkety i targowiska')+'</span></div>';
        for(let i=0;i<s.supermarkets.length;i++){
            const p=s.supermarkets[i];
            const hours=getHoursBadge(p);
            html+='<div class="place-row" onclick="selectServiceItem('+i+')" style="cursor:pointer"><div class="place-emoji" aria-hidden="true">'+p.emoji+'</div><div class="place-info"><div class="place-row-name">'+(i+1)+'. '+p.name+'</div><div class="place-row-dist">'+p.dist+'</div>'+hours+'</div></div>';
        }
        // Parcheggi
        html+='<div class="section-list-header" style="margin-top:8px"><span class="section-list-title">'+tr('Parcheggi','Parking','Parkplätze','Parkingi')+'</span></div>';
        for(let i=0;i<s.parking.length;i++){
            const p=s.parking[i];
            html+='<div class="place-row" onclick="selectServiceItem('+(smLen+i)+')" style="cursor:pointer"><div class="place-emoji" aria-hidden="true">'+p.emoji+'</div><div class="place-info"><div class="place-row-name">'+(smLen+i+1)+'. '+p.name+'</div><div class="place-row-dist">'+p.dist+'</div></div></div>';
        }
        // Altri servizi (lavanderia, ecc.)
        if(s.other&&s.other.length){
            html+='<div class="section-list-header" style="margin-top:8px"><span class="section-list-title">'+tr('Altri servizi','Other services','Weitere Dienstleistungen','Inne usługi')+'</span></div>';
            for(let i=0;i<s.other.length;i++){
                const p=s.other[i];
                html+='<div class="place-row" onclick="selectServiceItem('+(smLen+pkLen+i)+')" style="cursor:pointer"><div class="place-emoji" aria-hidden="true">'+p.emoji+'</div><div class="place-info"><div class="place-row-name">'+(smLen+pkLen+i+1)+'. '+p.name+'</div><div class="place-row-dist">'+p.dist+'</div></div></div>';
            }
        }
        window._servicePlaces=allPlaces;
        return html;
    }

    function renderUsefulInfo(){
        let html='';

        function practicalBlock(icon,title,brief,detail,tip){
            let h='<div class="practical-block"><div class="practical-header"><span class="practical-icon" aria-hidden="true">'+icon+'</span><span class="practical-title">'+title+'</span></div><div class="practical-body">';
            if(brief) h+='<div class="practical-brief">📍 '+brief+'</div>';
            if(detail) h+='<div class="practical-detail">📖 '+detail+'</div>';
            if(tip) h+='<div class="practical-tip"><strong>💡 '+tr('Consiglio dell\'host','Host tip','Tipp des Gastgebers','Porada gospodarza')+'</strong>'+tip+'</div>';
            h+='</div></div>';
            return h;
        }


        html+=practicalBlock('🛍️',
            tr('Shopping','Shopping','Einkaufen','Zakupy'),
            tr('Il centro di Ancona è ideale per una passeggiata tra negozi, boutique, librerie e botteghe storiche. Accanto ai grandi marchi troverai le bancarelle del mercato e attività locali che raccontano il carattere della città.',
               'Ancona\'s centre is ideal for a stroll among shops, boutiques, bookshops and historic workshops. Alongside major brands you\'ll find market stalls and local businesses that reflect the character of the city.',
               'Das Zentrum Anconas eignet sich hervorragend für einen Spaziergang zwischen Geschäften, Boutiquen, Buchhandlungen und historischen Läden.',
               'Centrum Ankony idealnie nadaje się na spacer wśród sklepów, butików, księgarni i historycznych warsztatów.'),
            tr('L\'area principale dello shopping si sviluppa lungo Corso Garibaldi, Corso Mazzini, Piazza Roma e Piazza Cavour. Qui si alternano negozi di abbigliamento, calzature, profumerie, librerie, gioiellerie e articoli per la casa. Passeggiando tra le vie del centro potrai scoprire anche piccole botteghe artigiane, enoteche e negozi di prodotti tipici, ideali per acquistare un ricordo del soggiorno.',
               'The main shopping area runs along Corso Garibaldi, Corso Mazzini, Piazza Roma and Piazza Cavour, with clothing, footwear, perfumery, bookshops, jewellers and homeware. You\'ll also find small artisan workshops, wine shops and local product stores, ideal for a souvenir.',
               'Das Haupteinkaufsgebiet erstreckt sich entlang des Corso Garibaldi, Corso Mazzini, der Piazza Roma und Piazza Cavour.',
               'Główny obszar zakupowy rozciąga się wzdłuż Corso Garibaldi, Corso Mazzini, Piazza Roma i Piazza Cavour.'),
            tr('Molti negozi chiudono durante la pausa pranzo. Se desideri fare shopping, il pomeriggio è generalmente il momento migliore.',
               'Many shops close for lunch. If you want to shop, the afternoon is generally the best time.',
               'Viele Geschäfte schließen über Mittag. Der Nachmittag ist meist die beste Zeit zum Einkaufen.',
               'Wiele sklepów zamyka się na przerwę obiadową. Popołudnie jest zwykle najlepszym czasem na zakupy.'));

        // Prodotti tipici e Gastronomia (unisce l'ex-sezione top-level "Gastronomia": intro, piatti tipici, consiglio host)
        (function(){
            const g=appData.gastronomy;
            const introTxt=tr(g.intro.it,g.intro.en,g.intro.de,g.intro.pl);
            const productsDetail=tr('Tra i prodotti più apprezzati trovi il Rosso Conero, il Verdicchio dei Castelli di Jesi, olio extravergine, miele, salumi, formaggi, pasta artigianale e dolci tradizionali. Numerose gastronomie ed enoteche del centro propongono confezioni regalo e prodotti selezionati.',
               'Among the most appreciated products are Rosso Conero, Verdicchio dei Castelli di Jesi, extra virgin olive oil, honey, cured meats, cheeses, artisan pasta and traditional sweets. Many delicatessens and wine shops in the centre offer gift packs and selected products.',
               'Zu den beliebtesten Produkten gehören Rosso Conero, Verdicchio dei Castelli di Jesi, natives Olivenöl, Honig, Wurstwaren, Käse, handwerkliche Pasta und traditionelles Gebäck.',
               'Do najbardziej cenionych produktów należą Rosso Conero, Verdicchio dei Castelli di Jesi, oliwa z oliwek, miód, wędliny, sery, makaron rzemieślniczy i tradycyjne słodycze.');
            const shoppingTip=tr('Una bottiglia di Rosso Conero e una di Verdicchio insieme a una confezione sotto vuoto di olive ascolane sono tra i ricordi più autentici da portare a casa.',
               'A bottle of Rosso Conero and one of Verdicchio, along with a vacuum-packed box of olive ascolane, are among the most authentic souvenirs to bring home.',
               'Eine Flasche Rosso Conero und eine Verdicchio zusammen mit vakuumverpackten Oliven all\'ascolana sind authentische Mitbringsel.',
               'Butelka Rosso Conero i Verdicchio wraz z próżniowo pakowanymi oliwkami ascolana to autentyczne pamiątki.');
            const hostTipTxt=tr(g.hostTip.it,g.hostTip.en,g.hostTip.de,g.hostTip.pl);

            let h='<div class="practical-block"><div class="practical-header"><span class="practical-icon" aria-hidden="true">🎁</span><span class="practical-title">'+tr('Prodotti tipici e Gastronomia','Local Products & Gastronomy','Lokale Produkte & Gastronomie','Produkty regionalne i gastronomia')+'</span></div><div class="practical-body">';
            h+='<div class="practical-brief">📍 '+introTxt+'</div>';
            h+='<div class="practical-detail">📖 '+productsDetail+'</div>';
            h+='<div style="font-weight:600;font-size:.78rem;color:var(--navy);margin:10px 0 6px">🍲 '+tr('Piatti tipici da assaggiare','Local dishes to try','Typische Gerichte zum Probieren','Typowe dania do spróbowania')+'</div>';
            for(let i=0;i<g.dishes.length;i++){const d=g.dishes[i];h+='<div style="margin-bottom:8px"><div style="font-weight:600;font-size:.8rem;color:var(--navy)">'+d.emoji+' '+d.name+'</div><div style="font-size:.75rem;color:var(--muted);margin-top:2px;line-height:1.45">'+tr(d.it,d.en,d.de,d.pl)+'</div></div>';}
            h+='<div class="practical-tip"><strong>💡 '+tr('Consiglio dell\'host','Host tip','Tipp des Gastgebers','Porada gospodarza')+'</strong>'+shoppingTip+'<br><br>'+hostTipTxt+'</div>';
            h+='</div></div>';
            html+=h;
        })();

        html+=practicalBlock('🌅',
            tr('Tramonti da non perdere','Sunsets not to miss','Sonnenuntergänge, die man nicht verpassen sollte','Zachody słońca, których nie można przegapić'),
            tr('Ancona è anche la città dove il sole sorge e tramonta sul mare e offre alcuni punti panoramici davvero spettacolari, perfetti per iniziare o concludere la giornata.',
               'Ancona is also a city where the sun rises and sets over the sea, offering some truly spectacular viewpoints, perfect for starting or ending the day.',
               'Ancona ist auch eine Stadt, in der die Sonne über dem Meer auf- und untergeht, mit spektakulären Aussichtspunkten.',
               'Ankona to także miasto, w którym słońce wschodzi i zachodzi nad morzem, oferując spektakularne punkty widokowe.'),
            tr('Per ammirare il tramonto con il sole che scende sul mare i luoghi che consiglio maggiormente sono: Colle Guasco, Parco del Cardeto, Belvedere Casanova a Capodimonte, Bar Giuliani, Bar Amarcord. Ogni punto regala una prospettiva diversa sulla città e sul mare.',
               'To admire the sunset over the sea, the spots I recommend most are: Colle Guasco, Parco del Cardeto, Belvedere Casanova in Capodimonte, Bar Giuliani, Bar Amarcord. Each offers a different perspective on the city and the sea.',
               'Empfohlene Orte für den Sonnenuntergang: Colle Guasco, Parco del Cardeto, Belvedere Casanova in Capodimonte, Bar Giuliani, Bar Amarcord.',
               'Polecane miejsca na zachód słońca: Colle Guasco, Parco del Cardeto, Belvedere Casanova w Capodimonte, Bar Giuliani, Bar Amarcord.'));

        html+=practicalBlock('🌄',
            tr('Alba al Passetto','Dawn at the Passetto','Sonnenaufgang am Passetto','Świt na Passetto'),
            tr('Assistere all\'alba dal Passetto è una delle esperienze più suggestive che Ancona possa offrire.',
               'Watching the dawn from the Passetto is one of the most evocative experiences Ancona can offer.',
               'Der Sonnenaufgang vom Passetto aus ist eines der eindrucksvollsten Erlebnisse, die Ancona bietet.',
               'Świt oglądany z Passetto to jedno z najbardziej sugestywnych doświadczeń, jakie oferuje Ankona.'),
            tr('Grazie alla particolare posizione della città, guardando all\'alba verso oriente, il sole sorge direttamente dal mare creando giochi di luce spettacolari sulla falesia, sulle grotte dei pescatori e sull\'Adriatico. Nelle prime ore del mattino il luogo è silenzioso e frequentato soprattutto da chi ama camminare, correre o semplicemente godersi uno dei panorami più belli della città.',
               'Thanks to the city\'s particular position, looking east at dawn the sun rises directly from the sea, creating spectacular plays of light on the cliff, the fishermen\'s grottoes and the Adriatic. In the early morning the place is quiet, favoured by those who love walking, running, or simply enjoying one of the city\'s finest views.',
               'Dank der besonderen Lage der Stadt geht die Sonne bei Blick nach Osten direkt aus dem Meer auf und erzeugt spektakuläre Lichtspiele auf der Klippe.',
               'Dzięki szczególnemu położeniu miasta, patrząc o świcie na wschód, słońce wschodzi bezpośrednio z morza, tworząc spektakularne gry świateł na klifie.'));

        html+=practicalBlock('📅',
            tr('Quando visitare Ancona','When to visit Ancona','Wann man Ancona besuchen sollte','Kiedy odwiedzić Ankonę'),
            tr('Ancona è piacevole tutto l\'anno, ma ogni stagione offre esperienze diverse.',
               'Ancona is pleasant all year round, but each season offers different experiences.',
               'Ancona ist das ganze Jahr über angenehm, doch jede Jahreszeit bietet andere Erlebnisse.',
               'Ankona jest przyjemna przez cały rok, ale każda pora roku oferuje inne doznania.'),
            tr('Primavera è ideale per escursioni, passeggiate e visite culturali. Estate è perfetta per spiagge, mare e serate all\'aperto. Autunno regala colori splendidi sul Conero ed è il periodo migliore per l\'enogastronomia. Inverno permette di visitare la città con tranquillità, senza l\'affollamento turistico.',
               'Spring is ideal for excursions, walks and cultural visits. Summer is perfect for beaches, the sea and evenings outdoors. Autumn brings splendid colours to the Conero and is the best period for food and wine. Winter lets you visit the city peacefully, without crowds.',
               'Frühling: ideal für Ausflüge und Kultur. Sommer: perfekt für Strand und Meer. Herbst: herrliche Farben am Conero, beste Zeit für Wein & Gastronomie. Winter: ruhiger Stadtbesuch ohne Touristenmassen.',
               'Wiosna: idealna na wycieczki i kulturę. Lato: idealne na plaże i morze. Jesień: piękne kolory na Conero, najlepszy czas na wino i gastronomię. Zima: spokojne zwiedzanie bez tłumów.'),
            tr('Se puoi scegliere, maggio, giugno e settembre rappresentano probabilmente il miglior equilibrio tra clima, mare e tranquillità.',
               'If you can choose, May, June and September probably offer the best balance between climate, sea and tranquillity.',
               'Wenn möglich, bieten Mai, Juni und September das beste Gleichgewicht zwischen Klima, Meer und Ruhe.',
               'Jeśli możesz wybrać, maj, czerwiec i wrzesień oferują najlepszą równowagę między klimatem, morzem a spokojem.'));

        return html;
    }

    function selectServiceItem(i){
        if(!window._servicePlaces)return;
        currentSectionPlaces=window._servicePlaces;
        selectPlaceDetail(i);
    }

    function renderContact(){
        const fp=HOST_PHONE.replace(/(\d{3})(\d{3})(\d{4})/,'$1 $2 $3');
        return'<div class="contact-card"><div class="contact-label">📞 '+tr('Host disponibile su WhatsApp','Host available on WhatsApp','Gastgeber auf WhatsApp erreichbar','Gospodarz dostępny na WhatsAppie')+'</div><div class="contact-number">'+fp+'</div><div class="contact-btns"><a href="https://wa.me/39'+HOST_PHONE+'" target="_blank" rel="noopener noreferrer" class="btn-wa" aria-label="Contatta su WhatsApp">💬 WhatsApp</a><a href="tel:+39'+HOST_PHONE+'" class="btn-call" aria-label="Chiama">📞 '+tr('Chiama','Call','Anrufen','Zadzwoń')+'</a></div><div class="contact-email">✉️ <a href="mailto:'+HOST_EMAIL+'">'+HOST_EMAIL+'</a></div><div style="margin-top:14px;display:flex;flex-wrap:wrap;justify-content:center;gap:16px"><a href="'+appData.social.instagram+'" target="_blank" rel="noopener noreferrer" class="social-link">📷 Instagram</a><a href="'+appData.social.facebook+'" target="_blank" rel="noopener noreferrer" class="social-link">📘 Facebook</a><a href="'+appData.social.signal+'" target="_blank" rel="noopener noreferrer" class="social-link">🔒 Signal</a><a href="'+appData.social.telegram+'" target="_blank" rel="noopener noreferrer" class="social-link">✈️ Telegram</a></div></div><div class="emerg-card"><div class="card-header"><span class="card-header-icon" aria-hidden="true">🚨</span><span class="card-title">'+tr('Numeri di emergenza','Emergency numbers','Notrufnummern','Numery alarmowe')+'</span></div><div class="emerg-row"><span class="emerg-num">🚨 112</span><span class="emerg-desc">'+tr('Emergenza generale','General emergency','Allgemeiner Notruf','Ogólne zagrożenie')+'</span></div><div class="emerg-row"><span class="emerg-num">🚓 113</span><span class="emerg-desc">'+tr('Polizia','Police','Polizei','Policja')+'</span></div><div class="emerg-row"><span class="emerg-num">🚑 118</span><span class="emerg-desc">'+tr('Emergenza sanitaria','Medical emergency','Medizinischer Notfall','Nagły wypadek medyczny')+'</span></div><div class="emerg-row"><span class="emerg-num">🏥 071 5961</span><span class="emerg-desc">'+tr('Ospedale Riuniti – Pronto Soccorso','Ospedale Riuniti – A&amp;E','Ospedale Riuniti – Notaufnahme','Szpital Riuniti – Izba przyjęć')+'</span></div><div class="emerg-row"><span class="emerg-num">💊</span><span class="emerg-desc"><a href="https://www.farmaciediturno.org/comune.asp?cod=42002" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">'+tr('Farmacia di turno','Duty pharmacy','Diensthabende Apotheke','Apteka dyżurna')+'</a></span></div><div class="emerg-row"><span class="emerg-num">🚕 071 43321</span><span class="emerg-desc">Radiotaxi Ancona (24h)</span></div></div><div class="card" style="margin-top:10px"><div class="card-header"><span class="card-header-icon" aria-hidden="true">🔗</span><span class="card-title">'+tr('Link utili','Useful links','Nützliche Links','Przydatne linki')+'</span></div><div class="card-body" style="padding:0"><div class="link-row"><span class="link-icon" aria-hidden="true">📰</span><div class="link-info"><div class="link-name">Ufficio turistico – Edicola Piazza Roma</div><div class="link-desc">'+tr('Proprio davanti al portone','Right in front of the entrance','Direkt vor dem Eingang','Tuż przed wejściem')+'</div></div><a href="'+getMapLink('Edicola Piazza Roma Ancona',true)+'" target="_blank" rel="noopener noreferrer" class="link-action" aria-label="Mappa Edicola">🗺️ '+tr('Mappa','Map','Karte','Mapa')+'</a></div><div class="link-row"><span class="link-icon" aria-hidden="true">🌐</span><div class="link-info"><div class="link-name">anconatourism.it</div><div class="link-desc">'+tr('Portale turistico ufficiale di Ancona','Official Ancona tourism portal','Offizielles Tourismusportal von Ancona','Oficjalny portal turystyczny Ankony')+'</div></div><a href="https://anconatourism.it" target="_blank" rel="noopener noreferrer" class="link-action" aria-label="Apri portale turistico">↗</a></div></div></div>';
    }

    function initSectionMap(){
        // FIX B3 V5.0 30/06/26: il contatore va azzerato all'ingresso di ogni chiamata
        // "fresca" (non di retry), non solo dopo la verifica di L. La versione precedente
        // azzerava _mapRetryCount=0 solo nel ramo "L definito", quindi se due chiamate
        // concorrenti partivano mentre L non era ancora pronto, il contatore condiviso
        // si esauriva prima del previsto interrompendo il retry.
        if(typeof L==='undefined'){if(_mapRetryCount<30){_mapRetryCount++;setTimeout(initSectionMap,300);}return;}
        _mapRetryCount=0;const el=document.getElementById('sectionMap');if(!el||!currentSectionPlaces.length)return;
        if(leafletMap){leafletMap.remove();leafletMap=null;}
        const valid=currentSectionPlaces.filter(p=>p.lat&&p.lng);if(!valid.length)return;
        leafletMap=L.map('sectionMap',{zoomControl:true,attributionControl:true});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(leafletMap);
        const bounds=[];
        valid.forEach((p,idx)=>{const displayNum=getDisplayNumber(p,idx);let markerClass='map-marker-num';if(currentSubItinerary==='cardeto'||currentSubItinerary==='cittadella')markerClass+=' '+currentSubItinerary;if(p.isSubItinerary)markerClass+=' has-sub';const icon=L.divIcon({html:'<div class="'+markerClass+'" aria-label="'+p.name+'" role="img">'+displayNum+'</div>',className:'',iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-14]});const m=L.marker([p.lat,p.lng],{icon:icon}).addTo(leafletMap);m.bindPopup('<b style="font-size:.78rem">'+p.emoji+' '+p.name+'</b><br><span style="font-size:.68rem;color:#888">'+p.dist+'</span>');
            m.on('click',function(e){
                // Bug fix V5.0: stopPropagation impedisce che il click sul marker
                // risalga alla mappa e apra il fullscreen inaspettatamente
                L.DomEvent.stopPropagation(e);
                // Bug fix V5.0: getElement() ritorna il wrapper leaflet-marker-icon,
                // il figlio diretto è il div .map-marker-num → usare firstElementChild
                document.querySelectorAll('.map-marker-num').forEach(el=>el.classList.remove('selected'));
                this.getElement()?.firstElementChild?.classList.add('selected');
                // FIX B4 V5.0 30/06/26: idx era l'indice dentro valid[] (filtrato per
                // p.lat&&p.lng), non in currentSectionPlaces. Se un punto senza coordinate
                // precedeva altri nella lista, selectPlaceDetail(idx) apriva il dettaglio
                // del punto sbagliato. Si usa l'indice originale via indexOf.
                selectPlaceDetail(currentSectionPlaces.indexOf(p));
            });
            bounds.push([p.lat,p.lng]);
        });
        if(bounds.length)leafletMap.fitBounds(bounds,{padding:[22,22]});
        
        // Apri fullscreen al click sulla mappa (solo se non su marker — gestito da stopPropagation)
        if (leafletMap) {
            leafletMap.on('click', function() {
                openFullscreenMap();
            });
            el.style.cursor = 'pointer';
        }
        
        const starIcon=L.divIcon({html:'<div class="map-marker-star" aria-label="Ancona Centro" role="img">★</div>',className:'',iconSize:[28,28],iconAnchor:[14,14],popupAnchor:[0,-16]});
        L.marker([HOME_COORDS.lat,HOME_COORDS.lng],{icon:starIcon,zIndexOffset:1000}).addTo(leafletMap).bindPopup('<b style="font-size:.78rem">★ Ancona Centro</b><br><span style="font-size:.68rem;color:#888">📍 Piazza Roma 3</span>');
    }

    if('serviceWorker' in navigator)window.addEventListener('load',()=>{
        navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
            // Invia APP_CACHE_NAME al SW (attivo, in waiting o in installazione)
            // così sw.js non ha più bisogno del CACHE_NAME hardcoded
            const sendVersion=sw=>{if(sw)sw.postMessage({type:'SET_CACHE_NAME',cacheName:APP_CACHE_NAME});};
            sendVersion(reg.active);
            sendVersion(reg.waiting);
            sendVersion(reg.installing);

            // Mostra banner se c'è già un SW in waiting al momento del caricamento
            if(reg.waiting) showUpdateBanner(reg.waiting);

            reg.addEventListener('updatefound',()=>{
                const newSW=reg.installing;
                if(!newSW)return;
                sendVersion(newSW);
                newSW.addEventListener('statechange',()=>{
                    if(newSW.state==='installed'&&navigator.serviceWorker.controller){
                        showUpdateBanner(newSW);
                    }
                });
            });
        }).catch(()=>{});

        let _reloading=false;
        navigator.serviceWorker.addEventListener('message',(event)=>{
            if(event.data&&event.data.type==='VERSION_UPDATED'){
                if(!_reloading){
                    _reloading=true;
                    window.location.reload();
                }
            }
        });
        navigator.serviceWorker.addEventListener('controllerchange',()=>{
            if(_reloading)return;
            _reloading=true;
            window.location.reload();
        });
    });

    function showUpdateBanner(swWaiting){
        const banner=document.getElementById('sw-update-banner');
        const btn=document.getElementById('sw-update-btn');
        if(!banner||!btn)return;
        banner.classList.add('visible');
        // Al click: invia skipWaiting al SW in attesa → controllerchange → reload
        const _tap=function(e){
            e.preventDefault();
            btn.removeEventListener('touchend',_tap);
            btn.removeEventListener('click',_tap);
            if(swWaiting)swWaiting.postMessage('skipWaiting');
        };
        btn.addEventListener('touchend',_tap,{passive:false});
        btn.addEventListener('click',_tap);
    }
    window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferredPrompt=e;const installBtn=document.getElementById('install-btn');if(installBtn)installBtn.style.display='inline-flex';});
    window.addEventListener('appinstalled',()=>{deferredPrompt=null;const installBtn=document.getElementById('install-btn');if(installBtn)installBtn.style.display='none';});
    if(window.matchMedia('(display-mode:standalone)').matches){const installBtn=document.getElementById('install-btn');if(installBtn)installBtn.style.display='none';}
    window.addEventListener('load',()=>{const hash=window.location.hash.replace('#','');if(hash&&sectionHashMap[hash]!==undefined)goTo(sectionHashMap[hash]);});
    window.addEventListener('popstate',()=>{const hash=window.location.hash.replace('#','');if(!hash){if(currentSection!==-1)goTo(-1);}else if(sectionHashMap[hash]!==undefined&&sectionHashMap[hash]!==currentSection)goTo(sectionHashMap[hash]);});
    
    // Inizializza fullscreen listeners
    initFullscreenListeners();
    renderAll();
    setTimeout(()=>updateGpsUIFor(gpsState),300);

    // V6.1: pannello diagnostico cache — raggiungibile aggiungendo ?debug=cache all'URL
    // dell'app (es. https://tuosito.it/index.html?debug=cache). Utile per verificare da
    // iPhone/iPad, senza Mac né strumenti sviluppatore, cosa contiene davvero la cache
    // persistente ancona-guida-appfiles (dove vivono data.js/engine.js) e lo stato del
    // service worker. Non è raggiungibile dalla normale navigazione dell'app.
    async function renderCacheDebugPanel(){
        const overlay=document.createElement('div');
        overlay.style.cssText='position:fixed;inset:0;background:#0B1F33;color:#fff;z-index:99999;overflow-y:auto;padding:20px;padding-top:calc(20px + env(safe-area-inset-top,0px));font-family:monospace;font-size:12.5px;line-height:1.6;-webkit-font-smoothing:antialiased';
        overlay.innerHTML='<h2 style="color:#C8A45A;font-family:sans-serif;margin-bottom:4px">🔍 Diagnostica Cache</h2><div style="opacity:.6;margin-bottom:16px;font-family:sans-serif;font-size:12px">Ancona Centro · '+APP_CACHE_NAME+'</div><div id="debug-content">Caricamento…</div><div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap"><button id="debug-close" style="padding:10px 18px;background:#C8A45A;color:#0B1F33;border:none;border-radius:8px;font-weight:700;font-family:sans-serif">Chiudi</button><button id="debug-reload" style="padding:10px 18px;background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);border-radius:8px;font-weight:700;font-family:sans-serif">Ricarica pagina</button><button id="debug-clear" style="padding:10px 18px;background:rgba(220,60,60,.25);color:#fff;border:1px solid rgba(220,60,60,.5);border-radius:8px;font-weight:700;font-family:sans-serif">Svuota tutte le cache</button></div>';
        document.body.appendChild(overlay);
        document.getElementById('debug-close').addEventListener('click',()=>overlay.remove());
        document.getElementById('debug-reload').addEventListener('click',()=>location.reload());
        document.getElementById('debug-clear').addEventListener('click',async()=>{
            const names=await caches.keys();
            for(const n of names) await caches.delete(n);
            if(navigator.serviceWorker){const reg=await navigator.serviceWorker.getRegistration();if(reg)await reg.unregister();}
            alert('Cache svuotate e service worker disinstallato. Ricarica la pagina per reinstallarlo da zero.');
        });

        const contentEl=document.getElementById('debug-content');
        let html='';

        html+='<h3 style="color:#E2C07A;font-family:sans-serif">Service Worker</h3>';
        if('serviceWorker' in navigator){
            const reg=await navigator.serviceWorker.getRegistration();
            if(reg){
                html+='<div>Registrato: ✅</div>';
                html+='<div>Scope: '+reg.scope+'</div>';
                html+='<div>Active: '+(reg.active?('✅ state='+reg.active.state):'❌ nessuno')+'</div>';
                html+='<div>Waiting (aggiornamento in coda): '+(reg.waiting?'⚠️ presente':'nessuno')+'</div>';
                html+='<div>Installing: '+(reg.installing?'⏳ in corso':'nessuno')+'</div>';
            } else {
                html+='<div>❌ Nessun service worker registrato per questa pagina</div>';
            }
        } else {
            html+='<div>❌ Service Worker non supportato da questo browser</div>';
        }

        html+='<h3 style="color:#E2C07A;font-family:sans-serif;margin-top:20px">Version Check (FIX 22/08/26)</h3>';
        try{
            const versionCache=await caches.open('ancona-guida-version-meta');
            const match=await versionCache.match('https://internal.local/__app_version__');
            const savedVersion=match?await match.text():null;
            const currentMeta=document.querySelector('meta[name="version"]')?.getAttribute('content');
            const isSynced=(savedVersion===currentMeta);
            html+='<div>Versione salvata dal SW: <b>'+(savedVersion||'❌ nessuna (mai eseguito con successo)')+'</b></div>';
            html+='<div>Versione corrente pagina: <b>'+(currentMeta||'?')+'</b></div>';
            html+='<div style="margin-top:4px;color:'+(isSynced?'#4ADE80':'#F87171')+'">'+(isSynced?'✅ Sincronizzate':'⚠️ Disallineate — ricarica la pagina per far girare activate')+'</div>';
        }catch(e){
            html+='<div>Errore leggendo la cache di versione: '+e.message+'</div>';
        }

        html+='<h3 style="color:#E2C07A;font-family:sans-serif;margin-top:20px">Cache Storage</h3>';
        try{
            const cacheNames=await caches.keys();
            if(!cacheNames.length) html+='<div>Nessuna cache trovata.</div>';
            for(const name of cacheNames){
                const isAppFiles=(name===APP_FILES_CACHE_NAME_FOR_DEBUG);
                html+='<div style="margin-top:12px;padding:10px;border-radius:8px;background:'+(isAppFiles?'rgba(200,164,90,.15)':'rgba(255,255,255,.05)')+';border:1px solid '+(isAppFiles?'#C8A45A':'rgba(255,255,255,.15)')+'">';
                html+='<div style="font-weight:700;color:'+(isAppFiles?'#E2C07A':'#fff')+';font-family:sans-serif">'+(isAppFiles?'⭐ ':'')+name+'</div>';
                const cache=await caches.open(name);
                const requests=await cache.keys();
                html+='<div style="font-size:11px;opacity:.7;margin-top:4px;font-family:sans-serif">'+requests.length+' elementi</div>';
                if(isAppFiles||requests.length<=15){
                    html+='<ul style="margin:6px 0 0;padding-left:18px">';
                    for(const req of requests){
                        const u=new URL(req.url);
                        html+='<li style="word-break:break-all">'+u.pathname+u.search+'</li>';
                    }
                    html+='</ul>';
                }
                html+='</div>';
            }
        }catch(e){
            html+='<div>Errore leggendo le cache: '+e.message+'</div>';
        }

        contentEl.innerHTML=html;
    }

    // Nome della cache persistente (deve combaciare con APP_FILES_CACHE_NAME in sw.js;
    // duplicato qui solo per evidenziarla nel pannello, nessuna dipendenza funzionale da sw.js).
    const APP_FILES_CACHE_NAME_FOR_DEBUG='ancona-guida-appfiles';
    try{
        if(new URLSearchParams(window.location.search).get('debug')==='cache'){
            window.addEventListener('load',renderCacheDebugPanel);
        }
    }catch(e){}
    