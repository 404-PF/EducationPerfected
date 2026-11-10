const assert = require('node:assert/strict');
const { detectQuestion } = require('../lib/detect-question');
const { playGapsRound } = require('../lib/gaps-handler');
const eachSequential = (values, run) => values.reduce((previous, value) => previous.then(() => run(value)), Promise.resolve());
// EP renders static question images (prism diagrams etc.) inside the single
// .fitg-drop-content template via ImageComponent (chunk606: isInput false,
// registered as a base component beside the gaps). Fixture models that shape.
function installStaticImage() {
    const f = gapsFixture, template = document.createElement('div');
    template.className = 'fitg-drop-content';
    for (const wrapper of f.group.querySelectorAll('.fitg-inline-dropzone')) template.append(wrapper);
    const image = document.createElement('img'); image.alt = 'prism diagram';
    template.prepend(image); f.group.append(template);
    f.state.identifiedComponents.baseComponents.image = [{ isInput: false }];
}
async function testStaticImage(page, setup) {
    await setup(); await page.evaluate(installStaticImage);
    const d = await detectQuestion(page); assert.equal(d.kind, 'gaps');
    assert.equal((await playGapsRound(page,d,{enter:true,timeout:300})).status,'advanced');
    assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits]),[[{index:2,trusted:true},{index:1,trusted:true}],1]);
    const cases = {source:'image outside static question template',dropZone:'image outside static question template',
        unknown:'image outside static question template',prompt:'image outside static question template',
        duplicateTemplate:'image outside static question template',inputExtra:'component registry mismatch',
        unknownExtra:'component registry mismatch',aliasedZone:'component registry mismatch',
        multiEntryGap:'component registry mismatch',missingGapEntry:'component registry mismatch'};
    await eachSequential(Object.keys(cases),async mutation=>{
        await setup(); await page.evaluate(installStaticImage);
        await page.evaluate(m=>{
            const f=gapsFixture, template=f.group.querySelector('.fitg-drop-content'), image=template.querySelector('img');
            if(m==='source')f.renderer.draggables[0].target.append(image);
            if(m==='dropZone')f.renderer.dropZones[0].span.append(image);
            if(m==='unknown')f.group.append(image);
            if(m==='prompt'){template.className='prompt-text';}
            if(m==='duplicateTemplate'){const el=document.createElement('div');el.className='fitg-drop-content';f.group.append(el);}
            if(m==='inputExtra')f.state.identifiedComponents.baseComponents.image=[{isInput:true}];
            if(m==='unknownExtra')f.state.identifiedComponents.baseComponents.image=[{}];
            if(m==='aliasedZone'){const zone=f.renderer.dropZones[0];zone.isInput=true;f.state.identifiedComponents.baseComponents.image=[zone];}
            if(m==='multiEntryGap')f.state.identifiedComponents.baseComponents['41'].push({isInput:false});
            if(m==='missingGapEntry')delete f.state.identifiedComponents.baseComponents['41'];
        },mutation);
        const refused = await detectQuestion(page);
        assert.equal(refused.kind,'unsupported',mutation);
        assert.equal(refused.reason,'Drag-and-drop gaps: '+cases[mutation],mutation);
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0],mutation);
    });
    await setup(); await page.evaluate(installStaticImage);
    await page.evaluate(()=>{gapsFixture.afterInput=()=>{gapsFixture.renderer.draggables[0].target.append(gapsFixture.group.querySelector('img'));};});
    const relocated = await playGapsRound(page,await detectQuestion(page),{enter:true,timeout:100});
    assert.equal(relocated.status,'stopped');
    assert.equal(relocated.message,'Drag-and-drop gaps stopped: trusted key did not produce the exact expected answer prefix; no retry.');
    assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[1,0]);
    console.log('Static images: template-only success, 10 named location/registry refusals, post-input relocation stops PASS. Synthetic only.');
}
module.exports = { testStaticImage };
