const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {detectQuestion}=require('../lib/detect-question');
const {captureSelectionBaseline,advanceSelectionSection}=require('../lib/selection-modal');
const {installModal}=require('./section-modal-fixture');
const {bootFixtureCli}=require('./fixture-cli-session');
function bindNext(mutation){
    const f=dropdownFixture;
    f.sectionClicks=0;f.trustedNext=[];
    f.modal.querySelector('#next-button').addEventListener('click',event=>{
        f.sectionClicks++;f.trustedNext.push(event.isTrusted);
        if(mutation==='stay')return;
        f.modal.remove();f.backdrop.remove();
        if(mutation==='dismiss')return;
        f.self.sectionData=mutation==='wrong-next'?{...f.next}:f.next;
        if(mutation==='old-question')return;
        f.self.model._currentQuestion={...f.self.model._currentQuestion,contentID:999,questionIndex:99};
        if(mutation==='assessment')f.self.model.gameMode=2;
        if(mutation==='group-drift')f.next.activityGroup.ID=55;
        if(mutation==='new-modal'||mutation==='transient-modal'){
            const modal=document.createElement('div');modal.setAttribute('uib-modal-window','modal-window');modal.textContent='PRIVATE';document.body.append(modal);
        }
    });
    if(mutation==='inherited'){
        const original=window.angular.element;
        window.angular.element=el=>el===f.modal.querySelector('#modal-section-complete-wrapper')?{scope:()=>Object.create({self:f.dialog})}:original(el);
    }
    if(mutation==='pre-assessment')f.self.model.gameMode=2;
    if(mutation==='fieldset'){
        const fieldset=document.createElement('fieldset');fieldset.disabled=true;
        const button=f.modal.querySelector('#next-button');button.replaceWith(fieldset);fieldset.append(button);
    }
    if(mutation==='disabled')f.modal.querySelector('#next-button').disabled=true;
    if(mutation==='covered'){
        const blocker=document.createElement('div');Object.assign(blocker.style,{position:'fixed',inset:'0',zIndex:'9999'});document.body.append(blocker);
    }
    if(mutation==='type')f.next.type=999;
    if(mutation==='peer')f.dialog.isPeerReviewSectionNext=true;
    if(mutation==='extra-backdrop')document.body.append(f.backdrop.cloneNode(true));
}
async function browserCases(){
    const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
    try{
        browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});
        const page=await browser.newPage();
        const run=async(mutation,guard,clicks=1)=>{
            await page.goto('http://127.0.0.1:'+server.address().port+'/lesson-dropdown?count=2');
            const descriptor=await detectQuestion(page),baseline=await captureSelectionBaseline(page,descriptor);
            const evaluateHandle=page.evaluateHandle.bind(page);
            let transientHandled=false;
            page.evaluateHandle=async(...args)=>{
                const handle=await evaluateHandle(...args);
                const operation=args[3];
                if(!transientHandled&&((mutation==='transient'&&operation==='snapshot')||(mutation==='transient-modal'&&operation==='verify'))){
                    transientHandled=true;
                    // Mutate only after the selected verification read completed.
                    // No timer races or production hook are needed.
                    await page.evaluate(m=>{
                        const f=dropdownFixture;
                        if(m==='transient')f.self.sectionData=f.dialog.currentSection;
                        else for(const modal of document.querySelectorAll('div[uib-modal-window=modal-window]'))modal.remove();
                    },mutation);
                }
                return handle;
            };
            try{
                await page.evaluate(installModal,'stay');await page.evaluate(bindNext,mutation);
                const result=await advanceSelectionSection(page,descriptor,baseline,{timeout:100,shouldStop:()=>mutation==='cancel'});
                assert.equal(result.guard,guard,mutation+JSON.stringify(result));
                assert.deepEqual(await page.evaluate(()=>[dropdownFixture.sectionClicks,dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.trustedNext]),[clicks,0,0,clicks?[true]:[]]);
                assert.doesNotMatch(JSON.stringify(result),/PRIVATE|contentID|questionIndex|999/);
                if(mutation==='stay')assert.equal((await advanceSelectionSection(page,descriptor,baseline,{timeout:100})).guard,'section-action-consumed');
            }finally{page.evaluateHandle=evaluateHandle;await baseline.dispose();}
        };
        await run('advance','next-section-verified');await run('inherited','next-section-verified');
        await run('stay','next-section-unverified');await run('dismiss','next-section-unverified');
        await run('wrong-next','next-section-unverified');await run('old-question','next-section-unverified');
        await run('group-drift','next-section-unverified');await run('new-modal','section-new-modal');await run('transient-modal','section-new-modal');
        await run('transient','section-transition-unstable');await run('assessment','assessment-mode');await run('cancel','section-action-cancelled',0);
        await run('pre-assessment','assessment-mode',0);await run('fieldset','next-button-unready',0);
        await run('disabled','next-button-unready',0);await run('covered','next-button-covered',0);
        await run('type','next-section-type-unverified',0);await run('peer','peer-review-next',0);await run('extra-backdrop','backdrop-unverified',0);
        // Simulate a dispatch whose outcome is lost. It remains consumed.
        await page.goto('http://127.0.0.1:'+server.address().port+'/lesson-dropdown?count=2');
        const descriptor=await detectQuestion(page),baseline=await captureSelectionBaseline(page,descriptor);
        try{
            await page.evaluate(installModal,'stay');await page.evaluate(bindNext,'stay');
            const click=page.mouse.click.bind(page.mouse);page.mouse.click=async(...args)=>{await click(...args);throw new Error('uncertain');};
            assert.equal((await advanceSelectionSection(page,descriptor,baseline)).guard,'section-click-uncertain');
            page.mouse.click=click;
            assert.equal((await advanceSelectionSection(page,descriptor,baseline)).guard,'section-action-consumed');
            assert.equal(await page.evaluate(()=>dropdownFixture.sectionClicks),1);
        }finally{await baseline.dispose();}
    }finally{
        try{if(browser){await browser.close();}}
        finally{await new Promise(r=>server.close(r));}
    }
}
async function cliCase(){
    const session=await bootFixtureCli('cli.js','Commands: start');
    try{
        await session.page.goto(session.origin+'/lesson-dropdown?count=2');
        await require('./dropdown-popup-test-helpers').installPopupEmulation(session.page);
        await session.page.evaluate(installModal,'stay');await session.page.evaluate(bindNext,'advance');
        await session.page.evaluate(()=>{
            const f=dropdownFixture;f.modal.remove();f.backdrop.remove();
            const button=document.querySelector('#sa-navigation-controls button'),replacement=button.cloneNode(true);button.replaceWith(replacement);
            replacement.addEventListener('click',()=>{f.submits++;document.body.append(f.modal,f.backdrop);});
        });
        session.child.stdin.write('start\n');await session.wait(()=>session.output.includes('Dropdown Submit approval required'));session.child.stdin.write('yes\n');
        await session.wait(()=>session.output.includes('Verified the next section and a new question.'));
        session.child.stdin.write('stop\n');await session.wait(()=>session.output.includes('answerLoop Exited.'));
        assert.deepEqual(await session.page.evaluate(()=>[dropdownFixture.sectionClicks,dropdownFixture.submits,dropdownFixture.trustedNext]),[1,1,[true]]);
        assert.doesNotMatch(session.output,/PRIVATE|Lesson completed\./);
        session.child.stdin.write('quit\n');await session.wait(()=>session.child.exitCode!==null);
    }finally{await session.cleanup();}
}
(async()=>{await browserCases();await cliCase();console.log('Section Next PASS: exact/inherited template scope single trusted click, exact next-section/new-question verification, stall/dismiss/wrongsection/oldquestion/groupdrift/newmodal/assessment stop, cancelled/covered/type/peer/backdrop refusals, uncertain dispatch consumed, real CLI resumes fresh detection. Synthetic only.');})().catch(e=>{console.error(e);process.exitCode=1;});
