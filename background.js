// background.js -- SOSTITUITO chrome.storage.local CON INDEXEDDB PER SUPERARE IL LIMITE DI 5MB

// ========= INIZIO GESTORE DATABASE INDEXEDDB =========
const DB_NAME = 'HavasCaptureDB';
const STORE_NAME = 'screenshots';

function openDB() {
  return new Promise((resolve, reject) => {
    // Aumentiamo la versione a 3 per aggiungere il nuovo store pageHistory
    const request = indexedDB.open(DB_NAME, 3);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      // STORE PER I PDF
      if (!db.objectStoreNames.contains('pdfs')) {
        db.createObjectStore('pdfs', { keyPath: 'id', autoIncrement: true });
      }
      // STORE PER LA CRONOLOGIA PAGINE
      if (!db.objectStoreNames.contains('pageHistory')) {
        db.createObjectStore('pageHistory', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject('Errore IndexedDB: ' + event.target.errorCode);
  });
}

// --- NUOVE FUNZIONI DB PER I PDF ---
async function dbSavePDF(pdfData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pdfs'], 'readwrite');
    const store = transaction.objectStore('pdfs');
    const request = store.add(pdfData);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e);
  });
}

async function dbGetPDFs() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pdfs'], 'readonly');
    const store = transaction.objectStore('pdfs');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e);
  });
}

async function dbDeletePDF(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pdfs'], 'readwrite');
    const store = transaction.objectStore('pdfs');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}

async function dbRenamePDF(id, newName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pdfs'], 'readwrite');
    const store = transaction.objectStore('pdfs');
    const request = store.get(id);
    request.onsuccess = () => {
      const pdf = request.result;
      if (pdf) {
        pdf.name = newName;
        const updateRequest = store.put(pdf);
        updateRequest.onsuccess = () => resolve();
        updateRequest.onerror = (e) => reject(e);
      } else {
        reject('PDF not found');
      }
    };
    request.onerror = (e) => reject(e);
  });
}
// --- FINE NUOVE FUNZIONI PDF ---

// --- FUNZIONI DB PER CRONOLOGIA PAGINE ---
async function dbSavePageHistory(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pageHistory'], 'readwrite');
    const store = transaction.objectStore('pageHistory');
    const request = store.add(entry);
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => reject(e);
  });
}

async function dbGetPageHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pageHistory'], 'readonly');
    const store = transaction.objectStore('pageHistory');
    const request = store.getAll();
    request.onsuccess = () => {
      // Ordina per timestamp decrescente (più recenti prima)
      const history = request.result.sort((a, b) => b.timestamp - a.timestamp);
      resolve(history);
    };
    request.onerror = (e) => reject(e);
  });
}

async function dbClearPageHistory() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pageHistory'], 'readwrite');
    const store = transaction.objectStore('pageHistory');
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
}
// --- FINE FUNZIONI CRONOLOGIA ---

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject('Errore nel leggere da DB: ' + event.target.errorCode);
  });
}

async function dbUpdateAll(screenshots) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.clear().onsuccess = () => {
      // Assegnamo un 'id' progressivo per mantenere l'ordine
      screenshots.forEach((shot, index) => {
        if (!shot.id) shot.id = index; // Assicura che ogni oggetto abbia una chiave
        store.put(shot);
      });
    };
    transaction.oncomplete = () => resolve({ status: 'updated' });
    transaction.onerror = (event) => reject('Errore nell\'aggiornare il DB: ' + event.target.errorCode);
  });
}

async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();
    request.onsuccess = () => resolve({ status: 'cleared' });
    request.onerror = (event) => reject('Errore nel pulire il DB: ' + event.target.errorCode);
  });
}
// ========= FINE GESTORE DATABASE INDEXEDDB =========


// Gestisce il click sull'icona dell'estensione
chrome.action.onClicked.addListener((tab) => {
  const extensionUrl = chrome.runtime.getURL('popup.html');

  chrome.tabs.query({ url: extensionUrl }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: extensionUrl });
    }
  });
});


