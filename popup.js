// popup.js -- CON FUNZIONALITÀ DI RITAGLIO, DRAG&DROP, SELEZIONE, LAYOUT PPT, FILTRI, PRESET E LOG AZIONI

document.addEventListener('DOMContentLoaded', () => {
    // MODIFICA 1b: Funzione ausiliaria per ottenere le dimensioni di un'immagine da un data URL
    const getImageDimensions = (dataUrl) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = (err) => reject(err);
            img.src = dataUrl;
        });
    };
    // =========================================================
    // PARSER TESTO META: Estrae i dati demografici e i KPI
    // =========================================================
    const parseMetaText = (text) => {
        if (!text) return null;
        const data = {
            libraryId: '-', euReach: '-', targetAge: '-', payer: '-', demographics: [],
            status: 'Sconosciuto', hasVariants: 'No', cta: '-', advertiser: '-', followers: '-'
        };

        // Estrazione KPI principali tramite Regex
        const idMatch = text.match(/ID libreria:\s*(\d+)/i);
        if (idMatch) data.libraryId = idMatch[1];

        const reachMatch = text.match(/Copertura\n+([\d.,]+)/i) || text.match(/Copertura\s+([\d.,]+)/i);
        if (reachMatch) data.euReach = reachMatch[1];

        const ageMatch = text.match(/Età\n+([^\n]+)/i);
        if (ageMatch && !ageMatch[1].includes("Gli inserzionisti")) data.targetAge = ageMatch[1].trim();

        const payerMatch = text.match(/Pagante\n+([^\n]+)/i);
        if (payerMatch) data.payer = payerMatch[1].trim();

        // NUOVI DATI: Stato, Varianti, CTA, Inserzionista
        const statusMatch = text.match(/\b(Attiva|Inattiva|Active|Inactive)\b/i);
        if (statusMatch) data.status = statusMatch[1];

        // Estrazione esatta del numero di varianti (es: "1 di 6" o "1 of 6")
        if (/Questa inserzione ha più versioni|This ad has multiple versions/i.test(text)) {
            data.hasVariants = 'Sì'; // Testo di fallback

            // Cerca il pattern "1 di X" o "1 of X" ed estrae la X
            const versionsMatch = text.match(/\d+\s+(?:di|of)\s+(\d+)/i);
            if (versionsMatch && versionsMatch[1]) {
                data.hasVariants = `${versionsMatch[1]}`;
            }
        }

        const ctaMatch = text.match(/\b(Shop Now|Scopri di più|Book Now|Installa subito|Scarica|Iscriviti|Acquista|Learn More|Sign Up|Download)\b/i);
        if (ctaMatch) data.cta = ctaMatch[1];

        const advMatch = text.match(/Informazioni sull'inserzionista\n+([^\n]+)\n+([^\n]+)/i);
        if (advMatch) {
            data.advertiser = advMatch[1].trim();
            const handle = advMatch[2].trim();
            if (handle.startsWith('@')) data.advertiser += ` (${handle})`;
        }

        const folMatch = text.match(/Follower:\s*([^\n]+)/i);
        if (folMatch) data.followers = folMatch[1].trim().replace(/•/g, '').trim();

        // Estrazione della tabella Demografica
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let inDemoSection = false;
        let tempDemo = [];

        for (let i = 0; i < lines.length; i++) {
            if (lines[i] === 'Luogo' && lines[i + 1] === 'Fascia di età' && lines[i + 2] === 'Genere' && lines[i + 3] === 'Copertura') {
                inDemoSection = true;
                i += 3; // Salta le intestazioni
                continue;
            }
            if (inDemoSection) {
                // Condizione di uscita dalla tabella
                if (lines[i].includes("Informazioni sull'inserzionista") || lines[i] === 'IKEA' || lines[i] === 'Chiudi') break;
                tempDemo.push(lines[i]);
            }
        }

        // Raggruppa i dati 4 a 4 (Luogo, Età, Genere, Numeri)
        for (let i = 0; i < tempDemo.length; i += 4) {
            if (tempDemo[i] && tempDemo[i + 1] && tempDemo[i + 2] && tempDemo[i + 3] && /^\d+$/.test(tempDemo[i + 3])) {
                data.demographics.push({
                    location: tempDemo[i],
                    age: tempDemo[i + 1],
                    gender: tempDemo[i + 2],
                    reach: tempDemo[i + 3]
                });
            }
        }
        return data;
    };

    // PARSER TESTO GOOGLE ADS
    const parseGoogleAds = (text) => {
        if (!text) return null;
        const data = { adFundedBy: '-', firstShown: '-', lastShown: '-', timesShown: '-', topic: '-', format: '-', variants: '-' };

        const fundedMatch = text.match(/Ad funded by:\s*([^\n]+)/i);
        if (fundedMatch) data.adFundedBy = fundedMatch[1].trim();

        const firstMatch = text.match(/First shown(?:[^:]*)?:\s*([^\n]+)/i);
        if (firstMatch) data.firstShown = firstMatch[1].trim();

        const lastMatch = text.match(/Last shown:\s*([^\n]+)/i);
        if (lastMatch) data.lastShown = lastMatch[1].trim();

        const timesMatch = text.match(/([\d.,]+\s*[–-]\s*[\d.,]+[KkMm]?)/);
        if (timesMatch) data.timesShown = timesMatch[1].trim();

        const topicMatch = text.match(/Topic(?:[^:]*)?:\s*([^\n]+)/i);
        if (topicMatch) data.topic = topicMatch[1].trim();

        const formatMatch = text.match(/Format:\s*([^\n]+)/i);
        if (formatMatch) data.format = formatMatch[1].trim();

        const varMatch = text.match(/(\d+)\s+of\s+(\d+)\s+variations?/i);
        if (varMatch) data.variants = varMatch[2];

        return data;
    };

    // =========================================================
    // NUOVA FUNZIONE: Modal dettaglio brand a Colonne Dinamiche
    // =========================================================
    const showBrandDetailModal = (brandKey, shots) => {
        let modal = document.getElementById('brand-detail-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'brand-detail-modal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content brand-detail-content">
                    <span class="modal-close brand-detail-close">&times;</span>
                    <h3 id="brand-detail-title">Dettaglio Post</h3>
                    <div id="brand-detail-stats-container"></div>
                    <div class="brand-detail-table-container">
                        <table id="brand-detail-table">
                            <thead id="brand-detail-thead"></thead>
                            <tbody id="brand-detail-tbody"></tbody>
                        </table>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const closeBtn = modal.querySelector('.brand-detail-close');
            closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }

        const title = modal.querySelector('#brand-detail-title');
        const thead = modal.querySelector('#brand-detail-thead');
        const tbody = modal.querySelector('#brand-detail-tbody');
        const statsContainer = modal.querySelector('#brand-detail-stats-container');

        const displayName = brandKey === '__NO_BRAND__' ? 'Senza Brand' : brandKey;
        title.textContent = `Dettaglio Post - ${displayName} (${shots.length} file)`;

        // Rilevamento dinamico: stiamo guardando Ads o post Organici?
        const isMetaAds = shots.some(shot => shot.category === 'Meta Ads Library');
        const isGoogleAds = shots.some(shot => shot.category === 'Google Ads Library');

        // Impostazione Intestazioni (Dinamica)
        if (isGoogleAds) {
            thead.innerHTML = `
                <tr>
                    <th>Anteprima</th>
                    <th>Brand (Config.)</th>
                    <th>Ad Funded By</th>
                    <th>Formato</th>
                    <th>First Shown</th>
                    <th>Last Shown</th>
                    <th>Times Shown</th>
                    <th>Topic</th>
                    <th>Varianti</th>
                    <th>Testo Annuncio</th>
                </tr>
            `;
            statsContainer.style.display = 'none';
        } else if (isMetaAds) {
            thead.innerHTML = `
                <tr>
                    <th>Anteprima</th>
                    <th>Brand</th>
                    <th>ID Libreria</th>
                    <th>Data Start</th>
                    <th>Paese Target</th>
                    <th>Copertura</th>
                    <th>Età Target</th>
                    <th>Caption</th>
                    <th style="text-align:center;">Dati Target</th>
                </tr>
            `;
            statsContainer.style.display = 'none'; // Nascondiamo le stats organiche per le ads
        } else {
            thead.innerHTML = `
                <tr>
                    <th>Anteprima</th>
                    <th>Brand</th>
                    <th>Social</th>
                    <th>Data Cattura</th>
                    <th>Caption</th>
                    <th>Hashtags</th>
                    <th>Likes</th>
                    <th>Commenti</th>
                    <th>Condivisioni</th>
                </tr>
            `;

            // Mostra stats organiche (vecchio codice mantenuto per TikTok/Instagram)
            const bs = calculateBrandStats(shots);
            if (bs.postsWithMetrics > 0) {
                statsContainer.innerHTML = `
                    <div class="brand-stats-bar" style="margin-bottom: 15px; border-radius: 8px;">
                        <div class="brand-stat-item" data-stat-type="likes" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                            <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                            </svg>
                            <span class="brand-stat-label">Media Like</span>
                            <span class="brand-stat-value">${formatNumber(bs.avgLikes)}</span>
                        </div>
                        <div class="brand-stat-item" data-stat-type="comments" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                            <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <span class="brand-stat-label">Media Commenti</span>
                            <span class="brand-stat-value">${formatNumber(bs.avgComments)}</span>
                        </div>
                        <div class="brand-stat-item" data-stat-type="shares" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                            <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                <polyline points="23 4 23 10 17 10"></polyline>
                                <polyline points="1 20 1 14 7 14"></polyline>
                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                            </svg>
                            <span class="brand-stat-label">Media Condivisioni</span>
                            <span class="brand-stat-value">${formatNumber(bs.avgShares)}</span>
                        </div>
                        <div class="brand-stat-item" data-stat-type="totalEngagement" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                            <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                            <span class="brand-stat-label">Totale Interazioni</span>
                            <span class="brand-stat-value">${formatNumber(bs.totalEngagement)}</span>
                        </div>
                    </div>
                `;
                statsContainer.style.display = 'block';

                statsContainer.querySelectorAll('.brand-stat-item').forEach(item => {
                    item.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const statType = item.dataset.statType;
                        showStatExplanation(statType, bs);
                    });
                });
            } else {
                statsContainer.style.display = 'none';
            }
        }

        tbody.innerHTML = '';

        // Popolazione Righe (Dinamica)
        shots.forEach((shot, index) => {
            const separated = shot.caption ? separateCaptionAndHashtags(shot.caption, isMetaAds) : { caption: '', hashtags: '' };
            const imgSrc = shot.isGroup ? shot.items[0].url : shot.url;
            const row = document.createElement('tr');

            if (isGoogleAds) {
                // MODALITÀ GOOGLE ADS
                const rawText = shot.adDetails ? shot.adDetails.rawDetailText : (shot.metaDetails || '');
                const gData = parseGoogleAds(rawText) || {};
                const separated = shot.caption ? separateCaptionAndHashtags(shot.caption, false) : { caption: '' };

                row.innerHTML = `
                    <td class="preview-cell"><img src="${imgSrc}" class="detail-preview-img"></td>
                    <td>${shot.brandName || '-'}</td>
                    <td style="font-weight:bold;">${gData.adFundedBy || '-'}</td>
                    <td>${gData.format || '-'}</td>
                    <td>${gData.firstShown || '-'}</td>
                    <td>${gData.lastShown || '-'}</td>
                    <td style="font-weight:bold; color:var(--havas-red);">${gData.timesShown || '-'}</td>
                    <td>${gData.topic || '-'}</td>
                    <td style="text-align:center;">${gData.variants || '-'}</td>
                    <td class="caption-cell" title="${separated.caption}">${separated.caption || '-'}</td>
                `;
                tbody.appendChild(row);

            } else if (isMetaAds) {
                // MODALITÀ META ADS
                const metaParsed = parseMetaText(shot.metaDetails);
                const hasDemo = metaParsed && metaParsed.demographics && metaParsed.demographics.length > 0;

                row.innerHTML = `
                    <td class="preview-cell"><img src="${imgSrc}" class="detail-preview-img"></td>
                    <td>${shot.brandName || ''}</td>
                    <td>${metaParsed ? metaParsed.libraryId : '-'}</td>
                    <td>${shot.startingDate || '-'}</td>
                    <td>${shot.country || '-'}</td>
                    <td style="font-weight:bold; color:var(--havas-red);">${metaParsed ? metaParsed.euReach : '-'}</td>
                    <td>${metaParsed ? metaParsed.targetAge : '-'}</td>
                    <td class="caption-cell" title="${separated.caption}">${separated.caption || '-'}</td>
                    <td style="text-align:center; vertical-align:middle;">
                        ${hasDemo ? `<button class="sidebar-btn toggle-demo-btn" data-index="${index}" style="width:auto; margin:0 auto; padding:5px 10px; font-size:11px; cursor:pointer;">📊 Vedi Dettagli</button>` : '<span style="color:#888; font-size:11px;">N/D</span>'}
                    </td>
                `;
                tbody.appendChild(row);

                // Se ci sono dati demografici, creiamo la "sotto-tabellina" espandibile nascosta
                if (hasDemo) {
                    const demoRow = document.createElement('tr');
                    demoRow.id = `demo-row-${index}`;
                    demoRow.style.display = 'none';
                    demoRow.style.backgroundColor = '#1a1a1a'; // Stile scuro Havas

                    let demoTableHtml = `
                        <td colspan="9" style="padding: 0;">
                            <div style="display: flex; gap: 15px; padding: 15px; border-left: 4px solid var(--havas-red); margin: 10px; background:#2a2a2a; border-radius:4px;">
                                
                                <!-- Colonna Sinistra: Demografia -->
                                <div style="flex: 2;">
                                    <h4 style="color:white; margin-bottom:10px; font-size:13px; text-transform:uppercase;">Dettaglio Pubblico (Copertura)</h4>
                                    <table style="width:100%; border-collapse: collapse; font-size:11px; background:#1a1a1a; color:#eee;">
                                        <thead>
                                            <tr style="border-bottom: 1px solid #444; background:#333;">
                                                <th style="padding:8px; border:none; text-align:left;">Luogo</th>
                                                <th style="padding:8px; border:none; text-align:left;">Età</th>
                                                <th style="padding:8px; border:none; text-align:left;">Genere</th>
                                                <th style="padding:8px; border:none; text-align:right;">Copertura</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                    `;

                    metaParsed.demographics.forEach(d => {
                        demoTableHtml += `
                            <tr style="border-bottom: 1px solid #333;">
                                <td style="padding:8px; border:none;">${d.location}</td>
                                <td style="padding:8px; border:none;">${d.age}</td>
                                <td style="padding:8px; border:none;">${d.gender}</td>
                                <td style="padding:8px; border:none; text-align:right; font-weight:bold; color:#4CAF50;">${parseInt(d.reach).toLocaleString('it-IT')}</td>
                            </tr>
                        `;
                    });

                    demoTableHtml += `
                                        </tbody>
                                    </table>
                                </div>

                                <!-- Colonna Destra: Dati Strategici -->
                                <div style="flex: 1; background:#1a1a1a; padding: 15px; border-radius: 4px; color: #ccc; font-size: 12px; line-height: 1.6;">
                                    <h4 style="color:white; margin-bottom:10px; font-size:13px; text-transform:uppercase;">Dettagli Strategici</h4>
                                    <div style="margin-bottom: 5px;"><strong>Stato Annuncio:</strong> <span style="color:${metaParsed.status.toLowerCase().includes('attiv') ? '#4CAF50' : '#E50000'}">${metaParsed.status}</span></div>
                                    <div style="margin-bottom: 5px;"><strong>Varianti Testate:</strong> ${metaParsed.hasVariants}</div>
                                    <div style="margin-bottom: 5px;"><strong>Pulsante (CTA):</strong> <span style="background:#333; padding:2px 6px; border-radius:3px;">${metaParsed.cta}</span></div>
                                    <hr style="border:0; border-top:1px solid #333; margin: 10px 0;">
                                    <div style="margin-bottom: 5px;"><strong>Inserzionista:</strong> ${metaParsed.advertiser}</div>
                                    <div style="margin-bottom: 5px;"><strong>Pagante:</strong> ${metaParsed.payer}</div>
                                    <div style="margin-bottom: 5px;"><strong>Follower:</strong> ${metaParsed.followers}</div>
                                </div>

                            </div>
                        </td>`;
                    demoRow.innerHTML = demoTableHtml;
                    tbody.appendChild(demoRow);

                    // Aggiungiamo l'evento click al bottone per aprire/chiudere
                    const toggleBtn = row.querySelector('.toggle-demo-btn');
                    if (toggleBtn) {
                        toggleBtn.addEventListener('click', function () {
                            const targetRow = document.getElementById(`demo-row-${index}`);
                            if (targetRow.style.display === 'none') {
                                targetRow.style.display = 'table-row';
                                this.innerHTML = '▲ Nascondi';
                                this.style.backgroundColor = 'var(--havas-red)';
                                this.style.color = 'white';
                                this.style.borderColor = 'var(--havas-red)';
                            } else {
                                targetRow.style.display = 'none';
                                this.innerHTML = '📊 Vedi Target';
                                this.style.backgroundColor = 'transparent';
                                this.style.color = 'inherit';
                                this.style.borderColor = 'var(--border-color)';
                            }
                        });
                    }
                }

            } else {
                // MODALITÀ SOCIAL ORGANICO (Classica)
                let socialName = shot.category || '';
                const urlToCheck = (shot.sourceUrl || shot.filename || '').toLowerCase();
                if (urlToCheck.includes('instagram.com')) socialName = 'Instagram';
                else if (urlToCheck.includes('tiktok.com')) socialName = 'TikTok';
                else if (urlToCheck.includes('facebook.com') || urlToCheck.includes('meta.com')) socialName = 'Facebook';
                else if (urlToCheck.includes('pinterest')) socialName = 'Pinterest';

                const dateOrPeriod = shot.period ? shot.period : (shot.date || '');

                row.innerHTML = `
                    <td class="preview-cell"><img src="${imgSrc}" class="detail-preview-img"></td>
                    <td>${shot.brandName || ''}</td>
                    <td>${socialName}</td>
                    <td>${dateOrPeriod}</td>
                    <td class="caption-cell" title="${separated.caption}">${separated.caption}</td>
                    <td class="hashtags-cell" title="${separated.hashtags}">${separated.hashtags}</td>
                    <td>${shot.metrics ? shot.metrics.likes || 0 : 0}</td>
                    <td>${shot.metrics ? shot.metrics.comments || 0 : 0}</td>
                    <td>${shot.metrics ? shot.metrics.reshares || 0 : 0}</td>
                `;
                tbody.appendChild(row);
            }
        });

        modal.style.display = 'flex';
    };

    // NUOVA FUNZIONE: Valida e filtra le caption estratte (versione popup.js)
    const validateAndFilterCaption = (rawCaption, username) => {
        if (!rawCaption || typeof rawCaption !== 'string') {
            console.log("[Caption Filter] Caption vuota o non valida");
            return null;
        }

        const caption = rawCaption.trim();

        // Regola 1: Esclude caption troppo corte (meno di 3 parole)
        const words = caption.split(/\s+/).filter(word => word.length > 0);
        if (words.length < 3) {
            console.log(`[Caption Filter] ❌ Caption troppo corta (${words.length} parole): "${caption}"`);
            return null;
        }

        // Regola 2: Esclude se è solo il nome utente
        if (username && (caption.toLowerCase() === username.toLowerCase() ||
            caption.toLowerCase() === `@${username.toLowerCase()}`)) {
            console.log(`[Caption Filter] ❌ Caption è solo il nome utente: "${caption}"`);
            return null;
        }

        // Regola 3: Esclude se inizia solo con il nome utente e non ha contenuto significativo
        if (username && caption.toLowerCase().startsWith(username.toLowerCase()) && words.length < 5) {
            console.log(`[Caption Filter] ❌ Caption inizia con username e ha poche parole: "${caption}"`);
            return null;
        }

        // Regola 4: Esclude testi che sono chiaramente elementi UI
        const uiPatterns = [
            /^(mi piace|like|comment|commenti|share|condividi|salva|save|segui|follow)[\s:]*\d*/i,
            /^\d+[\s]*(mi piace|like|comment|commenti|follower|following|visualizzazioni)/i,
            /^(impostazioni|altre app di meta|informazioni|condizioni|privacy|accedi|iscriviti)/i,
            /^(aggiungi un commento|add a comment|audio originale|original audio)/i,
            /^(vedi traduzione|see translation|see more|altro)$/i
        ];

        for (const pattern of uiPatterns) {
            if (pattern.test(caption)) {
                console.log(`[Caption Filter] ❌ Caption è un elemento UI: "${caption}"`);
                return null;
            }
        }

        // Regola 5: Esclude se contiene solo numeri e simboli (metriche)
        if (/^[\d\s.,KMkm]+$/.test(caption)) {
            console.log(`[Caption Filter] ❌ Caption contiene solo numeri/metriche: "${caption}"`);
            return null;
        }

        // Regola 6: Esclude se è troppo lunga (probabilmente errore di estrazione)
        if (caption.length > 2200) {
            console.log(`[Caption Filter] ❌ Caption troppo lunga (${caption.length} caratteri)`);
            return null;
        }

        // Regola 7: Deve contenere almeno una delle seguenti caratteristiche per essere valida:
        // - Hashtag (#)
        // - Mention (@)
        // - Punteggiatura significativa (. ! ?)
        // - Parole lunghe (>4 caratteri)
        const hasHashtags = /#\w+/.test(caption);
        const hasMentions = /@\w+/.test(caption);
        const hasPunctuation = /[.!?]/.test(caption);
        const hasLongWords = words.some(word => word.length > 4);

        if (!hasHashtags && !hasMentions && !hasPunctuation && !hasLongWords) {
            console.log(`[Caption Filter] ❌ Caption non ha caratteristiche significative: "${caption}"`);
            return null;
        }

        console.log(`[Caption Filter] ✅ Caption valida: "${caption.substring(0, 100)}${caption.length > 100 ? '...' : ''}"`);
        return caption;
    };

    // NUOVA FUNZIONE: Separa caption e hashtag
    const separateCaptionAndHashtags = (fullCaption, isMetaAd = false) => {
        if (!fullCaption) return { caption: '', hashtags: '' };

        // NUOVO: Prima valida la caption
        let validatedCaption = validateAndFilterCaption(fullCaption);
        if (!validatedCaption) {
            console.log(`[Caption Filter] Caption scartata durante la separazione: "${fullCaption}"`);
            return { caption: '', hashtags: '' };
        }

        // === PULIZIA AGGRESSIVA (Username e Timestamp incollati) ===
        if (!isMetaAd) {
            // 1. Rimuovi Username all'inizio (solo per post organici)
            validatedCaption = validatedCaption.replace(/^[\w._]+\s+/, '');

            // 2. Rimuovi "verificato" (se presente)
            validatedCaption = validatedCaption.replace(/^verificato\s*/i, '');

            // 3. Rimuovi Timestamp 
            validatedCaption = validatedCaption.replace(/^\d+\s*(sett|g|h|min|w|d|m|s|y|ore|minuti|secondi|giorni|settimane)\s*/i, '');

            // 4. Pulizia finale di spazi o trattini residui all'inizio
            validatedCaption = validatedCaption.replace(/^[•·-]\s*/, '').trim();
        }
        // ===========================================================

        // Estrai tutti gli hashtag
        const hashtags = validatedCaption.match(/#\w+/g) || [];

        // Rimuovi gli hashtag dalla caption per ottenere solo il testo
        let cleanCaption = validatedCaption.replace(/#\w+/g, '').trim();

        // NUOVO: Rimuovi tutto quello che viene dopo "Freccia verso il" (inclusa la parola "Freccia")
        const frecciaIndex = cleanCaption.toLowerCase().indexOf('freccia verso il');
        if (frecciaIndex !== -1) {
            cleanCaption = cleanCaption.substring(0, frecciaIndex).trim();
        }

        // Pulisci spazi multipli e punteggiatura finale
        cleanCaption = cleanCaption.replace(/\s+/g, ' ').replace(/[,\s]+$/, '').trim();

        // Pulisci gli hashtag rimuovendo parole indesiderate
        let cleanHashtags = hashtags.map(hashtag => {
            // Rimuovi "Per" dalla fine dell'hashtag (case insensitive)
            return hashtag.replace(/Per$/i, '').replace(/per$/i, '');
        }).join(' ');

        // Rimuovi anche "Per" come parola separata se presente
        cleanHashtags = cleanHashtags
            .replace(/\bPer\b/gi, '') // Rimuove "Per" come parola separata
            .replace(/\s+/g, ' ') // Pulisci spazi multipli
            .trim();

        console.log(`[Caption] Hashtag originali: "${hashtags.join(' ')}"`);
        console.log(`[Caption] Hashtag puliti: "${cleanHashtags}"`);
        console.log(`[Caption] Caption originale: "${fullCaption}"`);
        console.log(`[Caption] Caption pulita: "${cleanCaption}"`);

        return {
            caption: cleanCaption,
            hashtags: cleanHashtags
        };
    };

    // NUOVA FUNZIONE: Calcola statistiche aggregate per un brand
    const calculateBrandStats = (shots) => {
        const stats = {
            totalPosts: shots.length,
            totalLikes: 0,
            totalComments: 0,
            totalShares: 0,
            avgLikes: 0,
            avgComments: 0,
            avgShares: 0,
            maxLikes: 0,
            minLikes: Infinity,
            postsWithMetrics: 0,
            brandName: '',
            category: ''
        };

        shots.forEach(shot => {
            // Salva il nome del brand e la categoria dal primo post
            if (!stats.brandName && shot.brandName) {
                stats.brandName = shot.brandName;
            }
            if (!stats.category && shot.category) {
                stats.category = shot.category;
            }

            if (shot.metrics) {
                const likes = parseInt(shot.metrics.likes) || 0;
                const comments = parseInt(shot.metrics.comments) || 0;
                const shares = parseInt(shot.metrics.reshares) || 0;

                // Conta TUTTI i post che hanno l'oggetto metrics, anche se i valori sono 0
                stats.postsWithMetrics++;

                stats.totalLikes += likes;
                stats.totalComments += comments;
                stats.totalShares += shares;

                if (likes > stats.maxLikes) stats.maxLikes = likes;
                if (likes < stats.minLikes) stats.minLikes = likes;
            }
        });

        if (stats.minLikes === Infinity) stats.minLikes = 0;

        if (stats.postsWithMetrics > 0) {
            stats.avgLikes = Math.round(stats.totalLikes / stats.postsWithMetrics);
            stats.avgComments = Math.round(stats.totalComments / stats.postsWithMetrics);
            stats.avgShares = Math.round(stats.totalShares / stats.postsWithMetrics);
        }

        // Engagement rate (totale interazioni / numero post con metriche)
        stats.totalEngagement = stats.totalLikes + stats.totalComments + stats.totalShares;
        stats.avgEngagement = stats.postsWithMetrics > 0 ? Math.round(stats.totalEngagement / stats.postsWithMetrics) : 0;

        return stats;
    };

    // Funzione helper: formatta un numero grande con K/M
    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    };

    // NUOVA FUNZIONE: Esporta Excel per un singolo brand
    const exportBrandToExcel = async (brandKey, brandShots) => {
        if (brandShots.length === 0) return;

        try {
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet(`${brandKey}_Screenshots`);

            // Identifica la modalità in base al primo elemento
            const firstItem = brandShots[0] || {};
            const isMeta = firstItem.category === 'Meta Ads Library';
            const isGoogle = firstItem.category === 'Google Ads Library';
            const isOrganic = !isMeta && !isGoogle;

            // Definisci Colonne Base
            let dynamicColumns = [
                { header: 'Creative (Immagine catturata)', key: 'image', width: 40 },
                { header: 'Brand name', key: 'brand', width: 25 },
                { header: 'Piattaforma', key: 'social', width: 25 }
            ];

            // Aggiungi colonne specifiche per modalità
            if (isMeta) {
                dynamicColumns.push(
                    { header: 'ID Libreria', key: 'libraryId', width: 20 },
                    { header: 'Data Start', key: 'startingDate', width: 15 },
                    { header: 'Stato', key: 'status', width: 10 },
                    { header: 'Test A/B', key: 'abtest', width: 15 },
                    { header: 'Call To Action', key: 'cta', width: 20 },
                    { header: 'Inserzionista (Pagina)', key: 'advertiser', width: 25 },
                    { header: 'Follower Pagina', key: 'followers', width: 15 },
                    { header: 'Soggetto Pagante', key: 'payer', width: 25 },
                    { header: 'Copertura EU', key: 'euReach', width: 15 },
                    { header: 'Età Target', key: 'targetAge', width: 15 },
                    { header: 'Dati Demografici (Copertura)', key: 'demographics', width: 45 },
                    { header: 'Testo Inserzione', key: 'caption', width: 70 }
                );
            } else if (isGoogle) {
                dynamicColumns.push(
                    { header: 'Ad Funded By', key: 'adFundedBy', width: 28 },
                    { header: 'Formato', key: 'format', width: 15 },
                    { header: 'First Shown', key: 'firstShown', width: 22 },
                    { header: 'Last Shown', key: 'lastShown', width: 22 },
                    { header: 'Times Shown', key: 'timesShown', width: 15 },
                    { header: 'Topic', key: 'topic', width: 20 },
                    { header: 'Varianti', key: 'variants', width: 12 },
                    { header: 'Testo Annuncio', key: 'caption', width: 60 }
                );
            } else {
                // Organic Social
                dynamicColumns.push(
                    { header: 'Capture Date', key: 'date', width: 20 },
                    { header: 'Caption', key: 'caption', width: 60 },
                    { header: 'Hashtags', key: 'hashtags', width: 30 },
                    { header: 'Likes', key: 'likes', width: 10 },
                    { header: 'Commenti', key: 'comments', width: 10 },
                    { header: 'Condivisioni/Salvataggi', key: 'repost', width: 15 }
                );
            }

            worksheet.columns = dynamicColumns;

            // Stile Header
            worksheet.getRow(1).font = { bold: true };
            worksheet.getRow(1).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE50000' }
            };
            worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

            for (let i = 0; i < brandShots.length; i++) {
                const item = brandShots[i];
                const rowIndex = i + 2;

                const imgUrl = item.isGroup ? item.items[0].url : item.url;

                // Determina il nome del Social
                let socialName = '';
                // Se proviene da Meta Ads Library, usa quel nome
                if (item.category === 'Meta Ads Library') {
                    socialName = 'Meta Ads Library';
                } else {
                    socialName = item.category || '';
                    // Controlla prima sourceUrl (nuovo), poi filename (fallback), poi category
                    const urlToCheck = (item.sourceUrl || item.filename || '').toLowerCase();
                    if (urlToCheck.includes('instagram.com')) socialName = 'Instagram';
                    else if (urlToCheck.includes('tiktok.com')) socialName = 'TikTok';
                    else if (urlToCheck.includes('facebook.com') || urlToCheck.includes('meta.com')) socialName = 'Facebook';
                    else if (urlToCheck.includes('pinterest')) socialName = 'Pinterest';
                }

                // Separa caption e hashtag
                const separated = item.caption ? separateCaptionAndHashtags(item.caption) : { caption: '', hashtags: '' };

                // Aggiungi Dati Riga
                const metaText = item.metaDetails || (item.adDetails ? item.adDetails.rawDetailText : '');
                const mData = parseMetaText(metaText) || {};

                const row = worksheet.getRow(rowIndex);
                const baseValues = {
                    brand: item.brandName || '',
                    social: socialName
                };

                // Assegna i valori specifici per modalità
                if (isMeta) {
                    // Formatta la tabella demografica in una stringa leggibile per Excel
                    let demoString = '';
                    if (mData.demographics && mData.demographics.length > 0) {
                        demoString = mData.demographics.map(d => `${d.location} | Età: ${d.age} | ${d.gender} -> ${parseInt(d.reach).toLocaleString('it-IT')}`).join('\n');
                    }

                    Object.assign(baseValues, {
                        libraryId: mData.libraryId || '',
                        startingDate: item.startingDate || '',
                        status: mData.status || '',
                        abtest: mData.hasVariants || '',
                        cta: mData.cta || '',
                        advertiser: mData.advertiser || '',
                        followers: mData.followers || '',
                        payer: mData.payer || '',
                        euReach: mData.euReach || '',
                        targetAge: mData.targetAge || '',
                        demographics: demoString,
                        caption: separated.caption
                    });
                } else if (isGoogle) {
                    const gRaw = item.adDetails ? item.adDetails.rawDetailText : (item.metaDetails || '');
                    const gData = parseGoogleAds(gRaw) || {};
                    Object.assign(baseValues, {
                        adFundedBy: gData.adFundedBy || '',
                        format: gData.format || item.format || '',
                        firstShown: gData.firstShown || '',
                        lastShown: gData.lastShown || '',
                        timesShown: gData.timesShown || '',
                        topic: gData.topic || '',
                        variants: gData.variants || '',
                        caption: separated.caption || item.caption || ''
                    });
                } else {
                    Object.assign(baseValues, {
                        date: item.date || '',
                        caption: separated.caption,
                        hashtags: separated.hashtags,
                        likes: item.metrics ? item.metrics.likes : '',
                        comments: item.metrics ? item.metrics.comments : '',
                        repost: item.metrics ? item.metrics.reshares : ''
                    });
                }

                row.values = baseValues;

                // Altezza riga per l'immagine
                row.height = 100;

                // Aggiungi Immagine
                const imageId = workbook.addImage({
                    base64: imgUrl,
                    extension: 'png',
                });

                worksheet.addImage(imageId, {
                    tl: { col: 0, row: rowIndex - 1 },
                    br: { col: 1, row: rowIndex },
                    editAs: 'oneCell'
                });

                row.alignment = { vertical: 'middle', horizontal: 'left' };
            }

            // NUOVO: Riga riepilogo statistiche brand (Solo Organico)
            const bs = calculateBrandStats(brandShots);
            if (isOrganic && bs.postsWithMetrics > 0) {
                const summaryRowIndex = brandShots.length + 2;
                const summaryRow = worksheet.getRow(summaryRowIndex);
                const dn = brandKey === '__NO_BRAND__' ? 'Senza Brand' : brandKey;
                summaryRow.values = {
                    brand: `📊 RIEPILOGO: ${dn}`,
                    social: `${bs.totalPosts} post`,
                    date: '',
                    startingDate: '',
                    caption: `Engagement Medio: ${formatNumber(bs.avgEngagement)} | Tot. Interazioni: ${formatNumber(bs.totalEngagement)}`,
                    hashtags: '',
                    likes: `AVG: ${bs.avgLikes}`,
                    comments: `AVG: ${bs.avgComments}`,
                    repost: `AVG: ${bs.avgShares}`,
                    metaDetails: ''
                };
                summaryRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                summaryRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FF1A1A1A' }
                };
                summaryRow.height = 30;
                summaryRow.alignment = { vertical: 'middle', horizontal: 'center' };
                summaryRow.eachCell((cell) => {
                    cell.border = {
                        top: { style: 'medium', color: { argb: 'FFE50000' } }
                    };
                });
            }

            // Genera Buffer
            const buffer = await workbook.xlsx.writeBuffer();

            // Crea Blob e Scarica
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const displayName = brandKey === '__NO_BRAND__' ? 'Senza_Brand' : brandKey;
            const filename = `${displayName}_${new Date().toISOString().slice(0, 10)}.xlsx`;

            chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            }, () => {
                URL.revokeObjectURL(url);
                showCustomDialog({ title: 'Excel Esportato', message: `Excel per ${displayName} scaricato correttamente!` });
            });

        } catch (err) {
            console.error("Errore ExcelJS Brand:", err);
            showCustomDialog({ title: 'Errore', message: 'Errore durante la creazione dell\'Excel.' });
        }
    };

    // --- Elementi DOM ---
    const startButton = document.getElementById('startButton');
    const clearButton = document.getElementById('clearButton');
    const fileInput = document.getElementById('excelFile');
    const textUrlsInput = document.getElementById('textUrls');
    const statusDiv = document.getElementById('status');
    const screenshotsContainer = document.getElementById('screenshots-container');
    const downloadAllButton = document.getElementById('downloadAllButton');
    const generatePptButton = document.getElementById('generatePptButton');
    const generateBenchmarkButton = document.getElementById('generateBenchmarkButton');
    const exportPdfButton = document.getElementById('exportPdfButton'); // NUOVO
    const exportExcelButton = document.getElementById('exportExcelButton'); // NUOVO EXCELJS

    // Pulsanti Export nella Galleria
    const galleryExportPdfBtn = document.getElementById('galleryExportPdfBtn');
    const galleryExportExcelBtn = document.getElementById('galleryExportExcelBtn');
    const galleryExportPptBtn = document.getElementById('galleryExportPptBtn');
    const galleryExportButtons = document.getElementById('gallery-export-buttons');

    const groupButton = document.getElementById('groupButton');
    const assignBrandButton = document.getElementById('assignBrandButton'); // NUOVO: Pulsante Crea Raggruppamento

    // Sidebar toggle elements
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('overlay');
    const sidebarTrigger = document.getElementById('sidebar-trigger');
    const closeSidebar = document.getElementById('close-sidebar');

    // Theme toggle elements
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');

    // AI Panel elements
    const aiPanelToggle = document.getElementById('aiPanelToggle');
    // New Chatbot Elements
    const aiChatbotPanel = document.getElementById('aiChatbotPanel');
    const aiChatbotOverlay = document.getElementById('aiChatbotOverlay');
    const closeAiChatbot = document.getElementById('closeAiChatbot');
    const aiChatbotMessages = document.getElementById('aiChatbotMessages');
    const aiChatbotPromptInput = document.getElementById('aiChatbotPromptInput');
    const aiChatbotSendBtn = document.getElementById('aiChatbotSendBtn');
    const aiChatbotPdfSelect = document.getElementById('aiChatbotPdfSelect');
    const aiChatbotHistoryBtn = document.getElementById('aiChatbotHistoryBtn');
    const aiPromptChips = document.getElementById('aiPromptChips');


    // Opzioni Cattura
    const removePopupsCheckbox = document.getElementById('removePopups');
    const enableZoomCheckbox = document.getElementById('enableZoom');
    const initialDelayInput = document.getElementById('initialDelay');
    const screenshotDelayInput = document.getElementById('screenshotDelay');
    const carouselSwipeDelayInput = document.getElementById('carouselSwipeDelay');
    const captureCarouselCheckbox = document.getElementById('captureCarousel');
    const maxCarouselSlidesInput = document.getElementById('maxCarouselSlides');

    // Opzioni Excel
    const excelOptionsBox = document.getElementById('excel-options-box');
    const sourceSelector = document.getElementById('sourceSelector');
    const columnSelector = document.getElementById('columnSelector');
    const sheetPreviewContainer = document.getElementById('sheet-preview-container');
    const sheetPreviewTable = document.getElementById('sheet-preview-table');
    const fullscreenPreviewButton = document.getElementById('fullscreenPreviewButton');

    const undoGlobalCropButton = document.getElementById('undoGlobalCropButton'); // NUOVO: Pulsante annulla ritaglio globale
    // Riferimenti Modale Lightbox
    const modal = document.getElementById('lightbox-modal');
    const modalImg = document.getElementById('lightbox-img');
    const closeModalButton = document.getElementById('lightbox-close');
    const cropButton = document.getElementById('cropButton');
    const saveCropButton = document.getElementById('saveCropButton');
    const deleteModalButton = document.getElementById('deleteModalButton');
    const globalCropButton = document.getElementById('globalCropButton');
    const prevModalButton = document.getElementById('prevModalButton');
    const nextModalButton = document.getElementById('nextModalButton');
    const undoCropButton = document.getElementById('undoCropButton'); // NUOVO: Riferimento al pulsante Annulla
    // Riferimenti per Preset e Log
    const saveAsPresetButton = document.getElementById('saveAsPresetButton');
    const cropPresetSelector = document.getElementById('cropPresetSelector');
    const deletePresetButton = document.getElementById('deletePresetButton');


    // Riferimenti Modale Anteprima Fullscreen
    const previewModal = document.getElementById('preview-modal');
    const closePreviewModalButton = document.getElementById('preview-modal-close');
    const fullscreenPreviewTable = document.getElementById('fullscreen-preview-table');
    const modalFilterControlsContainer = document.getElementById('modal-filter-controls-container');

    // NUOVI RIFERIMENTI: Preset Manager
    const presetManagerButton = document.getElementById('presetManagerButton');
    const presetManagerModal = document.getElementById('preset-manager-modal');
    const presetManagerClose = document.getElementById('preset-manager-close');
    const presetManagerList = document.getElementById('preset-manager-list');
    const presetManagerDetailsView = document.getElementById('preset-manager-details-view');
    const presetManagerPlaceholder = document.getElementById('preset-manager-placeholder');
    const presetManagerNameInput = document.getElementById('preset-manager-name');
    const presetOriginalImage = document.getElementById('preset-original-image');
    const presetCroppedImage = document.getElementById('preset-cropped-image');
    const presetManagerSaveButton = document.getElementById('preset-manager-save');
    const presetManagerAdjustButton = document.getElementById('preset-manager-adjust');
    const presetManagerDeleteButton = document.getElementById('preset-manager-delete');
    const presetOriginalImageWrapper = document.getElementById('preset-original-image-wrapper');
    const presetCroppedWrapper = document.getElementById('preset-cropped-wrapper');
    const presetManagerActions = document.getElementById('preset-manager-actions');

    // MODIFICA 1: Riferimenti Import/Export Preset
    const exportPresetsButton = document.getElementById('exportPresetsButton');
    const importPresetsInput = document.getElementById('importPresetsInput');

    // NUOVO RIFERIMENTO PER L'IMPORTAZIONE DELLE IMMAGINI
    const importImagesInput = document.getElementById('importImagesInput');

    // Controlli Filtri
    const filterControlsContainer = document.getElementById('filter-controls-container');
    const addFilterButton = document.getElementById('addFilterButton');
    const filterRowsContainer = document.getElementById('filter-rows');
    const categoryFilterContainer = document.getElementById('category-filter-buttons-container');

    // --- Stato Applicazione ---
    let urls = [];
    let currentScreenshots = [];
    let workbook = null;
    let originalSourceData = [];
    let currentSourceData = [];
    let currentModalIndex = -1;
    let cropper = null;
    let draggedElement = null;
    let selectedIndices = [];
    let activeFilter = 'instagram'; // Impostato Instagram di default al posto di 'all'
    let activeCategoryFilter = 'all';
    let metaStartDate = null;
    let metaEndDate = null;
    let metaMaxAdsCount = 30; // Limite di default per Meta Ads Library
    let googleStartDate = ""; // Date per Google Ads Library
    let googleEndDate = "";
    let googleMaxAdsCount = 30; // Limite di default per Google Ads Library
    let socialStartDate = ""; // NUOVO: Date per IG Desk
    let socialEndDate = "";
    let isGlobalCropActive = false;
    let visibleScreenshotIndices = [];
    let presetManagerCropper = null;
    let currentlyEditingPreset = null;
    let lastGlobalCropUndoData = []; // NUOVO: Memorizza i dati per annullare l'ultimo ritaglio globale

    // --- NUOVA FUNZIONE: Custom Dialog (Sostituisce alert, confirm, prompt) ---
    const showCustomDialog = ({ type = 'alert', title = 'Messaggio', message = '', defaultValue = '' }) => {
        return new Promise((resolve) => {
            const dialogModal = document.getElementById('custom-dialog-modal');
            const dialogIcon = document.getElementById('dialog-icon');
            const dialogTitle = document.getElementById('dialog-title');
            const dialogMessage = document.getElementById('dialog-message');
            const dialogInput = document.getElementById('dialog-input');
            const confirmBtn = document.getElementById('dialog-confirm-btn');
            const cancelBtn = document.getElementById('dialog-cancel-btn');

            // Reset UI
            dialogTitle.textContent = title;
            dialogMessage.innerHTML = message; // Cambiato da textContent a innerHTML per supportare HTML
            dialogInput.style.display = 'none';
            cancelBtn.style.display = 'none';
            confirmBtn.textContent = 'OK';

            // Configure based on type
            if (type === 'alert') {
                dialogIcon.textContent = 'ℹ️';
                dialogIcon.style.color = 'var(--havas-red)';
            } else if (type === 'confirm') {
                dialogIcon.textContent = '❓';
                dialogIcon.style.color = '#ffcc00';
                cancelBtn.style.display = 'inline-block';
            } else if (type === 'prompt') {
                dialogIcon.textContent = '✏️';
                dialogIcon.style.color = '#00ccff';
                dialogInput.style.display = 'block';
                dialogInput.value = defaultValue;
                cancelBtn.style.display = 'inline-block';
            }

            const cleanup = () => {
                dialogModal.style.display = 'none';
                confirmBtn.removeEventListener('click', onConfirm);
                cancelBtn.removeEventListener('click', onCancel);
            };

            const onConfirm = () => {
                cleanup();
                if (type === 'prompt') resolve(dialogInput.value);
                else resolve(true);
            };

            const onCancel = () => {
                cleanup();
                if (type === 'prompt') resolve(null);
                else resolve(false);
            };

            confirmBtn.addEventListener('click', onConfirm);
            cancelBtn.addEventListener('click', onCancel);
            dialogModal.style.display = 'flex';
        });
    };

    // --- Funzioni UI ---
    const updateStartButtonState = () => {
        const executionMode = document.querySelector('input[name="executionMode"]:checked')?.value;
        const textContent = textUrlsInput.value.trim();

        // CASO 1: META LIBRARY (Basta che ci sia del testo)
        if (executionMode === 'meta_library') {
            const hasKeyword = textContent.length > 0;
            startButton.disabled = !hasKeyword;
            statusDiv.textContent = hasKeyword ? 'Keyword pronta. Clicca "Avvia" per cercare.' : 'Inserisci una keyword per cercare nella Ads Library.';
            return;
        }

        // CASO 1b: GOOGLE ADS (Basta che ci sia del testo)
        if (executionMode === 'google_ads') {
            const hasDomain = textContent.length > 0;
            startButton.disabled = !hasDomain;
            statusDiv.textContent = hasDomain ? 'Domini pronti. Clicca "Avvia" per cercare.' : 'Inserisci i domini web da cercare (es. apple.com).';
            return;
        }

        // CASO 2: ANALISI AI
        if (executionMode === 'ai_analysis') {
            startButton.disabled = false;
            const inlinePdfSelect = document.getElementById('inlinePdfSelect');
            const hasPrompt = textContent.length > 0;

            if (inlinePdfSelect?.value && hasPrompt) {
                statusDiv.textContent = 'PDF e prompt pronti. Clicca "Avvia" per analizzare.';
            } else if (inlinePdfSelect?.value) {
                statusDiv.textContent = 'PDF selezionato. Scrivi un prompt e premi "Avvia".';
            } else if (hasPrompt) {
                statusDiv.textContent = 'Prompt pronto. Seleziona un PDF dal dropdown.';
            } else {
                statusDiv.textContent = 'Modalità Analisi AI attiva. Seleziona un PDF e scrivi il prompt.';
            }
            return;
        }

        // CASO 3: MODALITÀ NORMALI (Direct/Desk - servono URL http)
        const hasTextUrls = textContent.split(/[\n\s,]+/).some(line => line.startsWith('http'));
        const hasExcelUrls = urls.length > 0 && workbook !== null;

        if (hasTextUrls || hasExcelUrls) {
            const count = hasTextUrls ? textContent.split(/[\n\s,]+/).filter(line => line.startsWith('http')).length : urls.length;
            statusDiv.textContent = `${count} URL pronti. Clicca "Avvia".`;
            startButton.disabled = false;
        } else {
            statusDiv.textContent = '';
            startButton.disabled = true;
        }
    };

    const updateActionButtonsState = () => {
        const hasScreenshots = currentScreenshots.length > 0;
        downloadAllButton.disabled = !hasScreenshots;
        generatePptButton.disabled = !hasScreenshots;
        exportPdfButton.disabled = !hasScreenshots; // NUOVO
        if (exportExcelButton) exportExcelButton.disabled = !hasScreenshots;
        if (generateBenchmarkButton) generateBenchmarkButton.disabled = !hasScreenshots;
        clearButton.disabled = !hasScreenshots;

        // Mostra/nascondi pulsanti export nella galleria
        if (galleryExportButtons) {
            galleryExportButtons.style.display = hasScreenshots ? 'flex' : 'none';
        }
    };

    const updateGroupButtonState = () => {
        const hasMultipleSelected = selectedIndices.length >= 2;
        groupButton.disabled = !hasMultipleSelected;
        assignBrandButton.disabled = !hasMultipleSelected;
    };

    // NUOVA FUNZIONE: Sincronizza l'array selectedIndices con l'interfaccia (checkbox e bordi)
    const syncSelectionUI = () => {
        const containers = document.querySelectorAll('.thumbnail-container');
        containers.forEach(container => {
            const index = parseInt(container.dataset.index, 10);
            const checkbox = container.querySelector('.select-checkbox');
            if (selectedIndices.includes(index)) {
                container.classList.add('selected');
                if (checkbox) checkbox.checked = true;
            } else {
                container.classList.remove('selected');
                if (checkbox) checkbox.checked = false;
            }
        });
        updateGroupButtonState();
        if (selectedIndices.length > 0) {
            assignBrandButton.textContent = `Attribuisci (${selectedIndices.length})`;
        } else {
            assignBrandButton.textContent = "Attribuisci";
        }
    };

    const renderCategoryFilters = () => {
        const container = document.getElementById('category-filter-buttons-container');
        container.innerHTML = ''; // Pulisce i vecchi pulsanti

        // Estrai solo le categorie uniche dagli screenshot "Meta" organici
        const metaScreenshots = currentScreenshots.filter(shot => {
            const filename = shot.filename || '';
            const isMeta = filename.includes('instagram.com') || filename.includes('facebook.com') || filename.includes('meta.com') || filename.includes('fb.me');
            // Assicurati che le Ads non generino "sotto-filtri" nella vista organica
            return isMeta && shot.category !== 'Meta Ads Library';
        });

        const uniqueCategories = [...new Set(metaScreenshots.map(shot => shot.category).filter(Boolean))].sort();

        // Funzione per creare un pulsante
        const createCategoryButton = (text, filterValue) => {
            const button = document.createElement('button');
            button.className = 'filter-btn category-btn';
            button.textContent = text;
            button.dataset.categoryFilter = filterValue;
            if (activeCategoryFilter === filterValue) {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                // Non serve rimuovere la classe 'active' qui, verrà gestito dal re-render
                activeCategoryFilter = filterValue;
                refreshScreenshotsView(); // Ridisegna tutto con il nuovo filtro
            });
            container.appendChild(button);
        };

        // Crea sempre il pulsante "Tutte le Categorie"
        createCategoryButton('Tutte le Categorie', 'all');

        // Crea i pulsanti per ogni categoria trovata
        uniqueCategories.forEach(category => {
            createCategoryButton(category, category);
        });
    };


    // NUOVA FUNZIONE: Genera un colore HSL consistente da una stringa
    const stringToColor = (str) => {
        if (!str) return '#666666';
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return `hsl(${Math.abs(hash % 360)}, 65%, 45%)`;
    };

    // NUOVA FUNZIONE: Rinomina un brand
    const renameBrand = (oldName, newName) => {
        if (!newName || newName.trim() === '') return;
        newName = newName.trim();

        let changesMade = 0;
        currentScreenshots.forEach(shot => {
            if (shot.brandName === oldName) {
                shot.brandName = newName;
                changesMade++;
            }
        });

        if (changesMade > 0) {
            chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
            statusDiv.textContent = `Brand rinominato: "${oldName}" → "${newName}" (${changesMade} screenshot aggiornati)`;
        }
    };

    const refreshScreenshotsView = () => {
        chrome.runtime.sendMessage({ action: 'getScreenshots' }, (response) => {
            if (chrome.runtime.lastError) { console.warn("Errore di comunicazione con background script."); return; }
            if (response && response.screenshots) {
                currentScreenshots = response.screenshots;

                // PULIZIA: Rileviamo il testo nascosto, lo estraiamo e puliamo la caption
                currentScreenshots.forEach(shot => {
                    if (shot.caption && shot.caption.includes('|||META_DETAILS|||')) {
                        const parts = shot.caption.split('|||META_DETAILS|||');
                        shot.caption = parts[0];       // Ripristina la caption originale
                        shot.metaDetails = parts[1];   // Salva i testi completi per il file TXT
                    } else if (shot.caption && shot.caption.includes('|||GOOGLE_DETAILS|||')) {
                        const parts = shot.caption.split('|||GOOGLE_DETAILS|||');
                        shot.caption = parts[0];       // Ripristina la caption originale
                        shot.metaDetails = parts[1];   // Salva i dettagli Google nello stesso campo (riusato da export TXT)
                    }
                });

                screenshotsContainer.innerHTML = '';
                selectedIndices = [];

                // --- NUOVA LOGICA: Nascondi galleria e centra il layout se vuoto ---
                const galleryWrapper = document.getElementById('gallery-wrapper');
                const mainContainer = document.querySelector('main');

                if (currentScreenshots.length === 0) {
                    galleryWrapper.style.display = 'none';
                    // AGGIUNGIAMO LA CLASSE PER CENTRARE VERTICALMENTE
                    mainContainer.classList.add('centered-layout');

                    updateActionButtonsState();
                    return;
                } else {
                    // RIMUOVIAMO LA CLASSE PER TORNARE IN ALTO
                    mainContainer.classList.remove('centered-layout');

                    if (galleryWrapper.style.display === 'none' || galleryWrapper.style.display === '') {
                        galleryWrapper.style.display = 'flex';
                        galleryWrapper.style.animation = 'fadeInUp 0.5s ease forwards';
                    } else {
                        galleryWrapper.style.display = 'flex';
                    }
                }
                // ---------------------------------------------------------

                // --- LOGICA GALLERIA INTELLIGENTE BASATA SULLE TAB IN ALTO ---
                const currentMode = document.querySelector('input[name="executionMode"]:checked')?.value || 'desk';
                const filterContainer = document.getElementById('filter-buttons-container');

                // 1. Gestione visibilità della barra dei filtri in base alla Tab
                if (currentMode === 'meta_library' || currentMode === 'google_ads' || currentMode === 'ai_analysis') {
                    filterContainer.style.display = 'none';
                    categoryFilterContainer.style.display = 'none';
                } else {
                    filterContainer.style.display = 'flex';
                    if (activeFilter === 'meta') {
                        renderCategoryFilters();
                        categoryFilterContainer.style.display = 'flex';
                    } else {
                        categoryFilterContainer.style.display = 'none';
                    }
                }

                // 2. Filtraggio dei contenuti
                const screenshotsToDisplay = currentScreenshots
                    .map((shot, originalIndex) => ({ ...shot, originalIndex }))
                    .filter(shot => {
                        const isMetaAd = (shot.category === 'Meta Ads Library');
                        const isGoogleAd = (shot.category === 'Google Ads Library');

                        // SEZIONE META LIBRARY: Mostra SOLO Meta Ads
                        if (currentMode === 'meta_library') {
                            return isMetaAd;
                        }

                        // SEZIONE GOOGLE ADS: Mostra SOLO Google Ads
                        if (currentMode === 'google_ads') {
                            return isGoogleAd;
                        }

                        // SEZIONE AI ANALYSIS: Nasconde la galleria
                        if (currentMode === 'ai_analysis') {
                            return false;
                        }

                        // SEZIONE SOCIAL (Desk/Direct): Escludi tutte le Ads e applica i filtri IG/FB/TikTok
                        if (isMetaAd || isGoogleAd) {
                            return false;
                        }

                        // Logica classica per contenuti organici
                        // MODIFICA: Se l'elemento è un gruppo, recupera nome e categoria dalla prima immagine contenuta
                        const targetFilename = (shot.isGroup && shot.items && shot.items.length > 0) ? (shot.items[0].filename || '') : (shot.filename || '');
                        const targetCategory = (shot.isGroup && shot.items && shot.items.length > 0) ? shot.items[0].category : shot.category;

                        let mainFilterMatch = false;
                        const isInstagram = targetFilename.includes('instagram.com');
                        const isFacebook = targetFilename.includes('facebook.com') || targetFilename.includes('meta.com') || targetFilename.includes('fb.me');
                        const isTiktok = targetFilename.includes('tiktok.com');

                        switch (activeFilter) {
                            case 'instagram': mainFilterMatch = isInstagram; break;
                            case 'facebook': mainFilterMatch = isFacebook; break;
                            case 'tiktok': mainFilterMatch = isTiktok; break;
                        }

                        // Filtro per categoria interna (Reel, Carousel, ecc.)
                        let categoryFilterMatch = true;
                        // Mostra i sotto-filtri di categoria per Instagram e Facebook
                        if ((activeFilter === 'instagram' || activeFilter === 'facebook') && activeCategoryFilter !== 'all') {
                            categoryFilterMatch = (targetCategory === activeCategoryFilter);
                        }
                        return mainFilterMatch && categoryFilterMatch;
                    });

                visibleScreenshotIndices = screenshotsToDisplay.map(shot => shot.originalIndex);

                if (screenshotsToDisplay.length === 0) {
                    screenshotsContainer.innerHTML = `<p style="width: 100%; text-align: center; color: #888;">Nessuno screenshot corrisponde ai filtri selezionati.</p>`;
                } else {
                    // NUOVO: Raggruppa per brand
                    const brandGroups = {};
                    screenshotsToDisplay.forEach(shot => {
                        const brandKey = shot.brandName || '__NO_BRAND__';
                        if (!brandGroups[brandKey]) {
                            brandGroups[brandKey] = [];
                        }
                        brandGroups[brandKey].push(shot);
                    });

                    // Ordina i brand alfabeticamente (con "senza brand" alla fine)
                    const sortedBrands = Object.keys(brandGroups).sort((a, b) => {
                        if (a === '__NO_BRAND__') return 1;
                        if (b === '__NO_BRAND__') return -1;
                        return a.localeCompare(b);
                    });

                    // Crea una sezione per ogni brand
                    sortedBrands.forEach(brandKey => {
                        const shots = brandGroups[brandKey];
                        const isNoBrand = brandKey === '__NO_BRAND__';
                        const displayName = isNoBrand ? 'Senza Brand' : brandKey;
                        const brandColor = stringToColor(brandKey);

                        // Container sezione brand
                        const brandSection = document.createElement('div');
                        brandSection.className = 'brand-section' + (isNoBrand ? ' no-brand' : '');
                        brandSection.dataset.brand = brandKey;

                        // Header con nome brand (Look Havas Antracite)
                        const brandHeader = document.createElement('div');
                        brandHeader.className = 'brand-header';

                        // Area Sinistra: Info Brand
                        const leftInfo = document.createElement('div');
                        leftInfo.className = 'brand-name-container';

                        const brandNameSpan = document.createElement('span');
                        brandNameSpan.className = 'brand-name';
                        brandNameSpan.textContent = isNoBrand ? 'Senza Brand' : brandKey.toUpperCase();

                        const countBadge = document.createElement('span');
                        countBadge.className = 'brand-count';
                        countBadge.textContent = `${shots.length} file`;

                        leftInfo.appendChild(brandNameSpan);
                        leftInfo.appendChild(countBadge);

                        // Area Destra: Toolbar Azioni
                        const rightActions = document.createElement('div');
                        rightActions.className = 'brand-actions-group';

                        // Funzione helper interna per i bottoni della toolbar
                        const createToolbarBtn = (html, title, className, onClick) => {
                            const btn = document.createElement('button');
                            btn.className = 'brand-edit-btn ' + (className || '');
                            btn.innerHTML = html;
                            btn.title = title;
                            btn.addEventListener('click', onClick);
                            return btn;
                        };

                        // --- GRUPPO 1: Metadati e Rinomina ---
                        // NUOVO: Pulsante Dettaglio x Post
                        rightActions.appendChild(createToolbarBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Dettaglio x Post', `Mostra dettagli per ${shots.length} post`, '', (e) => {
                            e.stopPropagation();
                            showBrandDetailModal(brandKey, shots);
                        }));

                        if (!isNoBrand) {
                            const firstShotWithInfo = shots.find(s => s.followers);
                            if (firstShotWithInfo?.followers) {
                                rightActions.appendChild(createToolbarBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg> Info', `Followers: ${firstShotWithInfo.followers}`, '', (e) => {
                                    e.stopPropagation();
                                    showCustomDialog({ title: 'Dati Profilo', message: `Followers: ${firstShotWithInfo.followers}` });
                                }));
                            }

                            rightActions.appendChild(createToolbarBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Rinomina', 'Rinomina Brand', '', (e) => {
                                e.stopPropagation();
                                showCustomDialog({ type: 'prompt', title: 'Rinomina Brand', message: 'Nuovo nome:', defaultValue: brandKey })
                                    .then(newName => { if (newName) renameBrand(brandKey, newName); });
                            }));
                        }

                        rightActions.appendChild(document.createElement('div')).className = 'brand-action-sep';

                        // --- GRUPPO 2: Azioni di Massa ---
                        // Seleziona Tutto
                        rightActions.appendChild(createToolbarBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg> Tutti', 'Seleziona Tutto', '', (e) => {
                            e.stopPropagation();
                            const groupIndices = shots.map(s => s.originalIndex);
                            const allSelected = groupIndices.every(i => selectedIndices.includes(i));
                            if (allSelected) selectedIndices = selectedIndices.filter(i => !groupIndices.includes(i));
                            else groupIndices.forEach(i => { if (!selectedIndices.includes(i)) selectedIndices.push(i); });
                            syncSelectionUI();
                        }));

                        // Unisci (Raggruppa)
                        rightActions.appendChild(createToolbarBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> Unisci', 'Raggruppa Selezionati', '', (e) => {
                            e.stopPropagation();
                            const groupIndices = shots.map(s => s.originalIndex);
                            const currentGroupSelection = selectedIndices.filter(i => groupIndices.includes(i));
                            if (currentGroupSelection.length < 2) {
                                showCustomDialog({ title: 'Info', message: "Seleziona almeno 2 immagini." });
                                return;
                            }
                            currentGroupSelection.sort((a, b) => a - b);
                            const itemsToGroup = currentGroupSelection.map(index => currentScreenshots[index]);
                            const newGroup = { isGroup: true, items: itemsToGroup, filename: `comparison-${Date.now()}.png`, brandName: brandKey !== '__NO_BRAND__' ? brandKey : undefined };
                            const newScreenshots = currentScreenshots.filter((_, index) => !currentGroupSelection.includes(index));
                            newScreenshots.splice(currentGroupSelection[0], 0, newGroup);
                            currentScreenshots = newScreenshots;
                            chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
                        }));

                        // Brandizza (Tag)
                        rightActions.appendChild(createToolbarBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg> Sposta', 'Assegna Brand', '', (e) => {
                            e.stopPropagation();
                            const groupIndices = shots.map(s => s.originalIndex);
                            const currentGroupSelection = selectedIndices.filter(i => groupIndices.includes(i));
                            if (currentGroupSelection.length === 0) {
                                showCustomDialog({ title: 'Info', message: "Seleziona almeno un file." });
                                return;
                            }
                            showCustomDialog({ type: 'prompt', title: 'Assegna Brand', message: `Sposta ${currentGroupSelection.length} file nel brand:`, defaultValue: brandKey !== '__NO_BRAND__' ? brandKey : '' })
                                .then(brandNamePrompt => {
                                    if (brandNamePrompt === null) return;
                                    const assignedBrand = brandNamePrompt.trim() || null;
                                    currentGroupSelection.forEach(index => { if (currentScreenshots[index]) currentScreenshots[index].brandName = assignedBrand; });
                                    chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
                                });
                        }));

                        rightActions.appendChild(document.createElement('div')).className = 'brand-action-sep';

                        // --- GRUPPO 3: Pericolo ---
                        rightActions.appendChild(createToolbarBtn('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>', 'Elimina Tutto il Gruppo', 'delete-group', (e) => {
                            e.stopPropagation();
                            showCustomDialog({ type: 'confirm', title: 'Elimina', message: `Eliminare l'intero gruppo "${brandKey}"?` })
                                .then(confirmed => {
                                    if (confirmed) {
                                        const indicesToRemove = new Set(shots.map(s => s.originalIndex));
                                        currentScreenshots = currentScreenshots.filter((_, index) => !indicesToRemove.has(index));
                                        chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
                                    }
                                });
                        }));

                        brandHeader.appendChild(leftInfo);
                        brandHeader.appendChild(rightActions);
                        brandSection.appendChild(brandHeader);

                        // NUOVO: Barra statistiche brand
                        const brandStats = calculateBrandStats(shots);
                        if (brandStats.postsWithMetrics > 0) {
                            const statsBar = document.createElement('div');
                            statsBar.className = 'brand-stats-bar';
                            statsBar.innerHTML = `
                                <div class="brand-stat-item" data-stat-type="likes" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                                    <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px;">
                                        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                    </svg>
                                    <span class="brand-stat-label">Media Like</span>
                                    <span class="brand-stat-value">${formatNumber(brandStats.avgLikes)}</span>
                                </div>
                                <div class="brand-stat-item" data-stat-type="comments" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                                    <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                    </svg>
                                    <span class="brand-stat-label">Media Commenti</span>
                                    <span class="brand-stat-value">${formatNumber(brandStats.avgComments)}</span>
                                </div>
                                <div class="brand-stat-item" data-stat-type="shares" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                                    <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                        <polyline points="23 4 23 10 17 10"></polyline>
                                        <polyline points="1 20 1 14 7 14"></polyline>
                                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                    </svg>
                                    <span class="brand-stat-label">Media Condivisioni</span>
                                    <span class="brand-stat-value">${formatNumber(brandStats.avgShares)}</span>
                                </div>
                                <div class="brand-stat-item" data-stat-type="engagement" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                                    <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                        <line x1="18" y1="20" x2="18" y2="10"></line>
                                        <line x1="12" y1="20" x2="12" y2="4"></line>
                                        <line x1="6" y1="20" x2="6" y2="14"></line>
                                    </svg>
                                    <span class="brand-stat-label">Engagement Medio</span>
                                    <span class="brand-stat-value">${formatNumber(brandStats.avgEngagement)}</span>
                                </div>
                                <div class="brand-stat-item" data-stat-type="totalEngagement" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                                    <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                    </svg>
                                    <span class="brand-stat-label">Totale Interazioni</span>
                                    <span class="brand-stat-value">${formatNumber(brandStats.totalEngagement)}</span>
                                </div>
                                <div class="brand-stat-item" data-stat-type="postsAnalyzed" style="cursor: pointer;" title="Clicca per maggiori informazioni">
                                    <svg class="brand-stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                        <polyline points="14 2 14 8 20 8"></polyline>
                                        <line x1="16" y1="13" x2="8" y2="13"></line>
                                        <line x1="16" y1="17" x2="8" y2="17"></line>
                                        <line x1="10" y1="9" x2="8" y2="9"></line>
                                    </svg>
                                    <span class="brand-stat-label">Post Analizzati</span>
                                    <span class="brand-stat-value">${brandStats.postsWithMetrics}/${brandStats.totalPosts}</span>
                                </div>
                            `;
                            brandSection.appendChild(statsBar);

                            // Aggiungi event listeners per le statistiche cliccabili
                            statsBar.querySelectorAll('.brand-stat-item').forEach(item => {
                                item.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const statType = item.dataset.statType;
                                    showStatExplanation(statType, brandStats);
                                });
                            });
                        }

                        // Container screenshots
                        const screenshotsDiv = document.createElement('div');
                        screenshotsDiv.className = 'brand-screenshots';

                        shots.forEach((shot) => {
                            const index = shot.originalIndex;
                            const container = document.createElement('div');
                            container.className = 'thumbnail-container';
                            container.dataset.index = index;

                            // Bordi rimossi (ora gestiti via CSS come sempre rossi)

                            container.addEventListener('click', () => {
                                if (!shot.isGroup) openModal(index);
                                else {
                                    showCustomDialog({
                                        title: 'Info Gruppo',
                                        message: `Questo è un gruppo di ${shot.items.length} immagini. Separa il gruppo per modificarle singolarmente.`
                                    });
                                }
                            });

                            const checkbox = document.createElement('input');
                            checkbox.type = 'checkbox';
                            checkbox.className = 'select-checkbox';
                            checkbox.addEventListener('click', e => e.stopPropagation());
                            checkbox.addEventListener('change', () => {
                                if (checkbox.checked) {
                                    if (!selectedIndices.includes(index)) selectedIndices.push(index);
                                } else {
                                    selectedIndices = selectedIndices.filter(i => i !== index);
                                }
                                syncSelectionUI();
                            });
                            container.appendChild(checkbox);

                            const img = document.createElement('img');
                            img.src = shot.isGroup ? shot.items[0].url : shot.url;
                            img.className = 'thumbnail';
                            img.title = shot.filename;

                            // VISUALIZZA METRICHE
                            if (shot.metrics && (shot.metrics.likes > 0 || shot.metrics.comments > 0)) {
                                const metricsBadge = document.createElement('div');
                                metricsBadge.className = 'metrics-badge';
                                metricsBadge.innerHTML = `
                                    <span style="display: flex; align-items: center; gap: 3px;">
                                        <svg viewBox="0 0 24 24" fill="currentColor" style="width: 12px; height: 12px;">
                                            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                                        </svg>
                                        ${shot.metrics.likes}
                                    </span>
                                    <span style="display: flex; align-items: center; gap: 3px;">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;">
                                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                                        </svg>
                                        ${shot.metrics.comments}
                                    </span>
                                    ${shot.metrics.reshares > 0 ? `
                                        <span style="display: flex; align-items: center; gap: 3px;">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 12px; height: 12px;">
                                                <polyline points="23 4 23 10 17 10"></polyline>
                                                <polyline points="1 20 1 14 7 14"></polyline>
                                                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                                            </svg>
                                            ${shot.metrics.reshares}
                                        </span>
                                    ` : ''}
                                `;
                                container.appendChild(metricsBadge);
                            }

                            // NUOVO: VISUALIZZA CAPTION
                            if (shot.caption && shot.caption.trim().length > 0) {
                                const captionBadge = document.createElement('div');
                                captionBadge.className = 'caption-badge';
                                captionBadge.innerHTML = '📝';
                                captionBadge.title = `Caption: ${shot.caption.substring(0, 200)}${shot.caption.length > 200 ? '...' : ''}`;
                                container.appendChild(captionBadge);
                            }

                            const deleteIcon = document.createElement('span');
                            deleteIcon.className = 'delete-icon';
                            deleteIcon.innerHTML = '&times;';
                            deleteIcon.title = "Elimina";
                            deleteIcon.addEventListener('click', (e) => {
                                e.stopPropagation();
                                deleteScreenshot(index);
                            });

                            container.appendChild(img);
                            container.appendChild(deleteIcon);

                            if (shot.isGroup) {
                                const groupBadge = document.createElement('div');
                                groupBadge.className = 'group-badge';
                                groupBadge.textContent = `${shot.items.length} immagini`;
                                container.appendChild(groupBadge);

                                const ungroupIcon = document.createElement('span');
                                ungroupIcon.className = 'ungroup-icon';
                                ungroupIcon.innerHTML = '&#x2795;';
                                ungroupIcon.title = "Separa Gruppo";
                                ungroupIcon.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    ungroupScreenshots(index);
                                });
                                container.appendChild(ungroupIcon);
                            }
                            screenshotsDiv.appendChild(container);
                        });

                        brandSection.appendChild(screenshotsDiv);
                        screenshotsContainer.appendChild(brandSection);
                    });
                }
                updateActionButtonsState();
                updateGroupButtonState();
                renderCropLog();
            }
        });
    };

    const renderSourcePreview = (highlightedColIndex = -1) => {
        sheetPreviewTable.innerHTML = '';
        if (currentSourceData.length === 0) {
            sheetPreviewContainer.style.display = 'none';
            fullscreenPreviewButton.style.display = 'none';
            return;
        }
        const PREVIEW_ROW_LIMIT = 30;
        const dataToShow = currentSourceData.slice(0, PREVIEW_ROW_LIMIT);
        const headerData = originalSourceData[0] || [];
        const thead = sheetPreviewTable.createTHead();
        const tbody = sheetPreviewTable.createTBody();

        const headerRow = document.createElement('tr');
        headerData.forEach((cellData, colIndex) => {
            const cell = document.createElement('th');
            cell.textContent = cellData !== null && cellData !== undefined ? cellData : '';
            if (colIndex === highlightedColIndex) {
                cell.className = 'highlighted-column';
            }
            headerRow.appendChild(cell);
        });
        thead.appendChild(headerRow);

        dataToShow.slice(1).forEach(rowData => {
            const row = document.createElement('tr');
            rowData.forEach((cellData, colIndex) => {
                const cell = document.createElement('td');
                cell.textContent = cellData !== null && cellData !== undefined ? cellData : '';
                if (colIndex === highlightedColIndex) {
                    cell.className = 'highlighted-column';
                }
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });

        // MODIFICA: Non mostrare mai la tabella inline, solo tramite il pulsante Anteprima
        sheetPreviewContainer.style.display = 'none';
        fullscreenPreviewButton.style.display = 'none';
    };

    const updateModalContent = (newIndex) => {
        if (cropper) {
            cropper.destroy();
            cropper = null;
            cropButton.style.display = 'inline-flex';
            globalCropButton.style.display = 'inline-flex';
            saveCropButton.style.display = 'none';
            saveCropButton.classList.remove('save-global');
            isGlobalCropActive = false;
        }

        currentModalIndex = newIndex;
        modalImg.src = currentScreenshots[newIndex].url;

        // NUOVO: Gestione Caption nel Modal
        const captionElement = document.getElementById('lightbox-caption');
        const currentScreenshot = currentScreenshots[newIndex];
        if (currentScreenshot.caption && currentScreenshot.caption.trim().length > 0) {
            captionElement.textContent = currentScreenshot.caption;
            captionElement.style.display = 'block';
        } else {
            captionElement.style.display = 'none';
        }

        const navigationPossible = visibleScreenshotIndices.length > 1;
        prevModalButton.style.display = navigationPossible ? 'inline-flex' : 'none';
        nextModalButton.style.display = navigationPossible ? 'inline-flex' : 'none';

        // --- NUOVA LOGICA: GESTIONE VISIBILITÀ PULSANTE ANNULLA ---
        const currentScreenshotForUndo = currentScreenshots[newIndex];
        if (currentScreenshotForUndo && currentScreenshotForUndo.undoHistory && currentScreenshotForUndo.undoHistory.length > 0) {
            undoCropButton.style.display = 'inline-flex';
        } else {
            undoCropButton.style.display = 'none';
        }
        // --- FINE NUOVA LOGICA ---
    };

    const navigateToNext = () => {
        if (visibleScreenshotIndices.length <= 1) return;
        const currentIndexInVisible = visibleScreenshotIndices.indexOf(currentModalIndex);
        const nextIndexInVisible = (currentIndexInVisible + 1) % visibleScreenshotIndices.length;
        const newOriginalIndex = visibleScreenshotIndices[nextIndexInVisible];
        updateModalContent(newOriginalIndex);
    };

    const navigateToPrev = () => {
        if (visibleScreenshotIndices.length <= 1) return;
        const currentIndexInVisible = visibleScreenshotIndices.indexOf(currentModalIndex);
        const nextIndexInVisible = (currentIndexInVisible - 1 + visibleScreenshotIndices.length) % visibleScreenshotIndices.length;
        const newOriginalIndex = visibleScreenshotIndices[nextIndexInVisible];
        updateModalContent(newOriginalIndex);
    };

    const handleKeyDown = (event) => {
        if (modal.style.display !== 'flex') return;
        if (event.key === 'ArrowRight') navigateToNext();
        else if (event.key === 'ArrowLeft') navigateToPrev();
    };

    const parseUrlsFromSource = () => {
        if (!workbook) return;
        const colIndex = parseInt(columnSelector.value, 10);

        if (isNaN(colIndex)) {
            urls = [];
        } else {
            urls = currentSourceData
                .slice(1)
                .map(row => row[colIndex])
                .filter(cell => typeof cell === 'string' && (cell.startsWith('http://') || cell.startsWith('https://')));
        }
        updateStartButtonState();
    };

    const updateColumnSelector = () => {
        const firstRow = originalSourceData[0] || [];
        columnSelector.innerHTML = '';
        let urlColumnIndex = -1;

        firstRow.forEach((header, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `Colonna ${XLSX.utils.encode_col(index)}` + (header ? `: ${header}` : '');
            columnSelector.appendChild(option);

            // Cerca la prima colonna che contiene "url" nel nome o che ha dati che iniziano con http
            if (urlColumnIndex === -1) {
                // Controlla se l'header contiene "url" (case insensitive)
                if (header && String(header).toLowerCase().includes('url')) {
                    urlColumnIndex = index;
                }
                // Altrimenti controlla se i dati della colonna contengono URL
                else if (originalSourceData.length > 1) {
                    const sampleData = originalSourceData.slice(1, 6); // Controlla le prime 5 righe
                    const hasUrls = sampleData.some(row => {
                        const cellValue = row[index];
                        return cellValue && String(cellValue).toLowerCase().startsWith('http');
                    });
                    if (hasUrls) {
                        urlColumnIndex = index;
                    }
                }
            }
        });

        // Seleziona automaticamente la colonna URL se trovata
        if (urlColumnIndex !== -1) {
            columnSelector.value = urlColumnIndex;
        }
    };

    const loadDataFromSource = () => {
        if (!workbook) return;
        const selectedValue = sourceSelector.value;
        if (!selectedValue) {
            originalSourceData = [];
            return;
        }

        const [type, sheetName, tableName] = selectedValue.split('|');
        const worksheet = workbook.Sheets[sheetName];

        if (type === 'sheet') {
            originalSourceData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        } else if (type === 'table') {
            const table = (worksheet['!table' + 's'] || []).find(t => t.name === tableName);
            if (table) {
                originalSourceData = XLSX.utils.sheet_to_json(worksheet, { header: 1, range: table.ref, defval: "" });
            } else {
                originalSourceData = [];
            }
        }
    };

    const populateSourceSelector = () => {
        sourceSelector.innerHTML = '';
        if (!workbook) return;

        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const sheetOption = document.createElement('option');
            sheetOption.value = `sheet|${sheetName}`;
            sheetOption.textContent = `Foglio: ${sheetName}`;
            sourceSelector.appendChild(sheetOption);

            const tables = worksheet['!table' + 's'] || [];
            tables.forEach(table => {
                const tableOption = document.createElement('option');
                tableOption.value = `table|${sheetName}|${table.name}`;
                tableOption.textContent = `  Tbl: ${table.name} (in ${sheetName})`;
                sourceSelector.appendChild(tableOption);
            });
        });
        resetAndLoadSource();
    };

    const resetAndLoadSource = () => {
        loadDataFromSource();
        updateColumnSelector();
        // Trigger change event per aggiornare l'interfaccia con la colonna selezionata automaticamente
        columnSelector.dispatchEvent(new Event('change'));
        filterRowsContainer.innerHTML = '';
        applyAndRenderFilters();
    };

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0]; if (!file) return; textUrlsInput.value = ''; statusDiv.textContent = 'Leggendo il file Excel...'; const reader = new FileReader(); reader.onload = (e) => { try { workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); excelOptionsBox.style.display = 'block'; sheetPreviewContainer.style.display = 'none'; populateSourceSelector(); const excelPreviewBtn = document.getElementById('excelPreviewButton'); if (excelPreviewBtn) excelPreviewBtn.style.display = 'block'; } catch (err) { statusDiv.textContent = 'Errore nella lettura del file Excel.'; startButton.disabled = true; workbook = null; excelOptionsBox.style.display = 'none'; sheetPreviewContainer.style.display = 'none'; const excelPreviewBtn = document.getElementById('excelPreviewButton'); if (excelPreviewBtn) excelPreviewBtn.style.display = 'none'; console.error(err); } }; reader.readAsArrayBuffer(file);
    });

    // ========= DRAG & DROP UPLOAD ZONE =========
    const uploadZone = document.getElementById('uploadZone');

    if (uploadZone) {
        // Click to upload
        uploadZone.addEventListener('click', () => {
            fileInput.click();
        });

        // Drag and drop handlers
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            uploadZone.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                // Check if it's an Excel file
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    // Trigger the file input change event with this file
                    const dataTransfer = new DataTransfer();
                    dataTransfer.items.add(file);
                    fileInput.files = dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    showCustomDialog({
                        title: 'Formato non supportato',
                        message: 'Per favore seleziona un file Excel (.xlsx o .xls)'
                    });
                }
            }
        });
    }
    // ========= END DRAG & DROP =========

    sourceSelector.addEventListener('change', resetAndLoadSource);
    columnSelector.addEventListener('change', () => {
        parseUrlsFromSource();
        renderSourcePreview(parseInt(columnSelector.value, 10));
    });

    textUrlsInput.addEventListener('input', () => {
        fileInput.value = '';
        workbook = null;
        urls = [];
        originalSourceData = [];
        currentSourceData = [];
        excelOptionsBox.style.display = 'none';
        sheetPreviewContainer.style.display = 'none';
        const excelPreviewBtn = document.getElementById('excelPreviewButton');
        if (excelPreviewBtn) excelPreviewBtn.style.display = 'none';
        updateStartButtonState();
    });

    // Listener per Enter: avvia il processo con Ctrl+Enter
    textUrlsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.ctrlKey) {
            e.preventDefault();
            if (!startButton.disabled) {
                startButton.click();
            }
        }
    });

    const applyAndRenderFilters = () => {
        const activeFilters = {};
        const filterRows = filterRowsContainer.querySelectorAll('.filter-row');

        filterRows.forEach(row => {
            const colIndex = row.querySelector('.filter-column-select').value;
            if (colIndex) {
                const selectedValues = [];
                row.querySelectorAll('.filter-value-checkbox:checked').forEach(checkbox => {
                    selectedValues.push(checkbox.value);
                });
                if (selectedValues.length > 0) {
                    activeFilters[colIndex] = selectedValues;
                }
            }
        });

        if (Object.keys(activeFilters).length === 0) {
            currentSourceData = [...originalSourceData];
        } else {
            const header = originalSourceData[0];
            let filteredRows = originalSourceData.slice(1).filter(row => {
                return Object.entries(activeFilters).every(([colIndex, values]) => {
                    return values.includes(String(row[colIndex]));
                });
            });
            currentSourceData = [header, ...filteredRows];
        }

        renderSourcePreview(parseInt(columnSelector.value, 10));
        if (previewModal.style.display === 'block') {
            renderFullscreenPreviewTable();
        }
        parseUrlsFromSource();
    };

    const createFilterRow = (parentContainer) => {
        const row = document.createElement('div');
        row.className = 'filter-row';

        const colSelect = document.createElement('select');
        colSelect.className = 'filter-column-select';
        colSelect.innerHTML = '<option value="">-- Seleziona Colonna --</option>';
        (originalSourceData[0] || []).forEach((header, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = header || `Colonna ${index + 1}`;
            colSelect.appendChild(option);
        });

        const valuesDiv = document.createElement('div');
        valuesDiv.className = 'filter-values';
        valuesDiv.textContent = 'Seleziona una colonna per vedere i valori';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'filter-remove-btn';
        removeBtn.textContent = 'Rimuovi';
        removeBtn.onclick = () => {
            row.remove();
            applyAndRenderFilters();
        };

        colSelect.onchange = () => {
            const colIndex = parseInt(colSelect.value, 10);
            valuesDiv.innerHTML = '';
            if (isNaN(colIndex)) {
                valuesDiv.textContent = 'Seleziona una colonna';
                return;
            }

            const uniqueValues = [...new Set(originalSourceData.slice(1).map(row => row[colIndex]))]
                .filter(val => val !== null && val !== undefined && String(val).trim() !== '')
                .sort();

            uniqueValues.forEach(value => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'filter-value-checkbox';
                checkbox.value = value;
                checkbox.onchange = () => applyAndRenderFilters();

                label.appendChild(checkbox);
                label.appendChild(document.createTextNode(` ${value}`));
                valuesDiv.appendChild(label);
            });
            applyAndRenderFilters();
        };

        row.appendChild(colSelect);
        row.appendChild(valuesDiv);
        row.appendChild(removeBtn);
        parentContainer.appendChild(row);
    };

    addFilterButton.addEventListener('click', () => createFilterRow(filterRowsContainer));

    const renderFullscreenPreviewTable = () => {
        fullscreenPreviewTable.innerHTML = '';
        if (currentSourceData.length === 0) return;

        const highlightedColIndex = parseInt(columnSelector.value, 10);
        const headerData = originalSourceData[0] || [];
        const thead = fullscreenPreviewTable.createTHead();
        const tbody = fullscreenPreviewTable.createTBody();

        const headerRow = document.createElement('tr');
        headerData.forEach((cellData, colIndex) => {
            const cell = document.createElement('th');
            cell.textContent = cellData !== null && cellData !== undefined ? cellData : '';
            if (colIndex === highlightedColIndex) cell.className = 'highlighted-column';
            headerRow.appendChild(cell);
        });
        thead.appendChild(headerRow);

        currentSourceData.slice(1).forEach(rowData => {
            const row = document.createElement('tr');
            rowData.forEach((cellData, colIndex) => {
                const cell = document.createElement('td');
                cell.textContent = cellData !== null && cellData !== undefined ? cellData : '';
                if (colIndex === highlightedColIndex) cell.className = 'highlighted-column';
                row.appendChild(cell);
            });
            tbody.appendChild(row);
        });
    }

    const openFullscreenPreview = () => {
        // Popola i selettori nella modale
        const modalSourceSelector = document.getElementById('modalSourceSelector');
        const modalColumnSelector = document.getElementById('modalColumnSelector');

        if (modalSourceSelector && modalColumnSelector) {
            // Copia le opzioni dal sourceSelector principale
            modalSourceSelector.innerHTML = sourceSelector.innerHTML;
            modalSourceSelector.value = sourceSelector.value;

            // Copia le opzioni dal columnSelector principale
            modalColumnSelector.innerHTML = columnSelector.innerHTML;
            modalColumnSelector.value = columnSelector.value;

            // Aggiungi listener per sincronizzare le modifiche
            modalSourceSelector.addEventListener('change', () => {
                sourceSelector.value = modalSourceSelector.value;
                sourceSelector.dispatchEvent(new Event('change'));
                // Aggiorna anche il columnSelector nella modale
                setTimeout(() => {
                    modalColumnSelector.innerHTML = columnSelector.innerHTML;
                    modalColumnSelector.value = columnSelector.value;
                    renderFullscreenPreviewTable();
                }, 100);
            });

            modalColumnSelector.addEventListener('change', () => {
                columnSelector.value = modalColumnSelector.value;
                columnSelector.dispatchEvent(new Event('change'));
                renderFullscreenPreviewTable();
            });
        }

        renderFullscreenPreviewTable();
        previewModal.style.display = 'flex'; // Usa flex per centrare
    };

    const closeFullscreenPreview = () => {
        previewModal.style.display = 'none';
        applyAndRenderFilters();
    };

    fullscreenPreviewButton.addEventListener('click', openFullscreenPreview);
    closePreviewModalButton.addEventListener('click', closeFullscreenPreview);
    previewModal.addEventListener('click', (e) => { if (e.target === previewModal) closeFullscreenPreview(); });

    const openModal = (index) => {
        populatePresetsDropdown();
        updateModalContent(index);
        modal.style.display = 'flex';
        document.addEventListener('keydown', handleKeyDown);
    };

    const closeModal = () => {
        if (modal.style.display === 'flex') {
            modal.style.display = 'none';
            document.removeEventListener('keydown', handleKeyDown);

            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            isGlobalCropActive = false;
            cropButton.style.display = 'inline-flex';
            globalCropButton.style.display = 'inline-flex';
            saveCropButton.style.display = 'none';
            saveCropButton.classList.remove('save-global');
            undoCropButton.style.display = 'none'; // NUOVO: Nasconde il pulsante Annulla alla chiusura
            saveAsPresetButton.style.display = 'none';
            cropPresetSelector.value = "";
        }
    };

    const deleteScreenshot = (index) => {
        const item = currentScreenshots[index];
        const message = item.isGroup
            ? `Sei sicuro di voler eliminare questo gruppo di ${item.items.length} immagini?`
            : `Sei sicuro di voler eliminare lo screenshot "${item.filename}"?`;

        showCustomDialog({
            type: 'confirm',
            title: 'Elimina Screenshot',
            message: message
        }).then(confirmed => {
            if (confirmed) {
                currentScreenshots.splice(index, 1);
                chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
                if (modal.style.display === 'flex' && currentModalIndex === index) {
                    closeModal();
                }
            }
        });
    };

    const initCropper = () => {
        if (cropper) { cropper.destroy(); }
        cropper = new CropCanvas(modalImg, { aspectRatio: null, minWidth: 50, minHeight: 50 });
        cropButton.style.display = 'none';
        globalCropButton.style.display = 'none';
        saveCropButton.style.display = 'inline-flex';
        saveAsPresetButton.style.display = 'inline-flex';
    };

    const initGlobalCropper = () => {
        isGlobalCropActive = true;
        initCropper();
        saveCropButton.classList.add('save-global');
    };

    const getDomainFromFilename = (filename) => {
        if (!filename) return null;
        const match = filename.match(/screenshot-([a-z0-9.-]+)-\d+/);
        return match ? match[1] : null;
    };

    async function applyCropToImage(dataUrl, relativeRect) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                const cropX = img.naturalWidth * relativeRect.x;
                const cropY = img.naturalHeight * relativeRect.y;
                const cropWidth = img.naturalWidth * relativeRect.width;
                const cropHeight = img.naturalHeight * relativeRect.height;

                canvas.width = cropWidth;
                canvas.height = cropHeight;

                ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    const saveCrop = async () => {
        if (!cropper) return;

        if (isGlobalCropActive) {
            statusDiv.textContent = 'Applicando ritaglio globale...';
            const sourceScreenshot = currentScreenshots[currentModalIndex];
            const sourceDomain = getDomainFromFilename(sourceScreenshot.filename);
            const sourceCategory = sourceScreenshot.category;

            const relativeCropRect = {
                x: cropper.cropArea.x / cropper.canvas.width,
                y: cropper.cropArea.y / cropper.canvas.height,
                width: cropper.cropArea.width / cropper.canvas.width,
                height: cropper.cropArea.height / cropper.canvas.height
            };

            const cropLogEntry = {
                data: Date.now(),
                dominio: sourceDomain,
                sottocategoria: sourceCategory || null,
                nomePreset: cropPresetSelector.value || null,
                rect: relativeCropRect
            };
            logCropAction(cropLogEntry);
            renderCropLog();

            let applyCount = 0;

            // --- NUOVA LOGICA: Salva lo stato delle immagini prima di modificarle ---
            lastGlobalCropUndoData = []; // Pulisce i dati di annullamento precedenti
            currentScreenshots.forEach((shot, index) => {
                const shotDomain = getDomainFromFilename(shot.filename);
                let match = false;
                if (activeFilter === 'all') { match = true; }
                else if (activeFilter === 'meta' && activeCategoryFilter === 'all') {
                    const filename = shot.filename || '';
                    const isInstagram = filename.includes('instagram.com');
                    const isMetaCore = filename.includes('facebook.com') || filename.includes('meta.com') || filename.includes('fb.me');
                    match = isInstagram || isMetaCore;
                } else {
                    if (sourceCategory) { match = (shot.category === sourceCategory); }
                    else { match = (shotDomain === sourceDomain); }
                }
                if (match && !shot.isGroup) {
                    lastGlobalCropUndoData.push({ index: index, previousUrl: shot.url });
                }
            });
            // --- FINE NUOVA LOGICA ---

            const promises = currentScreenshots.map(async (shot, index) => {
                // La logica di "match" viene rieseguita qui, ma va bene perché è veloce e garantisce coerenza.
                let match = false;
                const shotDomain = getDomainFromFilename(shot.filename);

                if (activeFilter === 'all') {
                    // Se il filtro è "Tutti", il ritaglio si applica a tutte le immagini.
                    match = true;
                } else if (activeFilter === 'meta' && activeCategoryFilter === 'all') {
                    // Caso speciale: se il filtro è "Meta" e "Tutte le Categorie", applica a tutto il gruppo Meta.
                    const filename = shot.filename || '';
                    const isInstagram = filename.includes('instagram.com');
                    const isMetaCore = filename.includes('facebook.com') || filename.includes('meta.com') || filename.includes('fb.me');
                    match = isInstagram || isMetaCore;
                } else {
                    // --- Logica di abbinamento generale (funziona per "Pinterest", "Altro", e sottocategorie Meta) ---
                    if (sourceCategory) {
                        // Se l'immagine sorgente ha una categoria specifica (es. "Instagram Reels"), abbina per categoria.
                        match = (shot.category === sourceCategory);
                    } else {
                        // Altrimenti (es. Pinterest, siti generici), abbina per dominio.
                        match = (shotDomain === sourceDomain);
                    }
                }

                if (match && !shot.isGroup) {
                    try {
                        const newUrl = await applyCropToImage(shot.url, relativeCropRect);
                        currentScreenshots[index].url = newUrl;
                        applyCount++;
                    } catch (error) {
                        console.error(`Errore nell'applicare il ritaglio globale all'immagine ${index}:`, error);
                    }
                }
            });

            await Promise.all(promises);

            let statusMessage;
            if (activeFilter === 'all') {
                statusMessage = `Ritaglio globale applicato a ${applyCount} immagini.`;
            } else if (activeFilter === 'meta' && activeCategoryFilter === 'all') {
                statusMessage = `Ritaglio globale applicato a ${applyCount} immagini della macrocategoria "Meta".`;
            } else if (sourceCategory) {
                statusMessage = `Ritaglio globale applicato a ${applyCount} immagini della categoria "${sourceCategory}".`;
            } else {
                statusMessage = `Ritaglio globale applicato a ${applyCount} immagini dal sito "${sourceDomain}".`;
            }
            statusDiv.textContent = statusMessage;

            // --- NUOVO: Mostra il pulsante di annullamento globale se sono state modificate immagini ---
            if (lastGlobalCropUndoData.length > 0) {
                undoGlobalCropButton.style.display = 'inline-block';
            } else {
                undoGlobalCropButton.style.display = 'none';
            }
            // --- FINE ---

        } else {
            const croppedCanvas = cropper.getCroppedCanvas();
            if (croppedCanvas) {
                const screenshot = currentScreenshots[currentModalIndex];

                // --- NUOVA LOGICA DI UNDO: SALVATAGGIO STATO PRECEDENTE ---
                if (!screenshot.undoHistory) {
                    screenshot.undoHistory = [];
                }
                screenshot.undoHistory.push(screenshot.url); // Salva l'URL corrente prima di sovrascriverlo
                // --- FINE NUOVA LOGICA ---

                if (!screenshot.originalDimensions) {
                    screenshot.originalDimensions = `${modalImg.naturalWidth}x${modalImg.naturalHeight}`;
                }
                screenshot.croppedDimensions = `${croppedCanvas.width}x${croppedCanvas.height}`;
                screenshot.url = croppedCanvas.toDataURL('image/png');
            }
        }

        chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
        closeModal();
    };

    // --- INIZIO NUOVA SEZIONE: GESTIONE PRESET DI RITAGLIO ---

    const PRESETS_STORAGE_KEY = 'cropPresets';

    const populatePresetsDropdown = () => {
        const presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
        cropPresetSelector.innerHTML = '<option value="">-- Applica Preset --</option>';
        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.name;
            option.textContent = preset.name;
            cropPresetSelector.appendChild(option);
        });
    };

    const saveCurrentCropAsPreset = () => {
        if (!cropper) {
            showCustomDialog({
                title: 'Nessuna area',
                message: "Definisci prima un'area di ritaglio!"
            });
            return;
        }

        showCustomDialog({
            type: 'prompt',
            title: 'Salva Preset',
            message: "Inserisci un nome per questo preset di ritaglio:",
            defaultValue: ""
        }).then(async presetName => {
            if (!presetName || presetName.trim() === "") {
                return;
            }

            const originalImageUrl = modalImg.src; // Cattura l'URL dell'immagine che si sta ritagliando

            const relativeCropRect = {
                x: cropper.cropArea.x / cropper.canvas.width,
                y: cropper.cropArea.y / cropper.canvas.height,
                width: cropper.cropArea.width / cropper.canvas.width,
                height: cropper.cropArea.height / cropper.canvas.height
            };

            let presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];

            const existingIndex = presets.findIndex(p => p.name === presetName);
            if (existingIndex > -1) {
                const overwrite = await showCustomDialog({
                    type: 'confirm',
                    title: 'Sovrascrivi Preset',
                    message: `Un preset chiamato "${presetName}" esiste già. Vuoi sovrascriverlo?`
                });
                if (!overwrite) return;
                presets[existingIndex].rect = relativeCropRect;
                presets[existingIndex].imageUrl = originalImageUrl; // Aggiorna anche l'immagine quando sovrascrivi
            } else {
                presets.push({ name: presetName, rect: relativeCropRect, imageUrl: originalImageUrl });
            }

            localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
            showCustomDialog({
                title: 'Preset Salvato',
                message: `Preset "${presetName}" salvato!`
            });
            populatePresetsDropdown();
            cropPresetSelector.value = presetName;
        });
    };

    const applySelectedPreset = async () => {
        const presetName = cropPresetSelector.value;

        // Gestisce la visibilità del pulsante di eliminazione
        if (presetName) {
            deletePresetButton.style.display = 'inline-flex';
        } else {
            deletePresetButton.style.display = 'none';
        }

        if (!presetName) return;

        const presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
        const preset = presets.find(p => p.name === presetName);

        if (!preset) {
            cropPresetSelector.value = ""; // Resetta se il preset non viene trovato
            return;
        }

        const confirmed = await showCustomDialog({
            type: 'confirm',
            title: 'Applica Preset',
            message: `Sei sicuro di voler applicare il preset '${presetName}' a tutte le immagini corrispondenti (per sito o per categoria)? L'operazione è irreversibile.`
        });

        if (!confirmed) {
            cropPresetSelector.value = ""; // Resetta il dropdown se l'utente annulla
            deletePresetButton.style.display = 'none';
            return;
        }

        statusDiv.textContent = `Applicando il preset globale '${presetName}'...`;

        const sourceScreenshot = currentScreenshots[currentModalIndex];
        const sourceDomain = getDomainFromFilename(sourceScreenshot.filename);
        const sourceCategory = sourceScreenshot.category;

        const relativeCropRect = preset.rect; // Usa le coordinate relative direttamente dal preset

        const cropLogEntry = {
            data: Date.now(),
            dominio: sourceDomain,
            sottocategoria: sourceCategory || null,
            nomePreset: presetName,
            rect: relativeCropRect
        };
        logCropAction(cropLogEntry);
        renderCropLog();

        let applyCount = 0;
        const promises = currentScreenshots.map(async (shot, index) => {
            let match = false;
            const shotDomain = getDomainFromFilename(shot.filename);

            if (activeFilter === 'all') {
                // Se il filtro è "Tutti", il preset si applica a tutte le immagini.
                match = true;
            } else if (activeFilter === 'meta' && activeCategoryFilter === 'all') {
                // Caso speciale: se il filtro è "Meta" e "Tutte le Categorie", applica a tutto il gruppo Meta.
                const filename = shot.filename || '';
                const isInstagram = filename.includes('instagram.com');
                const isMetaCore = filename.includes('facebook.com') || filename.includes('meta.com') || filename.includes('fb.me');
                match = isInstagram || isMetaCore;
            } else {
                // --- Logica di abbinamento generale (funziona per "Pinterest", "Altro", e sottocategorie Meta) ---
                if (sourceCategory) {
                    // Se l'immagine sorgente ha una categoria specifica (es. "Instagram Reels"), abbina per categoria.
                    match = (shot.category === sourceCategory);
                } else {
                    // Altrimenti (es. Pinterest, siti generici), abbina per dominio.
                    match = (shotDomain === sourceDomain);
                }
            }

            if (match && !shot.isGroup) {
                try {
                    const newUrl = await applyCropToImage(shot.url, relativeCropRect);
                    currentScreenshots[index].url = newUrl;
                    applyCount++;
                } catch (error) {
                    console.error(`Errore nell'applicare il preset globale all'immagine ${index}:`, error);
                }
            }
        });

        await Promise.all(promises);

        let statusMessage;
        if (activeFilter === 'all') {
            statusMessage = `Preset '${presetName}' applicato a ${applyCount} immagini.`;
        } else if (activeFilter === 'meta' && activeCategoryFilter === 'all') {
            statusMessage = `Preset '${presetName}' applicato a ${applyCount} immagini della macrocategoria "Meta".`;
        } else if (sourceCategory) {
            statusMessage = `Preset '${presetName}' applicato a ${applyCount} immagini della categoria "${sourceCategory}".`;
        } else {
            statusMessage = `Preset '${presetName}' applicato a ${applyCount} immagini dal sito "${sourceDomain}".`;
        }
        statusDiv.textContent = statusMessage;

        chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
        closeModal();
    };

    const deleteSelectedPreset = () => {
        const presetName = cropPresetSelector.value;
        if (!presetName) {
            showCustomDialog({
                title: 'Nessun preset',
                message: "Seleziona un preset da eliminare."
            });
            return;
        }

        showCustomDialog({
            type: 'confirm',
            title: 'Elimina Preset',
            message: `Sei sicuro di voler eliminare il preset "${presetName}"?`
        }).then(confirmed => {
            if (confirmed) {
                let presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
                presets = presets.filter(p => p.name !== presetName);
                localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
                populatePresetsDropdown();
                showCustomDialog({
                    title: 'Preset Eliminato',
                    message: `Preset "${presetName}" eliminato.`
                });
            }
        });
    };

    const exportPresets = () => {
        try {
            const presets = localStorage.getItem(PRESETS_STORAGE_KEY);
            if (!presets || presets === '[]') {
                showCustomDialog({
                    title: 'Nessun preset',
                    message: "Nessun preset da esportare."
                });
                return;
            }

            const blob = new Blob([presets], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'havas-social-competitive-presets.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            statusDiv.textContent = "Preset esportati con successo.";
        } catch (error) {
            console.error("Errore durante l'esportazione dei preset:", error);
            showCustomDialog({
                title: 'Errore Esportazione',
                message: "Si è verificato un errore durante l'esportazione dei preset."
            });
        }
    };

    const importPresets = (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedPresets = JSON.parse(e.target.result);

                // Validazione del file importato
                if (!Array.isArray(importedPresets) || !importedPresets.every(p => p.name && p.rect && typeof p.rect.x === 'number' && typeof p.rect.y === 'number' && typeof p.rect.width === 'number' && typeof p.rect.height === 'number')) {
                    throw new Error("Il file non contiene preset validi o ha un formato errato.");
                }

                showCustomDialog({
                    type: 'confirm',
                    title: 'Importa Preset',
                    message: `Trovati ${importedPresets.length} preset. Vuoi SOVRASCRIVERE tutti i preset attuali con quelli importati? L'operazione non è reversibile.`
                }).then(confirmed => {
                    if (confirmed) {
                        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(importedPresets));
                        populatePresetsDropdown();
                        showCustomDialog({
                            title: 'Importazione completata',
                            message: "Preset importati con successo!"
                        });
                        statusDiv.textContent = `${importedPresets.length} preset importati correttamente.`;
                    }
                });
            } catch (error) {
                console.error("Errore durante l'importazione dei preset:", error);
                showCustomDialog({
                    title: 'Errore Importazione',
                    message: `Errore nell'importazione: ${error.message}`
                });
            } finally {
                // Resetta l'input per permettere di ricaricare lo stesso file
                importPresetsInput.value = '';
            }
        };
        reader.readAsText(file);
    };

    // --- INIZIO NUOVA FUNZIONE: GESTIONE IMPORTAZIONE IMMAGINI (CORRETTA) ---
    const handleImageImport = async (event) => {
        const fileList = event.target.files;
        if (!fileList.length) {
            return;
        }

        // NUOVO: Chiedi il nome del brand per le immagini importate
        const brandNameInput = await showCustomDialog({
            type: 'prompt',
            title: 'Importa Immagini',
            message: 'Stai importando delle immagini.\n\nInserisci il nome del raggruppamento (o lascia vuoto):',
            defaultValue: ''
        });

        // Se l'utente preme Annulla, esci
        if (brandNameInput === null) {
            importImagesInput.value = '';
            return;
        }

        const assignedBrandName = brandNameInput.trim() || null;

        statusDiv.textContent = `Importazione di ${fileList.length} immagini in corso...`;

        try {
            // 1. Legge i file selezionati
            const fileReadPromises = Array.from(fileList).map(file => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve({
                        dataUrl: reader.result,
                        // Pulizia nome file per evitare caratteri strani
                        name: file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
                    });
                    reader.onerror = (error) => reject(error);
                    reader.readAsDataURL(file);
                });
            });

            const importedFiles = await Promise.all(fileReadPromises);

            // 2. Crea gli oggetti screenshot CON il brandName assegnato
            const newScreenshots = importedFiles.map(imported => ({
                url: imported.dataUrl,
                filename: `imported-${imported.name}`, // Nome file univoco
                isGroup: false,
                category: 'Imported', // Categoria per eventuali filtri
                source: 'imported',
                brandName: assignedBrandName // NUOVO: Assegna il brand
            }));

            // 3. Recupera gli screenshot attuali tramite messaggio al background
            chrome.runtime.sendMessage({ action: 'getScreenshots' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Errore recupero screenshot:", chrome.runtime.lastError);
                    return;
                }

                const existingScreenshots = response.screenshots || [];
                const updatedScreenshots = existingScreenshots.concat(newScreenshots);

                // 4. Invia la lista aggiornata al background per il salvataggio
                chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: updatedScreenshots }, () => {
                    // FIX: Uso newScreenshots.length perché fileList viene svuotato dal blocco finally prima che questa callback venga eseguita
                    statusDiv.textContent = `${newScreenshots.length} immagini importate con successo!`;
                    // 5. Aggiorna la vista
                    refreshScreenshotsView();
                });
            });

        } catch (error) {
            console.error("Errore durante l'importazione delle immagini:", error);
            statusDiv.textContent = 'Si è verificato un errore durante l\'importazione.';
            statusDiv.style.color = 'red';
        } finally {
            // Resetta il valore dell'input per permettere di importare di nuovo gli stessi file
            importImagesInput.value = '';
        }
    };
    // --- FINE NUOVA FUNZIONE ---

    // --- FINE SEZIONE PRESET ---


    // --- INIZIO NUOVA SEZIONE: GESTIONE LOG AZIONI DI RITAGLIO ---

    const CROP_LOG_STORAGE_KEY = 'cropLogHistory';
    const MAX_LOG_ENTRIES = 100;

    function logCropAction(cropAction) {
        try {
            let log = JSON.parse(localStorage.getItem(CROP_LOG_STORAGE_KEY)) || [];
            log.unshift(cropAction);
            if (log.length > MAX_LOG_ENTRIES) {
                log = log.slice(0, MAX_LOG_ENTRIES);
            }
            localStorage.setItem(CROP_LOG_STORAGE_KEY, JSON.stringify(log));
        } catch (error) {
            console.error("Errore durante il salvattagio del log di ritaglio:", error);
        }
    }

    function renderCropLog() {
        const container = document.getElementById('crop-log-container');
        const log = JSON.parse(localStorage.getItem(CROP_LOG_STORAGE_KEY)) || [];

        if (log.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #888;">Nessuna azione di ritaglio globale registrata.</p>';
            return;
        }

        let html = '';
        log.forEach(entry => {
            const timestamp = new Date(entry.data).toLocaleString('it-IT');
            const rectString = `x:${entry.rect.x.toFixed(2)}, y:${entry.rect.y.toFixed(2)}, w:${entry.rect.width.toFixed(2)}, h:${entry.rect.height.toFixed(2)}`;

            html += `
                <div class="log-entry">
                    <div class="log-header">
                        <span>${entry.nomePreset || 'Ritaglio Manuale Globale'}</span>
                        <span style="color: #888; font-weight: normal;">${timestamp}</span>
                    </div>
                    <div class="log-details">
                        <span class="label">Target:</span> 
                        ${entry.dominio} 
                        ${entry.sottocategoria ? `> ${entry.sottocategoria}` : ''}
                    </div>
                    <div class="log-details">
                        <span class="label">Rect:</span> ${rectString}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // --- FINE NUOVA SEZIONE ---

    // --- NUOVA FUNZIONE: Annulla l'ultimo ritaglio sull'immagine corrente ---
    const undoLastCrop = () => {
        if (currentModalIndex === -1) return;

        const screenshot = currentScreenshots[currentModalIndex];
        if (screenshot && screenshot.undoHistory && screenshot.undoHistory.length > 0) {
            const previousUrl = screenshot.undoHistory.pop(); // Estrae l'ultimo stato salvato
            screenshot.url = previousUrl;

            // Aggiorna la sessione e l'interfaccia
            chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, () => {
                refreshScreenshotsView(); // Ricarica la griglia delle miniature
                updateModalContent(currentModalIndex); // Ricarica l'immagine nel modale
            });
        }
    };
    // --- FINE NUOVA FUNZIONE ---

    closeModalButton.addEventListener('click', closeModal);
    cropButton.addEventListener('click', initCropper);
    globalCropButton.addEventListener('click', initGlobalCropper);
    saveCropButton.addEventListener('click', saveCrop);
    undoCropButton.addEventListener('click', undoLastCrop); // NUOVO: Collega la funzione al pulsante
    deleteModalButton.addEventListener('click', () => deleteScreenshot(currentModalIndex));

    // --- NUOVA FUNZIONE E LISTENER PER ANNULLARE IL RITAGLIO GLOBALE ---
    const undoGlobalCrop = () => {
        if (lastGlobalCropUndoData.length === 0) {
            showCustomDialog({
                title: 'Nessuna operazione',
                message: "Nessuna operazione di ritaglio globale da annullare."
            });
            return;
        }

        showCustomDialog({
            type: 'confirm',
            title: 'Annulla Ritaglio Globale',
            message: `Sei sicuro di voler annullare l'ultimo ritaglio globale su ${lastGlobalCropUndoData.length} immagini?`
        }).then(confirmed => {
            if (!confirmed) return;

            lastGlobalCropUndoData.forEach(undoInfo => {
                const { index, previousUrl } = undoInfo;
                if (currentScreenshots[index]) {
                    currentScreenshots[index].url = previousUrl;
                }
            });

            // Pulisci i dati di annullamento per evitare doppi utilizzi
            lastGlobalCropUndoData = [];
            undoGlobalCropButton.style.display = 'none';

            // Aggiorna la sessione e l'interfaccia
            chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
            statusDiv.textContent = "Ritaglio globale annullato con successo.";
        });
    };

    undoGlobalCropButton.addEventListener('click', undoGlobalCrop);
    // --- FINE NUOVA SEZIONE ---
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    prevModalButton.addEventListener('click', navigateToPrev);
    nextModalButton.addEventListener('click', navigateToNext);
    // Collega eventi per la gestione dei preset
    saveAsPresetButton.addEventListener('click', saveCurrentCropAsPreset);
    cropPresetSelector.addEventListener('change', applySelectedPreset);
    deletePresetButton.addEventListener('click', deleteSelectedPreset);

    groupButton.addEventListener('click', () => {
        if (selectedIndices.length < 2) return;
        selectedIndices.sort((a, b) => a - b);
        const itemsToGroup = selectedIndices.map(index => currentScreenshots[index]);
        const newGroup = { isGroup: true, items: itemsToGroup, filename: `comparison-${Date.now()}.png` };
        const newScreenshots = currentScreenshots.filter((_, index) => !selectedIndices.includes(index));
        let insertPos = selectedIndices[0];
        selectedIndices.forEach(idx => { if (idx < selectedIndices[0]) insertPos--; });
        newScreenshots.splice(insertPos, 0, newGroup);
        currentScreenshots = newScreenshots;
        chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
    });

    // NUOVO: Event listener per il pulsante "Crea Raggruppamento" (assegna brand comune)
    assignBrandButton.addEventListener('click', () => {
        if (selectedIndices.length < 2) return;

        showCustomDialog({
            type: 'prompt',
            title: 'Assegna Brand',
            message: `Hai selezionato ${selectedIndices.length} screenshot.\n\nInserisci il nome del Brand per raggrupparli:`,
            defaultValue: ''
        }).then(brandName => {
            if (brandName === null) return; // Utente ha premuto Annulla

            const assignedBrand = brandName.trim() || null;

            // Assegna il brand a tutti gli screenshot selezionati
            selectedIndices.forEach(index => {
                if (currentScreenshots[index]) {
                    currentScreenshots[index].brandName = assignedBrand;
                }
            });

            // Aggiorna e salva
            chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, () => {
                const message = assignedBrand
                    ? `${selectedIndices.length} screenshot assegnati al brand "${assignedBrand}"`
                    : `${selectedIndices.length} screenshot rimossi dal brand`;
                statusDiv.textContent = message;
                refreshScreenshotsView();
            });
        });
    });

    const ungroupScreenshots = (index) => {
        const group = currentScreenshots[index];
        if (!group.isGroup) return;
        currentScreenshots.splice(index, 1, ...group.items);
        chrome.runtime.sendMessage({ action: 'updateScreenshots', screenshots: currentScreenshots }, refreshScreenshotsView);
    };



    startButton.addEventListener('click', async () => {
        const executionMode = document.querySelector('input[name="executionMode"]:checked').value;

        // === MODALITÀ META LIBRARY ===
        if (executionMode === 'meta_library') {
            const keywordsText = textUrlsInput.value.trim();
            const country = document.getElementById('metaCountry').value;
            const status = document.getElementById('metaStatus').value;
            const mediaType = document.getElementById('metaMediaType').value;

            if (!keywordsText) {
                statusDiv.textContent = "⚠️ Inserisci una o più parole chiave (una per riga).";
                return;
            }

            // Dividi le keyword per riga, virgola o punto e virgola, e filtra le righe vuote
            const keywords = keywordsText
                .split(/[\n,;]+/)  // Split per newline, virgola o punto e virgola
                .map(k => k.trim())
                .filter(k => k.length > 0);

            if (keywords.length === 0) {
                statusDiv.textContent = "⚠️ Inserisci almeno una parola chiave valida.";
                return;
            }

            console.log(`[Meta Library] Processando ${keywords.length} keyword:`, keywords);

            // Genera un URL per ogni keyword
            const targetUrls = keywords.map(keyword => {
                const url = window.MetaLibraryHandler.generateUrl(keyword, metaStartDate, metaEndDate, country, status, mediaType);
                console.log(`[Meta Library] URL generato per "${keyword}":`, url);
                return url;
            });

            statusDiv.textContent = `Generazione di ${targetUrls.length} ricerche Meta e avvio scraping...`;

            // Calcola stringa periodo
            const periodString = `Dal ${metaStartDate || 'Inizio'} al ${metaEndDate || 'Oggi'}`;

            // AVVIA IL PROCESSO STANDARD usando gli URL generati
            const options = {
                directLinksMode: false, // Disabilitiamo il direct mode per permettere lo scraping
                isMetaAds: true, // NUOVO: Flag specifico per Meta
                maxAds: metaMaxAdsCount,
                screenshotDelay: 2,
                metaPeriod: periodString, // Passiamo il periodo selezionato
                targetCountry: country // NUOVO: Passiamo il paese
            };

            chrome.runtime.sendMessage({ action: 'startProcessing', urls: targetUrls, options: options });
            startButton.disabled = true;
            return;
        }
        // === MODALITÀ GOOGLE ADS ===
        if (executionMode === 'google_ads') {
            const domainsText = textUrlsInput.value.trim();
            const region = document.getElementById('googleRegion').value;
            const platform = document.getElementById('googlePlatform').value;
            const format = document.getElementById('googleFormat').value;

            if (!domainsText) {
                statusDiv.textContent = "⚠️ Inserisci almeno un dominio valido.";
                return;
            }

            const domains = domainsText.split(/[\n,;]+/).map(d => d.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')).filter(d => d.length > 0);

            if (domains.length === 0) {
                statusDiv.textContent = "⚠️ Nessun dominio rilevato.";
                return;
            }

            console.log(`[Google Ads] Processando ${domains.length} domini:`, domains);

            // Costruisci l'URL con i nuovi parametri
            const targetUrls = domains.map(domain => {
                let url = `https://adstransparency.google.com/?region=${region}&domain=${encodeURIComponent(domain)}`;

                // Aggiungi piattaforma se specificata
                if (platform && platform !== 'all') {
                    url += `&platform=${platform}`;
                }

                // Aggiungi date se specificate (Corretto con il trattino normale al posto del trattino basso)
                if (googleStartDate) {
                    url += `&start-date=${encodeURIComponent(googleStartDate)}`;
                }
                if (googleEndDate) {
                    url += `&end-date=${encodeURIComponent(googleEndDate)}`;
                }

                return url;
            });

            statusDiv.textContent = `Generazione di ${targetUrls.length} ricerche Google e avvio scraping...`;

            // googleMaxAdsCount è definita globalmente nel listener del chip
            const currentGoogleMax = typeof googleMaxAdsCount !== 'undefined' ? googleMaxAdsCount : 30;

            // Costruisci stringa periodo per salvare nei metadati (come Meta)
            let periodString = "";
            if (googleStartDate && googleEndDate) {
                periodString = `${googleStartDate} - ${googleEndDate}`;
            } else if (googleStartDate) {
                periodString = `Dal ${googleStartDate}`;
            } else if (googleEndDate) {
                periodString = `Fino al ${googleEndDate}`;
            }

            // USA LA STESSA LOGICA DELLA MODALITÀ DESK (NON directLinksMode)
            const options = {
                removePopups: removePopupsCheckbox.checked,
                enableZoom: enableZoomCheckbox.checked,
                initialDelay: parseInt(initialDelayInput.value, 10) || 2000,
                screenshotDelay: parseInt(screenshotDelayInput.value, 10) * 1000 || 2000,
                carouselSwipeDelay: parseFloat(carouselSwipeDelayInput.value) * 1000 || 1000,
                captureCarousel: false, // Google Ads non ha caroselli
                maxCarouselSlides: 1,
                directLinksMode: false, // NON usare directLinksMode
                numInstagramPosts: 0,
                // Parametri specifici per Google Ads
                isGoogleAds: true, // Flag per identificare la modalità Google Ads
                maxAds: currentGoogleMax,
                googlePlatform: platform,
                googleFormat: format,
                googlePeriod: periodString, // Salva il periodo come Meta
                googleStartDate: googleStartDate,
                googleEndDate: googleEndDate,
                targetCountry: region // NUOVO: Passiamo il paese
            };

            chrome.runtime.sendMessage({ action: 'startProcessing', urls: targetUrls, options: options });
            startButton.disabled = true;
            return;
        }


        // === MODALITÀ NORMALI (direct/desk): comportamento originale ===
        let urlsToProcess = [];
        const textContent = textUrlsInput.value.trim();
        if (textContent) {
            urlsToProcess = textContent.split(/[\n\s,]+/).filter(line => line.startsWith('http'));
        } else if (workbook && urls.length > 0) {
            urlsToProcess = urls;
        }
        if (urlsToProcess.length > 0) {
            const options = {
                removePopups: removePopupsCheckbox.checked,
                enableZoom: enableZoomCheckbox.checked,
                initialDelay: parseInt(initialDelayInput.value, 10) || 2000,
                screenshotDelay: parseInt(screenshotDelayInput.value, 10) * 1000 || 2000,
                carouselSwipeDelay: parseFloat(carouselSwipeDelayInput.value) * 1000 || 1000,
                captureCarousel: captureCarouselCheckbox.checked,
                maxCarouselSlides: parseInt(maxCarouselSlidesInput.value, 10) || 5,
                // Imposta directLinksMode quando la modalità è "direct"
                directLinksMode: executionMode === 'direct',
                // La logica per numInstagramPosts dipende dalla modalità scelta
                numInstagramPosts: executionMode === 'desk'
                    ? parseInt(document.getElementById('numInstagramPosts').value, 10) || 0
                    : 0, // Forza a 0 se non siamo in modalità Desk
                socialStartDate: executionMode === 'desk' ? socialStartDate : "",
                socialEndDate: executionMode === 'desk' ? socialEndDate : ""
            };
            chrome.runtime.sendMessage({ action: 'startProcessing', urls: urlsToProcess, options: options });
            startButton.disabled = true;
            fileInput.disabled = true;
            textUrlsInput.disabled = true;
            clearButton.disabled = true;
        } else {
            statusDiv.textContent = 'Nessun URL da processare. Carica un file o incolla dei link.';
        }
    });

    clearButton.addEventListener('click', () => {
        showCustomDialog({
            type: 'confirm',
            title: 'Svuota Sessione',
            message: 'Sei sicuro di voler cancellare tutti gli screenshot catturati?'
        }).then(confirmed => {
            if (confirmed) {
                // --- NUOVO: Pulisce i dati di annullamento globale e nasconde il pulsante ---
                lastGlobalCropUndoData = [];
                undoGlobalCropButton.style.display = 'none';
                // --- FINE ---

                // Pulisce anche i dati Excel
                fileInput.value = '';
                workbook = null;
                urls = [];
                originalSourceData = [];
                currentSourceData = [];
                excelOptionsBox.style.display = 'none';
                sheetPreviewContainer.style.display = 'none';
                const excelPreviewBtn = document.getElementById('excelPreviewButton');
                if (excelPreviewBtn) excelPreviewBtn.style.display = 'none';

                chrome.runtime.sendMessage({ action: 'clearScreenshots' }, () => {
                    refreshScreenshotsView();
                    statusDiv.textContent = 'Sessione pulita.';
                });
            }
        });
    });

    downloadAllButton.addEventListener('click', async () => { if (currentScreenshots.length === 0) return; statusDiv.textContent = 'Creazione del file ZIP...'; const zip = new JSZip(); currentScreenshots.forEach(shot => { const base64Data = shot.url.split(',')[1]; zip.file(shot.filename, base64Data, { base64: true }); }); const content = await zip.generateAsync({ type: 'blob' }); const downloadUrl = URL.createObjectURL(content); chrome.downloads.download({ url: downloadUrl, filename: 'screenshots.zip', saveAs: true }).then(() => { URL.revokeObjectURL(downloadUrl); statusDiv.textContent = 'File ZIP scaricato!'; }); });

    // --- LOGICA ESPORTAZIONE EXCEL CON IMMAGINI (EXCELJS) ---
    if (exportExcelButton) {
        exportExcelButton.addEventListener('click', async () => {
            if (currentScreenshots.length === 0) return;

            statusDiv.textContent = 'Generazione Excel e File Testo...';

            // =========================================================
            // GENERAZIONE FILE DI TESTO SEPARATO PER DETTAGLI (META O GOOGLE)
            // =========================================================
            const firstElement = currentScreenshots[0] || {};
            const isGoogleAds = firstElement.category === 'Google Ads Library';
            const platformName = isGoogleAds ? "GOOGLE ADS" : "META ADS";
            const filePrefix = isGoogleAds ? "GoogleAds" : "MetaAds";

            let detailsText = `REPORT DETTAGLI ${platformName}\nGenerato il: ` + new Date().toLocaleString('it-IT') + "\n\n";
            let hasDetails = false;

            currentScreenshots.forEach((item, index) => {
                // Prende i dettagli estratti sia da Meta che da Google
                const textContent = item.metaDetails || (item.adDetails ? item.adDetails.rawDetailText : '');

                if (textContent && textContent.trim() !== '') {
                    hasDetails = true;
                    detailsText += "========================================================\n";
                    detailsText += "ANNUNCIO N° " + (index + 1) + "\n";
                    detailsText += "BRAND: " + (item.brandName || 'Sconosciuto') + "\n";
                    detailsText += "========================================================\n";
                    detailsText += textContent.trim() + "\n\n\n";
                }
            });

            if (hasDetails) {
                const textBlob = new Blob([detailsText], { type: 'text/plain;charset=utf-8' });
                const textUrl = URL.createObjectURL(textBlob);
                chrome.downloads.download({
                    url: textUrl,
                    filename: `Testi_Completi_${filePrefix}_${new Date().toISOString().slice(0, 10)}.txt`,
                    saveAs: true
                }, () => {
                    URL.revokeObjectURL(textUrl);
                });
            }
            // =========================================================

            try {
                // Crea Workbook
                const workbook = new ExcelJS.Workbook();
                const worksheet = workbook.addWorksheet('Screenshots');

                // Identifica la modalità in base al primo elemento
                const firstItem = currentScreenshots[0] || {};
                const isMeta = firstItem.category === 'Meta Ads Library';
                const isGoogle = firstItem.category === 'Google Ads Library';
                const isOrganic = !isMeta && !isGoogle;

                // Definisci Colonne Base
                let dynamicColumns = [
                    { header: 'Creative (Immagine catturata)', key: 'image', width: 40 },
                    { header: 'Brand name', key: 'brand', width: 25 },
                    { header: 'Piattaforma', key: 'social', width: 25 }
                ];

                // Aggiungi colonne specifiche per modalità
                if (isMeta) {
                    dynamicColumns.push(
                        { header: 'Country', key: 'country', width: 15 },
                        { header: 'ID Libreria', key: 'libraryId', width: 20 },
                        { header: 'Data Start', key: 'startingDate', width: 15 },
                        { header: 'Stato', key: 'status', width: 10 },
                        { header: 'Test A/B', key: 'abtest', width: 15 },
                        { header: 'Call To Action', key: 'cta', width: 20 },
                        { header: 'Inserzionista (Pagina)', key: 'advertiser', width: 25 },
                        { header: 'Follower Pagina', key: 'followers', width: 15 },
                        { header: 'Soggetto Pagante', key: 'payer', width: 25 },
                        { header: 'Copertura EU', key: 'euReach', width: 15 },
                        { header: 'Età Target', key: 'targetAge', width: 15 },
                        { header: 'Dati Demografici (Copertura)', key: 'demographics', width: 45 },
                        { header: 'Testo Inserzione', key: 'caption', width: 70 }
                    );
                } else if (isGoogle) {
                    dynamicColumns.push(
                        { header: 'Country', key: 'country', width: 15 },
                        { header: 'Periodo', key: 'period', width: 20 },
                        { header: 'Formato', key: 'format', width: 15 },
                        { header: 'Testo Annuncio', key: 'caption', width: 60 }
                    );
                } else {
                    // Organic Social
                    dynamicColumns.push(
                        { header: 'Capture Date', key: 'date', width: 20 },
                        { header: 'Caption', key: 'caption', width: 60 },
                        { header: 'Hashtags', key: 'hashtags', width: 30 },
                        { header: 'Likes', key: 'likes', width: 10 },
                        { header: 'Commenti', key: 'comments', width: 10 },
                        { header: 'Condivisioni/Salvataggi', key: 'repost', width: 15 }
                    );
                }

                worksheet.columns = dynamicColumns;

                // Stile Header
                worksheet.getRow(1).font = { bold: true };
                worksheet.getRow(1).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFE50000' } // Rosso Havas
                };
                worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true }; // Testo bianco

                // NUOVO: Raggruppa per brand per Excel
                const excelBrandGroups = {};
                currentScreenshots.forEach((item, index) => {
                    const brandKey = item.brandName || '__NO_BRAND__';
                    if (!excelBrandGroups[brandKey]) excelBrandGroups[brandKey] = [];
                    excelBrandGroups[brandKey].push(item);
                });

                const sortedExcelBrands = Object.keys(excelBrandGroups).sort((a, b) => {
                    if (a === '__NO_BRAND__') return 1;
                    if (b === '__NO_BRAND__') return -1;
                    return a.localeCompare(b);
                });

                let currentRowIndex = 2;

                for (const brandKey of sortedExcelBrands) {
                    const brandItems = excelBrandGroups[brandKey];
                    const bs = calculateBrandStats(brandItems);

                    for (const item of brandItems) {
                        const rowIndex = currentRowIndex;

                        // Se è un gruppo, prendiamo il primo elemento per semplicità
                        const imgUrl = item.isGroup ? item.items[0].url : item.url;

                        // Determina il nome del Social
                        let socialName = '';
                        if (item.category === 'Meta Ads Library') {
                            socialName = 'Meta Ads Library';
                        } else {
                            socialName = item.category || '';
                            const urlToCheck = (item.sourceUrl || item.filename || '').toLowerCase();

                            if (urlToCheck.includes('instagram.com') || urlToCheck.includes('instagram')) {
                                socialName = 'Instagram';
                            } else if (urlToCheck.includes('tiktok.com') || urlToCheck.includes('tiktok')) {
                                socialName = 'TikTok';
                            } else if (urlToCheck.includes('facebook.com') || urlToCheck.includes('meta.com') || urlToCheck.includes('fb.me') || urlToCheck.includes('facebook')) {
                                socialName = 'Facebook (Meta)';
                            } else if (urlToCheck.includes('pinterest')) {
                                socialName = 'Pinterest';
                            }
                        }

                        // Separa caption e hashtag
                        const separated = item.caption ? separateCaptionAndHashtags(item.caption, item.category === 'Meta Ads Library') : { caption: '', hashtags: '' };

                        const metaText = item.metaDetails || (item.adDetails ? item.adDetails.rawDetailText : '');
                        const mData = parseMetaText(metaText) || {};

                        // Aggiungi Dati Riga
                        const row = worksheet.getRow(rowIndex);
                        const baseValues = {
                            brand: item.brandName || '',
                            social: socialName
                        };

                        if (isMeta) {
                            // Formatta la tabella demografica in una stringa leggibile per Excel
                            let demoString = '';
                            if (mData.demographics && mData.demographics.length > 0) {
                                demoString = mData.demographics.map(d => `${d.location} | Età: ${d.age} | ${d.gender} -> ${parseInt(d.reach).toLocaleString('it-IT')}`).join('\n');
                            }

                            Object.assign(baseValues, {
                                country: item.country || '',
                                libraryId: mData.libraryId || '',
                                startingDate: item.startingDate || '',
                                status: mData.status || '',
                                abtest: mData.hasVariants || '',
                                cta: mData.cta || '',
                                advertiser: mData.advertiser || '',
                                followers: mData.followers || '',
                                payer: mData.payer || '',
                                euReach: mData.euReach || '',
                                targetAge: mData.targetAge || '',
                                demographics: demoString,
                                caption: separated.caption
                            });
                        } else if (isGoogle) {
                            Object.assign(baseValues, {
                                period: item.period || item.date || '',
                                format: item.format || '',
                                caption: separated.caption || item.caption || ''
                            });
                        } else {
                            Object.assign(baseValues, {
                                date: item.date || '',
                                caption: separated.caption,
                                hashtags: separated.hashtags,
                                likes: item.metrics ? item.metrics.likes : '',
                                comments: item.metrics ? item.metrics.comments : '',
                                repost: item.metrics ? item.metrics.reshares : ''
                            });
                        }

                        row.values = baseValues;

                        // Altezza riga per l'immagine
                        row.height = 100;

                        // Aggiungi Immagine
                        const imageId = workbook.addImage({
                            base64: imgUrl,
                            extension: 'png',
                        });

                        worksheet.addImage(imageId, {
                            tl: { col: 0, row: rowIndex - 1 },
                            br: { col: 1, row: rowIndex },
                            editAs: 'oneCell'
                        });

                        row.alignment = { vertical: 'middle', horizontal: 'left' };
                        currentRowIndex++;
                    }

                    // NUOVO: Riga riepilogo statistiche brand (Solo Organico)
                    if (isOrganic && bs.postsWithMetrics > 0) {
                        const displayName = brandKey === '__NO_BRAND__' ? 'Senza Brand' : brandKey;
                        const summaryRow = worksheet.getRow(currentRowIndex);
                        summaryRow.values = {
                            brand: `📊 RIEPILOGO: ${displayName}`,
                            social: `${bs.totalPosts} post`,
                            date: '',
                            startingDate: '',
                            caption: `Engagement Medio: ${formatNumber(bs.avgEngagement)} | Tot. Interazioni: ${formatNumber(bs.totalEngagement)}`,
                            hashtags: '',
                            likes: `AVG: ${bs.avgLikes}`,
                            comments: `AVG: ${bs.avgComments}`,
                            repost: `AVG: ${bs.avgShares}`,
                            metaDetails: ''
                        };

                        // Stile riga riepilogo
                        summaryRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                        summaryRow.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FF1A1A1A' }
                        };
                        summaryRow.height = 30;
                        summaryRow.alignment = { vertical: 'middle', horizontal: 'center' };

                        // Bordo rosso sopra per evidenziare
                        summaryRow.eachCell((cell) => {
                            cell.border = {
                                top: { style: 'medium', color: { argb: 'FFE50000' } }
                            };
                        });

                        currentRowIndex++;
                    }
                }

                const buffer = await workbook.xlsx.writeBuffer();

                // Crea Blob e Scarica EXCEL
                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                const url = URL.createObjectURL(blob);
                const filename = `Havas_Social_Competitive_${new Date().toISOString().slice(0, 10)}.xlsx`;

                chrome.downloads.download({
                    url: url,
                    filename: filename,
                    saveAs: true
                }, () => {
                    URL.revokeObjectURL(url);
                    statusDiv.textContent = 'Excel e Dettagli scaricati correttamente!';
                });



            } catch (err) {
                console.error("Errore ExcelJS:", err);
                statusDiv.textContent = 'Errore durante la creazione dell\'Excel.';
                statusDiv.style.color = 'red';
            }
        });
    }

    // --- NUOVA LOGICA ESPORTAZIONE PDF ---
    exportPdfButton.addEventListener('click', async () => {
        if (currentScreenshots.length === 0) return;
        if (!window.jspdf) {
            statusDiv.textContent = "Errore: Libreria jsPDF non trovata.";
            return;
        }

        statusDiv.textContent = 'Creazione del PDF...';

        try {
            const { jsPDF } = window.jspdf;
            // Orientamento orizzontale (Landscape), unità mm, formato A4
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            const pageWidth = 297;
            const pageHeight = 210;
            const margin = 10;
            const maxContentWidth = pageWidth - (margin * 2);
            const maxContentHeight = pageHeight - (margin * 2) - 15; // -15 per il titolo

            // NUOVO: Raggruppa per brand e aggiungi pagine statistiche
            const pdfBrandGroups = {};
            currentScreenshots.forEach((item, index) => {
                const brandKey = item.brandName || '__NO_BRAND__';
                if (!pdfBrandGroups[brandKey]) pdfBrandGroups[brandKey] = [];
                pdfBrandGroups[brandKey].push({ ...item, _origIndex: index });
            });

            const sortedPdfBrands = Object.keys(pdfBrandGroups).sort((a, b) => {
                if (a === '__NO_BRAND__') return 1;
                if (b === '__NO_BRAND__') return -1;
                return a.localeCompare(b);
            });

            let isFirstPage = true;

            for (const brandKey of sortedPdfBrands) {
                const brandShots = pdfBrandGroups[brandKey];
                const bs = calculateBrandStats(brandShots);
                const displayName = brandKey === '__NO_BRAND__' ? 'Senza Brand' : brandKey;

                // --- Pagina Riepilogo Statistiche Brand ---
                if (bs.postsWithMetrics > 0) {
                    if (!isFirstPage) doc.addPage();
                    isFirstPage = false;

                    // Sfondo header
                    doc.setFillColor(26, 26, 26);
                    doc.rect(0, 0, pageWidth, 50, 'F');
                    doc.setFillColor(229, 0, 0);
                    doc.rect(0, 48, pageWidth, 2, 'F');

                    // Titolo brand
                    doc.setFontSize(28);
                    doc.setTextColor(255, 255, 255);
                    doc.text(displayName.toUpperCase(), pageWidth / 2, 25, { align: 'center' });
                    doc.setFontSize(12);
                    doc.setTextColor(180, 180, 180);
                    doc.text(`${bs.totalPosts} post analizzati  |  ${bs.postsWithMetrics} con metriche`, pageWidth / 2, 38, { align: 'center' });

                    // Stats cards
                    const cardY = 65;
                    const cardWidth = 80;
                    const cardHeight = 45;
                    const cardGap = 10;
                    const totalCardsWidth = (cardWidth * 3) + (cardGap * 2);
                    const startX = (pageWidth - totalCardsWidth) / 2;

                    const statsCards = [
                        { icon: '❤️', label: 'MEDIA LIKE', value: formatNumber(bs.avgLikes), total: `Totale: ${formatNumber(bs.totalLikes)}` },
                        { icon: '💬', label: 'MEDIA COMMENTI', value: formatNumber(bs.avgComments), total: `Totale: ${formatNumber(bs.totalComments)}` },
                        { icon: '🔄', label: 'MEDIA CONDIVISIONI', value: formatNumber(bs.avgShares), total: `Totale: ${formatNumber(bs.totalShares)}` },
                    ];

                    statsCards.forEach((card, ci) => {
                        const cx = startX + (ci * (cardWidth + cardGap));

                        // Card background
                        doc.setFillColor(240, 240, 240);
                        doc.roundedRect(cx, cardY, cardWidth, cardHeight, 3, 3, 'F');

                        // Card border accent
                        doc.setFillColor(229, 0, 0);
                        doc.rect(cx, cardY, cardWidth, 3, 'F');

                        // Label
                        doc.setFontSize(8);
                        doc.setTextColor(130, 130, 130);
                        doc.text(card.label, cx + cardWidth / 2, cardY + 14, { align: 'center' });

                        // Value
                        doc.setFontSize(22);
                        doc.setTextColor(30, 30, 30);
                        doc.text(card.value, cx + cardWidth / 2, cardY + 30, { align: 'center' });

                        // Total
                        doc.setFontSize(8);
                        doc.setTextColor(150, 150, 150);
                        doc.text(card.total, cx + cardWidth / 2, cardY + 40, { align: 'center' });
                    });

                    // Riga riepilogo engagement
                    const summaryY = cardY + cardHeight + 20;
                    doc.setFillColor(26, 26, 26);
                    doc.roundedRect(startX, summaryY, totalCardsWidth, 30, 3, 3, 'F');

                    doc.setFontSize(10);
                    doc.setTextColor(180, 180, 180);
                    doc.text('ENGAGEMENT TOTALE', startX + 15, summaryY + 12);
                    doc.setFontSize(18);
                    doc.setTextColor(229, 0, 0);
                    doc.text(formatNumber(bs.totalEngagement), startX + 15, summaryY + 24);

                    doc.setFontSize(10);
                    doc.setTextColor(180, 180, 180);
                    doc.text('ENGAGEMENT MEDIO', startX + totalCardsWidth / 2, summaryY + 12, { align: 'center' });
                    doc.setFontSize(18);
                    doc.setTextColor(255, 255, 255);
                    doc.text(formatNumber(bs.avgEngagement), startX + totalCardsWidth / 2, summaryY + 24, { align: 'center' });

                    doc.setFontSize(10);
                    doc.setTextColor(180, 180, 180);
                    doc.text('MAX LIKE', startX + totalCardsWidth - 50, summaryY + 12);
                    doc.setFontSize(18);
                    doc.setTextColor(255, 255, 255);
                    doc.text(formatNumber(bs.maxLikes), startX + totalCardsWidth - 50, summaryY + 24);
                }

                // --- Pagine normali per ogni screenshot del brand ---
                for (const item of brandShots) {

                    if (!isFirstPage) doc.addPage();
                    isFirstPage = false;

                    // Gestione Titolo
                    // MODIFICA: Usa il brand name come titolo principale
                    let title = item.brandName ? item.brandName : (item.category || item.filename);

                    // AGGIUNTA FOLLOWERS
                    if (item.followers) {
                        title += ` (${item.followers} Followers)`;
                    }

                    // AGGIUNTA PAESE E DATA
                    if (item.country) {
                        title += ` - Geo: ${item.country}`;
                    }
                    if (item.date) {
                        title += ` - Capture: ${item.date}`;
                    }
                    if (item.startingDate) {
                        title += ` - On Air: ${item.startingDate}`;
                    }

                    doc.setFontSize(14); // Aumentato un po'
                    doc.setTextColor(50, 50, 50);
                    doc.text(title, margin, margin + 5);

                    // AGGIUNTA METRICHE (Likes, Commenti, Salvati/Condivisioni)
                    if (item.metrics) {
                        let metricsText = "";
                        if (item.metrics.likes) metricsText += `Likes: ${item.metrics.likes}   `;
                        if (item.metrics.comments) metricsText += `Commenti: ${item.metrics.comments}   `;
                        if (item.metrics.reshares) {
                            const label = (item.filename && item.filename.includes('tiktok.com')) ? 'Salvati/Preferiti' : 'Condivisioni';
                            metricsText += `${label}: ${item.metrics.reshares}   `;
                        }

                        if (metricsText) {
                            doc.setFontSize(10);
                            doc.setTextColor(100, 100, 100);
                            doc.text(metricsText, margin, margin + 12);
                        }
                    }

                    // DATI EXTRA META ADS LIBRARY
                    let metaOffset = 0;
                    if (item.category === 'Meta Ads Library') {
                        const metaText = item.metaDetails || (item.adDetails ? item.adDetails.rawDetailText : '');
                        const mData = parseMetaText(metaText);
                        if (mData) {
                            doc.setFontSize(9);
                            doc.setTextColor(229, 0, 0); // Rosso Havas
                            const metaInfo = `Stato: ${mData.status} | Varianti A/B: ${mData.hasVariants} | CTA: ${mData.cta} | Inserzionista: ${mData.advertiser}`;
                            doc.text(metaInfo, margin, margin + 18);
                            metaOffset = 6;
                        }
                    }

                    // NUOVO: AGGIUNTA CAPTION E HASHTAG SEPARATI
                    if (item.caption && item.caption.trim().length > 0) {
                        const separated = separateCaptionAndHashtags(item.caption, item.category === 'Meta Ads Library');

                        doc.setFontSize(9);
                        doc.setTextColor(80, 80, 80);

                        // Calcola la posizione Y per la caption (sotto le metriche o Meta Ads se presenti)
                        let captionY = margin + 12;
                        if (item.metrics) captionY = margin + 18;
                        captionY += metaOffset; // Aggiunge spazio se è una Meta Ad

                        // Caption (senza hashtag)
                        if (separated.caption) {
                            let captionText = separated.caption;
                            if (captionText.length > 150) {
                                captionText = captionText.substring(0, 150) + '...';
                            }

                            const captionLines = doc.splitTextToSize(`Caption: ${captionText}`, maxContentWidth);
                            doc.text(captionLines, margin, captionY);
                            captionY += captionLines.length * 4; // Sposta in basso per gli hashtag
                        }

                        // Hashtag (separati)
                        if (separated.hashtags) {
                            doc.setFontSize(8);
                            doc.setTextColor(100, 100, 100);
                            const hashtagLines = doc.splitTextToSize(`Hashtags: ${separated.hashtags}`, maxContentWidth);
                            doc.text(hashtagLines, margin, captionY + 2);
                        }
                    }

                    // Gestione Immagine (Logica Fit-Center simile al PPT)
                    try {
                        // Se è un gruppo, prendiamo solo la prima per ora o gestiamo diversamente
                        // Per semplicità qui stampiamo la prima del gruppo o l'immagine singola
                        const imgUrl = item.isGroup ? item.items[0].url : item.url;

                        const dims = await getImageDimensions(imgUrl);

                        // Calcolo proporzioni
                        const imgRatio = dims.width / dims.height;
                        const containerRatio = maxContentWidth / maxContentHeight;

                        let finalW, finalH;

                        if (imgRatio > containerRatio) {
                            // Limitato dalla larghezza
                            finalW = maxContentWidth;
                            finalH = finalW / imgRatio;
                        } else {
                            // Limitato dall'altezza
                            finalH = maxContentHeight;
                            finalW = finalH * imgRatio;
                        }

                        // Calcolo posizione per centrare
                        const finalX = margin + (maxContentWidth - finalW) / 2;
                        const finalY = (margin + 15) + (maxContentHeight - finalH) / 2;

                        doc.addImage(imgUrl, 'PNG', finalX, finalY, finalW, finalH);

                    } catch (imgErr) {
                        console.error("Errore aggiunta immagine PDF", imgErr);
                        doc.text("Errore caricamento immagine", pageWidth / 2, pageHeight / 2, { align: "center" });
                    }
                } // fine for (item of brandShots)
            } // fine for (brandKey of sortedPdfBrands)

            const filename = `screenshots-${new Date().toISOString().slice(0, 10)}.pdf`;

            // 1. Salva il file localmente (download classico)
            doc.save(filename);

            // 2. Prepara il salvataggio nella memoria interna (Analisi AI)
            const pdfBlob = doc.output('blob');
            const reader = new FileReader();
            reader.readAsDataURL(pdfBlob);
            reader.onloadend = () => {
                const base64data = reader.result;
                const payload = {
                    name: filename,
                    date: Date.now(),
                    data: base64data,
                    size: pdfBlob.size
                };

                // Invia al background per salvare su IndexedDB
                chrome.runtime.sendMessage({ action: 'savePDF', payload: payload }, (response) => {
                    if (response && response.status === 'saved') {
                        statusDiv.textContent = 'PDF Generato e salvato in "Analisi AI"!';
                        showNotification(`PDF "${filename}" salvato in Analisi AI`);

                        // Aggiorna tutte le liste PDF dopo un breve delay per assicurarsi che il DB sia aggiornato
                        setTimeout(() => {
                            // Ricarica i PDF nello storico
                            chrome.runtime.sendMessage({ action: 'getPDFs' }, (response) => {
                                if (response && response.pdfs) {
                                    // Aggiorna dropdown inline se esiste
                                    const inlinePdfSelect = document.getElementById('inlinePdfSelect');
                                    if (inlinePdfSelect) {
                                        const currentValue = inlinePdfSelect.value;
                                        inlinePdfSelect.innerHTML = '<option value="">-- Seleziona PDF --</option>';
                                        response.pdfs.forEach(pdf => {
                                            const option = document.createElement('option');
                                            option.value = pdf.id;
                                            option.textContent = pdf.name;
                                            inlinePdfSelect.appendChild(option);
                                        });
                                        if (currentValue) inlinePdfSelect.value = currentValue;
                                    }

                                    // Aggiorna dropdown chatbot se esiste
                                    const chatSelect = document.getElementById('aiChatbotPdfSelect');
                                    if (chatSelect) {
                                        const currentValue = chatSelect.value;
                                        chatSelect.innerHTML = '<option value="">-- Seleziona PDF --</option>';
                                        response.pdfs.forEach(pdf => {
                                            const option = document.createElement('option');
                                            option.value = pdf.id;
                                            option.textContent = pdf.name;
                                            chatSelect.appendChild(option);
                                        });
                                        if (currentValue) chatSelect.value = currentValue;
                                    }

                                    // Aggiorna la lista nello storico se la funzione esiste
                                    if (typeof loadPdfs === 'function') {
                                        loadPdfs();
                                    }

                                    // AGGIUNTA: Se generato dal pulsante "Analisi AI", apri la finestra
                                    if (window.autoOpenAIModal) {
                                        window.autoOpenAIModal = false;
                                        document.getElementById('pdfHistoryButton').click();
                                    }
                                }
                            });
                        }, 100);
                    } else {
                        statusDiv.textContent = 'Errore nel salvare il PDF nello storico';
                        statusDiv.style.color = 'red';
                    }
                });

            };

        } catch (error) {
            console.error("Errore PDF:", error);
            statusDiv.textContent = "Errore durante la generazione PDF.";
            statusDiv.style.color = 'red';
        }
    });
    // --- FINE LOGICA PDF ---

    // --- PULSANTI EXPORT NELLA GALLERIA ---
    if (galleryExportPdfBtn) {
        galleryExportPdfBtn.addEventListener('click', () => {
            exportPdfButton.click();
        });
    }

    if (galleryExportExcelBtn) {
        galleryExportExcelBtn.addEventListener('click', () => {
            exportExcelButton.click();
        });
    }

    if (galleryExportPptBtn) {
        galleryExportPptBtn.addEventListener('click', () => {
            generatePptButton.click();
        });
    }

    // Logica per il nuovo pulsante Cronologia nella galleria
    const galleryHistoryBtn = document.getElementById('galleryHistoryBtn');
    if (galleryHistoryBtn) {
        galleryHistoryBtn.addEventListener('click', () => {
            const pageHistoryButton = document.getElementById('pageHistoryButton');
            if (pageHistoryButton) {
                pageHistoryButton.click(); // Simula il click sul pulsante della sidebar
            }
        });
    }

    // Logica per il nuovo pulsante Analisi AI
    const galleryAiAnalysisBtn = document.getElementById('galleryAiAnalysisBtn');
    if (galleryAiAnalysisBtn) {
        galleryAiAnalysisBtn.addEventListener('click', () => {
            window.autoOpenAIModal = true;
            // Mostra un avviso per spiegare cosa sta succedendo
            statusDiv.textContent = 'Preparazione dati per AI in corso...';
            // Clicca "virtualmente" il pulsante Esporta PDF
            exportPdfButton.click();
        });
    }
    // --- FINE PULSANTI GALLERIA ---

    generatePptButton.addEventListener('click', async () => {
        if (currentScreenshots.length === 0) return;
        statusDiv.textContent = 'Creazione della presentazione PowerPoint...';

        // Layout fisso su "comparison" (o definiscilo qui se vuoi cambiarlo)
        const selectedLayout = 'comparison';

        try {
            const pptx = new PptxGenJS(); pptx.author = 'Excel Tab Opener & Scraper'; pptx.company = 'Chrome Extension'; pptx.title = 'Screenshots Presentation'; pptx.subject = 'Raccolta di screenshot automatici'; const titleSlide = pptx.addSlide(); titleSlide.addText('Screenshots Presentation', { x: 1, y: 1, w: 8, h: 1.5, fontSize: 36, bold: true, align: 'center', color: 'C00000' }); titleSlide.addText(`${currentScreenshots.length} screenshot/gruppi catturati`, { x: 1, y: 2.5, w: 8, h: 1, fontSize: 18, align: 'center', color: '7F7F7F' }); titleSlide.addText(`Generato il ${new Date().toLocaleDateString('it-IT')}`, { x: 1, y: 3.5, w: 8, h: 0.5, fontSize: 14, align: 'center', color: 'A6A6A6' });

            // NUOVO: Raggruppa per brand e aggiungi slide statistiche
            const pptBrandGroups = {};
            currentScreenshots.forEach((item, index) => {
                const brandKey = item.brandName || '__NO_BRAND__';
                if (!pptBrandGroups[brandKey]) pptBrandGroups[brandKey] = [];
                pptBrandGroups[brandKey].push({ item, index });
            });

            const sortedPptBrands = Object.keys(pptBrandGroups).sort((a, b) => {
                if (a === '__NO_BRAND__') return 1;
                if (b === '__NO_BRAND__') return -1;
                return a.localeCompare(b);
            });

            for (const brandKey of sortedPptBrands) {
                const brandEntries = pptBrandGroups[brandKey];
                const brandItems = brandEntries.map(e => e.item);
                const bs = calculateBrandStats(brandItems);
                const displayName = brandKey === '__NO_BRAND__' ? 'Senza Brand' : brandKey;

                // --- Slide Riepilogo Statistiche Brand ---
                if (bs.postsWithMetrics > 0) {
                    const statsSlide = pptx.addSlide();
                    statsSlide.background = { color: '1A1A1A' };

                    // Linea rossa top
                    statsSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: 'E50000' } });

                    // Nome Brand
                    statsSlide.addText(displayName.toUpperCase(), { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 32, bold: true, align: 'center', color: 'FFFFFF', fontFace: 'Arial' });

                    // Sottotitolo
                    statsSlide.addText(`${bs.totalPosts} post analizzati  •  ${bs.postsWithMetrics} con metriche`, { x: 0.5, y: 1.1, w: 9, h: 0.4, fontSize: 12, align: 'center', color: 'AAAAAA' });

                    // Linea separatore
                    statsSlide.addShape(pptx.ShapeType.rect, { x: 2, y: 1.65, w: 6, h: 0.02, fill: { color: 'E50000' } });

                    // Stat Cards (3 colonne)
                    const cardStats = [
                        { label: 'MEDIA LIKE', value: formatNumber(bs.avgLikes), total: `Tot: ${formatNumber(bs.totalLikes)}`, icon: '❤️' },
                        { label: 'MEDIA COMMENTI', value: formatNumber(bs.avgComments), total: `Tot: ${formatNumber(bs.totalComments)}`, icon: '💬' },
                        { label: 'MEDIA CONDIVISIONI', value: formatNumber(bs.avgShares), total: `Tot: ${formatNumber(bs.totalShares)}`, icon: '🔄' },
                    ];

                    const cardW = 2.6;
                    const cardGP = 0.3;
                    const totalW = (cardW * 3) + (cardGP * 2);
                    const startPptX = (10 - totalW) / 2;

                    cardStats.forEach((cs, ci) => {
                        const cx = startPptX + (ci * (cardW + cardGP));
                        const cy = 2.0;

                        // Card background
                        statsSlide.addShape(pptx.ShapeType.rect, { x: cx, y: cy, w: cardW, h: 1.6, fill: { color: 'F5F5F5' }, rectRadius: 0.1 });

                        // Red accent top
                        statsSlide.addShape(pptx.ShapeType.rect, { x: cx, y: cy, w: cardW, h: 0.06, fill: { color: 'E50000' } });

                        // Label
                        statsSlide.addText(cs.label, { x: cx, y: cy + 0.15, w: cardW, h: 0.3, fontSize: 9, align: 'center', color: '888888', bold: true });

                        // Value
                        statsSlide.addText(cs.value, { x: cx, y: cy + 0.5, w: cardW, h: 0.6, fontSize: 28, align: 'center', color: '1A1A1A', bold: true, fontFace: 'Arial' });

                        // Total
                        statsSlide.addText(cs.total, { x: cx, y: cy + 1.15, w: cardW, h: 0.3, fontSize: 10, align: 'center', color: 'AAAAAA' });
                    });

                    // Engagement summary row
                    const engY = 3.9;
                    statsSlide.addShape(pptx.ShapeType.rect, { x: startPptX, y: engY, w: totalW, h: 0.9, fill: { color: '2A2A2A' }, rectRadius: 0.1 });

                    statsSlide.addText(`ENGAGEMENT TOTALE: ${formatNumber(bs.totalEngagement)}`, { x: startPptX + 0.3, y: engY + 0.1, w: totalW / 3, h: 0.7, fontSize: 11, color: 'E50000', bold: true, valign: 'middle' });
                    statsSlide.addText(`ENGAGEMENT MEDIO: ${formatNumber(bs.avgEngagement)}`, { x: startPptX + totalW / 3, y: engY + 0.1, w: totalW / 3, h: 0.7, fontSize: 11, color: 'FFFFFF', bold: true, valign: 'middle', align: 'center' });
                    statsSlide.addText(`MAX LIKE: ${formatNumber(bs.maxLikes)}`, { x: startPptX + (totalW * 2 / 3), y: engY + 0.1, w: totalW / 3, h: 0.7, fontSize: 11, color: 'FFFFFF', bold: true, valign: 'middle', align: 'right' });

                    // Linea rossa bottom
                    statsSlide.addShape(pptx.ShapeType.rect, { x: 0, y: 5.585, w: 10, h: 0.04, fill: { color: 'E50000' } });
                }

                // --- Slide normali per ogni screenshot del brand ---
                for (const { item, index: i } of brandEntries) {
                    statusDiv.textContent = `Aggiungendo slide ${i + 1}/${currentScreenshots.length}...`;
                    if (item.isGroup) {
                        await createComparisonSlide(pptx, item, i);
                    } else {
                        let singleImageLayout = selectedLayout;
                        if (selectedLayout === 'comparison') {
                            singleImageLayout = 'fit-center';
                        }
                        await createSingleImageSlide(pptx, item, i, singleImageLayout);
                    }
                }
            } const filename = `screenshots-presentation-${new Date().toISOString().slice(0, 10)}.pptx`; await pptx.writeFile({ fileName: filename }); statusDiv.textContent = 'Presentazione PowerPoint generata con successo!';
        } catch (error) { console.error('Errore durante la generazione del PPT:', error); statusDiv.textContent = 'Errore durante la generazione del PPT: ' + error.message; statusDiv.style.color = 'red'; }
    });

    // MODIFICA 1d: Sostituzione della funzione per renderla asincrona e aggiungere il layout "center"
    // MODIFICA 1b (AGGIORNATA): Sostituzione della funzione per gestire il layout "fit-center"
    async function createSingleImageSlide(pptx, screenshot, index, layout) {
        const slide = pptx.addSlide();
        // MODIFICA: Usa il brand name come titolo principale
        let title = screenshot.brandName ? screenshot.brandName : (screenshot.category ? screenshot.category : `Screenshot ${index + 1}`);

        // AGGIUNTA FOLLOWERS E METRICHE
        if (screenshot.followers) {
            title += ` (${screenshot.followers} Followers)`;
        }

        if (screenshot.country) {
            title += ` - Geo: ${screenshot.country}`;
        }
        if (screenshot.date) {
            title += ` - Cap: ${screenshot.date}`;
        }
        if (screenshot.startingDate) {
            title += ` - On Air: ${screenshot.startingDate}`;
        }

        if (screenshot.metrics) {
            let m = screenshot.metrics;
            let parts = [];
            if (m.likes) parts.push(`Likes: ${m.likes}`);
            if (m.comments) parts.push(`Comments: ${m.comments}`);
            if (m.reshares) {
                const label = (screenshot.filename && screenshot.filename.includes('tiktok.com')) ? 'Saves' : 'Shares';
                parts.push(`${label}: ${m.reshares}`);
            }
            if (parts.length > 0) {
                title += ` | ${parts.join(' - ')}`;
            }
        }

        // DATI EXTRA META ADS LIBRARY (PPT)
        if (screenshot.category === 'Meta Ads Library') {
            const metaText = screenshot.metaDetails || (screenshot.adDetails ? screenshot.adDetails.rawDetailText : '');
            const mData = parseMetaText(metaText);
            if (mData) {
                title += `\n[META ADS] Stato: ${mData.status} | Varianti (A/B Test): ${mData.hasVariants} | CTA: ${mData.cta}`;
            }
        }

        // NUOVO: AGGIUNTA CAPTION E HASHTAG SEPARATI AL TITOLO
        if (screenshot.caption && screenshot.caption.trim().length > 0) {
            const separated = separateCaptionAndHashtags(screenshot.caption, screenshot.category === 'Meta Ads Library');

            if (separated.caption) {
                let captionText = separated.caption;
                // Tronca la caption se troppo lunga per il PowerPoint
                if (captionText.length > 120) {
                    captionText = captionText.substring(0, 120) + '...';
                }
                title += `\n\nCaption: ${captionText}`;
            }

            if (separated.hashtags) {
                title += `\n\nHashtags: ${separated.hashtags}`;
            }
        }

        switch (layout) {
            case 'fit':
                slide.addImage({ data: screenshot.url, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'contain', bkgd: true } });
                break;
            case 'title-top':
                slide.addText(title, { x: 0.5, y: 0.3, w: 9, h: 1.0, fontSize: 10, align: 'center', color: '363636', bold: true });
                slide.addImage({ data: screenshot.url, x: 0.5, y: 1.4, w: '90%', h: '70%', sizing: { type: 'contain' } });
                break;
            case 'fit-center': // Nuovo nome del valore
                try {
                    // Spiegazione modifica: Aggiungiamo il titolo in una posizione fissa in alto con più spazio per la caption.
                    slide.addText(title, { x: 0.5, y: 0.1, w: 9, h: 0.8, fontSize: 12, align: 'center', color: '363636' });

                    // Spiegazione modifica: Definiamo un'area "contenuto" SOTTO il titolo dove posizionare l'immagine.
                    const contentAreaY = 1.0; // Posizione Y di partenza (sotto il titolo + margine)
                    const contentAreaWidth = 10; // Larghezza intera della slide
                    const contentAreaHeight = 5.625 - contentAreaY; // Altezza rimanente
                    const dpi = 96;

                    const dims = await getImageDimensions(screenshot.url);
                    let imgWidthInches = dims.width / dpi;
                    let imgHeightInches = dims.height / dpi;

                    let finalW, finalH;

                    const imageRatio = imgWidthInches / imgHeightInches;
                    const containerRatio = contentAreaWidth / contentAreaHeight;

                    // Spiegazione modifica: Calcoliamo le dimensioni finali per adattare l'immagine
                    // all'area contenuto, MANTENENDO LE PROPORZIONI.
                    if (imageRatio > containerRatio) {
                        // L'immagine è più larga del contenitore, la larghezza comanda
                        finalW = contentAreaWidth;
                        finalH = finalW / imageRatio;
                    } else {
                        // L'immagine è più alta del contenitore, l'altezza comanda
                        finalH = contentAreaHeight;
                        finalW = finalH * imageRatio;
                    }

                    // Spiegazione modifica: Centriamo l'immagine (con le sue nuove dimensioni corrette)
                    // all'interno dell'area contenuto.
                    const finalX = (contentAreaWidth - finalW) / 2;
                    const finalY = contentAreaY + (contentAreaHeight - finalH) / 2;

                    slide.addImage({
                        data: screenshot.url,
                        x: finalX,
                        y: finalY,
                        w: finalW,
                        h: finalH,
                    });
                } catch (error) {
                    console.error('Errore durante l\'aggiunta dell\'immagine centrata:', error);
                    slide.addImage({ data: screenshot.url, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'contain' } });
                    slide.addText("Errore nel caricamento dell'immagine", { x: 0, y: 0, w: '100%', h: '100%', align: 'center', color: 'FF0000', fontSize: 18 });
                }
                break;
            case 'fill':
            default:
                slide.addImage({ data: screenshot.url, x: 0, y: 0, w: '100%', h: '100%', sizing: { type: 'cover' } });
                slide.addText(title, { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 24, bold: true, align: 'center', color: 'C00000', outline: { size: 1.5, color: 'FFFFFF' } });
                break;
        }
    }

    async function createComparisonSlide(pptx, group, index) {
        const slide = pptx.addSlide();
        let numImages = group.items.length;
        if (numImages > 4) {
            group.items = group.items.slice(0, 4);
            numImages = 4;
        }
        slide.addText(`Confronto: Slide ${index + 1}`, { x: 0.5, y: 0.1, w: 9, h: 0.5, fontSize: 22, bold: true, align: 'center', color: '363636' });

        const margin = 0.2;
        const slideWidth = 10;
        const slideHeight = 5.625;

        // Definiamo l'area per i box contenenti titolo + immagine
        const boxWidth = (slideWidth - (numImages + 1) * margin) / numImages;
        const boxStartY = 0.7;
        const boxHeight = slideHeight - boxStartY - 0.2;

        // All'interno di ogni box, definiamo l'area per il titolo e per l'immagine
        const titleHeight = 0.85; // Aumentato per fare spazio a caption e metriche
        const imageAreaY = boxStartY + titleHeight;
        const imageAreaHeight = boxHeight - titleHeight;
        const dpi = 96;

        // Spiegazione modifica: Usiamo un ciclo for...of per poter usare 'await' all'interno
        for (let i = 0; i < group.items.length; i++) {
            const item = group.items[i];
            const boxStartX = margin + i * (boxWidth + margin);

            // Aggiungiamo il titolo (con la logica di fallback già implementata)
            // MODIFICA: Usa il brand name se disponibile, altrimenti categoria o filename
            let titleText = item.brandName ? item.brandName : (item.category || item.filename);

            // AGGIUNTA FOLLOWERS E METRICHE
            let subTitle = "";
            if (item.followers) {
                subTitle += `(${item.followers} Follower)`;
            }

            if (item.country) {
                if (subTitle) subTitle += " | ";
                subTitle += "Geo: " + item.country;
            }
            if (item.date) {
                if (subTitle) subTitle += " | ";
                subTitle += "Cap: " + item.date;
            }
            if (item.startingDate) {
                if (subTitle) subTitle += " | ";
                subTitle += "On Air: " + item.startingDate;
            }

            if (item.metrics) {
                let m = item.metrics;
                let parts = [];
                if (m.likes) parts.push(`L: ${m.likes}`);
                if (m.comments) parts.push(`C: ${m.comments}`);
                if (m.reshares) parts.push(`S: ${m.reshares}`);
                if (parts.length > 0) {
                    if (subTitle) subTitle += " | ";
                    subTitle += parts.join(' ');
                }
            }

            // CREAZIONE DEL BLOCCO DI TESTO FORMATTATO
            let textElements = [];

            // 1. Titolo Principale (Brand o Categoria)
            textElements.push({ text: titleText, options: { bold: true, fontSize: 9, color: '363636' } });

            // 2. Sottotitolo (Follower, Date, Metriche)
            if (subTitle) {
                textElements.push({ text: `\n${subTitle}`, options: { bold: false, fontSize: 7, color: '666666' } });
            }

            // 3. Caption (Aggiunta per i raggruppamenti)
            if (item.caption && item.caption.trim().length > 0) {
                const separated = separateCaptionAndHashtags(item.caption, item.category === 'Meta Ads Library');
                if (separated.caption) {
                    let shortCap = separated.caption.replace(/\n/g, ' '); // Rimuove gli a capo per risparmiare spazio
                    if (shortCap.length > 80) shortCap = shortCap.substring(0, 80) + '...'; // Taglia se troppo lunga
                    textElements.push({ text: `\n📝 ${shortCap}`, options: { bold: false, italic: true, fontSize: 7, color: '444444' } });
                }
            }

            if (textElements.length > 0) {
                slide.addText(textElements, { x: boxStartX, y: boxStartY, w: boxWidth, h: titleHeight, align: 'center', valign: 'top' });
            }

            // Spiegazione modifica: Otteniamo le dimensioni reali dell'immagine per calcolare le proporzioni
            const dims = await getImageDimensions(item.url);
            const imgWidthInches = dims.width / dpi;
            const imgHeightInches = dims.height / dpi;

            const imageRatio = imgWidthInches / imgHeightInches;
            const containerRatio = boxWidth / imageAreaHeight;

            let finalW, finalH;

            // Spiegazione modifica: Calcoliamo la dimensione finale dell'immagine senza stirarla
            if (imageRatio > containerRatio) {
                finalW = boxWidth;
                finalH = finalW / imageRatio;
            } else {
                finalH = imageAreaHeight;
                finalW = finalH * imageRatio;
            }

            // Spiegazione modifica: Centriamo l'immagine con le proporzioni corrette nel suo spazio
            const finalX = boxStartX + (boxWidth - finalW) / 2;
            const finalY = imageAreaY + (imageAreaHeight - finalH) / 2;

            // Aggiungiamo l'immagine con dimensioni e posizione calcolate manualmente, senza 'sizing'
            slide.addImage({ data: item.url, x: finalX, y: finalY, w: finalW, h: finalH });
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        statusDiv.style.color = '#555';
        if (message.action === 'screenshotTaken') {
            refreshScreenshotsView();
        } else if (message.action === 'updateStatus') {
            statusDiv.textContent = `[${message.current}/${message.total}] Apro: ${message.url}`;
        } else if (message.action === 'processingStarted') {
            screenshotsContainer.innerHTML = '';
            statusDiv.textContent = `Avvio del processo per ${message.total} URL...`;
        } else if (message.action === 'processingFinished') {
            statusDiv.textContent = '';
            startButton.disabled = false;
            fileInput.disabled = false;
            textUrlsInput.disabled = false;
            clearButton.disabled = currentScreenshots.length === 0;
        } else if (message.action === 'processingError') {
            statusDiv.textContent = `ERRORE: ${message.error}`;
            statusDiv.style.color = 'red';
        }
    });

    // --- INIZIO NUOVA SEZIONE: LOGICA PRESET MANAGER ---

    const placeholderImageUrl = "data:image/svg+xml;charset=UTF-8,%3csvg width='400' height='300' xmlns='http://www.w3.org/2000/svg'%3e%3crect width='400' height='300' fill='%23eee'/%3e%3ctext x='50%25' y='50%25' font-family='Arial' font-size='16' fill='%23999' text-anchor='middle' dominant-baseline='middle'%3eImmagine di Esempio 400x300%3c/text%3e%3c/svg%3e";

    function openPresetManager() {
        renderPresetManagerList();
        presetManagerModal.style.display = 'flex';
        presetManagerDetailsView.style.display = 'none';
        presetManagerPlaceholder.style.display = 'block';
        currentlyEditingPreset = null;
        if (presetManagerCropper) {
            presetManagerCropper.destroy();
            presetManagerCropper = null;
        }
    }

    function closePresetManager() {
        presetManagerModal.style.display = 'none';
        if (presetManagerCropper) {
            presetManagerCropper.destroy();
            presetManagerCropper = null;
        }
    }

    function renderPresetManagerList() {
        const presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
        presetManagerList.innerHTML = '';
        if (presets.length === 0) {
            presetManagerList.innerHTML = '<li style="color: #888; padding: 10px;">Nessun preset salvato.</li>';
            return;
        }
        presets.forEach(preset => {
            const li = document.createElement('li');
            li.textContent = preset.name;
            li.style.cssText = 'padding: 10px; cursor: pointer; border-bottom: 1px solid #eee;';
            li.addEventListener('mouseenter', () => li.style.backgroundColor = '#f0f0f0');
            li.addEventListener('mouseleave', () => li.style.backgroundColor = 'transparent');
            li.addEventListener('click', () => {
                document.querySelectorAll('#preset-manager-list li').forEach(item => item.style.backgroundColor = 'transparent');
                li.style.backgroundColor = '#e0e0e0';
                showPresetDetails(preset.name);
            });
            presetManagerList.appendChild(li);
        });
    }

    // NUOVA FUNZIONE: Mostra spiegazione statistica
    const showStatExplanation = (statType, stats) => {
        // Determina il tipo di piattaforma per personalizzare le spiegazioni
        const isMetaAdsLibrary = stats.category === 'Meta Ads Library';
        const brandName = stats.brandName || 'questo brand';
        const platformContext = isMetaAdsLibrary ? 'nelle campagne pubblicitarie Meta' : 'sui post organici';

        const explanations = {
            likes: {
                title: '❤️ Media Like',
                description: isMetaAdsLibrary
                    ? `Rappresenta il numero medio di "Mi piace" ricevuti dalle inserzioni pubblicitarie di ${brandName} su Meta Ads Library.`
                    : `Rappresenta il numero medio di "Mi piace" ricevuti dai post di ${brandName} ${platformContext}.`,
                calculation: `Calcolato come: Totale Like (${formatNumber(stats.totalLikes)}) ÷ Post con metriche (${stats.postsWithMetrics}) = ${formatNumber(stats.avgLikes)}`,
                insight: isMetaAdsLibrary
                    ? `Un valore alto indica che le creatività pubblicitarie di ${brandName} generano reazioni positive dal pubblico target.`
                    : `Un valore alto indica che i contenuti di ${brandName} risuonano positivamente con il pubblico.`
            },
            comments: {
                title: '💬 Media Commenti',
                description: isMetaAdsLibrary
                    ? `Rappresenta il numero medio di commenti ricevuti dalle inserzioni di ${brandName}.`
                    : `Rappresenta il numero medio di commenti ricevuti dai post di ${brandName}.`,
                calculation: `Calcolato come: Totale Commenti (${formatNumber(stats.totalComments)}) ÷ Post con metriche (${stats.postsWithMetrics}) = ${formatNumber(stats.avgComments)}`,
                insight: isMetaAdsLibrary
                    ? `I commenti sulle ads indicano interesse e conversazione attorno alle campagne di ${brandName}. Valori alti possono indicare sia engagement positivo che controversie.`
                    : `I commenti indicano un alto livello di coinvolgimento e conversazione del pubblico con ${brandName}.`
            },
            shares: {
                title: '🔄 Media Condivisioni',
                description: isMetaAdsLibrary
                    ? `Rappresenta il numero medio di condivisioni ricevute dalle inserzioni pubblicitarie di ${brandName}.`
                    : `Rappresenta il numero medio di condivisioni/repost ricevuti dai post di ${brandName}.`,
                calculation: `Calcolato come: Totale Condivisioni (${formatNumber(stats.totalShares)}) ÷ Post con metriche (${stats.postsWithMetrics}) = ${formatNumber(stats.avgShares)}`,
                insight: isMetaAdsLibrary
                    ? `Le condivisioni delle ads amplificano organicamente la portata delle campagne di ${brandName}, riducendo il costo per impression.`
                    : `Le condivisioni amplificano la portata organica dei contenuti di ${brandName} oltre i follower diretti.`
            },
            engagement: {
                title: '📊 Engagement Medio',
                description: isMetaAdsLibrary
                    ? `Rappresenta il numero medio totale di interazioni (like + commenti + condivisioni) per inserzione di ${brandName}.`
                    : `Rappresenta il numero medio totale di interazioni (like + commenti + condivisioni) per post di ${brandName}.`,
                calculation: `Calcolato come: (Totale Like + Commenti + Condivisioni) ÷ Post con metriche = (${formatNumber(stats.totalLikes)} + ${formatNumber(stats.totalComments)} + ${formatNumber(stats.totalShares)}) ÷ ${stats.postsWithMetrics} = ${formatNumber(stats.avgEngagement)}`,
                insight: isMetaAdsLibrary
                    ? `Questa metrica sintetizza l'efficacia complessiva delle creatività pubblicitarie di ${brandName} nel generare engagement.`
                    : `Questa metrica sintetizza il coinvolgimento complessivo del pubblico con i contenuti di ${brandName}.`
            },
            totalEngagement: {
                title: '⚡ Totale Interazioni',
                description: isMetaAdsLibrary
                    ? `Rappresenta la somma totale di tutte le interazioni ricevute dalle campagne pubblicitarie di ${brandName} nel periodo analizzato.`
                    : `Rappresenta la somma totale di tutte le interazioni ricevute dai post di ${brandName} nel periodo analizzato.`,
                calculation: `Calcolato come: Totale Like (${formatNumber(stats.totalLikes)}) + Totale Commenti (${formatNumber(stats.totalComments)}) + Totale Condivisioni (${formatNumber(stats.totalShares)}) = ${formatNumber(stats.totalEngagement)}`,
                insight: isMetaAdsLibrary
                    ? `Indica il volume complessivo di engagement generato dalle campagne pubblicitarie di ${brandName}. Utile per valutare il ROI delle ads.`
                    : `Indica il volume complessivo di engagement generato da ${brandName} nel periodo analizzato.`
            },
            postsAnalyzed: {
                title: '📝 Post Analizzati',
                description: isMetaAdsLibrary
                    ? `Mostra quante inserzioni di ${brandName} hanno metriche disponibili rispetto al totale catturato.`
                    : `Mostra quanti post di ${brandName} hanno metriche disponibili rispetto al totale catturato.`,
                calculation: `${stats.postsWithMetrics} ${isMetaAdsLibrary ? 'inserzioni' : 'post'} con metriche su ${stats.totalPosts} totali`,
                insight: isMetaAdsLibrary
                    ? `Non tutte le inserzioni potrebbero avere metriche pubbliche visibili su Meta Ads Library al momento della cattura.`
                    : `Non tutti i post potrebbero avere metriche visibili al momento della cattura.`
            }
        };

        const info = explanations[statType];
        if (!info) return;

        showCustomDialog({
            title: `${info.title}`,
            message: `
                <div style="text-align: left; line-height: 1.6;">
                    <p style="margin-bottom: 12px;"><strong>Cosa rappresenta:</strong><br>${info.description}</p>
                    <p style="margin-bottom: 12px; background: var(--input-bg); padding: 10px; border-radius: 6px; font-family: 'Google Sans Code', monospace; font-size: 12px;"><strong>Calcolo:</strong><br>${info.calculation}</p>
                    <p style="margin-bottom: 0; color: var(--havas-red);"><strong>💡 Insight:</strong><br>${info.insight}</p>
                </div>
            `
        });
    };

    async function showPresetDetails(presetName) {
        if (presetManagerCropper) {
            presetManagerCropper.destroy();
            presetManagerCropper = null;
        }
        currentlyEditingPreset = presetName;
        const presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
        const preset = presets.find(p => p.name === presetName);

        if (!preset) {
            console.error("Preset non trovato:", presetName);
            return;
        }

        presetManagerPlaceholder.style.display = 'none';
        presetManagerDetailsView.style.display = 'block';

        presetManagerNameInput.value = preset.name;
        presetManagerNameInput.style.display = 'block';

        // Mostra i wrapper delle immagini
        presetOriginalImageWrapper.style.display = 'block';
        presetCroppedWrapper.style.display = 'block';

        // Mostra i pulsanti di azione
        presetManagerActions.style.display = 'flex';

        // Usa l'immagine salvata nel preset, o il placeholder se non disponibile (per vecchi preset)
        const sourceImageUrl = preset.imageUrl || placeholderImageUrl;

        presetOriginalImage.src = sourceImageUrl;
        presetCroppedImage.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"; // Immagine vuota temporanea

        try {
            // Applica il ritaglio all'immagine sorgente corretta
            const croppedUrl = await applyCropToImage(sourceImageUrl, preset.rect);
            presetCroppedImage.src = croppedUrl;
        } catch (error) {
            console.error("Errore durante l'applicazione del ritaglio di anteprima:", error);
            presetCroppedImage.src = ''; // Mostra vuoto in caso di errore
        }
    }

    function savePresetChanges() {
        if (!currentlyEditingPreset) return;

        const newName = presetManagerNameInput.value.trim();
        if (!newName) {
            showCustomDialog({
                title: 'Errore',
                message: "Il nome del preset non può essere vuoto."
            });
            return;
        }

        let presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
        const presetIndex = presets.findIndex(p => p.name === currentlyEditingPreset);
        if (presetIndex === -1) return;

        // Controlla se il nuovo nome è già in uso (e non è il preset corrente)
        const isNameTaken = presets.some((p, index) => p.name === newName && index !== presetIndex);
        if (isNameTaken) {
            showCustomDialog({
                title: 'Nome già in uso',
                message: `Un preset chiamato "${newName}" esiste già.`
            });
            return;
        }

        // Se il cropper è attivo, salva le nuove coordinate
        if (presetManagerCropper) {
            const newRect = {
                x: presetManagerCropper.cropArea.x / presetManagerCropper.canvas.width,
                y: presetManagerCropper.cropArea.y / presetManagerCropper.canvas.height,
                width: presetManagerCropper.cropArea.width / presetManagerCropper.canvas.width,
                height: presetManagerCropper.cropArea.height / presetManagerCropper.canvas.height
            };
            presets[presetIndex].rect = newRect;
        }

        presets[presetIndex].name = newName;
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));

        // Aggiorna lo stato e la UI
        currentlyEditingPreset = newName;
        renderPresetManagerList();
        populatePresetsDropdown(); // Aggiorna anche il dropdown nel modale principale
        showCustomDialog({
            title: 'Preset Aggiornato',
            message: "Preset aggiornato con successo!"
        });

        if (presetManagerCropper) {
            presetManagerCropper.destroy();
            presetManagerCropper = null;
        }
        showPresetDetails(newName); // Ricarica i dettagli
    }

    const deletePresetFromManager = () => {
        if (!currentlyEditingPreset) return;

        showCustomDialog({
            type: 'confirm',
            title: 'Elimina Preset',
            message: `Sei sicuro di voler eliminare il preset "${currentlyEditingPreset}"?`
        }).then(confirmed => {
            if (confirmed) {
                let presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
                presets = presets.filter(p => p.name !== currentlyEditingPreset);
                localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));

                // Resetta la UI
                currentlyEditingPreset = null;
                presetManagerDetailsView.style.display = 'none';
                presetManagerPlaceholder.style.display = 'block';
                renderPresetManagerList();
                populatePresetsDropdown();
                showCustomDialog({
                    title: 'Preset Eliminato',
                    message: "Preset eliminato."
                });
            }
        });
    };

    function adjustPresetCrop() {
        if (!currentlyEditingPreset) return;
        if (presetManagerCropper) {
            presetManagerCropper.destroy();
            presetManagerCropper = null;
        }

        const presets = JSON.parse(localStorage.getItem(PRESETS_STORAGE_KEY)) || [];
        const preset = presets.find(p => p.name === currentlyEditingPreset);
        if (!preset) return;

        presetManagerCropper = new CropCanvas(presetOriginalImage, {
            aspectRatio: null,
            minWidth: 20,
            minHeight: 20,
            // Pre-imposta l'area di ritaglio basata sul preset
            initialCrop: {
                x: preset.rect.x * presetOriginalImage.naturalWidth,
                y: preset.rect.y * presetOriginalImage.naturalHeight,
                width: preset.rect.width * presetOriginalImage.naturalWidth,
                height: preset.rect.height * presetOriginalImage.naturalHeight
            },
            // Callback per aggiornare l'anteprima in tempo reale
            onCropChange: async () => {
                if (presetManagerCropper) {
                    const newRect = {
                        x: presetManagerCropper.cropArea.x / presetManagerCropper.canvas.width,
                        y: presetManagerCropper.cropArea.y / presetManagerCropper.canvas.height,
                        width: presetManagerCropper.cropArea.width / presetManagerCropper.canvas.width,
                        height: presetManagerCropper.cropArea.height / presetManagerCropper.canvas.height
                    };
                    try {
                        const sourceImageUrl = preset.imageUrl || placeholderImageUrl;
                        const croppedUrl = await applyCropToImage(sourceImageUrl, newRect);
                        presetCroppedImage.src = croppedUrl;
                    } catch (error) {
                        console.error("Errore aggiornamento anteprima ritaglio:", error);
                    }
                }
            }
        });
    }

    // Listeners per il Preset Manager
    presetManagerButton.addEventListener('click', openPresetManager);
    presetManagerClose.addEventListener('click', closePresetManager);
    presetManagerModal.addEventListener('click', (e) => { if (e.target === presetManagerModal) closePresetManager(); });
    presetManagerSaveButton.addEventListener('click', savePresetChanges);
    presetManagerDeleteButton.addEventListener('click', deletePresetFromManager);
    presetManagerAdjustButton.addEventListener('click', adjustPresetCrop);

    // Listener per il pulsante Anteprima Excel
    const excelPreviewButton = document.getElementById('excelPreviewButton');
    if (excelPreviewButton) {
        excelPreviewButton.addEventListener('click', () => {
            if (workbook && originalSourceData.length > 0) {
                openFullscreenPreview();
            } else {
                showCustomDialog({
                    title: 'Nessun File Excel',
                    message: 'Carica prima un file Excel per visualizzare l\'anteprima.'
                });
            }
        });
    }

    // --- FINE NUOVA SEZIONE: LOGICA PRESET MANAGER ---

    const init = () => {
        document.querySelectorAll('#filter-buttons-container .filter-btn').forEach(button => {
            button.addEventListener('click', () => {
                document.querySelector('#filter-buttons-container .filter-btn.active').classList.remove('active');
                button.classList.add('active');
                activeFilter = button.dataset.filter;

                // Resetta il filtro di categoria quando si cambia il filtro principale
                activeCategoryFilter = 'all';

                refreshScreenshotsView();
            });
        });

        // NOTA: I listener per i pulsanti di categoria ora vengono aggiunti dinamicamente in renderCategoryFilters

        refreshScreenshotsView();
        updateStartButtonState();
        populatePresetsDropdown();
        renderCropLog();

        // MODIFICA 1: Listener per import/export preset
        exportPresetsButton.addEventListener('click', exportPresets);
        importPresetsInput.addEventListener('change', importPresets);



        chrome.storage.local.get('capturedScreenshots', (result) => {
            if (result.capturedScreenshots && result.capturedScreenshots.length > 0) {
                statusDiv.textContent = `Sessione precedente caricata con ${result.capturedScreenshots.length} elementi.`;
            }
        });
    };



    // --- SEZIONE BENCHMARK STRATEGICO MULTIPLO ---
    const benchmarkModal = document.getElementById('benchmark-modal');
    const closeBenchmarkModal = document.getElementById('close-benchmark-modal');
    const benchmarkSelectA = document.getElementById('benchmark-brand-a');
    const benchmarkSelectB = document.getElementById('benchmark-brand-b');
    const addPairBtn = document.getElementById('addBenchmarkPairBtn');
    const queueListContainer = document.getElementById('benchmark-queue-list');
    const confirmBenchmarkBtn = document.getElementById('confirmBenchmarkBtn');

    let benchmarkQueue = []; // Memorizza le coppie {a, b}

    // Aggiorna l'interfaccia della lista nel modale
    const updateBenchmarkUI = () => {
        queueListContainer.innerHTML = '';
        if (benchmarkQueue.length === 0) {
            queueListContainer.innerHTML = '<p style="color: #666; font-size: 0.8rem; text-align: center; margin: 10px 0;">Nessun confronto aggiunto</p>';
            confirmBenchmarkBtn.style.display = 'none';
            return;
        }

        benchmarkQueue.forEach((pair, index) => {
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(229,0,0,0.08); padding: 8px 12px; border-radius: 6px; border-left: 4px solid var(--havas-red); font-size: 0.85rem; border-top: 1px solid rgba(0,0,0,0.05); border-bottom: 1px solid rgba(0,0,0,0.05);';
            item.innerHTML = `
                <span style="font-weight: 600; color: var(--text-primary);">${pair.a.toUpperCase()} <span style="color: var(--havas-red); margin: 0 5px;">VS</span> ${pair.b.toUpperCase()}</span>
                <button data-index="${index}" class="delete-pair" style="background: none; border: none; color: #ff4444; cursor: pointer; font-size: 11px; font-weight: bold; text-transform: uppercase;">Rimuovi</button>
            `;
            queueListContainer.appendChild(item);
        });

        // Gestione eliminazione riga
        queueListContainer.querySelectorAll('.delete-pair').forEach(btn => {
            btn.onclick = (e) => {
                benchmarkQueue.splice(parseInt(e.target.dataset.index), 1);
                updateBenchmarkUI();
            };
        });

        confirmBenchmarkBtn.style.display = 'flex';
        confirmBenchmarkBtn.innerHTML = `<img src="https://img.icons8.com/color/48/microsoft-powerpoint-2019.png" width="20" style="margin-right:10px;"> GENERA PPT CON ${benchmarkQueue.length} CONFRONTI`;
    };

    // Apertura modale
    if (generateBenchmarkButton) {
        generateBenchmarkButton.addEventListener('click', () => {
            const uniqueBrands = [...new Set(currentScreenshots.map(s => s.brandName).filter(Boolean))].sort();
            if (uniqueBrands.length < 2) {
                showCustomDialog({ title: 'Dati Insufficienti', message: 'Devi avere almeno 2 brand diversi negli screenshot.' });
                return;
            }
            const optionsHtml = uniqueBrands.map(b => `<option value="${b}">${b.toUpperCase()}</option>`).join('');
            benchmarkSelectA.innerHTML = optionsHtml;
            benchmarkSelectB.innerHTML = optionsHtml;
            if (benchmarkSelectB.options[1]) benchmarkSelectB.selectedIndex = 1;

            benchmarkQueue = []; // Svuota coda all'apertura
            updateBenchmarkUI();
            benchmarkModal.style.display = 'flex';
        });
    }

    // Aggiunta coppia alla coda
    if (addPairBtn) {
        addPairBtn.onclick = () => {
            const a = benchmarkSelectA.value;
            const b = benchmarkSelectB.value;
            if (a === b) {
                showCustomDialog({ title: 'Errore', message: 'Seleziona due brand diversi.' });
                return;
            }
            // Evita duplicati identici o invertiti
            if (benchmarkQueue.some(p => (p.a === a && p.b === b) || (p.a === b && p.b === a))) {
                showCustomDialog({ title: 'Duplicato', message: 'Questo confronto esiste già.' });
                return;
            }
            benchmarkQueue.push({ a, b });
            updateBenchmarkUI();
        };
    }

    if (closeBenchmarkModal) closeBenchmarkModal.addEventListener('click', () => benchmarkModal.style.display = 'none');

    // Generazione Finale PPT
    if (confirmBenchmarkBtn) {
        confirmBenchmarkBtn.addEventListener('click', async () => {
            benchmarkModal.style.display = 'none';
            statusDiv.textContent = `Creazione Report Strategico (${benchmarkQueue.length} slide)...`;

            try {
                const pptx = new PptxGenJS();
                pptx.layout = 'LAYOUT_WIDE';

                for (const pair of benchmarkQueue) {
                    const slide = pptx.addSlide();
                    const shotsA = currentScreenshots.filter(s => s.brandName === pair.a).slice(0, 3);
                    const shotsB = currentScreenshots.filter(s => s.brandName === pair.b).slice(0, 3);

                    // Header slide
                    slide.addText('STRATEGIC COMPETITOR BENCHMARK', { x: 0.5, y: 0.2, w: 12.3, h: 0.4, fontSize: 22, bold: true, color: 'E50000', align: 'center' });
                    slide.addShape(pptx.ShapeType.line, { x: 6.66, y: 0.8, w: 0, h: 6.5, line: { color: 'E50000', width: 2 } });

                    const config = [{ name: pair.a, shots: shotsA, startX: 0.3 }, { name: pair.b, shots: shotsB, startX: 6.9 }];

                    config.forEach(side => {
                        // Nome Brand
                        slide.addText(side.name.toUpperCase(), { x: side.startX, y: 0.8, w: 6.1, h: 0.4, fontSize: 18, bold: true, color: '333333', align: 'center' });

                        // Followers (dal primo shot)
                        const firstShot = side.shots[0];
                        if (firstShot && firstShot.followers) {
                            slide.addText(`Audience: ${firstShot.followers}`, { x: side.startX, y: 1.1, w: 6.1, h: 0.3, fontSize: 11, color: '666666', align: 'center' });
                        }

                        // Rendering dei 3 post
                        side.shots.forEach((shot, index) => {
                            const rowY = 1.6 + (index * 1.9);
                            const imgUrl = shot.isGroup ? shot.items[0].url : shot.url;

                            slide.addShape(pptx.ShapeType.rect, { x: side.startX, y: rowY, w: 6.1, h: 1.8, fill: { color: 'F4F4F4' } });
                            slide.addImage({ data: imgUrl, x: side.startX + 0.1, y: rowY + 0.1, w: 2.2, h: 1.6, sizing: { type: 'contain' } });

                            if (shot.metrics) {
                                const m = shot.metrics;
                                const metricText = `L: ${m.likes.toLocaleString()} | C: ${m.comments.toLocaleString()}`;
                                slide.addText(metricText, { x: side.startX + 2.4, y: rowY + 0.1, w: 3.5, h: 0.3, fontSize: 9, bold: true, color: 'FFFFFF', fill: { color: '333333' }, align: 'center' });
                            }

                            if (shot.caption) {
                                const cleanCap = separateCaptionAndHashtags(shot.caption, shot.category === 'Meta Ads Library').caption;
                                const shortCap = cleanCap.length > 135 ? cleanCap.substring(0, 135) + "..." : cleanCap;
                                slide.addText(shortCap, { x: side.startX + 2.4, y: rowY + 0.5, w: 3.5, h: 0.9, fontSize: 9, italic: true, color: '333333', align: 'left', verticalAlign: 'top' });
                            }

                            if (shot.date) {
                                slide.addText(`Data: ${shot.date}`, { x: side.startX + 2.4, y: rowY + 1.5, w: 3.5, h: 0.2, fontSize: 8, color: '999999', align: 'right' });
                            }
                        });

                        if (side.shots.length === 0) {
                            slide.addText("DATI NON DISPONIBILI", { x: side.startX, y: 3.5, w: 6.1, h: 1, fontSize: 14, color: 'CCCCCC', align: 'center' });
                        }
                    });
                }

                await pptx.writeFile({ fileName: `Strategic_Multi_Benchmark_${Date.now()}.pptx` });
                statusDiv.textContent = 'Report Multi-Benchmark scaricato!';
            } catch (err) {
                console.error(err);
                statusDiv.textContent = 'Errore creazione Benchmark';
            }
        });
    }

    init();

    // --- INIZIO NUOVA SEZIONE: GESTIONE LISTE PROFILI INSTAGRAM ---

    const profileListManagerButton = document.getElementById('profileListManagerButton');
    const profileListModal = document.getElementById('profile-list-manager-modal');
    const closeProfileListModal = document.getElementById('profile-list-manager-close');
    const profileListBody = document.getElementById('profile-list-body');
    const addProfileForm = document.getElementById('add-profile-form');
    const profileNameInput = document.getElementById('profile-name');
    const profileUrlInput = document.getElementById('profile-url');
    const profilePlatformInput = document.getElementById('profile-platform');
    const profileFormTitle = document.getElementById('profile-form-title');
    const addProfileBtn = document.getElementById('add-profile-btn');
    const cancelEditProfileBtn = document.getElementById('cancel-edit-profile-btn');
    const importProfileListInput = document.getElementById('importProfileListInput');
    const exportProfileListButton = document.getElementById('exportProfileListButton');
    const addAllProfilesToQueueButton = document.getElementById('addAllProfilesToQueueButton');
    const marketListSelector = document.getElementById('marketListSelector');
    const addMarketListBtn = document.getElementById('addMarketListBtn');
    const renameMarketListBtn = document.getElementById('renameMarketListBtn');
    const deleteMarketListBtn = document.getElementById('deleteMarketListBtn');

    const MARKET_STORAGE_KEY = 'marketLists_v2';
    let currentlyEditingProfileId = null;
    let currentMarketListId = null;

    // ---- Struttura dati: { lists: [ { id, name, profiles: [{id, name, url, platform}] } ] }
    const getMarketData = () => JSON.parse(localStorage.getItem(MARKET_STORAGE_KEY)) || { lists: [] };
    const saveMarketData = (data) => localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify(data));

    // ---- Migrazione dati vecchi (array piatto) al nuovo formato multi-lista
    const migrateOldData = () => {
        const old = localStorage.getItem('instagramProfileLists');
        if (old && !localStorage.getItem(MARKET_STORAGE_KEY)) {
            try {
                const profiles = JSON.parse(old) || [];
                if (profiles.length > 0) {
                    const data = { lists: [{ id: Date.now().toString(), name: 'Lista Principale', profiles: profiles.map(p => ({ ...p, platform: detectPlatform(p.url) })) }] };
                    saveMarketData(data);
                    currentMarketListId = data.lists[0].id;
                }
            } catch (e) { /* ignora */ }
        }
    };

    // ---- Estrazione automatica piattaforma dall'URL
    const detectPlatform = (url) => {
        if (!url) return 'Sconosciuta';
        try {
            const hostname = new URL(url).hostname.toLowerCase().replace('www.', '');
            const platforms = {
                'instagram.com': 'Instagram',
                'facebook.com': 'Facebook',
                'tiktok.com': 'TikTok',
                'twitter.com': 'Twitter/X',
                'x.com': 'Twitter/X',
                'youtube.com': 'YouTube',
                'linkedin.com': 'LinkedIn',
                'pinterest.com': 'Pinterest',
                'snapchat.com': 'Snapchat',
                'threads.net': 'Threads',
            };
            for (const [domain, name] of Object.entries(platforms)) {
                if (hostname.includes(domain)) return name;
            }
            return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
        } catch (e) { return 'Sconosciuta'; }
    };

    // ---- Logo SVG/emoji per piattaforma
    const getPlatformLogo = (platform) => {
        const logos = {
            'Instagram': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="ig_grad" cx="30%" cy="107%" r="150%"><stop offset="0%" stop-color="#fdf497"/><stop offset="5%" stop-color="#fdf497"/><stop offset="45%" stop-color="#fd5949"/><stop offset="60%" stop-color="#d6249f"/><stop offset="90%" stop-color="#285AEB"/></radialGradient></defs><rect width="24" height="24" rx="6" fill="url(#ig_grad)"/><circle cx="12" cy="12" r="4.5" stroke="white" stroke-width="1.8" fill="none"/><circle cx="17.5" cy="6.5" r="1.2" fill="white"/></svg>`,
            'Facebook': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#1877F2"/><path d="M15.5 8H13.5C13.2 8 13 8.2 13 8.5V10H15.5L15.1 12.5H13V19H10.5V12.5H9V10H10.5V8.5C10.5 6.6 11.6 5.5 13.5 5.5H15.5V8Z" fill="white"/></svg>`,
            'TikTok': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#010101"/><path d="M17 8.5C16.1 8.5 15.3 8.1 14.8 7.5V15C14.8 16.9 13.3 18.5 11.4 18.5C9.5 18.5 8 16.9 8 15C8 13.1 9.5 11.5 11.4 11.5C11.6 11.5 11.8 11.5 12 11.6V13.6C11.8 13.5 11.6 13.5 11.4 13.5C10.6 13.5 10 14.2 10 15C10 15.8 10.6 16.5 11.4 16.5C12.2 16.5 12.8 15.8 12.8 15V5.5H14.8C15 6.7 15.9 7.7 17 7.9V8.5Z" fill="white"/></svg>`,
            'Twitter/X': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#000"/><path d="M17.5 6H15.2L12 10.1L9.2 6H6L10.7 12.3L6.2 18H8.5L12 13.6L15.1 18H18L13.1 11.5L17.5 6Z" fill="white"/></svg>`,
            'YouTube': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#FF0000"/><path d="M19.6 8.4C19.4 7.6 18.8 7 18 6.8C16.5 6.5 12 6.5 12 6.5C12 6.5 7.5 6.5 6 6.8C5.2 7 4.6 7.6 4.4 8.4C4.1 9.9 4.1 12 4.1 12C4.1 12 4.1 14.1 4.4 15.6C4.6 16.4 5.2 17 6 17.2C7.5 17.5 12 17.5 12 17.5C12 17.5 16.5 17.5 18 17.2C18.8 17 19.4 16.4 19.6 15.6C19.9 14.1 19.9 12 19.9 12C19.9 12 19.9 9.9 19.6 8.4ZM10.3 14.3V9.7L14.9 12L10.3 14.3Z" fill="white"/></svg>`,
            'LinkedIn': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#0A66C2"/><path d="M7.5 10H9.5V17H7.5V10ZM8.5 9C7.9 9 7.5 8.6 7.5 8C7.5 7.4 7.9 7 8.5 7C9.1 7 9.5 7.4 9.5 8C9.5 8.6 9.1 9 8.5 9ZM11 10H12.9V11C13.3 10.4 14 10 15 10C16.7 10 17.5 11 17.5 12.9V17H15.5V13.2C15.5 12.3 15.2 11.8 14.4 11.8C13.6 11.8 13 12.3 13 13.3V17H11V10Z" fill="white"/></svg>`,
            'Pinterest': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#E60023"/><path d="M12 5C8.7 5 6 7.7 6 11C6 13.5 7.5 15.6 9.6 16.5C9.6 16 9.6 15.3 9.8 14.7L10.9 10.1C10.9 10.1 10.6 9.5 10.6 8.6C10.6 7.2 11.4 6.2 12.4 6.2C13.2 6.2 13.6 6.8 13.6 7.6C13.6 8.5 13 9.8 12.7 11C12.5 12 13.2 12.8 14.2 12.8C16 12.8 17 10.9 17 8.5C17 6.5 15.6 5 12.1 5H12ZM11.6 18.9C10.8 18.9 10.1 18.7 9.5 18.4L9 20.3C8.7 21.3 8 22.4 7.6 23C9 23.3 10.5 23.3 12 23C16.4 22 19 17.5 19 13C19 12.3 18.9 11.6 18.7 11C18 15.5 15.2 18.9 11.6 18.9Z" fill="white"/></svg>`,
            'Threads': `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#000"/><path d="M15.7 11.3C15.6 11.2 15.4 11.1 15.3 11.1C15.1 9.3 14 8.3 12.3 8.3C11.3 8.3 10.4 8.7 9.9 9.5L10.8 10.1C11.2 9.5 11.7 9.3 12.3 9.3C13.3 9.3 13.9 9.9 14 11C13.5 10.9 13 10.9 12.4 10.9C10.4 10.9 9.2 11.9 9.2 13.4C9.2 14.9 10.5 15.8 12 15.8C13.7 15.8 14.9 14.8 15.1 13.2C15.4 13.6 15.5 14.1 15.5 14.7C15.5 16.6 13.9 17.9 12 17.9C9.5 17.9 7.5 15.9 7.5 12C7.5 8.1 9.5 6 12 6C14.2 6 15.7 7.3 16.3 9.2L17.4 8.9C16.6 6.5 14.6 5 12 5C8.9 5 6.5 7.5 6.5 12C6.5 16.5 8.9 19 12 19C14.5 19 16.5 17.2 16.5 14.7C16.5 13.4 16.2 12.4 15.7 11.3ZM12.4 14.8C11.4 14.8 10.2 14.4 10.2 13.4C10.2 12.5 11 12 12.4 12C13 12 13.5 12.1 14 12.2C13.9 13.8 13.3 14.8 12.4 14.8Z" fill="white"/></svg>`,
        };
        return logos[platform] || `<span style="font-size:18px;">🌐</span>`;
    };

    // ---- Render del selector liste
    const renderMarketListSelector = () => {
        const data = getMarketData();
        marketListSelector.innerHTML = '';
        if (data.lists.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '— Nessuna lista —';
            marketListSelector.appendChild(opt);
            currentMarketListId = null;
        } else {
            data.lists.forEach(list => {
                const opt = document.createElement('option');
                opt.value = list.id;
                opt.textContent = list.name;
                marketListSelector.appendChild(opt);
            });
            // Mantieni la selezione corrente se esiste ancora
            if (currentMarketListId && data.lists.find(l => l.id === currentMarketListId)) {
                marketListSelector.value = currentMarketListId;
            } else {
                currentMarketListId = data.lists[0].id;
                marketListSelector.value = currentMarketListId;
            }
        }
        renderProfileList();
    };

    // ---- Render tabella profili della lista corrente
    const renderProfileList = () => {
        profileListBody.innerHTML = '';
        const data = getMarketData();
        const currentList = data.lists.find(l => l.id === currentMarketListId);
        if (!currentList || currentList.profiles.length === 0) {
            profileListBody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#888;">Nessun profilo in questa lista. Aggiungine uno usando il form qui sotto.</td></tr>';
            return;
        }
        currentList.profiles.forEach(profile => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding:8px; border-bottom:1px solid var(--border-color); text-align:center;" title="${profile.platform || ''}">${getPlatformLogo(profile.platform || detectPlatform(profile.url))}</td>
                <td style="padding:8px; border-bottom:1px solid var(--border-color); color:var(--text-primary);">${profile.name}</td>
                <td style="padding:8px; border-bottom:1px solid var(--border-color); color:var(--text-secondary); font-size:0.85rem; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${profile.url}">${profile.url}</td>
                <td style="padding:8px; border-bottom:1px solid var(--border-color); text-align:center;">
                    <button class="edit-btn" data-id="${profile.id}" style="font-size:11px; padding:3px 8px; cursor:pointer; border-radius:4px; border:1px solid var(--border-color); background:transparent; color:var(--text-primary); margin-right:4px;">✏️</button>
                    <button class="delete-btn" data-id="${profile.id}" style="font-size:11px; padding:3px 8px; cursor:pointer; border-radius:4px; border:none; background:#c00; color:white;">🗑</button>
                </td>
            `;
            profileListBody.appendChild(row);
        });
    };

    // ---- Aggiornamento automatico piattaforma al digitare l'URL
    profileUrlInput.addEventListener('input', () => {
        profilePlatformInput.value = detectPlatform(profileUrlInput.value.trim());
    });

    // ---- Submit form aggiungi/modifica profilo
    const handleProfileFormSubmit = (e) => {
        e.preventDefault();
        const name = profileNameInput.value.trim();
        const url = profileUrlInput.value.trim();
        const platform = detectPlatform(url);

        if (!name || !url.startsWith('http')) {
            showCustomDialog({ title: 'Errore Validazione', message: 'Inserisci un nome valido e un URL corretto.' });
            return;
        }
        if (!currentMarketListId) {
            showCustomDialog({ title: 'Nessuna Lista', message: 'Crea prima una lista prima di aggiungere profili.' });
            return;
        }

        const data = getMarketData();
        const listIndex = data.lists.findIndex(l => l.id === currentMarketListId);
        if (listIndex === -1) return;

        if (currentlyEditingProfileId) {
            const pIndex = data.lists[listIndex].profiles.findIndex(p => p.id === currentlyEditingProfileId);
            if (pIndex > -1) data.lists[listIndex].profiles[pIndex] = { ...data.lists[listIndex].profiles[pIndex], name, url, platform };
        } else {
            data.lists[listIndex].profiles.push({ id: Date.now().toString(), name, url, platform });
        }

        saveMarketData(data);
        resetProfileForm();
        renderProfileList();
    };

    const startEditingProfile = (id) => {
        const data = getMarketData();
        const currentList = data.lists.find(l => l.id === currentMarketListId);
        if (!currentList) return;
        const profile = currentList.profiles.find(p => p.id === id);
        if (profile) {
            currentlyEditingProfileId = id;
            profileNameInput.value = profile.name;
            profileUrlInput.value = profile.url;
            profilePlatformInput.value = profile.platform || detectPlatform(profile.url);
            addProfileBtn.textContent = 'Aggiorna';
            cancelEditProfileBtn.style.display = '';
            profileNameInput.focus();
        }
    };

    const deleteProfile = (id) => {
        showCustomDialog({ type: 'confirm', title: 'Elimina Profilo', message: 'Sei sicuro di voler eliminare questo profilo?' })
            .then(confirmed => {
                if (!confirmed) return;
                const data = getMarketData();
                const listIndex = data.lists.findIndex(l => l.id === currentMarketListId);
                if (listIndex === -1) return;
                data.lists[listIndex].profiles = data.lists[listIndex].profiles.filter(p => p.id !== id);
                saveMarketData(data);
                renderProfileList();
            });
    };

    const resetProfileForm = () => {
        currentlyEditingProfileId = null;
        addProfileForm.reset();
        profilePlatformInput.value = '';
        addProfileBtn.textContent = 'Aggiungi';
        cancelEditProfileBtn.style.display = 'none';
    };

    const openProfileListManager = () => {
        migrateOldData();
        renderMarketListSelector();
        profileListModal.style.display = 'flex';
    };

    const closeProfileListManager = () => {
        resetProfileForm();
        profileListModal.style.display = 'none';
    };

    // ---- Gestione multi-lista
    addMarketListBtn.addEventListener('click', () => {
        showCustomDialog({ type: 'prompt', title: 'Nuova Lista', message: 'Nome della nuova lista:' })
            .then(name => {
                if (!name || !name.trim()) return;
                const data = getMarketData();
                const newList = { id: Date.now().toString(), name: name.trim(), profiles: [] };
                data.lists.push(newList);
                saveMarketData(data);
                currentMarketListId = newList.id;
                renderMarketListSelector();
            });
    });

    renameMarketListBtn.addEventListener('click', () => {
        if (!currentMarketListId) return;
        const data = getMarketData();
        const list = data.lists.find(l => l.id === currentMarketListId);
        if (!list) return;
        showCustomDialog({ type: 'prompt', title: 'Rinomina Lista', message: 'Nuovo nome:', defaultValue: list.name })
            .then(newName => {
                if (!newName || !newName.trim()) return;
                list.name = newName.trim();
                saveMarketData(data);
                renderMarketListSelector();
            });
    });

    deleteMarketListBtn.addEventListener('click', () => {
        if (!currentMarketListId) return;
        const data = getMarketData();
        const list = data.lists.find(l => l.id === currentMarketListId);
        if (!list) return;
        showCustomDialog({ type: 'confirm', title: 'Elimina Lista', message: `Eliminare la lista "${list.name}" e tutti i suoi profili?` })
            .then(confirmed => {
                if (!confirmed) return;
                data.lists = data.lists.filter(l => l.id !== currentMarketListId);
                saveMarketData(data);
                currentMarketListId = data.lists.length > 0 ? data.lists[0].id : null;
                renderMarketListSelector();
            });
    });

    marketListSelector.addEventListener('change', () => {
        currentMarketListId = marketListSelector.value;
        renderProfileList();
    });

    cancelEditProfileBtn.addEventListener('click', resetProfileForm);

    // ---- Import
    const handleImportProfileList = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (!currentMarketListId) {
            showCustomDialog({ title: 'Nessuna Lista', message: 'Crea prima una lista prima di importare.' });
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data_xlsx = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data_xlsx, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);
                if (json.length === 0) { showCustomDialog({ title: 'File Vuoto', message: 'Il file è vuoto.' }); return; }
                const firstRow = json[0];
                if (!firstRow.hasOwnProperty('Nome') || !firstRow.hasOwnProperty('URL')) {
                    throw new Error("Colonne 'Nome' e 'URL' non trovate.");
                }
                const data = getMarketData();
                const listIndex = data.lists.findIndex(l => l.id === currentMarketListId);
                let importedCount = 0, skippedCount = 0;
                json.forEach(row => {
                    const name = row.Nome;
                    const url = row.URL;
                    if (name && url && typeof url === 'string' && url.startsWith('http')) {
                        data.lists[listIndex].profiles.push({ id: Date.now().toString() + importedCount, name: String(name), url, platform: detectPlatform(url) });
                        importedCount++;
                    } else { skippedCount++; }
                });
                saveMarketData(data);
                renderProfileList();
                showCustomDialog({ title: 'Importazione Completata', message: `${importedCount} profili importati.${skippedCount > 0 ? ` ${skippedCount} righe ignorate.` : ''}` });
            } catch (error) {
                showCustomDialog({ title: 'Errore Importazione', message: error.message });
            } finally { importProfileListInput.value = ''; }
        };
        reader.readAsArrayBuffer(file);
    };

    // ---- Export
    const handleExportProfileList = () => {
        if (!currentMarketListId) return;
        const data = getMarketData();
        const list = data.lists.find(l => l.id === currentMarketListId);
        if (!list || list.profiles.length === 0) { showCustomDialog({ title: 'Lista Vuota', message: 'Nessun profilo da esportare.' }); return; }
        const dataForSheet = list.profiles.map(p => ({ Nome: p.name, URL: p.url, Piattaforma: p.platform || detectPlatform(p.url) }));
        const worksheet = XLSX.utils.json_to_sheet(dataForSheet);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, list.name.substring(0, 31));
        XLSX.writeFile(workbook, `lista_${list.name.replace(/\s+/g, '_')}.xlsx`);
    };

    // ---- Aggiungi tutti alla coda
    const handleAddAllToQueue = () => {
        if (!currentMarketListId) return;
        const data = getMarketData();
        const list = data.lists.find(l => l.id === currentMarketListId);
        if (!list || list.profiles.length === 0) { showCustomDialog({ title: 'Lista Vuota', message: 'La lista è vuota.' }); return; }
        const urls = list.profiles.map(p => p.url).join('\n');
        const existingText = textUrlsInput.value.trim();
        textUrlsInput.value = existingText ? `${existingText}\n${urls}` : urls;
        updateStartButtonState();
        closeProfileListManager();
        showCustomDialog({ title: 'Coda Aggiornata', message: `${list.profiles.length} profili aggiunti all'area di testo.` });
    };

    // Listeners del Gestore Liste
    profileListManagerButton.addEventListener('click', openProfileListManager);
    closeProfileListModal.addEventListener('click', closeProfileListManager);
    profileListModal.addEventListener('click', (e) => { if (e.target === profileListModal) closeProfileListManager(); });
    addProfileForm.addEventListener('submit', handleProfileFormSubmit);
    importProfileListInput.addEventListener('change', handleImportProfileList);
    exportProfileListButton.addEventListener('click', handleExportProfileList);
    addAllProfilesToQueueButton.addEventListener('click', handleAddAllToQueue);

    profileListBody.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-btn')) startEditingProfile(e.target.dataset.id);
        else if (e.target.classList.contains('delete-btn')) deleteProfile(e.target.dataset.id);
    });

    // --- FINE NUOVA SEZIONE: GESTIONE LISTE PROFILI INSTAGRAM ---

    // --- INIZIO NUOVA SEZIONE: ANALISI AI & NOTIFICHE ---

    // Funzione Banner Notifica
    const notificationBanner = document.getElementById('notificationBanner');
    const notificationText = document.getElementById('notificationText');
    let notificationTimeout;

    const showNotification = (message) => {
        notificationText.textContent = message;
        notificationBanner.style.display = 'flex';

        if (notificationTimeout) clearTimeout(notificationTimeout);

        notificationTimeout = setTimeout(() => {
            notificationBanner.style.display = 'none';
        }, 3000);
    };

    // Riferimenti UI Analisi AI
    const pdfHistoryButton = document.getElementById('pdfHistoryButton'); // Rinomina ID
    const aiAnalysisModal = document.getElementById('aiAnalysisModal');
    const aiAnalysisClose = document.getElementById('aiAnalysisClose');
    const pdfList = document.getElementById('pdfList');
    const pdfSearchInput = document.getElementById('pdfSearchInput');
    const pdfPreviewFrame = document.getElementById('pdfPreviewFrame');
    const pdfPreviewPlaceholder = document.getElementById('pdfPreviewPlaceholder');

    // Elementi Sidebar AI
    const aiPdfSelect = document.getElementById('aiPdfSelect');
    const runAiAnalysisButton = document.getElementById('runAiAnalysisButton');
    const aiAnalysisResults = document.getElementById('aiAnalysisResults');
    const aiOutputText = document.getElementById('aiOutputText');

    let storedPdfs = [];

    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const renderPdfList = (filter = "") => {
        pdfList.innerHTML = '';
        const filtered = storedPdfs.filter(pdf => pdf.name.toLowerCase().includes(filter.toLowerCase())).reverse(); // Più recenti prima

        if (filtered.length === 0) {
            pdfList.innerHTML = '<li style="padding: 10px; color: #888;">Nessun PDF trovato.</li>';
            return;
        }

        filtered.forEach(pdf => {
            const li = document.createElement('li');
            li.style.cssText = "padding: 10px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; justify-content: space-between; align-items: center;";
            // MODIFICA: Layout flex per evitare che il testo sparisca + Icone pulsanti
            li.innerHTML = `
                <div style="flex: 1; min-width: 0; margin-right: 10px;">
                    <div style="font-weight: bold; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">${pdf.name}</div>
                    <div style="font-size: 11px; color: #666;">${new Date(pdf.date).toLocaleString()} - ${formatBytes(pdf.size)}</div>
                </div>
                <div style="display: flex; gap: 5px; flex-shrink: 0;">
                    <button class="action-btn download-btn" title="Scarica" style="border: none; background: none; cursor: pointer;">
                        <!-- Save Icon: Blue -->
                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16px' height='16px' fill='%232196F3'><path d='M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z'/></svg>" width="16" height="16" alt="Save">
                    </button>
                    <button class="action-btn rename-btn" title="Rinomina" style="border: none; background: none; cursor: pointer;">
                        <!-- Rename Icon: Orange -->
                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16px' height='16px' fill='%23FF9800'><path d='M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z'/></svg>" width="16" height="16" alt="Rename">
                    </button>
                    <button class="action-btn delete-btn" title="Elimina" style="border: none; background: none; cursor: pointer;">
                        <!-- Delete Icon: Red -->
                        <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='16px' height='16px' fill='%23F44336'><path d='M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z'/></svg>" width="16" height="16" alt="Delete">
                    </button>
                </div>
            `;

            // Click sulla riga per anteprima
            li.addEventListener('click', (e) => {
                if (e.target.closest('.action-btn')) return; // Ignora se click sui pulsanti

                // Reset visuale
                document.querySelectorAll('#pdfList li').forEach(el => el.style.backgroundColor = 'transparent');
                li.style.backgroundColor = '#e0f7fa';

                pdfPreviewPlaceholder.style.display = 'none';
                pdfPreviewFrame.style.display = 'block';

                // Converti data URL in Blob URL per compatibilità iframe
                try {
                    // Se è già un blob URL, usalo direttamente
                    if (pdf.data.startsWith('blob:')) {
                        pdfPreviewFrame.src = pdf.data;
                    } else {
                        // Converti data URL in Blob
                        const byteString = atob(pdf.data.split(',')[1]);
                        const mimeString = pdf.data.split(',')[0].split(':')[1].split(';')[0];
                        const ab = new ArrayBuffer(byteString.length);
                        const ia = new Uint8Array(ab);
                        for (let i = 0; i < byteString.length; i++) {
                            ia[i] = byteString.charCodeAt(i);
                        }
                        const blob = new Blob([ab], { type: mimeString });
                        const blobUrl = URL.createObjectURL(blob);
                        pdfPreviewFrame.src = blobUrl;

                        // Pulisci il vecchio blob URL quando viene caricato uno nuovo
                        pdfPreviewFrame.addEventListener('load', () => {
                            if (pdfPreviewFrame.dataset.oldBlobUrl) {
                                URL.revokeObjectURL(pdfPreviewFrame.dataset.oldBlobUrl);
                            }
                            pdfPreviewFrame.dataset.oldBlobUrl = blobUrl;
                        }, { once: true });
                    }
                } catch (error) {
                    console.error('Errore nel caricamento del PDF:', error);
                    pdfPreviewFrame.src = pdf.data; // Fallback al data URL originale
                }
            });

            // Gestione Download
            const downloadBtn = li.querySelector('.download-btn');
            downloadBtn.addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = pdf.data;
                a.download = pdf.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });

            // Gestione Rinomina
            const renameBtn = li.querySelector('.rename-btn');
            renameBtn.addEventListener('click', () => {
                showCustomDialog({
                    type: 'prompt',
                    title: 'Rinomina PDF',
                    message: "Inserisci il nuovo nome per il PDF:",
                    defaultValue: pdf.name
                }).then(newName => {
                    if (newName && newName.trim() !== "" && newName !== pdf.name) {
                        // Assicurati che abbia .pdf
                        const finalName = newName.toLowerCase().endsWith('.pdf') ? newName : newName + '.pdf';
                        chrome.runtime.sendMessage({ action: 'renamePDF', id: pdf.id, newName: finalName }, () => {
                            loadPdfs();
                        });
                    }
                });
            });

            // Gestione Elimina
            const deleteBtn = li.querySelector('.delete-btn');
            deleteBtn.addEventListener('click', () => {
                showCustomDialog({
                    type: 'confirm',
                    title: 'Elimina PDF',
                    message: `Eliminare "${pdf.name}"?`
                }).then(confirmed => {
                    if (confirmed) {
                        chrome.runtime.sendMessage({ action: 'deletePDF', id: pdf.id }, () => {
                            loadPdfs(); // Ricarica la lista (che aggiornerà anche la select)
                            if (pdfPreviewFrame.src === pdf.data) {
                                pdfPreviewFrame.style.display = 'none';
                                pdfPreviewPlaceholder.style.display = 'block';
                            }
                        });
                    }
                });
            });

            pdfList.appendChild(li);
        });
    };

    const populatePdfSelect = () => { // ... (unchanged)
        const currentSelection = aiPdfSelect.value;
        aiPdfSelect.innerHTML = '<option value="">-- Seleziona PDF --</option>';
        storedPdfs.forEach(pdf => {
            const option = document.createElement('option');
            option.value = pdf.id;
            option.textContent = pdf.name;
            if (pdf.id.toString() === currentSelection) option.selected = true;
            aiPdfSelect.appendChild(option);
        });
    };

    // ... (rest of pdf logic)



    const parseAiOutput = (text) => {
        // Cerca pattern: **[Brand]**: Commento
        // O semplicemente righe che iniziano con **[...]**
        const lines = text.split('\n');
        const rows = [['Brand', 'Commento']];

        // Regex flessibile: cerca qualcosa tra ** e ** (o [ ]) all'inizio, seguido da : o -
        const regex = /^\*\*\[?(.*?)\]?\*\*:?\s*(.*)/;

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                rows.push([match[1].trim(), match[2].trim()]);
            }
        });

        // Se la regex fallisce (es. formato diverso), scarica tutto come una riga o raw
        if (rows.length === 1 && text.length > 0) {
            rows.push(["Risultato Completo", text]);
        }
        return rows;
    };



    const loadPdfs = () => {
        chrome.runtime.sendMessage({ action: 'getPDFs' }, (response) => {
            if (response && response.pdfs) {
                storedPdfs = response.pdfs;
                renderPdfList(pdfSearchInput.value);
                populatePdfSelect(); // Aggiorna sidebar select
            }
        });
    };

    pdfHistoryButton.addEventListener('click', () => {
        aiAnalysisModal.style.display = 'flex';
        loadPdfs();
    });

    aiAnalysisClose.addEventListener('click', () => {
        aiAnalysisModal.style.display = 'none';
        // Pulisci il blob URL se esiste
        if (pdfPreviewFrame.dataset.oldBlobUrl) {
            URL.revokeObjectURL(pdfPreviewFrame.dataset.oldBlobUrl);
            delete pdfPreviewFrame.dataset.oldBlobUrl;
        }
        pdfPreviewFrame.src = 'about:blank'; // Pulisce iframe
        pdfPreviewFrame.style.display = 'none';
        pdfPreviewPlaceholder.style.display = 'block';
    });

    aiAnalysisModal.addEventListener('click', (e) => {
        if (e.target === aiAnalysisModal) aiAnalysisClose.click();
    });

    pdfSearchInput.addEventListener('input', (e) => {
        renderPdfList(e.target.value);
    });

    // --- LOGICA GEMINI AI (Apertura Chatbot Tutto Schermo) ---
    runAiAnalysisButton.addEventListener('click', () => {
        const selectedPdfId = aiPdfSelect.value;

        if (!selectedPdfId) {
            showCustomDialog({
                title: 'Selezione PDF',
                message: "Seleziona prima un PDF dalla lista."
            });
            return;
        }

        // 1. Chiudi la modale dello storico
        aiAnalysisModal.style.display = 'none';

        // Pulisci l'iframe di preview per risparmiare memoria
        pdfPreviewFrame.src = 'about:blank';
        pdfPreviewFrame.style.display = 'none';
        pdfPreviewPlaceholder.style.display = 'block';

        // 2. Apri la schermata Chatbot a tutto schermo
        const chatbotPanel = document.getElementById('aiChatbotPanel');
        const chatbotSelect = document.getElementById('aiChatbotPdfSelect');
        const chatbotInput = document.getElementById('aiChatbotPromptInput');

        if (chatbotPanel) {
            // Mostra il pannello AI a tutto schermo (animazione dal basso)
            chatbotPanel.classList.add('open');

            // Imposta il PDF che l'utente aveva appena selezionato nello storico
            if (chatbotSelect) {
                chatbotSelect.value = selectedPdfId;
            }

            // Dai il focus all'input del prompt (con un leggero ritardo per far finire l'animazione)
            if (chatbotInput) {
                setTimeout(() => {
                    chatbotInput.focus();
                }, 400);
            }

            statusDiv.textContent = "Chatbot AI aperto. Scegli un prompt rapido o scrivine uno nuovo.";
        }
    });

    // Inizializza caricando i PDF all'avvio per popolare la select
    loadPdfs();

    // =========================================================
    // --- INIZIO GESTIONE CRONOLOGIA PAGINE VISITATE ---
    // =========================================================
    const pageHistoryButton = document.getElementById('pageHistoryButton');
    const pageHistoryModal = document.getElementById('page-history-modal');
    const pageHistoryClose = document.getElementById('page-history-close');
    const pageHistoryBody = document.getElementById('page-history-body');
    const clearHistoryButton = document.getElementById('clearHistoryButton');
    const historySearchInput = document.getElementById('historySearchInput');

    let currentHistoryData = [];

    // Funzione di rendering della tabella
    const renderPageHistory = (filterText = '') => {
        if (!pageHistoryBody) return;
        pageHistoryBody.innerHTML = '';

        const filteredData = currentHistoryData.filter(entry =>
            entry.url.toLowerCase().includes(filterText.toLowerCase()) ||
            entry.platform.toLowerCase().includes(filterText.toLowerCase())
        );

        if (filteredData.length === 0) {
            pageHistoryBody.innerHTML = `
                <tr>
                    <td colspan="4" style="padding: 40px; text-align: center; color: var(--text-secondary);">
                        Nessuna pagina trovata nella cronologia.
                    </td>
                </tr>`;
            return;
        }

        filteredData.forEach(entry => {
            const dateObj = new Date(entry.timestamp);
            const dateStr = dateObj.toLocaleDateString('it-IT') + ' ' + dateObj.toLocaleTimeString('it-IT');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-size: 13px;">${dateStr}</td>
                <td style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-weight: bold; font-size: 13px;">${entry.platform}</td>
                <td style="padding: 12px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); font-size: 12px; word-break: break-all;">
                    <a href="${entry.url}" target="_blank" style="color: var(--havas-red); text-decoration: none;">${entry.url}</a>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid var(--border-color); text-align: center;">
                    <button class="sidebar-btn" style="width: auto; padding: 6px 12px; font-size: 11px; display: inline-block; margin: 0;">Apri</button>
                </td>
            `;

            // Listener per il bottone Apri
            tr.querySelector('button').addEventListener('click', () => {
                window.open(entry.url, '_blank');
            });

            pageHistoryBody.appendChild(tr);
        });
    };

    // Carica dati dal database
    const loadPageHistory = () => {
        chrome.runtime.sendMessage({ action: 'getPageHistory' }, (response) => {
            if (response && response.history) {
                currentHistoryData = response.history;
                renderPageHistory(historySearchInput ? historySearchInput.value : '');
            }
        });
    };

    // Event Listeners UI
    if (pageHistoryButton) {
        pageHistoryButton.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('open'); // Chiudi sidebar se aperta
            pageHistoryModal.style.display = 'flex';
            loadPageHistory();
        });
    }

    if (pageHistoryClose) {
        pageHistoryClose.addEventListener('click', () => {
            pageHistoryModal.style.display = 'none';
        });
    }

    if (pageHistoryModal) {
        pageHistoryModal.addEventListener('click', (e) => {
            if (e.target === pageHistoryModal) pageHistoryModal.style.display = 'none';
        });
    }

    if (historySearchInput) {
        historySearchInput.addEventListener('input', (e) => {
            renderPageHistory(e.target.value);
        });
    }

    if (clearHistoryButton) {
        clearHistoryButton.addEventListener('click', () => {
            showCustomDialog({
                type: 'confirm',
                title: 'Pulisci Cronologia',
                message: 'Sei sicuro di voler eliminare tutta la cronologia delle pagine visitate?'
            }).then(confirmed => {
                if (confirmed) {
                    chrome.runtime.sendMessage({ action: 'clearPageHistory' }, () => {
                        currentHistoryData = [];
                        renderPageHistory();
                        showNotification('Cronologia svuotata con successo');
                    });
                }
            });
        });
    }
    // =========================================================
    // --- FINE GESTIONE CRONOLOGIA PAGINE VISITATE ---
    // =========================================================


    // --- SIDEBAR TOGGLE LOGIC ---
    const toggleSidebar = () => {
        if (sidebar) sidebar.classList.toggle('open');
        if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
    };

    if (sidebarTrigger) sidebarTrigger.addEventListener('click', toggleSidebar);
    if (closeSidebar) closeSidebar.addEventListener('click', toggleSidebar);
    if (sidebarOverlay) sidebarOverlay.addEventListener('click', toggleSidebar);

    // --- THEME TOGGLE LOGIC ---
    const initTheme = () => {
        // Check for saved theme preference or default to 'dark'
        const savedTheme = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);
    };

    const updateThemeIcon = (theme) => {
        if (themeIcon) {
            if (theme === 'light') {
                // Sun icon for light mode
                themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
            } else {
                // Moon icon for dark mode
                themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
            }
        }
    };

    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeIcon(newTheme);
    };

    // Initialize theme on page load
    initTheme();

    // Add event listener for theme toggle
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // --- AI PANEL TOGGLE LOGIC ---
    if (aiPanelToggle && aiPanelSection) {
        aiPanelToggle.addEventListener('click', () => {
            const isVisible = aiPanelSection.style.display !== 'none';
            aiPanelSection.style.display = isVisible ? 'none' : 'block';
            aiPanelToggle.classList.toggle('active', !isVisible);
            // Sync PDF select when opening
            if (!isVisible) {
                syncAiPanelPdfSelect();
                renderAiPanelPrompts();
            }
        });
    }

    // --- AI PANEL ELEMENTS ---
    const aiPanelPdfSelect = document.getElementById('aiPanelPdfSelect');
    const aiPanelAnalyzeBtn = document.getElementById('aiPanelAnalyzeBtn');
    const aiPanelOpenHistoryBtn = document.getElementById('aiPanelOpenHistoryBtn');
    const aiPanelPromptInput = document.getElementById('aiPanelPrompt');
    const aiPanelPromptName = document.getElementById('aiPanelPromptName');
    const aiPanelSavePromptBtn = document.getElementById('aiPanelSavePromptBtn');
    const aiPanelPromptsList = document.getElementById('aiPanelPromptsList');
    const aiPanelResults = document.getElementById('aiPanelResults');
    const aiPanelOutputText = document.getElementById('aiPanelOutputText');
    const aiPanelDownloadCsv = document.getElementById('aiPanelDownloadCsv');
    const aiPanelDownloadWord = document.getElementById('aiPanelDownloadWord');

    // Sync PDF select in AI Panel with stored PDFs
    const syncAiPanelPdfSelect = () => {
        if (!aiPanelPdfSelect) return;
        aiPanelPdfSelect.innerHTML = '<option value="">Seleziona un PDF...</option>';
        if (storedPdfs && storedPdfs.length > 0) {
            storedPdfs.forEach(pdf => {
                const option = document.createElement('option');
                option.value = pdf.id;
                option.textContent = `${pdf.name} (${new Date(pdf.timestamp).toLocaleDateString('it-IT')})`;
                aiPanelPdfSelect.appendChild(option);
            });
        }
    };

    // Render prompts in AI Panel
    const renderAiPanelPrompts = () => {
        if (!aiPanelPromptsList) return;
        const prompts = loadSavedPrompts();
        aiPanelPromptsList.innerHTML = '';

        if (prompts.length === 0) {
            aiPanelPromptsList.innerHTML = '<span style="color: var(--text-secondary); font-size: 12px;">Nessun prompt salvato</span>';
            return;
        }

        prompts.forEach((item, index) => {
            const chip = document.createElement('div');
            chip.style.cssText = 'background: var(--input-bg); border: 1px solid var(--border-color); padding: 6px 12px; border-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 13px; transition: all 0.2s;';
            chip.innerHTML = `
                <span style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${item.name}</span>
                <button class="ai-panel-prompt-delete" data-index="${index}" style="background: none; border: none; color: #ff6b6b; cursor: pointer; padding: 0 4px; font-size: 14px; line-height: 1;">×</button>
            `;

            chip.addEventListener('click', (e) => {
                if (e.target.classList.contains('ai-panel-prompt-delete')) return;
                if (aiPanelPromptInput) aiPanelPromptInput.value = item.prompt;
            });

            chip.addEventListener('mouseenter', () => {
                chip.style.borderColor = 'var(--havas-red)';
            });
            chip.addEventListener('mouseleave', () => {
                chip.style.borderColor = 'var(--border-color)';
            });

            aiPanelPromptsList.appendChild(chip);
        });

        // Add delete handlers
        aiPanelPromptsList.querySelectorAll('.ai-panel-prompt-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                showCustomDialog({
                    type: 'confirm',
                    title: 'Elimina Prompt',
                    message: 'Eliminare questo prompt?'
                }).then(confirmed => {
                    if (confirmed) {
                        const prompts = loadSavedPrompts();
                        prompts.splice(index, 1);
                        saveSavedPrompts(prompts);
                        renderAiPanelPrompts();
                    }
                });
            });
        });
    };

    // Save prompt button
    if (aiPanelSavePromptBtn) {
        aiPanelSavePromptBtn.addEventListener('click', () => {
            const name = aiPanelPromptName?.value?.trim();
            const promptText = aiPanelPromptInput?.value?.trim();

            if (!name || !promptText) {
                showCustomDialog({
                    title: 'Errore Prompt',
                    message: 'Inserisci sia il nome che il testo del prompt.'
                });
                return;
            }

            const prompts = loadSavedPrompts();
            prompts.push({ name, prompt: promptText });
            saveSavedPrompts(prompts);

            aiPanelPromptName.value = '';
            renderAiPanelPrompts();
            showNotification('Prompt salvato con successo!');
        });
    }

    // Open PDF History modal
    if (aiPanelOpenHistoryBtn) {
        aiPanelOpenHistoryBtn.addEventListener('click', () => {
            if (pdfHistoryButton) pdfHistoryButton.click();
        });
    }

    // Analyze PDF button
    if (aiPanelAnalyzeBtn) {
        aiPanelAnalyzeBtn.addEventListener('click', async () => {
            const selectedPdfId = aiPanelPdfSelect?.value;
            if (!selectedPdfId) {
                showCustomDialog({
                    title: 'Selezione PDF',
                    message: "Seleziona prima un PDF dalla lista."
                });
                return;
            }

            const selectedPdf = storedPdfs.find(p => p.id === parseInt(selectedPdfId));
            if (!selectedPdf) {
                showCustomDialog({
                    title: 'Errore PDF',
                    message: "Errore nel recupero del PDF."
                });
                return;
            }

            aiPanelAnalyzeBtn.disabled = true;
            aiPanelAnalyzeBtn.textContent = "Analisi in corso...";
            aiPanelResults.style.display = "block";
            aiPanelOutputText.textContent = "Invio a Gemini in corso...";

            try {
                const base64Data = selectedPdf.data.split(',')[1];
                const API_KEY = "AIzaSyA7sc1kQewFRDRHo_XquiFMk14jeOgigGo";
                const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

                // Use custom prompt if provided, otherwise use default
                const customPrompt = aiPanelPromptInput?.value?.trim();
                const promptToUse = customPrompt || `
Analizza il seguente documento PDF che contiene una raccolta di screenshot di social media (Instagram, Facebook, Pinterest, TikTok) organizzati per brand.
Il titolo di ogni pagina indica il brand.

Compito:
Per ogni brand identificato nel documento, redigi un commento di esattamente due righe che analizzi brevemente lo stile o il contenuto visivo.
Formatta l'output in modo chiaro, es:
**[Nome Brand]**: Commento...
`;

                const payload = {
                    contents: [{
                        parts: [
                            { text: promptToUse },
                            {
                                inline_data: {
                                    mime_type: "application/pdf",
                                    data: base64Data
                                }
                            }
                        ]
                    }]
                };

                const response = await fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error?.message || "Errore sconosciuto API Gemini");
                }

                const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta generata.";
                aiPanelOutputText.textContent = responseText;

            } catch (error) {
                console.error("Errore Gemini:", error);
                aiPanelOutputText.textContent = "Errore durante l'analisi: " + error.message;
            } finally {
                aiPanelAnalyzeBtn.disabled = false;
                aiPanelAnalyzeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 16px; height: 16px;"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z"></path></svg> Analizza PDF`;
            }
        });
    }

    // Download CSV from AI Panel
    if (aiPanelDownloadCsv) {
        aiPanelDownloadCsv.addEventListener('click', () => {
            const text = aiPanelOutputText?.textContent;
            if (!text) return;

            const rows = parseAiOutput(text);
            const csvContent = "data:text/csv;charset=utf-8,"
                + rows.map(e => e.map(field => `"${field.replace(/"/g, '""')}"`).join(",")).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "analisi_ai.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // Download Word from AI Panel
    if (aiPanelDownloadWord) {
        aiPanelDownloadWord.addEventListener('click', () => {
            const text = aiPanelOutputText?.textContent;
            if (!text) return;

            const htmlContent = `
                <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
                <head><meta charset='utf-8'><title>Analisi AI</title></head>
                <body>
                    <h1>Risultati Analisi AI</h1>
                    <pre style="font-family: Arial; white-space: pre-wrap;">${text}</pre>
                </body>
                </html>
            `;

            const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'analisi_ai.doc';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // --- FINE NUOVA SEZIONE ---

    // ========= STEP NAVIGATION SYSTEM =========
    let currentStep = 1;
    const totalSteps = 5;

    // DOM references for step navigation
    const stepItems = document.querySelectorAll('.step-item');
    const stepPanels = document.querySelectorAll('.step-panel');
    const prevStepBtn = document.getElementById('prevStepBtn');
    const nextStepBtn = document.getElementById('nextStepBtn');

    // Step 4 duplicate export buttons
    const downloadAllButton2 = document.getElementById('downloadAllButton2');
    const generatePptButton2 = document.getElementById('generatePptButton2');
    const exportPdfButton2 = document.getElementById('exportPdfButton2');

    // Step 5 duplicate AI buttons
    const aiPdfSelect2 = document.getElementById('aiPdfSelect2');
    const runAiAnalysisButton2 = document.getElementById('runAiAnalysisButton2');
    const aiAnalysisResults2 = document.getElementById('aiAnalysisResults2');
    const aiOutputText2 = document.getElementById('aiOutputText2');
    const downloadCsvButton2 = document.getElementById('downloadCsvButton2');
    const downloadWordButton2 = document.getElementById('downloadWordButton2');

    function goToStep(stepNum) {
        if (stepNum < 1 || stepNum > totalSteps) return;

        // Update active step indicator
        stepItems.forEach(item => {
            const itemStep = parseInt(item.dataset.step, 10);
            item.classList.remove('active');
            if (itemStep === stepNum) {
                item.classList.add('active');
            }
            // Mark previous steps as completed
            if (itemStep < stepNum) {
                item.classList.add('completed');
            } else {
                item.classList.remove('completed');
            }
        });

        // Show/hide panels
        stepPanels.forEach(panel => {
            const panelStep = parseInt(panel.dataset.step, 10);
            if (panelStep === stepNum) {
                panel.classList.add('active');
            } else {
                panel.classList.remove('active');
            }
        });

        currentStep = stepNum;
        updateNavButtons();

        // Special handling for Step 5 - sync PDF select
        if (stepNum === 5 && aiPdfSelect2) {
            syncAiPdfSelect();
        }
    }

    function updateNavButtons() {
        if (prevStepBtn) prevStepBtn.disabled = currentStep === 1;
        if (nextStepBtn) nextStepBtn.disabled = currentStep === totalSteps;
    }

    function syncAiPdfSelect() {
        // Sync PDF select options from sidebar to Step 5 panel
        if (aiPdfSelect && aiPdfSelect2) {
            aiPdfSelect2.innerHTML = aiPdfSelect.innerHTML;
            aiPdfSelect2.value = aiPdfSelect.value;
        }
    }

    // Step item click handlers
    stepItems.forEach(item => {
        item.addEventListener('click', () => {
            const stepNum = parseInt(item.dataset.step, 10);
            goToStep(stepNum);
        });
    });

    // Navigation button handlers
    if (prevStepBtn) {
        prevStepBtn.addEventListener('click', () => {
            if (currentStep > 1) goToStep(currentStep - 1);
        });
    }

    if (nextStepBtn) {
        nextStepBtn.addEventListener('click', () => {
            if (currentStep < totalSteps) goToStep(currentStep + 1);
        });
    }

    // Wire up Step 4 duplicate buttons to original functionality
    if (downloadAllButton2) {
        downloadAllButton2.addEventListener('click', () => {
            downloadAllButton.click();
        });
    }

    if (generatePptButton2) {
        generatePptButton2.addEventListener('click', () => {
            generatePptButton.click();
        });
    }

    if (exportPdfButton2) {
        exportPdfButton2.addEventListener('click', () => {
            exportPdfButton.click();
        });
    }

    // Wire up Step 5 AI analysis to original functionality
    if (aiPdfSelect2) {
        aiPdfSelect2.addEventListener('change', () => {
            aiPdfSelect.value = aiPdfSelect2.value;
        });
    }

    if (runAiAnalysisButton2) {
        runAiAnalysisButton2.addEventListener('click', async () => {
            // Sync selection
            if (aiPdfSelect2) aiPdfSelect.value = aiPdfSelect2.value;

            // Trigger analysis via original button logic
            runAiAnalysisButton.click();

            // Show loading state
            runAiAnalysisButton2.disabled = true;
            runAiAnalysisButton2.innerHTML = '<strong>Analisi in corso...</strong>';

            // Wait for results and copy them
            setTimeout(() => {
                if (aiOutputText.textContent) {
                    aiOutputText2.textContent = aiOutputText.textContent;
                    aiAnalysisResults2.style.display = 'block';
                }
                runAiAnalysisButton2.disabled = false;
                runAiAnalysisButton2.innerHTML = '<img src="data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'white\' width=\'24px\' height=\'24px\'><path d=\'M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6-4.8-6 4.8 2.4-7.2-6-4.8h7.6z\'/></svg>" width="24" height="24" alt="AI"><strong>Avvia Analisi AI</strong>';
            }, 10000); // Check after 10 seconds
        });
    }



    // Initialize step navigation
    updateNavButtons();

    // ========= END STEP NAVIGATION SYSTEM =========

    // ========= AI CHATBOT INTERFACE =========
    const aiChatMessages = document.getElementById('aiChatMessages');
    const aiPromptTextarea = document.getElementById('aiPromptTextarea');
    const aiSendBtn = document.getElementById('aiSendBtn');
    const aiPromptsList = document.getElementById('aiPromptsList');
    const aiNewPromptName = document.getElementById('aiNewPromptName');
    const aiSavePromptBtn = document.getElementById('aiSavePromptBtn');

    // Load saved prompts from localStorage
    const PROMPTS_STORAGE_KEY = 'havas_ai_saved_prompts';

    function loadSavedPrompts() {
        const saved = localStorage.getItem(PROMPTS_STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
        // Default prompts
        return [
            { name: 'Analisi Brand', prompt: 'Per ogni brand identificato nel documento, redigi un commento di due righe che analizzi brevemente lo stile o il contenuto visivo.' },
            { name: 'Palette Colori', prompt: 'Identifica i colori principali usati da ogni brand e descrivi la palette cromatica.' },
            { name: 'Confronto Brand', prompt: 'Confronta lo stile visivo dei diversi brand e identifica somiglianze e differenze.' }
        ];
    }

    function saveSavedPrompts(prompts) {
        localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts));
    }

    function renderPromptsList() {
        if (!aiPromptsList) return;

        const prompts = loadSavedPrompts();
        aiPromptsList.innerHTML = '';

        prompts.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'ai-prompt-item';
            div.dataset.prompt = item.prompt;
            div.innerHTML = `
                <div class="ai-prompt-item-name">
                    ${item.name}
                    <button class="ai-prompt-delete" data-index="${index}" title="Elimina">×</button>
                </div>
                <div class="ai-prompt-item-preview">${item.prompt.substring(0, 40)}...</div>
            `;

            // Click to use prompt
            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('ai-prompt-delete')) return;
                if (aiPromptTextarea) {
                    aiPromptTextarea.value = item.prompt;
                    aiPromptTextarea.focus();
                }
            });

            aiPromptsList.appendChild(div);
        });

        // Add delete handlers
        aiPromptsList.querySelectorAll('.ai-prompt-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                const prompts = loadSavedPrompts();
                prompts.splice(index, 1);
                saveSavedPrompts(prompts);
                renderPromptsList();
            });
        });
    }

    // Save current prompt
    if (aiSavePromptBtn) {
        aiSavePromptBtn.addEventListener('click', () => {
            const name = aiNewPromptName?.value.trim();
            const prompt = aiPromptTextarea?.value.trim();

            if (!name) {
                showCustomDialog({
                    title: 'Errore Nome',
                    message: 'Inserisci un nome per il prompt'
                });
                return;
            }
            if (!prompt) {
                showCustomDialog({
                    title: 'Errore Testo',
                    message: 'Il prompt è vuoto'
                });
                return;
            }

            const prompts = loadSavedPrompts();
            prompts.push({ name, prompt });
            saveSavedPrompts(prompts);
            renderPromptsList();

            if (aiNewPromptName) aiNewPromptName.value = '';

            // Show confirmation message in chat
            addBotMessage('✅ Prompt salvato con successo!');
        });
    }

    // Add message to chat
    function addUserMessage(text) {
        if (!aiChatMessages) return;
        const div = document.createElement('div');
        div.className = 'ai-message user';
        div.textContent = text;
        aiChatMessages.appendChild(div);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    }

    function addBotMessage(text, isHtml = false) {
        if (!aiChatMessages) return;
        const div = document.createElement('div');
        div.className = 'ai-message bot';
        if (isHtml) {
            div.innerHTML = text;
        } else {
            div.textContent = text;
        }
        aiChatMessages.appendChild(div);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        return div;
    }

    function showTypingIndicator() {
        if (!aiChatMessages) return null;
        const div = document.createElement('div');
        div.className = 'ai-message bot';
        div.id = 'ai-typing';
        div.innerHTML = `
            <div class="ai-typing-indicator">
                <span></span><span></span><span></span>
            </div>
            Sto analizzando il documento...
        `;
        aiChatMessages.appendChild(div);
        aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
        return div;
    }

    function removeTypingIndicator() {
        const typing = document.getElementById('ai-typing');
        if (typing) typing.remove();
    }

    // Send message / analyze
    if (aiSendBtn) {
        aiSendBtn.addEventListener('click', async () => {
            const prompt = aiPromptTextarea?.value.trim();
            const pdfSelect = document.getElementById('aiPdfSelect2');
            const selectedPdfId = pdfSelect?.value;

            if (!selectedPdfId) {
                addBotMessage('⚠️ Per favore, seleziona un PDF da analizzare.');
                return;
            }

            if (!prompt) {
                addBotMessage('⚠️ Per favore, inserisci un prompt per l\'analisi.');
                return;
            }

            // Get PDF data
            const pdfs = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'getPDFs' }, response => {
                    resolve(response?.pdfs || []);
                });
            });

            const selectedPdf = pdfs.find(p => p.id === selectedPdfId);
            if (!selectedPdf) {
                addBotMessage('❌ PDF non trovato.');
                return;
            }

            // Add user message
            addUserMessage(prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt);

            // Show typing
            showTypingIndicator();
            aiSendBtn.disabled = true;

            try {
                const base64Data = selectedPdf.data.split(',')[1];
                const API_KEY = "AIzaSyA7sc1kQewFRDRHo_XquiFMk14jeOgigGo";
                const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

                const payload = {
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: "application/pdf",
                                    data: base64Data
                                }
                            }
                        ]
                    }]
                };

                const response = await fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                removeTypingIndicator();

                if (!response.ok) {
                    throw new Error(data.error?.message || "Errore sconosciuto API Gemini");
                }

                const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta generata.";

                // Add response with export buttons
                const msgHtml = `
                    <div style="margin-bottom: 10px;">${responseText.replace(/\n/g, '<br>').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</div>
                    <div class="ai-message-actions">
                        <button onclick="navigator.clipboard.writeText(\`${responseText.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`); this.textContent='Copiato!'">📋 Copia</button>
                        <button id="aiExportExcel">📊 Excel</button>
                        <button id="aiExportWord">📝 Word</button>
                    </div>
                `;
                addBotMessage(msgHtml, true);

                // Store result for exports
                if (document.getElementById('aiOutputText2')) {
                    document.getElementById('aiOutputText2').textContent = responseText;
                }

            } catch (error) {
                removeTypingIndicator();
                addBotMessage(`❌ Errore: ${error.message}`);
            } finally {
                aiSendBtn.disabled = false;
            }
        });
    }

    // Handle Enter key to send
    if (aiPromptTextarea) {
        aiPromptTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                aiSendBtn?.click();
            }
        });
    }

    // Initialize prompts list
    renderPromptsList();

    // Sync PDF select when going to step 5
    function syncAiPdfSelectChatbot() {
        const mainSelect = document.getElementById('aiPdfSelect');
        const chatSelect = document.getElementById('aiPdfSelect2');
        if (mainSelect && chatSelect && mainSelect.innerHTML !== chatSelect.innerHTML) {
            chatSelect.innerHTML = mainSelect.innerHTML;
        }
    }

    // Override the step navigation to sync PDF
    const originalGoToStep = typeof goToStep === 'function' ? goToStep : null;
    if (originalGoToStep) {
        window.goToStep = function (stepNum) {
            originalGoToStep(stepNum);
            if (stepNum === 5) {
                loadPdfsForChatbot();
            }
        };
    }

    // === CHAT HISTORY PANEL LOGIC ===
    const chatHistoryToggle = document.getElementById('chatHistoryToggle');
    const chatHistoryPanel = document.getElementById('chatHistoryPanel');
    const chatHistoryOverlay = document.getElementById('chatHistoryOverlay');
    const closeChatHistory = document.getElementById('closeChatHistory');
    const chatHistoryList = document.getElementById('chatHistoryList');
    const chatHistorySearch = document.getElementById('chatHistorySearch');

    function toggleChatHistory() {
        if (chatHistoryPanel.classList.contains('open')) {
            chatHistoryPanel.classList.remove('open');
            chatHistoryOverlay.classList.remove('active');
        } else {
            chatHistoryPanel.classList.add('open');
            chatHistoryOverlay.classList.add('active');
            renderChatHistoryList();
        }
    }

    function renderChatHistoryList(searchTerm = '') {
        if (!chatHistoryList) return;

        const sessions = getStoredChatSessions();
        const filtered = sessions.filter(s =>
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.pdfName.toLowerCase().includes(searchTerm.toLowerCase())
        );

        chatHistoryList.innerHTML = '';

        if (filtered.length === 0) {
            chatHistoryList.innerHTML = '<div style="padding:15px; color:#888; text-align:center;">Nessuna chat trovata.</div>';
            return;
        }

        filtered.forEach(session => {
            const dateStr = new Date(session.lastUpdated).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

            const item = document.createElement('div');
            item.className = 'chat-history-item';
            item.innerHTML = `
                <div class="chat-history-info">
                    <div class="chat-history-name" title="${session.name}">${session.name}</div>
                    <div class="chat-history-meta">
                        <span>📄 ${session.pdfName}</span>
                        <span>🕒 ${dateStr}</span>
                    </div>
                </div>
                <div class="chat-history-actions">
                    <button class="icon-btn edit-chat-btn" title="Rinomina" style="padding: 2px;">✏️</button>
                    <button class="icon-btn delete-chat-btn" title="Elimina" style="padding: 2px; color: #ff4444;">🗑️</button>
                </div>
            `;

            // Click su item per aprire (escludendo i pulsanti)
            item.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;

                showAIChatView(session.pdfName, null, null, session);
                toggleChatHistory(); // Chiude il pannello
            });

            // Rinomina
            const editBtn = item.querySelector('.edit-chat-btn');
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showCustomDialog({
                    type: 'prompt',
                    title: 'Rinomina Chat',
                    message: "Rinomina questa chat:",
                    defaultValue: session.name
                }).then(newName => {
                    if (newName && newName.trim()) {
                        renameChatSession(session.id, newName.trim());
                    }
                });
            });

            // Elimina
            const deleteBtn = item.querySelector('.delete-chat-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteChatSession(session.id);
            });

            chatHistoryList.appendChild(item);
        });
    }

    if (chatHistoryToggle) chatHistoryToggle.addEventListener('click', toggleChatHistory);
    if (closeChatHistory) closeChatHistory.addEventListener('click', toggleChatHistory);
    if (chatHistoryOverlay) chatHistoryOverlay.addEventListener('click', toggleChatHistory);

    if (chatHistorySearch) {
        chatHistorySearch.addEventListener('input', (e) => {
            renderChatHistoryList(e.target.value);
        });
    }


    // Direct PDF loading for chatbot - fixes the "PDF not found" issue
    function loadPdfsForChatbot() {
        // CORREZIONE: Usa l'ID corretto del chatbot panel (aiChatbotPdfSelect)
        const chatSelect = document.getElementById('aiChatbotPdfSelect');
        if (!chatSelect) return;

        // CORREZIONE: Usa l'azione corretta 'getPDFs' riconosciuta da background.js
        chrome.runtime.sendMessage({ action: 'getPDFs' }, (response) => {
            if (response && response.pdfs && response.pdfs.length > 0) {
                // Mantieni la selezione attuale se esiste
                const currentVal = chatSelect.value;

                chatSelect.innerHTML = '<option value="">Seleziona PDF...</option>';

                // Ordina per data (più recenti prima)
                const sortedPdfs = response.pdfs.sort((a, b) => b.date - a.date);

                sortedPdfs.forEach(pdf => {
                    const option = document.createElement('option');
                    option.value = pdf.id;
                    option.textContent = `${pdf.name} (${new Date(pdf.date).toLocaleDateString('it-IT')})`;
                    chatSelect.appendChild(option);
                });

                // Ripristina selezione
                if (currentVal && sortedPdfs.some(p => p.id == currentVal)) {
                    chatSelect.value = currentVal;
                }
            } else {
                chatSelect.innerHTML = '<option value="">Nessun PDF nello storico</option>';
            }
        });
    }

    // Load PDFs on init
    loadPdfsForChatbot();

    // ========= END AI CHATBOT INTERFACE =========

    // ========= USER MENU FUNCTIONALITY =========
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userMenuDropdown = document.getElementById('userMenuDropdown');

    if (userMenuBtn && userMenuDropdown) {
        userMenuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            userMenuDropdown.classList.toggle('show');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!userMenuDropdown.contains(e.target) && e.target !== userMenuBtn) {
                userMenuDropdown.classList.remove('show');
            }
        });

        // Menu item handlers
        document.getElementById('menuPdfHistory')?.addEventListener('click', () => {
            userMenuDropdown.classList.remove('show');
            // Navigate to Step 5 and show PDF history
            if (typeof goToStep === 'function') goToStep(5);
            addBotMessage('📄 Ecco lo storico PDF. Seleziona un documento dal menu a tendina per analizzarlo.');
        });

        document.getElementById('menuPromptSettings')?.addEventListener('click', () => {
            userMenuDropdown.classList.remove('show');
            // Navigate to Step 5 for prompt management
            if (typeof goToStep === 'function') goToStep(5);
            addBotMessage('📝 Gestisci i tuoi prompt salvati nella barra laterale destra. Clicca su un prompt per caricarlo, oppure salva un nuovo prompt.');
        });

        document.getElementById('menuPresetManager')?.addEventListener('click', () => {
            userMenuDropdown.classList.remove('show');
            document.getElementById('presetManagerButton')?.click();
        });

        document.getElementById('menuProfileList')?.addEventListener('click', () => {
            userMenuDropdown.classList.remove('show');
            document.getElementById('profileListManagerButton')?.click();
        });

        document.getElementById('menuClearSession')?.addEventListener('click', () => {
            userMenuDropdown.classList.remove('show');
            clearButton?.click();
        });
    }
    // ========= END USER MENU =========
    // ========= SIDEBAR TOGGLE LOGIC =========
    if (sidebarTrigger) {
        sidebarTrigger.addEventListener('click', () => {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('active');
        });
    }

    if (closeSidebar) {
        closeSidebar.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        });
    }

    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            // Also close AI chatbot if open
            if (aiChatbotPanel) {
                aiChatbotPanel.classList.remove('open');
                aiChatbotOverlay.classList.remove('active');
            }
        });
    }

    // AI Chatbot Overlay specific
    // ========= AI CHATBOT LOGIC (NEW RADIO HANDLER) =========

    const switchToDirectMode = () => {
        const directRadio = document.querySelector('input[name="executionMode"][value="direct"]');
        if (directRadio) {
            directRadio.checked = true;
            updateStartButtonState();
        }
    };

    const closeAiPanelAndReset = () => {
        if (aiChatbotPanel) {
            aiChatbotPanel.classList.remove('open');
            aiChatbotOverlay.classList.remove('active');
        }
        switchToDirectMode();
    };

    // Handle Radio Changes
    document.querySelectorAll('input[name="executionMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const uploadLabel = document.querySelector('label[for="excelFile"]');
            const textArea = document.getElementById('textUrls');

            // 1. Definisci tutti i container dei filtri
            const inlinePrompts = document.getElementById('inlinePrompts');
            const settingsChips = document.getElementById('settingsChips');
            const chipIGPosts = document.getElementById('chipIGPosts');
            const metaDates = document.getElementById('metaLibraryDates');
            const googleDates = document.getElementById('googleLibraryDates');
            const inlinePdfSelection = document.getElementById('inlinePdfSelection');

            // 2. NASCONDI TUTTI i container di default (Reset pulito)
            if (inlinePrompts) inlinePrompts.style.display = 'none';
            if (settingsChips) settingsChips.style.display = 'none';
            if (metaDates) metaDates.style.display = 'none';
            if (googleDates) googleDates.style.display = 'none';
            if (inlinePdfSelection) inlinePdfSelection.style.display = 'none';

            // 3. MOSTRA solo i container necessari in base alla modalità selezionata
            if (e.target.value === 'meta_library') {
                if (metaDates) metaDates.style.display = 'flex';

                textArea.placeholder = "Inserisci le keyword da cercare su Meta (una per riga o separate da virgola)...";
                uploadLabel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span style="position: absolute; bottom: -2px; right: -2px; font-size: 8px; background: #0084FF; color: white; padding: 1px 3px; border-radius: 3px;">ADS</span>`;
                uploadLabel.onclick = null;
                startButton.disabled = false;
                statusDiv.textContent = "";
            }
            else if (e.target.value === 'google_ads') {
                if (googleDates) googleDates.style.display = 'flex';

                textArea.placeholder = "Inserisci i domini dei brand da cercare su Google (es. ikea.com) uno per riga...";
                uploadLabel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12A10 10 0 1 1 12 2a10 10 0 0 1 10 10z"></path><path d="M12 22v-4"></path><path d="M12 6V2"></path><path d="M22 12h-4"></path><path d="M6 12H2"></path></svg><span style="position: absolute; bottom: -2px; right: -2px; font-size: 8px; background: #F4B400; color: white; padding: 1px 3px; border-radius: 3px;">G-AD</span>`;
                uploadLabel.onclick = null;
                startButton.disabled = false;
                statusDiv.textContent = "";
            }
            else { // Modalità Desk o Direct
                if (settingsChips) settingsChips.style.display = 'flex';
                if (chipIGPosts) {
                    const isDesk = (e.target.value === 'desk');
                    chipIGPosts.style.display = isDesk ? 'flex' : 'none';
                    document.querySelectorAll('.ig-date-chip').forEach(el => el.style.display = isDesk ? 'flex' : 'none');
                }

                textArea.placeholder = "Incolla qui i link (uno per riga) oppure carica un Excel...";
                uploadLabel.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg><span style="position: absolute; bottom: -2px; right: -2px; font-size: 8px; background: #1D6F42; color: white; padding: 1px 3px; border-radius: 3px;">XLS</span>`;
                uploadLabel.onclick = null;
                updateStartButtonState();
            }

            // AGGIORNAMENTO DINAMICO: Ricarica la galleria in base alla tab selezionata
            refreshScreenshotsView();
        });
    });

    // Handle Closing (Overlay & Close Button)
    if (aiChatbotOverlay) {
        aiChatbotOverlay.addEventListener('click', () => {
            closeAiPanelAndReset();
        });
    }

    if (closeAiChatbot) {
        closeAiChatbot.addEventListener('click', () => {
            closeAiPanelAndReset();
        });
    }

    // Quick Prompts Chips
    if (aiPromptChips) {
        aiPromptChips.addEventListener('click', (e) => {
            if (e.target.classList.contains('prompt-chip')) {
                const prompt = e.target.dataset.prompt;
                if (aiChatbotPromptInput) {
                    aiChatbotPromptInput.value = prompt;
                    aiChatbotPromptInput.focus();
                }
            }
        });
    }

    // History Button
    if (aiChatbotHistoryBtn) {
        aiChatbotHistoryBtn.addEventListener('click', () => {
            document.getElementById('pdfHistoryButton').click();
        });
    }

    // Helper: Add message to chatbot
    function addChatbotMessage(text, sender = 'bot', isHtml = false) {
        if (!aiChatbotMessages) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-chat-message ${sender}`;

        if (isHtml) {
            msgDiv.innerHTML = text;
        } else {
            msgDiv.textContent = text;
        }

        aiChatbotMessages.appendChild(msgDiv);
        aiChatbotMessages.scrollTop = aiChatbotMessages.scrollHeight;
        return msgDiv;
    }

    // Helper: Typing indicator for chatbot
    function showChatbotTyping() {
        if (!aiChatbotMessages) return null;
        const id = 'chatbot-typing-' + Date.now();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-chat-message bot';
        msgDiv.id = id;
        msgDiv.innerHTML = '<em>Sta scrivendo...</em>';
        aiChatbotMessages.appendChild(msgDiv);
        aiChatbotMessages.scrollTop = aiChatbotMessages.scrollHeight;
        return id;
    }

    function removeChatbotTyping(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    // Direct PDF loading for chatbot - fixes the "PDF not found" issue
    function loadPdfsForChatbot() {
        // CORREZIONE: Recupera l'elemento direttamente dal DOM per sicurezza
        const targetSelect = document.getElementById('aiChatbotPdfSelect');
        if (!targetSelect) return;

        // CORREZIONE: Usa 'getPDFs' che è il comando corretto nel background.js
        chrome.runtime.sendMessage({ action: 'getPDFs' }, (response) => {
            if (response && response.pdfs && response.pdfs.length > 0) {
                const currentValue = targetSelect.value;
                targetSelect.innerHTML = '<option value="">Seleziona PDF...</option>';

                // Ordina per data (più recenti in alto)
                const sortedPdfs = response.pdfs.sort((a, b) => b.date - a.date);

                sortedPdfs.forEach(pdf => {
                    const option = document.createElement('option');
                    option.value = pdf.id;
                    option.textContent = `${pdf.name} (${new Date(pdf.date).toLocaleDateString('it-IT')})`;
                    targetSelect.appendChild(option);
                });

                if (currentValue && sortedPdfs.some(p => p.id == currentValue)) {
                    targetSelect.value = currentValue;
                }
            } else {
                targetSelect.innerHTML = '<option value="">Nessun PDF nello storico</option>';
            }
        });
    }

    // Initial load
    loadPdfsForChatbot();

    // === NUOVA FUNZIONE: Carica PDF nel dropdown inline ===
    function loadInlinePdfDropdown() {
        const inlinePdfSelect = document.getElementById('inlinePdfSelect');
        if (!inlinePdfSelect) return;

        chrome.runtime.sendMessage({ action: 'getPDFs' }, (response) => {
            if (response && response.pdfs && response.pdfs.length > 0) {
                const currentValue = inlinePdfSelect.value;
                inlinePdfSelect.innerHTML = '<option value="">Seleziona PDF...</option>';

                // Ordina per data (più recenti in alto)
                const sortedPdfs = response.pdfs.sort((a, b) => b.date - a.date);

                sortedPdfs.forEach(pdf => {
                    const option = document.createElement('option');
                    option.value = pdf.id;
                    option.textContent = `${pdf.name} (${new Date(pdf.date).toLocaleDateString('it-IT')})`;
                    inlinePdfSelect.appendChild(option);
                });

                // Ripristina selezione precedente se presente
                if (currentValue && sortedPdfs.some(p => p.id == currentValue)) {
                    inlinePdfSelect.value = currentValue;
                }
            } else {
                inlinePdfSelect.innerHTML = '<option value="">Nessun PDF nello storico</option>';
            }
        });
    }

    // Listener per i Chips Inline nel box di input (AI PROMPTS)
    const inlinePromptsContainer = document.getElementById('inlinePrompts');
    if (inlinePromptsContainer) {
        inlinePromptsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('prompt-chip-inline')) {
                const promptText = e.target.dataset.prompt;
                const textArea = document.getElementById('textUrls');
                if (textArea) {
                    textArea.value = promptText;
                    textArea.focus();
                }
            }
        });
    }

    // NUOVO: Listener per i Chips Impostazioni (SETTINGS CHIPS)
    const settingsChipsContainer = document.getElementById('settingsChips');
    if (settingsChipsContainer) {
        // Chip Ritardo Screenshot
        document.getElementById('chipDelay')?.addEventListener('click', async () => {
            const input = document.getElementById('screenshotDelay');
            const current = input.value;
            const newVal = await showCustomDialog({
                type: 'prompt',
                title: 'Impostazioni',
                message: "Inserisci ritardo screenshot (secondi):",
                defaultValue: current
            });
            if (newVal !== null && !isNaN(newVal)) {
                input.value = newVal;
                // Aggiorna mantenendo l'icona SVG
                document.getElementById('chipDelay').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="social-icon" style="width: 14px; height: 14px;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg> <span>${newVal}s</span>`;
            }
        });

        // Chip Swipe Delay
        document.getElementById('chipSwipe')?.addEventListener('click', async () => {
            const input = document.getElementById('carouselSwipeDelay');
            const current = input.value;
            const newVal = await showCustomDialog({
                type: 'prompt',
                title: 'Impostazioni',
                message: "Inserisci ritardo swipe carousel (secondi):",
                defaultValue: current
            });
            if (newVal !== null && !isNaN(newVal)) {
                input.value = newVal;
                document.getElementById('chipSwipe').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="social-icon" style="width: 14px; height: 14px;"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> <span>${newVal}s</span>`;
            }
        });

        // Chip Max Slides
        document.getElementById('chipMaxSlides')?.addEventListener('click', async () => {
            const input = document.getElementById('maxCarouselSlides');
            const current = input.value;
            const newVal = await showCustomDialog({
                type: 'prompt',
                title: 'Impostazioni',
                message: "Inserisci numero massimo slide:",
                defaultValue: current
            });
            if (newVal !== null && !isNaN(newVal)) {
                input.value = newVal;
                document.getElementById('chipMaxSlides').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="social-icon" style="width: 14px; height: 14px;"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> <span>Mx ${newVal}</span>`;
            }
        });

        // Chip Instagram Posts
        document.getElementById('chipIGPosts')?.addEventListener('click', async () => {
            const input = document.getElementById('numInstagramPosts');
            const current = input.value;
            const newVal = await showCustomDialog({
                type: 'prompt',
                title: 'Impostazioni',
                message: "Quanti post scrollare (Social)?\n(Viene ignorato se imposti le date)",
                defaultValue: current
            });
            if (newVal !== null && !isNaN(newVal)) {
                input.value = newVal;
                document.getElementById('chipIGPosts').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="social-icon" style="width: 14px; height: 14px;"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg> <span>${newVal}</span>`;
            }
        });

        // Date IG Desk
        const formatSocialDate = (dateStr) => {
            if (!dateStr) return "";
            const parts = dateStr.trim().split('/');
            if (parts.length === 3) {
                const d = parts[0].padStart(2, '0');
                const m = parts[1].padStart(2, '0');
                const y = parts[2];
                return `${y}-${m}-${d}`; // Formato YYYY-MM-DD per parsing facile
            }
            return dateStr.trim();
        };

        const syncSocialDateChips = () => {
            const numPostsChip = document.getElementById('chipIGPosts');
            if (numPostsChip) {
                if (socialStartDate && socialEndDate) {
                    numPostsChip.style.opacity = '0.4';
                    numPostsChip.style.pointerEvents = 'none';
                    numPostsChip.title = "Disattivato: ricerca per date attiva";
                    document.getElementById('numInstagramPosts').value = 0; // Azzera internamente
                } else {
                    numPostsChip.style.opacity = '1';
                    numPostsChip.style.pointerEvents = 'auto';
                    numPostsChip.title = "Numero Post Instagram (solo Desk)";
                }
            }
        };

        document.getElementById('chipSocialStartDate')?.addEventListener('click', async () => {
            const val = await showCustomDialog({
                type: 'prompt',
                title: 'Data Inizio Profilo Social',
                message: "Inserisci la data di inizio (GG/MM/AAAA) oppure lascia vuoto per disattivare:",
                defaultValue: socialStartDate ? socialStartDate.split('-').reverse().join('/') : ""
            });
            if (val !== null) {
                socialStartDate = formatSocialDate(val);
                document.querySelector('#chipSocialStartDate span').textContent = socialStartDate ? `Inizio: ${val}` : 'Data Inizio';
                syncSocialDateChips();
            }
        });

        document.getElementById('chipSocialEndDate')?.addEventListener('click', async () => {
            const val = await showCustomDialog({
                type: 'prompt',
                title: 'Data Fine Profilo Social',
                message: "Inserisci la data di fine (GG/MM/AAAA) oppure lascia vuoto per disattivare:",
                defaultValue: socialEndDate ? socialEndDate.split('-').reverse().join('/') : ""
            });
            if (val !== null) {
                socialEndDate = formatSocialDate(val);
                document.querySelector('#chipSocialEndDate span').textContent = socialEndDate ? `Fine: ${val}` : 'Data Fine';
                syncSocialDateChips();
            }
        });

        // --- LISTENER DATE PER META LIBRARY ---
        document.getElementById('chipStartDate')?.addEventListener('click', async () => {
            const val = await showCustomDialog({
                type: 'prompt',
                title: 'Data Inizio',
                message: "Inserisci la data di inizio (G/M/AAAA):",
                defaultValue: metaStartDate || "2/6/2019"
            });
            if (val) {
                metaStartDate = val;
                document.querySelector('#chipStartDate span').textContent = `Inizio: ${val}`;
            }
        });

        document.getElementById('chipEndDate')?.addEventListener('click', async () => {
            const val = await showCustomDialog({
                type: 'prompt',
                title: 'Data Fine',
                message: "Inserisci la data di fine (G/M/AAAA):",
                defaultValue: metaEndDate || ""
            });
            if (val) {
                metaEndDate = val;
                document.querySelector('#chipEndDate span').textContent = `Fine: ${val}`;
            }
        });

        // Chip Max Ads per Meta Library
        document.getElementById('chipMetaMaxAds')?.addEventListener('click', async () => {
            const newVal = await showCustomDialog({
                type: 'prompt',
                title: 'Limite Meta Ads',
                message: "Quanti annunci vuoi catturare al massimo?",
                defaultValue: metaMaxAdsCount
            });
            if (newVal !== null && !isNaN(newVal)) {
                metaMaxAdsCount = parseInt(newVal, 10);
                document.querySelector('#chipMetaMaxAds span').textContent = `Limite: ${metaMaxAdsCount}`;
            }
        });

        // Chip Max Ads per Google Library
        // --- LISTENER DATE PER GOOGLE ADS LIBRARY ---

        // Funzione helper per forzare il formato AAAA-MM-GG (es: trasforma 2024-5-4 in 2024-05-04)
        const formatGoogleDate = (dateStr) => {
            if (!dateStr) return "";
            const parts = dateStr.trim().split('-');
            if (parts.length === 3) {
                const y = parts[0];
                const m = parts[1].padStart(2, '0');
                const d = parts[2].padStart(2, '0');
                return `${y}-${m}-${d}`;
            }
            return dateStr.trim();
        };

        document.getElementById('chipGoogleStartDate')?.addEventListener('click', async () => {
            const val = await showCustomDialog({
                type: 'prompt',
                title: 'Data Inizio Google Ads',
                message: "Inserisci la data di inizio (AAAA-MM-GG):",
                defaultValue: googleStartDate || ""
            });
            if (val) {
                googleStartDate = formatGoogleDate(val);
                document.querySelector('#chipGoogleStartDate span').textContent = `Inizio: ${googleStartDate}`;
            }
        });

        document.getElementById('chipGoogleEndDate')?.addEventListener('click', async () => {
            const val = await showCustomDialog({
                type: 'prompt',
                title: 'Data Fine Google Ads',
                message: "Inserisci la data di fine (AAAA-MM-GG):",
                defaultValue: googleEndDate || ""
            });
            if (val) {
                googleEndDate = formatGoogleDate(val);
                document.querySelector('#chipGoogleEndDate span').textContent = `Fine: ${googleEndDate}`;
            }
        });

        // Listener per cambiare l'icona del select piattaforma
        const platformSelect = document.getElementById('googlePlatform');
        const platformIcons = {
            'all': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"%3E%3Ccircle cx="12" cy="12" r="10"%3E%3C/circle%3E%3Cline x1="2" y1="12" x2="22" y2="12"%3E%3C/line%3E%3Cpath d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"%3E%3C/path%3E%3C/svg%3E',
            'GOOGLE_SEARCH': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%234285F4" stroke-width="2"%3E%3Ccircle cx="11" cy="11" r="8"%3E%3C/circle%3E%3Cline x1="21" y1="21" x2="16.65" y2="16.65"%3E%3C/line%3E%3C/svg%3E',
            'YOUTUBE': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23FF0000"%3E%3Cpath d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"%3E%3C/path%3E%3C/svg%3E',
            'GOOGLE_MAPS': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234285F4"%3E%3Cpath d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"%3E%3C/path%3E%3C/svg%3E',
            'GOOGLE_PLAY': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2334A853"%3E%3Cpath d="M3 20.5v-17c0-.59.34-1.11.84-1.35L13.69 12l-9.85 9.85c-.5-.24-.84-.76-.84-1.35z"%3E%3C/path%3E%3Cpath d="M16.81 15.12l-3.12-3.12 3.12-3.12 3.35 1.93c.56.32.56 1.16 0 1.48l-3.35 1.83z" fill="%23FBBC04"%3E%3C/path%3E%3Cpath d="M13.69 12L3.84 2.15C4.15 2.05 4.49 2 4.84 2c.35 0 .69.05 1 .15l9.85 9.85z" fill="%23EA4335"%3E%3C/path%3E%3Cpath d="M13.69 12l3.12 3.12L4.84 21.85c-.31.1-.65.15-1 .15-.35 0-.69-.05-1-.15L13.69 12z" fill="%2334A853"%3E%3C/path%3E%3C/svg%3E',
            'GOOGLE_SHOPPING': 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23FBBC04" stroke-width="2"%3E%3Ccircle cx="9" cy="21" r="1"%3E%3C/circle%3E%3Ccircle cx="20" cy="21" r="1"%3E%3C/circle%3E%3Cpath d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"%3E%3C/path%3E%3C/svg%3E'
        };

        platformSelect?.addEventListener('change', function () {
            const selectedValue = this.value;
            const iconUrl = platformIcons[selectedValue] || platformIcons['all'];
            this.style.backgroundImage = `url("${iconUrl}")`;
        });

        // Imposta l'icona iniziale
        if (platformSelect) {
            platformSelect.style.backgroundImage = `url("${platformIcons['all']}")`;
        }

        document.getElementById('chipGoogleMaxAds')?.addEventListener('click', async () => {
            const newVal = await showCustomDialog({
                type: 'prompt',
                title: 'Limite Google Ads',
                message: "Quanti annunci vuoi catturare al massimo?",
                defaultValue: googleMaxAdsCount
            });
            if (newVal !== null && !isNaN(newVal)) {
                googleMaxAdsCount = parseInt(newVal, 10);
                document.getElementById('googleMaxAdsText').textContent = `Limite: ${googleMaxAdsCount}`;
            }
        });
    }

    // Send Logic
    if (aiChatbotSendBtn) {
        aiChatbotSendBtn.addEventListener('click', async () => {
            const prompt = aiChatbotPromptInput.value.trim();
            const pdfId = aiChatbotPdfSelect.value;

            if (!pdfId) {
                addChatbotMessage('⚠️ Seleziona prima un PDF da analizzare.', 'bot');
                return;
            }

            if (!prompt) {
                addChatbotMessage('⚠️ Scrivi un prompt o scegline uno rapido.', 'bot');
                return;
            }

            // User message
            addChatbotMessage(prompt, 'user');
            aiChatbotPromptInput.value = '';

            // Typing
            const typingId = showChatbotTyping();
            aiChatbotSendBtn.disabled = true;

            try {
                // Get PDF data
                const pdfs = await new Promise(resolve => {
                    chrome.runtime.sendMessage({ action: 'getPDFs' }, response => {
                        resolve(response?.pdfs || []);
                    });
                });

                // CORREZIONE: Convertiamo l'ID in numero per trovarlo correttamente
                const selectedPdf = pdfs.find(p => p.id == pdfId);

                if (!selectedPdf) {
                    // Debug log per capire cosa sta succedendo se fallisce ancora
                    console.error("Debug ID:", pdfId, "Available IDs:", pdfs.map(p => p.id));
                    throw new Error("PDF non trovato nello storico.");
                }

                const base64Data = selectedPdf.data.split(',')[1];
                const API_KEY = "AIzaSyA7sc1kQewFRDRHo_XquiFMk14jeOgigGo";
                const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

                const payload = {
                    contents: [{
                        parts: [
                            { text: prompt },
                            {
                                inline_data: {
                                    mime_type: "application/pdf",
                                    data: base64Data
                                }
                            }
                        ]
                    }]
                };

                const response = await fetch(API_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });

                const data = await response.json();
                removeChatbotTyping(typingId);

                if (!response.ok) {
                    throw new Error(data.error?.message || "Errore sconosciuto API Gemini");
                }

                const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta generata.";

                // Format Markdown to simple HTML
                let formattedText = responseText
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');

                addChatbotMessage(formattedText, 'bot', true);

            } catch (error) {
                removeChatbotTyping(typingId);
                addChatbotMessage(`❌ Errore: ${error.message}`, 'bot');
            } finally {
                aiChatbotSendBtn.disabled = false;
            }
        });
    }

    // Enter to send
    if (aiChatbotPromptInput) {
        aiChatbotPromptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                aiChatbotSendBtn.click();
            }
        });
    }

    // === AI CHAT VIEW MANAGEMENT ===
    const aiChatView = document.getElementById('aiChatView');
    const aiChatMessagesContainer = document.getElementById('aiChatMessagesContainer');
    const aiChatInput = document.getElementById('aiChatInput');
    const aiChatSendBtn = document.getElementById('aiChatSendBtn');
    const aiChatBackBtn = document.getElementById('aiChatBackBtn');
    const aiChatExportBtn = document.getElementById('aiChatExportBtn');
    const aiChatPdfName = document.getElementById('aiChatPdfName');
    const inputWrapper = document.querySelector('.input-wrapper');
    const mainTitle = document.querySelector('main h1');

    let currentChatPdfId = null;
    let currentChatSessionId = null; // ID univoco della sessione corrente

    // --- Gestione Storage Cronologia ---
    const CHAT_HISTORY_STORAGE_KEY = 'havas_ai_chat_sessions';

    function getStoredChatSessions() {
        const stored = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    }

    function saveChatSession(sessionId, pdfId, pdfName, initialPrompt, messages) {
        let sessions = getStoredChatSessions();
        let sessionIndex = sessions.findIndex(s => s.id === sessionId);

        const timestamp = Date.now();

        if (sessionIndex > -1) {
            // Aggiorna esistente
            sessions[sessionIndex].messages = messages;
            sessions[sessionIndex].lastUpdated = timestamp;
        } else {
            // Crea nuova
            sessions.unshift({
                id: sessionId,
                name: initialPrompt.length > 30 ? initialPrompt.substring(0, 30) + '...' : initialPrompt,
                pdfId: pdfId,
                pdfName: pdfName,
                createdAt: timestamp,
                lastUpdated: timestamp,
                messages: messages
            });
        }

        localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
        renderChatHistoryList(); // Aggiorna la UI del pannello se aperto
    }

    function renameChatSession(sessionId, newName) {
        let sessions = getStoredChatSessions();
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            session.name = newName;
            localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
            renderChatHistoryList();
            // Se rinominiamo la chat corrente, aggiorniamo il titolo?
            // Per ora il titolo mostra il PDF name, potremmo cambiarlo
        }
    }

    function deleteChatSession(sessionId) {
        showCustomDialog({
            type: 'confirm',
            title: 'Elimina Chat',
            message: "Sei sicuro di voler eliminare questa chat?"
        }).then(confirmed => {
            if (confirmed) {
                let sessions = getStoredChatSessions();
                sessions = sessions.filter(s => s.id !== sessionId);
                localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(sessions));
                renderChatHistoryList();

                // Se stiamo visualizzando la chat eliminata, chiudiamola
                if (currentChatSessionId === sessionId) {
                    hideAIChatView();
                }
            }
        });
    }

    // Format text with markdown-like syntax
    function formatAIResponse(text) {
        return text
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
            .replace(/`(.+?)`/g, '<code>$1</code>');
    }

    // array temporaneo per la sessione corrente in memoria
    let currentSessionMessages = [];

    // Add message to chat and Save to Storage
    function addChatMessage(text, sender = 'user', isHtml = false, attachment = null) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-chat-message-bubble ${sender}`;

        if (isHtml) {
            messageDiv.innerHTML = text;
        } else {
            messageDiv.textContent = text;
        }

        // --- GESTIONE ALLEGATO (PDF) ---
        if (attachment && attachment.type === 'pdf') {
            const attachDiv = document.createElement('div');
            attachDiv.className = 'chat-attachment';
            attachDiv.title = "Clicca per visualizzare l'anteprima";

            attachDiv.innerHTML = `
                <div class="attachment-icon">PDF</div>
                <div class="attachment-info">
                    <span class="attachment-name">${attachment.name}</span>
                    <span class="attachment-type">Documento PDF</span>
                </div>
            `;

            // Logica click per anteprima
            attachDiv.addEventListener('click', async (e) => {
                e.stopPropagation();
                const pdfData = storedPdfs.find(p => p.id == attachment.id);
                if (pdfData) {
                    try {
                        // Converte DataURI in Blob per aprirlo nativamente
                        const response = await fetch(pdfData.data);
                        const blob = await response.blob();
                        const fileUrl = URL.createObjectURL(blob);
                        window.open(fileUrl, '_blank');
                    } catch (err) {
                        console.error("Errore apertura PDF:", err);
                        showCustomDialog({
                            title: 'Errore Apertura',
                            message: "Errore tecnico nell'apertura del PDF."
                        });
                    }
                } else {
                    showCustomDialog({
                        title: 'Errore',
                        message: "Impossibile recuperare il file PDF originale."
                    });
                }
            });

            messageDiv.appendChild(attachDiv);
        }
        // -------------------------------

        aiChatMessagesContainer.appendChild(messageDiv);
        aiChatMessagesContainer.scrollTop = aiChatMessagesContainer.scrollHeight;

        // Aggiungi alla memoria volatile (includendo l'allegato per salvarlo nella history)
        currentSessionMessages.push({ sender, text, isHtml, attachment });

        // Salva persistentemente nello storage se abbiamo una sessione attiva
        if (currentChatSessionId && currentChatPdfId) {
            // Recupera il nome PDF dalla UI o dallo stato (un po' hacky ma efficace)
            const pdfName = aiChatPdfName.textContent;
            // Il nome della chat viene impostato alla creazione (primo prompt), qui aggiorniamo solo i messaggi
            // Per il "initialPrompt" passiamo il testo del primo messaggio utente se esiste
            const firstUserMsg = currentSessionMessages.find(m => m.sender === 'user');
            const initialName = firstUserMsg ? firstUserMsg.text : "Nuova Chat";

            saveChatSession(currentChatSessionId, currentChatPdfId, pdfName, initialName, currentSessionMessages);
        }
    }

    // Show typing indicator
    function showTypingIndicator() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-chat-typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.textContent = 'Gemini sta scrivendo...';
        aiChatMessagesContainer.appendChild(typingDiv);
        aiChatMessagesContainer.scrollTop = aiChatMessagesContainer.scrollHeight;
    }

    // Remove typing indicator
    function removeTypingIndicator() {
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) typingDiv.remove();
    }

    // Show AI chat view (Modified for History Support)
    // Se "existingSession" è fornito, carica quella, altrimenti ne crea una nuova
    window.showAIChatView = function (pdfName, userPrompt, aiResponse, existingSession = null) {
        // Hide input wrapper and title
        if (inputWrapper) inputWrapper.classList.add('hidden');
        if (mainTitle) mainTitle.classList.add('hidden');

        // Show chat view
        if (aiChatView) aiChatView.classList.add('active');

        // Set PDF name
        if (aiChatPdfName) aiChatPdfName.textContent = pdfName;

        // Reset UI
        aiChatMessagesContainer.innerHTML = '';
        currentSessionMessages = []; // Reset memoria locale

        if (existingSession) {
            // --- CARICAMENTO DA STORICO ---
            currentChatSessionId = existingSession.id;
            currentChatPdfId = existingSession.pdfId;

            // Renderizza tutti i messaggi salvati
            existingSession.messages.forEach(msg => {
                // Usiamo la funzione principale addChatMessage MA in un modo che non duplichi il salvataggio
                // Nota: Poiché stiamo solo popolando la UI e currentSessionMessages è gestito manualmente qui sotto,
                // dobbiamo replicare la logica di renderizzazione UI dell'allegato se presente.

                const messageDiv = document.createElement('div');
                messageDiv.className = `ai-chat-message-bubble ${msg.sender}`;

                if (msg.isHtml) messageDiv.innerHTML = msg.text;
                else messageDiv.textContent = msg.text;

                // Renderizza allegato se presente nella storia salvata
                if (msg.attachment && msg.attachment.type === 'pdf') {
                    const attachDiv = document.createElement('div');
                    attachDiv.className = 'chat-attachment';
                    attachDiv.title = "Clicca per visualizzare l'anteprima";
                    attachDiv.innerHTML = `
                        <div class="attachment-icon">PDF</div>
                        <div class="attachment-info">
                            <span class="attachment-name">${msg.attachment.name}</span>
                            <span class="attachment-type">Documento PDF</span>
                        </div>
                    `;
                    attachDiv.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const pdfData = storedPdfs.find(p => p.id == msg.attachment.id);
                        if (pdfData) {
                            try {
                                const response = await fetch(pdfData.data);
                                const blob = await response.blob();
                                const fileUrl = URL.createObjectURL(blob);
                                window.open(fileUrl, '_blank');
                            } catch (err) { console.error("Errore PDF history:", err); }
                        } else {
                            showCustomDialog({
                                title: 'PDF non trovato',
                                message: "PDF non trovato nello storico."
                            });
                        }
                    });
                    messageDiv.appendChild(attachDiv);
                }

                aiChatMessagesContainer.appendChild(messageDiv);
                currentSessionMessages.push(msg);
            });
            aiChatMessagesContainer.scrollTop = aiChatMessagesContainer.scrollHeight;

        } else {
            // --- NUOVA SESSIONE ---
            // Genera nuovo ID
            currentChatSessionId = Date.now().toString();

            // Store current PDF ID from dropdown (for new chats)
            const inlinePdfSelect = document.getElementById('inlinePdfSelect');
            currentChatPdfId = inlinePdfSelect?.value;

            // Add initial messages (che attiveranno il salvataggio automatico)
            if (userPrompt) {
                // Passiamo l'oggetto attachment al primo messaggio
                addChatMessage(userPrompt, 'user', false, {
                    type: 'pdf',
                    name: pdfName, // Passato come argomento alla funzione
                    id: currentChatPdfId
                });
            }

            // Add AI response only if provided
            if (aiResponse) {
                addChatMessage(formatAIResponse(aiResponse), 'assistant', true);
            }
        }
    };

    // Hide AI chat view and return to input
    function hideAIChatView() {
        if (aiChatView) aiChatView.classList.remove('active');
        if (inputWrapper) inputWrapper.classList.remove('hidden');
        if (mainTitle) mainTitle.classList.remove('hidden');

        // Clear chat logic
        aiChatMessagesContainer.innerHTML = '';
        currentSessionMessages = [];
        currentChatPdfId = null;
        currentChatSessionId = null; // Reset session ID
        aiChatInput.value = '';
    }

    // Send message in chat
    async function sendChatMessage() {
        const message = aiChatInput.value.trim();
        if (!message || !currentChatPdfId) return;

        // Add user message with PDF attachment reference
        addChatMessage(message, 'user', false, {
            type: 'pdf',
            name: aiChatPdfName.textContent, // Prende il nome attuale visualizzato nell'header
            id: currentChatPdfId
        });

        aiChatInput.value = '';

        // Disable send button
        aiChatSendBtn.disabled = true;
        showTypingIndicator();

        try {
            // Get PDF data
            const pdfs = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'getPDFs' }, response => {
                    resolve(response?.pdfs || []);
                });
            });

            const selectedPdf = pdfs.find(p => p.id == currentChatPdfId);
            if (!selectedPdf) {
                throw new Error("PDF non trovato nello storico.");
            }

            const base64Data = selectedPdf.data.split(',')[1];
            const API_KEY = "AIzaSyA7sc1kQewFRDRHo_XquiFMk14jeOgigGo";
            const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

            const payload = {
                contents: [{
                    parts: [
                        { text: message },
                        {
                            inline_data: {
                                mime_type: "application/pdf",
                                data: base64Data
                            }
                        }
                    ]
                }]
            };

            const response = await fetch(API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            removeTypingIndicator();

            if (!response.ok) {
                throw new Error(data.error?.message || "Errore sconosciuto API Gemini");
            }

            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Nessuna risposta generata.";
            addChatMessage(formatAIResponse(responseText), 'assistant', true);

        } catch (error) {
            removeTypingIndicator();
            addChatMessage(`❌ Errore: ${error.message}`, 'assistant');
        } finally {
            aiChatSendBtn.disabled = false;
        }
    }

    // Event listeners for chat
    if (aiChatBackBtn) {
        aiChatBackBtn.addEventListener('click', hideAIChatView);
    }

    if (aiChatExportBtn) {
        aiChatExportBtn.addEventListener('click', () => {
            if (currentSessionMessages.length === 0) {
                showCustomDialog({ title: 'Chat Vuota', message: 'Non ci sono messaggi da esportare.' });
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const pdfName = aiChatPdfName.textContent || "Documento";

            // Impostazioni Stile
            const margin = 20;
            const pageWidth = doc.internal.pageSize.width;
            let cursorY = 20;

            // Titolo
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(229, 0, 0); // Rosso Havas
            doc.text("Report Conversazione AI", margin, cursorY);
            cursorY += 10;

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.setFont("helvetica", "normal");
            doc.text(`Documento analizzato: ${pdfName}`, margin, cursorY);
            cursorY += 5;
            doc.text(`Data esportazione: ${new Date().toLocaleString()}`, margin, cursorY);
            cursorY += 15;

            // Messaggi
            currentSessionMessages.forEach((msg) => {
                // Controllo cambio pagina
                if (cursorY > 270) {
                    doc.addPage();
                    cursorY = 20;
                }

                // Header Mittente
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                const senderLabel = msg.sender === 'user' ? "UTENTE:" : "ASSISTENTE AI:";
                doc.setTextColor(msg.sender === 'user' ? 0 : 60);
                doc.text(senderLabel, margin, cursorY);
                cursorY += 6;

                // Testo Messaggio (pulizia HTML semplice)
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(33);

                const cleanText = msg.text
                    .replace(/<br>/g, '\n')
                    .replace(/<strong>/g, '')
                    .replace(/<\/strong>/g, '')
                    .replace(/<pre>/g, '\n[Codice]\n')
                    .replace(/<\/pre>/g, '\n')
                    .replace(/<code>/g, '')
                    .replace(/<\/code>/g, '');

                const splitText = doc.splitTextToSize(cleanText, pageWidth - (margin * 2));

                // Verifica se il blocco di testo sta nella pagina, altrimenti nuova pagina
                const blockHeight = (splitText.length * 5) + 10;
                if (cursorY + blockHeight > 285) {
                    doc.addPage();
                    cursorY = 20;
                    doc.text(senderLabel + " (cont.)", margin, cursorY);
                    cursorY += 6;
                }

                doc.text(splitText, margin, cursorY);
                cursorY += (splitText.length * 5) + 10;
            });

            const filename = `Chat_AI_${pdfName.replace(/\s+/g, '_').substring(0, 20)}_${Date.now()}.pdf`;
            doc.save(filename);
            showNotification("PDF della chat generato!");
        });
    }

    const exportAiAnalysisPdfBtn = document.getElementById('exportAiAnalysisPdfBtn');
    if (exportAiAnalysisPdfBtn) {
        exportAiAnalysisPdfBtn.addEventListener('click', () => {
            const outputText = document.getElementById('aiOutputText');
            const pdfSelect = document.getElementById('aiPdfSelect');
            const analysisText = outputText ? outputText.textContent.trim() : '';

            if (!analysisText) {
                showCustomDialog({ title: 'Analisi vuota', message: 'Non ci sono risultati di analisi da esportare. Esegui prima un\'analisi con Gemini AI.' });
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const margin = 20;
            const pageWidth = doc.internal.pageSize.width;
            let cursorY = 20;
            const pdfName = pdfSelect ? (pdfSelect.options[pdfSelect.selectedIndex]?.text || 'Documento') : 'Documento';

            // Titolo
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(229, 0, 0);
            doc.text("Report Analisi AI", margin, cursorY);
            cursorY += 10;

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.setFont("helvetica", "normal");
            doc.text(`Documento: ${pdfName}`, margin, cursorY);
            cursorY += 5;
            doc.text(`Data esportazione: ${new Date().toLocaleString()}`, margin, cursorY);
            cursorY += 15;

            // Separatore
            doc.setDrawColor(229, 0, 0);
            doc.line(margin, cursorY, pageWidth - margin, cursorY);
            cursorY += 10;

            // Contenuto analisi
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.setTextColor(33);

            const splitText = doc.splitTextToSize(analysisText, pageWidth - (margin * 2));
            splitText.forEach(line => {
                if (cursorY > 280) {
                    doc.addPage();
                    cursorY = 20;
                }
                doc.text(line, margin, cursorY);
                cursorY += 5;
            });

            const filename = `Analisi_AI_${pdfName.replace(/\s+/g, '_').substring(0, 20)}_${Date.now()}.pdf`;
            doc.save(filename);
            showNotification('PDF dell\'analisi esportato con successo!');
        });
    }

    if (aiChatSendBtn) {
        aiChatSendBtn.addEventListener('click', sendChatMessage);
    }

    const aiChatbotExportPdfBtn = document.getElementById('aiChatbotExportPdfBtn');
    if (aiChatbotExportPdfBtn) {
        aiChatbotExportPdfBtn.addEventListener('click', () => {
            const messagesContainer = document.getElementById('aiChatbotMessages');
            if (!messagesContainer) return;

            const messages = messagesContainer.querySelectorAll('.ai-chat-message');
            if (messages.length <= 1) {
                showCustomDialog({ title: 'Chat Vuota', message: 'Non ci sono messaggi da esportare.' });
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            const margin = 20;
            const pageWidth = doc.internal.pageSize.width;
            let cursorY = 20;

            const pdfSelect = document.getElementById('aiChatbotPdfSelect');
            const pdfName = pdfSelect ? (pdfSelect.options[pdfSelect.selectedIndex]?.text || 'Documento') : 'Documento';

            // Titolo
            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.setTextColor(229, 0, 0);
            doc.text("Report Conversazione AI", margin, cursorY);
            cursorY += 10;

            doc.setFontSize(10);
            doc.setTextColor(100);
            doc.setFont("helvetica", "normal");
            doc.text(`Documento: ${pdfName}`, margin, cursorY);
            cursorY += 5;
            doc.text(`Data esportazione: ${new Date().toLocaleString()}`, margin, cursorY);
            cursorY += 12;

            doc.setDrawColor(229, 0, 0);
            doc.line(margin, cursorY, pageWidth - margin, cursorY);
            cursorY += 10;

            messages.forEach((msg) => {
                const isUser = msg.classList.contains('user');
                const rawText = msg.innerText || msg.textContent || '';
                const cleanText = rawText.trim();
                if (!cleanText) return;

                if (cursorY > 270) { doc.addPage(); cursorY = 20; }

                doc.setFont("helvetica", "bold");
                doc.setFontSize(10);
                doc.setTextColor(isUser ? 229 : 60, isUser ? 0 : 60, isUser ? 0 : 60);
                doc.text(isUser ? "UTENTE:" : "ASSISTENTE AI:", margin, cursorY);
                cursorY += 6;

                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(33);

                const splitText = doc.splitTextToSize(cleanText, pageWidth - (margin * 2));
                const blockHeight = (splitText.length * 5) + 8;
                if (cursorY + blockHeight > 285) { doc.addPage(); cursorY = 20; }
                doc.text(splitText, margin, cursorY);
                cursorY += blockHeight;
            });

            const filename = `Chat_AI_${pdfName.replace(/\s+/g, '_').substring(0, 20)}_${Date.now()}.pdf`;
            doc.save(filename);
            showNotification('PDF della conversazione esportato!');
        });
    }

    if (aiChatInput) {
        aiChatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });

        // Auto-resize textarea
        aiChatInput.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 150) + 'px';
        });
    }

}); // End DOMContentLoaded

