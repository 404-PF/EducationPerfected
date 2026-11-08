// Invented sanitized source-derived fixtures, not captured account DOM.
// EP chunk606: text boxes and number boxes share componentState answer state;
// number boxes add numeric rounding/error metadata.
function installInputBoxFixture(config) {
    const old = document.querySelector('.multi-choice-component');
    const self = window.angular.element(old).scope().self, q = self.model._currentQuestion;
    self.model.gameMode = 3;
    const group = document.createElement('div');
    group.className = 'synthetic-input-box-container';
    old.replaceWith(group);
    q.questionDef.Components = [];
    const base = {};
    q.cachedRenderers = { 1: { identifiedComponents: { baseComponents: base } } };
    const f = window[config.fixtureName] = { self, q, group, base, inputs: [], submits: 0, nexts: 0, initialQuestionIndex: q.questionIndex };
    document.addEventListener('click', e => {
        const button = e.target.closest('#sa-navigation-controls button');
        if (button && button.textContent.trim() !== 'Submit') f.nexts++;
    }, true);
    const angular = window.angular;
    window.angular = { ...angular, element: el => el === group ? { scope: () => ({ self }) } : angular.element(el) };
    for (const item of config.items) {
        const def = {
            ComponentTypeCode: config.componentType,
            ComponentID: item.id,
            Marked: 1,
            InitialText: '',
            Options: [item.answer],
            ...config.definition,
            ...(item.definition || {}),
        };
        q.questionDef.Components.unshift(def); // Metadata order deliberately differs from DOM.
        const input = document.createElement('input');
        input.className = config.inputClass;
        group.append(input);
        const metadataInstance = JSON.parse(JSON.stringify(def));
        const state = { metadataInstance, answerOptions: [item.answer], variableOptions: [{ Code: 'synthetic-case', Value: 'true' }], injectedInitialText: '', userAnswer: '', isUserAnswerSet: false };
        const component = { id: item.id, componentState: state, visualElement: input, textBox: input, renderingParameters: { mode: 1 }, marked: 1 };
        base[item.id] = [component];
        input.addEventListener('input', e => {
            f.inputs.push({ id: item.id, trusted: e.isTrusted });
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

const inputBoxFixtures = {
    textbox: {
        fixtureName: 'textboxFixture',
        componentType: 'TEXT_BOX_COMPONENT',
        inputClass: 'text-box-component',
        definition: { CaseSensitive: true, MarkPunctuation: false, IgnoredCharacters: '' },
        items: [
            { id: 'box-b', answer: 'beta' },
            { id: 'box-a', answer: 'alpha' },
        ],
    },
    numberbox: {
        fixtureName: 'numberBoxFixture',
        componentType: 'NUMBER_BOX_COMPONENT',
        inputClass: 'number-box-component',
        definition: {
            RoundingTypeCode: 'NONE',
            RoundingAmount: 0,
            AcceptableErrorTypeCode: 'ABS',
            AcceptableErrorValue: 0,
            Height: 0,
            Width: 0,
            ScriptPosition: 'normal',
            TextAlignment: 'left',
            Score: 1,
        },
        items: [
            { id: 'box-c', answer: '30' },
            { id: 'box-a', answer: '30' },
            { id: 'box-d', answer: '30' },
            { id: 'box-b', answer: '94.20', definition: { RoundingTypeCode: 'DP', RoundingAmount: 2 } },
        ],
    },
};

module.exports = { installInputBoxFixture, inputBoxFixtures };
