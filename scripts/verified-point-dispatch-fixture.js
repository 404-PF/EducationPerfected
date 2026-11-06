// Test instrumentation: distinguish a verified point dispatch from an
// ElementHandle.click on the production submit-target getProperty/asElement path.
// This is path-specific instrumentation, not interception of all Puppeteer handles.
function guardVerifiedPointDispatch(page) {
    let recomputedClicks = 0, pointClicks = 0, targetPaths = 0;
    const guardedPage = new Proxy(page, { get(target, key) {
        if (key === 'mouse') return { click: async (...args) => { pointClicks++; return target.mouse.click(...args); } };
        if (key !== 'evaluateHandle') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
        return async (...args) => {
            const handle = await target.evaluateHandle(...args);
            if (args[2] !== 'submit') return handle;
            const getProperty = handle.getProperty.bind(handle);
            handle.getProperty = async name => {
                const button = await getProperty(name), asElement = button.asElement.bind(button);
                button.asElement = () => { targetPaths++; const element = asElement(); element.click = async () => { recomputedClicks++; throw new Error('Must dispatch verified point'); }; return element; };
                return button;
            };
            return handle;
        };
    } });
    return { page: guardedPage, counts: () => [pointClicks, recomputedClicks], targetPaths: () => targetPaths };
}
module.exports = { guardVerifiedPointDispatch };
