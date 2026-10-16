const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {session,customTool,customReport,customReceipt,receiptPlan,frame,acquireReceipt}=require('./custom-proto.cjs');
const token=crypto.randomBytes(24).toString('hex'),dir=process.env.ERT_DATA_DIR||__dirname;fs.mkdirSync(dir,{recursive:true});
const {protect,unprotect}=require('./vault.cjs');
let busy=false,activeController;
const {operationContext}=require("./custom-proto.cjs");
function target(a){if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(a.host)||a.host.split('.').some(x=>+x>255))throw Error('Inserire un indirizzo IPv4 valido');const port=Number(a.port);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Porta non valida');return {host:a.host,port};}
function checked(r){if(!r.ok)throw Error(r.error);return r.replies[0];}
function headerAscii(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,' ').replace(/\s+/g,' ').trim().slice(0,32);}
function receiptInput(a){const amount=Number(a.amount),department=Number(a.department);if(!Number.isFinite(amount)||amount<=0||amount>9999999.99||Math.abs(amount*100-Math.round(amount*100))>0.00001)throw Error('Importo positivo con massimo due decimali richiesto');if(!Number.isInteger(department)||department<1||department>20)throw Error('Reparto da 1 a 20');if(!['cash','card'].includes(a.payment))throw Error('Pagamento non valido');return {lines:[{description:String(a.description||'PROVA REALE').slice(0,22),price:amount,quantity:1,department}],payment:a.payment,total:amount};}
const {scanNetwork,getScanProgress}=require("./discovery.cjs");
async function action(a){
const configFile=path.join(dir,'easy-settings.json');
function readConfig(){try{return JSON.parse(fs.readFileSync(configFile,'utf8'));}catch{return {connection:{},devices:[]};}}
if(a.op==='config_read')return {ok:true,...readConfig()};
if(a.op==='config_save'||a.op==='registry_save'){
 const config=readConfig();
 if(a.op==='config_save'){const t=target(a);const webport=Number(a.webport);if(!Number.isInteger(webport)||webport<1||webport>65535)throw Error('Porta web non valida');config.connection={host:t.host,port:t.port,webport};}
 else{if(!Array.isArray(a.devices)||a.devices.length>30)throw Error('Elenco macchine non valido');config.devices=a.devices.map(d=>{const t=target(d);return {...t,...Object.fromEntries(['model','serial','mac','hostname','lastSeen'].map(k=>[k,String(d[k]||'').slice(0,200)]))};});}
 fs.writeFileSync(configFile+'.tmp',JSON.stringify(config),{mode:0o600});fs.renameSync(configFile+'.tmp',configFile);
 return {ok:true,info:'Configurazione salvata sul PC'};
}

if(['willy_ask','willy_upload','willy_manuals','willy_status','willy_connection','willy_configure'].includes(a.op))return require('./willy-client.cjs').willy(a);
const vault=path.join(dir,'custom4u-credentials.dpapi');
if(a.op==='credential_state'){try{if(!fs.existsSync(vault))return {ok:true,saved:false};const data=JSON.parse(unprotect(fs.readFileSync(vault,'utf8')));return {ok:true,saved:true,username:data.username};}catch{return {ok:true,saved:false,info:'Accesso salvato non leggibile per questo utente Windows'};}}
if(a.op==='save_credentials'){if(typeof a.username!=='string'||!a.username.trim()||typeof a.password!=='string'||!a.password)throw Error('Email e password richieste');const encrypted=await protect(JSON.stringify({username:a.username.trim(),password:a.password}));fs.writeFileSync(vault,encrypted,{mode:0o600});return {ok:true,info:'Credenziali cifrate salvate sul PC per questo utente Windows'};}
if(a.op==='forget_credentials'){fs.rmSync(vault,{force:true});return {ok:true,info:'Credenziali locali eliminate'};}
if(a.op==='receipt_preview'){const input=receiptInput(a),plan=receiptPlan(input);if(!plan.ok)throw Error(plan.error);return {ok:true,simulation:true,info:'Simulazione completata. Nessun comando inviato alla cassa.',description:input.lines[0].description,amount:input.total,department:input.lines[0].department,payment:input.payment,steps:['Controllo dati dello scontrino','Lettura stato documento prevista','Vendita sul reparto selezionato','Registrazione pagamento','Chiusura scontrino','Espulsione carta','Lettura totale prevista'],plannedCommands:['1011',...plan.cmds],frames:plan.cmds.map((cmd,i)=>frame(cmd,i).toString('hex'))};}
if(a.op==='scan')return {ok:true,discovery:await scanNetwork({port:a.port})};
const t=target(a);
if(a.op==='experimental_reset'){if(a.confirm!=='SOFT RESET UAP')throw Error('Conferma ripristino sperimentale richiesta');return require('./uap-reset.cjs').experimentalReset({...t,signal:operationContext.getStore()});}
if(a.op==='detail_memory'){const result=await session(t.host,t.port,['8008'],3000);const raw=checked(result),match=/^8008(.{5})$/.exec(raw);if(!match)throw Error('Formato percentuale DGFE non riconosciuto');const field=match[1].trim().replace(',','.');if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(field))throw Error('Percentuale DGFE non numerica');const percent=Number(field);if(percent<0||percent>100)throw Error('Percentuale DGFE fuori intervallo: nessuna conversione ipotizzata');return {ok:true,detailMemory:{percent,raw,readAt:new Date().toISOString()}};}
if(a.op==='read_receipt'){return {ok:true,receiptCopy:await acquireReceipt({...t,number:Number(a.receiptNumber)})};}
if(a.op==='verification'){if(a.confirm!=='VERIFICA PERIODICA'||a.authorized!==true||typeof a.technician!=='string'||!a.technician.trim())throw Error('Conferma tecnico richiesta');if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(a.nextCheck))throw Error('Mese/anno prossima verifica non validi');const [year,month]=a.nextCheck.split('-');const status=checked(await session(t.host,t.port,['1011']));if(status!=='101100')throw Error('Documento aperto o stato non riconosciuto');const reply=checked(await session(t.host,t.port,['2006'+month+year.slice(-2)],60000));return {ok:true,info:'Procedura avviata: controllare lo scontrino dei test sulla cassa. Esito tecnico non ancora acquisito.',raw:reply,technician:a.technician.trim(),nextCheck:a.nextCheck};}