// Enhanced prompt management with edit functionality
(function () {
    // Override renderPromptsList to add edit capability
    const originalRender = window.renderPromptsList;

    window.renderPromptsListEnhanced = function () {
        const aiPromptsList = document.getElementById('aiPromptsList');
        const aiPromptTextarea = document.getElementById('aiPromptTextarea');
        if (!aiPromptsList) return;

        const PROMPTS_STORAGE_KEY = 'havas_ai_saved_prompts';

        function loadSavedPrompts() {
            const saved = localStorage.getItem(PROMPTS_STORAGE_KEY);
            if (saved) {
                return JSON.parse(saved);
            }
            return [
                { name: 'Analisi Brand', prompt: 'Per ogni brand identificato nel documento, redigi un commento di due righe che analizzi brevemente lo stile o il contenuto visivo.' },
                { name: 'Palette Colori', prompt: 'Identifica i colori principali usati da ogni brand e descrivi la palette cromatica.' },
                { name: 'Confronto Brand', prompt: 'Confronta lo stile visivo dei diversi brand e identifica somiglianze e differenze.' }
            ];
        }

        function saveSavedPrompts(prompts) {
            localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts));
        }

        const prompts = loadSavedPrompts();
        aiPromptsList.innerHTML = '';

        prompts.forEach((item, index) => {
            const div = document.createElement('div');
            div.className = 'ai-prompt-item';
            div.innerHTML = `
                <div class="ai-prompt-item-name">
                    <span class="prompt-name-text">${item.name}</span>
                    <div style="display: flex; gap: 4px;">
                        <button class="ai-prompt-edit" data-index="${index}" title="Modifica" style="background: none; border: none; cursor: pointer; padding: 2px 4px; font-size: 12px;">✏️</button>
                        <button class="ai-prompt-delete" data-index="${index}" title="Elimina" style="color: #999; background: none; border: none; cursor: pointer; padding: 2px 6px; font-size: 14px; margin: 0;">×</button>
                    </div>
                </div>
                <div class="ai-prompt-item-preview">${item.prompt.substring(0, 40)}...</div>
            `;

            // Click to use prompt
            div.addEventListener('click', (e) => {
                if (e.target.classList.contains('ai-prompt-delete') || e.target.classList.contains('ai-prompt-edit')) return;
                if (aiPromptTextarea) {
                    aiPromptTextarea.value = item.prompt;
                    aiPromptTextarea.focus();
                }
            });

            aiPromptsList.appendChild(div);
        });

        // Add edit handlers
        aiPromptsList.querySelectorAll('.ai-prompt-edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                const prompts = loadSavedPrompts();
                const item = prompts[index];

                const newName = await showCustomDialog({
                    type: 'prompt',
                    title: 'Modifica Nome',
                    message: 'Nome del prompt:',
                    defaultValue: item.name
                });
                if (newName === null) return;

                const newPrompt = await showCustomDialog({
                    type: 'prompt',
                    title: 'Modifica Testo',
                    message: 'Testo del prompt:',
                    defaultValue: item.prompt
                });
                if (newPrompt === null) return;

                if (newName.trim() && newPrompt.trim()) {
                    prompts[index] = { name: newName.trim(), prompt: newPrompt.trim() };
                    saveSavedPrompts(prompts);
                    window.renderPromptsListEnhanced();
                }
            });
        });

        // Add delete handlers
        aiPromptsList.querySelectorAll('.ai-prompt-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index, 10);
                showCustomDialog({
                    type: 'confirm',
                    title: 'Elimina Prompt',
                    message: 'Eliminare questo prompt?'
                }).then(confirmed => {
                    if (confirmed) {
                        const prompts = loadSavedPrompts();
                        prompts.splice(index, 1);
                        saveSavedPrompts(prompts);
                        window.renderPromptsListEnhanced();
                    }
                });
            });
        });
    };

    // Run after DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(window.renderPromptsListEnhanced, 100);
        });
    } else {
        setTimeout(window.renderPromptsListEnhanced, 100);
    }
})();

