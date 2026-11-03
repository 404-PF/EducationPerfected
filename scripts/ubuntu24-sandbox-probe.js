// One sandbox-enabled about:blank probe on a disposable hosted Ubuntu24 runner.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
async function probe() {
 if(process.platform!=='linux'||!['x64','arm64'].includes(process.arch)||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.getuid()===0)throw Error('Requires non-root disposable hosted Linux runner');
 if(process.argv.length>2)throw Error('No probe arguments accepted');
 const release=fs.readFileSync('/etc/os-release','utf8');
 assert.match(release,/^ID=ubuntu$/m);assert.match(release,/^VERSION_ID="24\.04"$/m);
 const setting=file=>fs.existsSync(file)?fs.readFileSync(file,'utf8').trim():'unavailable';
 const policy={arch:process.arch,apparmorEnabled:setting('/sys/module/apparmor/parameters/enabled'),restrictedUserns:setting('/proc/sys/kernel/apparmor_restrict_unprivileged_userns'),restrictedUnconfined:setting('/proc/sys/kernel/apparmor_restrict_unprivileged_unconfined')};
 console.log('Ubuntu24 sandbox baseline: '+JSON.stringify(policy));
 if(policy.apparmorEnabled!=='Y'||policy.restrictedUserns!=='1')throw Error('Baseline policy does not represent restricted Ubuntu24; no compatibility claim');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-ubuntu24-sandbox-'));
 let browser,primary,cleanupFailure;
 try {
  // No executable override, sandbox bypass, profile/sysctl/SUID mutation or remote URL.
  if(process.env.PUPPETEER_EXECUTABLE_PATH)throw Error('Custom browser override not accepted');
  const puppeteer=require('puppeteer');
  browser=await puppeteer.launch({headless:true,timeout:15000,userDataDir:path.join(root,'profile')});
  const processHandle=browser.process();
  assert.ok(processHandle,'Browser process handle required for cleanup ownership');
  const processArgs=processHandle.spawnargs;
  assert.ok(!processArgs.includes('--no-sandbox')&&!processArgs.includes('--disable-setuid-sandbox'));
  const page=await browser.newPage();await page.goto('about:blank',{timeout:5000});
  assert.equal(page.url(),'about:blank');
  console.log('Pinned installed browser sandbox-enabled about:blank passed on restricted hosted Ubuntu24. Not SEA extraction, desktop baseline, clean-machine or release proof.');
 } catch(error) {
  primary=error;
  const text=String(error?.message||'');
  console.error('Ubuntu24 fixed failure class: '+(/No usable sandbox|Failed to move to new namespace|Operation not permitted|SUID sandbox/i.test(text)?'sandbox-denied':/timed out|timeout/i.test(text)?'bounded-timeout':'other-no-raw-error-output'));
 } finally {
  if(browser){try{await browser.close();}catch{cleanupFailure=Error('Browser cleanup failed');}}
  // A rejected launch returns no process handle: don't assert cleanup/exit ownership.
  if(!browser)cleanupFailure=Error('Launch exit unconfirmed; owned profile retained for disposable VM teardown');
  const handle=browser?.process();
  if(browser && (!handle || handle.exitCode===null))cleanupFailure=Error('Browser exit unconfirmed; owned profile retained');
  if(!cleanupFailure)try{fs.rmSync(root,{recursive:true,force:true});}catch{cleanupFailure=Error('Owned probe cleanup failed');}
 }
 if(cleanupFailure)console.error(cleanupFailure.message);
 if(primary)throw Error('Ubuntu24 bounded sandbox probe failed; see fixed failure class');
 if(cleanupFailure)throw cleanupFailure;
}
probe().catch(error=>{console.error(error.message);process.exitCode=1;});
