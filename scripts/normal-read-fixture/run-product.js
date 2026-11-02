// Fixed runner authority. No CLI args, controller, env pair, prompt or caller observer.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'build/linux-x64-normal-read-fixture-private');
const {createCredentialStore}=require('../../lib/credential-store');
function requireTrue(x){if(!x)throw Error('Fixture failed');}
async function main(){
 requireTrue(process.argv.length===2&&!process.stdin.isTTY&&process.platform==='linux'&&process.arch==='x64');
 for(const key of ['EP_TEST_BOOT','EP_EMAIL','EP_PASSWORD','EP_LOGIN_URL','EP_LOGIN_HOST','NODE_OPTIONS','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','SSH_AUTH_SOCK'])requireTrue(!Object.hasOwn(process.env,key));
 const m=JSON.parse(fs.readFileSync(path.join(out,'PRIVATE-FIXTURE.json'),'utf8')),exe=path.join(out,'educationperfected');
 requireTrue(m.kind==='MODIFIED-VALIDATION-ONLY-NOT-RELEASE'&&crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex')===m.sha256);
 const expected={email:crypto.randomBytes(16).toString('hex')+'@example.test',password:crypto.randomBytes(32).toString('hex')};
 const store=createCredentialStore();let child,closed,server,passed=false,text='',attempts=0,matched=false,exit;
 const deadline=setTimeout(()=>{if(child&&!exit)try{process.kill(-child.pid,'SIGKILL');}catch{}},90000);
 try{
  requireTrue(await store.read()===null);await store.save(expected);const seed=await store.read();requireTrue(seed.email===expected.email&&seed.password===expected.password);
  const verifier=require('./server').createVerifier(expected);
  await verifier.listen();server={close:verifier.close};
  child=spawn(exe,[],{env:{...process.env},cwd:process.env.HOME,stdio:['pipe','pipe','pipe'],detached:true});
  closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>{exit={code,signal};resolve(exit);});});
  const capture=b=>{text+=b.toString();if(Buffer.byteLength(text)>65536){text='';try{process.kill(-child.pid,'SIGKILL');}catch{}}};child.stdout.on('data',capture);child.stderr.on('data',capture);
  const start=Date.now();while(!(verifier.observation().matched&&verifier.observation().attempts===1&&text.includes('Auto-login credentials loaded from the OS credential store.')&&text.includes('Commands: start'))){requireTrue(!exit&&Date.now()-start<80000);await new Promise(r=>setTimeout(r,50));}
  // This is the ONLY write to product input. Never send credentials or click via controller.
  child.stdin.end('quit\n');await closed;requireTrue(exit.code===0&&exit.signal===null&&verifier.observation().matched&&verifier.observation().attempts===1);
  try{process.kill(-child.pid,0);throw Error('Live process group');}catch(e){requireTrue(e.code==='ESRCH');}
  await store.remove();requireTrue(await store.read()===null);passed=true;
 }finally{
  clearTimeout(deadline);
  if(child&&!exit){try{process.kill(-child.pid,'SIGKILL');}catch{}if(closed)await Promise.race([closed,new Promise(r=>setTimeout(r,5000))]);}
  if(server)await server.close();expected.email='';expected.password='';text='';
 }
 requireTrue(passed);console.log('EP_NORMAL_READ_RESULT=pass');
}
main().catch(()=>{console.log('EP_NORMAL_READ_RESULT=fail');process.exitCode=1;});
