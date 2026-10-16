const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('connessione e macchine memorizzate sopravvivono al riavvio con una nuova porta locale',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'EasyRT-config-test-'));process.env.ERT_DATA_DIR=dir;process.env.ERT_EMBEDDED='1';let server;
 async function open(){delete require.cache[require.resolve('./server.cjs')];server=require('./server.cjs');await new Promise(r=>server.listening?r():server.once('listening',r));const origin='http://127.0.0.1:'+server.address().port;const html=await (await fetch(origin)).text();const token=html.match(/name="willy-token" content="([a-f0-9]+)"/)[1];return async body=>{const r=await fetch(origin+'/api',{method:'POST',headers:{Origin:origin,'X-Easy-Token':token,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};}
 try{
  let api=await open();const firstPort=server.address().port;
  assert.equal((await api({op:'config_save',host:'192.168.1.138',port:9100,webport:80})).status,200);
  assert.equal((await api({op:'registry_save',devices:[{host:'192.168.1.138',port:9100,model:'CUSTOM RT',serial:'TEST'}]})).status,200);
  assert.equal((await api({op:'config_save',host:'999.1.1.1',port:9100,webport:80})).status,400);
  await new Promise(r=>server.close(r));api=await open();assert.notEqual(server.address().port,firstPort);
  const result=(await api({op:'config_read'})).data;assert.equal(result.connection.host,'192.168.1.138');assert.equal(result.connection.port,9100);assert.equal(result.devices[0].serial,'TEST');
 }finally{if(server?.listening)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
