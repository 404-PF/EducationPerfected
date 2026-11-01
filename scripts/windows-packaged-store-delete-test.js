// Disposable Actions runner only. SEA deletion proof, not browser/setup/no-Node proof.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const { createWindowsBinding } = require('../lib/packaged-windows-binding');
const { boundedClose, stopChild } = require('./packaged-test-cleanup');
async function verifyPackagedDelete() {
 if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows') throw Error('Requires disposable Windows x64 Actions runner');
 if (process.argv.length > 2) throw Error('No fixture arguments accepted');
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sea-store-'));
 let binding, entry, child, closed, childClosed = true, created = false, primary, cleanupFailure;
 const retained = 'Native operation still live; owned fixture retained without concurrent credential cleanup';
 try {
  const file = path.join(root, 'keyring.node');
  fs.copyFileSync(require.resolve('@napi-rs/keyring-win32-x64-msvc'), file);
  binding = createWindowsBinding(file);
  entry = new binding.AsyncEntry('EducationPerfected', 'login-v1');
  assert.equal(await entry.getPassword(), null, 'Disposable runner record must be absent before mutation');
  const value = JSON.stringify({version:1,email:['fixture','example.test'].join('@'),password:['synthetic','sea','delete'].join('-')});
  created = true;
  await entry.setPassword(value);
  assert.equal(await entry.getPassword(), value, 'Source preparation must persist the exact synthetic record');
  const home = path.join(root, 'home'), tmp = path.join(root, 'tmp'), empty = path.join(root, 'empty');
  for (const directory of [home,tmp,empty]) fs.mkdirSync(directory);
  const copy = path.join(root, 'educationperfected.exe');
  fs.copyFileSync(require('./packaged-fixture-target').packagedFixtureTarget().executable, copy);
  const env = {...process.env, HOME:home, USERPROFILE:home, TEMP:tmp, TMP:tmp, TMPDIR:tmp, PATH:empty};
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' && key !== 'PATH') delete env[key];
  delete env.EP_EMAIL; delete env.EP_PASSWORD; delete env.NODE_OPTIONS;
  let text = '', spawnError;
  child = spawn(copy, ['--forget-credentials'], {env,cwd:home,stdio:['ignore','pipe','pipe']});
  childClosed = false;
  closed = new Promise(resolve => child.once('close', code => {childClosed=true;resolve(code);}));
  child.once('error', error => {spawnError=error;});
  child.stdout.on('data', data => {text+=data;}); child.stderr.on('data', data => {text+=data;});
  const code = await boundedClose(closed, 30000, 'Packaged credential deletion timed out');
  assert.equal(spawnError, undefined, 'Packaged credential process must spawn');
  assert.equal(code, 0, 'Packaged credential deletion must exit successfully');
  assert.ok(text.includes('Saved login removed from the OS credential store.'), 'Packaged command must report an existing record deleted');
  assert.ok(!text.includes(value) && !text.includes('synthetic-sea-delete') && !text.includes('fixture@example.test'), 'Synthetic record must never be printed');
  assert.equal(fs.readdirSync(tmp).length, 0, 'Packaged deletion must remove its native extraction before fixture cleanup');
  assert.equal(await entry.getPassword(), null, 'Independent source worker must confirm packaged deletion');
  created = false;
  assert.equal(binding.hasLiveWorkers(), false);
  console.log('Windows SEA --forget-credentials deleted a source-prepared synthetic record; independent source read, process exit and owned extraction cleanup passed. Not packaged setup/read, browser startup, console or no-Node proof.');
 } catch (error) {primary=error;}
 finally {
  try {await stopChild(child,closed);} catch {cleanupFailure=Error('Packaged child cleanup failed');}
  if (!childClosed || binding?.hasLiveWorkers()) cleanupFailure=Error(retained);
  else if (created && entry) {
   try {await entry.deletePassword();assert.equal(await entry.getPassword(),null);}
   catch {cleanupFailure=Error('Synthetic packaged record cleanup failed');}
  }
  if (!childClosed || binding?.hasLiveWorkers()) cleanupFailure=Error(retained);
  else {try {fs.rmSync(root,{recursive:true,force:true});} catch {cleanupFailure ||= Error('Packaged store fixture file cleanup failed');}}
  if (cleanupFailure) console.error(cleanupFailure.message);
 }
 if (primary) throw primary;
 if (cleanupFailure) throw cleanupFailure;
}
module.exports={verifyPackagedDelete};
if(require.main===module)verifyPackagedDelete().catch(()=>{console.error('Windows SEA store deletion fixture failed; no record or native error contents printed.');process.exitCode=1;});
