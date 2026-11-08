function expectedPopupKeys(count, partialSecondDropdown = false) {
    const first = ['F4', 'ArrowDown', 'ArrowDown', 'Enter'].map(key => ({ id: 'dropdown-0', key, trusted: true }));
    if (partialSecondDropdown) return first.concat(['F4', 'ArrowDown'].map(key => ({ id: 'dropdown-1', key, trusted: true })));
    return Array.from({ length: count }, (_, index) => ['F4', 'ArrowDown', 'ArrowDown', 'Enter'].map(key => ({ id: 'dropdown-' + index, key, trusted: true }))).flat();
}

function expectedPopupChanges(count) {
    return Array.from({ length: count }, (_, index) => ({ id: 'dropdown-' + index, index: 2, trusted: false }));
}

async function installPopupEmulation(page, { commitDuringNavigation = false, closeOnArrow = false, closeOnArrowAt = null } = {}) {
    await page.evaluate((commit, close, closeAt) => {
        const selects = [...document.querySelectorAll('select')];
        const original = HTMLSelectElement.prototype.matches;
        let open = false;
        let provisional = 0;
        window.__restoreSelectMatches = () => { HTMLSelectElement.prototype.matches = original; };
        HTMLSelectElement.prototype.matches = function(selector) {
            if (selector === ':open') return open;
            return original.call(this, selector);
        };
        for (const select of selects) {
            select.addEventListener('keydown', event => {
                const index = selects.indexOf(select);
                if (event.key === 'F4') {
                    open = true;
                    provisional = select.selectedIndex;
                    event.preventDefault();
                } else if (open && event.key === 'ArrowDown') {
                    provisional = Math.min(select.options.length - 1, provisional + 1);
                    event.preventDefault();
                    if (commit) {
                        select.selectedIndex = provisional;
                        select.dispatchEvent(new Event('input', { bubbles: true }));
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    if (close || index === closeAt) open = false;
                } else if (open && event.key === 'Enter') {
                    open = false;
                    select.selectedIndex = provisional;
                    event.preventDefault();
                    select.dispatchEvent(new Event('input', { bubbles: true }));
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }, true);
        }
    }, commitDuringNavigation, closeOnArrow, closeOnArrowAt);
}

async function restorePopupEmulation(page) {
    await page.evaluate(() => window.__restoreSelectMatches?.());
}

module.exports = { expectedPopupChanges, expectedPopupKeys, installPopupEmulation, restorePopupEmulation };
