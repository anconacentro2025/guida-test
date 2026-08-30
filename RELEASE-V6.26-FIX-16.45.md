# V6.26 FIX DRAGGABLE CAPTION — Released 29/08/26 16:45

## Build 626 · 29/08/26 16:45

---

## ATTENZIONE: Nuovo timestamp per distinguerlo dalla versione precedente

**Precedente**: V6.26 29/08/26 16:30 (con bug lightbox)  
**Questa**: V6.26 29/08/26 16:45 (bug lightbox RISOLTO)

Se scarichi file con timestamp **16:45**, il fix è incluso.

---

## Fix applicato

### ✅ Lightbox caption draggable & resizable

**Problema risolto**: 
- Caption occupava tutto lo spazio verticale quando ruotavi il dispositivo
- Box era fisso e non spostabile

**Soluzione**:
- Caption è ora un **box mobile** (fixed positioning)
- **Draggable**: clicca sulla barra "Dettagli" e trascina dove vuoi
- **Resizable**: trascina l'angolo in basso a destra
- **Persistente**: posizione salvata in sessionStorage durante la sessione
- **Touch-friendly**: funziona su smartphone e tablet

---

## Come verificare che hai la versione corretta

**Apri la PWA:**
- Scorri in fondo alla home
- Vedi il footer: **"V6.26 · 29/08/26 16:45"**
- Se vedi **16:45** = hai il fix draggable ✅
- Se vedi **16:30** = hai la versione vecchia con bug ❌

---

## Come testare il fix

1. Sezione "Centro Storico" → "Arco di Traiano"
2. Clicca "partenza della flotta traiana" (foto con didascalia)
3. Dovrebbe apparire un box della didascalia
4. **Testa drag**: clicca sulla barra "Dettagli" (nera) e trascina il box
5. **Testa resize**: trascina l'angolo in basso a destra
6. **Ruota il dispositivo**: il box rimane dove l'hai messo

Se tutto funziona → hai la versione corretta!

---

## File da caricare (con orario 16:45)

- `index.html`
- `data.js`
- `engine.js`
- `sw.js`
- `manifest.json`
- `build.txt`

**IMPORTANTE**: Verifica che i file nel download abbiano **29/08/26 16:45** nel nome o negli attributi.

