const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function settingsFile(){return path.join(process.env.ERT_DATA_DIR||path.join(os.homedir(),'.easyrt'),'willy-connection.json');}
function validateURL(value){const u=new URL(value);if(u.username||u.password||u.search||u.hash)throw Error('Usa solo l’indirizzo del server senza credenziali nella URL');if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('Per un server remoto Willy serve HTTPS');return u;}
function settings(){try{return JSON.parse(fs.readFileSync(settingsFile(),'utf8'));}catch{return {};}}
async function willy(a){
 const cfg=settings();
 if(a.op==='willy_connection'){return {ok:true,url:cfg.url||process.env.WILLY_SERVER_URL||'http://127.0.0.1:8765',key_saved:!!cfg.token};}
 if(a.op==='willy_configure'){
  const url=validateURL(a.url).href;const token=String(a.token||cfg.token||'').trim();if(!token)throw Error('Inserisci la chiave tecnico del server');
  const file=settingsFile();fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({url,token}),{mode:0o600});return {ok:true,info:'Collegamento Willy salvato su questo PC'};
 }
 const base=validateURL(cfg.url||process.env.WILLY_SERVER_URL||'http://127.0.0.1:8765');
 let token=cfg.token||process.env.WILLY_ACCESS_TOKEN;
 if(a.op==='willy_upload'){token=String(a.adminToken||'').trim();if(!token)throw Error('Inserisci la chiave amministratore per caricare manuali');}
 if(!token){try{token=fs.readFileSync(path.join(process.env.WILLY_DATA||(process.platform==='darwin'?path.join(os.homedir(),'Library','Application Support','EasySistem','WillyData'):path.join(os.homedir(),'WillyData')),'access.key'),'utf8').trim();}catch{throw Error('Configura indirizzo e chiave tecnico del server Willy');}}
 const route={willy_ask:'/ask',willy_manuals:'/manuals',willy_upload:'/manuals',willy_status:'/status'}[a.op];if(!route)throw Error('Operazione Willy sconosciuta');
 const method=['willy_manuals','willy_status'].includes(a.op)?'GET':'POST';
 const body=a.op==='willy_ask'?{question:a.question,model:a.model,firmware:a.firmware}:{pdf:a.pdf,title:a.title,version:a.version,model:a.model,firmware:a.firmware};
 const response=await fetch(new URL(route,base),{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:method==='GET'?undefined:JSON.stringify(body),signal:AbortSignal.timeout(130000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Servizio Willy non disponibile');return {ok:true,...result};
}
module.exports={willy,validateURL};
