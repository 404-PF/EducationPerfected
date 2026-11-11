const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {setup}=require('./choice-renderer-fixture');
const {detectQuestion}=require('../lib/detect-question');
const {playChoiceRound}=require('../lib/choice-handler');
async function install(page,body,rendered,mutation){
 await page.evaluate(({body,rendered,mutation})=>{
  const f=mathFixture;
  for(let i=0;i<f.previews.length;i++){
   const text=i===3?body:'Synthetic answer '+i,template='[block\n'+text+'\n]';
   f.comp.Options[i].TextTemplate=template;f.metadata.Options[i].TextTemplate=template;f.previews[i].renderer.templateString=template;
   const output=document.createElement('div'),p=document.createElement('p'),span=document.createElement('span');span.textContent=i===3?rendered:text;p.append(span);output.append(p);f.previews[i].fields.renderGroup.replaceChildren(output);
  }
  const p=f.previews[3].fields.renderGroup.querySelector('p');
  if(mutation==='unknown')p.innerHTML='<b>'+rendered+'</b>';
  if(mutation==='flat')f.previews[3].fields.renderGroup.textContent=rendered;
  if(mutation==='extra')p.parentElement.append(document.createElement('p'));
  if(mutation==='drift')p.textContent='foreign';
  if(mutation==='editable')p.contentEditable='true';
  window.inlineSubmits=0;document.querySelector('#sa-navigation-controls button').addEventListener('click',event=>{event.stopImmediatePropagation();window.inlineSubmits++;f.q.questionIndex++;},true);
 },{body,rendered,mutation});
}
(async()=>{
 const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});const page=await browser.newPage();
  const run=async(body,rendered,mutation,accepted)=>{
   await setup(page,'http://127.0.0.1:'+server.address().port);await install(page,body,rendered,mutation);
   const d=await detectQuestion(page);
   if(accepted){assert.equal(d.kind,'choice',JSON.stringify(d));assert.equal((await playChoiceRound(page,d,{enter:true,timeout:600})).status,'advanced');assert.deepEqual(await page.evaluate(()=>[mathFixture.clicks.length,inlineSubmits]),[1,1]);}
   else{assert.equal(d.kind,'unsupported',JSON.stringify(d));assert.deepEqual(await page.evaluate(()=>[mathFixture.clicks.length,inlineSubmits]),[0,0]);}
  };
  await run('**Synthetic bold**','Synthetic bold','',true);
  await run('__Synthetic underline__','Synthetic underline','',true);
  await run('//Synthetic italic//','Synthetic italic','',true);
  await run('~~Synthetic strike~~','Synthetic strike','',true);
  await run('**Synthetic //mixed//**','Synthetic mixed','',true);
  await run('@@2@**Synthetic colored**@@','Synthetic colored','',true);
  await run('Synthetic plain','Synthetic plain','',true);
  await run('@@**2@Synthetic**@@','Synthetic','',false);
  await run('**open','open','',false);await run(String.raw`**closed\**`,'closed**','',false);
  await run('##highlight##','highlight','',false);
  await run('⁽script⁾','script','',false);
  await run('# Heading','Heading','',false);
  await run('**##highlight##**','highlight','',false);await run('**⁽script⁾**','script','',false);
  await run('**Synthetic bold**','Synthetic bold','unknown',false);
  await run('**Synthetic bold**','Synthetic bold','flat',false);
  await run('**Synthetic bold**','Synthetic bold','extra',false);
  await run('**Synthetic bold**','Synthetic bold','drift',false);
  await run('**Synthetic bold**','Synthetic bold','editable',false);
 }finally{try{if(browser)await browser.close();}finally{await new Promise(r=>server.close(r));}}
 console.log('Inline styles PASS: exact balanced bold/underline/italic/strike/mixed/color with1selection1Submit; malformed/escaped/highlight/script/unknown/flat/extra/drift/editable refuse0input. Source fixtures only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
