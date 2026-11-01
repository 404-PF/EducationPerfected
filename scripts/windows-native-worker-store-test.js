// Synthetic record only, on a disposable Windows Actions runner. Not SEA proof.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { createWindowsBinding } = require('../lib/packaged-windows-binding');
async function verifyWorkerStore() {
 if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows') throw new Error('Requires disposable Windows x64 Actions runner');
 if (process.argv.length > 2) throw new Error('No fixture arguments accepted');
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-worker-store-'));
 const file = path.join(root, 'keyring.node');
 let binding, entry, created = false, primary, cleanupFailure;
 try {
  fs.copyFileSync(require.resolve('@napi-rs/keyring-win32-x64-msvc'), file);
  binding = createWindowsBinding(file);
  entry = new binding.AsyncEntry('EducationPerfected', 'login-v1');
  // Do not overwrite even a synthetic record left by unrelated work.
  assert.equal(await entry.getPassword(), null, 'Disposable runner record must be absent before mutation');
  const fixture = JSON.stringify({version:1, email:['fixture','example.test'].join('@'), password:['synthetic','worker','only'].join('-')});
  created = true; // Save can fail after the native write; cleanup must still run.
  await entry.setPassword(fixture);
  assert.equal(await entry.getPassword(), fixture, 'Worker read must return exact saved synthetic record');
  assert.equal(await entry.deletePassword(), true);
  assert.equal(await entry.getPassword(), null, 'Worker deletion must persist');
  created = false;
  assert.equal(binding.hasLiveWorkers(), false, 'Success requires worker exits, not just replies');
  fs.unlinkSync(file); // Actual Windows DLL unlock proof after credential operations.
  assert.equal(fs.existsSync(file), false);
  console.log('Windows real native worker synthetic save/read/delete, worker exit and DLL deletion passed (source adapter, not SEA).');
 } catch (error) { primary = error; }
 finally {
  // A timed-out operation can reject before native worker exit. Never race it
  // with another credential operation or delete a DLL that may still be loaded.
  const live = binding?.hasLiveWorkers();
  if (live) cleanupFailure = new Error('Native worker still live; owned fixture retained without concurrent credential cleanup');
  if (!live && created && entry) {
   try { await entry.deletePassword(); assert.equal(await entry.getPassword(), null); }
   catch { cleanupFailure = new Error('Synthetic worker record cleanup failed'); }
  }
  // Cleanup itself can time out and leave a worker live after the first check.
  const liveBeforeRemoval = binding?.hasLiveWorkers();
  if (liveBeforeRemoval) cleanupFailure = new Error('Native worker still live; owned fixture retained without concurrent credential cleanup');
  try { if (!liveBeforeRemoval) fs.rmSync(root, {recursive:true, force:true}); }
  catch { cleanupFailure ||= new Error('Native worker fixture file cleanup failed'); }
  if (cleanupFailure) console.error(cleanupFailure.message);
 }
 if (primary) throw primary;
 if (cleanupFailure) throw cleanupFailure;
}
module.exports = { verifyWorkerStore };
if (require.main === module) verifyWorkerStore().catch(() => { console.error('Windows native worker store fixture failed; no record or native error contents printed.'); process.exitCode = 1; });
