const assert = require('node:assert/strict');
const { detectQuestion } = require('../lib/detect-question');
const { playGapsRound } = require('../lib/gaps-handler');
const eachSequential = (values, run) => values.reduce((previous, value) => previous.then(() => run(value)), Promise.resolve());
// Lesson slides pair one gaps question with annotated-text lesson content
// (chunk606: AnnotatedTextComponent isInput false, marked NOT_MARKED, skipped
// from baseComponents registration, excluded from multi-component marking).
// The fixture models the extra def plus its DOM sibling holding an image.
function installMixedSlide() {
    const f = gapsFixture;
    f.q.questionDef.Components.push({ ComponentTypeCode: 'ANNOTATED_TEXT_COMPONENT', ComponentID: 'text-1' });
    const notes = document.createElement('div'); notes.className = 'annotated-text-component';
    const image = document.createElement('img'); image.alt = 'hierarchy diagram';
    notes.append(document.createTextNode('Cells make up tissues.'), image);
    f.group.before(notes);
}
async function testMixedSlide(page, setup) {
    await setup(); await page.evaluate(installMixedSlide);
    const d = await detectQuestion(page); assert.equal(d.kind, 'gaps');
    assert.equal((await playGapsRound(page,d,{enter:true,timeout:300})).status,'advanced');
    assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs,gapsFixture.submits]),[[{index:2,trusted:true},{index:1,trusted:true}],1]);
    const cases = {textBox:'unsupported accompanying component: TEXT_BOX_COMPONENT',
        unknownCode:'unsupported accompanying component: redacted type',
        duplicateGaps:'missing or duplicate drag-and-drop component',
        noGaps:'missing or duplicate drag-and-drop component'};
    await eachSequential(Object.keys(cases), async mutation => {
        await setup(); await page.evaluate(installMixedSlide);
        await page.evaluate(m=>{
            const f=gapsFixture, defs=f.q.questionDef.Components;
            if(m==='textBox')defs.push({ComponentTypeCode:'TEXT_BOX_COMPONENT',ComponentID:'tb-1'});
            if(m==='unknownCode')defs.push({ComponentTypeCode:'not an enum <script>',ComponentID:'x-1'});
            if(m==='duplicateGaps')defs.push({...defs[0],ComponentID:'gaps-2'});
            if(m==='noGaps')defs.splice(0,1);
        },mutation);
        const refused = await detectQuestion(page);
        assert.equal(refused.kind,'unsupported',mutation);
        assert.equal(refused.reason,'Drag-and-drop gaps: '+cases[mutation],mutation);
        assert.deepEqual(await page.evaluate(()=>[gapsFixture.inputs.length,gapsFixture.submits]),[0,0],mutation);
    });
    console.log('Mixed slide: annotated-text companion success, 4 named companion refusals PASS. Synthetic only.');
}
module.exports = { testMixedSlide };
