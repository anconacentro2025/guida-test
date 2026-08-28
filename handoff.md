# Handoff PWA — Ancona Centro Guida Ospiti

**Data**: 26/08/26 20:20
**Versione rilasciata**: V6.22 · 26/08/26 20:20 (build 622)
**Stato**: STABILE, tutti i file verificati con `node --check`. Ci sono però 5 richieste
appena arrivate e MAI applicate (vedi sezione dedicata sotto) — prima cosa da fare nella
prossima chat.

---

## ⚠️ RICHIESTE PENDENTI — NON ANCORA APPLICATE

Queste 5 richieste sono arrivate nell'ultimo scambio della chat precedente. Sono state
**verificate ma non implementate** — la chat è stata chiusa subito dopo la verifica.

### 1. Etichetta home "Servizi & Market" → aggiungere "parcheggi"
Stato attuale (V6.22): `it:'Servizi & Market'` (riga ~1183 di data.js, dentro l'array
`sections`). Da valutare: la tile home è piccola, un'etichetta più lunga rischia di andare
a capo male — non verificato visivamente, nessun accesso a rendering grafico in questo
ambiente.

### 2. Link Museo Tattile Omero in Mole Vanvitelliana
Attualmente (riga ~692 di data.js) usa una ricerca testuale generica:
```js
extraMap:{ label:'🖐️ Museo Tattile Omero', query:'Museo Tattile Statale Omero Ancona' }
```
Va sostituito con l'URL diretto fornito dall'host:
`https://museoomero.it/en/museum/plan-your-visit/`
**Attenzione tecnica**: `extraMap` oggi usa `query` (passato a `getMapLink()` per generare
un link di ricerca Google Maps). Per un URL diretto va usato il campo `url` invece di
`query` — verificare in engine.js la riga:
```js
if(!isSubMode&&p.extraMap){const extraHref=p.extraMap.url||getMapLink(p.extraMap.query,true);...}
```
`p.extraMap.url` ha già precedenza su `query` se presente — basta aggiungere
`url:'https://museoomero.it/en/museum/plan-your-visit/'` all'oggetto `extraMap`, il
meccanismo di fallback esiste già (visto già usato altrove, es. Spiaggia della Torre con
la webcam).

### 3. Prezzi ristoranti: aumentare tutti di un €
Formato attuale confermato: campo `price:'€'` o `price:'€€'` (solo questi due valori
trovati). "Aumentare di un €" → `€`→`€€`, `€€`→`€€€`. **Da fare**: contare quanti
ristoranti hanno `price:'€'` e quanti `price:'€€'` prima di sostituire, e verificare che
nell'array `restaurants` non ci siano voci SENZA il campo `price` (in tal caso "aumentare"
non si applica, vanno lasciate stare — controllare `Bar Torino`, `Cremeria Pincini`,
`Gelati Radicali`, `Il Chiosco Da Morena`, `Bar Giuliani` che nel dataset originale NON
avevano `price` essendo bar/gelaterie, non ristoranti in senso stretto — valutare con
l'host se vanno escluse).

### 4. Testo Fortezza della Cittadella — sostituire il "secondo periodo" dell'approfondimento
Nuovo testo fornito dall'host (da tradurre in EN/DE/PL, con lo stesso disclaimer di
traduzione-non-verificata-da-madrelingua già applicato altrove in questo progetto):

> Oggi la Fortezza della Cittadella è la sede permanente del segretariato dell'Iniziativa
> adriatico-ionica (IAI o AII), un'organizzazione internazionale nata nel 2000; ne sono
> membri i paesi che si affacciano sui mari Adriatico e Ionio. È un forum intergovernativo
> per la cooperazione regionale nell'Euroregione adriatico-ionica, che ha lo scopo di
> promuovere l'allargamento dell'Unione europea nei paesi balcanici.

**Attenzione**: l'host dice "il secondo periodo" (paragrafo) — va verificato con precisione
QUALE dei paragrafi esistenti in `itLong` di Fortezza della Cittadella (riga ~608-618 di
data.js) intende sostituire, leggendo il testo attuale completo prima di agire (non ancora
riletto interamente in questa sessione, solo individuata la riga di inizio/fine voce).

### 5. Nuova didascalia per un link foto — testo "Scena 58"
L'host ha fornito testo per una didascalia legata a "colonna-traiano-2.webp" (attenzione:
l'host ha scritto "colonna-traiana-2.webp", verificare se è un refuso — il file esistente
già linkato nel progetto si chiama `colonna-traiano.webp`, senza "-2", nella voce Arco di
Traiano). Testo fornito:

