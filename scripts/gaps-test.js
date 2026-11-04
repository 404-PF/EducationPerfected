const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { installGapsFixture } = require('./gaps-fixture');
const { detectQuestion } = require('../lib/detect-question');
const { playGapsRound } = require('../lib/gaps-handler');
(async () => {
    const server = createServer(); await new Promise(r=>server.listen(0,'127.0.0.1',r));
    let browser;
    try {
        browser = await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH || undefined});
        const page = await browser.newPage(); const origin='http://127.0.0.1:'+server.address().port;
        const setup=async()=>{await page.goto(origin+'/lesson');await page.evaluate(installGapsFixture);};
        await setup();
        if(process.env.EP_GAPS_SCREENSHOT)await page.screenshot({path:process.env.EP_GAPS_SCREENSHOT});
        const d=await detectQuestion(page);assert.equal(d.kind,'gaps',JSON.stringify(d));assert.deepEqual(d.gaps.map(g=>g.id),[7,41]);
        const result=await playGapsRound(page,d,{enter:true,timeout:300});assert.equal(result.status,'advanced',JSON.stringify(result));
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits]),[[{index:2,trusted:true},{index:1,trusted:true}],1]);
        await setup();let selected=false;
        assert.equal((await playGapsRound(page,await detectQuestion(page),{enter:false,timeout:100,log:()=>{selected=true;},shouldStop:()=>selected})).status,'aborted');
        assert.equal(await page.evaluate(()=>gapsFixture.submits),0);
        for(const mutation of ['manual','markingUnknown','gameMode','textbox','mixed','duplicateHints','missingCorrect','wrongIndex','duplicateID','foreignSource','foreignZone','prefilled','hidden','domID','extraGap','reviewMode','staleOrder','duplicateCorrect','unknownInput','malformedHints','templateOrder','storedAnswer']) {
            await setup();await page.evaluate(m=>{
                const f=gapsFixture;
                if(m==='manual')f.self.sectionData.activityGroup.isAutoMarked=false;
                if(m==='markingUnknown')delete f.self.sectionData.activityGroup.isAutoMarked;
                if(m==='gameMode')f.self.model.gameMode=1;
                if(m==='textbox')f.comp.InputType=f.metadata.InputType=1;
                if(m==='mixed')f.q.questionDef.Components.push({ComponentTypeCode:'TEXT_BOX_COMPONENT'});
                if(m==='duplicateHints')f.state.hintsShown[0]='alpha';
                if(m==='missingCorrect')f.metadata.Gaps[0].CorrectOptions=['missing'];
                if(m==='wrongIndex')f.state.gapIDtoIndex[41]=1;
                if(m==='duplicateID')f.metadata.Gaps[0].ID=7;
                if(m==='foreignSource')f.renderer.draggables[0].target=document.body;
                if(m==='foreignZone')f.renderer.dropZones=[];
                if(m==='prefilled'){const z=f.renderer.dropZones[0];z.span.textContent='alpha';z.droppedDragID=1;z.containerSpan.className='fitg-inline-dropzone filled';f.renderer.draggables[1].target.classList.add('used');}
                if(m==='hidden')f.renderer.draggables[0].target.hidden=true;
                if(m==='domID')f.renderer.dropZones[0].span.id='999';
                if(m==='reviewMode')f.renderer.renderingParameters.mode=2;
                if(m==='staleOrder')f.renderer.displayOrderDropZones=f.renderer.dropZones;
                if(m==='duplicateCorrect')f.metadata.Gaps[0].CorrectOptions=['alpha','wrong'];
                if(m==='unknownInput')delete f.metadata.InputType;
                if(m==='templateOrder')f.metadata.TextTemplate='[41:alpha] [7:beta] [88:unshown]';
                if(m==='storedAnswer')f.state.usersAnswers[7]='beta';
                if(m==='malformedHints')f.state.hintsShown[0]='x'.repeat(5000);
                if(m==='extraGap')f.group.append(f.renderer.dropZones[0].containerSpan.cloneNode(true));
            },mutation);
            const desc=await detectQuestion(page);
            const handlerCases = ['manual','markingUnknown'];
            assert.equal(desc.kind, handlerCases.includes(mutation) ? 'gaps' : 'unsupported', mutation);
            if (desc.kind === 'gaps') assert.equal((await playGapsRound(page,desc,{enter:true,timeout:100})).status,'stopped',mutation);
            assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0],mutation);
        }
        for(const mutation of ['identity','answer','marking','ineffective','wrongGap','sourceReplacement','submitReplacement','sameKeyNext']) {
            await setup();await page.evaluate(m=>{
                const f=gapsFixture;
                if(m==='ineffective')f.ignoreInput=true;
                if(m==='sameKeyNext')f.keepSame=true;
                f.afterInput=()=>{
                    if(m==='identity')f.q.cachedRenderers[1].identifiedComponents.baseComponents[f.comp.ComponentID]=[{...f.component}];
                    if(m==='answer')f.metadata.Gaps[0].CorrectOptions=['wrong'];
                    if(m==='marking')f.self.sectionData.activityGroup.isAutoMarked=false;
                    if(m==='wrongGap')f.renderer.dropZones[0].span.textContent='wrong';
                    if(m==='sourceReplacement'){const el=f.renderer.draggables[1].target;el.replaceWith(el.cloneNode(true));}
                    if(m==='submitReplacement'){const b=[...document.querySelectorAll('#sa-navigation-controls button')].find(b=>b.textContent==='Submit');b?.remove();}
                };
            },mutation);
            const r=await playGapsRound(page,await detectQuestion(page),{enter:true,timeout:100});assert.equal(r.status,'stopped',mutation);
            assert.equal(await page.evaluate(()=>gapsFixture.submits),mutation==='sameKeyNext'?1:0,mutation);
        }
        console.log('Gaps: trusted DOM-order exact answers, one submit, semi-auto, 22 initial refusals and 8 post-input/no-Next refusals PASS. Source-derived synthetic only.');
    } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
