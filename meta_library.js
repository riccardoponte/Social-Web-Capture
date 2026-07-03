// meta_library.js - Gestore ricerca Meta Ads Library con filtri data integrati

window.MetaLibraryHandler = {
    /**
     * Converte una data dal formato G/M/AAAA al formato AAAA-MM-GG richiesto da Meta
     * @param {string} dateStr - Data inserita dall'utente (es. "2/6/2019")
     * @returns {string|null} - Data formattata (es. "2019-06-02") o null
     */
    formatDateForMeta: function (dateStr) {
        if (!dateStr) return null;

        // Pulizia e split della stringa
        const parts = dateStr.trim().split('/');
        if (parts.length !== 3) return null;

        // Aggiunge lo zero iniziale se necessario (es. 2 -> 02)
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];

        // Verifica minima validità anno
        if (year.length !== 4) return null;

        return `${year}-${month}-${day}`;
    },

    /**
     * Genera l'URL completo per la Ads Library con tutti i parametri di ricerca
     */
    generateUrl: function (keyword, startDate, endDate, country, status, mediaType) {
        const baseUrl = "https://www.facebook.com/ads/library/";

        // Parametri standard richiesti da Meta
        const params = {
            active_status: status || 'active',
            ad_type: 'all',
            country: country || 'IT',
            media_type: mediaType || 'all',
            'sort_data[mode]': 'total_impressions',
            'sort_data[direction]': 'desc',
            search_type: 'keyword_unordered',
            q: keyword
        };

        // Se si cerca su TUTTI i paesi, Meta richiede questa specifica combinazione
        if (country === 'ALL') {
            params.country = 'ALL';
            params.is_targeted_country = 'false';
        } else {
            // Se è un paese specifico, di solito is_targeted_country non serve o va messo a true in certi contesti, 
            // ma false è il default sicuro per la visualizzazione standard.
            params.is_targeted_country = 'false';
        }

        // Gestione date: se presenti, vengono convertite e aggiunte ai parametri URL
        const formattedStart = this.formatDateForMeta(startDate);
        const formattedEnd = this.formatDateForMeta(endDate);

        if (formattedStart) {
            params['start_date[min]'] = formattedStart;
        }

        if (formattedEnd) {
            params['start_date[max]'] = formattedEnd;
        }

        const urlParams = new URLSearchParams(params);
        return `${baseUrl}?${urlParams.toString()}`;
    },

    /**
     * Funzione principale richiamata dal popup.js
     */
    search: function (keyword, startDate, endDate, country, status, mediaType) {
        if (!keyword) return;

        const finalUrl = this.generateUrl(keyword, startDate, endDate, country, status, mediaType);

        // Apriamo il tab con l'URL già filtrato. 
        window.open(finalUrl, '_blank');

        console.log("[MetaLibraryHandler] Ricerca avviata con URL:", finalUrl);
    }
};