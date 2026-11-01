// Zero-browser fixed child. Public stage markers only; no filesystem/account inputs.
if(process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows'||process.env.RUNNER_ENVIRONMENT!=='github-hosted'||process.argv.length!==2)throw Error('Probe host guard');
// Fixed public nonce, not authentication. Matches the private parent invocation.
const nonce='a'.repeat(64),mode='source';
for(const stage of ['cli-entry','cli-root-checked','host-checked','leg-root-checked','archive-check-entered'])console.log('EP_DIAGNOSTIC_DRIVER_STAGE='+JSON.stringify({nonce,mode,stage}));
console.log('EP_STAGE_PROBE_DONE');
