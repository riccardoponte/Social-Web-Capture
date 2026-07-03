// google_scraper.js - Scraping Google Ads Transparency Center
console.log("🚀🚀🚀 [GoogleScraper] Script caricato! Timestamp:", Date.now());
console.log("🚀🚀🚀 [GoogleScraper] URL corrente:", window.location.href);
console.log("🚀🚀🚀 [GoogleScraper] Document ready state:", document.readyState);

// Verifica immediata che lo script sia caricato
if (window.GoogleScraper) {
    console.warn("⚠️ GoogleScraper già definito! Possibile doppio caricamento.");
} else {
    console.log("✅ Prima definizione di GoogleScraper");
}

window.GoogleScraper = {
    AD_CARD_SELECTOR: 'creative-preview',

    async startScraping(options) {
        console.log("=".repeat(80));
        console.log("[GoogleScraper] 🚀 INIZIO SCRAPING - Timestamp:", Date.now());
        console.log("=".repeat(80));
        console.log("[GoogleScraper] 📋 Parametri ricevuti:", JSON.stringify(options, null, 2));
        console.log("[GoogleScraper] 🌐 URL corrente:", window.location.href);
        console.log("[GoogleScraper] 📄 Document ready state:", document.readyState);

        const savedSpeed = localStorage.getItem('havas_capture_speed');
        const speedFactor = savedSpeed ? parseFloat(savedSpeed) : 1.0;
        const fastWait = (ms) => new Promise(r => setTimeout(r, ms / speedFactor));

        // 0. VERIFICA CHE LA PAGINA SIA COMPLETAMENTE CARICATA
        console.log("[GoogleScraper] 🔍 Verifico stato caricamento pagina...");
        if (document.readyState !== 'complete') {
            console.log("[GoogleScraper] ⏳ Pagina non ancora caricata, attendo...");
            await new Promise(resolve => {
                if (document.readyState === 'complete') {
                    resolve();
                } else {
                    window.addEventListener('load', resolve, { once: true });
                }
            });
            console.log("[GoogleScraper] ✅ Pagina caricata!");
        } else {
            console.log("[GoogleScraper] ✅ Pagina già caricata!");
        }

        // 1. Aspetta il caricamento iniziale della pagina overview
        console.log("[GoogleScraper] ⏳ Attendo caricamento iniziale della pagina...");
        await fastWait(5000);

        // 2. CLICK "SEE ALL ADS" / "VISUALIZZA TUTTI GLI ANNUNCI"
        // La pagina di Google Ads Transparency mostra prima una panoramica (overview).
        // Bisogna cliccare "See all ads" per caricare la griglia degli annunci.
        console.log("[GoogleScraper] Cerco il pulsante 'See all ads'...");
        const seeAllKeywords = ['see all ads', 'visualizza tutti', 'vedi tutti gli annunci', 'vedi tutti', 'see all', 'mostra tutti'];
        let seeAllButtonFound = false;

        for (let attempt = 0; attempt < 8; attempt++) {
            // Cerca in modo più aggressivo includendo anche elementi con aria-label
            const allClickables = document.querySelectorAll('a, button, div[role="button"], span[role="button"], material-button, [aria-label]');
            for (const el of allClickables) {
                const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
                const combinedText = text + ' ' + ariaLabel;

                if (seeAllKeywords.some(k => combinedText.includes(k))) {
                    console.log(`[GoogleScraper] ✅ Trovato pulsante "See all ads": "${el.innerText.trim() || el.getAttribute('aria-label')}". Clicco...`);
                    el.click();
                    seeAllButtonFound = true;
                    await fastWait(6000); // Attendi caricamento della griglia completa (aumentato)

                    // Verifica che gli annunci siano effettivamente caricati
                    const adsLoaded = document.querySelectorAll(this.AD_CARD_SELECTOR).length;
                    console.log(`[GoogleScraper] Dopo click "See all ads": ${adsLoaded} annunci trovati`);

                    if (adsLoaded > 0) {
                        console.log(`[GoogleScraper] ✅ Griglia annunci caricata con successo`);
                        break;
                    } else {
                        console.log(`[GoogleScraper] ⚠️ Nessun annuncio trovato dopo il click, riprovo...`);
                        seeAllButtonFound = false;
                    }
                }
            }
            if (seeAllButtonFound) break;
            console.log(`[GoogleScraper] Pulsante non trovato, tentativo ${attempt + 1}/8. Riprovo...`);
            await fastWait(2500);
        }

        if (!seeAllButtonFound) {
            console.log("[GoogleScraper] ⚠️ Pulsante 'See all ads' non trovato. Provo strategie alternative...");

            // Strategia 1: Verifica se siamo già sulla pagina con gli annunci
            const existingAds = document.querySelectorAll(this.AD_CARD_SELECTOR);
            if (existingAds.length > 0) {
                console.log(`[GoogleScraper] ✅ Trovati ${existingAds.length} annunci già caricati. Procedo senza cliccare "See all ads".`);
                seeAllButtonFound = true;
            } else {
                // Strategia 2: Cerca pagina con account multipli
                const advertiserLinks = document.querySelectorAll('a[href*="/advertiser/"]');
                if (advertiserLinks.length > 0) {
                    console.log("[GoogleScraper] 🔗 Trovata pagina con account multipli. Clicco il primo inserzionista...");
                    advertiserLinks[0].click();
                    await fastWait(6000);

                    // Riprova a cercare "See all ads" dopo aver cliccato l'inserzionista
                    const retryClickables = document.querySelectorAll('a, button, div[role="button"], span[role="button"], material-button, [aria-label]');
                    for (const el of retryClickables) {
                        const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
                        const combinedText = text + ' ' + ariaLabel;

                        if (seeAllKeywords.some(k => combinedText.includes(k))) {
                            console.log(`[GoogleScraper] ✅ Trovato "See all ads" dopo click inserzionista. Clicco...`);
                            el.click();
                            await fastWait(6000);
                            seeAllButtonFound = true;
                            break;
                        }
                    }
                }
            }

            // Strategia 3: Se ancora non troviamo nulla, proviamo a scrollare per vedere se si carica qualcosa
            if (!seeAllButtonFound) {
                console.log("[GoogleScraper] 📜 Provo a scrollare per attivare il caricamento...");
                window.scrollTo(0, document.body.scrollHeight / 2);
                await fastWait(3000);
                window.scrollTo(0, 0);
                await fastWait(2000);

                const adsAfterScroll = document.querySelectorAll(this.AD_CARD_SELECTOR);
                if (adsAfterScroll.length > 0) {
                    console.log(`[GoogleScraper] ✅ Trovati ${adsAfterScroll.length} annunci dopo lo scroll.`);
                    seeAllButtonFound = true;
                }
            }
        }

        // 3-4. I FILTRI (DATA, PIATTAFORMA E FORMATO) SONO GESTITI DIRETTAMENTE VIA URL!
        // Pertanto, non eseguiamo più alcun click sui menu a tendina del DOM.
        console.log(`[GoogleScraper] 🎯 Filtri applicati nativamente via URL. Salto l'interazione con i menu visivi.`);

        // 5. PRE-SCROLL PER CARICARE TUTTI GLI ANNUNCI (lazy loading / infinite scroll)
        console.log("[GoogleScraper] 📜 Inizio pre-scroll per caricare tutti gli annunci...");
        let previousAdCount = 0;
        let noNewAdsScrolls = 0;
        const maxPreScrolls = 30; // Massimo 30 scroll di pre-caricamento (aumentato)

        for (let scrollAttempt = 0; scrollAttempt < maxPreScrolls; scrollAttempt++) {
            // Scroll più graduale per dare tempo al lazy loading
            const scrollStep = Math.floor(document.body.scrollHeight / 3);
            window.scrollBy(0, scrollStep);
            await fastWait(1500);

            // Scroll fino in fondo
            window.scrollTo(0, document.body.scrollHeight);
            await fastWait(2500); // Aumentato il tempo di attesa per il caricamento

            const currentAdCount = document.querySelectorAll(this.AD_CARD_SELECTOR).length;
            console.log(`[GoogleScraper] 📜 Pre-scroll ${scrollAttempt + 1}/${maxPreScrolls}: ${currentAdCount} annunci trovati nel DOM`);

            if (currentAdCount === previousAdCount) {
                noNewAdsScrolls++;
                if (noNewAdsScrolls >= 4) { // Aumentato da 3 a 4 per essere più sicuri
                    console.log(`[GoogleScraper] ✅ Nessun nuovo annuncio dopo ${noNewAdsScrolls} scroll consecutivi. Pre-caricamento completato.`);
                    break;
                }
            } else {
                noNewAdsScrolls = 0;
            }
            previousAdCount = currentAdCount;

            // Se abbiamo già abbastanza annunci per il maxAds richiesto, possiamo fermarci
            if (currentAdCount >= (options.maxAds || 30)) {
                console.log(`[GoogleScraper] ✅ Raggiunto il numero richiesto di annunci (${currentAdCount} >= ${options.maxAds || 30}). Stop pre-scroll.`);
                break;
            }
        }

        // Torna in cima alla pagina prima di iniziare la cattura
        console.log("[GoogleScraper] 🔝 Torno in cima alla pagina...");
        window.scrollTo(0, 0);
        await fastWait(3000); // Aumentato il tempo di attesa

        const finalAdCount = document.querySelectorAll(this.AD_CARD_SELECTOR).length;
        console.log(`[GoogleScraper] ✅ Pre-caricamento completato. Totale annunci nel DOM: ${finalAdCount}`);

        if (finalAdCount === 0) {
            console.error("[GoogleScraper] ❌ ERRORE: Nessun annuncio trovato dopo il pre-scroll!");
            throw new Error("Nessun annuncio trovato. Verifica che la pagina sia caricata correttamente.");
        }

        // 6. INIZIO CATTURA ANNUNCI
        const maxAds = options.maxAds || 30;
        const capturedAds = new Set();
        let results = [];
        const controlUI = document.getElementById('capture-control-ui');
        const adElementMap = new Map();

        const getAdvertiserName = () => {
            const node = document.querySelector('a.advertiser-name, div.advertiser-name');
            if (node && node.innerText.trim()) return node.innerText.trim();
            return new URLSearchParams(window.location.search).get('domain') || "Google Ad";
        };
        const advertiserName = getAdvertiserName();

        const internalCrop = async (dataUrl, area) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const dpr = window.devicePixelRatio || 1;
                    canvas.width = area.width * dpr;
                    canvas.height = area.height * dpr;
                    ctx.drawImage(img, area.x * dpr, area.y * dpr, area.width * dpr, area.height * dpr, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/png'));
                };
                img.src = dataUrl;
            });
        };

        let emptyCycles = 0;

        while (capturedAds.size < maxAds && emptyCycles < 5) {
            const allAds = Array.from(document.querySelectorAll(this.AD_CARD_SELECTOR));

            const newAdsInView = allAds.filter(ad => {
                let id = ad.getAttribute('data-scraped-id');
                if (!id) {
                    id = `g-ad-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                    ad.setAttribute('data-scraped-id', id);
                }
                return !capturedAds.has(id);
            });

            if (newAdsInView.length === 0) {
                window.scrollBy(0, window.innerHeight * 0.7);
                await fastWait(2500);
                emptyCycles++;
                continue;
            }

            emptyCycles = 0;

            for (const ad of newAdsInView) {
                if (capturedAds.size >= maxAds) break;

                const adId = ad.getAttribute('data-scraped-id');

                // Scroll all'annuncio e attendi che sia completamente visibile
                console.log(`[GoogleScraper] 📸 Catturando annuncio ${capturedAds.size + 1}/${maxAds}...`);
                ad.scrollIntoView({ block: "center", behavior: "smooth" });
                await fastWait(1500); // Aumentato per dare tempo allo scroll smooth

                // Verifica che l'annuncio sia effettivamente visibile
                const rect = ad.getBoundingClientRect();
                if (rect.width < 50 || rect.height < 50) {
                    console.log(`[GoogleScraper] ⚠️ Annuncio troppo piccolo o non visibile, salto...`);
                    continue;
                }

                // Verifica che l'annuncio sia completamente nel viewport
                if (rect.top < 0 || rect.bottom > window.innerHeight) {
                    console.log(`[GoogleScraper] 📜 Annuncio parzialmente fuori viewport, ri-scrollo...`);
                    ad.scrollIntoView({ block: "center", behavior: "instant" });
                    await fastWait(1000);
                }

                let caption = "";
                let formatType = "Misto";

                try {
                    const textContent = ad.innerText || "";
                    if (textContent.length > 5) {
                        caption = textContent.replace(/Shown between[^\n]+/g, '').replace(/See details/gi, '').replace(/\n+/g, ' ').trim();
                        caption = caption.substring(0, 150) + (caption.length > 150 ? "..." : "");
                    }
                    const badge = ad.querySelector('div[class*="format-badge"], div[aria-label]');
                    if (badge && badge.innerText) formatType = badge.innerText.trim();
                } catch (e) {
                    console.warn("[GoogleScraper] ⚠️ Errore estrazione caption:", e);
                }

                try {
                    if (controlUI) controlUI.style.display = 'none';
                    await new Promise(r => setTimeout(r, 200)); // Aumentato leggermente

                    const response = await chrome.runtime.sendMessage({ action: 'captureChunk' });

                    if (controlUI) controlUI.style.display = 'flex';

                    if (response && response.dataUrl) {
                        const croppedUrl = await internalCrop(response.dataUrl, {
                            x: rect.left, y: rect.top, width: rect.width, height: rect.height
                        });

                        results.push({
                            dataUrl: croppedUrl,
                            brandName: advertiserName,
                            caption: caption ? `Format: ${formatType} | ${caption}` : `Format: ${formatType}`,
                            category: 'Google Ads Library',
                            country: options.targetCountry || "",
                            date: new Date().toLocaleDateString('it-IT'),
                            adId: adId
                        });

                        capturedAds.add(adId);
                        adElementMap.set(adId, ad);
                        console.log(`[GoogleScraper] ✅ Annuncio ${capturedAds.size}/${maxAds} catturato con successo`);
                    } else {
                        console.error("[GoogleScraper] ❌ Errore: risposta screenshot vuota");
                    }
                } catch (err) {
                    if (controlUI) controlUI.style.display = 'flex';
                    console.error("[GoogleScraper] ❌ Errore cattura/ritaglio:", err);
                }
            }
        }

        console.log(`[GoogleScraper] 🎉 Fase 1 completata! Catturati ${results.length} annunci su ${maxAds} richiesti.`);

        // ═══════════════════════════════════════════════════════════
        //  FASE 2 — Apri dettagli per ogni annuncio catturato
        // ═══════════════════════════════════════════════════════════
        console.log('[GoogleScraper] ── FASE 2: dettagli inserzioni ──');

        // Helper: attendi apertura pannello dettaglio Google Ads
        const waitForGoogleDialog = async () => {
            for (let i = 0; i < 30; i++) {
                // Google Ads Transparency usa un dialog o un pannello laterale/overlay
                const d = document.querySelector(
                    'dialog[open], div[role="dialog"], creative-details, ad-details-panel, ' +
                    'div.detail-view, div[class*="details-panel"], div[class*="ad-detail"]'
                );
                if (d && d.offsetHeight > 50) return d;
                await fastWait(200);
            }
            return null;
        };

        // Helper: chiudi il pannello dettaglio Google Ads (Versione Robusta)
        const closeGoogleDialog = async () => {
            const closeSelectors = [
                'button[aria-label="Back"]', 'button[aria-label="Indietro"]',
                'material-button[aria-label="Back"]', 'material-button[aria-label="Indietro"]',
                'material-button[aria-label="Close"]', 'material-button[aria-label="Chiudi"]',
                'button[aria-label="Close"]', 'button[aria-label="Chiudi"]',
                'mat-icon[aria-label="arrow_back"]', 'mat-icon[aria-label="close"]'
            ];

            let clicked = false;
            for (const sel of closeSelectors) {
                const btns = document.querySelectorAll(sel);
                if (btns.length > 0) {
                    btns[btns.length - 1].click(); // Clicca l'ultimo trovato (quello in overlay)
                    clicked = true;
                    await fastWait(800);
                    break;
                }
            }

            // Se l'URL contiene ancora i dettagli, usa la cronologia del browser
            if (!clicked || window.location.href.includes('creative-details')) {
                window.history.back();
                await fastWait(1000);
            }

            // Fallback Escape
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
            await fastWait(500);
        };

        // Torna in cima prima di iniziare la Fase 2
        window.scrollTo({ top: 0, behavior: 'instant' });
        await fastWait(1200);

        for (let i = 0; i < results.length; i++) {
            console.log(`[GoogleScraper] Dettagli ${i + 1}/${results.length}`);

            // IL SEGRETO: Non usare la mappa salvata in memoria, ri-pesca gli elementi freschi dal DOM!
            // Poiché Angular distrugge e ricrea la griglia quando torniamo indietro, dobbiamo cercare
            // l'annuncio in base al suo indice 'i'.
            let allAds = document.querySelectorAll(this.AD_CARD_SELECTOR);

            // Se Angular non ha ancora renderizzato abbastanza annunci, scrolliamo finché non appare
            let retryScroll = 0;
            while (allAds.length <= i && retryScroll < 15) {
                window.scrollBy(0, 1000);
                await fastWait(1000);
                allAds = document.querySelectorAll(this.AD_CARD_SELECTOR);
                retryScroll++;
            }

            if (allAds.length <= i) {
                console.warn(`[GoogleScraper] Impossibile trovare l'annuncio in posizione ${i}, salto.`);
                continue;
            }

            let adEl = allAds[i]; // Ecco il nostro annuncio "vivo" nel DOM

            // Porta la card al centro
            adEl.scrollIntoView({ block: 'center', behavior: 'instant' });
            await fastWait(800);

            // 🎯 IL CLICK CORRETTO: Basato sull'HTML di Google
            // Il vero pulsante è il tag <creative role="button"> dentro la preview
            const clickTarget = adEl.querySelector('creative[role="button"]') || adEl.querySelector('[role="button"]') || adEl;
            
            console.log(`[GoogleScraper] Clicco target per aprire i dettagli...`);
            clickTarget.click();
            await fastWait(1500);

            // Attendi apertura pannello
            const dialog = await waitForGoogleDialog();
            if (!dialog) {
                console.warn(`[GoogleScraper] Pannello dettagli non trovato, salto e torno indietro.`);
                await closeGoogleDialog();
                continue;
            }

            // Scroll visivo all'interno del pannello
            console.log('[GoogleScraper] Eseguo scroll interno del pannello...');
            const innerEls = dialog.querySelectorAll('p, span, div, h1, h2, h3');
            for (let j = 0; j < innerEls.length; j++) {
                if (j % 5 === 0 || j === innerEls.length - 1) {
                    innerEls[j].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await fastWait(200);
                }
            }
            dialog.scrollIntoView({ behavior: 'instant', block: 'start' });
            await fastWait(300);

            // Selezione visiva del testo (effetto blu come Meta)
            console.log('[GoogleScraper] Simulo la selezione visiva del testo...');
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(dialog);
            selection.removeAllRanges();
            selection.addRange(range);
            await fastWait(800);
            selection.removeAllRanges();

            // Estrai il testo grezzo del pannello
            const rawDetailText = (dialog.innerText || '').trim();

            // Salva i dettagli nella caption (stesso pattern di Meta)
            if (rawDetailText) {
                results[i].caption = (results[i].caption || '') + '|||GOOGLE_DETAILS|||' + rawDetailText;
            }

            console.log(`[GoogleScraper] Dettagli estratti: ${rawDetailText.length} caratteri`);

            // Chiudi il pannello e aspetta chiusura
            await closeGoogleDialog();
            await fastWait(1200);

            // CONTROLLO DI SICUREZZA: Assicuriamoci di essere tornati alla griglia principale
            if (window.location.href.includes('creative-details') || document.querySelector('creative-details')) {
                console.warn(`[GoogleScraper] ⚠️ Dettagli ancora aperti. Forzo l'uscita.`);
                window.history.back();
                await fastWait(1500);
                
                if (window.location.href.includes('creative-details')) {
                    console.error("[GoogleScraper] ❌ Blocco critico. Impossibile tornare alla griglia.");
                    break; // Evita loop infiniti
                }
            }
        }

        // Mostra spunta verde solo a scraping completamente finito
        if (typeof window.triggerSuccessModal === 'function') {
            window.triggerSuccessModal();
        }

        console.log(`[GoogleScraper] 🎉 Scraping completato! ${results.length} annunci con dettagli.`);
        return results;
    }
};

// Conferma caricamento completo dello script
console.log("✅✅✅ [GoogleScraper] Script completamente caricato e pronto!");
console.log("✅✅✅ [GoogleScraper] window.GoogleScraper definito:", typeof window.GoogleScraper);
console.log("✅✅✅ [GoogleScraper] window.GoogleScraper.startScraping definito:", typeof window.GoogleScraper?.startScraping);
