const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
process.env.ERT_EMBEDDED='1';
process.env.ERT_DATA_DIR=fs.mkdtempSync(require('node:os').tmpdir()+'/EasyRT-QA-');
const server=require('../resources/app/server.cjs');
async function main(){
 await new Promise(r=>server.listening?r():server.once('listening',r));
 const url='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true});
 const output=path.resolve(__dirname,'../qa');fs.mkdirSync(output,{recursive:true});
 try{
  for(const [width,height]of [[1344,668],[1024,640],[800,560],[390,760]]){
   const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const badAssets=[];page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/api'))badAssets.push(r.url());});
   await page.goto(url);await page.locator('nav button').last().waitFor();
   assert.equal(await page.locator('nav button').count(),7);if(width===1344)assert.equal(await page.locator('#host').inputValue(),'');
   assert.equal(await page.locator('#stop').isVisible(),false);
   for(let i=0;i<7;i++){
    await page.locator('#tab-'+i).click();assert(await page.locator('#panel-'+i).isVisible());assert.equal(await page.locator('main>section:visible').count(),1);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert(!overflow,`overflow pagina ${i} a ${width}`);
    await page.screenshot({path:path.join(output,`${width}-${i}.png`),fullPage:true});
   }
   await page.locator('#tab-0').click();await page.locator('#host').fill('192.168.1.138');await page.locator('#save').click();await page.waitForFunction(()=>document.getElementById('state').textContent.includes('Configurazione salvata sul PC'));await page.reload();await page.waitForFunction(()=>document.getElementById('host').value==='192.168.1.138');assert.equal(await page.locator('#host').inputValue(),'192.168.1.138');
   await page.locator('#scanopen').click();assert(await page.locator('#networkdialog').isVisible());await page.locator('#scanclose').click();
   await page.locator('#tab-1').click();await page.locator('#amount').fill('1.25');assert.deepEqual(errors,[]);const previewResponse=page.waitForResponse(r=>r.url().endsWith('/api')&&r.request().postDataJSON()?.op==='receipt_preview');await page.locator('#simulate').click();const preview=await previewResponse;const previewData=await preview.json();assert.equal(preview.status(),200,JSON.stringify(previewData));assert.equal(previewData.simulation,true,JSON.stringify(previewData));await page.waitForFunction(()=>!document.getElementById('simulate').disabled);assert(await page.locator('#receiptpreview').isVisible(),(await page.locator('#state').textContent())+' '+JSON.stringify(errors));
   assert.match(await page.locator('#receiptresult').textContent(),/Simulazione/);
   assert.deepEqual(errors,[]);assert.deepEqual(badAssets,[]);await page.close();
  }
  console.log('28 viste, navigazione, salvataggio, dialogo scansione e simulazione: OK');
 }finally{await browser.close();await new Promise(r=>server.close(r));fs.rmSync(process.env.ERT_DATA_DIR,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
