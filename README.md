# Easy RT Utility

Sorgenti, revisioni, setup Windows e aggiornamenti di Easy RT Utility di Easy Sistem.

## Sviluppo e collaudo

L’app conserva sette sezioni: Connessione, Operazioni, Giornale, Programmazione, Portale, Tecnica e Informazioni. I loghi approvati sono nel repository. I dati degli utenti e le credenziali non fanno parte dei sorgenti.

`node --test resources/app/test*.cjs` esegue i test locali. La pipeline esegue anche il controllo dell’interfaccia con Chromium su più dimensioni e la compilazione degli installer.

## Revisioni e pubblicazione

- Ogni push su `main` genera una prerelease di collaudo `vVERSIONE-rc.NUMERO` con setup leggero, setup completo e ZIP portatile.
- Le pull request eseguono gli stessi controlli senza pubblicare release.
- Dopo il collaudo reale, un tag esatto `vVERSIONE` genera una release stabile e gli utenti la ricevono automaticamente alla chiusura dell’app.
- Incrementare `version` e `resources/app/package.json` insieme. `electron-version` fissa il motore utilizzato. Non modificare la versione di una release già pubblicata.
- GitHub Actions genera i checksum degli asset e non pubblica una release se i controlli falliscono.

Gli installer e gli update sono descritti in [INSTALLAZIONE.md](INSTALLAZIONE.md). Il workflow di pulizia già presente conserva l’ultima stabile e rimuove le altre release pubblicate da oltre tre mesi; non elimina la cronologia Git.

## Build manuale

Scaricare e verificare il runtime Electron Windows x64 della versione in `electron-version`, poi eseguire:

```sh
python3 release/build.py --runtime electron.zip --tag v0.1.33-rc.1
```

Servono Python 3 e Go; i PC degli utenti non devono installare strumenti di sviluppo.

I componenti ausiliari CUSTOM RX Configurator e Advanced IP Scanner provengono dal pacchetto di lavoro originale. Rimangono strumenti separati, con i rispettivi termini d’uso. Il protocollo CUSTOM è verificato da EasyRT.

Gli strumenti di grandi dimensioni possono essere conservati in parti nel repository. La build li ricompone in memoria e verifica SHA-256 delle parti e del file completo prima di inserirli nel setup.
