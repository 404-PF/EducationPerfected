// Exact new transport control only. No product/browser/store/network/filesystem API.
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
if(process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.argv.length!==3||!['pass','nonzero'].includes(process.argv[2]))throw Error('Capability host');
assert.equal(Boolean(process.stdin.isTTY),false);assert.equal(Boolean(process.stdout.isTTY),false);
const mode='source',nonce='a'.repeat(64),identity={length:123,sha256:'b'.repeat(64),browserVersion:'156.0.8078.47',hashVerified:true,extractionOwned:true,headlessMode:'test-shell-full-browser',executableSource:'owned-extraction-of-pinned-archive'};
// Fixed descendant inherits the owned job and output handle, writes nothing.
// Parent exits without waiting; transport must still wait for jobzero and EOF.
const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),500)'],{stdio:['ignore','inherit','inherit'],windowsHide:true});child.once('error',()=>{process.exitCode=1;});
child.once('spawn',()=>{child.unref();
const stages=['cli-entry','host-checked','leg-root-checked','archive-check-entered','archive-verified','unpack-entered','unpacked','spawn-entered','spawn-returned','ready-observed','owner-closed','leg-complete'];
for(const stage of stages)console.log('EP_DIAGNOSTIC_DRIVER_STAGE='+JSON.stringify({nonce,mode,stage}));
console.log('EP_OWNED_PIPE_SUCCESS='+JSON.stringify({nonce,mode,identity,ready:true,owned:true,cleanupCertain:true}));
process.exitCode=process.argv[2]==='pass'?0:7;

});
