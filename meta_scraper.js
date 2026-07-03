window.MetaScraper = {

    AD_CARD_SELECTOR: 'div[class*="x1plvlek"][class*="xpilrb4"][class*="x1lun4ml"]',

    async startScraping(options) {
        console.log("[MetaScraper] Avvio scraping...");

        const savedSpeed = localStorage.getItem('havas_capture_speed');
        const speedFactor = savedSpeed ? parseFloat(savedSpeed) : 1.0;
        const fastWait = (ms) => new Promise(r => setTimeout(r, ms / speedFactor));

        await fastWait(1500);

        const maxAds = options.maxAds || 30;
        const capturedAds = new Set();
        let results = [];
        const controlUI = document.getElementById('capture-control-ui');
        const adElementMap = new Map();

        // ─────────────────────────────────────────────────────────
        // HELPER: ritaglia screenshot
        // ─────────────────────────────────────────────────────────
        const internalCrop = (dataUrl, area) => new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const dpr = window.devicePixelRatio || 1;
                // Manteniamo le dimensioni canvas standard (1x) per evitare limiti di memoria Chrome (max 64MB)
                canvas.width = area.width;
                canvas.height = area.height;
                ctx.drawImage(img,
                    area.x * dpr, area.y * dpr, area.width * dpr, area.height * dpr,
                    0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/png'));
            };
            img.src = dataUrl;
        });

        // ─────────────────────────────────────────────────────────
        // HELPER: trova pulsante "Vedi dettagli" dentro una card
        // Struttura DOM reale:
        //   div[role="button"][tabindex="0"].x1i10hfl  ← il button cliccabile
        //     ...
        //       div.x8t9es0.x1fvot60.xxio538.x1heor9g.xuxw1ft.x6ikm8r.x10wlt62.xlyipyv.x1h4wwuj.x1pd3egz.xeuugli
        //         "Vedi dettagli dell'inserzione"   ← nodo testo diretto
        // ─────────────────────────────────────────────────────────
        const findDetailsButton = (adEl) => {
            // Cerca tutti i div con la classe caratteristica del label
            const labels = adEl.querySelectorAll(
                'div.x8t9es0.x1fvot60.xxio538.x1heor9g.xuxw1ft.x6ikm8r.x10wlt62.xlyipyv.x1h4wwuj.x1pd3egz.xeuugli'
            );
            for (const label of labels) {
                const txt = (label.textContent || '').trim();
                if (/^(Vedi dettagli dell.inserzione|See ad details)$/i.test(txt)) {
                    // Risali fino al div[role="button"]
                    let cur = label.parentElement;
                    for (let i = 0; i < 6; i++) {
                        if (!cur) break;
                        if (cur.getAttribute('role') === 'button' &&
                            cur.getAttribute('tabindex') === '0') return cur;
                        cur = cur.parentElement;
                    }
                }
            }
            return null;
        };

        // ─────────────────────────────────────────────────────────
        // HELPER: attendi apertura dialog
        // ─────────────────────────────────────────────────────────
        const waitForDialog = async () => {
            for (let i = 0; i < 30; i++) {
                const d = document.querySelector('div[role="dialog"][aria-labelledby]');
                if (d && d.offsetHeight > 100) return d;
                await fastWait(200);
            }
            return null;
        };

        // ─────────────────────────────────────────────────────────────
        // HELPER: espandi tutte le sezioni collassabili nel dialog
        //
        // NUOVA struttura DOM (aggiornamento Meta 2026):
        //   Il dialog contiene un panel scrollabile. Dentro il panel,
        //   gli header e i contenuti sono SIBLINGS piatti:
        //
        //   div (panel scrollabile)
        //     div[role="link"][tabindex="0"]   ← HEADER sezione
        //       div[role="heading"]  "Titolo"
        //       div[role="presentation"]       ← freccia apri/chiudi
        //     div (contenuto sezione)           ← sibling successivo
        //     div[role="link"][tabindex="0"]   ← HEADER sezione successiva
        //     ...
        // ─────────────────────────────────────────────────────────────

        /**
         * Trova tutti gli header di sezioni collassabili nel dialog.
         * Sono div[role="link"][tabindex="0"] che contengono un [role="heading"].
         */
        const findSectionHeaders = (dialog) => {
            const allLinks = dialog.querySelectorAll('div[role="link"][tabindex="0"]');
            return Array.from(allLinks).filter(link => {
                return link.querySelector('[role="heading"]') !== null;
            });
        };

        /**
         * Determina se una sezione è chiusa.
         * Controlla se esistono siblings con contenuto visibile tra
         * questo header e il prossimo header (o fine del parent).
         */
        const isSectionClosed = (header) => {
            const parent = header.parentElement;
            if (!parent) return true;

            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(header);
            if (idx < 0) return true;

            // Raccogli i siblings dopo questo header fino al prossimo header
            let hasContent = false;
            for (let i = idx + 1; i < siblings.length; i++) {
                const sib = siblings[i];
                // Se è un altro header, ci fermiamo
                if (sib.getAttribute('role') === 'link' &&
                    sib.getAttribute('tabindex') === '0' &&
                    sib.querySelector('[role="heading"]')) {
                    break;
                }
                // Se ha contenuto visibile (testo o tabelle)
                if ((sib.innerText || '').trim().length > 0 || sib.querySelector('table')) {
                    hasContent = true;
                    break;
                }
            }
            return !hasContent;
        };

        const expandAll = async (dialog) => {
            const headers = findSectionHeaders(dialog);
            console.log('[MetaScraper] Sezioni collassabili trovate: ' + headers.length);

            for (const header of headers) {
                const titleEl = header.querySelector('[role="heading"]');
                const title = titleEl ? titleEl.innerText.trim() : '?';

                if (!isSectionClosed(header)) {
                    console.log('[MetaScraper] Già aperta: "' + title + '"');
                    continue;
                }

                console.log('[MetaScraper] Espando: "' + title + '"');
                header.click();

                // Aspetta che il contenuto appaia (max 3s)
                for (let w = 0; w < 20; w++) {
                    await fastWait(150);
                    if (!isSectionClosed(header)) break;
                }
                await fastWait(200);
            }
        };

        // ─────────────────────────────────────────────────────────────
        // HELPER: leggi il testo del contenuto espanso di una sezione
        // Nuova struttura: raccogli il testo dai siblings successivi
        // all'header fino al prossimo header (o fine del parent)
        // ─────────────────────────────────────────────────────────────
        const getSectionText = (header) => {
            const parent = header.parentElement;
            if (!parent) return '';

            const siblings = Array.from(parent.children);
            const idx = siblings.indexOf(header);
            if (idx < 0) return '';

            const texts = [];
            for (let i = idx + 1; i < siblings.length; i++) {
                const sib = siblings[i];
                // Se è un altro header di sezione, ci fermiamo
                if (sib.getAttribute('role') === 'link' &&
                    sib.getAttribute('tabindex') === '0' &&
                    sib.querySelector('[role="heading"]')) {
                    break;
                }
                const t = (sib.innerText || '').trim();
                if (t) texts.push(t);
            }
            return texts.join('\n');
        };

        // ─────────────────────────────────────────────────────────
        // HELPER: estrai tutti i dati dal dialog aperto
        // ─────────────────────────────────────────────────────────
        const extractDetails = async () => {
            const dialog = await waitForDialog();
            if (!dialog) {
                console.warn('[MetaScraper] Dialog non trovato.');
                return {};
            }

            await expandAll(dialog);

            // --- NUOVO: Scroll visivo all'interno del popup ---
            console.log('[MetaScraper] Eseguo scroll interno del dialog...');
            const sectionsForScroll = dialog.querySelectorAll('div[role="link"][tabindex="0"], span[dir="auto"]');
            for (let i = 0; i < sectionsForScroll.length; i++) {
                // Scorri un elemento su 3 per velocizzare ma garantire lo scroll fino in fondo
                if (i % 3 === 0 || i === sectionsForScroll.length - 1) {
                    sectionsForScroll[i].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await fastWait(300); // Pausa per far caricare il testo e mostrare l'azione all'utente
                }
            }
            // Torna in cima prima di selezionare
            dialog.scrollIntoView({ behavior: 'instant', block: 'start' });
            await fastWait(300);
            // --------------------------------------------------

            // =========================================================
            // NUOVA AGGIUNTA: SELEZIONE VISIVA DEL TESTO IN BLU (EFFETTO MOUSE)
            // =========================================================
            console.log('[MetaScraper] Simulo la selezione visiva del testo...');

            // Crea un "range" che simula il trascinamento del mouse
            const selection = window.getSelection();
            const range = document.createRange();

            // Seleziona tutto il contenuto all'interno del popup (dialog)
            range.selectNodeContents(dialog);

            // Applica la selezione (vedrai il testo diventare BLU)
            selection.removeAllRanges();
            selection.addRange(range);

            // Aspetta quasi 1 secondo per permetterti di VEDERE la selezione chiara
            await fastWait(800);

            // Rimuove l'evidenziatore blu prima di chiudere la finestra
            selection.removeAllRanges();
            // =========================================================

            const fullText = dialog.innerText || '';
            const details = {};

            // Campi fissi intestazione
            const statusM = fullText.match(/\b(Attiv[ao]|Inattiv[ao]|Active|Inactive)\b/i);
            details.adStatus = statusM ? statusM[1] : '';

            const idM = fullText.match(/ID\s+libreria[:\s]*(\d+)/i);
            details.libraryId = idM ? idM[1] : '';

            const dateM = fullText.match(/Data di inizio della pubblicazione[:\s]*([^\n]+)/i)
                || fullText.match(/Started running on[:\s]*([^\n]+)/i);
            details.startDateFromPanel = dateM ? dateM[1].trim() : '';

            details.hasMultipleVersions =
                /Questa inserzione ha più versioni|This ad has multiple versions/i.test(fullText);

            // Sezioni espanse — nuova struttura a siblings piatti
            const sectionHeaders = findSectionHeaders(dialog);

            details.sections = {};
            for (const header of sectionHeaders) {
                const titleEl = header.querySelector('[role="heading"]');
                const title = titleEl ? titleEl.innerText.trim() : '?';
                const text = getSectionText(header);
                details.sections[title] = text;

                if (/trasparenza/i.test(title)) details.locationTransparency = text;
                if (/inserzionista/i.test(title) && !/pagante/i.test(title)) details.advertiserInfo = text;
                if (/pagante/i.test(title)) details.advertiserAndPayer = text;
            }

            details.rawDetailText = fullText.trim();

            console.log('[MetaScraper] Dettagli estratti:', {
                adStatus: details.adStatus,
                libraryId: details.libraryId,
                sezioni: Object.entries(details.sections).map(([k, v]) => `${k}: ${v.length}ch`)
            });

            return details;
        };

        // ─────────────────────────────────────────────────────────
        // HELPER: chiudi il dialog
        // Il pulsante "Chiudi" nel DOM reale ha all'interno un
        // div[data-sscoverage-ignore="true"] con testo "Chiudi"
        // ─────────────────────────────────────────────────────────
        const closeDialog = async () => {
            const dialog = document.querySelector('div[role="dialog"][aria-labelledby]');
            if (!dialog) return;

            for (const btn of dialog.querySelectorAll('div[role="button"][tabindex="0"]')) {
                const inner = btn.querySelector('[data-sscoverage-ignore]');
                if (inner && /^(Chiudi|Close)$/i.test((inner.textContent || '').trim())) {
                    btn.click();
                    await fastWait(700);
                    return;
                }
                if (/^(Chiudi|Close)$/i.test((btn.innerText || '').trim())) {
                    btn.click();
                    await fastWait(700);
                    return;
                }
            }
            document.dispatchEvent(new KeyboardEvent('keydown',
                { key: 'Escape', bubbles: true, cancelable: true }));
            await fastWait(700);
        };


        // ═══════════════════════════════════════════════════════════
        //  FASE 1 — Screenshot di tutti gli annunci
        // ═══════════════════════════════════════════════════════════
        console.log('[MetaScraper] ── FASE 1: screenshot ──');

        let emptyCycles = 0;
        while (capturedAds.size < maxAds && emptyCycles < 6) {

            const allAds = Array.from(document.querySelectorAll(this.AD_CARD_SELECTOR));
            const newAds = allAds.filter(ad => {
                const m = ad.innerText.match(/(?:ID|ID libreria)[:\s]*(\d+)/i);
                return m && !capturedAds.has(m[1]);
            });

            if (newAds.length === 0) {
                window.scrollBy(0, 2000);
                await fastWait(3000);
                emptyCycles++;
                continue;
            }
            emptyCycles = 0;

            for (const ad of newAds) {
                if (capturedAds.size >= maxAds) break;

                const idM = ad.innerText.match(/(?:ID|ID libreria)[:\s]*(\d+)/i);
                const adId = idM ? idM[1] : ('idx-' + Date.now() + '-' + Math.random());

                ad.scrollIntoView({ block: 'center', behavior: 'instant' });
                await fastWait(800);

                const rect = ad.getBoundingClientRect();
                const brand = (ad.querySelector('img[alt]') || {}).alt || 'Meta Ad';

                // Estrai data inizio
                let startingDate = '';
                const dateM = ad.innerText.match(
                    /(?:Data di inizio della pubblicazione|Started running on|Inizio della pubblicazione|Inizio pubblicazione)[:\s]*([^\n]+)/i
                );
                if (dateM) startingDate = dateM[1].trim();

                // Estrai caption
                let caption = '';
                const bodyEl = ad.querySelector('div[style*="white-space: pre-wrap"]');
                if (bodyEl) {
                    caption = bodyEl.innerText.trim();
                } else {
                    const parts = ad.innerText.split(
                        /See (?:ad|summary) details|Vedi (?:i )?dettagli(?: della sintesi)?/i
                    );
                    caption = parts.length > 1 ? parts[1].trim() : '';
                }

                try {
                    if (controlUI) controlUI.style.display = 'none';
                    await new Promise(r => setTimeout(r, 150));

                    const response = await chrome.runtime.sendMessage({ action: 'captureChunk' });

                    if (controlUI) controlUI.style.display = 'flex';

                    // ⚠️ NON usare optional chaining (?.) — può causare SyntaxError
                    if (response && response.dataUrl) {
                        const croppedUrl = await internalCrop(response.dataUrl, {
                            x: rect.left, y: rect.top, width: rect.width, height: rect.height
                        });

                        results.push({
                            adId,
                            dataUrl: croppedUrl,
                            brandName: brand,
                            caption: caption,
                            category: 'Meta Ads Library',
                            startingDate: startingDate,
                            period: options.metaPeriod || '',
                            country: options.targetCountry || '',
                            date: new Date().toLocaleDateString('it-IT')
                        });

                        capturedAds.add(adId);
                        adElementMap.set(adId, ad);
                        console.log('[MetaScraper] Screen ' + capturedAds.size + '/' + maxAds + ' — ID: ' + adId);
                    } else {
                        console.warn('[MetaScraper] captureChunk senza dataUrl per ID: ' + adId);
                    }
                } catch (err) {
                    if (controlUI) controlUI.style.display = 'flex';
                    console.error('[MetaScraper] Errore screenshot:', err);
                }
            }
        }

        console.log('[MetaScraper] Fase 1 completata — ' + results.length + ' annunci.');

        // ═══════════════════════════════════════════════════════════
        //  FASE 2 — Apri dettagli per ogni annuncio catturato
        // ═══════════════════════════════════════════════════════════
        console.log('[MetaScraper] ── FASE 2: dettagli inserzioni ──');

        // Torna in cima prima di iniziare
        window.scrollTo({ top: 0, behavior: 'instant' });
        await fastWait(1200);

        for (let i = 0; i < results.length; i++) {
            const adId = results[i].adId;
            console.log('[MetaScraper] Dettagli ' + (i + 1) + '/' + results.length + ' — ID: ' + adId);

            // ── Recupera / ri-trova l'elemento DOM della card ──
            let adEl = adElementMap.get(adId);

            if (!adEl || !document.contains(adEl)) {
                // Meta usa rendering virtuale: la card potrebbe essere stata rimossa dal DOM.
                // Scorri la pagina finché non la ritroviamo.
                let found = false;

                // Prima prova a scorrere verso l'alto (le prime card)
                window.scrollTo({ top: 0, behavior: 'instant' });
                await fastWait(800);

                for (let attempt = 0; attempt < 25 && !found; attempt++) {
                    const visible = document.querySelectorAll(this.AD_CARD_SELECTOR);
                    for (const c of visible) {
                        const m = c.innerText.match(/(?:ID|ID libreria)[:\s]*(\d+)/i);
                        if (m && m[1] === adId) {
                            adEl = c;
                            adElementMap.set(adId, adEl);
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        window.scrollBy(0, 1200);
                        await fastWait(1200);
                    }
                }

                if (!found) {
                    console.warn('[MetaScraper] Card ID ' + adId + ' non raggiungibile, salto.');
                    continue;
                }
            }

            // ── Porta la card al centro e aspetta che sia visibile ──
            adEl.scrollIntoView({ block: 'center', behavior: 'instant' });
            await fastWait(800);

            // ── Clicca "Vedi dettagli dell'inserzione" ──
            const btn = findDetailsButton(adEl);
            if (!btn) {
                console.warn('[MetaScraper] Pulsante dettagli non trovato per ID ' + adId);
                continue;
            }

            btn.click();
            await fastWait(1500); // aspetta apertura dialog

            // ── Estrai dati (espande le sezioni internamente) ──
            const details = await extractDetails();
            results[i].adDetails = details;

            // TRUCCO: Nascondiamo i dettagli dentro la caption per aggirare il blocco di Chrome!
            if (details && details.rawDetailText) {
                results[i].caption = (results[i].caption || '') + '|||META_DETAILS|||' + details.rawDetailText;
            }

            // ── Chiudi il dialog e aspetta chiusura completa ──
            await closeDialog();
            await fastWait(800);
        }

        console.log('[MetaScraper] Completato — ' + results.length + ' annunci con dettagli.');
        return results;
    }
};
