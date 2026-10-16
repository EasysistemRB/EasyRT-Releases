# 0.1.33 — revisione sorgenti per collaudo

- Verifica runtime e codice prima di riutilizzare una installazione esistente.
- Verifica file estratti prima di attivare una nuova installazione.
- Build bloccata per tag/versioni incoerenti e percorsi ZIP non sicuri.
- Test aggiornamenti adattati alla versione corrente; due test Python aggiunti alla pipeline.
- Setup Windows e pubblicazione GitHub ancora da completare: vedere STATO_REVISIONE.md.

# Revisioni

## 0.1.32

- Connessione compatta, campi adattabili alla finestra e pulsanti con icone.
- Intestazione separata dal logo, logo CUSTOM nella barra superiore e logo Easy RT Utility approvato nella pagina.
- Corretti stati nascosti, schede identificative e indirizzo aziendale/CAP nelle informazioni.
- Pulsanti Chiudi applicazione e Aggiornamenti nella barra desktop.
- Gestione GitHub dei sorgenti e delle revisioni; build automatica con controlli prima della pubblicazione.
- Setup leggero e completo con icona ufficiale; aggiornamenti verificati applicati alla chiusura senza interrompere operazioni RT.
- Runtime riutilizzato quando compatibile, nuova versione installata separatamente, precedente conservata.
- Configurazione IP/porte e macchine rilevate salvate su file locale, conservate anche quando cambia la porta interna dell’app.
