const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { detectQuestion } = require('../lib/detect-question');
const { playChoiceRound } = require('../lib/choice-handler');
const { setup: setupMath } = require('./choice-renderer-fixture');
async function setup(page, origin) {
    await setupMath(page, origin);
    await page.evaluate(() => {
        const f = window.mathFixture;
        for (let i = 0; i < f.previews.length; i++) {
            const text = 'Synthetic plain answer ' + i;
            const template = '[block align="left"\n' + text + '\n]';
            f.comp.Options[i].TextTemplate = template;
            f.metadata.Options[i].TextTemplate = template;
            f.previews[i].renderer.templateString = template;
            f.previews[i].fields.renderGroup.textContent = text;
        }
        const index = f.q.cachedRenderers[1].identifiedComponents;
        f.q.cachedRenderers[1] = Object.create({ get identifiedComponents() { window.indexGetterCalls++; throw new Error('Must read own parser'); } });
        f.q.cachedRenderers[1].parser = { identifiedComponents: index };
        window.indexGetterCalls = 0; window.blockSubmits = 0; window.navigationClicks = 0;
        document.querySelector('#sa-navigation-controls').addEventListener('click', () => { navigationClicks++; }, true);
    });
}
(async () => {
    const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, executablePath: process.env.HANDLER_EXECUTABLE_PATH || undefined });
        const page = await browser.newPage();
        await setup(page, origin);
        const descriptor = await detectQuestion(page);
        assert.equal(descriptor.kind, 'choice'); assert.equal(descriptor.plainBlock, true);
        await page.evaluate(() => { const f = mathFixture; f.group.prepend(f.previews[1].element); f.previews.reverse(); });
        let selected = false;
        const semi = await playChoiceRound(page, descriptor, { enter: false, timeout: 30, shouldStop: () => selected, log: message => { if(message.startsWith('Selected ')) selected = true; } });
        assert.equal(semi.status, 'aborted');
        assert.deepEqual(await page.evaluate(() => [blockSubmits, navigationClicks]), [0, 0]);
        assert.deepEqual(await page.evaluate(() => mathFixture.clicks), descriptor.correct);
        assert.equal(await page.evaluate(() => indexGetterCalls), 0);
        await setup(page, origin);
        const automatic = await detectQuestion(page);
        await page.evaluate(() => {
            window.blockSubmits = 0;
            [...document.querySelectorAll('#sa-navigation-controls button')].find(button => button.textContent.trim() === 'Submit' && button.getClientRects().length).addEventListener('click', event => { event.stopImmediatePropagation(); blockSubmits++; mathFixture.q.questionIndex++; }, true);
        });
        assert.equal((await playChoiceRound(page, automatic, { enter: true, timeout: 1000 })).status, 'advanced');
        assert.deepEqual(await page.evaluate(() => [mathFixture.clicks.length, blockSubmits, indexGetterCalls]), [1, 1, 0]);
        // Source DOMParagraph boundaries preserve template line identity even
        // without separator text nodes.
        for (const spaced of [true, false]) {
            await setup(page, origin);
            const rendered = await page.evaluate(spaced => {
                const f = mathFixture;
                for(let i=0;i<f.previews.length;i++) {
                    const first='Synthetic first '+i, second='Synthetic second '+i;
                    const template='[block\n'+first+'\n'+second+'\n]';
                    f.comp.Options[i].TextTemplate=template;f.metadata.Options[i].TextTemplate=template;
                    f.previews[i].renderer.templateString=template;
                    const a=document.createElement('p'), b=document.createElement('p');
                    a.textContent=first;b.textContent=second;
                    f.previews[i].fields.renderGroup.replaceChildren(a,...(spaced?[document.createTextNode('\n')]:[]),b);
                }
                return f.previews[0].fields.renderGroup.textContent;
            },spaced);
            assert.equal(rendered,spaced?'Synthetic first 0\nSynthetic second 0':'Synthetic first 0Synthetic second 0');
            const multi=await detectQuestion(page);
            {
                assert.equal(multi.kind,'choice');assert.equal(multi.plainBlock,true);
                let selected=false;
                assert.equal((await playChoiceRound(page,multi,{enter:false,timeout:30,shouldStop:()=>selected,log:message=>{if(message.startsWith('Selected '))selected=true;}})).status,'aborted');
                assert.deepEqual(await page.evaluate(()=>mathFixture.clicks),multi.correct);
                assert.equal(await page.evaluate(()=>navigationClicks),0);
            }
        }
        const paragraphVariant=async mutation=>{
            await setup(page,origin);
            await page.evaluate(mutation=>{
                const f=mathFixture,p=f.previews[2],template=mutation.startsWith('blank')?'[block\nFirst exact line\n\nSecond exact line\n]':'[block\nFirst exact line\nSecond exact line\n]';
                f.comp.Options[2].TextTemplate=template;f.metadata.Options[2].TextTemplate=template;p.renderer.templateString=template;
                const output=document.createElement('div'),block=document.createElement('div');output.className='ep-render-output';
                for(const text of (mutation==='blank'?['First exact line','','Second exact line']:['First exact line','Second exact line'])){const paragraph=document.createElement('p'),span=document.createElement('span');span.textContent=text;paragraph.append(span);block.append(paragraph);}
                output.append(block);p.fields.renderGroup.replaceChildren(output);
                const paragraphs=block.querySelectorAll('p');
                if(mutation==='reorder')block.prepend(paragraphs[1]);
                if(mutation==='extra')block.append(document.createElement('p'));
                if(mutation==='merged'||mutation==='merged-space'){paragraphs[0].textContent+=(mutation==='merged-space'?' ':'')+'Second exact line';paragraphs[1].remove();}
                if(mutation==='foreign-inline'){paragraphs[0].innerHTML='<b>First exact line</b>';block.insertBefore(document.createTextNode(' '),paragraphs[1]);}
                if(mutation==='nested')paragraphs[0].append(document.createElement('div'));
                if(mutation==='foreign')output.append(document.createTextNode('foreign'));
                if(mutation==='line-drift')paragraphs[1].textContent='foreign';
                if(mutation==='editable')paragraphs[0].contentEditable='true';
                if(mutation==='flat')block.textContent='First exact line Second exact line';
            },mutation);
            const d=await detectQuestion(page);
            if(mutation==='source'||mutation==='blank'){
                assert.equal(d.kind,'choice');
                await page.evaluate(()=>{document.querySelector('#sa-navigation-controls button').addEventListener('click',event=>{event.stopImmediatePropagation();blockSubmits++;mathFixture.q.questionIndex++;},true);});
                const result=await playChoiceRound(page,d,{enter:true,timeout:600});assert.equal(result.status,'advanced');
                assert.deepEqual(await page.evaluate(()=>[mathFixture.clicks.length,blockSubmits]),[1,1]);
            }else{
                assert.equal(d.kind,'unsupported',mutation);assert.equal(d.diagnostic.option,2,mutation);
                assert.equal(d.diagnostic.check,mutation==='editable'?'render-structure':'render-text',mutation);
                assert.equal(await page.evaluate(()=>mathFixture.clicks.length),0);
            }
        };
        await paragraphVariant('source');await paragraphVariant('reorder');await paragraphVariant('extra');
        await paragraphVariant('merged');await paragraphVariant('nested');await paragraphVariant('foreign');
        await paragraphVariant('line-drift');await paragraphVariant('editable');
        await paragraphVariant('merged-space');await paragraphVariant('foreign-inline');
        await paragraphVariant('blank');await paragraphVariant('blank-collapsed');await paragraphVariant('flat');
        // Presentation-only header attributes (justify align, width, ignored
        // unknown keys) never change rendered text, so the exact text binding
        // accepts them; malformed headers still refuse at the raw boundary.
        await setup(page, origin);
        const headerVariant = async (header, expected) => {
            await page.evaluate(header => {
                const f = window.mathFixture, template = header + '\nSynthetic plain answer 0\n]';
                f.comp.Options[0].TextTemplate = template;
                f.metadata.Options[0].TextTemplate = template;
                f.previews[0].renderer.templateString = template;
            }, header);
            const descriptor = await detectQuestion(page);
            assert.equal(descriptor.kind, expected.kind, header);
            if (expected.kind === 'choice') {
                assert.equal(descriptor.representation, 'renderer-template', header);
                assert.equal(descriptor.plainBlock, true, header);
                assert.equal(descriptor.options.length, 4, header);
                assert.deepEqual(descriptor.correct, ['[block align="left"\nSynthetic plain answer 1\n]'], header);
                const pairs = [0, 1, 2, 3].map(i => [(i === 0 ? header : '[block align="left"') + '\nSynthetic plain answer ' + i + '\n]', i === 1 ? 'True' : 'false']);
                assert.equal(descriptor.associationSignature, JSON.stringify([pairs, pairs]), header);
            }
            if (expected.boundary) assert.equal(descriptor.diagnostic?.boundary, expected.boundary, header);
            if (expected.check) assert.equal(descriptor.diagnostic?.check, expected.check, header);
        };
        await headerVariant('[block align="justify"', { kind: 'choice' });
        await headerVariant('[block width="300"', { kind: 'choice' });
        await headerVariant('[block width="300" align="right"', { kind: 'choice' });
        await headerVariant('[block align="left" data-theme="plain"', { kind: 'choice' });
        await headerVariant('[block data-theme="plain theme"', { kind: 'choice' });
        await headerVariant('[block align="middle"', { kind: 'unsupported', boundary: 'raw-template', check: 'header' });
        await headerVariant('[block align', { kind: 'unsupported', boundary: 'raw-template', check: 'header' });
        await headerVariant('[block width="wide"', { kind: 'unsupported', boundary: 'raw-template', check: 'header' });
        await headerVariant('[block align="left" align="right"', { kind: 'unsupported', boundary: 'raw-template', check: 'header' });
        await headerVariant('[block data-theme="plain', { kind: 'unsupported', boundary: 'raw-template', check: 'header' });
        // Raw templates may carry EP variable expressions ({..}, resolved in
        // the metadata clone) and literal < > { } text; the resolved template
        // and rendered text still bind the answer exactly.
        const variableVariant = async (raw0, resolved0, rendered0, expected) => {
            await page.evaluate((raw0, resolved0, rendered0) => {
                const f = window.mathFixture;
                f.comp.Options[0].TextTemplate = raw0;
                f.metadata.Options[0].TextTemplate = resolved0;
                f.previews[0].renderer.templateString = resolved0;
                f.previews[0].fields.renderGroup.textContent = rendered0;
            }, raw0, resolved0, rendered0);
            const descriptor = await detectQuestion(page);
            assert.equal(descriptor.kind, expected.kind, raw0);
            if (expected.kind === 'choice') {
                assert.equal(descriptor.options[0].text, resolved0, raw0);
                const rest = [1, 2, 3].map(i => ['[block align="left"\nSynthetic plain answer ' + i + '\n]', i === 1 ? 'True' : 'false']);
                assert.equal(descriptor.associationSignature, JSON.stringify([
                    [[raw0, 'false'], ...rest],
                    [[resolved0, 'false'], ...rest],
                ]), raw0);
            }
            if (expected.check) {
                assert.equal(descriptor.diagnostic?.boundary, 'raw-template', raw0);
                assert.equal(descriptor.diagnostic?.check, expected.check, raw0);
                assert.equal(descriptor.diagnostic?.option, 0, raw0);
            }
        };
        await variableVariant('[block\n{x}\n]', '[block\n42\n]', '42', { kind: 'choice' });
        await variableVariant('[block\nTotal {a} of {b}\n]', '[block\nTotal 3 of 10\n]', 'Total 3 of 10', { kind: 'choice' });
        await variableVariant('[block\n{round(a[1])}\n]', '[block\n7\n]', '7', { kind: 'choice' });
        await variableVariant('[block\nx < 5\n]', '[block\nx < 5\n]', 'x < 5', { kind: 'choice' });
        // Literal > and unmatched braces are ordinary text in chunk606's
        // splitParts grammar; an expression inside a color span resolves to a
        // palette digit before the resolved-template check binds the final text.
        await variableVariant('[block\nx > 5\n]', '[block\nx > 5\n]', 'x > 5', { kind: 'choice' });
        await variableVariant('[block\nx { y\n]', '[block\nx { y\n]', 'x { y', { kind: 'choice' });
        await variableVariant('[block\nx y }\n]', '[block\nx y }\n]', 'x y }', { kind: 'choice' });
        await variableVariant('[block\n@@{color}@Yes@@\n]', '[block\n@@1@Yes@@\n]', 'Yes', { kind: 'choice' });
        await variableVariant('[block\n[table\n]\n]', '[block\nx\n]', 'x', { kind: 'unsupported', check: 'body-bracket' });
        await variableVariant('[block\n \n]', '[block\nx\n]', 'x', { kind: 'unsupported', check: 'body-blank' });
        await variableVariant('[block\n \u000b \n]', '[block\nx\n]', 'x', { kind: 'unsupported', check: 'body-control' });
        const boundaries = {
            'no-parser': 'renderer-graph', 'foreign-index': 'renderer-graph', image: 'option-dom', math: 'raw-template', // injected katex flips detection to the formula path, whose raw templates carry no backticks
            'extra-editable': 'option-dom', 'render-text': 'option-dom', 'unknown-grammar': 'raw-template', 'unknown-attribute': 'raw-template',
            'mixed-plain': 'raw-template', 'nested-directive': 'raw-template', blank: 'raw-template', 'wrong-group': 'component-binding',
            'wrong-state': 'option-graph', 'wrong-preview': 'option-dom', 'wrong-renderer': 'option-dom', 'duplicate-template': 'raw-template',
            'missing-original': 'option-graph', 'foreign-original': 'option-graph', 'missing-displayed': 'option-graph', 'foreign-displayed': 'option-graph',
            'correct-not-displayed': 'correct-set', 'missing-preview': 'component-binding', 'single-line-block': 'raw-template',
            'leading-block': 'raw-template', 'embedded-block': 'raw-template',
        };
        const checks = {
            image: 'option-binding', math: 'template', 'extra-editable': 'input-binding', 'render-text': 'render-text',
            'unknown-grammar': 'header', 'unknown-attribute': 'header', 'mixed-plain': 'line-count', 'nested-directive': 'body-bracket',
            blank: 'body-blank', 'wrong-preview': 'option-binding', 'wrong-renderer': 'option-binding', 'duplicate-template': 'duplicate',
            'single-line-block': 'line-count', 'leading-block': 'header', 'embedded-block': 'header',
        };
        const mutations = ['no-parser', 'foreign-index', 'image', 'math', 'extra-editable', 'render-text', 'unknown-grammar', 'unknown-attribute', 'mixed-plain', 'nested-directive', 'blank', 'wrong-group', 'wrong-state', 'wrong-preview', 'wrong-renderer', 'duplicate-template', 'missing-original', 'foreign-original', 'missing-displayed', 'foreign-displayed', 'correct-not-displayed', 'missing-preview', 'single-line-block', 'leading-block', 'embedded-block'];
        for (const mutation of mutations) {
            await setup(page, origin);
            await page.evaluate(mutation => {
                const f = mathFixture, state = f.component.componentState;
                if (mutation === 'single-line-block') f.comp.Options.forEach((option, i) => { option.TextTemplate = '[block]Synthetic plain answer ' + i; });
                if (mutation === 'leading-block') f.comp.Options[0].TextTemplate = ' [block\ntext\n]';
                if (mutation === 'embedded-block') f.comp.Options[0].TextTemplate = 'prefix[block\ntext\n]';
                if (mutation === 'no-parser') delete f.q.cachedRenderers[1].parser;
                if (mutation === 'foreign-index') f.q.cachedRenderers[1].parser.identifiedComponents = { baseComponents: {} };
                if (mutation === 'image') f.previews[1].element.append(document.createElement('img'));
                if (mutation === 'math') { const formula = document.createElement('span'); formula.className = 'katex'; f.previews[1].element.append(formula); }
                if (mutation === 'extra-editable') f.previews[1].element.append(document.createElement('input'));
                if (mutation === 'render-text') f.previews[1].fields.renderGroup.textContent = 'foreign text';
                if (mutation === 'unknown-attribute') f.comp.Options[0].TextTemplate = '[block unknown="x\ntext\n]';
                if (mutation === 'unknown-grammar') f.comp.Options[0].TextTemplate = '[unknown\ntext\n]';
                if (mutation === 'mixed-plain') f.comp.Options[0].TextTemplate = 'plain';
                if (mutation === 'nested-directive') f.comp.Options[0].TextTemplate = '[block\n[image url="x"]\n]';
                if (mutation === 'blank') f.comp.Options[0].TextTemplate = '[block\n \n]';
                if (mutation === 'wrong-group') f.component.visualElement = document.body;
                if (mutation === 'wrong-state') state.componentID = 'foreign';
                if (mutation === 'wrong-preview') f.previews[1].correct = false;
                if (mutation === 'wrong-renderer') f.previews[1].renderer.templateString = 'foreign';
                if (mutation === 'duplicate-template') f.comp.Options[0].TextTemplate = f.comp.Options[1].TextTemplate;
                if (mutation === 'missing-original') delete state.originalMultiChoiceOptions;
                if (mutation === 'foreign-original') state.originalMultiChoiceOptions[0] = { ...state.originalMultiChoiceOptions[0] };
                if (mutation === 'missing-displayed') delete state.displayedOptions;
                if (mutation === 'foreign-displayed') state.displayedOptions[0] = { ...state.displayedOptions[0] };
                if (mutation === 'correct-not-displayed') { f.previews[1].element.remove(); state.displayedOptions.splice(1, 1); f.previews.splice(1, 1); }
                if (mutation === 'missing-preview') f.previews.pop();
            }, mutation);
            assert.deepEqual(await detectQuestion(page).then(detected => [detected.kind, detected.diagnostic?.boundary, detected.diagnostic?.check]), ['unsupported', boundaries[mutation], checks[mutation]], mutation);
            assert.equal(await page.evaluate(() => mathFixture.clicks.length), 0);
        }
        for (const mutation of ['round', 'template', 'resolved-marking', 'auto-marking', 'detached', 'graph']) {
            await setup(page, origin); const descriptor = await detectQuestion(page);
            await page.evaluate(mutation => {
                const f = mathFixture;
                if (mutation === 'round') f.q.questionIndex++;
                if (mutation === 'template') f.comp.Options[1].TextTemplate += 'changed';
                if (mutation === 'resolved-marking') f.metadata.Options[1].Correct = 'false';
                if (mutation === 'auto-marking') angular.element(f.group).scope().self.sectionData.activityGroup.isAutoMarked = false;
                if (mutation === 'detached') f.previews[1].element.remove();
                if (mutation === 'graph') f.component.componentState.originalMultiChoiceOptions[0] = { ...f.metadata.Options[0] };
            }, mutation);
            assert.equal((await playChoiceRound(page, descriptor, { enter: false, timeout: 20, shouldStop: (() => { const end = Date.now() + 1000; return () => Date.now() >= end; })() })).status, 'stopped', mutation);
            assert.equal(await page.evaluate(() => mathFixture.clicks.length), 0);
        }
        for (const mutation of ['marking', 'detach']) {
            await setup(page, origin); const descriptor = await detectQuestion(page);
            let chosenReads = 0, lateMutations = 0;
            const driftPage = new Proxy(page, { get(target, key) {
                if (key !== '$$') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
                return async (...args) => {
                    const handles = await target.$$(...args);
                    for (const handle of handles) {
                        const evaluate = handle.evaluate.bind(handle);
                        handle.evaluate = async (...args) => {
                            const chosen = await evaluate(element => element === mathFixture.previews[1].element);
                            if (chosen && ++chosenReads === 2) {
                                lateMutations++;
                                await target.evaluate(mutation => { if (mutation === 'marking') mathFixture.metadata.Options[1].Correct = 'false'; else mathFixture.previews[1].element.remove(); }, mutation);
                            }
                            return evaluate(...args);
                        };
                    }
                    return handles;
                };
            } });
            const end = Date.now() + 1000;
            const result = await playChoiceRound(driftPage, descriptor, { enter: false, shouldStop: () => Date.now() >= end });
            assert.equal(result.status, 'stopped', mutation);
            assert.equal(lateMutations, 1, mutation);
            assert.deepEqual(await page.evaluate(() => [mathFixture.clicks.length, navigationClicks]), [0, 0]);
        }
        console.log('Plain block choice synthetic fixtures: exact renderer mapping despite reorder, semi1select/0Submit, auto1select/1Submit, getter0calls, multiline2paragraph with/without separator success, source-shaped wrapped paragraphs and7shape/drift refusals,5 renderer-bound presentation-header accepts+5 malformed-header refusals,8 variable/literal-text accepts+3 narrowed-body refusals,25 initial refusals with boundary+check diagnostics+6 pre-start changes+2 final-recheck drift0select PASS. No live answering proof.');
    } finally { if(browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