let capturedScreenshots = [];
let isProcessing = false;
let workerTabId = null;
let workerWindowId = null;
let isPaused = false;
let isStopped = false;

// Carica gli screenshot salvati da IndexedDB all'avvio
(async () => {
  try {
    capturedScreenshots = await dbGetAll();
    console.log(`Sessione con ${capturedScreenshots.length} screenshot caricata da IndexedDB.`);
  } catch (e) {
    console.error("Impossibile caricare da IndexedDB:", e);
  }
})();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startProcessing' && message.urls) {
    if (isProcessing) {
      sendResponse({ status: "busy" });
      return false;
    }
    capturedScreenshots = [];
    dbClear(); // Svuota il database prima di iniziare
    isPaused = false;
    isStopped = false;
    processUrlQueue(message.urls, message.options);
    sendResponse({ status: "started" });
    return false;
  }

  if (message.action === 'getScreenshots') {
    (async () => {
      try {
        const screenshots = await dbGetAll();
        capturedScreenshots = screenshots; // Sincronizza lo stato in memoria
        sendResponse({ screenshots: screenshots });
      } catch (e) {
        console.error("Errore nel recuperare screenshots dal DB:", e);
        sendResponse({ screenshots: [] }); // Invia un array vuoto in caso di errore
      }
    })();
    return true; // Indica che la risposta sarà asincrona
  }

  if (message.action === 'updateScreenshots') {
    capturedScreenshots = message.screenshots;
    // La risposta viene inviata quando la promise si risolve
    dbUpdateAll(capturedScreenshots).then(sendResponse).catch(err => console.error(err));
    return true; // Indica che la risposta sarà asincrona
  }

  if (message.action === 'clearScreenshots') {
    capturedScreenshots = [];
    dbClear().then(sendResponse).catch(err => console.error(err));
    return true; // Indica che la risposta sarà asincrona
  }

  if (message.action === 'captureChunk') {
    chrome.windows.update(sender.tab.windowId, { focused: true }, () => {
      // Aspettiamo 100ms dopo il focus per essere sicuri che il buffer grafico sia pronto
      setTimeout(() => {
        chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
          if (chrome.runtime.lastError || !dataUrl) {
            sendResponse({ error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "Capture failed" });
          } else {
            sendResponse({ dataUrl: dataUrl });
          }
        });
      }, 150);
    });
    return true;
  }

  // Handler per il controllo del processo
  if (message.action === 'pauseProcessing') {
    isPaused = true;
    sendResponse({ status: 'paused' });
    return true;
  }
  if (message.action === 'getProcessingState') {
    sendResponse({ isPaused: isPaused, isStopped: isStopped });
    return true;
  }
  if (message.action === 'resumeProcessing') {
    isPaused = false;
    sendResponse({ status: 'resumed' });
    return true;
  }
  if (message.action === 'stopProcessing') {
    isStopped = true;
    isPaused = false;
    sendResponse({ status: 'stopping' });
    return true;
  }

  // --- HANDLER MESSAGGI PDF ---
  if (message.action === 'savePDF') {
    dbSavePDF(message.payload).then(() => sendResponse({ status: 'saved' })).catch(err => console.error(err));
    return true;
  }
  if (message.action === 'getPDFs') {
    dbGetPDFs().then(pdfs => sendResponse({ pdfs: pdfs })).catch(err => console.error(err));
    return true;
  }
  if (message.action === 'deletePDF') {
    dbDeletePDF(message.id).then(() => sendResponse({ status: 'deleted' })).catch(err => console.error(err));
    return true;
  }
  if (message.action === 'renamePDF') {
    dbRenamePDF(message.id, message.newName).then(() => sendResponse({ status: 'renamed' })).catch(err => console.error(err));
    return true;
  }

  // --- HANDLER MESSAGGI CRONOLOGIA PAGINE ---
  if (message.action === 'savePageHistory') {
    dbSavePageHistory(message.entry).then(() => sendResponse({ status: 'saved' })).catch(err => console.error(err));
    return true;
  }
  if (message.action === 'getPageHistory') {
    dbGetPageHistory().then(history => sendResponse({ history: history })).catch(err => console.error(err));
    return true;
  }
  if (message.action === 'clearPageHistory') {
    dbClearPageHistory().then(() => sendResponse({ status: 'cleared' })).catch(err => console.error(err));
    return true;
  }

  return false;
});