if(a.op==='receipt'){if(a.confirm!=='SCONTRINO REALE')throw Error('Conferma mancante');const input=receiptInput(a);const open=checked(await session(t.host,t.port,['1011']));if(open!=='101100')throw Error('Documento aperto o stato non riconosciuto: invio bloccato');const result=await customReceipt({...t,...input});if(!result.ok)return result;try{return {...result,receiptCopy:await acquireReceipt({...t,number:Number(result.fiscalNumber)})};}catch(error){return {...result,acquisitionError:error.message,info:'Invio completato; acquisizione testo non riuscita. Non ripetere la stampa.'};}}
if(a.op==='read'){const data={};for(const [key,op] of Object.entries({serial:'read_serial',model:'read_model',clock:'read_datetime',status:'printer_status'})){data[key]=await customTool({...t,op});if(!data[key].ok && (!data[key].replies?.length || activeController?.signal.aborted))throw Error(data[key].error);}data.closures=await session(t.host,t.port,['1104']);data.fiscalMemory=await session(t.host,t.port,['1211']);return {data,readAt:new Date().toISOString()};}

if(a.op==='header_read'){
  const rows=[];
  for(let i=1;i<=6;i++){
    const raw=checked(await session(t.host,t.port,['1002'+i],5000));
    const m=/^1002([1-6])([1-6])(\d{2})(.*)$/.exec(raw);
    rows.push(m?{row:Number(m[1]),pitch:Number(m[2]),text:m[4].slice(0,Number(m[3]))}:{row:i,pitch:1,text:'',raw});
  }
  let count=null;try{const r=checked(await session(t.host,t.port,['6801'],5000));const m=/^6801([0-6])/.exec(r);if(m)count=Number(m[1]);}catch{}
  return {ok:true,rows,count,info:'Intestazione letta dalla macchina'};
}
if(a.op==='header_write'){
  if(a.confirm!=='PROGRAMMA INTESTAZIONE')throw Error('Conferma programmazione intestazione richiesta');
  const status=checked(await session(t.host,t.port,['1011'],5000));if(status!=='101100')throw Error('Documento aperto o stato non riconosciuto: programmazione bloccata');
  if(!Array.isArray(a.headerLines))throw Error('Righe intestazione mancanti');
  const clean=a.headerLines.slice(0,6).map((x,i)=>({row:i+1,pitch:Math.max(1,Math.min(6,Number(x.pitch)||1)),text:headerAscii(x.text)}));
  const requestedCount=Number(a.headerCount);const count=Math.max(0,Math.min(6,Number.isInteger(requestedCount)?requestedCount:clean.filter(x=>x.text).length));
  const cmds=['6301'+count,...clean.map(x=>'6302'+x.row+x.pitch+String(Buffer.byteLength(x.text,'ascii')).padStart(2,'0')+x.text)];
  const wr=await session(t.host,t.port,cmds,60000);if(!wr.ok)throw Error(wr.error);
  const verify=[];for(let i=1;i<=6;i++){const raw=checked(await session(t.host,t.port,['1002'+i],5000));verify.push(raw);}
  return {ok:true,info:'Intestazione programmata e riletta',replies:wr.replies,verify};
}
if(a.op==='logo_upload'){
  if(a.confirm!=='IMPORTA LOGO')throw Error('Conferma importazione logo richiesta');
  const status=checked(await session(t.host,t.port,['1011'],5000));if(status!=='101100')throw Error('Documento aperto o stato non riconosciuto: importazione bloccata');
  const type=String(a.logoType||'01');if(!/^(0[1-9]|10|11)$/.test(type))throw Error('Tipo logo non valido');
  if(typeof a.logoData!=='string'||!a.logoData.startsWith('data:image/bmp;base64,'))throw Error('Selezionare un file BMP');
  const buf=Buffer.from(a.logoData.slice(a.logoData.indexOf(',')+1),'base64');
  if(buf.length<54||buf.length>750000)throw Error('BMP non valido o troppo grande');
  if(buf.toString('ascii',0,2)!=='BM')throw Error('Il file non è un BMP valido');
  const width=buf.readInt32LE(18),height=Math.abs(buf.readInt32LE(22)),bpp=buf.readUInt16LE(28);
  if(width<1||width>608)throw Error('Larghezza logo non valida: massimo 608 pixel');
  if(bpp!==16)throw Error('Il manuale CUSTOM richiede BMP 16 bpp; file selezionato: '+bpp+' bpp');
  const chunks=[];for(let i=0;i<buf.length;i+=50){const c=buf.subarray(i,i+50);chunks.push('9101'+String(c.length).padStart(2,'0')+c.toString('hex').toUpperCase());}
  const cmds=['9100'+type+String(buf.length).padStart(6,'0'),...chunks,'9102'];
  const wr=await session(t.host,t.port,cmds,180000);if(!wr.ok)throw Error(wr.error);
  return {ok:true,info:'Logo BMP trasferito. Il manuale indica che il nuovo logo diventa effettivo dopo una chiusura fiscale.',compatibility:'Comandi 9100/9101/9102 documentati per macchine CUSTOM di 2ª e 4ª generazione.',width,height,bpp,size:buf.length,replies:wr.replies.slice(-4)};
}
if(a.op==='reset_batch'){
  if(a.confirm!=='ESEGUI AZZERAMENTI')throw Error('Conferma azzeramenti richiesta');
  const selected=Array.isArray(a.resets)?a.resets:[];if(!selected.length)throw Error('Selezionare almeno un azzeramento');
  const allowed={fiscal:'2002',departments:'2102',plu:'220209',vat:'220207',financial:'220202'};
  for(const k of selected)if(!allowed[k])throw Error('Azzeramento non previsto: '+k);
  const status=checked(await session(t.host,t.port,['1011'],5000));if(status!=='101100')throw Error('Documento aperto o stato non riconosciuto: azzeramenti bloccati');
  const results=[];
  for(const k of selected){const r=await session(t.host,t.port,[allowed[k]],60000);results.push({key:k,ok:!!r.ok,replies:r.replies||[],error:r.error||null});if(!r.ok)break;}
  return {ok:results.every(x=>x.ok),results,info:results.every(x=>x.ok)?'Azzeramenti selezionati completati':'Sequenza interrotta al primo errore'};
}
function dateRange(){function date(v){if(!/^20\d{2}-\d{2}-\d{2}$/.test(v))throw Error('Data non valida');const d=new Date(v+'T00:00:00Z');if(!Number.isFinite(+d)||d.toISOString().slice(0,10)!==v)throw Error('Data non valida');return v;}const from=date(a.date),to=date(a.dateTo);if(from>to)throw Error('Data inizio successiva alla fine');return {from,to};}
if(a.op==='journal'){
if(a.confirm!=='STAMPA GIORNALE')throw Error('Conferma mancante');
const {from,to}=dateRange();return customTool({...t,op:'journal_by_dates',date:from,dateTo:to});}
if(a.op==='fiscal_closures_dates'){
if(a.confirm!=='RISTAMPA CHIUSURE')throw Error('Conferma mancante');
const {from,to}=dateRange();return customTool({...t,op:'fiscal_closures_by_dates',date:from,dateTo:to});}
if(a.op==='x'||a.op==='z'){if(a.op==='z'&&a.confirm!=='CHIUSURA FISCALE')throw Error('Conferma mancante');return customReport({...t,type:a.op});}
if(a.op==='sync'){if(a.confirm!=='SINCRONIZZA ORA')throw Error('Conferma mancante');
const clock=checked(await session(t.host,t.port,['1001']));if(!/^1001\d{10}$/.test(clock))throw Error('Formato data/ora non riconosciuto');
const state=checked(await session(t.host,t.port,['1010']));if(!/^1010[01]{11}$/.test(state)||state[11]!=='1')throw Error('Chiusura fiscale non confermata dalla cassa: modifica bloccata');
const receipt=checked(await session(t.host,t.port,['1011']));if(receipt!=='101100')throw Error('Documento aperto o stato non riconosciuto');
if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.time))throw Error('Ora non valida');
const desired=clock.slice(4,10)+a.time.replace(':','');const reply=checked(await session(t.host,t.port,['2001'+desired]));
if(reply!=='20010')throw Error('La cassa richiede ulteriori conferme o risposta non riconosciuta. Nessun reinvio eseguito.');
const verify=checked(await session(t.host,t.port,['1001']));if(verify!=='1001'+desired)throw Error('Ora inviata, ma rilettura diversa: verificare sulla cassa');return {ok:true,info:'Ora verificata; data invariata',raw:verify};}
throw Error('Operazione non disponibile in questa beta');}
const server=http.createServer(async(req,res)=>{const origin='http://127.0.0.1:'+server.address().port;
res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
if(req.headers.host!==origin.slice(7)){res.writeHead(403);return res.end();}
if(req.method==='GET'&&['/v030.css','/ui-icons.js','/willy.css','/willy.js','/willy-expressions.png','/willy-approved.png'].includes(req.url)){res.setHeader('Content-Type',req.url.endsWith('.css')?'text/css':req.url.endsWith('.js')?'application/javascript':'image/png');return fs.createReadStream(path.join(__dirname,req.url.slice(1))).pipe(res);}
if(req.method==='GET'&&req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fs.readFileSync(path.join(__dirname,'index.html'),'utf8').replaceAll('__TOKEN__',token));}
if(req.method==='GET'&&req.url==='/scan-progress'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(getScanProgress()));}
if(req.method==='GET'&&['/easysistem-logo.jpg','/easysistem-logo.png','/whatsapp-logo.svg','/custom-logo.png','/programmazione-icon.png'].includes(req.url)){res.setHeader('Content-Type',req.url.endsWith('.svg')?'image/svg+xml':(req.url.endsWith('.png')?'image/png':'image/jpeg'));return fs.createReadStream(path.join(__dirname,req.url.slice(1))).pipe(res);}
if(req.method==='GET'&&req.url==='/rx-configurator.png'){res.setHeader('Content-Type','image/png');return fs.createReadStream(path.join(__dirname,'rx-configurator.png')).pipe(res);}
if(req.method==='GET'&&req.url==='/logo.png'){res.setHeader('Content-Type','image/png');return fs.createReadStream(path.join(__dirname,'logo.png')).pipe(res);}
if(req.method!=='POST'||!['/api','/cancel'].includes(req.url)||req.headers.origin!==origin||req.headers['x-easy-token']!==token){res.writeHead(403);return res.end();}
res.setHeader('Content-Type','application/json');if(req.url==='/cancel'){activeController?.abort();return res.end(JSON.stringify({ok:true}));}if(busy){res.writeHead(409);return res.end(JSON.stringify({error:'Operazione gia in corso'}));}
busy=true;let body='';try{for await(const c of req){body+=c;if(body.length>40000000)throw Error('Richiesta troppo lunga');}busy=true;const a=JSON.parse(body);activeController=new AbortController();const result=await operationContext.run(activeController.signal,()=>action(a));fs.appendFileSync(path.join(dir,'diagnostica.jsonl'),JSON.stringify({at:new Date().toISOString(),host:a.host,port:a.port,op:a.op,result:a.op.startsWith('willy_')?{ok:result.ok,state:result.state}:result})+'\n');res.end(JSON.stringify(result));}catch(e){res.writeHead(400);res.end(JSON.stringify({error:e.message}));}finally{busy=false;activeController=undefined;}});
server.listen(0,'127.0.0.1',()=>{const url='http://127.0.0.1:'+server.address().port;console.log('Easy RT Utility 0.1.33 - '+url);if(process.platform==='win32'&&!process.env.ERT_EMBEDDED)require('child_process').spawn('cmd.exe',['/c','start','',url]);});

server.isBusy=()=>busy;
module.exports=server;
