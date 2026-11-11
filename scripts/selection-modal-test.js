const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {detectQuestion}=require('../lib/detect-question');
const {captureSelectionBaseline,inspectSelectionModal}=require('../lib/selection-modal');
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
    if(mutation==='complete'){dialog.activityComplete=true;dialog.nextSection=null;}
    if(mutation==='no-next')dialog.nextSection=null;
    if(mutation==='accessor')Object.defineProperty(dialog,'nextSection',{get(){f.getterCalls=(f.getterCalls||0)+1;throw new Error('not allowed');}});
    if(mutation==='ambiguous')document.body.append(modal.cloneNode(true));
    if(mutation==='hidden')modal.hidden=true;

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
                const result=await inspectSelectionModal(page,descriptor,baseline);
                assert.equal(result.guard,guard,mutation+JSON.stringify(result));
                assert.doesNotMatch(JSON.stringify(result),/PRIVATE|contentID|questionIndex|11|10/);
                assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts,dropdownFixture.extraInputs,dropdownFixture.getterCalls||0]),[0,0,0,0,0]);
            }finally{await baseline.dispose();}
        };
        await run('stay','section-next-action-required');
        await run('unknown','unknown-modal');await run('lookalike','unknown-modal');await run('wrong-section','unknown-modal');
        await run('complete','activity-completion-dialog');await run('no-next','unknown-modal');await run('accessor','unknown-modal');
        await run('ambiguous','modal-ambiguous');await run('hidden','modal-visibility-unverified');
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
        await session.page.evaluate(()=>{dropdownFixture.modal.remove();dropdownFixture.backdrop.remove();});
        await session.page.evaluate(()=>{
            const f=dropdownFixture,button=document.querySelector('#sa-navigation-controls button');
            const replacement=button.cloneNode(true);button.replaceWith(replacement);
            replacement.addEventListener('click',()=>{
                f.submits++;document.body.append(f.modal,f.backdrop);

            });
        });
        session.child.stdin.write('start\n');await session.wait(()=>session.output.includes('Dropdown Submit approval required'));
        session.child.stdin.write('yes\n');
        await session.wait(()=>session.output.includes('answerLoop Exited.'));
        assert.match(session.output,/Selection modal diagnostic/);
        assert.equal(await session.page.evaluate(()=>dropdownFixture.modal.isConnected),true,'cleanup leaves dialog for checking');
        if(mutation==='stay')assert.match(session.output,/section-next-action-required/);
        session.child.stdin.write('start\n');await session.wait(()=>session.output.includes('still open; close or check'));
        assert.deepEqual(await session.page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[8,1]);
        assert.doesNotMatch(session.output,/Lesson completed\.|Verified the next section/);
        await session.page.evaluate(()=>{dropdownFixture.modal.hidden=true;dropdownFixture.backdrop.hidden=true;});
        const before=session.output.length;
        session.child.stdin.write('start\n');await session.wait(()=>session.output.slice(before).includes('answerLoop Exited.'));
        assert.doesNotMatch(session.output.slice(before),/still open; close or check/,'explicit restart is not blocked by hidden stale markup');
        assert.doesNotMatch(session.output,/PRIVATE/);
        session.child.stdin.write('quit\n');await session.wait(()=>session.child.exitCode!==null);
    }finally{await session.cleanup();}
}
(async()=>{await browserCases();await cliCase('unknown');await cliCase('stay');console.log('Selection modal PASS: content-free exact section/model next-action diagnosis, unknown/lookalike/duplicate/accessor/hidden refusals, zero observer input; real CLI stops and preserves unknown and section dialogs, blocks restart. Synthetic only.');})().catch(e=>{console.error(e);process.exitCode=1;});
