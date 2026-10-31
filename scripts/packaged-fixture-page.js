// A browser endpoint is process availability, not application readiness.
const assert = require('node:assert/strict');
function loginReady(text) {
 return /^EP_TEST_LOGIN_READY\r?$/m.test(text) && /EP_WS_ENDPOINT=(\S+)/.test(text);
}
async function selectLoginPage(browser, loginUrl) {
 const target=await browser.waitForTarget(target=>target.type()==='page' && target.url()===loginUrl,{timeout:20000});
 const page=await target.page();
 assert.ok(page && !page.isClosed(),'Fixture login target must have an open Page');
 // Do not retry a Page which Puppeteer returned after failed initialization.
 assert.ok(page.mainFrame(),'Fixture login Page must have an initialized main frame');
 assert.equal(page.url(),loginUrl,'Fixture must control the owner-ready login target');
 return page;
}
async function disconnectController(browser) {
 if(browser) await browser.disconnect(); // Borrowed connection, never Browser.close().
}
module.exports={loginReady,selectLoginPage,disconnectController};
