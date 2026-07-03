// content_script.js -- VERSIONE UNIFICATA E CON SUPPORTO PER INSTAGRAM REELS

if (typeof window.captureScriptInjected === 'undefined') {
  window.captureScriptInjected = true;

  // Funzione globale per ritagliare l'immagine (usata dallo scraper)
  window.cropImage = async function (dataUrl, area) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const dpr = area.dpr || 1;

        canvas.width = area.width * dpr;
        canvas.height = area.height * dpr;

        ctx.drawImage(
          img,
          area.x * dpr, area.y * dpr, area.width * dpr, area.height * dpr,
          0, 0, canvas.width, canvas.height
        );
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = dataUrl;
    });
  };

  // ========= FUNZIONE ESTRAZIONE METRICHE INSTAGRAM =========
  function getInstagramMetrics(rootElement = document) {
    const PATH_SIGNATURES = { likes: "M16.792 3.904", comments: "M20.656 17.008", reshares: "M19.998 9.497" };
    const metrics = { likes: 0, comments: 0, reshares: 0 };
    const parseMetricValue = (text) => {
      if (!text) return 0;
      text = text.trim();
      let multiplier = 1;
      if (text.toUpperCase().includes('K')) multiplier = 1000;
      else if (text.toUpperCase().includes('M')) multiplier = 1000000;
      let cleanNumber = text.replace(/[^\d.,]/g, '');
      if (multiplier > 1) {
        // Se c'è K o M, la virgola è un decimale (es: 1,5K -> 1.5)
        cleanNumber = cleanNumber.replace(',', '.');
      } else {
        // Se è un numero intero puro, il punto è un separatore di migliaia (es: 1.234 -> 1234) e va rimosso
        cleanNumber = cleanNumber.replace(/\./g, '').replace(/,/g, '');
      }
      return Math.floor(parseFloat(cleanNumber) * multiplier) || 0;
    };

    // Metodo 1: Cerca usando le firme SVG (funziona su Instagram diretto)
    const paths = rootElement.querySelectorAll('path');
    paths.forEach(path => {
      const d = path.getAttribute('d');
      let type = null;
      if (d && d.startsWith(PATH_SIGNATURES.likes)) type = 'likes';
      else if (d && d.startsWith(PATH_SIGNATURES.comments)) type = 'comments';
      else if (d && d.startsWith(PATH_SIGNATURES.reshares)) type = 'reshares';
      if (type) {
        let currentElement = path.closest('svg');
        let found = false;
        for (let i = 0; i < 7; i++) {
          if (!currentElement) break;
          let sibling = currentElement.nextElementSibling;
          while (sibling) {
            const text = sibling.innerText;
            if (text && /^[\d.,]+[KMkm]?$/.test(text.trim())) {
              metrics[type] = parseMetricValue(text);
              found = true;
              break;
            }
            sibling = sibling.nextElementSibling;
          }
          if (found) break;
          currentElement = currentElement.parentElement;
        }
      }
    });

    // Metodo 2: Fallback con aria-label (funziona su molte piattaforme)
    if (metrics.likes === 0 && metrics.comments === 0) {
      // Cerca elementi con aria-label contenenti "like", "mi piace", "comment", "commenti"
      const likePatterns = ['like', 'mi piace', 'piace', 'cuore'];
      const commentPatterns = ['comment', 'commenti', 'commento'];
      const sharePatterns = ['share', 'condivi', 'invia', 'reshare'];

      const allElements = rootElement.querySelectorAll('[aria-label]');
      allElements.forEach(el => {
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const text = el.innerText || el.textContent || '';

        // Cerca numeri nel testo o nell'aria-label
        const numberMatch = (label + ' ' + text).match(/([\d.,]+[KMkm]?)/);
        if (numberMatch) {
          const value = parseMetricValue(numberMatch[1]);
          if (value > 0) {
            if (likePatterns.some(p => label.includes(p)) && metrics.likes === 0) {
              metrics.likes = value;
            } else if (commentPatterns.some(p => label.includes(p)) && metrics.comments === 0) {
              metrics.comments = value;
            } else if (sharePatterns.some(p => label.includes(p)) && metrics.reshares === 0) {
              metrics.reshares = value;
            }
          }
        }
      });
    }

    // Metodo 3: Cerca testo vicino a icone comuni (fallback generico)
    if (metrics.likes === 0 && metrics.comments === 0) {
      // Cerca span/div con solo numeri vicino a SVG
      const svgElements = rootElement.querySelectorAll('svg');
      svgElements.forEach(svg => {
        const parent = svg.parentElement;
        if (!parent) return;

        // Cerca siblings con numeri
        const siblings = parent.querySelectorAll('span, div');
        siblings.forEach(sibling => {
          const text = (sibling.innerText || '').trim();
          if (/^[\d.,]+[KMkm]?$/.test(text)) {
            const value = parseMetricValue(text);
            if (value > 0) {
              // Assegna al primo slot disponibile
              if (metrics.likes === 0) metrics.likes = value;
              else if (metrics.comments === 0) metrics.comments = value;
              else if (metrics.reshares === 0) metrics.reshares = value;
            }
          }
        });
      });
    }

    console.log("Metriche Instagram/Meta estratte:", metrics);
    return metrics;
  }

  function getTikTokMetrics() {
    const metrics = { likes: 0, comments: 0, reshares: 0 }; // 'reshares' viene usato qui per i salvati/preferiti

    const parseMetricValue = (text) => {
      if (!text) return 0;
      text = text.trim().toUpperCase();
      let multiplier = 1;
      if (text.includes('K')) multiplier = 1000;
      else if (text.includes('M')) multiplier = 1000000;
      let cleanNumber = text.replace(/[^\d.,]/g, '').replace(',', '.');
      return Math.floor(parseFloat(cleanNumber) * multiplier) || 0;
    };

    // Selettori basati sul tuo file SELETTORI.txt
    const likeEl = document.querySelector('[data-e2e="browse-like-count"], [data-e2e="like-count"]');
    const commentEl = document.querySelector('[data-e2e="browse-comment-count"], [data-e2e="comment-count"]');
    const saveEl = document.querySelector('[data-e2e="undefined-count"], [data-e2e="favorite-count"]');

    if (likeEl) metrics.likes = parseMetricValue(likeEl.innerText);
    if (commentEl) metrics.comments = parseMetricValue(commentEl.innerText);
    if (saveEl) metrics.reshares = parseMetricValue(saveEl.innerText);

    console.log("Metriche TikTok estratte:", metrics);
    return metrics;
  }

  function getTikTokCaption() {
    try {
      // Selettore per la descrizione completa (inclusi gli hashtag)
      const container = document.querySelector('[data-e2e="browse-video-desc"], [class*="DivDescriptionContent"]');
      if (container) {
        let text = container.innerText.trim();
        // Rimuoviamo solo il testo del pulsante "altro" se presente, ma manteniamo gli hashtag
        text = text.replace(/... altro/i, '').replace(/... more/i, '').trim();
        return text;
      }
    } catch (e) { console.warn("Errore caption TikTok:", e); }
    return null;
  }

  // Funzione helper: converte una data relativa TikTok in data assoluta (formato italiano)
  function convertTikTokRelativeDate(text) {
    if (!text || typeof text !== 'string') return null;
    const cleaned = text.replace('·', '').trim().toLowerCase();

    // Se è già una data assoluta (es. 2024-12-15, 12-15, 15 gen 2024, etc.), restituiscila così com'è
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(cleaned)) {
      // Formato YYYY-MM-DD -> converti in formato italiano
      const d = new Date(cleaned);
      if (!isNaN(d.getTime())) return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
      return text.replace('·', '').trim();
    }
    if (/^\d{1,2}-\d{1,2}$/.test(cleaned)) {
      // Formato MM-DD (senza anno, assume anno corrente)
      const parts = cleaned.split('-');
      const d = new Date(new Date().getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));
      if (!isNaN(d.getTime())) return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
      return text.replace('·', '').trim();
    }

    // Pattern per date relative in varie lingue (italiano, inglese, ecc.)
    const relativePatterns = [
      // Italiano
      { regex: /(\d+)\s*(gg|giorni?|giorno)\s*(fa)?/i, unit: 'days' },
      { regex: /(\d+)\s*(sett|settimane?|settimana)\s*(fa)?/i, unit: 'weeks' },
      { regex: /(\d+)\s*(mesi?|mese)\s*(fa)?/i, unit: 'months' },
      { regex: /(\d+)\s*(ore?|ora)\s*(fa)?/i, unit: 'hours' },
      { regex: /(\d+)\s*(min|minuti?|minuto)\s*(fa)?/i, unit: 'minutes' },
      { regex: /(\d+)\s*(anni?|anno)\s*(fa)?/i, unit: 'years' },
      // Inglese
      { regex: /(\d+)\s*(d|days?)\s*(ago)?/i, unit: 'days' },
      { regex: /(\d+)\s*(w|weeks?)\s*(ago)?/i, unit: 'weeks' },
      { regex: /(\d+)\s*(mo|months?)\s*(ago)?/i, unit: 'months' },
      { regex: /(\d+)\s*(h|hours?)\s*(ago)?/i, unit: 'hours' },
      { regex: /(\d+)\s*(m|min|minutes?)\s*(ago)?/i, unit: 'minutes' },
      { regex: /(\d+)\s*(y|years?)\s*(ago)?/i, unit: 'years' },
    ];

    for (const pattern of relativePatterns) {
      const match = cleaned.match(pattern.regex);
      if (match) {
        const value = parseInt(match[1]);
        const now = new Date();
        switch (pattern.unit) {
          case 'minutes': now.setMinutes(now.getMinutes() - value); break;
          case 'hours': now.setHours(now.getHours() - value); break;
          case 'days': now.setDate(now.getDate() - value); break;
          case 'weeks': now.setDate(now.getDate() - (value * 7)); break;
          case 'months': now.setMonth(now.getMonth() - value); break;
          case 'years': now.setFullYear(now.getFullYear() - value); break;
        }
        console.log(`[TikTok Date] Data relativa "${text}" convertita in: ${now.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}`);
        return now.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
      }
    }

    return null; // Non è una data relativa riconosciuta
  }

  function getTikTokDate() {
    try {
      console.log("[TikTok Date] Inizio estrazione data...");

      // ========= METODO 1: Estrai la data dal Video ID nell'URL (PIÙ AFFIDABILE) =========
      // L'ID del video TikTok codifica un timestamp Unix nei primi 32 bit
      const urlMatch = window.location.href.match(/\/video\/(\d+)/);
      if (urlMatch && urlMatch[1]) {
        const videoId = urlMatch[1];
        // I primi 32 bit del video ID sono il timestamp Unix
        // Il video ID è un numero a 64 bit: i primi 32 bit = timestamp
        const timestamp = BigInt(videoId) >> 32n;
        const dateObj = new Date(Number(timestamp) * 1000);
        if (!isNaN(dateObj.getTime()) && dateObj.getFullYear() > 2016 && dateObj.getFullYear() <= new Date().getFullYear() + 1) {
          const formattedDate = dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
          console.log(`[TikTok Date] ✅ Data estratta dal Video ID (${videoId}): ${formattedDate}`);
          return formattedDate;
        }
      }

      // ========= METODO 2: Estrai dal JSON incorporato nella pagina =========
      const scripts = document.querySelectorAll('script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE, script#__NEXT_DATA__');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent);
          // Cerca createTime in vari percorsi possibili
          let createTime = null;

          // Percorso 1: __UNIVERSAL_DATA_FOR_REHYDRATION__
          if (data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct?.createTime) {
            createTime = data.__DEFAULT_SCOPE__['webapp.video-detail'].itemInfo.itemStruct.createTime;
          }
          // Percorso 2: SIGI_STATE
          if (!createTime && data?.ItemModule) {
            const firstKey = Object.keys(data.ItemModule)[0];
            if (firstKey && data.ItemModule[firstKey]?.createTime) {
              createTime = data.ItemModule[firstKey].createTime;
            }
          }
          // Percorso 3: generico - cerca ricorsivamente "createTime"
          if (!createTime) {
            const jsonStr = script.textContent;
            const ctMatch = jsonStr.match(/"createTime"\s*:\s*"?(\d{10})"?/);
            if (ctMatch) createTime = ctMatch[1];
          }

          if (createTime) {
            const dateObj = new Date(parseInt(createTime) * 1000);
            if (!isNaN(dateObj.getTime())) {
              const formattedDate = dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
              console.log(`[TikTok Date] ✅ Data estratta dal JSON incorporato: ${formattedDate}`);
              return formattedDate;
            }
          }
        } catch (jsonErr) {
          console.warn("[TikTok Date] Errore parsing JSON script:", jsonErr);
        }
      }

      // ========= METODO 3: DOM - Cerca nel contenitore PRINCIPALE del video (non nei post laterali) =========
      // Cerchiamo di limitare la ricerca al contenitore del video principale
      // TikTok usa vari contenitori: [data-e2e="browse-video"], il primo video visibile, ecc.
      const mainVideoContainers = [
        // Contenitori specifici del video principale in visualizzazione browser/explore
        document.querySelector('[data-e2e="browse-video"]')?.closest('[class*="DivBrowserMode"], [class*="DivVideoContainer"]'),
        // Video singolo aperto
        document.querySelector('[data-e2e="video-detail"]'),
        document.querySelector('[class*="DivVideoDetailContainer"]'),
        // Il contenitore con la descrizione del post principale
        document.querySelector('[data-e2e="browse-video-desc"]')?.closest('[class*="DivContent"], [class*="DivInfoContainer"]'),
        // Fallback: il primo contenitore video visibile
        document.querySelector('[class*="DivBrowserModeContainer"]'),
      ].filter(Boolean);

      for (const container of mainVideoContainers) {
        const nickname = container.querySelector('[data-e2e="browser-nickname"]');
        if (nickname) {
          const parent = nickname.parentElement;
          const spans = parent.querySelectorAll('span');
          for (let i = spans.length - 1; i >= 0; i--) {
            const text = spans[i].innerText.trim();
            if (text.length > 0 && text !== '·' && text !== nickname.innerText) {
              const rawDate = text.replace('·', '').trim();
              // Prova a convertire se è relativa
              const converted = convertTikTokRelativeDate(rawDate);
              if (converted) {
                console.log(`[TikTok Date] ✅ Data trovata nel contenitore principale (DOM): ${converted}`);
                return converted;
              }
              // Se non è relativa e non è stata convertita, restituiscila così com'è
              console.log(`[TikTok Date] ✅ Data trovata nel contenitore principale (DOM, non convertita): ${rawDate}`);
              return rawDate;
            }
          }
        }
      }

      // ========= METODO 4: Fallback DOM generico con conversione date relative =========
      // Usa il vecchio selettore ma SOLO come ultima risorsa, con conversione
      const nickname = document.querySelector('[data-e2e="browser-nickname"]');
      if (nickname) {
        const parent = nickname.parentElement;
        const spans = parent.querySelectorAll('span');
        for (let i = spans.length - 1; i >= 0; i--) {
          const text = spans[i].innerText.trim();
          if (text.length > 0 && text !== '·' && text !== nickname.innerText) {
            const rawDate = text.replace('·', '').trim();
            const converted = convertTikTokRelativeDate(rawDate);
            if (converted) {
              console.log(`[TikTok Date] ✅ Data trovata (fallback DOM): ${converted}`);
              return converted;
            }
            console.log(`[TikTok Date] ⚠️ Data trovata (fallback DOM, non convertita): ${rawDate}`);
            return rawDate;
          }
        }
      }

      // Metodo finale: selettore generico
      const genericDate = document.querySelector('span[class*="SpanOtherInfo"]');
      if (genericDate) {
        const rawDate = genericDate.innerText.replace('·', '').trim();
        const converted = convertTikTokRelativeDate(rawDate);
        if (converted) {
          console.log(`[TikTok Date] ✅ Data trovata (SpanOtherInfo): ${converted}`);
          return converted;
        }
        return rawDate;
      }

      console.log("[TikTok Date] ⚠️ Nessuna data trovata.");
    } catch (e) { console.warn("Errore data TikTok:", e); }
    return null;
  }
  // ========= FINE FUNZIONI METRICHE =========

  // ========= FUNZIONI DI UTILITÀ =========
  function showSuccessModal() {
    if (document.getElementById('capture-success-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'capture-success-modal';
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.7); z-index: 9999999; display: flex; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.3s ease;`;
    const content = document.createElement('div');
    content.style.cssText = `background-color: white; padding: 40px 60px; border-radius: 15px; text-align: center; transform: scale(0.8); transition: transform 0.3s ease;`;
    content.innerHTML = `<svg width="80" height="80" viewBox="0 0 52 52" style="display: block; margin: 0 auto 20px auto;"><circle cx="26" cy="26" r="25" fill="#4CAF50"/><path fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg><h2 style="color: #333; font-family: Arial, sans-serif; font-size: 28px; margin: 0;">Screenshot Fatto!</h2>`;
    modal.appendChild(content);
    document.body.appendChild(modal);
    setTimeout(() => { modal.style.opacity = '1'; content.style.transform = 'scale(1)'; }, 10);
    setTimeout(() => {
      modal.style.opacity = '0';
      content.style.transform = 'scale(0.8)';
      setTimeout(() => { if (modal.parentNode) { document.body.removeChild(modal); } }, 300);
    }, 1200);
  }

  // --- NUOVA FUNZIONE: Custom Dialog per Content Script (Sostituisce alert, confirm, prompt) ---
  function showContentCustomDialog({ type = 'alert', title = 'Messaggio', message = '', defaultValue = '' }) {
    return new Promise((resolve) => {
      const modalId = 'havas-custom-dialog-modal';
      let modal = document.getElementById(modalId);

      if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.style.cssText = `
          position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
          background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(5px);
          z-index: 10000000; display: flex; justify-content: center; align-items: center;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        `;
        modal.innerHTML = `
          <div style="background: #1a1a1a; border: 1px solid #333; border-radius: 12px; width: 350px; padding: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); text-align: center;">
            <div id="havas-dialog-icon" style="font-size: 40px; margin-bottom: 15px;">ℹ️</div>
            <h3 id="havas-dialog-title" style="margin: 0 0 10px 0; color: #fff; font-size: 20px;">Titolo</h3>
            <p id="havas-dialog-message" style="margin: 0 0 20px 0; color: #ccc; font-size: 14px; line-height: 1.5;">Messaggio del dialogo qui.</p>
            <input id="havas-dialog-input" type="text" style="display: none; width: 100%; background: #2a2a2a; border: 1px solid #444; border-radius: 6px; padding: 10px; color: #fff; margin-bottom: 20px; outline: none;">
            <div style="display: flex; gap: 10px; justify-content: center;">
              <button id="havas-dialog-cancel-btn" style="display: none; flex: 1; padding: 10px; border-radius: 6px; border: 1px solid #444; background: transparent; color: #ccc; cursor: pointer; transition: 0.2s;">Annulla</button>
              <button id="havas-dialog-confirm-btn" style="flex: 1; padding: 10px; border-radius: 6px; border: none; background: #E50000; color: #fff; font-weight: bold; cursor: pointer; transition: 0.2s;">OK</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);

        const cancelBtn = modal.querySelector('#havas-dialog-cancel-btn');
        cancelBtn.onmouseover = () => cancelBtn.style.background = 'rgba(255,255,255,0.05)';
        cancelBtn.onmouseout = () => cancelBtn.style.background = 'transparent';

        const confirmBtn = modal.querySelector('#havas-dialog-confirm-btn');
        confirmBtn.onmouseover = () => confirmBtn.style.background = '#ff1a1a';
        confirmBtn.onmouseout = () => confirmBtn.style.background = '#E50000';
      }

      const icon = modal.querySelector('#havas-dialog-icon');
      const titleEl = modal.querySelector('#havas-dialog-title');
      const messageEl = modal.querySelector('#havas-dialog-message');
      const input = modal.querySelector('#havas-dialog-input');
      const confirmBtn = modal.querySelector('#havas-dialog-confirm-btn');
      const cancelBtn = modal.querySelector('#havas-dialog-cancel-btn');

      // Reset UI
      titleEl.textContent = title;
      messageEl.textContent = message;
      input.style.display = 'none';
      cancelBtn.style.display = 'none';
      confirmBtn.textContent = 'OK';
      modal.style.display = 'flex';

      // Configure based on type
      if (type === 'alert') {
        icon.textContent = 'ℹ️';
        icon.style.color = '#E50000';
      } else if (type === 'confirm') {
        icon.textContent = '❓';
        icon.style.color = '#ffcc00';
        cancelBtn.style.display = 'block';
      } else if (type === 'prompt') {
        icon.textContent = '✏️';
        icon.style.color = '#00ccff';
        input.style.display = 'block';
        input.value = defaultValue;
        cancelBtn.style.display = 'block';
      }

      const cleanup = () => {
        modal.style.display = 'none';
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
      };

      confirmBtn.onclick = () => {
        cleanup();
        if (type === 'prompt') resolve(input.value);
        else resolve(true);
      };

      cancelBtn.onclick = () => {
        cleanup();
        if (type === 'prompt') resolve(null);
        else resolve(false);
      };
    });
  }

  function createControlUI() {
    if (document.getElementById('capture-control-ui')) return;

    // Container principale (Flex Column)
    const container = document.createElement('div');
    container.id = 'capture-control-ui';
    container.style.cssText = `position: fixed; top: 10px; right: 10px; z-index: 999999; background-color: rgba(0, 0, 0, 0.85); padding: 12px; border-radius: 8px; display: flex; flex-direction: column; gap: 8px; border: 1px solid #E50000; box-shadow: 0 4px 15px rgba(0,0,0,0.6); align-items: center; min-width: 180px;`;

    // Container Pulsanti (Flex Row)
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = `display: flex; gap: 10px; width: 100%; justify-content: center;`;

    const createButton = (id, text, title) => {
      const button = document.createElement('button');
      button.id = id; button.textContent = text; button.title = title;
      button.style.cssText = `background-color: #333; color: white; border: 1px solid #555; padding: 6px 12px; border-radius: 5px; cursor: pointer; font-family: Arial, sans-serif; font-size: 13px; flex: 1;`;
      button.onmouseover = () => button.style.backgroundColor = '#555';
      button.onmouseout = () => button.style.backgroundColor = '#333';
      return button;
    };

    const pauseButton = createButton('capture-pause-btn', 'Pausa', 'Mette in pausa il processo');
    const resumeButton = createButton('capture-resume-btn', 'Riprendi', 'Riprende il processo');
    const stopButton = createButton('capture-stop-btn', 'Stop', 'Interrompe il processo');

    resumeButton.style.display = 'none';

    pauseButton.addEventListener('click', () => { chrome.runtime.sendMessage({ action: 'pauseProcessing' }); pauseButton.style.display = 'none'; resumeButton.style.display = 'inline-block'; });
    resumeButton.addEventListener('click', () => { chrome.runtime.sendMessage({ action: 'resumeProcessing' }); resumeButton.style.display = 'none'; pauseButton.style.display = 'inline-block'; });
    stopButton.addEventListener('click', async () => {
      const confirmed = await showContentCustomDialog({
        type: 'confirm',
        title: 'Interrompi Processo',
        message: 'Sei sicuro di voler interrompere l\'intero processo?'
      });
      if (confirmed) {
        chrome.runtime.sendMessage({ action: 'stopProcessing' });
        container.innerHTML = '<p style="color:white; margin:0;">Arresto...</p>';
      }
    });

    stopButton.style.backgroundColor = '#c00000';
    stopButton.onmouseover = () => stopButton.style.backgroundColor = '#E50000';
    stopButton.onmouseout = () => stopButton.style.backgroundColor = '#c00000';

    btnContainer.append(pauseButton, resumeButton, stopButton);

    // --- Slider Velocità ---
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = 'width: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px; padding-top: 4px; border-top: 1px solid #444;';

    const sliderLabel = document.createElement('span');
    // Imposta etichetta iniziale basata sul valore salvato
    let initialLabel = `Velocità: ${globalSpeedFactor}x`;
    if (globalSpeedFactor === 1.0) initialLabel = "Velocità: Normale (1.0x)";
    else if (globalSpeedFactor > 1.0) initialLabel = `Velocità: Veloce (${globalSpeedFactor}x)`;
    else initialLabel = `Velocità: Lenta (${globalSpeedFactor}x)`;

    sliderLabel.textContent = initialLabel;
    sliderLabel.style.cssText = 'color: #ddd; font-family: Arial, sans-serif; font-size: 11px; font-weight: bold;';

    const slider = document.createElement('input');
    slider.type = 'range';
    // Logica invertita: Valori bassi = Lento, Valori alti = Veloce
    slider.min = '0.2'; // Molto lento (5x tempo di attesa)
    slider.max = '3.0'; // Molto veloce (1/3 tempo di attesa)
    slider.step = '0.2';
    slider.value = globalSpeedFactor; // Usa il valore salvato
    slider.style.cssText = 'width: 100%; cursor: pointer; accent-color: #E50000; height: 4px; margin-top: 5px;';
    slider.title = "Sinistra: Lento | Destra: Veloce";

    slider.oninput = (e) => {
      globalSpeedFactor = parseFloat(e.target.value);
      // Salva la preferenza nel browser
      localStorage.setItem('havas_capture_speed', globalSpeedFactor);

      let labelText = `Velocità: ${globalSpeedFactor}x`;
      if (globalSpeedFactor > 1.0) labelText = `Velocità: Veloce (${globalSpeedFactor}x)`;
      else if (globalSpeedFactor === 1.0) labelText = `Velocità: Normale (1.0x)`;
      else labelText = `Velocità: Lenta (${globalSpeedFactor}x)`;

      sliderLabel.textContent = labelText;
    };

    sliderContainer.appendChild(sliderLabel);
    sliderContainer.appendChild(slider);

    // Assemblaggio finale
    container.appendChild(btnContainer);
    container.appendChild(sliderContainer);
    document.body.appendChild(container);
  }

  function sendMessageAsync(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) { return reject(new Error(chrome.runtime.lastError.message)); }
        resolve(response);
      });
    });
  }

  // Recupera la velocità salvata o usa 1.0 (Normale)
  let savedSpeed = localStorage.getItem('havas_capture_speed');
  let globalSpeedFactor = savedSpeed ? parseFloat(savedSpeed) : 1.0;

  function wait(ms) {
    // Logica invertita: Più alto è il fattore (Destra), minore è l'attesa (Veloce)
    // Es: 2000ms / 2.0 (Veloce) = 1000ms di attesa
    // Es: 2000ms / 0.5 (Lento) = 4000ms di attesa
    return new Promise(resolve => setTimeout(resolve, ms / globalSpeedFactor));
  }

  async function waitForResumeIfPaused() {
    let state = await sendMessageAsync({ action: 'getProcessingState' });
    if (state.isStopped) throw new Error("Processo interrotto");
    while (state.isPaused) {
      await wait(1000);
      state = await sendMessageAsync({ action: 'getProcessingState' });
      if (state.isStopped) throw new Error("Processo interrotto");
    }
  }

  function getMetaCategory() {
    try {
      const menuButton = document.querySelector('div[role="button"][aria-haspopup="menu"][aria-expanded="false"]');
      if (menuButton) {
        const categoryElement = menuButton.querySelector('span > div > div');
        if (categoryElement && categoryElement.textContent) {
          const category = categoryElement.textContent.trim();
          console.log(`Categoria Meta trovata: "${category}"`);
          return category;
        }
      }
    } catch (e) {
      console.warn("Errore durante la ricerca della categoria Meta:", e);
    }
    return null;
  }

  // FUNZIONE PER ESTRARRE I FOLLOWER (Instagram)
  function getFollowerCount() {
    try {
      // Metodo 1: Cerca nei meta tag (spesso il più affidabile e stabile)
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) {
        const content = metaDesc.getAttribute('content');
        if (content) {
          // Formato tipico: "1M Followers, 200 Following, ..."
          const match = content.match(/([0-9.,KM]+)\s+Followers/i);
          if (match && match[1]) return match[1];
        }
      }

      // Metodo 2: Selettori specifici nella pagina (header profilo)
      // I selettori 'ul li' sono comuni per i contatori su IG Desktop
      const listItems = document.querySelectorAll('header ul li');
      for (const li of listItems) {
        if (li.textContent.toLowerCase().includes('follower')) {
          const titleSpan = li.querySelector('span[title]'); // Spesso il numero esatto è nel title
          if (titleSpan) return titleSpan.getAttribute('title');
          return li.querySelector('span').textContent; // O nel testo
        }
      }

      // Metodo 3: Selettore specifico href (spesso contiene il link ai followers)
      const followerLink = document.querySelector('a[href$="/followers/"]');
      if (followerLink) {
        const span = followerLink.querySelector('span');
        if (span) return span.textContent || span.title;
      }

      return null;
    } catch (e) {
      console.warn("[Followers] Errore estrazione:", e);
      return null;
    }
  }

  // NUOVA FUNZIONE: Estrae il nome del brand dalla pagina
  function getBrandName() {
    try {
      // Selettore specifico per l'elemento span contenente il nome del brand
      const brandSelectors = [
        'span.x1lliihq.x1plvlek.xryxfnj.x1n2onr6.xyejjpt.x15dsfln.x193iq5w.xeuugli.x1fj9vlw.x13faqbe.x1vvkbs.x1s928wv.xhkezso.x1gmr53x.x1cpjm7i.x1fgarty.x1943h6x.x1i0vuye.xvs91rp.x1s688f.x5n08af.x10wh9bi.xpm28yp.x8viiok.x1o7cslx',
        // Fallback: cerca anche in altri pattern comuni per username/brand
        'a[role="link"] span[dir="auto"]',
        'header a span'
      ];

      for (const selector of brandSelectors) {
        const brandElement = document.querySelector(selector);
        if (brandElement && brandElement.textContent) {
          const brandName = brandElement.textContent.trim();
          if (brandName && brandName.length > 0 && brandName.length < 100) {
            console.log(`[Brand] Nome brand trovato: "${brandName}"`);
            return brandName;
          }
        }
      }

      console.log("[Brand] Nessun nome brand trovato nella pagina.");
      return null;
    } catch (e) {
      console.warn("[Brand] Errore durante la ricerca del nome brand:", e);
      return null;
    }
  }

  // NUOVA FUNZIONE: Valida e filtra le caption estratte
  function validateAndFilterCaption(rawCaption, username) {
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
  }

  // NUOVA FUNZIONE: Separa caption e hashtag
  function separateCaptionAndHashtags(fullCaption) {
    if (!fullCaption) return { caption: '', hashtags: '' };

    // Estrai tutti gli hashtag
    const hashtags = fullCaption.match(/#\w+/g) || [];

    // Rimuovi gli hashtag dalla caption per ottenere solo il testo
    let cleanCaption = fullCaption.replace(/#\w+/g, '').trim();

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
  }

  // NUOVA FUNZIONE: Estrae la data di pubblicazione di Instagram
  function getInstagramDate() {
    try {
      // Cerca il tag time standard di Instagram
      const timeElement = document.querySelector('time');
      if (timeElement) {
        // Preferisci il titolo (es. "15 ottobre 2023") se presente, altrimenti formatta il datetime
        const title = timeElement.getAttribute('title');
        const datetime = timeElement.getAttribute('datetime');

        if (title) return title;
        if (datetime) {
          const dateObj = new Date(datetime);
          return dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
        }
      }
      return null;
    } catch (e) {
      console.warn("[Date] Errore estrazione data:", e);
      return null;
    }
  }

  // NUOVA FUNZIONE: Estrae la data di pubblicazione di Instagram
  function getInstagramDate() {
    try {
      const timeElement = document.querySelector('time');
      if (timeElement) {
        const title = timeElement.getAttribute('title');
        const datetime = timeElement.getAttribute('datetime');

        if (title) return title;
        if (datetime) {
          const dateObj = new Date(datetime);
          if (!isNaN(dateObj.getTime())) {
            return dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // NUOVA FUNZIONE: Estrae la caption/descrizione di Instagram
  function getInstagramCaption() {
    try {
      console.log("[Caption] Inizio estrazione caption Instagram...");
      console.log("[Caption] URL corrente:", window.location.href);

      // Prima ottieni il nome utente per la validazione
      let username = getBrandName();
      if (!username) {
        // Fallback: estrai dall'URL
        const urlMatch = window.location.pathname.match(/\/([^\/]+)\//);
        if (urlMatch) {
          username = urlMatch[1];
        }
      }
      console.log(`[Caption] Nome utente per validazione: "${username}"`);

      // =========================================================================
      // METODO 0: Cerca direttamente span con dir="auto" e classe specifica (più affidabile)
      // =========================================================================
      const captionSpans = document.querySelectorAll('span[dir="auto"]');
      for (const span of captionSpans) {
        const text = span.textContent?.trim();
        // Cerca span con contenuto significativo (non UI elements)
        if (text && text.length > 15 && text.length < 2200) {
          const isUIText = /^(mi piace|like|comment|commenti|share|condividi|salva|save|segui|follow|visualizza|view|altro|more)[\s:]*\d*/i.test(text);
          const isNavbar = /Impostazioni|Altre app di Meta|Informazioni|Condizioni|Privacy|Accedi|Iscriviti/i.test(text);
          const isMetric = /^\d+[\s]*(mi piace|like|comment|commenti|follower|following|visualizzazioni)/i.test(text);

          // Verifica che abbia contenuto significativo
          const hasHashtags = /#\w+/.test(text);
          const hasMentions = /@\w+/.test(text);
          const hasMultipleWords = text.split(/\s+/).length >= 3;
          const hasPostContent = hasHashtags || hasMentions || hasMultipleWords;

          if (!isUIText && !isNavbar && !isMetric && hasPostContent) {
            // Verifica che non sia dentro un pulsante o link di navigazione
            const parentButton = span.closest('button, a[role="link"]');
            if (!parentButton || parentButton.textContent.trim() === text) {
              console.log(`[Caption] ✅ Caption trovata con Metodo 0 (span dir="auto"): "${text.substring(0, 80)}..."`);
              // NUOVO: Valida la caption prima di restituirla
              const validatedCaption = validateAndFilterCaption(text, username);
              if (validatedCaption) return validatedCaption;
            }
          }
        }
      }

      // =========================================================================
      // METODO 1: CERCA "Vedi traduzione" / "See translation"
      // =========================================================================
      const translationButtons = document.querySelectorAll('span, button, div[role="button"]');
      for (const btn of translationButtons) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'vedi traduzione' || text === 'see translation' || text === 'see more' || text === 'altro') {
          console.log("[Caption] Trovato pulsante traduzione/altro. Cerco caption sopra...");

          // Tentativo 1: Cerca un elemento di testo significativo 'sopra' (previousElementSibling)
          let sibling = btn.previousElementSibling;
          // Risaliamo un po' se c'è un wrapper intermedio
          if (!sibling && btn.parentElement) {
            sibling = btn.parentElement.previousElementSibling || btn.parentElement.querySelector('h1, span[dir="auto"]');
            // Se il parent contiene sia la caption che il bottone
            if (btn.parentElement.innerText.length > text.length + 5) {
              const parentText = btn.parentElement.innerText;
              const cleanParent = parentText.replace(/Vedi traduzione|See translation|See more|Altro/gi, '').trim();
              if (cleanParent.length > 5 && !/Impostazioni|Altre app di Meta/i.test(cleanParent)) {
                console.log(`[Caption] ✅ Caption trovata nel parent di 'Vedi traduzione': "${cleanParent.substring(0, 50)}..."`);
                // NUOVO: Valida la caption prima di restituirla
                const validatedCaption = validateAndFilterCaption(cleanParent, username);
                if (validatedCaption) return validatedCaption;
              }
            }
          }

          while (sibling) {
            const sibText = sibling.textContent?.trim();
            if (sibText && sibText.length > 5) {
              // Clean and validate
              if (!/^(mi piace|like|rispondi|reply)/i.test(sibText) && !/Impostazioni|Altre app di Meta/i.test(sibText)) {
                console.log(`[Caption] ✅ Caption trovata sopra 'Vedi traduzione': "${sibText.substring(0, 50)}..."`);
                // NUOVO: Valida la caption prima di restituirla
                const validatedCaption = validateAndFilterCaption(sibText, username);
                if (validatedCaption) return validatedCaption;
              }
            }
            sibling = sibling.previousElementSibling;
          }
        }
      }

      // Metodo 2: Trova il nome utente e cerca la caption sotto la seconda occorrenza
      console.log("[Caption] Metodo 2: Cerca nome utente e caption sotto");

      if (username) {
        // Trova tutti gli elementi che contengono il nome utente
        const allElements = document.querySelectorAll('*');
        const usernameElements = [];

        for (const element of allElements) {
          const text = element.textContent?.trim();
          if (text === username || text === `@${username}`) {
            usernameElements.push(element);
          }
        }

        console.log(`[Caption] Trovate ${usernameElements.length} occorrenze del nome utente`);

        // Se abbiamo almeno 2 occorrenze, usa la seconda
        if (usernameElements.length >= 2) {
          const secondUsernameElement = usernameElements[1];

          // Cerca il contenuto dopo la seconda occorrenza
          let currentElement = secondUsernameElement;
          let attempts = 0;

          while (currentElement && attempts < 10) {
            attempts++;

            // Cerca nei siblings successivi
            let nextSibling = currentElement.nextElementSibling;
            while (nextSibling && attempts < 20) {
              attempts++;
              const text = nextSibling.textContent?.trim();

              if (text && text.length > 20 && text.length < 2200) {
                const isUsername = text === username || text === `@${username}`;
                const isUIText = /^(mi piace|like|comment|commenti|share|condividi|salva|save|segui|follow)[\s:]*\d*/i.test(text);
                const hasPostContent = /[\s.,!?#@]/.test(text) && text.split(' ').length > 3;

                // FIX ROBUSTO: Esclusione esplicita di menu e sidebar
                const isNavbar = /Impostazioni|Altre app di Meta|Informazioni|Condizioni|Privacy/i.test(text);

                if (!isUsername && !isUIText && !isNavbar && hasPostContent) {
                  console.log(`[Caption] ✅ Caption trovata dopo seconda occorrenza username: "${text.substring(0, 100)}..."`);

                  // Pulisci la caption rimuovendo username, badge verificato, e timestamp
                  let cleanCaption = text;

                  // Rimuovi tutto quello che viene prima del contenuto vero
                  // Pattern: username + verificato + timestamp + contenuto
                  const cleaningPatterns = [
                    new RegExp(`^${username}\\s*verificato\\s*\\d+\\s*(sett|settimane?|giorni?|ore?|minuti?|secondi?)\\s*`, 'i'),
                    new RegExp(`^${username}\\s*\\d+\\s*(sett|settimane?|giorni?|ore?|minuti?|secondi?)\\s*`, 'i'),
                    new RegExp(`^${username}\\s*verificato\\s*`, 'i'),
                    new RegExp(`^${username}\\s*`, 'i'),
                    /^verificato\s*\d+\s*(sett|settimane?|giorni?|ore?|minuti?|secondi?)\s*/i,
                    /^verificato\s*/i,
                    /^\d+\s*(sett|settimane?|giorni?|ore?|minuti?|secondi?)\s*/i
                  ];

                  for (const pattern of cleaningPatterns) {
                    const beforeClean = cleanCaption;
                    cleanCaption = cleanCaption.replace(pattern, '').trim();
                    if (beforeClean !== cleanCaption) {
                      break; // Esci dopo il primo pattern che funziona
                    }
                  }

                  // Assicurati che inizi con maiuscola
                  if (cleanCaption.length > 0 && /^[a-z]/.test(cleanCaption)) {
                    cleanCaption = cleanCaption.charAt(0).toUpperCase() + cleanCaption.slice(1);
                  }

                  // NUOVO: Valida la caption pulita prima di restituirla
                  const validatedCaption = validateAndFilterCaption(cleanCaption.length > 10 ? cleanCaption : text, username);
                  if (validatedCaption) return validatedCaption;
                }
              }

              nextSibling = nextSibling.nextElementSibling;
            }

            // Se non trovato nei siblings, vai al parent e riprova
            currentElement = currentElement.parentElement;
          }
        }
      }

      // Metodo 3: Approccio alternativo - cerca elementi con molto testo che non siano username
      console.log("[Caption] Metodo 3: Cerca elementi con contenuto lungo");
      const allTextElements = document.querySelectorAll('span, div, p, h1, h2, h3');

      for (const element of allTextElements) {
        const text = element.textContent?.trim();
        if (text && text.length > 30 && text.length < 2200) {
          // Verifica che non sia il nome utente
          const isUsername = text === username || text === `@${username}` ||
            (username && text.toLowerCase().includes(username.toLowerCase()) && text.length < 50);

          const isUIText = /^(mi piace|like|comment|commenti|share|condividi|salva|save|segui|follow)[\s:]*\d*/i.test(text) ||
            /^\d+[\s]*(mi piace|like|comment|commenti|follower|following)/i.test(text) ||
            text.toLowerCase().includes('aggiungi un commento') ||
            text.toLowerCase().includes('audio originale');

          // FIX: Verifica che non contenga parole chiave della barra di navigazione (più robusto)
          // FIX ROBUSTO: Esclusione esplicita di menu e sidebar nel metodo broad
          const isNavbar = /Impostazioni|Altre app di Meta|Informazioni|Condizioni/i.test(text);

          // Verifica che sia contenuto di un post (ha hashtag, mention, o frasi lunghe)
          const hasHashtags = /#\w+/.test(text);
          const hasMentions = /@\w+/.test(text);
          const hasLongSentences = text.split('.').some(sentence => sentence.trim().split(' ').length > 5);
          const hasPostContent = hasHashtags || hasMentions || hasLongSentences;

          if (!isUsername && !isUIText && !isNavbar && hasPostContent) {
            console.log(`[Caption] ✅ Caption trovata con metodo alternativo: "${text.substring(0, 100)}..."`);

            // Pulisci la caption rimuovendo username, badge verificato, e timestamp
            let cleanCaption = text
              .replace(new RegExp(`^${username}\\s*`, 'i'), '') // Rimuove username all'inizio
              .replace(/^verificato\s*/i, '') // Rimuove "verificato"
              .replace(/^\d+\s*(sett|settimane?|giorni?|ore?|minuti?|secondi?|week|day|hour|min|sec)\s*/i, '') // Rimuove timestamp
              .replace(/^[•·]\s*/, '') // Rimuove bullet points
              .trim();

            // Pulizia più aggressiva se necessario
            if (username && cleanCaption.toLowerCase().startsWith(username.toLowerCase())) {
              cleanCaption = cleanCaption.substring(username.length).trim();
            }

            // Rimuovi ancora "verificato" se presente
            cleanCaption = cleanCaption.replace(/^verificato\s*/i, '');

            // Rimuovi timestamp se ancora presente
            cleanCaption = cleanCaption.replace(/^\d+\s*(sett|settimane?|giorni?|ore?|minuti?|secondi?|week|day|hour|min|sec)\s*/i, '');

            // Assicurati che inizi con maiuscola se è una frase
            if (cleanCaption.length > 0 && /^[a-z]/.test(cleanCaption)) {
              cleanCaption = cleanCaption.charAt(0).toUpperCase() + cleanCaption.slice(1);
            }

            // NUOVO: Valida la caption pulita prima di restituirla
            const validatedCaption = validateAndFilterCaption(cleanCaption.length > 10 ? cleanCaption : text, username);
            if (validatedCaption) return validatedCaption;
          }
        }
      }

      // Metodo 4: Cerca specificamente per Reels (h1 in overlay o contenitori simili)
      console.log("[Caption] Metodo 4: Cerca caption specifica per Reels");
      const reelCaptionElements = document.querySelectorAll('h1, div[data-testid="content-text"], span[dir="auto"]');
      for (const el of reelCaptionElements) {
        // Spesso nei reel la caption è in un H1 o in un div specifico vicino ai controlli video
        const text = el.textContent?.trim();
        if (text && text.length > 10) {
          // Controlli specifici per evitare UI
          const isUIText = /^(mi piace|like|comment|commenti|share|condividi)/i.test(text);
          const isNavbar = /Impostazioni|Altre app di Meta/i.test(text);

          if (!isUIText && !isNavbar && (/#\w+/.test(text) || text.split(' ').length > 4)) {
            // Verifica che sia visibile e non nascosto
            const style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              console.log(`[Caption] ✅ Caption trovata in elemento Reel: "${text.substring(0, 100)}..."`);
              // NUOVO: Valida la caption prima di restituirla
              const validatedCaption = validateAndFilterCaption(text, username);
              if (validatedCaption) return validatedCaption;
            }
          }
        }
      }

      // Metodo 5: Cerca tramite aria-label o alt text
      console.log("[Caption] Metodo 5: Cerca tramite aria-label");
      const ariaElements = document.querySelectorAll('[aria-label*="Photo by"], [aria-label*="Video by"], [aria-label*="Reel by"], [aria-label*="Foto di"], [aria-label*="Video di"]');
      for (const element of ariaElements) {
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) {
          // Estrae il testo dopo il nome utente
          const match = ariaLabel.match(/(?:Photo|Video|Reel) by [^:]+: (.+)/i);
          if (match && match[1] && match[1].length > 10) {
            console.log(`[Caption] Caption trovata tramite aria-label: "${match[1].substring(0, 100)}..."`);
            // NUOVO: Valida la caption prima di restituirla
            const validatedCaption = validateAndFilterCaption(match[1].trim(), username);
            if (validatedCaption) return validatedCaption;
          }
        }
      }

      // Metodo 6: Cerca nel meta description
      console.log("[Caption] Metodo 6: Cerca in meta description");
      const metaDesc = document.querySelector('meta[property="og:description"]');
      if (metaDesc) {
        const content = metaDesc.getAttribute('content');
        if (content && content.length > 10 && content.length < 2200) {
          // Rimuove pattern comuni come "X Followers, Y Following"
          const cleanContent = content.replace(/^\d+[KM]?\s+Followers,\s+\d+[KM]?\s+Following,\s+\d+[KM]?\s+Posts\s+-\s+/, '');
          if (cleanContent !== content && cleanContent.length > 10) {
            console.log(`[Caption] Caption trovata in meta description: "${cleanContent.substring(0, 100)}..."`);
            // NUOVO: Valida la caption prima di restituirla
            const validatedCaption = validateAndFilterCaption(cleanContent.trim(), username);
            if (validatedCaption) return validatedCaption;
          }
        }
      }

      // Metodo 7: Ultimo tentativo - cerca qualsiasi testo lungo che non sia UI
      console.log("[Caption] Metodo 7: Ultimo tentativo - cerca qualsiasi testo significativo");
      const allPossibleElements = document.querySelectorAll('div, span, p');
      for (const el of allPossibleElements) {
        // Prendi solo il testo diretto dell'elemento, non dei figli
        const directText = Array.from(el.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .join(' ');

        if (directText && directText.length > 20 && directText.length < 2200) {
          const isUIText = /^(mi piace|like|comment|commenti|share|condividi|salva|save|segui|follow|visualizza|view|altro|more|accedi|iscriviti)[\s:]*\d*/i.test(directText);
          const isNavbar = /Impostazioni|Altre app di Meta|Informazioni|Condizioni|Privacy/i.test(directText);
          const hasContent = /#\w+/.test(directText) || /@\w+/.test(directText) || directText.split(/\s+/).length > 5;

          if (!isUIText && !isNavbar && hasContent) {
            console.log(`[Caption] ✅ Caption trovata con Metodo 7 (ultimo tentativo): "${directText.substring(0, 80)}..."`);
            // NUOVO: Valida la caption prima di restituirla
            const validatedCaption = validateAndFilterCaption(directText, username);
            if (validatedCaption) return validatedCaption;
          }
        }
      }

      console.log("[Caption] ⚠️ Nessuna caption valida trovata nella pagina dopo 7 metodi e validazione.");
      console.log("[Caption] Suggerimento: Controlla la console per vedere quali elementi sono stati analizzati");
      return null;
    } catch (e) {
      console.warn("[Caption] Errore durante l'estrazione della caption:", e);
      return null;
    }
  }

  // ========= GESTIONE INSTAGRAM (MODIFICATA PER REELS E RANGE DATE) =========

  // Tabella alfabeto per conversione shortcode IG
  const IG_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const IG_EPOCH = 1314220021721n;

  function shortcodeToDate(shortcode) {
    try {
      let n = 0n;
      for (let i = 0; i < shortcode.length; i++) {
        const char = shortcode[i];
        n = (n * 64n) + BigInt(IG_ALPHABET.indexOf(char));
      }
      const timestampMs = Number((n >> 23n) + IG_EPOCH);
      return new Date(timestampMs);
    } catch (e) {
      console.warn("Errore conversione shortcode:", shortcode, e);
      return new Date(); // fallback a oggi se fallisce
    }
  }

  function getShortcodeFromUrl(url) {
    const match = url.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
  }

  function isInstagramProfilePage() {
    const path = window.location.pathname;
    return window.location.hostname.includes('instagram.com') && path.length > 1 && /^\/[^/]+\/$/.test(path) && !path.startsWith('/p/') && !path.startsWith('/reel/');
  }

  function isTikTokProfilePage() {
    const path = window.location.pathname;
    return window.location.hostname.includes('tiktok.com') && path.startsWith('/@') && !path.includes('/video/');
  }

  function getTikTokFollowerCount() {
    try {
      // Basato esattamente sul tuo snippet: tag strong con attributo data-e2e
      const followerEl = document.querySelector('strong[data-e2e="followers-count"]');
      if (followerEl) return followerEl.innerText.trim();

      // Fallback: cerca per titolo se l'attributo e2e fallisse
      const fallbackEl = document.querySelector('strong[title="Follower"]');
      if (fallbackEl) return fallbackEl.innerText.trim();

      return null;
    } catch (e) { return null; }
  }

  function getTikTokBrandName() {
    try {
      // Il nome "bello" del profilo (es: Curasept)
      const titleEl = document.querySelector('[data-e2e="user-title"]');
      if (titleEl && titleEl.innerText.trim()) return titleEl.innerText.trim();

      // Lo username (es: @curasept_official)
      const subEl = document.querySelector('[data-e2e="user-subtitle"]');
      if (subEl) return subEl.innerText.trim().replace('@', '');

      // Intestazione H1 come ultima spiaggia
      const h1 = document.querySelector('h1');
      if (h1) return h1.innerText.trim();

      return null;
    } catch (e) { return null; }
  }

  function isInstagramPostPage() {
    return window.location.hostname.includes('instagram.com') && window.location.pathname.startsWith('/p/');
  }

  // NUOVA FUNZIONE per identificare specificamente le pagine dei Reel
  function isInstagramReelPage() {
    return window.location.hostname.includes('instagram.com') && window.location.pathname.startsWith('/reel/');
  }

  // FIX: Funzione per forzare la scrollabilità della pagina Instagram
  // A zoom 100%, Instagram imposta overflow:hidden su html/body,
  // impedendo la comparsa della barra di scorrimento verticale.
  function forceInstagramScrollable() {
    const html = document.documentElement;
    const body = document.body;

    // Forza overflow su tutti gli elementi che potrebbero bloccarlo
    const elements = [html, body];
    elements.forEach(el => {
      const computed = getComputedStyle(el);
      if (computed.overflow === 'hidden' || computed.overflowY === 'hidden') {
        el.style.setProperty('overflow-y', 'auto', 'important');
        el.style.setProperty('overflow-x', 'hidden', 'important');
        console.log(`[Instagram Fix] Forzato overflow-y:auto su <${el.tagName.toLowerCase()}>`);
      }
    });

    // Forza anche height:auto su html/body per evitare che il contenuto venga tagliato
    if (getComputedStyle(html).height === '100%' || getComputedStyle(html).maxHeight !== 'none') {
      html.style.setProperty('height', 'auto', 'important');
      html.style.setProperty('max-height', 'none', 'important');
    }
    if (getComputedStyle(body).height === '100%' || getComputedStyle(body).maxHeight !== 'none') {
      body.style.setProperty('height', 'auto', 'important');
      body.style.setProperty('max-height', 'none', 'important');
    }
  }

  // FIX: Attendi che la pagina sia effettivamente scrollabile (scrollHeight > clientHeight)
  async function waitForPageScrollable(timeoutMs = 10000) {
    const startTime = Date.now();
    const scrollEl = document.scrollingElement || document.documentElement;

    console.log('[Instagram Fix] Attendo che la pagina diventi scrollabile...');

    while (Date.now() - startTime < timeoutMs) {
      forceInstagramScrollable();

      const isScrollable = scrollEl.scrollHeight > scrollEl.clientHeight + 50;
      if (isScrollable) {
        console.log(`[Instagram Fix] ✅ Pagina scrollabile! scrollHeight=${scrollEl.scrollHeight}, clientHeight=${scrollEl.clientHeight}`);
        return true;
      }

      // Prova a forzare il reflow del layout scrollando un pixel
      scrollEl.scrollTop = 1;
      await wait(200);
      scrollEl.scrollTop = 0;

      console.log(`[Instagram Fix] ⏳ Non ancora scrollabile (scrollH=${scrollEl.scrollHeight}, clientH=${scrollEl.clientHeight}). Attendo...`);
      await wait(500);
    }

    console.warn('[Instagram Fix] ⚠️ Timeout: la pagina potrebbe non essere scrollabile. Procedo comunque.');
    return false;
  }

  // FIX: Scroll robusto che usa scrollIntoView sull'ultimo post visibile
  // Questo funziona SEMPRE perché non dipende dalla barra di scorrimento
  function scrollToLastPost(postSelector) {
    const allPosts = document.querySelectorAll(postSelector);
    if (allPosts.length === 0) {
      // Fallback: se non ci sono post, tenta scroll generico
      console.log('[Instagram Fix] Nessun post trovato, uso fallback scrollTo');
      const scrollEl = document.scrollingElement || document.documentElement;
      scrollEl.scrollTop = scrollEl.scrollHeight;
      return false;
    }

    // Prende l'ultimo post nella griglia e scrolla fino a renderlo visibile
    const lastPost = allPosts[allPosts.length - 1];
    lastPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
    console.log(`[Instagram Fix] scrollIntoView sull'ultimo post (${allPosts.length} post nel DOM)`);
    return true;
  }

  async function handleInstagramProfile(options) {
    const isDateMode = options.socialStartDate && options.socialEndDate;
    console.log(`[Instagram Profile] Rilevato. Modalità filtro date: ${isDateMode}`);

    try {
      await wait(3000);

      // FIX STEP 1: Forza la scrollabilità della pagina
      forceInstagramScrollable();
      console.log('[Instagram Profile] Overflow forzato su html/body.');

      const postSelector = 'a[href*="/p/"], a[href*="/reel/"]';

      // FIX STEP 2: Attendi che la pagina sia scrollabile prima di iniziare
      // Questo evita che lo scroll finisca nelle storie in evidenza
      const pageReady = await waitForPageScrollable(12000);
      if (!pageReady) {
        // Se la pagina non è scrollabile, proviamo a scorrere fino al primo post
        // per forzare Instagram a caricare il resto della griglia
        const firstPosts = document.querySelectorAll(postSelector);
        if (firstPosts.length > 0) {
          console.log('[Instagram Profile] Forzo scroll verso il primo post per caricare la griglia...');
          firstPosts[firstPosts.length - 1].scrollIntoView({ behavior: 'instant', block: 'end' });
          await wait(2000);
          forceInstagramScrollable();
        }
      }

      console.log('[Instagram Profile] Inizio estrazione post...');
      let urlsToProcess = [];

      if (isDateMode) {
        // --- MODALITÀ FILTRO PER DATA ---
        console.log(`[Instagram Profile] Cerco post tra ${options.socialStartDate} e ${options.socialEndDate}`);

        // Conversione date target in millisecondi Unix
        const targetStartMs = new Date(options.socialStartDate).getTime();
        const targetEnd = new Date(options.socialEndDate);
        targetEnd.setHours(23, 59, 59, 999); // Fine giornata
        const targetEndMs = targetEnd.getTime();

        const postMap = new Map(); // shortcode -> { url, timestamp }
        let keepScrolling = true;
        let scrollCount = 0;
        let unchangedCycles = 0; // Failsafe per fine profilo
        const MAX_SCROLLS = 150; // Limite di sicurezza

        while (keepScrolling && scrollCount < MAX_SCROLLS) {
          await waitForResumeIfPaused();

          const previousMapSize = postMap.size;
          const linkNodes = Array.from(document.querySelectorAll(postSelector));

          // 1. Aggiunge tutti i post visibili alla memoria
          linkNodes.forEach(link => {
            const shortcode = getShortcodeFromUrl(link.href);
            if (shortcode && !postMap.has(shortcode)) {
              const dateObj = shortcodeToDate(shortcode);
              postMap.set(shortcode, { url: link.href, timestamp: dateObj.getTime(), date: dateObj });
            }
          });

          // 2. Controllo posizione nel tempo (Ignora la parte alta della griglia coi post fissati)
          if (linkNodes.length > 3) {
            // Prende solo gli ultimi 3 post del DOM (l'ultimissima riga in basso visibile)
            const bottomLinks = linkNodes.slice(-3);
            let oldestInBottom = Infinity;
            let lastFoundDateStr = "";

            bottomLinks.forEach(link => {
              const shortcode = getShortcodeFromUrl(link.href);
              if (shortcode) {
                const ts = shortcodeToDate(shortcode).getTime();
                if (ts < oldestInBottom) oldestInBottom = ts;
                lastFoundDateStr = shortcodeToDate(shortcode).toLocaleDateString('it-IT');
              }
            });

            console.log(`[Instagram Profile] Scroll ${scrollCount}. Post in memoria: ${postMap.size}. Data in fondo: ${lastFoundDateStr}`);

            // Se i post in fondo alla pagina sono più vecchi della nostra data di inizio, abbiamo finito di scendere!
            if (oldestInBottom < targetStartMs) {
              console.log("[Instagram Profile] Raggiunti post più vecchi della data di inizio. Stop scroll.");
              keepScrolling = false;
              break;
            }
          }

          // 3. Failsafe: se siamo arrivati alla fine del profilo (non ci sono più post da caricare)
          if (postMap.size === previousMapSize) {
            unchangedCycles++;
            if (unchangedCycles >= 3) {
              console.log("[Instagram Profile] Nessun nuovo post caricato. Fine del profilo raggiunta.");
              keepScrolling = false;
              break;
            }
          } else {
            unchangedCycles = 0;
          }

          // 4. FIX: Scroll verso l'ultimo post visibile (non dipende dalla scrollbar!)
          if (keepScrolling) {
            forceInstagramScrollable();
            scrollToLastPost(postSelector);
            await wait(2000); // Attesa vitale per far caricare i nuovi post alla rete
            scrollCount++;
          }
        }

        // 5. Filtra i risultati tenendo solo quelli ESATTAMENTE nel range
        urlsToProcess = Array.from(postMap.values())
          .filter(post => post.timestamp >= targetStartMs && post.timestamp <= targetEndMs)
          .sort((a, b) => b.timestamp - a.timestamp) // Ordina dal più recente al più vecchio
          .map(post => post.url);

        console.log(`[Instagram Profile] Filtraggio date completato. Trovati ${urlsToProcess.length} post validi.`);

        if (urlsToProcess.length === 0) {
          throw new Error(`Nessun post trovato tra il ${options.socialStartDate} e il ${options.socialEndDate}.`);
        }
        // In modalità date NON limitiamo il numero di post. Vogliamo estrarre tutto il range richiesto.

      } else {
        // --- MODALITÀ CLASSICA (SENZA DATA) ---
        console.log(`[Instagram Profile] Estrazione di max ${options.numInstagramPosts} post/reels.`);
        const postLinks = new Set();
        const maxScrolls = Math.max(3, Math.ceil(options.numInstagramPosts / 12) + 2);

        for (let i = 0; i < maxScrolls; i++) {
          await waitForResumeIfPaused();
          document.querySelectorAll(postSelector).forEach(link => postLinks.add(link.href));
          // FIX: Scroll verso l'ultimo post visibile (non dipende dalla scrollbar!)
          forceInstagramScrollable();
          scrollToLastPost(postSelector);
          await wait(2000);
        }

        const uniquePostUrls = Array.from(postLinks);
        if (uniquePostUrls.length === 0) throw new Error("Nessun post o reel trovato.");
        urlsToProcess = uniquePostUrls.slice(0, options.numInstagramPosts);
      }

      // ESTRAZIONE FOLLOWER E BRAND PRIMA DI TORNARE
      const followerCount = getFollowerCount();
      const brandName = getBrandName();
      console.log(`[Instagram Profile] Followers: ${followerCount}, Brand: ${brandName}`);

      return { status: 'found_instagram_posts', urls: urlsToProcess, followers: followerCount, brandName: brandName };
    } catch (error) {
      console.error(`[Instagram Profile] Fallimento estrazione: ${error.message}`);
      return captureVisibleArea(options);
    }
  }

  async function handleTikTokProfile(options) {
    console.log(`[TikTok Profile] Avvio estrazione dati profilo...`);
    try {
      // TikTok è lento a caricare i contatori, aspettiamo 4 secondi
      await wait(4000);

      const brandName = getTikTokBrandName();
      const followerCount = getTikTokFollowerCount();
      console.log(`[TikTok Profile] Dati: Brand=${brandName}, Followers=${followerCount}`);

      const videoLinks = new Set();
      const maxScrolls = Math.max(3, Math.ceil(options.numInstagramPosts / 12) + 2);
      const videoSelector = 'a[href*="/video/"]';

      for (let i = 0; i < maxScrolls; i++) {
        await waitForResumeIfPaused();
        document.querySelectorAll(videoSelector).forEach(link => {
          const cleanUrl = link.href.split('?')[0];
          videoLinks.add(cleanUrl);
        });
        window.scrollTo(0, document.body.scrollHeight);
        await wait(2000);
      }

      const uniqueUrls = Array.from(videoLinks);
      const urlsToProcess = uniqueUrls.slice(0, options.numInstagramPosts);

      return {
        status: 'found_instagram_posts',
        urls: urlsToProcess,
        followers: followerCount,
        brandName: brandName
      };
    } catch (error) {
      console.error(`[TikTok Profile] Fallimento: ${error.message}`);
      return captureVisibleArea(options);
    }
  }

  async function handleInstagramPost(options) {
    console.log("[Instagram Post] 📸 Rilevato. Inizio cattura carosello.");
    document.body.style.overflow = 'hidden';
    const capturedChunks = [];

    try {
      await wait(options.initialDelay || 2500);

      // NUOVO: Estrae il brand, le metriche, la caption E LA DATA
      const brandName = getBrandName();
      const metrics = getInstagramMetrics(document);
      const caption = getInstagramCaption();
      const date = getInstagramDate(); // NUOVO: Estrazione Data

      // Prima slide
      console.log("[Instagram Post] 📸 Catturo slide 1...");
      let response = await sendMessageAsync({ action: 'captureChunk' });
      if (response && response.dataUrl) {
        showSuccessModal();
        // Aggiunta metriche e caption
        capturedChunks.push({
          dataUrl: response.dataUrl,
          category: 'Instagram Post',
          brandName: brandName,
          metrics: metrics,
          caption: caption, // NUOVO: Aggiunta caption
          date: date // NUOVO: Aggiunta data
        });
      } else {
        throw new Error("Screenshot della prima slide fallito.");
      }

      // Scrolla SEMPRE il carosello
      const maxSlidesToCapture = options.maxCarouselSlides || 10;
      console.log(`[Instagram Post] 🔄 Cerco altre slide (max ${maxSlidesToCapture})...`);

      for (let i = 1; i < maxSlidesToCapture; i++) {
        await waitForResumeIfPaused();
        await wait(300);

        const nextButton = findInstagramNextButton();

        if (nextButton) {
          console.log(`[Instagram Post] ➡️ Trovato pulsante Next! Clicco per slide ${i + 1}...`);
          nextButton.click();
          await wait(options.carouselSwipeDelay || 1500);

          console.log(`[Instagram Post] 📸 Catturo slide ${i + 1}...`);
          response = await sendMessageAsync({ action: 'captureChunk' });

          if (response && response.dataUrl) {
            showSuccessModal();
            // Aggiunta metriche e caption (stessa per tutte le slide del carosello)
            capturedChunks.push({
              dataUrl: response.dataUrl,
              category: 'Instagram Post',
              brandName: brandName,
              metrics: metrics,
              caption: caption, // NUOVO: Aggiunta caption
              date: date // NUOVO: Aggiunta data
            });
            console.log(`[Instagram Post] ✅ Slide ${i + 1} catturata (${response.dataUrl.length} bytes)`);
          } else {
            console.warn(`[Instagram Post] ⚠️ Slide ${i + 1} non ricevuta`);
          }
        } else {
          console.log(`[Instagram Post] 🏁 Fine del carosello dopo ${capturedChunks.length} slide.`);
          break;
        }
      }

      console.log(`[Instagram Post] ✅ Cattura completata! Totale slide: ${capturedChunks.length}`);

    } catch (error) {
      console.error(`[Instagram Post] ❌ Errore durante la cattura: ${error.message}`);
      if (capturedChunks.length === 0) return captureVisibleArea(options);
    } finally {
      document.body.style.overflow = '';
    }

    return capturedChunks;
  }

  function findInstagramNextButton() {
    console.log("[Instagram] 🔍 Ricerca pulsante Next...");

    const selectors = [
      'button[aria-label="Next"]', 'button[aria-label="Successivo"]',
      'div[role="button"][aria-label="Next"]', 'div[role="button"][aria-label="Successivo"]',
      'button._af_g._al5g', 'button[aria-label="Avanti"]'
    ];

    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button && button.offsetParent !== null) {
        console.log(`[Instagram] ✅ Pulsante trovato con selettore: ${selector}`);
        return button;
      }
    }

    console.log("[Instagram] 🔍 Ricerca via SVG...");
    const allButtons = document.querySelectorAll('button, div[role="button"]');
    for (const btn of allButtons) {
      if (btn.offsetParent === null) continue;

      const svg = btn.querySelector('svg');
      if (svg) {
        const paths = svg.querySelectorAll('path, polygon, polyline');
        for (const path of paths) {
          const d = path.getAttribute('d') || path.getAttribute('points') || '';
          if (d.includes('M16') || d.includes('M13') || d.includes('l7') || d.includes('L20')) {
            console.log(`[Instagram] ✅ Pulsante trovato via SVG! Path: ${d.substring(0, 30)}...`);
            return btn;
          }
        }
      }
    }

    console.log("[Instagram] ❌ Nessun pulsante Next trovato");
    return null;
  }

  // ========= GESTIONE TIKTOK =========

  async function handleTikTokSpecifics() {
    if (!window.location.hostname.includes('tiktok.com')) return;
    console.log("Rilevato TikTok: inizio ricerca robusta del pulsante 'altro'...");
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidates = document.querySelectorAll('button, div[role="button"]');
      let foundButton = null;
      for (const candidate of candidates) {
        const text = candidate.textContent.toLowerCase();
        if ((text.includes('altro') || text.includes('more')) && candidate.offsetParent !== null) {
          foundButton = candidate;
          break;
        }
      }
      if (foundButton) {
        console.log(`Pulsante 'altro' trovato al tentativo ${attempt + 1}. Clicco...`);
        foundButton.click();
        console.log("Attendo 1.5 secondi per garantire l'espansione completa del contenuto.");
        await wait(1500);
        console.log("Attesa per espansione completata.");
        return;
      }
      await wait(500);
    }
    console.log("Pulsante 'altro' non trovato dopo 5 secondi di tentativi.");
  }

  // ========= GESTIONE PINTEREST =========

  async function waitForPinterestImage(timeout = 7000) {
    console.log("Pinterest: In attesa che l'immagine principale del Pin sia caricata...");
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const mainImage = document.querySelector('div[data-test-id="pin-closeup-image"] img, div[data-test-id="pin-visual-wrapper"] img');
      if (mainImage && mainImage.complete && mainImage.naturalHeight > 0) {
        console.log("Pinterest: Immagine principale trovata e caricata.");
        await wait(500);
        return true;
      }
      await wait(250);
    }
    console.warn("Pinterest: Timeout. L'immagine principale del Pin non è stata caricata in tempo.");
    return false;
  }

  async function captureCarouselByScrolling(options = {}) {
    console.log("Avvio cattura carosello specifica per Pinterest (basata su scroll)...");

    try {
      const clickableElements = document.querySelectorAll('div[role="button"]');
      let foundButton = null;
      for (const btn of clickableElements) {
        const buttonText = (btn.textContent || "").replace(/[\s\u00A0]+/g, ' ').trim().toLowerCase();
        if (buttonText === "... altro" || buttonText === "... more") {
          foundButton = btn;
          break;
        }
      }
      if (foundButton) {
        console.log('Trovato pulsante "... altro", cliccando...');
        foundButton.click();
        await wait(1500);
      } else {
        console.log('Nessun pulsante "... altro" trovato.');
      }
    } catch (e) {
      console.warn("Errore durante il click su '... altro':", e);
    }

    const carouselContainer = document.querySelector('ul.carousel--mode-single');
    if (!carouselContainer) {
      console.log("Nessun contenitore carosello (ul.carousel--mode-single) trovato. Fallback a cattura singola.");
      await waitForPinterestImage();
      return captureVisibleAreaDirectLinks(options);
    }

    // CORREZIONE: Estrae il brand e le metriche una sola volta per tutti gli screenshot del carosello Pinterest
    const brandName = getBrandName();

    // NUOVO: Estrae la caption per Instagram (anche se Pinterest non dovrebbe avere caption Instagram)
    let caption = null;
    let date = null;
    if (window.location.hostname.includes('instagram.com')) {
      caption = getInstagramCaption();
      date = getInstagramDate();
    }

    const metrics = getInstagramMetrics(document);

    const capturedChunks = [];
    const slideWidth = carouselContainer.offsetWidth;
    let currentScrollPosition = 0;

    try {
      for (let i = 0; i < options.maxCarouselSlides; i++) {
        await waitForResumeIfPaused();
        console.log(`Catturo slide ${i + 1} (Pinterest)...`);
        carouselContainer.scrollLeft = currentScrollPosition;
        await waitForPinterestImage();
        try {
          const response = await sendMessageAsync({ action: 'captureChunk' });
          if (response && response.dataUrl) {
            showSuccessModal();
            capturedChunks.push({
              dataUrl: response.dataUrl,
              category: null,
              brandName: brandName,
              metrics: metrics,
              caption: caption, // NUOVO: Aggiunta caption
              date: date // NUOVO: Aggiunta data
            });
          } else {
            throw new Error("Pezzo di screenshot non ricevuto.");
          }
        } catch (error) {
          console.error("Errore durante la cattura della slide:", error);
          break;
        }
        const nextScrollPosition = currentScrollPosition + slideWidth;
        if (nextScrollPosition >= carouselContainer.scrollWidth - 10) {
          console.log("Raggiunta la fine del carosello di Pinterest.");
          break;
        }
        currentScrollPosition = nextScrollPosition;
        await wait(options.carouselSwipeDelay || 1000);
      }
    } catch (error) {
      if (error.message === "Processo interrotto") {
        console.log("Cattura del carosello Pinterest interrotta.");
      } else {
        console.error("Errore imprevisto nel carosello Pinterest:", error);
      }
    }
    return capturedChunks.length > 0 ? capturedChunks : captureVisibleAreaDirectLinks(options);
  }

  // ========= GESTIONE META =========

  function getMetaCarouselTotalSlides() {
    const allDivs = document.querySelectorAll('div');
    const regex = /(\d+)\s+(?:di|of)\s+(\d+)/;
    for (const div of allDivs) {
      if (div.offsetParent === null) continue;
      const text = div.textContent || '';
      const match = text.match(regex);
      if (match) {
        const total = parseInt(match[2], 10);
        if (total > 0) {
          console.log(`Paginazione Meta Trovata. Totale slide: ${total} (Testo: "${text.trim()}")`);
          return total;
        }
      }
    }
    console.log("Nessuna paginazione 'X di Y' o 'X of Y' trovata.");
    return null;
  }

  // ========= GESTIONE CAROSELLI GENERICI =========

  async function findCarouselButton() {
    const nextButtonSelectors = [
      'div[aria-label="Next photo"]', 'div[aria-label="Foto successiva"]',
      'div[aria-label="Vedi allegato successivo"]', 'div[aria-label="See next attachment"]',
      'button[aria-label="Avanti"]', 'button[aria-label="Next"]',
      'div[role="button"][aria-label="Avanti"]', 'div[role="button"][aria-label="Next"]',
      'button[aria-label="Successivo"]', 'div[role="button"][aria-label="Successivo"]',
      'button._af_g._al5g', 'button[data-test-id="UnauthBestInShow-carousel-next-btn"]',
      'button[aria-label="Carousel next"]', 'button[data-e2e="arrow-right"]'
    ];
    const buttonTexts = ["Formato pubblicitario successivo", "Next ad format"];

    for (let attempt = 0; attempt < 10; attempt++) {
      for (const selector of nextButtonSelectors) {
        const button = document.querySelector(selector);
        if (button && button.offsetParent !== null) {
          console.log(`Pulsante carosello trovato con il selettore: "${selector}"`);
          return button;
        }
      }
      const potentialButtons = document.querySelectorAll('div[role="button"]');
      for (const btn of potentialButtons) {
        if (btn.offsetParent !== null) {
          const innerText = btn.textContent || "";
          for (const textToFind of buttonTexts) {
            if (innerText.includes(textToFind)) {
              console.log(`Pulsante carosello trovato con testo interno: "${textToFind}"`);
              return btn;
            }
          }
        }
      }
      await wait(500);
    }
    console.log("Nessun pulsante per carosello trovato dopo 5 secondi.");
    return null;
  }

  // ========= MODALITÀ "SCREENSHOT DA LINK DIRETTI" =========

  async function captureVisibleAreaDirectLinks(options = {}) {
    console.log("[DirectLinks] Inizio cattura area visibile con opzioni:", options);

    await handleTikTokSpecifics();

    if (options.removePopups) {
      try {
        const selectors = '[aria-label*="lose"], [aria-label*="ccept"], [data-cookiebanner="accept_button"], div[role="dialog"] button';
        document.querySelectorAll(selectors).forEach(btn => btn.click());
      } catch (e) { console.warn("Errore chiusura popup:", e); }
    }
    await wait(options.screenshotDelay || 2000);

    const category = getMetaCategory();
    const brandName = getBrandName(); // NUOVO: Estrae il brand

    // NUOVO: Estrae la caption e la data per Instagram
    let caption = null;
    let date = null;
    if (window.location.hostname.includes('instagram.com')) {
      caption = getInstagramCaption();
      date = getInstagramDate();
    }

    console.log("[DirectLinks] Catturo la schermata visibile...");
    try {
      const response = await sendMessageAsync({ action: 'captureChunk' });
      if (response && response.dataUrl) {
        showSuccessModal();
        // Rilevamento automatico della piattaforma per le metriche
        let metrics = { likes: 0, comments: 0, reshares: 0 };
        if (window.location.hostname.includes('tiktok.com')) {
          metrics = getTikTokMetrics();
          caption = getTikTokCaption();
          date = getTikTokDate();
        } else {
          metrics = getInstagramMetrics(document);
        }
        return {
          dataUrl: response.dataUrl,
          category: category || (window.location.hostname.includes('tiktok.com') ? 'TikTok Video' : null),
          brandName: brandName,
          metrics: metrics,
          caption: caption,
          date: date
        };
      } else {
        throw new Error("Screenshot non ricevuto. Dettagli: " + JSON.stringify(response));
      }
    } catch (error) {
      throw new Error("Comunicazione con il background script fallita.");
    }
  }

  async function captureCarouselDirectLinks(options = {}) {
    console.log("[DirectLinks] Inizio cattura carosello con opzioni:", options);

    await handleTikTokSpecifics();

    if (options.removePopups) {
      try {
        const selectors = '[aria-label*="lose"], [aria-label*="ccept"], [data-cookiebanner="accept_button"], div[role="dialog"] button';
        document.querySelectorAll(selectors).forEach(btn => btn.click());
      } catch (e) { console.warn("Errore chiusura popup:", e); }
    }
    await wait(options.initialDelay || 3000);

    if (window.location.hostname.includes('pinterest.com')) {
      console.log("[DirectLinks] Rilevato Pinterest: avvio la cattura basata sullo SCROLL.");
      return captureCarouselByScrolling(options);
    } else {
      console.log("[DirectLinks] Sito non-Pinterest: avvio la cattura basata sul CLICK o sul TESTO del pulsante.");
      const nextButton = await findCarouselButton();
      if (!nextButton) {
        console.log("[DirectLinks] Nessun carosello trovato, procedo con screenshot singolo.");
        return captureVisibleAreaDirectLinks(options);
      }

      let metaTotalSlides = null;
      if (window.location.hostname.includes('meta.com') || window.location.hostname.includes('facebook.com')) {
        metaTotalSlides = getMetaCarouselTotalSlides();
      }

      // NUOVO: Estrae il brand una sola volta per tutti gli screenshot
      const brandName = getBrandName();

      // NUOVO: Estrae la caption e la data per Instagram
      let caption = null;
      let date = null;
      if (window.location.hostname.includes('instagram.com')) {
        caption = getInstagramCaption();
        date = getInstagramDate();
      }

      // CORREZIONE: Estrae le metriche una sola volta per tutti gli screenshot del carosello
      let metrics = { likes: 0, comments: 0, reshares: 0 };
      if (window.location.hostname.includes('tiktok.com')) {
        metrics = getTikTokMetrics();
      } else {
        metrics = getInstagramMetrics(document);
      }

      const capturedChunks = [];
      try {
        for (let i = 0; i < options.maxCarouselSlides; i++) {
          await waitForResumeIfPaused();
          console.log(`[DirectLinks] Catturo slide ${i + 1}...`);
          await wait(options.screenshotDelay || 500);
          const category = getMetaCategory();
          try {
            const response = await sendMessageAsync({ action: 'captureChunk' });
            if (response && response.dataUrl) {
              showSuccessModal();
              capturedChunks.push({
                dataUrl: response.dataUrl,
                category: category,
                brandName: brandName,
                metrics: metrics,
                caption: caption, // NUOVO: Aggiunta caption
                date: date // NUOVO: Aggiunta data
              });
            } else {
              throw new Error("Pezzo di screenshot non ricevuto.");
            }
          } catch (error) {
            console.error("[DirectLinks] Errore durante la cattura della slide:", error);
            break;
          }

          if (metaTotalSlides && (i + 1) >= metaTotalSlides) {
            console.log(`[DirectLinks] Raggiunta l'ultima slide di Meta (slide ${i + 1} di ${metaTotalSlides}). La cattura termina qui.`);
            break;
          }

          const currentNextButton = await findCarouselButton();
          const isButtonVisible = currentNextButton && currentNextButton.offsetParent !== null && !currentNextButton.disabled;
          if (i < options.maxCarouselSlides - 1 && isButtonVisible) {
            currentNextButton.click();
            await wait(options.carouselSwipeDelay || 1000);
          } else {
            console.log("[DirectLinks] Fine del carosello (limite slide o pulsante non visibile).");
            break;
          }
        }
      } catch (error) {
        if (error.message === "Processo interrotto") {
          console.log("[DirectLinks] Cattura del carosello generico interrotta.");
        } else {
          console.error("[DirectLinks] Errore imprevisto nel carosello generico:", error);
        }
      }
      return capturedChunks.length > 0 ? capturedChunks : captureVisibleAreaDirectLinks(options);
    }
  }

  // ========= MODALITÀ NORMALE (con gestione Instagram) =========

  async function captureCarousel(options = {}) {
    console.log("Inizio cattura carosello con opzioni:", options);
    await handleTikTokSpecifics();

    if (options.removePopups) {
      try {
        const selectors = '[aria-label*="lose"], [aria-label*="ccept"], [data-cookiebanner="accept_button"], div[role="dialog"] button';
        document.querySelectorAll(selectors).forEach(btn => btn.click());
      } catch (e) { console.warn("Errore chiusura popup:", e); }
    }
    await wait(options.initialDelay || 3000);

    if (window.location.hostname.includes('pinterest.com')) {
      console.log("Rilevato Pinterest: avvio la cattura basata sullo SCROLL.");
      return captureCarouselByScrolling(options);
    } else {
      console.log("Sito non-Pinterest: avvio la cattura basata sul CLICK.");
      const nextButton = await findCarouselButton();
      if (!nextButton) {
        console.log("Nessun carosello trovato, procedo con screenshot singolo.");
        return captureVisibleArea(options);
      }

      let metaTotalSlides = null;
      if (window.location.hostname.includes('meta.com') || window.location.hostname.includes('facebook.com')) {
        metaTotalSlides = getMetaCarouselTotalSlides();
      }

      // NUEVO: Extrae el brand una sola vez para todos los screenshots
      const brandName = getBrandName();

      // NUEVO: Extrae la caption y la fecha para Instagram
      let caption = null;
      let date = null;
      if (window.location.hostname.includes('instagram.com')) {
        caption = getInstagramCaption();
        date = getInstagramDate();
      }

      // CORREZIONE: Estrae le metriche una sola volta per tutti gli screenshot del carosello
      let metrics = { likes: 0, comments: 0, reshares: 0 };
      if (window.location.hostname.includes('tiktok.com')) {
        metrics = getTikTokMetrics();
      } else {
        metrics = getInstagramMetrics(document);
      }

      const capturedChunks = [];
      try {
        for (let i = 0; i < options.maxCarouselSlides; i++) {
          await waitForResumeIfPaused();
          console.log(`Catturo slide ${i + 1}...`);
          await wait(options.screenshotDelay || 500);
          const category = getMetaCategory();
          try {
            const response = await sendMessageAsync({ action: 'captureChunk' });
            if (response && response.dataUrl) {
              showSuccessModal();
              capturedChunks.push({
                dataUrl: response.dataUrl,
                category: category,
                brandName: brandName,
                metrics: metrics,
                caption: caption, // NUEVO: Aggiunta caption
                date: date // NUOVO: Aggiunta data
              });
            } else {
              throw new Error("Pezzo di screenshot non ricevuto.");
            }
          } catch (error) {
            console.error("Errore durante la cattura della slide:", error);
            break;
          }

          if (metaTotalSlides && (i + 1) >= metaTotalSlides) {
            console.log(`Raggiunta l'ultima slide di Meta (slide ${i + 1} di ${metaTotalSlides}).`);
            break;
          }

          const currentNextButton = await findCarouselButton();
          const isButtonVisible = currentNextButton && currentNextButton.offsetParent !== null && !currentNextButton.disabled;
          if (i < options.maxCarouselSlides - 1 && isButtonVisible) {
            currentNextButton.click();
            await wait(options.carouselSwipeDelay || 1000);
          } else {
            console.log("Fine del carosello.");
            break;
          }
        }
      } catch (error) {
        if (error.message === "Processo interrotto") {
          console.log("Cattura del carosello generico interrotta.");
        } else {
          console.error("Errore imprevisto nel carosello generico:", error);
        }
      }
      return capturedChunks.length > 0 ? capturedChunks : captureVisibleArea(options);
    }
  }

  // ========= FUNZIONE POPUP COMPLETAMENTO GOOGLE ADS =========
  function showGoogleAdsCompletionModal(captured, total) {
    if (document.getElementById('google-ads-completion-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'google-ads-completion-modal';
    modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.7); z-index: 9999999; display: flex; justify-content: center; align-items: center; opacity: 0; transition: opacity 0.3s ease;`;

    const content = document.createElement('div');
    content.style.cssText = `background-color: white; padding: 40px 60px; border-radius: 15px; text-align: center; transform: scale(0.8); transition: transform 0.3s ease;`;

    const percentage = Math.round((captured / total) * 100);
    const icon = captured === total ? '✅' : '⚠️';
    const color = captured === total ? '#4CAF50' : '#ff9800';

    content.innerHTML = `
      <div style="font-size: 60px; margin-bottom: 20px;">${icon}</div>
      <h2 style="color: #333; font-family: Arial, sans-serif; font-size: 28px; margin: 0 0 10px 0;">Google Ads Completato!</h2>
      <p style="color: #666; font-family: Arial, sans-serif; font-size: 18px; margin: 0;">
        <strong style="color: ${color}; font-size: 32px;">${captured}</strong> / ${total} annunci catturati
      </p>
      <p style="color: #999; font-family: Arial, sans-serif; font-size: 14px; margin: 10px 0 0 0;">
        ${percentage}% completato
      </p>
    `;

    modal.appendChild(content);
    document.body.appendChild(modal);

    setTimeout(() => {
      modal.style.opacity = '1';
      content.style.transform = 'scale(1)';
    }, 10);

    setTimeout(() => {
      modal.style.opacity = '0';
      content.style.transform = 'scale(0.8)';
      setTimeout(() => {
        if (modal.parentNode) {
          document.body.removeChild(modal);
        }
      }, 300);
    }, 2500); // Mostra per 2.5 secondi
  }
  // ========= FINE FUNZIONE POPUP COMPLETAMENTO =========

  // ========= FUNZIONE SCRAPING GOOGLE ADS =========
  async function captureGoogleAds(options = {}) {
    console.log("=".repeat(80));
    console.log("[GoogleAds] 🚀 INIZIO SCRAPING - Timestamp:", Date.now());
    console.log("=".repeat(80));
    console.log("[GoogleAds] 📋 Parametri ricevuti:", JSON.stringify(options, null, 2));
    console.log("[GoogleAds] 🌐 URL corrente:", window.location.href);

    const AD_CARD_SELECTOR = 'creative-preview';
    const savedSpeed = localStorage.getItem('havas_capture_speed');
    const speedFactor = savedSpeed ? parseFloat(savedSpeed) : 1.0;
    const fastWait = (ms) => new Promise(r => setTimeout(r, ms / speedFactor));

    // 0. VERIFICA CHE LA PAGINA SIA COMPLETAMENTE CARICATA
    if (document.readyState !== 'complete') {
      await new Promise(resolve => {
        if (document.readyState === 'complete') resolve();
        else window.addEventListener('load', resolve, { once: true });
      });
    }

    // 1. Aspetta il caricamento iniziale
    console.log("[GoogleAds] ⏳ Attendo caricamento iniziale...");
    await fastWait(5000);

    // I FILTRI (Date, Piattaforma, Formato) sono già applicati nell'URL!
    console.log("[GoogleAds] 🎯 Filtri già presenti nell'URL. Procedo direttamente al click 'See all ads'.");

    // 2. CLICK "SEE ALL ADS"
    console.log("[GoogleAds] Cerco il pulsante 'See all ads'...");
    const seeAllKeywords = ['see all ads', 'visualizza tutti', 'vedi tutti gli annunci', 'vedi tutti', 'see all', 'mostra tutti'];
    let seeAllButtonFound = false;

    for (let attempt = 0; attempt < 8; attempt++) {
      const allClickables = document.querySelectorAll('a, button, div[role="button"], span[role="button"], material-button, [aria-label]');
      for (const el of allClickables) {
        const text = (el.innerText || el.textContent || '').toLowerCase().trim();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase().trim();
        const combinedText = text + ' ' + ariaLabel;

        if (seeAllKeywords.some(k => combinedText.includes(k))) {
          console.log(`[GoogleAds] ✅ Trovato pulsante: "${el.innerText.trim() || el.getAttribute('aria-label')}". Clicco...`);
          el.click();
          seeAllButtonFound = true;
          await fastWait(6000);

          const adsLoaded = document.querySelectorAll(AD_CARD_SELECTOR).length;
          if (adsLoaded > 0) break;
          else seeAllButtonFound = false;
        }
      }
      if (seeAllButtonFound) break;
      await fastWait(2500);
    }

    if (!seeAllButtonFound) {
      const existingAds = document.querySelectorAll(AD_CARD_SELECTOR);
      if (existingAds.length > 0) seeAllButtonFound = true;
      else {
        const advertiserLinks = document.querySelectorAll('a[href*="/advertiser/"]');
        if (advertiserLinks.length > 0) {
          advertiserLinks[0].click();
          await fastWait(6000);
        }
      }
    }

    // 3. CATTURA ANNUNCI CON SCROLL PROGRESSIVO
    console.log("[GoogleAds] 📸 Inizio cattura annunci...");
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

    window.scrollTo(0, 0);
    await fastWait(2000);

    let emptyCycles = 0;
    while (capturedAds.size < maxAds && emptyCycles < 5) {
      const allAds = Array.from(document.querySelectorAll(AD_CARD_SELECTOR));
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
        ad.scrollIntoView({ block: "center", behavior: "smooth" });
        await fastWait(1500);

        const rect = ad.getBoundingClientRect();
        if (rect.width < 50 || rect.height < 50) continue;

        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          ad.scrollIntoView({ block: "center", behavior: "instant" });
          await fastWait(1000);
        }

        let caption = "";
        let formatType = "Misto";
        try {
          const textContent = ad.innerText || "";
          caption = textContent.replace(/Shown between[^\n]+/g, '').replace(/See details/gi, '').replace(/\n+/g, ' ').trim();
          caption = caption.substring(0, 150) + (caption.length > 150 ? "..." : "");
          const badge = ad.querySelector('div[class*="format-badge"], div[aria-label]');
          if (badge && badge.innerText) formatType = badge.innerText.trim();
        } catch (e) { }

        try {
          if (controlUI) controlUI.style.display = 'none';
          await new Promise(r => setTimeout(r, 200));
          const response = await sendMessageAsync({ action: 'captureChunk' });
          if (controlUI) controlUI.style.display = 'flex';

          if (response && response.dataUrl) {
            const croppedUrl = await internalCrop(response.dataUrl, {
              x: rect.left, y: rect.top, width: rect.width, height: rect.height
            });

            results.push({
              dataUrl: croppedUrl,
              brandName: advertiserName,
              caption: `Format: ${formatType} | ${caption}`,
              category: 'Google Ads Library',
              period: options.googlePeriod || "",
              country: options.targetCountry || "",
              date: new Date().toLocaleDateString('it-IT'),
              adId: adId
            });

            capturedAds.add(adId);
            adElementMap.set(adId, ad);
          }
        } catch (err) {
          if (controlUI) controlUI.style.display = 'flex';
        }
      }
    }

    console.log(`[GoogleAds] 🎉 Fase 1 completata! Catturati ${results.length} annunci.`);

    // ═══════════════════════════════════════════════════════════
    //  FASE 2 — Apri dettagli per ogni annuncio catturato
    // ═══════════════════════════════════════════════════════════
    console.log('[GoogleAds] ── FASE 2: apertura dettagli inserzioni ──');

    // Helper: attendi apertura pannello dettaglio Google Ads
    const waitForGoogleDialog = async () => {
      for (let i = 0; i < 30; i++) {
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
          btns[btns.length - 1].click();
          clicked = true;
          await fastWait(800);
          break;
        }
      }

      if (!clicked || window.location.href.includes('creative-details')) {
        window.history.back();
        await fastWait(1000);
      }

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await fastWait(500);
    };

    // Torna in cima prima di iniziare la Fase 2
    window.scrollTo({ top: 0, behavior: 'instant' });
    await fastWait(1200);

    for (let i = 0; i < results.length; i++) {
      console.log(`[GoogleAds] Dettagli ${i + 1}/${results.length}`);

      // Re-query del DOM per battere Angular (non usiamo più adElementMap)
      let allAds = document.querySelectorAll(AD_CARD_SELECTOR);

      let retryScroll = 0;
      while (allAds.length <= i && retryScroll < 15) {
        window.scrollBy(0, 1000);
        await fastWait(1000);
        allAds = document.querySelectorAll(AD_CARD_SELECTOR);
        retryScroll++;
      }

      if (allAds.length <= i) {
        console.warn(`[GoogleAds] Impossibile trovare l'annuncio in posizione ${i}, salto.`);
        continue;
      }

      let adEl = allAds[i];

      // Porta la card al centro
      adEl.scrollIntoView({ block: 'center', behavior: 'instant' });
      await fastWait(800);

      // CLICK CORRETTO: <creative role="button">
      const clickTarget = adEl.querySelector('creative[role="button"]') || adEl.querySelector('[role="button"]') || adEl;

      console.log(`[GoogleAds] Clicco target per aprire i dettagli...`);
      clickTarget.click();
      await fastWait(1500);

      const dialog = await waitForGoogleDialog();
      if (!dialog) {
        console.warn(`[GoogleAds] Pannello dettagli non trovato, salto e torno indietro.`);
        await closeGoogleDialog();
        continue;
      }

      console.log('[GoogleAds] Eseguo scroll interno del pannello...');
      const innerEls = dialog.querySelectorAll('p, span, div, h1, h2, h3, li');
      for (let j = 0; j < innerEls.length; j++) {
        if (j % 5 === 0 || j === innerEls.length - 1) {
          innerEls[j].scrollIntoView({ behavior: 'smooth', block: 'center' });
          await fastWait(150);
        }
      }
      dialog.scrollIntoView({ behavior: 'instant', block: 'start' });
      await fastWait(300);

      console.log('[GoogleAds] Simulo la selezione visiva del testo...');
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(dialog);
      selection.removeAllRanges();
      selection.addRange(range);
      await fastWait(800);
      selection.removeAllRanges();

      const rawDetailText = (dialog.innerText || '').trim();

      if (rawDetailText) {
        results[i].caption = (results[i].caption || '') + '|||GOOGLE_DETAILS|||' + rawDetailText;
      }

      console.log(`[GoogleAds] Dettagli estratti: ${rawDetailText.length} caratteri`);

      await closeGoogleDialog();
      await fastWait(1200);

      // CONTROLLO DI SICUREZZA: Forziamo l'uscita se siamo rimasti intrappolati
      if (window.location.href.includes('creative-details') || document.querySelector('creative-details')) {
        console.warn(`[GoogleAds] ⚠️ Dettagli ancora aperti. Forzo l'uscita.`);
        window.history.back();
        await fastWait(1500);

        if (window.location.href.includes('creative-details')) {
          console.error("[GoogleAds] ❌ Blocco critico. Impossibile tornare alla griglia.");
          break;
        }
      }
    }

    if (results.length > 0) showGoogleAdsCompletionModal(results.length, maxAds);
    return results.length > 0 ? results : null;
  }
  // ========= FINE FUNZIONE SCRAPING GOOGLE ADS =========

  async function captureVisibleArea(options = {}) {
    console.log("Inizio cattura area visibile con opzioni:", options);
    console.log("🔍 URL corrente:", window.location.href);
    console.log("🔍 options.isGoogleAds:", options.isGoogleAds);
    console.log("🔍 options.isMetaAds:", options.isMetaAds);
    console.log("🔍 Contiene adstransparency?", window.location.href.includes('adstransparency.google.com'));

    // ========= GESTIONE GOOGLE ADS =========
    if (window.location.href.includes('adstransparency.google.com') && options.isGoogleAds) {
      console.log("🎯 Rilevata pagina Google Ads Transparency - Avvio scraping personalizzato");
      return await captureGoogleAds(options);
    } else if (window.location.href.includes('adstransparency.google.com')) {
      console.warn("⚠️ Pagina Google Ads rilevata ma options.isGoogleAds è FALSE!");
      console.warn("⚠️ Verrà eseguito uno screenshot normale invece dello scraping");
    }
    // ========= FINE GESTIONE GOOGLE ADS =========

    // ========= GESTIONE META ADS LIBRARY =========
    if (window.location.href.includes('facebook.com/ads/library') && options.isMetaAds) {
      console.log("🎯 Rilevata pagina Meta Ads Library - Avvio scraping personalizzato");
      if (window.MetaScraper && typeof window.MetaScraper.startScraping === 'function') {
        return await window.MetaScraper.startScraping(options);
      } else {
        console.error("❌ ERRORE: MetaScraper non trovato! Eseguo fallback a screenshot singolo.");
      }
    }
    // ========= FINE GESTIONE META ADS LIBRARY =========

    await handleTikTokSpecifics();

    if (options.removePopups) {
      try {
        const selectors = '[aria-label*="lose"], [aria-label*="ccept"], [data-cookiebanner="accept_button"], div[role="dialog"] button';
        document.querySelectorAll(selectors).forEach(btn => btn.click());
      } catch (e) { console.warn("Errore chiusura popup:", e); }
    }
    await wait(options.screenshotDelay || 2000);

    // Verifica se esiste un carosello
    const nextButton = await findCarouselButton();
    if (nextButton) {
      console.log("⚠️ Rilevato carosello anche in modalità normale! Gestisco tutte le slide...");
      return captureCarousel(options);
    }

    // Screenshot singolo (no carosello)
    // MODIFICA: Aggiunta categoria specifica per Reels
    let category = getMetaCategory();
    if (isInstagramReelPage()) {
      category = 'Instagram Reel';
    }
    const brandName = getBrandName(); // NUOVO: Estrae il brand

    // NUOVO: Estrae la caption e la data per Instagram
    let caption = null;
    let date = null;
    if (window.location.hostname.includes('instagram.com')) {
      caption = getInstagramCaption();
      date = getInstagramDate();
    }

    console.log("Catturo la schermata visibile...");
    try {
      const response = await sendMessageAsync({ action: 'captureChunk' });
      if (response && response.dataUrl) {
        showSuccessModal();
        // Rilevamento automatico della piattaforma per le metriche
        let metrics = { likes: 0, comments: 0, reshares: 0 };
        if (window.location.hostname.includes('tiktok.com')) {
          metrics = getTikTokMetrics();
          caption = getTikTokCaption();
          date = getTikTokDate();
        } else {
          metrics = getInstagramMetrics(document);
        }
        return {
          dataUrl: response.dataUrl,
          category: category || (window.location.hostname.includes('tiktok.com') ? 'TikTok Video' : null),
          brandName: brandName,
          metrics: metrics,
          caption: caption,
          date: date
        };
      } else {
        throw new Error("Screenshot non ricevuto. Dettagli: " + JSON.stringify(response));
      }
    } catch (error) {
      throw new Error("Comunicazione con il background script fallita.");
    }
  }

  // ========= PUNTO DI INGRESSO PRINCIPALE =========

  createControlUI();

  // Esportiamo la funzione così i file scraper (Meta e Google) possono mostrare la spunta verde
  window.triggerSuccessModal = showSuccessModal;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'startFullPageCapture') {
      (async () => {
        try {
          let result;
          const isDateActive = message.options.socialStartDate && message.options.socialEndDate;

          // Gestione modalità normale (desk/google_ads)
          if (isInstagramProfilePage() && (message.options.numInstagramPosts > 0 || isDateActive)) {
            result = await handleInstagramProfile(message.options);
          }
          else if (isTikTokProfilePage() && (message.options.numInstagramPosts > 0 || isDateActive)) {
            result = await handleTikTokProfile(message.options);
          }
          else if (isInstagramPostPage()) {
            const data = await handleInstagramPost(message.options);
            result = { status: 'success', dataUrl: data };
          }
          else if (isInstagramReelPage()) {
            const data = await captureVisibleArea(message.options);
            result = { status: 'success', dataUrl: data };
          }
          else if (message.options.captureCarousel) {
            const data = await captureCarousel(message.options);
            result = { status: 'success', dataUrl: data };
          }
          else {
            // Cattura normale (include Google Ads se isGoogleAds è true)
            const data = await captureVisibleArea(message.options);
            result = { status: 'success', dataUrl: data };
          }

          sendResponse(result);
        } catch (error) {
          console.error("Errore finale nella cattura:", error);
          sendResponse({ status: 'error', message: error.message });
        }
      })();
      return true;
    }
  });
}