// Protocollo CUSTOM (manuale "Protocollo CUSTOM ITA 2.00") su TCP (es. K3 RT LAN porta 9100).
// Frame: <STX><CNT 2 cifre><IDENT '0'><COMANDO><CKS 2 cifre><ETX>
// Contatore: 00 al primo comando di ogni connessione (sempre accettato), poi +1.
// CKS = somma (valori ASCII) di CNT+IDENT+COMANDO modulo 100.
// La stampante risponde ACK/NACK, poi una frame con <ECHO COMANDO><DATI> oppure <ECHO>ERRxx.
const net = require('net');
const operationContext = new (require('async_hooks').AsyncLocalStorage)();

const STX = 0x02, ETX = 0x03, ACK = 0x06, NACK = 0x15;

function frame(cmd, counter) {
  const c = String(counter % 100).padStart(2, '0');
  const body = c + '0' + cmd;
  let sum = 0; for (const ch of Buffer.from(body, 'ascii')) sum += ch;
  return Buffer.concat([Buffer.from([STX]), Buffer.from(body + String(sum % 100).padStart(2, '0'), 'ascii'), Buffer.from([ETX])]);
}

// Solo ASCII < 0x7E (il manuale rifiuta caratteri oltre 128 e accetta fino a 0x7D nelle descrizioni)
const ascii = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7D]/g, ' ');
const imp = (euro) => String(Math.round(Math.abs(Number(euro || 0)) * 100)).padStart(9, '0').slice(-9);

/** Apre una connessione e invia in sequenza i comandi; ritorna le risposte (senza STX/CNT/IDENT/CKS/ETX). */
function session(host, port, cmds, timeout = 20000, opts = {}) {
  return new Promise(resolve => {
    const sock = net.createConnection({host, port});
    let index=0, buf=Buffer.alloc(0), done=false;
    const replies=[];
    const signal=operationContext.getStore();
    const cancel=()=>finish({ok:false,error:"Operazione interrotta. Se il comando era già inviato, verificarne l’esito sulla cassa prima di ripetere."});
    const finish=r=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(connectTimer);signal?.removeEventListener("abort",cancel);sock.destroy();resolve({...r,replies});};
    const timer=setTimeout(()=>finish({ok:false,error:'Timeout: esito non verificato. Nessun reinvio automatico.'}),timeout);
    const connectTimer=setTimeout(()=>finish({ok:false,error:"Connessione non riuscita: controlla IP e porta, poi riprova."}),3000);
    signal?.addEventListener("abort",cancel,{once:true});
    if(signal?.aborted){cancel();return;}
    const send=()=>{if(index===cmds.length)return finish({ok:true});sock.write(frame(cmds[index],index));};
    sock.on('connect',()=>{clearTimeout(connectTimer);send();});
    sock.on('data',chunk=>{
      buf=Buffer.concat([buf,chunk]);
      if(buf.length>65536)return finish({ok:false,error:'Risposta troppo lunga'});
      while(buf.length&&!done){
        if(buf[0]===ACK||buf[0]===NACK){const code=buf[0];buf=buf.subarray(1);sock.write(Buffer.from([ACK]));if(code===NACK)return finish({ok:false,error:'NACK: comando rifiutato'});continue;}
        if(buf[0]!==STX)return finish({ok:false,error:'Risposta non conforme al protocollo CUSTOM'});
        const end=buf.indexOf(ETX,1);if(end<0)return;
        const raw=buf.subarray(1,end);buf=buf.subarray(end+1);
        if(raw.length<9)return finish({ok:false,error:'Frame incompleto'});
        const body=raw.subarray(0,-2),sum=[...body].reduce((a,b)=>a+b,0)%100;
        if(raw.subarray(-2).toString()!==String(sum).padStart(2,'0'))return finish({ok:false,error:'Checksum risposta non valido'});
        const msg=body.subarray(3).toString('ascii');
        if(!msg.startsWith(cmds[index].slice(0,4)))return finish({ok:false,error:'Risposta a comando diverso'});
        sock.write(Buffer.from([ACK]));replies.push(msg);
        if(!opts.allowErr&&/^.{4}ERR/.test(msg))return finish({ok:false,error:msg});
        index++;send();
      }
    });
    sock.on('error',e=>finish({ok:false,error:e.message}));
    sock.on('close',()=>{if(!done)finish({ok:false,error:'Connessione chiusa prima della risposta'});});
  });
}

