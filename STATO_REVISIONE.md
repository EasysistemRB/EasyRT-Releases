# Stato revisione 0.1.33 — 8 ottobre 2026

Sorgenti aggiornati dalla 0.1.32. Verifiche installer: controllo SHA256 anche del runtime quando la versione esiste già; verifica di tutti i file estratti prima di attivare la nuova cartella. Build: tag coerente con versione, metadati runtime coerenti, rifiuto percorsi ZIP non sicuri. Test aggiornamenti indipendenti dal numero di revisione.

Verifiche superate: 11 test Node e 2 test Python (il secondo verifica quattro percorsi non sicuri). Conservati i loghi e le sette sezioni.

Non eseguiti: collaudo grafico (Chromium assente), compilazione EXE (Go assente), parsing PowerShell e installazione Windows, collaudo su registratore reale. Non è una release stabile collaudata.

GitHub: creazione e lettura del ramo easyrt/connection-check-20261008-2240 riuscite dopo la correzione della connessione. La prova non ha restituito 403. Caricamento dei sorgenti e permessi workflow ancora da verificare. Allineati versione applicazione, file version e testi interfaccia a 0.1.33; ripristinati i controlli di build richiesti dai test e resi i test updater indipendenti dalla revisione.

Gli archivi Windows 0.1.32 recuperati sono invariati. Questa consegna contiene soltanto i sorgenti aggiornati 0.1.33, non un nuovo setup EXE.
