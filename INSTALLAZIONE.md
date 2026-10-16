# Easy RT Utility 0.1.33

## Installazione Windows

- `EasyRT_Setup_Leggero_0.1.33.exe`: installer compatto. Al primo utilizzo scarica il motore da GitHub, verifica SHA-256 e installa EasyRT. Serve Internet se il motore compatibile non è già presente.
- `EasyRT_Unico_0.1.33.exe`: setup completo, utilizzabile anche senza Internet.
- `EasyRT_Windows_0.1.33.zip`: versione portatile. Estrai tutto nella stessa cartella e apri `EasyRT.exe`.

I setup hanno l’icona ufficiale, pulsanti arrotondati e collegamenti Desktop/menu Start. Installano nella cartella locale dell’utente, senza chiedere privilegi amministrativi.

La configurazione e il registro restano in `%LOCALAPPDATA%\EasyRT`; le versioni dell’app in `%LOCALAPPDATA%\Programs\EasyRT`. La revisione precedente viene conservata. Per tornare alla precedente puoi avviarne l’eseguibile nella sua cartella; reinstalla il suo setup per ripristinare anche i collegamenti.

## Aggiornamenti automatici

EasyRT controlla GitHub all’avvio. Scarica solo setup di release stabili più recenti, da `EasysistemRB/EasyRT-Releases`, verificandone SHA-256. Il setup viene eseguito alla chiusura dell’app; un comando sulla cassa in corso blocca la chiusura. Il pulsante Aggiornamenti mostra lo stato del controllo.

Gli update usano il setup leggero. Se la versione e l’integrità del motore corrispondono alla distribuzione, lo riutilizzano dal PC; altrimenti scaricano il motore completo. Il peso del primo download totale resta simile al pacchetto completo.

Le versioni `rc` sono di collaudo e non vengono proposte automaticamente. SHA-256 verifica l’integrità e non sostituisce una firma dell’editore. Questa revisione non è dichiarata firmata.

## Verifiche

Test del protocollo su server simulato, controlli degli aggiornamenti, integrità ZIP e controlli visivi automatici nella pipeline. Il risultato aggiornato è consultabile in GitHub Actions.

Il collaudo sul registratore reale e l’installazione su un PC Windows dell’utente rimangono necessari prima di promuovere una release stabile. Le operazioni fiscali non hanno reinvio automatico.

Easy Sistem · Via Grotta dell’Olmo, 51 · 80014 Giugliano in Campania (NA)
