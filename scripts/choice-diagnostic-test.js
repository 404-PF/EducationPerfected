const assert = require('node:assert/strict');
const vm = require('node:vm');
const { choiceDiagnosticInPage, readChoiceDiagnostic } = require('../lib/choice-diagnostic');
const { createRunControls } = require('../lib/run-controls');
function snapshot(options, overrides = {}) {
    const root = { offsetParent: {}, parentElement: null, querySelectorAll: () => [{ offsetParent: {}, querySelector: () => ({}) }] };
    const scope = { self: { model: { _currentQuestion: { contentID: 'PRIVATE-ID', questionDef: { Components: [{ ComponentTypeCode: 'MULTICHOICE_COMPONENT', Options: options }] } } } } };
    const ctx = { document: { querySelectorAll: () => [root] }, window: { angular: { element: () => ({ scope: () => scope }) } }, ...overrides };
    return vm.runInNewContext(`(${choiceDiagnosticInPage.toString()})()`, ctx);
}
(async () => {
    const options = [{ Correct: 'True', TextTemplate: '[private-payload]' }, { Correct: 'false', TextTemplate: '```private-formula```' }, { Correct: true, TextTemplate: null }, { Correct: 'true', TextTemplate: {} }, { Correct: 'true', TextTemplate: ' ' }];
    const result = snapshot(options);
    assert.equal(result.state, 'metadata-counted');
    assert.equal(result.metadata.correctNormalizedEmpty, 2);
    assert.equal(result.metadata.correctTextMissingOrNonString, 2);
    assert.equal(result.metadata.withBracketSpan, 1);
    assert.equal(result.metadata.withBacktick, 1);
    assert.equal(result.rendered.withMath, 1);
    assert.doesNotMatch(JSON.stringify(result), /private|PRIVATE|TextTemplate|contentID|https|formula/);
    assert.equal(JSON.stringify(options), JSON.stringify([{ Correct: 'True', TextTemplate: '[private-payload]' }, { Correct: 'false', TextTemplate: '```private-formula```' }, { Correct: true, TextTemplate: null }, { Correct: 'true', TextTemplate: {} }, { Correct: 'true', TextTemplate: ' ' }]));
    assert.equal(snapshot([], { document: { querySelectorAll: () => [] } }).state, 'no-single-choice-group');
    assert.equal(snapshot([], { window: {} }).state, 'scope-unavailable');
    assert.deepEqual(await readChoiceDiagnostic({ evaluate: async () => { throw Error('PRIVATE ANSWER'); } }), { version: 1, state: 'read-failed' });
    let release, calls = 0, closed = 0;
    const controls = createRunControls({ run: () => {}, requestStop: () => {}, setMode: () => {}, refresh: () => {}, inspectChoice: () => { calls++; return new Promise(r => { release = r; }); }, close: () => { closed++; } });
    const read = controls.inspectChoice(); await Promise.resolve();
    assert.equal(controls.status().state, 'updating');
    controls.start(); assert.equal(controls.status().state, 'updating');
    await assert.rejects(controls.inspectChoice()); await assert.rejects(controls.refresh());
    const close = controls.close(); assert.equal(closed, 0);
    release(result); assert.equal(await read, result); await close;
    assert.equal(calls, 1); assert.equal(closed, 1); await assert.rejects(controls.inspectChoice());
    console.log('Choice diagnostic: aggregate schema only, no content/IDs/URL/errors, read-only page API, stopped/exclusive/close guards passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
