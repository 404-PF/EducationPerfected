// Test instrumentation: distinguish a verified point dispatch from an
// ElementHandle.click that could recompute a different target after inspection.
function guardVerifiedPointDispatch(page) {
    let recomputedClicks = 0, pointClicks = 0;
    const guardedPage = new Proxy(page, { get(target, key) {
        if (key === 'mouse') return { click: async (...args) => { pointClicks++; return target.mouse.click(...args); } };
        if (key !== 'evaluateHandle') { const value = target[key]; return typeof value === 'function' ? value.bind(target) : value; }
        return async (...args) => {
            const handle = await target.evaluateHandle(...args);
            if (args[2] !== 'submit') return handle;
            const getProperty = handle.getProperty.bind(handle);
            handle.getProperty = async name => {
                const button = await getProperty(name), asElement = button.asElement.bind(button);
                button.asElement = () => { const element = asElement(); element.click = async () => { recomputedClicks++; throw new Error('Must dispatch verified point'); }; return element; };
                return button;
            };
            return handle;
        };
    } });
    return { page: guardedPage, counts: () => [pointClicks, recomputedClicks] };
}
module.exports = { guardVerifiedPointDispatch };
