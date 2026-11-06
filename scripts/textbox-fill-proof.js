const assert = require('node:assert/strict');
// Verify both observable controls and the cached answer state, not just event count.
async function assertTextboxFillProof(page) {
    const proof = await page.evaluate(() => {
        const f = textboxFixture;
        return {
            inputs: f.inputs,
            answers: [...f.group.querySelectorAll('input')].map(input => {
                const component = Object.values(f.base).flat().find(c => c.textBox === input);
                return [component.id, input.value, component.componentState.userAnswer, component.componentState.isUserAnswerSet];
            }),
            submits: f.submits,
            nexts: f.nexts,
            questionUnchanged: f.q.questionIndex === f.initialQuestionIndex
        };
    });
    assert.deepEqual(proof, {
        inputs: [...Array(4).fill('box-b'), ...Array(5).fill('box-a')].map(id => ({id, trusted:true})),
        answers: [['box-b','beta','beta',true], ['box-a','alpha','alpha',true]],
        submits:0,
        nexts:0,
        questionUnchanged:true
    });
}
module.exports = { assertTextboxFillProof };