async function processUrlQueue(urls, options) {
  isProcessing = true;
  console.log(`--- AVVIO PROCESSO PER ${urls.length} URL ---`);
  chrome.runtime.sendMessage({ action: 'processingStarted', total: urls.length });

  try {
    const worker = await getWorker();
    workerTabId = worker.tabId;
    workerWindowId = worker.windowId;
  } catch (error) {
    isProcessing = false;
    chrome.runtime.sendMessage({ action: 'processingError', error: "Impossibile creare la finestra di lavoro." });
    return;
  }

  for (let i = 0; i < urls.length; i++) {
    if (isStopped) {
      console.log("Ciclo interrotto da richiesta di stop.");
      break;
    }
    while (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (isStopped) break;
    }
    if (isStopped) break;

    // GESTIONE URL COME STRINGA O OGGETTO (Per passare i metadati follower)
    let currentItem = urls[i];
    let url = currentItem;
    let extraMeta = {};

    if (typeof currentItem === 'object' && currentItem.url) {
      url = currentItem.url;
      extraMeta = currentItem.meta || {};
    }

    console.log(`[${i + 1}/${urls.length}] Inizio elaborazione: ${url}`);
    chrome.runtime.sendMessage({ action: 'updateStatus', current: i + 1, total: urls.length, url: url });

    try {
      const captureResult = await navigateAndCapture(url, workerTabId, workerWindowId, options);

      if (captureResult && captureResult.status === 'found_instagram_posts') {
        if (captureResult.urls && captureResult.urls.length > 0) {
          console.log(`Profilo Instagram ${url} ha restituito ${captureResult.urls.length} post. Verranno aggiunti alla coda.`);

          // CREA OGGETTI URL CON METADATI FOLLOWER E BRAND
          const urlsWithMeta = captureResult.urls.map(u => ({
            url: u,
            meta: {
              followers: captureResult.followers,
              brandName: captureResult.brandName
            }
          }));

          urls.splice(i + 1, 0, ...urlsWithMeta);
          chrome.runtime.sendMessage({ action: 'processingStarted', total: urls.length });
        }
      }
      else if (captureResult && captureResult.status === 'success' && captureResult.dataUrl) {
        let screenshotData = captureResult.dataUrl;
        let wereScreenshotsAdded = false;

        if (screenshotData) {
          const shouldKeepFirstSlide = url.includes('instagram.com') || url.includes('facebook.com') || url.includes('meta.com') || url.includes('pinterest.com') || url.includes('fb.me') || url.includes('google.com') || url.includes('adstransparency');
          if (Array.isArray(screenshotData) && screenshotData.length > 1 && !shouldKeepFirstSlide) {
            screenshotData.shift();
          }
        }

        if (screenshotData) {
          const urlObject = new URL(url);
          const domain = urlObject.hostname.replace('www.', '');
          const baseFilename = `screenshot-${domain}-${Date.now()}`;

          // Aggiungiamo i followers all'oggetto screenshot salvato nel DB
          const followersInfo = extraMeta.followers || null;

          if (Array.isArray(screenshotData)) {
            if (screenshotData.length > 0) {
              screenshotData.forEach((shotInfo, index) => {
                const filename = `${baseFilename}-slide-${index + 1}.png`;
                capturedScreenshots.push({
                  url: shotInfo.dataUrl,
                  filename: filename,
                  category: shotInfo.category || (url.includes('tiktok.com') ? 'TikTok Video' : null),
                  brandName: shotInfo.brandName || extraMeta.brandName, // USA IL BRAND PASSATO DAL PROFILO
                  followers: followersInfo,
                  metrics: shotInfo.metrics || null,
                  caption: shotInfo.caption || null, // NUOVO: Aggiunta caption
                  startingDate: shotInfo.startingDate || null,
                  period: shotInfo.period || null,
                  country: shotInfo.country || null, // NUOVO: Aggiunta paese
                  date: shotInfo.date || null, // NUOVO: Aggiunta data
                  sourceUrl: url // NUOVO: URL originale per identificare il social
                });
              });
              wereScreenshotsAdded = true;
            }
          } else {
            const filename = `${baseFilename}.png`;
            capturedScreenshots.push({
              url: screenshotData.dataUrl,
              filename: filename,
              category: screenshotData.category || (url.includes('tiktok.com') ? 'TikTok Video' : null),
              brandName: screenshotData.brandName || extraMeta.brandName, // USA IL BRAND PASSATO DAL PROFILO
              followers: followersInfo,
              metrics: screenshotData.metrics || null,
              caption: screenshotData.caption || null, // NUOVO: Aggiunta caption
              startingDate: screenshotData.startingDate || null,
              period: screenshotData.period || null,
              country: screenshotData.country || null, // NUOVO: Aggiunta paese
              date: screenshotData.date || null, // NUOVO: Aggiunta data
              sourceUrl: url // NUOVO: URL originale per identificare il social
            });
            wereScreenshotsAdded = true;
          }
        }

        if (wereScreenshotsAdded) {
          // SALVA SU INDEXEDDB
          await dbUpdateAll(capturedScreenshots);
          chrome.runtime.sendMessage({ action: 'screenshotTaken' });
        }
      }
      else if (captureResult && captureResult.status === 'error') {
        throw new Error(captureResult.message);
      }

    } catch (error) {
      const errorMessage = error.message || 'Errore sconosciuto';
      console.error(`[${i + 1}/${urls.length}] ERRORE durante l'elaborazione di ${url}:`, errorMessage);
      chrome.runtime.sendMessage({ action: 'processingError', error: errorMessage });
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log("--- PROCESSO COMPLETATO ---");
  isProcessing = false;
  if (workerWindowId) {
    chrome.windows.remove(workerWindowId, () => {
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        if (tabs.length > 0 && tabs[0].id) {
          chrome.tabs.setZoom(tabs[0].id, 1.0, () => {
            console.log(`Zoom ripristinato al 100% per la scheda attiva: ${tabs[0].id}`);
          });
        }
      });
    });
    workerWindowId = null;
    workerTabId = null;
  }
  chrome.runtime.sendMessage({ action: 'processingFinished' });
}

