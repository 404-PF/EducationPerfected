const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const { createServer } = require('./mock-ep');
const { installGapsFixture } = require('./gaps-fixture');
const { readGapsInPage } = require('../lib/gaps-state');
const { detectQuestion } = require('../lib/detect-question');
const { playGapsRound } = require('../lib/gaps-handler');
const { createFillGapsOnce } = require('../lib/gaps-fill-once');
const { createSubmitGapsOnce } = require('../lib/gaps-submit-once');
(async () => {
    const server = createServer(); await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try {
        browser = await puppeteer.launch({headless:true, executablePath:process.env.HANDLER_EXECUTABLE_PATH || undefined});
        const page = await browser.newPage(), origin = 'http://127.0.0.1:' + server.address().port;
        const setup = async () => { await page.goto(origin + '/lesson'); await page.evaluate(installGapsFixture, {repeated:true}); };
        const counters = () => page.evaluate(() => [gapsFixture.inputs, gapsFixture.submits, gapsFixture.nexts, gapsFixture.q.questionIndex]);
        const fill = () => createFillGapsOnce({detectQuestion,playGapsRound});
        const expected = [0,4,3,5].map(index => ({index,trusted:true}));
        for (const submit of [false,true]) {
            await setup();
            const descriptor = await detectQuestion(page);
            assert.equal(descriptor.kind, 'gaps');
            assert.deepEqual(descriptor.gaps.map(g => g.source), [0,4,3,5]);
            assert.deepEqual(descriptor.gaps.map(g => g.id), [7,41,88,52]);
            const runner = submit ? createSubmitGapsOnce({fillGapsOnce:fill()}) : fill();
            assert.equal((await runner(page)).status, submit ? 'submitted-once' : 'filled-only');
            assert.deepEqual(await counters(), [expected,submit?1:0,0,submit?1:0]);
            if (!submit && process.env.EP_GAPS_REPEATED_SCREENSHOT) await page.screenshot({path:process.env.EP_GAPS_REPEATED_SCREENSHOT});
            await setup();
            assert.equal((await runner(page)).status, 'refused');
            assert.deepEqual(await counters(), [[],0,0,0]);
        }
        const initialCases = ['shortage','differentCorrectLabels','overlappingCorrectLabels','paddedCollision','usedEmpty','wrongRawText','reorderedSources','foreignDrag','nonPrefix','duplicateGap'];
        for (const mutation of initialCases) {
            await setup();
            await page.evaluate(m => {
                const f=gapsFixture;
                if(m==='shortage'){f.state.hintsShown[3]='extra';f.renderer.draggables[3].target.textContent='extra';}
                if(m==='differentCorrectLabels')f.metadata.Gaps[1].CorrectOptions.push('Radius');
                if(m==='overlappingCorrectLabels')f.metadata.Gaps[0].CorrectOptions.push('Circumference');
                if(m==='paddedCollision'){f.state.hintsShown[2]=' Circumference ';f.renderer.draggables[2].target.textContent=' Circumference ';}
                if(m==='usedEmpty')f.renderer.draggables[3].target.classList.add('used');
                if(m==='wrongRawText')f.renderer.draggables[3].target.textContent='Circumference ';
                if(m==='reorderedSources')f.renderer.draggables[0].target.before(f.renderer.draggables[3].target);
                if(m==='foreignDrag')f.renderer.draggables[3].target=f.renderer.draggables[0].target;
                if(m==='duplicateGap')f.renderer.dropZones[0].span.id='7';
                if(m==='nonPrefix'){const z=f.renderer.dropZones.find(z=>z.id==='88');z.span.textContent='Circumference';z.droppedDragID=3;z.containerSpan.className='fitg-inline-dropzone filled';f.renderer.draggables[3].target.classList.add('used');}
            }, mutation);
            assert.equal((await detectQuestion(page)).kind,'unsupported', mutation);
            assert.equal((await createSubmitGapsOnce({fillGapsOnce:fill()})(page)).status,'refused',mutation);
            assert.deepEqual(await counters(),[[],0,0,0],mutation);
        }
        const afterCases = ['wrongCopy','reusedCopy','wrongUsed','swappedCopies','sourceReplacement','correctLabelChange','hintOrderChange','nonPrefix','cancel'];
        for (const mutation of afterCases) {
            await setup();
            await page.evaluate(m => {
                const f=gapsFixture;
                f.afterInput=()=>{
                    const z=f.renderer.dropZones.find(z=>z.id==='7');
                    if(m==='wrongCopy')z.droppedDragID=3;
                    if(m==='reusedCopy'){const next=f.renderer.dropZones.find(z=>z.id==='88');next.span.textContent='Circumference';next.droppedDragID=0;next.containerSpan.className='fitg-inline-dropzone filled';}
                    if(m==='wrongUsed')f.renderer.draggables[0].target.classList.remove('used');
                    if(m==='swappedCopies'){z.droppedDragID=3;f.renderer.draggables[0].target.classList.remove('used');f.renderer.draggables[3].target.classList.add('used');}
                    if(m==='sourceReplacement'){const el=f.renderer.draggables[3].target;el.replaceWith(el.cloneNode(true));}
                    if(m==='correctLabelChange')f.metadata.Gaps[0].CorrectOptions=['Radius'];
                    if(m==='hintOrderChange'){f.state.hintsShown.reverse();}
                    if(m==='nonPrefix'){const next=f.renderer.dropZones.find(z=>z.id==='52');next.span.textContent='Diameter';next.droppedDragID=5;next.containerSpan.className='fitg-inline-dropzone filled';f.renderer.draggables[5].target.classList.add('used');}
                };
            },mutation);
            const runner=createSubmitGapsOnce({fillGapsOnce:fill()});
            let checks=0;
            const result=await runner(page,{shouldStop:mutation==='cancel'?()=>++checks>7:()=>false});
            assert.notEqual(result.status,'submitted-once',mutation);
            const observed=await counters();
            assert.equal(observed[1],0,mutation);assert.equal(observed[2],0,mutation);assert.equal(observed[3],0,mutation);
            assert.equal(observed[0].length,1,mutation);
            assert.equal((await runner(page)).status,'refused',mutation);
        }
        // Read-only partial-prefix check proves deterministic assignments do not shift after filling.
        await setup();
        await page.evaluate(()=>{const f=gapsFixture,z=f.renderer.dropZones.find(z=>z.id==='7');z.span.textContent='Circumference';z.droppedDragID=0;z.containerSpan.className='fitg-inline-dropzone filled';f.renderer.draggables[0].target.classList.add('used');});
        const prefix=await page.evaluate(readGapsInPage,null,'descriptor');
        assert.deepEqual(prefix.descriptor.gaps.map(g=>[g.source,g.filled]),[[0,true],[4,false],[3,false],[5,false]]);
        console.log('Repeated exact labels: 4 DOM gaps / 6 tiles, injective stable [0,4,3,5], trusted fill-only and single Submit, 10 initial + 9 post-input/cancel refusals, permanent attempt consumption, 0 Next PASS. Synthetic only.');
    } finally { if(browser)await browser.close();await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1;});
