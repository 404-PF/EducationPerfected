const assert = require('node:assert/strict');
const { detectQuestion } = require('../lib/detect-question');
const { playGapsRound } = require('../lib/gaps-handler');
const eachSequential = (values, run) => values.reduce((previous, value) => previous.then(() => run(value)), Promise.resolve());
function installStaticMath() {
    const f = gapsFixture, template = document.createElement('div');
    template.className = 'fitg-drop-content';
    for (const wrapper of f.group.querySelectorAll('.fitg-inline-dropzone')) template.append(wrapper);
    const katex = document.createElement('span'); katex.className = 'katex';
    const math = document.createElementNS('http://www.w3.org/1998/Math/MathML', 'math');
    const number = document.createElementNS(math.namespaceURI, 'mn'); number.textContent = '123';
    math.append(number);katex.append(math);template.prepend(katex);f.group.append(template);
}
async function testStaticMath(page, setup) {
    await setup(); await page.evaluate(installStaticMath);
    const d = await detectQuestion(page); assert.equal(d.kind, 'gaps');
    assert.equal((await playGapsRound(page,d,{enter:true,timeout:300})).status,'advanced');
    assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits]),[[{index:2,trusted:true},{index:1,trusted:true}],1]);
    await eachSequential(['source','dropZone','unknown','prompt','duplicateTemplate','nestedTemplate','nestedClassifiedTemplate','emptyDropZoneMath','ancestorControl','input','image'],async mutation=>{
        await setup(); await page.evaluate(installStaticMath);
        await page.evaluate(m=>{
            const f=gapsFixture, template=f.group.querySelector('.fitg-drop-content'), math=template.querySelector('.katex');
            if(m==='source')f.renderer.draggables[0].target.append(math);
            if(m==='dropZone')f.renderer.dropZones[0].span.append(math);
            if(m==='unknown')f.group.append(math);
            if(m==='prompt'){template.className='prompt-text';}
            if(m==='duplicateTemplate'){const el=document.createElement('div');el.className='fitg-drop-content';f.group.append(el);}
            if(m==='nestedTemplate'){const el=document.createElement('div');template.replaceWith(el);el.append(template);}
            if(m==='nestedClassifiedTemplate'){const el=document.createElement('div');el.className='fitg-drop-content';template.append(el);el.append(math);}
            if(m==='emptyDropZoneMath'){const el=math.cloneNode(true);el.textContent='';f.renderer.dropZones[0].span.append(el);}
            if(m==='ancestorControl')math.append(f.renderer.dropZones[0].containerSpan);
            if(m==='input')template.append(document.createElement('input'));
            if(m==='image')template.append(document.createElement('img'));
        },mutation);
        assert.equal((await detectQuestion(page)).kind,'unsupported',mutation);
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0],mutation);
    });
    await setup(); await page.evaluate(installStaticMath);
    await page.evaluate(()=>{gapsFixture.afterInput=()=>{gapsFixture.renderer.draggables[0].target.append(gapsFixture.group.querySelector('.katex'));};});
    const relocated = await playGapsRound(page,await detectQuestion(page),{enter:true,timeout:100});
    assert.equal(relocated.status,'stopped');
    assert.equal(relocated.message,'Drag-and-drop gaps stopped: trusted key did not produce the exact expected answer prefix; no retry.');
    assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[1,0]);
    console.log('Static maths: template-only success, 11 location/control refusals, post-input relocation stops PASS. Synthetic only.');
}
module.exports = { testStaticMath };
