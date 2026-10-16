const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const repo='EasysistemRB/EasyRT-Releases',current=require('./package.json').version;
let pending=null,inflight=null,installedHook=false;
function version(v){const m=/^v?(\d+)\.(\d+)\.(\d+)$/.exec(v);return m?m.slice(1).map(Number):null;}
function newer(v){const b=version(v),a=version(current);if(!b)return false;for(let i=0;i<3;i++){if(b[i]!==a[i])return b[i]>a[i];}return false;}
function digestFor(list,name){const line=list.split('\n').map(x=>x.trim().split(/\s+/)).find(x=>x.length===2&&x[1].replace(/^\*/,'')===name);if(!line||!/^[a-f0-9]{64}$/i.test(line[0]))throw Error('Checksum assente o non valido');return line[0].toLowerCase();}
function official(url){try{const u=new URL(url);return u.origin==='https://github.com'&&u.pathname.startsWith('/'+repo+'/releases/download/')&&!u.username&&!u.password;}catch{return false;}}
async function check(){const r=await fetch('https://api.github.com/repos/'+repo+'/releases/latest',{headers:{'User-Agent':'EasyRT/'+current},signal:AbortSignal.timeout(10000)});if(r.status===404)return {available:false,current};if(!r.ok)throw Error('GitHub non raggiungibile');const release=await r.json();return {available:!release.prerelease&&!release.draft&&newer(release.tag_name),current,latest:release.tag_name,release};}
async function download(url){if(!official(url))throw Error('Download non ufficiale');const r=await fetch(url,{signal:AbortSignal.timeout(300000)});if(!r.ok)throw Error('Download non riuscito');const limit=450*1024*1024;if(Number(r.headers.get('content-length'))>limit)throw Error('Pacchetto troppo grande');const chunks=[];let length=0;for await(const chunk of r.body){length+=chunk.length;if(length>limit)throw Error('Dimensione download non consentita');chunks.push(Buffer.from(chunk));}return Buffer.concat(chunks);}
async function prepare(){
 const {app}=require('electron');const result=await check();if(!result.available||process.platform!=='win32')return result;
 const v=result.latest.replace(/^v/,''),light='EasyRT_Setup_Leggero_'+v+'.exe',full='EasyRT_Unico_'+v+'.exe';
 const asset=result.release.assets.find(a=>a.name===light)||result.release.assets.find(a=>a.name===full),checks=result.release.assets.find(a=>a.name==='SHA256SUMS.txt');if(!asset||!checks)throw Error('Release senza setup o checksum');
 const digest=digestFor((await download(checks.browser_download_url)).toString('utf8'),asset.name);
 const bytes=await download(asset.browser_download_url);if(crypto.createHash('sha256').update(bytes).digest('hex')!==digest)throw Error('Checksum pacchetto non valido');
 const directory=path.join(app.getPath('temp'),'EasyRT-Updates');fs.mkdirSync(directory,{recursive:true});const target=path.join(directory,asset.name);fs.writeFileSync(target,bytes);pending={target,digest,version:v};
 if(!installedHook){installedHook=true;app.once('before-quit',()=>{if(!pending)return;try{if(crypto.createHash('sha256').update(fs.readFileSync(pending.target)).digest('hex')!==pending.digest)return;const child=cp.spawn(pending.target,['--update'],{detached:true,stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();}catch{}});}
 return {...result,downloaded:true,appliesOnClose:true};
}
async function offer(){if(pending)return {available:true,downloaded:true,latest:pending.version,current,appliesOnClose:true};if(inflight)return inflight;inflight=prepare().catch(e=>({available:false,current,error:e.message})).finally(()=>inflight=null);return inflight;}
module.exports={check,offer,newer,digestFor,official};