// === PROMPT MANAGER SYSTEM ===
(function () {
    const PROMPT_CHIPS_STORAGE_KEY = 'havas_prompt_chips';

    // Default prompts
    const DEFAULT_PROMPTS = [
        { id: 1, name: 'Identifica Brand', emoji: '🏷️', text: 'Analizza le immagini e identifica i brand presenti', visible: true, order: 0 },
        { id: 2, name: 'Descrivi Contenuto', emoji: '👁️', text: 'Descrivi il contenuto visivo delle immagini', visible: true, order: 1 }
    ];

    let prompts = [];
    let editingPromptId = null;
    let draggedItem = null;

    // DOM Elements
    const promptManagerToggle = document.getElementById('promptManagerToggle');
    const promptManagerPanel = document.getElementById('promptManagerPanel');
    const promptManagerOverlay = document.getElementById('promptManagerOverlay');
    const closePromptManager = document.getElementById('closePromptManager');
    const promptManagerList = document.getElementById('promptManagerList');
    const addNewPromptBtn = document.getElementById('addNewPromptBtn');
    const savePromptOrderBtn = document.getElementById('savePromptOrderBtn');
    const promptEditModal = document.getElementById('promptEditModal');
    const promptEditTitle = document.getElementById('promptEditTitle');
    const promptEditName = document.getElementById('promptEditName');
    const promptEditEmoji = document.getElementById('promptEditEmoji');
    const promptEditText = document.getElementById('promptEditText');
    const promptEditSave = document.getElementById('promptEditSave');
    const promptEditCancel = document.getElementById('promptEditCancel');

    // Load prompts from storage
    function loadPrompts() {
        const saved = localStorage.getItem(PROMPT_CHIPS_STORAGE_KEY);
        if (saved) {
            prompts = JSON.parse(saved);
        } else {
            prompts = [...DEFAULT_PROMPTS];
            savePrompts();
        }
        return prompts;
    }

    // Save prompts to storage
    function savePrompts() {
        localStorage.setItem(PROMPT_CHIPS_STORAGE_KEY, JSON.stringify(prompts));
        renderPromptChips();
    }

    // Generate unique ID
    function generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }

    // Open panel
    function openPanel() {
        if (promptManagerPanel) {
            promptManagerPanel.classList.add('open');
            promptManagerOverlay.classList.add('active');
            renderPromptManagerList();
        }
    }

    // Close panel
    function closePanel() {
        if (promptManagerPanel) {
            promptManagerPanel.classList.remove('open');
            promptManagerOverlay.classList.remove('active');
        }
    }

    // Open edit modal
    function openEditModal(prompt = null) {
        editingPromptId = prompt ? prompt.id : null;
        promptEditTitle.textContent = prompt ? 'Modifica Prompt' : 'Nuovo Prompt';
        promptEditName.value = prompt ? prompt.name : '';
        promptEditEmoji.value = prompt ? prompt.emoji : '';
        promptEditText.value = prompt ? prompt.text : '';
        promptEditModal.classList.add('open');
        promptEditName.focus();
    }

    // Close edit modal
    function closeEditModal() {
        promptEditModal.classList.remove('open');
        editingPromptId = null;
    }

    // Save prompt from modal
    function savePromptFromModal() {
        const name = promptEditName.value.trim();
        const emoji = promptEditEmoji.value.trim() || '💬';
        const text = promptEditText.value.trim();

        if (!name || !text) {
            showCustomDialog({
                title: 'Campi Obbligatori',
                message: 'Nome e testo del prompt sono obbligatori.'
            });
            return;
        }

        if (editingPromptId) {
            // Edit existing
            const index = prompts.findIndex(p => p.id === editingPromptId);
            if (index !== -1) {
                prompts[index].name = name;
                prompts[index].emoji = emoji;
                prompts[index].text = text;
            }
        } else {
            // Add new
            const maxOrder = prompts.length > 0 ? Math.max(...prompts.map(p => p.order)) : -1;
            prompts.push({
                id: generateId(),
                name: name,
                emoji: emoji,
                text: text,
                visible: true,
                order: maxOrder + 1
            });
        }

        savePrompts();
        closeEditModal();
        renderPromptManagerList();
    }

    // Delete prompt
    function deletePrompt(id) {
        showCustomDialog({
            type: 'confirm',
            title: 'Elimina Prompt',
            message: 'Eliminare questo prompt?'
        }).then(confirmed => {
            if (confirmed) {
                prompts = prompts.filter(p => p.id !== id);
                savePrompts();
                renderPromptManagerList();
            }
        });
    }

    // Toggle visibility
    function toggleVisibility(id) {
        const prompt = prompts.find(p => p.id === id);
        if (prompt) {
            prompt.visible = !prompt.visible;
            savePrompts();
            renderPromptManagerList();
        }
    }

    // Render prompt manager list
    function renderPromptManagerList() {
        if (!promptManagerList) return;

        const sortedPrompts = [...prompts].sort((a, b) => a.order - b.order);
        promptManagerList.innerHTML = '';

        sortedPrompts.forEach((prompt, index) => {
            const item = document.createElement('div');
            item.className = 'prompt-manager-item' + (prompt.visible ? '' : ' hidden-prompt');
            item.dataset.id = prompt.id;
            item.draggable = true;

            item.innerHTML = `
                <span class="prompt-drag-handle">⋮⋮</span>
                <div class="prompt-item-content">
                    <div class="prompt-item-name">
                        <span class="prompt-item-emoji">${prompt.emoji}</span>
                        ${prompt.name}
                    </div>
                    <div class="prompt-item-text">${prompt.text}</div>
                </div>
                <div class="prompt-item-actions">
                    <button class="prompt-item-btn visibility-btn ${prompt.visible ? '' : 'hidden'}" data-id="${prompt.id}" title="${prompt.visible ? 'Nascondi' : 'Mostra'}">
                        ${prompt.visible ?
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>' :
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
                }
                    </button>
                    <button class="prompt-item-btn edit-btn" data-id="${prompt.id}" title="Modifica">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="prompt-item-btn delete-btn" data-id="${prompt.id}" title="Elimina">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width:16px;height:16px;">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            // Drag events
            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragend', handleDragEnd);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);

            // Button events
            item.querySelector('.visibility-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleVisibility(prompt.id);
            });

            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openEditModal(prompt);
            });

            item.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deletePrompt(prompt.id);
            });

            promptManagerList.appendChild(item);
        });
    }

    // Drag and drop handlers
    function handleDragStart(e) {
        draggedItem = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        draggedItem = null;
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const afterElement = getDragAfterElement(promptManagerList, e.clientY);
        if (draggedItem && afterElement) {
            promptManagerList.insertBefore(draggedItem, afterElement);
        } else if (draggedItem) {
            promptManagerList.appendChild(draggedItem);
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        updateOrderFromDOM();
    }

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.prompt-manager-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }

    function updateOrderFromDOM() {
        const items = promptManagerList.querySelectorAll('.prompt-manager-item');
        items.forEach((item, index) => {
            const id = item.dataset.id;
            const prompt = prompts.find(p => String(p.id) === String(id));
            if (prompt) {
                prompt.order = index;
            }
        });
        savePrompts();
    }

    // Render prompt chips in UI (both inline and panel)
    function renderPromptChips() {
        const visiblePrompts = prompts.filter(p => p.visible).sort((a, b) => a.order - b.order);

        // Render inline chips
        const inlineContainer = document.getElementById('inlinePrompts');
        if (inlineContainer) {
            inlineContainer.innerHTML = '';
            visiblePrompts.forEach(prompt => {
                const chip = document.createElement('div');
                chip.className = 'prompt-chip-inline';
                chip.dataset.prompt = prompt.text;
                chip.textContent = `${prompt.emoji} ${prompt.name}`;
                inlineContainer.appendChild(chip);
            });
        }

        // Render AI panel chips
        const aiChipsContainer = document.getElementById('aiPromptChips');
        if (aiChipsContainer) {
            aiChipsContainer.innerHTML = '';
            visiblePrompts.forEach(prompt => {
                const chip = document.createElement('button');
                chip.className = 'prompt-chip';
                chip.dataset.prompt = prompt.text;
                chip.textContent = `${prompt.emoji} ${prompt.name}`;
                aiChipsContainer.appendChild(chip);
            });
        }
    }

    // Event listeners
    if (promptManagerToggle) {
        promptManagerToggle.addEventListener('click', openPanel);
    }

    if (closePromptManager) {
        closePromptManager.addEventListener('click', closePanel);
    }

    if (promptManagerOverlay) {
        promptManagerOverlay.addEventListener('click', closePanel);
    }

    if (addNewPromptBtn) {
        addNewPromptBtn.addEventListener('click', () => openEditModal());
    }

    if (savePromptOrderBtn) {
        savePromptOrderBtn.addEventListener('click', () => {
            savePrompts();
            showCustomDialog({
                title: 'Ordine Salvato',
                message: 'Ordine salvato!'
            });
        });
    }

    if (promptEditSave) {
        promptEditSave.addEventListener('click', savePromptFromModal);
    }

    if (promptEditCancel) {
        promptEditCancel.addEventListener('click', closeEditModal);
    }

    // Close modal on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (promptEditModal && promptEditModal.classList.contains('open')) {
                closeEditModal();
            } else if (promptManagerPanel && promptManagerPanel.classList.contains('open')) {
                closePanel();
            }
        }
    });

    // Initialize
    loadPrompts();
    renderPromptChips();
})();
