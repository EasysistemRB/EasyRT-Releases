const {session,operationContext}=require('./custom-proto.cjs');
const {execFile}=require('child_process');
const net=require('net');
const os=require('os');
const dns=require('dns').promises;
function privateIP(host){return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)&&/^\d{1,3}(\.\d{1,3}){3}$/.test(host)&&host.split('.').every(x=>+x<=255);}
function ipToInt(ip){return ip.split('.').reduce((n,x)=>((n<<8)>>>0)+Number(x),0)>>>0;}
function intToIp(n){return [24,16,8,0].map(s=>(n>>>s)&255).join('.');}
function prefixFromMask(mask){return mask.split('.').reduce((n,x)=>n+Number(x).toString(2).split('1').length-1,0);}
function activeRanges(){
 const found=[];
 for(const [name,items] of Object.entries(os.networkInterfaces()))for(const a of items||[]){
  const family=typeof a.family==='string'?a.family:(a.family===4?'IPv4':'');
  if(family!=='IPv4'||a.internal||!privateIP(a.address))continue;
  const mask=a.netmask||'255.255.255.0', ip=ipToInt(a.address), mi=ipToInt(mask), network=(ip&mi)>>>0, broadcast=(network|(~mi>>>0))>>>0;
  let first=(network+1)>>>0,last=(broadcast-1)>>>0,count=last>=first?last-first+1:0;
  // Evita scansioni enormi su VPN/reti aziendali: usa il /24 dinamico contenente l'IP locale.
  let limited=false;
  if(count>1022){const local24=ip&0xFFFFFF00;first=(local24+1)>>>0;last=(local24+254)>>>0;count=254;limited=true;}
  const addresses=[];for(let n=first;n<=last;n++){const h=intToIp(n);if(h!==a.address)addresses.push(h);}
  found.push({name,address:a.address,netmask:mask,prefix:limited?24:prefixFromMask(mask),addresses,limited});
 }
 // deduplica interfacce/range sovrapposti
 const uniq=[];const seen=new Set();for(const r of found){const key=r.address+'/'+r.prefix;if(!seen.has(key)){seen.add(key);uniq.push(r);}}
 return uniq;
}
async function macTable(){if(process.platform!=='win32')return new Map();return new Promise(resolve=>execFile('arp.exe',['-a'],{windowsHide:true,timeout:1800,maxBuffer:512*1024},(error,stdout)=>{const map=new Map();if(!error)for(const line of stdout.split('\n')){const m=/^\s*(\d{1,3}(?:\.\d{1,3}){3})\s+([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\s/i.exec(line);if(m&&!/^(00-00-00-00-00-00|ff-ff-ff-ff-ff-ff)$/i.test(m[2]))map.set(m[1],m[2].replaceAll('-',':').toUpperCase());}resolve(map);}));}
function ping(ip,timeout=240){if(process.platform!=='win32')return Promise.resolve(false);return new Promise(resolve=>execFile('ping.exe',['-n','1','-w',String(timeout),ip],{windowsHide:true,timeout:timeout+450,maxBuffer:64*1024},err=>resolve(!err)));}
function tcpOpen(ip,port,timeout=180){return new Promise(resolve=>{const s=new net.Socket();let done=false;const finish=v=>{if(done)return;done=true;s.destroy();resolve(v)};s.setTimeout(timeout);s.once('connect',()=>finish(true));s.once('timeout',()=>finish(false));s.once('error',()=>finish(false));s.connect(port,ip);});}
async function hostname(ip){try{const names=await Promise.race([dns.reverse(ip),new Promise((_,rej)=>setTimeout(()=>rej(Error('timeout')),280))]);return names?.[0]||null;}catch{return null;}}
let progress={active:false,phase:'idle',startedAt:null,finishedAt:null,current:[],recent:[],checked:0,total:0,found:[],devices:[],range:null,message:'Pronto alla ricerca'};
function publish(patch){progress={...progress,...patch};}
function getScanProgress(){const elapsedMs=progress.startedAt?(Date.now()-Date.parse(progress.startedAt)):0;return {...progress,elapsedMs,current:[...progress.current],recent:[...progress.recent],found:[...(progress.found||[])],devices:[...(progress.devices||[])]};}
function pushRecent(ip,status){const recent=[{ip,status,at:Date.now()},...progress.recent.filter(x=>x.ip!==ip)].slice(0,22);publish({recent});}
async function scanNetwork({port=9100,probe=session}){
 port=Number(port);if(!Number.isInteger(port)||port<1||port>65535)throw Error('Porta TCP non valida');
 const ranges=activeRanges();if(!ranges.length)throw Error('Nessuna interfaccia IPv4 privata attiva rilevata. Collegare il PC alla rete locale e riprovare.');
 const addresses=[];for(const r of ranges)for(const ip of r.addresses)if(!addresses.includes(ip))addresses.push(ip);
 const rangeLabel=ranges.map(r=>`${r.name}: ${r.address}/${r.prefix}${r.limited?' (segmento locale)':''}`).join(' · ');
 const signal=operationContext.getStore();let cursor=0,checked=0;const custom=[],devices=[];const startedAt=new Date().toISOString();
 publish({active:true,phase:'starting',startedAt,finishedAt:null,current:[],recent:[],checked:0,total:addresses.length,found:[],devices:[],range:rangeLabel,message:'Rete rilevata automaticamente'});
 const workers=Math.min(32,addresses.length);const commonPorts=[80,443,445,22,3389,515,631,554,9100].filter((v,i,a)=>a.indexOf(v)===i);
 await Promise.all(Array.from({length:workers},async()=>{while(cursor<addresses.length&&!signal?.aborted){const ip=addresses[cursor++];publish({phase:'scanning',message:'Scansione dispositivi in rete…',current:[ip,...progress.current.filter(x=>x!==ip)].slice(0,workers)});let isCustom=false,serial=null,model=null;try{const r=await probe(ip,port,['1008'],260);if(r?.ok&&r.replies?.[0]?.startsWith('1008')){isCustom=true;serial=r.replies[0].slice(4).trim();try{const m=await probe(ip,port,['1013'],340);if(m?.ok&&m.replies?.[0]?.startsWith('1013'))model=m.replies[0].slice(4).trim();}catch{}}}catch{}let online=isCustom;const openPorts=[];if(!online)online=await ping(ip,180);if(!online){for(const cp of commonPorts){if(await tcpOpen(ip,cp,120)){online=true;openPorts.push(cp);break;}}}if(online){for(const cp of commonPorts){if(openPorts.length>=4)break;if(!openPorts.includes(cp)&&await tcpOpen(ip,cp,80))openPorts.push(cp);}if(!openPorts.includes(port)&&await tcpOpen(ip,port,100))openPorts.push(port);const device={host:ip,port:isCustom?port:(openPorts[0]||port),online:true,custom:isCustom,brand:isCustom?'CUSTOM':'Rete',serial:serial||null,model:model||null,hostname:null,mac:null,openPorts};devices.push(device);if(isCustom)custom.push(device);pushRecent(ip,isCustom?'CUSTOM RT rilevato':'dispositivo attivo');publish({devices:[...devices],found:[...custom]});}else pushRecent(ip,'nessuna risposta');checked++;publish({checked,current:progress.current.filter(x=>x!==ip)});}}));
 const macs=await macTable();for(const d of devices){d.mac=macs.get(d.host)||null;if(devices.length<=80)d.hostname=await hostname(d.host);}devices.sort((a,b)=>(b.custom-a.custom)||a.host.localeCompare(b.host,undefined,{numeric:true}));const cancelled=!!signal?.aborted,finishedAt=new Date().toISOString();publish({active:false,phase:cancelled?'cancelled':'complete',finishedAt,current:[],checked,found:[...custom],devices:[...devices],range:rangeLabel,message:cancelled?'Ricerca interrotta':'Scansione completata: '+devices.length+' dispositivi, '+custom.length+' CUSTOM'});return {found:custom,devices,checked,range:rangeLabel,ranges:ranges.map(r=>({name:r.name,address:r.address,prefix:r.prefix,limited:r.limited})),cancelled,complete:!cancelled};
}
module.exports={scanNetwork,getScanProgress,activeRanges};
