# Social Web Capture

Estensione **Chrome (Manifest V3)** (*Havas Social Competitive 2.0*) per la raccolta dati, cattura screenshot ed esportazione automatizzata di report competitivi da web e piattaforme social.

## Funzionalità principali

- **Scraping & Cattura**: raccolta contenuti e metadati tramite `content_script.js`, `google_scraper.js`, `meta_scraper.js` e `meta_library.js`.
- **Gestione Ritagli & Mercati**: ritaglio visivo (`crop-canvas.js`), gestione mercati, benchmark strategico e cronologia delle analisi.
- **Esportazione Multi-Formato** interamente lato client:
  - **PowerPoint (`.pptx`)** tramite `pptxgen.bundle.js`
  - **Excel (`.xlsx`)** con anteprima XLS tramite `exceljs.min.js` e `xlsx.full.min.js`
  - **PDF (`.pdf`)** tramite `jspdf.umd.min.js`
  - **Archivi (`.zip`)** tramite `jszip.min.js`

## Installazione manuale (Chrome / Edge)

1. Clona o scarica questa repository.
2. Apri `chrome://extensions` (o `edge://extensions`) e attiva la **Modalità sviluppatore**.
3. Clicca su **Carica estensione non pacchettizzata** e seleziona la cartella del progetto.
