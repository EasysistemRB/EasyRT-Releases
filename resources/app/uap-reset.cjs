// UAP: Manuale CUSTOM ITA 2.00, pp.209–216,246,265.
// Separato dal protocollo CUSTOM. Nessun reinvio automatico.
const net=require('node:net');
function crc16(bytes){let crc=0xffff;for(const b of bytes){crc=((crc>>>8)|(crc<<8))&0xffff;crc^=b;crc^=(crc&255)>>>4;crc^=(crc<<12);crc^=((crc&255)<<5);crc&=0xffff;}return (~crc)&0xffff;}
function packet(type,seq,message){const out=Buffer.alloc(message.length+7);out[0]=1;out[1]=type;out[2]=seq;out.writeUInt16BE(message.length,3);message.copy(out,5);out.writeUInt16BE(crc16(out.subarray(3,-2)),out.length-2);return out;}
async function experimentalReset({host,port,signal}){
 const socket=new net.Socket();let pending,buffer=Buffer.alloc(0),sent=0;const responses=[];
 const fail=error=>{if(pending){const p=pending;pending=null;clearTimeout(p.timer);p.reject(error);}};
 socket.on('error',fail);socket.on('close',()=>fail(Error('Connessione UAP interrotta')));
 socket.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);if(buffer.length>4096)return fail(Error('Risposta UAP troppo lunga'));while(buffer.length>=5){if(buffer[0]!==1)return fail(Error('Protocollo UAP non riconosciuto: nessun reinvio'));const len=buffer.readUInt16BE(3);if(len>2048)return fail(Error('Lunghezza UAP non valida'));if(buffer.length<len+7)return;const frame=buffer.subarray(0,len+7);buffer=buffer.subarray(len+7);if(!pending)return socket.destroy();const p=pending;pending=null;clearTimeout(p.timer);if(frame[1]!==0x61||frame[2]!==p.seq||crc16(frame.subarray(3,-2))!==frame.readUInt16BE(frame.length-2))return p.reject(Error('Risposta UAP: tipo, sequenza o CRC non valido'));const msg=frame.subarray(5,-2);if(msg.length<8||msg[0]!==p.job||msg[1]!==p.op)return p.reject(Error('Risposta UAP non corrispondente al comando'));responses.push({opcode:'0x'+p.op.toString(16),hex:frame.toString('hex'),fatalError:msg[msg.length-6],replyCode:msg[msg.length-1]});p.resolve(msg);}});
 const abort=()=>{fail(Error('Operazione interrotta'));socket.destroy();};signal?.addEventListener('abort',abort,{once:true});
 const exchange=(seq,job,op)=>new Promise((resolve,reject)=>{if(signal?.aborted)return reject(Error('Operazione interrotta'));if(socket.destroyed)return reject(Error('Connessione UAP chiusa'));pending={seq,job,op,resolve,reject,timer:setTimeout(()=>{fail(Error('Timeout UAP'));socket.destroy();},3000)};if(op===0x57)sent++;socket.write(packet(0x41,seq,Buffer.from([0x31,job,op])));});
 function ready(msg){if(msg[msg.length-6]!==0x80||msg[msg.length-1]!==0x80)throw Error('UAP non pronto: FE/RC '+msg[msg.length-6].toString(16)+'/'+msg[msg.length-1].toString(16));}
 try{
  await new Promise((resolve,reject)=>{if(signal?.aborted)return reject(Error('Operazione interrotta'));const timer=setTimeout(()=>{socket.destroy();reject(Error('Connessione UAP scaduta'));},3000);socket.once('error',error=>{clearTimeout(timer);reject(error);});socket.connect(port,host,()=>{clearTimeout(timer);resolve();});});
  const status=await exchange(0,0xff,0x3f);ready(status);const fields=status.subarray(2,-6).toString('ascii').split('\x1f');if(!/^\d{8}$/.test(fields[0])||!/^\d{6}$/.test(fields[1])||! /^[0-9A-Fa-f]{1,4}$/.test(fields[2]||''))throw Error('Stato fiscale UAP non interpretabile: ripristino bloccato');if(parseInt(fields[2],16)&6)throw Error('Documento aperto: ripristino bloccato');
  ready(await exchange(1,0x30,0x57));ready(await exchange(2,0x31,0x57));
  return {ok:true,experimental:true,resetSent:sent,responses,info:'Due SOFT_RESET accettati. Riavvio fisico non confermato: eseguire Leggi macchina.'};
 }catch(error){return {ok:false,experimental:true,resetSent:sent,responses,error:(sent?'SOFT_RESET inviato '+sent+' volte; esito non confermato. Controllare la macchina prima di riprovare. ':'Nessun SOFT_RESET inviato. ')+error.message};}
 finally{signal?.removeEventListener('abort',abort);socket.destroy();}
}
module.exports={crc16,packet,experimentalReset};
