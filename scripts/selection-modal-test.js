const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {detectQuestion}=require('../lib/detect-question');
const {captureSelectionBaseline,resolveSelectionModal}=require('../lib/selection-modal');
const {bootFixtureCli}=require('./fixture-cli-session');
function installModal(mutation){
    const f=dropdownFixture,self=f.self,old=self.sectionData;
    old.id=10;
    const next={id:11,activityGroup:{isAutoMarked:true}};
    const modal=document.createElement('div');modal.setAttribute('uib-modal-window','modal-window');
    modal.className='modal section-complete-dialog';
    modal.innerHTML='<div id="modal-section-complete-wrapper"><div id="modal-section-complete"><button id="next-button">PRIVATE QUESTION ANSWER NAME</button></div></div>';
    const backdrop=document.createElement('div');backdrop.setAttribute('uib-modal-backdrop','modal-backdrop');backdrop.textContent='PRIVATE CONTENT';
    document.body.append(modal,backdrop);
    const dialog={model:self.model,currentSection:old,nextSection:next,activityComplete:false};
    const original=window.angular.element;
    window.angular.element=el=>el===modal?{scope:()=>({self:dialog})}:original(el);
    f.modal=modal;f.backdrop=backdrop;f.next=next;f.dialog=dialog;f.extraInputs=0;
    modal.addEventListener('click',()=>f.extraInputs++);
    modal.addEventListener('keydown',()=>f.extraInputs++);
    if(mutation==='unknown')modal.className='modal';
    if(mutation==='lookalike')dialog.model={...self.model};
    if(mutation==='wrong-section')dialog.currentSection={...old};
    if(mutation==='complete')dialog.activityComplete=true;
    if(mutation==='no-next')dialog.nextSection=null;
    if(mutation==='accessor')Object.defineProperty(dialog,'nextSection',{get(){f.getterCalls=(f.getterCalls||0)+1;throw new Error('not allowed');}});
    if(mutation==='ambiguous')document.body.append(modal.cloneNode(true));
    if(mutation==='hidden')modal.hidden=true;
    f.finish=()=>{
        modal.remove();if(mutation!=='backdrop')backdrop.remove();
        if(mutation!=='same-section')self.sectionData=mutation==='different-section'?{...next}:next;
        if(mutation!=='same-key')f.q.questionIndex++;
        if(mutation==='assessment')self.model.gameMode=2;
        if(mutation==='new-model')self.model={...self.model};
        if(mutation==='new-modal'){
            const unknown=document.createElement('div');unknown.setAttribute('uib-modal-window','modal-window');document.body.append(unknown);
        }
    };
    if(!['unknown','lookalike','wrong-section','complete','no-next','accessor','ambiguous','stay','hidden'].includes(mutation))f.timer=setTimeout(f.finish,80);
}
async function browserCases(){
    const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
    try{
        browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});
        const page=await browser.newPage();
        const run=async(mutation,guard)=>{
            await page.goto('http://127.0.0.1:'+server.address().port+'/lesson-dropdown?count=2');
            const descriptor=await detectQuestion(page),baseline=await captureSelectionBaseline(page,descriptor);
            try{
                await page.evaluate(installModal,mutation);
                const result=await resolveSelectionModal(page,descriptor,baseline,{timeout:250});
                assert.equal(result.status,guard?'modal':'advanced',mutation+JSON.stringify(result));
                assert.equal(result.diagnostic.guard,guard||'next-section-verified',mutation);
                assert.doesNotMatch(JSON.stringify(result),/PRIVATE|contentID|questionIndex|11|10/);
                assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts,dropdownFixture.extraInputs,dropdownFixture.getterCalls||0]),[0,0,0,0,0]);
            }finally{await baseline.dispose();}
        };
        await run('advance');
        await run('unknown','unknown-modal');await run('lookalike','unknown-modal');await run('wrong-section','unknown-modal');
        await run('complete','unknown-modal');await run('no-next','unknown-modal');await run('accessor','unknown-modal');
        await run('ambiguous','unknown-modal');await run('stay','section-transition-timeout');await run('hidden','section-transition-timeout');
        await run('same-section','section-transition-timeout');await run('same-key','section-transition-timeout');
        await run('different-section','section-transition-timeout');await run('assessment','assessment-mode');
        await run('new-model','practice-model-changed');await run('new-modal','unknown-modal');await run('backdrop','section-transition-timeout');
        await page.goto('http://127.0.0.1:'+server.address().port+'/lesson-dropdown?count=2');
        const d=await detectQuestion(page),base=await captureSelectionBaseline(page,d);
        try{
            await page.evaluate(installModal,'advance');
            assert.equal((await resolveSelectionModal(page,d,base,{shouldStop:()=>true})).status,'aborted');
        }finally{await base.dispose();}
    }finally{if(browser){await browser.close();}await new Promise(r=>server.close(r));}
}
async function cliCase(mutation){
    const session=await bootFixtureCli('cli.js','Commands: start');
    try{
        await session.page.goto(session.origin+'/lesson-dropdown?count=2');
        // Keep the native popup emulation used by the normal CLI tests.
        await require('./dropdown-popup-test-helpers').installPopupEmulation(session.page);
        await session.page.evaluate(installModal,mutation);
        // Arrange the fixture's post-Submit dialog, not a pre-input dialog.
        await session.page.evaluate(()=>{clearTimeout(dropdownFixture.timer);dropdownFixture.modal.remove();dropdownFixture.backdrop.remove();});
        await session.page.evaluate(m=>{
            const f=dropdownFixture,button=document.querySelector('#sa-navigation-controls button');
            const replacement=button.cloneNode(true);button.replaceWith(replacement);
            replacement.addEventListener('click',()=>{
                f.submits++;document.body.append(f.modal,f.backdrop);
                if(m==='advance')setTimeout(f.finish,220);
            });
        },mutation);
        session.child.stdin.write('start\n');await session.wait(()=>session.output.includes('Dropdown Submit approval required'));
        session.child.stdin.write('yes\n');
        if(mutation==='unknown'){
            await session.wait(()=>session.output.includes('answerLoop Exited.'));
            assert.match(session.output,/Selection modal diagnostic .*"guard":"unknown-modal"/);
            assert.equal(await session.page.evaluate(()=>dropdownFixture.modal.isConnected),true,'cleanup leaves dialog for checking');
            session.child.stdin.write('start\n');await session.wait(()=>session.output.includes('still open; close or check'));
            assert.deepEqual(await session.page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[8,1]);
        }else{
            await session.wait(()=>session.output.includes('answerLoop Exited.'));
            assert.match(session.output,/Verified the next section/);
            assert.doesNotMatch(session.output,/Lesson completed\./);
            assert.deepEqual(await session.page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[8,1]);
            assert.match(session.output,/Selection modal diagnostic/);
        }
        assert.doesNotMatch(session.output,/PRIVATE/);
        session.child.stdin.write('quit\n');await session.wait(()=>session.child.exitCode!==null);
    }finally{await session.cleanup();}
}
(async()=>{await browserCases();await cliCase('unknown');await cliCase('advance');console.log('Selection modal PASS: read-only exact section/model/new-question transition; unknown/ambiguous/completion/stale/assessment/backdrop/accessor/cancel refusals; zero observer input; real CLI preserves unknown dialog and blocks restart. Synthetic only.');})().catch(e=>{console.error(e);process.exitCode=1;});
