const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playChoiceRound } = require('../lib/choice-handler');
const { setup } = require('./choice-renderer-fixture');
async function colorFixture(page, origin, pattern = '@@009900@BODY@@') {
    await setup(page, origin);
    await page.evaluate(pattern => {
        const f = window.mathFixture;
        for (let i = 0; i < f.previews.length; i++) {
            const text = 'Synthetic answer ' + i;
            const template = '[block align="left"\n' + pattern.replaceAll('BODY', text) + '\n]';
            f.comp.Options[i].TextTemplate = template;
            f.metadata.Options[i].TextTemplate = template;
            f.previews[i].renderer.templateString = template;
            f.previews[i].fields.renderGroup.textContent = text;
        }
        window.colorSubmits = 0;
        [...document.querySelectorAll('#sa-navigation-controls button')].find(b => b.textContent.trim() === 'Submit' && b.getClientRects().length).addEventListener('click', event => {
            event.stopImmediatePropagation(); colorSubmits++; f.q.questionIndex++;
        }, true);
    }, pattern);
}
(async () => {
    const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    const origin = 'http://127.0.0.1:' + server.address().port; let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        for (const token of ['1','2','3','4','5','6','7','8','9','abc','ABC','a1B','009900','aBcDeF']) {
            await colorFixture(page, origin, '@@' + token + '@BODY@@');
            const d = await detectQuestion(page);
            assert.equal(d.kind, 'choice', token); assert.equal(d.plainBlock, true); assert.equal(d.representation, 'renderer-template');
            assert.ok(d.correct.every(t => t.includes('@@' + token + '@')));
            assert.equal((await playChoiceRound(page, d, { enter: true, timeout: 1000 })).status, 'advanced');
            assert.deepEqual(await page.evaluate(() => [mathFixture.clicks.length, colorSubmits]), [1,1]);
            assert.ok(d.correct[0].includes('Synthetic answer 1'));
            assert.equal(await page.evaluate(() => mathFixture.clicks[0]), d.correct[0]);
        }
        // Disjoint spans retain plain text and exact raw answer identity.
        await colorFixture(page, origin, '@@3@Synthetic@@ answer @@abc@BODY@@');
        await page.evaluate(() => mathFixture.previews.forEach((p,i) => p.fields.renderGroup.textContent = 'Synthetic answer Synthetic answer ' + i));
        assert.equal((await detectQuestion(page)).kind, 'choice');
        const invalid = ['BODY@','@BODY','@@BODY@@','@@0@BODY@@','@@a@BODY@@','@@12@BODY@@','@@abcd@BODY@@','@@ggg@BODY@@','@@1234567@BODY@@','@@3@BODY','@@3@@@','@@3@BODY@@@','@@3@BODY@@2@x@@@@','\\@@3@BODY@@','@@3@BODY@','@@3@BODY@@[x]','@@3@BODY@@`x`','@@3@BODY@@<x>','@@3@BODY@@{x}'];
        for (const pattern of invalid) {
            await colorFixture(page, origin, pattern);
            assert.equal((await detectQuestion(page)).kind, 'unsupported', pattern);
            assert.equal(await page.evaluate(() => mathFixture.clicks.length), 0);
        }
        for (const mutation of ['cache','foreign-option','wrong-template','render-text','image','mode','marking','correct-incomplete','final-template-drift','final-render-drift']) {
            await colorFixture(page, origin); const d = await detectQuestion(page); assert.equal(d.kind, 'choice');
            if (!mutation.startsWith('final-')) await page.evaluate(mutation => {
                const f=mathFixture;
                if(mutation==='cache') f.q.cachedRenderers={};
                if(mutation==='foreign-option') f.previews[1].option={...f.previews[1].option};
                if(mutation==='wrong-template') f.previews[1].renderer.templateString='foreign';
                if(mutation==='render-text') f.previews[1].fields.renderGroup.textContent='foreign';
                if(mutation==='image') f.previews[1].element.append(document.createElement('img'));
                if(mutation==='mode') angular.element().scope().self.model.gameMode=2;
                if(mutation==='marking') angular.element().scope().self.sectionData.activityGroup.isAutoMarked=false;
                if(mutation==='correct-incomplete') {f.previews[1].element.remove();f.component.componentState.displayedOptions.splice(1,1);f.previews.splice(1,1);}
            },mutation);
            let result;
            if(mutation.startsWith('final-')) {
                const original=page.evaluate.bind(page);let injected=false;
                page.evaluate=async (fn,...args)=>{const value=await original(fn,...args);if(!injected&&value?.kind==='choice'){injected=true;await original(m=>{const f=mathFixture;if(m==='final-template-drift')f.previews[1].renderer.templateString='foreign';else f.previews[1].fields.renderGroup.textContent='foreign';},mutation);}return value;};
                try {result=await playChoiceRound(page,d,{enter:true,timeout:300});} finally {page.evaluate=original;}
            } else result=await playChoiceRound(page,d,{enter:true,timeout:300});
            assert.notEqual(result.status,'advanced',mutation);assert.deepEqual(await page.evaluate(()=>[mathFixture.clicks.length,colorSubmits]),[0,0],mutation);
        }
        const controlMutations = ['missing-field','foreign-field','extra-input','text-input','checkbox','name','id','tabindex','disabled','disabled-fieldset','wrong-parent','render-id','render-parent','inside-render','textarea','select','editable','editable-true','editable-option','editable-group','editable-ancestor','group-input','group-textarea','group-select','group-editable'];
        for (const mutation of controlMutations) {
            await colorFixture(page, origin); const d=await detectQuestion(page); assert.equal(d.kind,'choice');
            await page.evaluate(mutation=>{
                const f=mathFixture,p=f.previews[1],c=p.fields.check,r=p.fields.renderGroup;
                if(mutation==='missing-field') delete p.fields.check;
                if(mutation==='foreign-field') p.fields.check=f.previews[0].fields.check;
                if(mutation==='extra-input') p.element.append(document.createElement('input'));
                if(mutation==='text-input') c.type='text';
                if(mutation==='checkbox') c.type='checkbox';
                if(mutation==='name') c.name='foreign';
                if(mutation==='id') c.id='foreign';
                if(mutation==='tabindex') c.tabIndex=0;
                if(mutation==='disabled') c.disabled=true;
                if(mutation==='disabled-fieldset') {const fieldset=document.createElement('fieldset');fieldset.disabled=true;c.parentElement.before(fieldset);fieldset.append(c.parentElement);if(c.disabled || !c.matches(':disabled'))throw Error('fixture must use inherited disablement');}
                if(mutation==='wrong-parent') c.parentElement.id='foreign';
                if(mutation==='render-id') r.id='foreign';
                if(mutation==='render-parent') p.element.append(r);
                if(mutation==='inside-render') r.append(c);
                if(mutation==='textarea') p.element.append(document.createElement('textarea'));
                if(mutation==='select') p.element.append(document.createElement('select'));
                if(mutation==='editable-true') p.element.append(Object.assign(document.createElement('span'),{contentEditable:'true'}));
                if(mutation==='editable-option') p.element.contentEditable='true';
                if(mutation==='editable-group') f.group.contentEditable='true';
                if(mutation==='editable-ancestor') f.group.parentElement.contentEditable='true';
                if(mutation==='group-input') f.group.append(document.createElement('input'));
                if(mutation==='group-textarea') f.group.append(document.createElement('textarea'));
                if(mutation==='group-select') f.group.append(document.createElement('select'));
                if(mutation==='group-editable') f.group.append(Object.assign(document.createElement('span'),{contentEditable:'true'}));
                if(mutation==='editable') p.element.append(Object.assign(document.createElement('span'),{contentEditable:'false'}));
            },mutation);
            assert.equal((await detectQuestion(page)).kind,'unsupported',mutation);
            assert.notEqual((await playChoiceRound(page,d,{enter:true,timeout:300})).status,'advanced',mutation);
            assert.deepEqual(await page.evaluate(()=>[mathFixture.clicks.length,colorSubmits]),[0,0],mutation);
        }
        console.log('Block color synthetic: 14 palette/hex auto positives, disjoint spans,19 malformed/unsafe refusals,10 association/context/final-drift +25 exact-radio/foreign-editable guards zero selection/Submit PASS. No live compatibility proof.');
    } finally {if(browser)await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
