const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { browserIsInOwnedExtraction, browserOriginEvidence } = require('./packaged-browser-origin');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-browser-origin-'));
try {
 const isolated = path.join(root, 'isolated'), outside = path.join(root, 'host-cache');
 fs.mkdirSync(isolated); fs.mkdirSync(outside);
 const extraction = path.join(isolated, 'educationperfected-owned'); fs.mkdirSync(extraction);
 const browser = path.join(extraction, 'chrome'); fs.writeFileSync(browser, 'synthetic');
 const host = path.join(outside, 'chrome'); fs.writeFileSync(host, 'synthetic');
 assert.equal(browserIsInOwnedExtraction(isolated, browser), true);
 assert.deepEqual(browserOriginEvidence(isolated, browser), { argvAbsolute:true, rawContained:true, canonicalContained:true, ownedComponent:true, isFile:true, missingFile:false, identityUnavailable:false });
 const missing = browserOriginEvidence(isolated, path.join(extraction, 'absent'));
 assert.equal(missing.missingFile, true); assert.equal(missing.identityUnavailable, true);
 assert.equal(browserOriginEvidence(isolated, 'relative').argvAbsolute, false);
 const serialized = JSON.stringify(browserOriginEvidence(isolated, browser));
 assert.equal(serialized.includes(root), false);
 assert.ok(Object.values(browserOriginEvidence(isolated, browser)).every(value => typeof value === 'boolean'));
 assert.equal(browserIsInOwnedExtraction(isolated, host), false);
 assert.equal(browserIsInOwnedExtraction(isolated, isolated), false);
 assert.equal(browserIsInOwnedExtraction(isolated, 'relative/chrome'), false);
 assert.equal(browserIsInOwnedExtraction(isolated, path.join(extraction, 'missing')), false);
 fs.writeFileSync(path.join(isolated, 'not-an-extraction'), 'synthetic');
 assert.equal(browserIsInOwnedExtraction(isolated, path.join(isolated, 'not-an-extraction')), false);
 // Windows symlink creation may require extra host privilege, never pretend SKIP is proof.
 if (process.platform !== 'win32') {
  const alias = path.join(root, 'temporary-alias'); fs.symlinkSync(isolated, alias);
  const aliasEvidence = browserOriginEvidence(alias, browser);
  assert.equal(aliasEvidence.rawContained, false); assert.equal(aliasEvidence.canonicalContained, true);
  assert.equal(aliasEvidence.ownedComponent, true); assert.equal(aliasEvidence.isFile, true);
  assert.equal(browserIsInOwnedExtraction(alias, browser), true, 'Canonical browser and alias temp root must match');
  assert.equal(browserIsInOwnedExtraction(isolated, path.join(alias, 'educationperfected-owned', 'chrome')), true);
  fs.symlinkSync(host, path.join(extraction, 'escape'));
  assert.equal(browserIsInOwnedExtraction(isolated, path.join(extraction, 'escape')), false, 'Escaping symlink must not count as embedded');
  assert.equal(browserIsInOwnedExtraction(alias, host), false);
 }
 console.log('Packaged browser origin: canonical extraction containment and host-cache/escape rejection passed (synthetic paths).');
} finally { fs.rmSync(root, {recursive:true, force:true}); }