/** Scontrino: 3101 vendita per reparto, 3004 contanti / 3006 elettronico, 3011 chiusura, 3013 espulsione. */
function receiptPlan({lines=[],total,payment='cash'}) {
  const sale = lines
    .map((l) => ({ ...l, amount: Math.round(Number(l.price || 0) * Number(l.quantity || 1) * 100) / 100 }))
    .filter((l) => l.amount > 0);
  const sum = Math.round(sale.reduce((a, l) => a + l.amount, 0) * 100) / 100;
  // Mai aprire uno scontrino senza importi: il registratore emetterebbe un documento a zero
  if (!sale.length || !(sum > 0)) return { ok: false, error: 'Scontrino a zero: nessuna riga con importo, non inviato' };
  const cmds = sale.map((l) => {
    const rep = String(Math.min(20, Math.max(1, Number(l.department) || 1))).padStart(2, '0');
    const d = (ascii(l.description).trim() || 'VENDITA').slice(0, 22);
    // 3101: TIPO 1 + REP.MERC + LUNG.DE (lunghezza reale) + DESCR + IMP (centesimi)
    return '3101' + '1' + rep + String(d.length).padStart(2, '0') + d + imp(l.amount);
  });
  total = Number(total) > 0 ? Number(total) : sum;
  const electronic = ['card', 'pos', 'electronic', 'bancomat', 'credit'].includes(payment);
  const pd = electronic ? 'PAGAMENTO ELETTRONICO' : 'PAGAMENTO CONTANTE';
  cmds.push((electronic ? '3006' : '3004') + String(pd.length).padStart(2, '0') + pd + imp(electronic ? sum : Math.max(total, sum)));
  cmds.push('3011', '3013', '1004');
  return {ok:true,cmds,sum,sale};
}
async function customReceipt({host,port=9100,...input}) {
  const plan=receiptPlan(input);if(!plan.ok)return plan;const {cmds}=plan;
  const r = await session(host, port, cmds);
  if (!r.ok) return r;
  const tot = r.replies[r.replies.length - 1] || '';
  const nsf = /^1004(\d{4})/.exec(tot)?.[1];
  return { ok: true, fiscalNumber: nsf ? String(Number(nsf)).padStart(4, '0') : 'RT', replies:r.replies, raw: r.replies.join('|') };
}

/** 2003 lettura giornaliera (X, non fiscale) · 2002 chiusura giornaliera (Z, fiscale). */
async function customReport({ host, port = 9100, type = 'x' }) {
  const r = await session(host, port, [type === 'z' ? '2002' : '2003'], 60000);
  return r.ok ? { ok: true, raw: r.replies.join('|') } : r;
}

/**
 * Strumenti avanzati (manuale "Protocollo CUSTOM ITA 2.00"):
 *  4007 stampa copia ultimo scontrino (dal giornale elettronico)
 *  8002 stampa giornale elettronico per data e n° scontrino (GG MM AA Nsi Nsf TI)
 *  8001 stampa giornale elettronico da data a data (GGi MMi AAi GGf MMf AAf TI)
 *  5002 stampa chiusure giornaliere/fiscali per intervallo date (GGi MMi AAi GGf MMf AAf)
 *  3001 tipo 8 annullo transazione in corso + 3011 chiusura + 3013 espulsione
 *  1001 data/ora · 1013 modello/release · 1017 ultimo scontrino · 8008 % DGFE · 7001 avanzamento carta (z + 3)
 *  1008 matricola fiscale · 1009 stato carta/coperchio · 1015 ultimo codice d'errore >99 · 7008 apertura cassetto
 *  1271 abilita (0) / blocca (1) tastiera del registratore (solo 3ª generazione)
 */
