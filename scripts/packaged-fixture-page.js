// Local fixture observer policy. Endpoint availability is not owner readiness.
const assert = require('node:assert/strict');
const {waitForPackagedCheckpoint} = require('./packaged-checkpoint');
function loginReady(text) {
 return /^EP_TEST_LOGIN_READY\r?$/m.test(text) && /^EP_WS_ENDPOINT=(\S+)\r?$/m.test(text);
}
function requireLocalLogin(loginUrl) {
 const url = new URL(loginUrl);
 assert.equal(url.protocol, 'http:', 'Fixture target must be local HTTP');
 assert.equal(url.hostname, '127.0.0.1', 'Fixture target must be exact local loopback');
 assert.equal(url.username + url.password + url.search + url.hash, '', 'Fixture URL must carry no private fields');
 assert.equal(url.pathname, '/app/login', 'Fixture target must be the fixed mock login route');
 assert.ok(url.port, 'Fixture target must have an explicit mock port');
}
async function connectAfterLoginReady({text, connect, child, failure, milliseconds = 45000, now, pause}) {
 await waitForPackagedCheckpoint(() => loginReady(text()), {
  child, failure, name:'owner-login-ready', milliseconds, now, pause,
 });
 const endpoint = text().match(/^EP_WS_ENDPOINT=(\S+)\r?$/m)[1];
 const url = new URL(endpoint);
 assert.equal(url.protocol, 'ws:'); assert.equal(url.hostname, '127.0.0.1');
 assert.ok(url.port); assert.equal(url.username + url.password + url.search + url.hash, '');
 assert.match(url.pathname, /^\/devtools\/browser\/[A-Za-z0-9-]+$/);
 return connect({browserWSEndpoint:endpoint});
}
async function selectLoginPage(browser, loginUrl) {
 requireLocalLogin(loginUrl);
 const target = await browser.waitForTarget(target => target.type() === 'page' && target.url() === loginUrl, {timeout:20000});
 const page = await target.page();
 assert.ok(page && !page.isClosed(), 'Fixture login target must have an open Page');
 assert.ok(page.mainFrame(), 'Fixture login Page must have an initialized main frame');
 assert.equal(page.url(), loginUrl, 'Fixture must control the owner-ready login target');
 return page;
}
async function disconnectController(browser) {
 if (browser) await browser.disconnect(); // Borrowed connection, never Browser.close().
}
module.exports = {loginReady,connectAfterLoginReady,selectLoginPage,disconnectController};
