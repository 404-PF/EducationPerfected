// Invented sanitized source-derived fixtures, not captured account DOM.
// EP chunk606: text boxes and number boxes share componentState answer state;
// number boxes add numeric rounding/error metadata. The state builds one
// BasicVariableInjector per raw option template and applyVariableContext
// resolves {expression} templates in place on answerOptions, so an item with
// `raw` keeps the template in def/metadata while answerOptions is resolved.
function installInputBoxFixture(config) {
    const injectorFrom = template => ({ parts: template.split(/({[^}]+})/g).map(part => part.startsWith('{') && part.endsWith('}') ? { temporaryVariable: { expression: part.slice(1, -1) } } : { text: part }) });
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
            Options: [item.raw || item.answer],
            ...config.definition,
            ...(item.definition || {}),
        };
        q.questionDef.Components.unshift(def); // Metadata order deliberately differs from DOM.
        const input = document.createElement('input');
        input.className = config.inputClass;
        // EP chunk606: number boxes wrap the input in a script-position span
        // that becomes the component's visualElement; text boxes do not.
        let visual = input;
        if (config.wrapsInput) {
            visual = document.createElement('span');
            visual.appendChild(input);
        }
        group.append(visual);
        const metadataInstance = JSON.parse(JSON.stringify(def));
        const state = { metadataInstance, answerOptions: [item.answer], optionsInjector: def.Options.map(injectorFrom), variableOptions: [{ Code: 'synthetic-case', Value: 'true' }], injectedInitialText: '', userAnswer: '', isUserAnswerSet: false };
        const component = { id: item.id, componentState: state, visualElement: visual, textBox: input, renderingParameters: { mode: 1 }, marked: 1 };
        base[item.id] = [component];
        input.addEventListener('input', e => {
            f.inputs.push({ id: item.id, trusted: e.isTrusted });
            state.userAnswer = input.value;
            state.isUserAnswerSet = true;
            f.afterInput?.();
        });
        input.addEventListener('keydown', e => { if (e.key === 'Enter') f.submits++; });
    }
    // Mixed slides: extra definition components (never answer-bearing in the
    // base map) plus their extra editable controls, modelling for example a
    // MULTICHOICE_COMPONENT's one radio input per option (EP chunk606).
    for (const extra of config.extraComponents || []) q.questionDef.Components.unshift({ Marked: 1, ...extra });
    for (const control of config.extraControls || []) {
        for (let index = 0; index < control.count; index++) {
            const el = document.createElement(control.tag);
            if (control.type) el.type = control.type;
            if (control.name) el.name = control.name;
            if (control.value) el.value = `${control.value}-${index}`;
            group.append(el);
        }
    }
    const oldButton = [...document.querySelectorAll('#sa-navigation-controls button')].find(b => b.textContent.trim() === 'Submit');
    const submit = oldButton.cloneNode(true);
    oldButton.replaceWith(submit);
    submit.addEventListener('click', () => { f.submits++; q.questionIndex++; });
}

const numberBoxDefinition = {
    RoundingTypeCode: 'NONE',
    RoundingAmount: 0,
    AcceptableErrorTypeCode: 'ABS',
    AcceptableErrorValue: 0,
    Height: 0,
    Width: 0,
    ScriptPosition: 'normal',
    TextAlignment: 'left',
    Score: 1,
};

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
    'textbox-variables': {
        fixtureName: 'textboxFixture',
        componentType: 'TEXT_BOX_COMPONENT',
        inputClass: 'text-box-component',
        definition: { CaseSensitive: true, MarkPunctuation: false, IgnoredCharacters: '' },
        items: [
            { id: 'box-v', raw: '{word}', answer: 'armadietto' },
        ],
    },
    'textbox-mixed': {
        fixtureName: 'textboxFixture',
        componentType: 'TEXT_BOX_COMPONENT',
        inputClass: 'text-box-component',
        definition: { CaseSensitive: true, MarkPunctuation: false, IgnoredCharacters: '' },
        items: [
            { id: 'box-a', answer: 'alpha' },
        ],
        extraComponents: [
            { ComponentTypeCode: 'MULTICHOICE_COMPONENT', ComponentID: 'mcq-1' },
        ],
        extraControls: [
            { tag: 'input', type: 'radio', name: 'mcq-1', value: 'invented-zeta', count: 3 },
        ],
    },
    numberbox: {
        fixtureName: 'numberBoxFixture',
        componentType: 'NUMBER_BOX_COMPONENT',
        inputClass: 'number-box-component',
        wrapsInput: true,
        definition: numberBoxDefinition,
        items: [
            { id: 'box-c', answer: '30' },
            { id: 'box-a', answer: '30' },
            { id: 'box-d', answer: '30' },
            { id: 'box-b', answer: '94.2', definition: { RoundingTypeCode: 'DP', RoundingAmount: 2 } },
        ],
    },
    'numberbox-variables': {
        fixtureName: 'numberBoxFixture',
        componentType: 'NUMBER_BOX_COMPONENT',
        inputClass: 'number-box-component',
        wrapsInput: true,
        definition: numberBoxDefinition,
        items: [
            { id: 'box-v', raw: '{[n][0]}', answer: '42' },
        ],
    },
};

module.exports = { installInputBoxFixture, inputBoxFixtures };
