// Deliberate separate automated diagnostic. NOT ConPTY or console equivalence.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),{randomBytes}=require('node:crypto');
const {verifyArchive}=require('./startup-browser-identity');
function accepted(result,mode,nonce){return !result.error&&result.status===0&&result.signal===null&&result.stderr===''&&result.stdout===`EP_OWNED_PIPE_NONCE=${nonce}\nEP_OWNED_PIPE_MODE=${mode}\nEP_OWNED_PIPE_RESULT=pass\n`;}
async function panel(){
 if(process.argv.length!==2||process.platform!=='win32'||process.arch!=='x64'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw Error('host');
 const python=process.env.EP_FIXTURE_PYTHON;if(!python||!path.isAbsolute(python)||!fs.statSync(python).isFile())throw Error('python');
 const build=path.resolve(__dirname,'../build/windows-x64');
 const identity=await verifyArchive(path.join(build,'browser.tar.gz'),JSON.parse(fs.readFileSync(path.join(build,'manifest.json'),'utf8')));
 for(const mode of ['source','sea']){
  const nonce=randomBytes(32).toString('hex');
  const result=spawnSync(python,[path.join(__dirname,'windows-startup-leg-helper.py'),process.execPath,mode,nonce,String(identity.length),identity.sha256,identity.browserVersion],{encoding:'utf8',timeout:145000,maxBuffer:4096,windowsHide:true});
  if(!accepted(result,mode,nonce))throw Error('uncertain');
  console.log('EP_OWNED_PIPE_LEG='+mode+':pass');
 }
 console.log('EP_OWNED_PIPE_PANEL=not-reproduced-in-one-instrumented-pipe-sample');
}
module.exports={accepted,panel};if(require.main===module)panel().catch(()=>{console.log('EP_OWNED_PIPE_PANEL=uncertain');process.exitCode=1;});