async function navigateAndCapture(url, tabId, windowId, options) {
  return new Promise(async (resolve, reject) => {

    const navigationTimeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timeout di navigazione per ${url} (30 secondi).`));
    }, 30000);

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(navigationTimeout);

        setTimeout(async () => {
          try {
            let zoom = 1.0;
            let initialDelay = 4000; // Default delay

            if (url.includes('facebook.com/ads/library')) {
              zoom = 0.80; // Zoom ideale per vedere bene la griglia Meta
            } else if (url.includes('adstransparency.google.com')) {
              zoom = 0.90; // Zoom per Google Ads
              initialDelay = 8000; // Google Ads ha bisogno di più tempo per caricare (aumentato a 8s)
            } else if (url.includes('pinterest.com')) {
              zoom = 0.50;
            } else if (url.includes('instagram.com') && !url.includes('/p/') && !url.includes('/reel/')) {
              // FIX: Forza zoom 0.67 sui profili Instagram per garantire il caricamento della scrollbar.
              // A zoom 100%, Instagram non genera la barra di scorrimento verticale impedendo lo scroll della griglia.
              zoom = 0.67;
              console.log('[navigateAndCapture] Profilo Instagram rilevato: zoom forzato a 0.67 per fix scrollbar.');
            } else if (options.enableZoom) {
              zoom = 0.67;
            }
            await chrome.tabs.setZoom(tabId, zoom);

            // Aspetta il delay iniziale specifico per la piattaforma
            if (initialDelay > 4000) {
              console.log(`[navigateAndCapture] Attendo ${initialDelay}ms per il caricamento completo di ${url}...`);
              await new Promise(resolve => setTimeout(resolve, initialDelay - 4000));
            }

            // Determina quali script iniettare
            let scriptsToInject = ['content_script.js'];

            // Se siamo su Meta Ads Library, iniettiamo anche il suo scraper dedicato
            if (url.includes('facebook.com/ads/library')) {
              scriptsToInject.push('meta_scraper.js');
            }

            console.log(`[navigateAndCapture] Inietto script: ${scriptsToInject.join(', ')}`);
            for (const script of scriptsToInject) {
              await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [script],
              });
              console.log(`[navigateAndCapture] ✅ Script ${script} iniettato`);
            }

            const response = await Promise.race([
              chrome.tabs.sendMessage(tabId, { action: 'startFullPageCapture', options: options }),
              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout cattura screenshot superato.')), (options.isGoogleAds || options.isMetaAds) ? 600000 : 60000))
            ]);

            // ===== FIX CRUCIALE =====
            // Accetta sia 'success' (per screenshot normali) sia 'found_instagram_posts' (per la raccolta di link).
            if (response && (response.status === 'success' || response.status === 'found_instagram_posts')) {
              resolve(response);
            } else {
              const errorMessage = response ? response.message : "Nessuna risposta valida dal content script.";
              console.error(`[navigateAndCapture] Errore o risposta non valida:`, errorMessage);
              reject(new Error(errorMessage));
            }

          } catch (e) {
            console.error(`[navigateAndCapture] ERRORE CRITICO per ${url}:`, e.message);
            reject(new Error(`Impossibile eseguire lo script su ${url}.`));
          }
        }, 4000);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);

    try {
      await chrome.windows.update(windowId, { focused: true });
      await chrome.tabs.update(tabId, { url: url, active: true });

      // --- INIZIO SALVATAGGIO CRONOLOGIA PAGINA ---
      let platform = 'Altro';
      const urlLower = url.toLowerCase();
      if (urlLower.includes('instagram.com')) platform = 'Instagram';
      else if (urlLower.includes('tiktok.com')) platform = 'TikTok';
      else if (urlLower.includes('facebook.com/ads/library') || urlLower.includes('fb.me')) platform = 'Meta Ads';
      else if (urlLower.includes('adstransparency.google.com')) platform = 'Google Ads';
      else if (urlLower.includes('pinterest.com')) platform = 'Pinterest';

      // Salva nel database (la funzione è già definita a inizio file)
      await dbSavePageHistory({
        url: url,
        platform: platform,
        timestamp: Date.now()
      }).catch(e => console.error("Errore salvataggio cronologia:", e));
      // --- FINE SALVATAGGIO CRONOLOGIA PAGINA ---

    } catch (error) {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(navigationTimeout);
      reject(new Error(error.message || `Impossibile navigare a ${url}`));
    }
  });
}

async function getWorker() {
  return new Promise((resolve, reject) => {
    if (workerWindowId) {
      chrome.windows.get(workerWindowId, { populate: true }, (window) => {
        if (chrome.runtime.lastError || !window) {
          workerWindowId = null;
          workerTabId = null;
          getWorker().then(resolve).catch(reject);
        } else {
          resolve({ windowId: workerWindowId, tabId: window.tabs[0].id });
        }
      });
    } else {
      chrome.windows.create({
        url: "about:blank",
        type: "normal",
        state: "maximized"
      }, (window) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        workerWindowId = window.id;
        workerTabId = window.tabs[0].id;
        resolve({ windowId: workerWindowId, tabId: workerTabId });
      });
    }
  });
}