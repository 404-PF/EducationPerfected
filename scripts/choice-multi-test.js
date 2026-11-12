const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playChoiceRound } = require('../lib/choice-handler');

// Isolate adversarial normalization so a regression cannot hang the test runner.
const source = require('node:fs').readFileSync(require.resolve('../lib/multi-choice-state'), 'utf8');
const stripBody = source.slice(source.indexOf('    const strip ='), source.indexOf('    const rows ='));
const bounded = require('node:child_process').spawnSync(process.execPath, ['-e', stripBody + ";if (strip('['.repeat(120000) + ' unmatched').length !== 120010) process.exit(1);"], { timeout: 2000 });
assert.equal(bounded.error, undefined, 'unmatched bracket normalization exceeded its bounded runtime');
assert.equal(bounded.status, 0, String(bounded.stderr));

// Source-derived, invented content. Not a live multi-select DOM capture.
// Chunk606 builds role=group/multi-select, checkboxes, selectedOptions by
// original metadata IDs, and preview.element/option backlinks. DOM order and
// displayed metadata order deliberately differ. No real tasks or accounts.
const { installMultiChoiceFixture } = require('./multi-choice-fixture');
async function setup(page, origin) {
    await page.goto(origin + '/lesson');
    await page.evaluate(installMultiChoiceFixture);
}
(async () => {
    const server = createServer(); await new Promise(r => server.listen(0,'127.0.0.1',r));
    const origin = `http://127.0.0.1:${server.address().port}`; let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        await setup(page, origin);
        // Capture only when explicitly requested by a developer; no machine-specific path.
        if (process.env.EP_MULTI_SCREENSHOT) await page.screenshot({path:process.env.EP_MULTI_SCREENSHOT});
        assert.equal(await page.evaluate(() => multiFixture.state.selectedOptions), undefined);
        const d = await detectQuestion(page);
        assert.deepEqual(await page.evaluate(() => [multiFixture.state.selectedOptions === undefined, multiFixture.selectionWrites]), [true, 0], 'detection must not initialize EP state');
        assert.equal(d.kind, 'choice', JSON.stringify(d)); assert.deepEqual(d.correct,[0,2]);
        const outcome = await playChoiceRound(page,d,{enter:true,timeout:1000});
        assert.equal(outcome.status,'advanced',JSON.stringify(outcome));
        assert.deepEqual(await page.evaluate(() => ({ clicks: multiFixture.clicks.sort(), submits: multiFixture.submits })), { clicks:[0,2],submits:1 });
        await setup(page,origin);
        await page.evaluate(()=>{ const f=multiFixture; const hidden={TextTemplate:'Undisplayed correct',Correct:'true'}; f.comp.Options.push({...hidden}); f.metadata.Options.push(hidden); });
        const subset=await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:1000});
        assert.equal(subset.status,'advanced','displayed subset mapping must use displayed IDs, not all raw correct options');
        assert.deepEqual(await page.evaluate(() => ({ clicks: multiFixture.clicks.sort(), submits: multiFixture.submits })), { clicks:[0,2],submits:1 });
        // Preserve the old bracket-normalization contract, including malformed/nested text.
        for (const [text, rendered] of [['alpha[note] tail', 'alpha tail'], ['a[[nested]b]c', 'ab]c'], ['a]b[c', 'a]b[c'], ['a[]b[x]c', 'abc'], ['@@ABCDEF@ a[n] @@ tail', 'a tail'], ['['.repeat(120000) + ' unmatched', '['.repeat(120000) + ' unmatched']]) {
            await setup(page, origin);
            await page.evaluate(({text, rendered}) => {
                const f = multiFixture, p = f.state.previewOptions[0];
                f.comp.Options[2].TextTemplate = text;
                p.option.TextTemplate = text; p.renderer.templateString = text;
                p.fields.renderGroup.textContent = rendered;
            }, {text, rendered});
            const normalized = await detectQuestion(page);
            assert.equal(normalized.kind, 'choice', 'bracket normalization must retain exact matching');
            await page.evaluate(text => {
                const p = multiFixture.state.previewOptions[0];
                p.fields.renderGroup.textContent = text + ' mismatched';
            }, text);
            assert.equal((await detectQuestion(page)).kind, 'unsupported', 'normalization must not hide unmatched suffix drift');
            assert.deepEqual(await page.evaluate(() => [multiFixture.clicks.length, multiFixture.submits]), [0,0]);
        }
        // Stop before any toggle or submission.
        await setup(page,origin);
        const aborted=await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:100,shouldStop:()=>true});
        assert.equal(aborted.status,'aborted'); assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits]),[0,0]);
        // Preserve existing user selections, removing only the wrong selection.
        await setup(page,origin);
        await page.evaluate(() => { const f=multiFixture; for(const p of f.state.previewOptions.filter(p => [0,1].includes(f.state.originalMultiChoiceOptions.indexOf(p.option)))) p.element.click(); f.clicks=[]; });
        const pre = await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:1000});
        assert.equal(pre.status,'advanced'); assert.deepEqual(await page.evaluate(() => multiFixture.clicks.sort()),[1,2]);
        // Semi-auto selects only, and aborts through the existing stop callback.
        await setup(page,origin); let selected=false;
        const semi = await playChoiceRound(page,await detectQuestion(page),{enter:false,timeout:100,shouldStop:()=>selected,log:()=>{selected=true;}});
        assert.equal(semi.status,'aborted'); assert.equal(await page.evaluate(()=>multiFixture.submits),0);
        // The same current multi-select key must never use Next to skip grading.
        await setup(page,origin);
        await page.evaluate(()=>{
            const f=multiFixture;
            const submit=[...document.querySelectorAll('#sa-navigation-controls button')].find(b=>b.textContent.trim()==='Submit');
            submit.addEventListener('click',e=>{e.stopImmediatePropagation();f.submits++;},true);
            // Replace the existing submit button to remove its positive grade listener.
            const copy=submit.cloneNode(true);submit.replaceWith(copy);
            copy.addEventListener('click',()=>{f.submits++;copy.textContent='Next Question';});
            copy.addEventListener('click',()=>{if(f.submits>1){f.nexts++;f.q.questionIndex++;}});
        });
        const next=await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:300});
        assert.equal(next.status,'stopped');
        assert.deepEqual(await page.evaluate(()=>[multiFixture.submits,multiFixture.nexts]),[1,0]);
        // Submit can become enabled after selection; polling must not repeat clicks.
        await setup(page,origin);
        await page.evaluate(()=>{const b=[...document.querySelectorAll('#sa-navigation-controls button')].find(b=>b.textContent.trim()==='Submit');b.disabled=true;setTimeout(()=>{b.disabled=false;},180);});
        assert.equal((await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:1000})).status,'advanced');
        assert.equal(await page.evaluate(()=>multiFixture.submits),1);
        // Mutate selection when Submit handle is retrieved: the final re-read
        // must catch drift in the gap without dispatching a grading click.
        await setup(page,origin);
        const originalEvaluateHandle = page.evaluateHandle.bind(page);
        page.evaluateHandle = async (...args) => {
            const handle = await originalEvaluateHandle(...args);
            if (args[2] === 'submit') {
                const get = handle.getProperty.bind(handle);
                handle.getProperty = async key => {
                    const target = await get(key);
                    if (key === 'target') await page.evaluate(()=>{
                        const f=multiFixture,p=f.state.previewOptions.find(p=>p.option===f.metadata.Options[1]);
                        p.isSelected=true;p.fields.check.checked=true;p.element.setAttribute('aria-selected','true');f.state.selectedOptions.push(1);
                    });
                    return target;
                };
            }
            return handle;
        };
        const drift=await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:300});
        page.evaluateHandle=originalEvaluateHandle;
        assert.equal(drift.status,'stopped');assert.equal(await page.evaluate(()=>multiFixture.submits),0);
        const mutations = {
            missingCache: f => { f.q.cachedRenderers={}; },
            manual: f => { f.self.sectionData.activityGroup.isAutoMarked=false; },
            unknown: f => { delete f.self.sectionData.activityGroup.isAutoMarked; },
            stringMulti: f => { f.comp.AllowMultiSelect='true'; },
            missingCorrect: f => { f.metadata.Options.forEach(o=>o.Correct='false'); f.state.previewOptions.forEach(p=>p.correct=false); },
            malformedCorrect: f => { f.metadata.Options[0].Correct=1; },
            duplicateTemplate: f => { f.metadata.Options[0].TextTemplate=f.metadata.Options[1].TextTemplate; },
            foreignPreview: f => { f.state.previewOptions[0].option={...f.state.previewOptions[0].option}; },
            wrongOrder: f => { f.state.optionsOrderUsingOriginalIndexAsID=[0,1,2]; },
            hiddenCorrect: f => { f.state.previewOptions[0].element.hidden=true; },
            staleCheckbox: f => { f.state.previewOptions[0].fields.check.checked=true; },
            staleAria: f => { f.state.previewOptions[0].element.setAttribute('aria-selected','true'); },
            invalidSelected: f => { f.state.selectedOptions=[99]; },
            nullSelected: f => { f.state.selectedOptions=null; },
            stringSelected: f => { f.state.selectedOptions='0'; },
            objectSelected: f => { f.state.selectedOptions={}; },
            duplicateSelected: f => { f.state.selectedOptions=[0,0]; },
            stringIDs: f => { f.state.selectedOptions=['0']; },
            unsetPreviewSelected: f => { f.state.previewOptions[0].isSelected=true; },
            unsetAriaSelected: f => { f.state.previewOptions[0].element.setAttribute('aria-selected','true'); },
            rendererChanged: f => { f.state.previewOptions[0].renderer.templateString='foreign'; },
            textNotReady: f => { f.state.previewOptions[0].fields.renderGroup.textContent='loading'; },
            uneditable: f => { f.state.previewOptions[0].editable=false; },
            coComponent: f => { f.q.questionDef.Components.push({ ComponentTypeCode: 'LONG_ANSWER_COMPONENT', ComponentID: 'invented-long-answer', Marked: 1 }); },
            foreignEditable: f => { document.querySelector('#ep-question-container').append(document.createElement('textarea')); },
        };
        for(const [name, mutate] of Object.entries(mutations)) {
            await setup(page,origin); const desc=await detectQuestion(page);
            await page.evaluate(fn=>{ (0,eval)('('+fn+')')(multiFixture); },mutate.toString());
            const r=await playChoiceRound(page,desc,{enter:true,timeout:100});
            assert.equal(r.status,'stopped',name+JSON.stringify(r));
            assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits]),[0,0],name);
        }
        // The synthetic Submit listener also handles untouched state without
        // throwing or initializing selection, and must not advance the question.
        await setup(page,origin);
        const pageErrors=[];
        const captureError=error=>pageErrors.push(error.message);
        page.on('pageerror',captureError);
        await page.click('#sa-navigation-controls button');
        assert.deepEqual(await page.evaluate(()=>[multiFixture.submits,multiFixture.q.questionIndex,multiFixture.state.selectedOptions===undefined,multiFixture.selectionWrites]),[1,0,true,0]);
        assert.deepEqual(pageErrors,[]);
        page.off('pageerror',captureError);
        // Explicit empty arrays remain supported alongside the unset default.
        await setup(page,origin);
        await page.evaluate(() => { multiFixture.state.selectedOptions=[]; });
        assert.equal((await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:1000})).status,'advanced');
        // Returning to an unset field after a click cannot hide selected previews.
        await setup(page,origin);
        await page.evaluate(() => { multiFixture.mutateOnClick=()=>{multiFixture.state.selectedOptions=undefined;}; });
        const lost=await playChoiceRound(page,await detectQuestion(page),{enter:true,timeout:100});
        assert.equal(lost.status,'stopped');
        assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits]),[1,0]);
        // Stale data after a trusted click must never submit partial answers.
        for(const mutation of ['key','metadata','marking','replacePreview','ignore','selectionDrift','manual']) {
            await setup(page,origin);const desc=await detectQuestion(page);
            await page.evaluate(m => {const f=multiFixture; f.ignoreClicks=m==='ignore'; f.mutateOnClick=()=>{
                if(m==='key') f.q.questionIndex++;
                if(m==='metadata') f.component.componentState.metadataInstance={...f.metadata};
                if(m==='marking') f.metadata.Options[0].Correct='false';
                if(m==='replacePreview') f.state.previewOptions[0]={...f.state.previewOptions[0]};
                if(m==='selectionDrift') { const p=f.state.previewOptions.find(p=>p.option===f.metadata.Options[1]); p.isSelected=true; p.fields.check.checked=true; p.element.setAttribute('aria-selected','true'); f.state.selectedOptions.push(1); }
                if(m==='manual') f.self.sectionData.activityGroup.isAutoMarked=false;
            };},mutation);
            const r=await playChoiceRound(page,desc,{enter:true,timeout:100});assert.equal(r.status,'stopped',mutation);
            assert.equal(await page.evaluate(()=>multiFixture.submits),0,mutation);
        }
                // Mixed-question detection refuses before any click, not only mid-round.
        for (const mix of ['co-component', 'foreign-editable', 'missing-container']) {
            await setup(page,origin);
            await page.evaluate(m => {
                if (m === 'co-component') multiFixture.q.questionDef.Components.push({ ComponentTypeCode: 'TEXT_BOX_COMPONENT', ComponentID: 'invented-text-box', Marked: 1 });
                if (m === 'foreign-editable') document.querySelector('#ep-question-container').append(document.createElement('textarea'));
                if (m === 'missing-container') { document.body.append(document.querySelector('.multi-choice-component')); document.querySelector('#ep-question-container').remove(); document.body.append(document.createElement('textarea')); }
            }, mix);
            const bad = await detectQuestion(page);
            assert.equal(bad.kind, 'unsupported', mix);
            assert.match(bad.reason, /other answer-bearing|editable controls outside/, mix + bad.reason);
            assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits]),[0,0],mix);
        }
        // An unlisted/display-type co-component must not false-refuse.
        await setup(page,origin);
        await page.evaluate(() => { multiFixture.q.questionDef.Components.push({ ComponentTypeCode: 'DEPTH_COMPONENT', ComponentID: 'invented-depth', Marked: 1 }); });
        assert.equal((await detectQuestion(page)).kind, 'choice', 'unlisted/display codes must not false-refuse');
        // Every deny-listed code must refuse at detection; a typo in one entry
        // would otherwise silently re-enable its mixed slide.
        const denyCodes = ['DROPDOWN_COMPONENT', 'FORMULA_COMPONENT', 'WORKING_FORMULA_COMPONENT', 'FREEFORM_WORKING_COMPONENT',
            'LONG_ANSWER_COMPONENT', 'FILL_IN_GAPS_COMPONENT', 'SCRATCH_PAD_COMPONENT', 'FILE_UPLOADER_COMPONENT',
            'SOUND_RECORDER_COMPONENT', 'HIGHLIGHT_COMPONENT', 'TEXT_BOX_COMPONENT', 'NUMBER_BOX_COMPONENT', 'ANNOTATED_QUESTION_COMPONENT'];
        for (const code of denyCodes) {
            await setup(page,origin);
            await page.evaluate(c => { multiFixture.q.questionDef.Components.push({ ComponentTypeCode: c, ComponentID: 'invented-' + c, Marked: 1 }); }, code);
            const bad = await detectQuestion(page);
            assert.equal(bad.kind, 'unsupported', code);
            assert.match(bad.reason, /other answer-bearing/, code + bad.reason);
            assert.deepEqual(await page.evaluate(()=>[multiFixture.clicks.length,multiFixture.submits]),[0,0],code);
        }
        console.log('Multi-select: exact set/reordered DOM/preselection/semi-auto,25 pre-click refusals and8 post-click stale/ineffective-click refusals,3 mixed-question detection refusals,13 deny-list code refusals passed. Source-derived synthetic only.');
    } finally { if(browser)await browser.close();await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
