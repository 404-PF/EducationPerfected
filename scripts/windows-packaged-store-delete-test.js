// Disposable hosted Actions runner only. Synthetic SEA setup/read/delete, no browser/no-Node proof.
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawn } = require('node:child_process');
const { createWindowsBinding } = require('../lib/packaged-windows-binding');
const { boundedClose, stopChild } = require('./packaged-test-cleanup');
async function verifyPackagedDelete() {
 if (process.platform !== 'win32' || process.arch !== 'x64' || process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') throw Error('Requires disposable Windows x64 Actions runner');
 if (process.argv.length > 2) throw Error('No fixture arguments accepted');
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-sea-store-'));
 let binding, entry, child, closed, childClosed = true, created = false, primary, cleanupFailure;
 let setupCertain = true;
 const retained = 'Native operation still live; owned fixture retained without concurrent credential cleanup';
 try {
  const file = path.join(root, 'keyring.node');
  fs.copyFileSync(require.resolve('@napi-rs/keyring-win32-x64-msvc'), file);
  binding = createWindowsBinding(file);
  entry = new binding.AsyncEntry('EducationPerfected', 'login-v1');
  assert.equal(await entry.getPassword(), null, 'Disposable runner record must be absent before mutation');
  const value = JSON.stringify({version:1,email:['fixture','example.test'].join('@'),password:['synthetic','sea','delete'].join('-')});
  const home = path.join(root, 'home'), tmp = path.join(root, 'tmp'), empty = path.join(root, 'empty');
  for (const directory of [home,tmp,empty]) fs.mkdirSync(directory);
  const copy = path.join(root, 'educationperfected.exe');
  fs.copyFileSync(require('./packaged-fixture-target').packagedFixtureTarget().executable, copy);
  const env = {...process.env, HOME:home, USERPROFILE:home, TEMP:tmp, TMP:tmp, TMPDIR:tmp, PATH:empty};
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path' && key !== 'PATH') delete env[key];
  delete env.EP_EMAIL; delete env.EP_PASSWORD; delete env.NODE_OPTIONS;
  const python = process.env.EP_FIXTURE_PYTHON;
  assert.ok(python && path.isAbsolute(python) && fs.statSync(python).isFile(), 'Verified Python executable required');
  assert.equal(await entry.getPassword(), null, 'Fresh absence required immediately before setup attempt');
  assert.equal(binding.hasLiveWorkers(),false,'Source worker must be idle before setup launch');
  created = true; // Per fixed slot, before helper launch or any synthetic input.
  setupCertain = false;
  let setupOutput = '', helperError, timedOut = false, terminatedByUs = false;
  child = spawn(python, [path.join(__dirname,'windows-sea-setup-helper.py'),root], {env,cwd:home,stdio:['ignore','pipe','pipe']});
  childClosed = false;
  closed = new Promise(resolve => child.once('close', code => {childClosed=true;resolve(code);}));
  child.once('error', error => {helperError=error;});
  child.stdout.on('data', data => {if(setupOutput.length<4096)setupOutput+=data;else helperError=true;});
  child.stderr.on('data', () => {helperError=true;});
  let helperCode;
  try {helperCode = await boundedClose(closed, 60000, 'Packaged setup helper timed out');}
  catch (error) {timedOut=true;terminatedByUs=true;throw error;}
  const {setupReceipt,setupReceiptDiagnostic} = require('./windows-setup-receipt');
  console.log(setupReceiptDiagnostic(setupOutput,helperCode,{closed:childClosed,terminatedByUs,timedOut,helperError}));
  const receipt = setupReceipt(setupOutput,helperCode,{closed:childClosed,terminatedByUs,timedOut});
  setupCertain = receipt.certain && !helperError;
  assert.ok(setupCertain, 'Setup helper ownership certainty unconfirmed; retain owned record and root');
  assert.ok(receipt.success, 'Packaged setup helper reported a closed failure');
  assert.equal(await entry.getPassword(), value, 'Production SEA setup must persist the exact synthetic pair (independent source read)');
  console.log('Windows SEA setup: ordered hidden prompt input, closed helper receipt and independent exact synthetic pair passed.');
  for (const command of ['--check-credentials','--forget-credentials']) {
   console.log('Windows SEA credential checkpoint: '+(command === '--check-credentials' ? 'health-read' : 'delete'));
   let text = '', spawnError;
   child = spawn(copy, [command], {env,cwd:home,stdio:['ignore','pipe','pipe']});
   childClosed = false;
   closed = new Promise(resolve => child.once('close', code => {childClosed=true;resolve(code);}));
   child.once('error', error => {spawnError=error;});
   child.stdout.on('data', data => {text+=data;}); child.stderr.on('data', data => {text+=data;});
   let code;
   try {code = await boundedClose(closed, 30000, 'Packaged credential command timed out');}
   catch (error) {setupCertain=false;throw error;}
   assert.equal(spawnError, undefined, 'Packaged credential process must spawn');
   assert.equal(code, 0, 'Packaged credential command must exit successfully');
   const expected = command === '--check-credentials' ? 'Saved login is available and its record is valid.\n' : 'Saved login removed from the OS credential store.\n';
   assert.ok(text === expected, 'Packaged command must return only fixed status text');
   assert.equal(childClosed, true, 'Each packaged credential process must close before the next command');
   assert.equal(binding.hasLiveWorkers(), false, 'Source worker must be idle between packaged commands');
   assert.equal(fs.readdirSync(tmp).length, 0, 'Packaged credential command must remove its native extraction before fixture cleanup');
   if (command === '--check-credentials') assert.equal(await entry.getPassword(), value, 'Health read must leave the independently verified SEA-saved record unchanged');
  }
  assert.equal(await entry.getPassword(), null, 'Independent source worker must confirm packaged deletion');
  created = false;
  assert.equal(binding.hasLiveWorkers(), false);
  console.log('Windows SEA interactive setup saved a source-verified exact synthetic pair; fresh-process health read validated shape, then --forget-credentials deleted it; independent source read, process exit and owned extraction cleanup passed. Not SEA-returned exact-value, browser startup, physical console or no-Node proof.');
 } catch (error) {primary=error;}
 finally {
  try {await stopChild(child,closed);} catch {cleanupFailure=Error('Packaged child cleanup failed');}
  if (!setupCertain || !childClosed || binding?.hasLiveWorkers()) cleanupFailure=Error(retained);
  else if (created && entry) {
   try {await entry.deletePassword();assert.equal(await entry.getPassword(),null);created=false;}
   catch {cleanupFailure=Error('Synthetic packaged record cleanup failed');}
  }
  if (!setupCertain || created || !childClosed || binding?.hasLiveWorkers()) cleanupFailure ||= Error(retained);
  else {try {fs.rmSync(root,{recursive:true,force:true});} catch (error) {
   const code = ['EPERM','EACCES','EBUSY','ENOTEMPTY','ENOENT'].includes(error?.code) ? error.code : 'other';
   const target = typeof error?.path === 'string' ? path.relative(root,error.path) : null;
   const kind = target === 'keyring.node' ? 'source-binding' : target === 'educationperfected.exe' ? 'executable-copy' : target === '' ? 'owned-root' : target && !target.startsWith('..') && !path.isAbsolute(target) ? 'owned-child' : 'unknown';
   console.error('Packaged store fixture cleanup checkpoint: code='+code+'; target='+kind+'; childClosed='+childClosed+'; workersLive='+Boolean(binding?.hasLiveWorkers()));
   cleanupFailure ||= Error('Packaged store fixture file cleanup failed');
  }}
  if (cleanupFailure) console.error(cleanupFailure.message);
 }
 if (primary) throw primary;
 if (cleanupFailure) throw cleanupFailure;
}
module.exports={verifyPackagedDelete};
if(require.main===module)verifyPackagedDelete().catch(()=>{console.error('Windows SEA store deletion fixture failed; no record or native error contents printed.');process.exitCode=1;});
