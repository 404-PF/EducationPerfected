const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {detectQuestion}=require('../lib/detect-question');
const {playDropdownRound}=require('../lib/dropdown-handler');
const {waitForDropdownSubmit}=require('../lib/dropdown-submit-readiness');
const {bootFixtureCli}=require('./fixture-cli-session');
const {installPopupEmulation}=require('./dropdown-popup-test-helpers');
// An initially locked Submit remains unavailable until after both exact values
// are selected, exposing the former single-read failure deterministically.
function installDelay(mutation){
    const f=dropdownFixture,button=document.querySelector('#sa-navigation-controls button');
    button.disabled=true;f.submitClicks=[];f.waitStarted=false;
    button.addEventListener('click',e=>f.submitClicks.push(e.isTrusted));
    f.afterChange=()=>{
        const exact=[...f.group.querySelectorAll('select')].every(el=>el.selectedIndex===2);
        if(!exact||f.waitStarted)return;
        f.waitStarted=true;
        if(mutation==='ambiguous'){
            const extra=button.cloneNode(true);extra.disabled=false;button.parentElement.append(extra);return;
        }
        if(mutation==='missing'||mutation==='insert')button.remove();
        if(mutation==='hidden'){button.disabled=false;button.hidden=true;}
        if(mutation==='never'||mutation==='cancel'||mutation==='missing')return;
        setTimeout(()=>{
            if(mutation==='key')f.q.questionIndex++;
            if(mutation==='renderer')f.q.cachedRenderers[1]={...f.q.cachedRenderers[1]};
            if(mutation==='cache')f.base['dropdown-0'][0].componentState._selectedOption=null;
            if(mutation==='assessment')f.self.model.gameMode=2;
            if(mutation==='insert')document.querySelector('#sa-navigation-controls').append(button);
            if(mutation==='hidden')button.hidden=false;
            button.disabled=false;
        },150);
    };
}
// Isolate the helper's budget from browser/detection/selection scheduling.
async function checkReadinessBudget(){
    const originalNow=Date.now,originalTimer=global.setTimeout;
    let clock=0,reads=0,disposed=0;
    const state={valid:true,readiness:'not-ready',ready:false,submitState:{visible:1,enabled:0}};
    const page={evaluateHandle:async()=>{
        reads++;
        return{evaluate:async()=>state,dispose:async()=>{disposed++;}};
    }};
    Date.now=()=>clock;
    global.setTimeout=(callback,delay)=>{clock+=delay;queueMicrotask(callback);};
    try{
        const result=await waitForDropdownSubmit(page,{}, {timeout:10000});
        assert.equal(result.guard,'submit-readiness-timeout');
        assert.deepEqual(result.submitState,{visible:1,enabled:0});
        assert.equal(clock,3000,'neither an early return nor a cap above three seconds');
        assert.equal(reads,61);assert.equal(disposed,reads);
    }finally{Date.now=originalNow;global.setTimeout=originalTimer;}
}
(async()=>{
    await checkReadinessBudget();
    const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
    try{
        browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});const page=await browser.newPage();
        const setup=async mutation=>{await page.goto('http://127.0.0.1:'+server.address().port+'/lesson-dropdown?count=2');await page.evaluate(installDelay,mutation);};
        const counts=()=>page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]);
        const checkReady=async mutation=>{
            await setup(mutation);let approvals=0;
            const result=await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:800,requireSubmitApproval:true,approveSubmit:async()=>{approvals++;return true;}});
            assert.equal(result.status,'advanced',mutation);assert.equal(approvals,1);
            assert.deepEqual(await counts(),[6,1,0]);assert.deepEqual(await page.evaluate(()=>dropdownFixture.submitClicks),[true]);
        };
        await checkReady('enable');await checkReady('insert');await checkReady('hidden');
        const checkRefusal=async(mutation,guard)=>{
            await setup(mutation);let approvals=0;
            const result=await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:400,requireSubmitApproval:true,approveSubmit:async()=>{approvals++;return true;}});
            assert.equal(result.selectionDiagnostic.phase,'submit-readiness',mutation);
            assert.equal(result.selectionDiagnostic.guard,guard,mutation);assert.equal(approvals,0);
            assert.deepEqual(await counts(),[6,0,0],mutation);
            if(mutation==='never')assert.deepEqual(result.selectionDiagnostic.submitState,{visible:1,enabled:0});
            if(mutation==='missing')assert.deepEqual(result.selectionDiagnostic.submitState,{visible:0,enabled:0});
        };
        await checkRefusal('never','submit-readiness-timeout');
        await checkRefusal('missing','submit-readiness-timeout');
        await checkRefusal('ambiguous','submit-button-ambiguous');
        await checkRefusal('key','baseline-changed');
        await checkRefusal('renderer','baseline-changed');
        await checkRefusal('cache','cached-selection-identity');
        await checkRefusal('assessment','assessment-mode');
        // Integration refusal above also asserts no replay, approval or Submit.
        // A slow read returning a ready button after the budget is not accepted.
        await setup('never');const read=page.evaluateHandle.bind(page);let capturedReady=false;
        page.evaluateHandle=async(fn,...args)=>{
            if(args[1]==='submit')await page.evaluate(()=>{document.querySelector('#sa-navigation-controls button').disabled=false;});
            const h=await read(fn,...args);
            if(args[1]==='submit'){
                capturedReady=await h.evaluate(r=>!!r.target);
                await new Promise(r=>setTimeout(r,350));
            }
            return h;
        };
        try{assert.equal((await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:250})).selectionDiagnostic.guard,'submit-readiness-timeout');}
        finally{page.evaluateHandle=read;}
        assert.equal(capturedReady,true);
        assert.deepEqual(await counts(),[6,0,0]);
        await setup('enable');let stop=false;
        const original=page.evaluateHandle.bind(page);
        page.evaluateHandle=async(fn,...args)=>{const h=await original(fn,...args);if(args[1]==='submit'){stop=true;}return h;};
        try{assert.equal((await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:800,shouldStop:()=>stop})).status,'aborted');}
        finally{page.evaluateHandle=original;}
        assert.deepEqual(await counts(),[6,0,0]);
        // Final guards after approval remain authoritative, including button drift.
        const checkFinalGuard=async mutation=>{
            await setup('enable');
            const result=await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:800,requireSubmitApproval:true,approveSubmit:async()=>{
                if(mutation==='deny')return false;
                await page.evaluate(m=>{if(m==='disable'){document.querySelector('#sa-navigation-controls button').disabled=true;}if(m==='key'){dropdownFixture.q.questionIndex++;}if(m==='covered'){const cover=document.createElement('div');Object.assign(cover.style,{position:'fixed',inset:'0',zIndex:'99999',background:'white'});document.body.append(cover);}},mutation);return true;
            }});
            assert.equal(result.status,'stopped',mutation);assert.deepEqual(await counts(),[6,0,0],mutation);
        };
        await checkFinalGuard('deny');await checkFinalGuard('disable');await checkFinalGuard('covered');await checkFinalGuard('key');
        await setup('enable');const click=page.mouse.click.bind(page.mouse);
        page.mouse.click=async(...args)=>{await click(...args);throw new Error('uncertain');};
        try{assert.equal((await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:800})).selectionDiagnostic.guard,'inspection-or-dispatch-uncertain');}
        finally{page.mouse.click=click;}
        assert.deepEqual(await counts(),[6,1,0]);
    }finally{if(browser){await browser.close();}await new Promise(r=>server.close(r));}
    const session=await bootFixtureCli('cli.js','Commands: start');
    try{
        await session.page.goto(session.origin+'/lesson-dropdown?count=2');await installPopupEmulation(session.page);await session.page.evaluate(installDelay,'enable');
        await session.page.evaluate(()=>{document.querySelector('#sa-navigation-controls button').addEventListener('click',()=>{dropdownFixture.group.remove();document.querySelector('#question-container-group').remove();dropdownFixture.self.model._currentQuestion=null;const exit=document.querySelector('button.exit-button');exit.hidden=false;exit.style.display='';});});
        session.child.stdin.write('start\n');await session.wait(()=>session.output.includes('Dropdown Submit approval required'));
        assert.deepEqual(await session.page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[8,0]);
        session.child.stdin.write('yes\n');await session.wait(()=>session.output.includes('Lesson completed.'));
        assert.deepEqual(await session.page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[8,1,0]);
        session.child.stdin.write('quit\n');await session.wait(()=>session.child.exitCode!==null);
    }finally{await session.cleanup();}
    console.log('Dropdown Submit readiness PASS: delayed enable/insertion/unhide, exact-state polling, ambiguity/timeout/stale/cache/assessment/cancel guards, approval and final guards, uncertain-click-no-retry, two-dropdown F4 real CLI one approval/Submit. Synthetic only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