> **Scena 58 - seconda guerra dacica - 105 d.C.**
> Rappresenta la partenza della flotta di Traiano per la seconda guerra dacica (105 d.C.).
> Le navi, triremi e biremi, sono pronte a salpare nella notte nonostante il forte vento.
> L'imperatore, al centro della flotta, illuminato da una lanterna e accompagnato dalle
> insegne militari, incita i suoi uomini alla partenza.
> Sul fondo sono raffigurati diversi elementi architettonici che permettono di identificare
> il porto con Ancona: il tempio di Venere sulla sommità del colle, il tempio di Diomede sul
> mare, la strada a tornanti, il colonnato del foro, l'edificio ad archi dei cantieri navali
> e soprattutto il molo con l'Arco di Traiano, sormontato dalle statue di Mercurio, Nettuno
> e Portuno. La scena documenta quindi l'importanza strategica del porto di Ancona nei
> collegamenti tra l'Italia e l'Oriente.

**Questo si collega direttamente alla funzionalità già pronta in V6.22**: `openLightbox()`
ora accetta un secondo parametro opzionale per la didascalia (vedi sezione "Funzionalità
pronte ma non ancora usate" sotto). Probabilmente questo testo va lì — verificare con
l'host se lo vuole come didascalia del lightbox o come nuovo `itLong` per un file che
attualmente non esiste ancora nel dataset (chiarire prima di agire: il file
`colonna-traiano.webp` esiste già ed è già linkato nel testo di Arco di Traiano; se
l'host intende una FOTO AGGIUNTIVA — "-2" — va verificato che esista sul repository
immagini, cosa che non è verificabile da questo ambiente sandbox, nessun accesso di rete).

---

## STATO ATTUALE (verificato, V6.22)

### Versioning — sincronizzato ovunque
- Commenti intestazione: `V6.22 · 26/08/26 20:20` in data.js, engine.js, sw.js
- `meta name="version"`: `V6.22-26082020`
- `APP_CACHE_NAME` (engine.js) e `CACHE_NAME` fallback (sw.js): entrambi
  `ancona-guida-v6.22-26082020` — **devono sempre essere identici**, è la causa del bug di
  cache più grave risolto in questa sessione (vedi changelog V6.15)
- `build.txt` e `BUILD_NUMBER` (engine.js): entrambi `622`
- Query string script in index.html: `data.js?v=6.22`, `engine.js?v=6.22`

### File del progetto
- `index.html` — struttura, CSS inline, meta tag versione
- `data.js` — tutti i contenuti (POI, ristoranti, servizi, appartamento, gastronomia)
- `engine.js` — tutta la logica di rendering, mappa, GPS, cache, service worker registration
- `sw.js` — service worker (cache, offline, invalidazione versione)
- `manifest.json` — icone e metadati PWA
- `build.txt` — **file nuovo da V6.19**, contiene solo il numero di build, non dimenticarlo
  nei caricamenti

---

## REGOLE DI RILASCIO (stabilite in questa sessione, seguirle sempre)

1. Recuperare data/ora con `user_time_v0`, arrotondare ai 10 minuti
2. Stesso numero di versione in TUTTI i file (commenti + meta tag + title + og:title +
   footer + release-time span + `?v=` sugli script)
3. `APP_CACHE_NAME` (engine.js) e `CACHE_NAME` fallback (sw.js) sempre identici — è il bug
   più insidioso, differiscono facilmente se ci si dimentica di uno dei due file
4. `build.txt` e `BUILD_NUMBER` sempre allineati e incrementati ad ogni rilascio (altrimenti
   il meccanismo di controllo versione introdotto in V6.19 non si accorge della release)
5. `node --check` su data.js, engine.js, sw.js dopo ogni modifica
6. Verifica grep che non resti nessun residuo della versione precedente
7. Changelog scritto ad ogni bump, senza bisogno che l'host lo richieda
8. Non dare mai per scontato un fix "concordato in chat" sia stato davvero scritto nel
   file — è già successo due volte in questa sessione di dimenticare un fix approvato
   (Loggia dei Mercanti, sia il paragrafo che la nota "tre leoni") — **verificare sempre
   col grep prima di dire "fatto" o "rilasciato"**

---

## PRINCIPI EDITORIALI STABILITI IN QUESTA SESSIONE

- **Contenuto originale (italiano) è sempre quello approvato dall'host** — le altre 3
  lingue vanno sempre allineate a quello, mai il contrario
- **Ogni traduzione EN/DE/PL scritta da Claude va dichiarata esplicitamente come non
  verificata da madrelingua** — non fingere fluenza che non c'è
- **Non riempire buchi di contenuto per conto proprio** senza dichiararlo (es. tempo di
  visita stimato, distanze) — se è una stima/invenzione plausibile, va detto chiaramente
- **Verificare prima di agire**: non fidarsi ciecamente nemmeno dei propri script di
  controllo — in questa sessione un mio script di scansione ha prodotto due falsi positivi
  (bug di tracciamento su oggetti senza campo `name:`) prima di essere corretto

---

## LIMITI TECNICI NOTI (permanenti, non risolvibili da codice)

- **Icona sulla schermata Home**: il telefono la salva fuori da qualsiasi meccanismo
  controllabile dall'app. Nessuna soluzione software esiste — cancellare e rimettere
  l'icona resta l'unico modo per vederla aggiornata. Non riguarda il contenuto dell'app
  (quello si aggiorna correttamente dalla V6.15 in poi).
- **Nessun accesso di rete in questo ambiente sandbox**: non posso verificare l'esistenza
  reale di file immagine sul repository GitHub, non posso controllare mappe/coordinate,
  non posso scaricare pacchetti npm (l'unico strumento di minificazione disponibile è
  `esbuild`, già presente come dipendenza di `tsx` in `/home/claude/.npm-global/lib/
  node_modules/tsx/node_modules/esbuild/bin/esbuild` — funziona, testato, ma va sempre
  usato con `--log-limit=0` per non perdere avvisi importanti, vedi sotto)

---

## OTTIMIZZAZIONE PESO FILE — richiesta ma MAI completata

L'host aveva chiesto di ridurre il peso di data.js/engine.js. È stato verificato che
`esbuild` (già installato) funziona:

| File | Peso attuale | Minificato | Riduzione |
|---|---|---|---|
| data.js | ~283 KB | ~275 KB | ~3% (quasi tutto testo multilingua, poco comprimibile) |
| engine.js | ~117 KB | ~82 KB | ~30% |

**Non è mai stata implementata nel progetto reale** — il test è stato fatto solo su copie
in `/tmp`, mai applicato ai file di produzione. Se ripresa: attenzione, il primo test di
minificazione ha scovato il bug delle 5 chiavi duplicate (già risolto in V6.21) — utile
rieseguire `esbuild --log-limit=0` come controllo di qualità ogni volta prima di
minificare per davvero, non solo per comprimere.

---

## FUNZIONALITÀ PRONTE MA NON ANCORA USATE

`openLightbox(photosCsv, caption)` (V6.22) accetta ora un secondo parametro opzionale per
la didascalia sotto la foto nel lightbox. Nessun link esistente lo usa ancora — l'host
fornirà i testi delle didascalie uno alla volta. Quando arrivano: aggiungere il secondo
parametro alla chiamata specifica in data.js, es.:
```js
onclick="openLightbox('nomefile.webp', 'Testo didascalia qui')"
```
Retrocompatibile, verificato: le chiamate senza secondo parametro continuano a funzionare
identiche a prima.

---

## STRUTTURA DATI (data.js)

- `appData.apartment` — wifi, access, keys, checkin, checkout, quietHours, recycling,
  water, reach.{auto,train,ferry,airport} — tutti verificati completi in 4 lingue
- `appData.services` — supermarkets[], parking[], other[] — tutti verificati completi
- `appData.gastronomy` — intro, hostTip, dishes[] (7 piatti) — tutti verificati completi
- `appData.restaurants` — array piatto, campo `price:'€'` o `'€€'` (vedi punto pendente 3)
- `appData.mustsee` — Centro Storico, 22 voci numerate (1-21 + '7-bis'), **verificato senza
  duplicati numerici dopo il fix del bug 'order:\'6b\'' vs '6-bis'** (V6.17)
- `appData.cardeto` — 11 voci, riordinate fisicamente nell'array (non viene sortato a
  runtime, l'ordine visivo segue l'ordine di inserimento)
