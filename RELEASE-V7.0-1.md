# RELEASE-V7.0-1

## Build 700 · 31/08/26 08:17

---

## Feature nuove

### ✅ 1. Sezione Parcheggi (🅿️)
- Tile 🅿️ aggiunto a HOME_NAV_IDS
- Rendering automatico da `appData.services.parking[]` (5 parcheggi documentati)
- Stessa architettura di altre sezioni (renderPlaceSection)

### ✅ 2. Ricerca globale (🔍)
- Bottone "🔍 Cerca" in home (accanto a "💬 Live Chat")
- Popup modale da fondo dello schermo
- Ricerca in:
  - Nomi POI (priorità alta)
  - Testi lunghi (itLong, enLong, ecc.)
- Navigazione risultati: ◀ Prev / Next ▶
- Counter "X di Y"
- Clicca risultato → naviga alla sezione del POI

---

## Bug fix

### ✅ 1. Icona foto mustsee in didascalia
- **Problema**: Lightbox mustsee mostrava il testo descrittivo della foto come didascalia
- **Fix**: `_detailGalleryData[index].caption` rimane vuoto (non usa più `photoTip`)
- **Risultato**: Lightbox mustsee senza didascalia (come dovrebbe essere)

### ✅ 2. Prezzi ristoranti separati su accapo
- **Problema**: Badge prezzo (€ / €€ / €€€) poteva andare a capo
- **Fix**: Aggiunto CSS `white-space:nowrap` a `.price-badge`
- **Risultato**: Prezzo rimane sempre attaccato al nome

---

## Come testare

### Parcheggi:
1. Home → tile 🅿️ "Parcheggi"
2. Dovrebbe mostrare i 5 parcheggi di Ancona con foto, tariffe, orari

### Ricerca:
1. Home → bottone 🔍 "Cerca" (accanto a Live Chat)
2. Scrivi nome luogo (es. "Conero", "Traiano", "Arco")
3. Dovrebbe mostrare risultati con counter e frecce prev/next
4. Clicca risultato → naviga alla sezione

### Bug fix #1:
1. Sezione "Centro Storico" → qualsiasi mustsee (es. "Arco di Traiano")
2. Clicca sulla foto → lightbox fullscreen
3. Dovrebbe aprirsi SENZA didascalia (il box non dovrebbe apparire)

### Bug fix #2:
1. Sezione "Ristoranti"
2. Nome ristorante + prezzo dovrebbe stare sempre sulla stessa riga

---

## Verificazione timestamp

Footer PWA deve mostrare: **"V7.0 · 31/08/26 08:17"**

---

## File aggiornati

- `index.html` (CSS search modal + CSS home buttons + price badge nowrap)
- `data.js`
- `engine.js` (globalSearch + showSearchResults + renderSection parcheggi + fix photoTip)
- `sw.js`
- `manifest.json`
- `build.txt` (700)

