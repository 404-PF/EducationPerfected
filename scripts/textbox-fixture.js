// Invented sanitized source-derived fixture, not captured account DOM.
function installTextboxFixture() {
    const old = document.querySelector('.multi-choice-component');
    const self = window.angular.element(old).scope().self, q = self.model._currentQuestion;
    self.model.gameMode = 3;
    const group = document.createElement('div');
    group.className = 'synthetic-textbox-container';
    old.replaceWith(group);
    q.questionDef.Components = [];
    const base = {};
    q.cachedRenderers = { 1: { identifiedComponents: { baseComponents: base } } };
    const f = window.textboxFixture = { self, q, group, base, inputs: [], submits: 0, nexts: 0, initialQuestionIndex: q.questionIndex };
    document.addEventListener('click', e => {
        const button = e.target.closest('#sa-navigation-controls button');
        if (button && button.textContent.trim() !== 'Submit') f.nexts++;
    }, true);
    const angular = window.angular;
    window.angular = { ...angular, element: el => el === group ? { scope: () => ({ self }) } : angular.element(el) };
    for (const [id, answer] of [['box-b', 'beta'], ['box-a', 'alpha']]) {
        const def = { ComponentTypeCode: 'TEXT_BOX_COMPONENT', ComponentID: id, Marked: 1, InitialText: '', Options: [answer], CaseSensitive: true, MarkPunctuation: false, IgnoredCharacters: '' };
        q.questionDef.Components.unshift(def); // Metadata order deliberately differs from DOM.
        const input = document.createElement('input');
        input.className = 'text-box-component';
        group.append(input);
        const metadataInstance = JSON.parse(JSON.stringify(def));
        const state = { metadataInstance, answerOptions: [answer], variableOptions: [{ Code: 'synthetic-case', Value: 'true' }], injectedInitialText: '', userAnswer: '', isUserAnswerSet: false };
        const component = { id, componentState: state, visualElement: input, textBox: input, renderingParameters: { mode: 1 }, marked: 1 };
        base[id] = [component];
        input.addEventListener('input', e => {
            f.inputs.push({ id, trusted: e.isTrusted });
            state.userAnswer = input.value;
            state.isUserAnswerSet = true;
            f.afterInput?.();
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') f.submits++; });
    }
    const oldButton = [...document.querySelectorAll('#sa-navigation-controls button')].find(b => b.textContent.trim() === 'Submit');
    const submit = oldButton.cloneNode(true);
    oldButton.replaceWith(submit);
    submit.addEventListener('click', () => { f.submits++; q.questionIndex++; });
}
module.exports = { installTextboxFixture };