- `sections` array (fondo file, prima di `sectionHashMap`) — 14 sezioni totali, di cui solo
  6 mostrate in home/nav (`HOME_NAV_IDS` in engine.js): apartment, contact, services,
  restaurants, usefulinfo, itinerari. Le altre 8 (mustsee, passetto, cardeto, porto,
  beaches, portonovo, conero, borghi) sono raggiungibili solo tramite il picker
  "Itinerari" o link diretti tipo `#mustsee` (ancora funzionanti, indici non toccati)

---

## STRUMENTI VERIFICATI DISPONIBILI IN QUESTO AMBIENTE

- Node.js v22.22.2, `node --check` per validazione sintattica
- `esbuild` (via tsx) per minificazione e — utile! — rilevamento di chiavi duplicate negli
  oggetti letterali, usato più volte come controllo qualità in questa sessione
- **Nessun accesso di rete** in uscita (verificato: `registry.npmjs.org` non raggiungibile,
  nessun modo di scaricare pacchetti npm aggiuntivi non già presenti)

---

## CONTATTI SVILUPPO

Database tecnico: data.js
Logica rendering: engine.js
Stili/layout: index.html
Cache/offline: sw.js
Controllo versione ad ogni apertura: build.txt + BUILD_NUMBER in engine.js

---

**PROSSIMA AZIONE**: riprendere dalle 5 richieste pendenti elencate in cima a questo
documento, verificandole una per una sui file reali prima di applicarle (specialmente il
punto 5, che ha un'ambiguità sul nome del file da chiarire con l'host).