const ddmmyy = (iso) => { const [y, m, d] = String(iso || '').split('-'); if (!y || !m || !d) throw new Error('Data non valida'); return d.padStart(2, '0') + m.padStart(2, '0') + y.slice(-2); };
const n4 = (v) => String(Math.max(0, Math.min(9999, Number(v) || 0))).padStart(4, '0');
async function customTool({ host, port = 9100, op, date, dateTo, from, to, drawer, lines, practice, payment }) {
  let cmds;
  try {
    switch (op) {
      case 'reprint_last': cmds = ['4007']; break;
      case 'journal_by_number': cmds = ['8002' + ddmmyy(date) + n4(from) + n4(to ?? from) + '0']; break;
      case 'journal_by_dates': cmds = ['8001' + ddmmyy(date) + ddmmyy(dateTo || date) + '0']; break;
      case 'fiscal_closures_by_dates': cmds = ['5002' + ddmmyy(date) + ddmmyy(dateTo || date)]; break;
      case 'void_open': { const d = 'ANNULLO SCONTRINO'; cmds = ['3001' + '8' + String(d.length).padStart(2, '0') + d + '000000000', '3011', '3013']; break; }
      // Nota di credito / reso (manuale: 7102 DOC=6 XXXXX=00000, vendite 3101, 3004/3006 pagamento,
      // 3010 PITCH=P LUN=16 codice pratica di reso, 3011 chiusura, 3013 espulsione)
      case 'credit_note': {
        const sale = (lines || []).map((l) => ({ ...l, amount: Math.round(Number(l.price || 0) * Number(l.quantity || 1) * 100) / 100 })).filter((l) => l.amount > 0);
        if (!sale.length) return { ok: false, error: 'Nessuna riga da rendere' };
        const code = ascii(practice).replace(/\s/g, '').toUpperCase().slice(0, 16).padEnd(16, '0');
        const sum = sale.reduce((a, l) => a + l.amount, 0);
        const electronic = ['card', 'pos', 'electronic'].includes(payment);
        const pd = electronic ? 'RIMBORSO ELETTRONICO' : 'RIMBORSO CONTANTE';
        cmds = ['7102600000', ...sale.map((l) => {
          const rep = String(Math.min(20, Math.max(1, Number(l.department) || 1))).padStart(2, '0');
          const d = (ascii(l.description).trim() || 'RESO').slice(0, 22);
          return '3101' + '1' + rep + String(d.length).padStart(2, '0') + d + imp(l.amount);
        }), (electronic ? '3006' : '3004') + String(pd.length).padStart(2, '0') + pd + imp(sum), '3010P16' + code, '3011', '3013'];
        break;
      }
      case 'keyboard_on': cmds = ['12710']; break;
      case 'keyboard_off': cmds = ['12711']; break;
      case 'read_serial': cmds = ['1008']; break;
      case 'printer_status': cmds = ['1009']; break;
      case 'last_error': cmds = ['1015']; break;
      case 'read_datetime': cmds = ['1001']; break;
      case 'read_model': cmds = ['1013']; break;
      case 'last_receipt': cmds = ['1017']; break;
      case 'dgfe_space': cmds = ['8008']; break;
      case 'paper_feed': cmds = ['7001z3']; break;
      case 'open_drawer': cmds = ['7008' + (String(drawer) === '2' ? '2' : '1')]; break;
      default: return { ok: false, error: 'Operazione non prevista dal protocollo Custom' };
    }
  } catch (e) { return { ok: false, error: e.message }; }
  const r = await session(host, port, cmds, 60000, { allowErr: op === 'last_error' });
  if (!r.ok) return r;
  const last = r.replies[r.replies.length - 1] || '';
  let info;
  if (op === 'read_serial') { info = last.startsWith('1008') ? last.slice(4).trim() : `Risposta non riconosciuta: ${last}`; }
  if (op === 'printer_status') {
    const c = /^1009(\d{2})/.exec(last)?.[1];
    info = ({ '00': 'Coperchio chiuso, carta presente', '10': 'Coperchio APERTO, carta presente', '01': 'Coperchio chiuso, carta MANCANTE', '11': 'Coperchio APERTO, carta MANCANTE' })[c] || `Risposta: ${last}`;
  }
  if (op === 'last_error') { const m = /^1015ERR(\d{3})(.*)$/.exec(last); info = m ? `Ultimo errore ${m[1]}${m[2].trim() ? ' - ' + m[2].trim() : ''}` : `Risposta: ${last}`; }
  if (op === 'open_drawer') info = 'Cassetto aperto';
  if (op === 'read_datetime') { const m = /^1001(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(last); info = m ? `Data e ora registratore: ${m[1]}/${m[2]}/20${m[3]} ${m[4]}:${m[5]}` : `Risposta: ${last}`; }
  if (op === 'read_model') { const m = /^1013(.*)$/.exec(last); info = m ? `Modello e release: ${m[1].trim()}` : `Risposta: ${last}`; }
  if (op === 'last_receipt') { const m = /^101[78](\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{4})(\d{9})/.exec(last); info = m ? `Ultimo scontrino n. ${Number(m[6])} del ${m[1]}/${m[2]}/20${m[3]} ${m[4]}:${m[5]} - totale ${(Number(m[7]) / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : `Risposta: ${last}`; }
  if (op === 'dgfe_space') { const m = /^8008(.{5})/.exec(last); info = m ? `Giornale elettronico occupato: ${m[1].trim()}%` : `Risposta: ${last}`; }
  if (op === 'paper_feed') info = 'Carta avanzata di 3 righe';
  return { ok: true, info, replies:r.replies, raw: r.replies.join('|') };
}

module.exports = { customReceipt, customReport, customTool, frame, session };

module.exports.operationContext=operationContext;

module.exports.receiptPlan=receiptPlan;

async function acquireReceipt({host,port=9100,number}) {
  if(!Number.isInteger(number)||number<1||number>9999)throw Error('Numero scontrino non disponibile o non valido');
  const n=String(number).padStart(4,'0');
  const range=await session(host,port,['8006'+'0000'+n+n],5000);
  if(!range.ok)throw Error(range.error);
  const match=/^8006(\d{9})(\d{9})(\d{9})(\d{9})$/.exec(range.replies[0]||'');
  if(!match)throw Error('Dati giornale non riconosciuti');
  const [start,end,current,total]=match.slice(1).map(Number);
  if(start<1||end<=start||end>current||current>total+1||end-start>500)throw Error('Intervallo righe non valido o troppo esteso');
  const rows=[],replies=[...range.replies],deadline=Date.now()+20000;
  for(let line=start;line<end;line++){
    if(Date.now()>deadline)throw Error('Tempo acquisizione superato: riprovare solo la lettura');
    const result=await session(host,port,['8004'+String(line).padStart(9,'0')],3000);
    if(!result.ok)throw Error(result.error);
    const raw=result.replies[0]||'';if(!raw.startsWith('8004')||raw.length<36)throw Error('Riga giornale non riconosciuta');
    replies.push(raw);rows.push(raw.slice(4).trimEnd());
  }
  return {number,rows,text:rows.join('\n'),replies,source:'DGFE macchina',acquiredAt:new Date().toISOString()};
}
module.exports.acquireReceipt=acquireReceipt;
