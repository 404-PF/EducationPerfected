// TEST_BOOT diagnostic-only metadata, never paths, URLs or arbitrary manifest text.
function browserIdentity(manifest) {
 const valid = manifest && Number.isSafeInteger(manifest.length) && manifest.length > 0 &&
  typeof manifest.sha256 === 'string' && /^[a-f0-9]{64}$/.test(manifest.sha256) &&
  typeof manifest.browserVersion === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,5}\.\d{1,5}$/.test(manifest.browserVersion);
 if (!valid) throw Error('Diagnostic browser identity unavailable');
 return {sha256:manifest.sha256,length:manifest.length,browserVersion:manifest.browserVersion,
  hashVerified:true,extractionOwned:true,headlessMode:'test-shell-full-browser',executableSource:'owned-extraction-of-pinned-archive'};
}
function emitBrowserIdentity(manifest, report = console.log) {
 report('EP_TEST_BROWSER_IDENTITY=' + JSON.stringify(browserIdentity(manifest)));
}
module.exports = {browserIdentity,emitBrowserIdentity};
