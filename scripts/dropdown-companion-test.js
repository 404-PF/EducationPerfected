// Source-derived companion definitions, invented content. No live EP capture.
const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {detectQuestion}=require('../lib/detect-question');
const {playDropdownRound}=require('../lib/dropdown-handler');
const {readDropdownsInPage}=require('../lib/dropdown-state');
const {bootFixtureCli}=require('./fixture-cli-session');
// One page owns each fixture; cases must not race navigation or input.
const series=(items,run)=>items.reduce((previous,item)=>previous.then(()=>run(item)),Promise.resolve());
(async()=>{
    const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
    try{
        browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});const page=await browser.newPage();
        const setup=variant=>page.goto('http://127.0.0.1:'+server.address().port+'/lesson-dropdown?count=1&variant='+variant);
        await series(['annotated-text','sound'],async variant=>{
            await setup(variant);
            const d=await detectQuestion(page);assert.equal(d.kind,'dropdown',JSON.stringify(d));assert.equal(d.dropdowns.length,1);
            assert.equal((await playDropdownRound(page,d,{enter:true,timeout:300})).status,'advanced');
            assert.deepEqual(await page.evaluate(()=>[dropdownFixture.submittedSelections,dropdownFixture.submits,dropdownFixture.nexts]),[[['Radius','Radius']],1,0]);
        });
        const mutations={
            inputType:f=>{f.q.questionDef.Components[1].ComponentTypeCode='TEXT_BOX_COMPONENT';},
            unknownType:f=>{f.q.questionDef.Components[1].ComponentTypeCode='UNKNOWN_COMPONENT';},
            missingCache:f=>{delete f.base['invented-companion'];},
            duplicateCache:f=>{f.base['invented-companion'].push(f.base['invented-companion'][0]);},
            wrongID:f=>{f.base['invented-companion'][0].id='foreign';},
            duplicateID:f=>{f.q.questionDef.Components[1].ComponentID='dropdown-0';},
            wrongType:f=>{f.base['invented-companion'][0].type='text-box';},
            input:f=>{f.base['invented-companion'][0].isInput=true;},
            marked:f=>{f.base['invented-companion'][0].marked=1;},
            mode:f=>{f.base['invented-companion'][0].renderingParameters.mode=2;},
            stateID:f=>{f.base['invented-companion'][0].componentState.componentID='foreign';},
            metadata:f=>{f.base['invented-companion'][0].componentState.metadataInstance.TextTemplate='changed';},
            hidden:f=>{f.base['invented-companion'][0].visualElement.hidden=true;},
            detached:f=>{f.base['invented-companion'][0].visualElement.remove();},
            editable:f=>{f.base['invented-companion'][0].visualElement.append(document.createElement('textarea'));},
            nestedSelect:f=>{f.base['invented-companion'][0].visualElement.append(f.base['dropdown-0'][0].dropDownList);},
            frame:f=>{f.base['invented-companion'][0].visualElement.append(document.createElement('iframe'));},
            extraCache:f=>{f.base.foreign=[{}];},
            assessment:f=>{f.self.model.gameMode=2;},
            manual:f=>{f.self.sectionData.activityGroup.isAutoMarked=false;},
            accessor:f=>{Object.defineProperty(f.base['invented-companion'][0],'isInput',{get(){f.getterCalls=(f.getterCalls||0)+1;return false;}});},
        };
        await series(Object.entries(mutations),async ([name,mutate])=>{
            await setup('annotated-text');
            await page.evaluate(fn=>(0,eval)('('+fn+')')(dropdownFixture),mutate.toString());
            const d=await detectQuestion(page);assert.equal(d.kind,'unsupported',name);
            assert.equal((await playDropdownRound(page,d,{enter:true,timeout:50})).status,'stopped',name);
            assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts,dropdownFixture.getterCalls||0]),[0,0,0,0],name);
        });
        // Counts explain a one-select refusal without exposing content or IDs.
        await setup('annotated-text');await page.evaluate(()=>{dropdownFixture.q.questionDef.Components[1].ComponentTypeCode='PRIVATE TYPE';});
        const bad=await detectQuestion(page);
        assert.deepEqual(bad.diagnostic,{kind:'dropdown-refusal',guard:'definitions-select-count',domSelectCount:1,definitionCount:2,dropdownDefinitionCount:1,companionDefinitionCount:0,unsupportedDefinitionCount:1});
        assert.doesNotMatch(JSON.stringify(bad),/PRIVATE|invented|Radius/);
        const diagnostic=await page.evaluate(readDropdownsInPage,null,'diagnostic');assert.equal(diagnostic.fields.definitionCount,2);
        // Replacing even an otherwise identical companion during input must stop.
        await series(['component','element','metadata','definition'],async change=>{
            await setup('annotated-text');const d=await detectQuestion(page);
            await page.evaluate(change=>{const f=dropdownFixture;f.afterChange=()=>{
                const c=f.base['invented-companion'][0];
                if(change==='component')f.base['invented-companion']=[{...c}];
                if(change==='element'){const copy=c.visualElement.cloneNode(true);c.visualElement.replaceWith(copy);c.visualElement=copy;}
                if(change==='metadata')c.componentState.metadataInstance={...c.componentState.metadataInstance};
                if(change==='definition')f.q.questionDef.Components[1]={...f.q.questionDef.Components[1]};
            };},change);
            assert.equal((await playDropdownRound(page,d,{enter:true,timeout:100})).status,'stopped',change);
            assert.equal(await page.evaluate(()=>dropdownFixture.submits),0,change);
        });
    }finally{await browser?.close();await new Promise(r=>server.close(r));}
    const session=await bootFixtureCli('cli.js','Commands: start');
    try{
        await session.page.goto(session.origin+'/lesson-dropdown?count=1&variant=annotated-text');
        await require('./dropdown-popup-test-helpers').installPopupEmulation(session.page);
        await session.page.evaluate(()=>{dropdownFixture.followingUnsupported=true;});
        session.child.stdin.write('start\n');await session.wait(()=>session.output.includes('Dropdown Submit approval required'));
        session.child.stdin.write('yes\n');await session.wait(()=>session.output.includes('answerLoop Exited.'));
        assert.deepEqual(await session.page.evaluate(()=>[dropdownFixture.submittedSelections,dropdownFixture.submits,dropdownFixture.nexts]),[[['Radius','Radius']],1,0]);
        session.child.stdin.write('quit\n');await session.wait(()=>session.child.exitCode!==null);
    }finally{await session.cleanup();}
    console.log('Dropdown companions PASS:2source-shaped positives,21pre-input refusals,4mid-input identity stops,content-free count diagnostics,realCLI1dropdown+companion1approvedSubmit0Next. Synthetic only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
