// Inert VM execution of the actual helper source. All IO/native imports mocked.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const source=fs.readFileSync(require('node:path').join(__dirname,'run-product.js'),'utf8');
const stages=['product.admission','product.artifact','product.store.empty','product.store.seed','product.server','product.spawn','product.observe','product.quit','product.group','product.store.remove','product.cleanup'];
async function test(target,operationFailure=false){
 const lines=[],calls=[];let injected=false,saved=null,child;
 const context={__dirname:'/inert/scripts/normal-read-fixture',Buffer,Date,Promise,Object,Error,console:{log(text){lines.push(text);if(!operationFailure&&text==='EP_NORMAL_READ_STAGE='+target&&!injected){injected=true;throw Error('PRIVATE_SENTINEL');}}},setTimeout(fn,ms){if(ms!==90000)setImmediate(fn);return 1;},clearTimeout(){},process:{argv:['node','fixed'],stdin:{isTTY:false},platform:'linux',arch:'x64',env:{HOME:'/inert'},kill(){const e=Error();e.code='ESRCH';throw e;}},require(name){
  if(name==='node:fs')return {readFileSync(p){calls.push('file');return p.endsWith('PRIVATE-FIXTURE.json')?JSON.stringify({kind:'MODIFIED-VALIDATION-ONLY-NOT-RELEASE',sha256:crypto.createHash('sha256').update('').digest('hex')}):Buffer.from('');}};
  if(name==='../../lib/credential-store')return {createCredentialStore(){calls.push('store.create');return {async read(){calls.push('store.read');if(operationFailure&&target==='product.store.empty'){injected=true;throw Error('PRIVATE_SENTINEL');}return saved;},async save(x){calls.push('store.save');saved=x;},async remove(){calls.push('store.remove');saved=null;}};}};
  if(name==='./server')return {createVerifier(){return {async listen(){calls.push('server.listen');},async close(){calls.push('server.close');if(operationFailure){if(target==='product.cleanup')injected=true;throw Error('PRIVATE_CLEANUP');}},observation(){return {matched:true,attempts:1};}};}};
  if(name==='node:child_process')return {spawn(){calls.push('spawn');child=new EventEmitter();child.pid=123;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin={end(text){assert.equal(text,'quit\n');calls.push('quit');child.emit('close',0,null);}};setImmediate(()=>child.stdout.emit('data',Buffer.from('Auto-login credentials loaded from the OS credential store. Commands: start')));return child;}};
  if(['node:path','node:http','node:crypto'].includes(name))return require(name);
  throw Error('Unexpected import');
 }};
 await vm.runInNewContext(source,context,{timeout:1000});
 if(target){assert(injected,target);assert.equal(context.process.exitCode,1);assert(lines.includes('EP_NORMAL_READ_FAILURE='+target),target+' '+lines.join('|'));assert(!lines.includes('EP_NORMAL_READ_RESULT=pass'));}
 else{assert(lines.includes('EP_NORMAL_READ_RESULT=pass'));assert(calls.includes('store.remove'));}
 assert(!lines.some(x=>x.includes('PRIVATE_SENTINEL')||x.includes('/inert')));
 if(stages.indexOf(target)>=0&&stages.indexOf(target)<=stages.indexOf('product.spawn'))assert(!calls.includes('spawn'));
}
(async()=>{await test();for(const stage of stages)await test(stage);await test('product.store.empty',true);await test('product.cleanup',true);console.log('Actual helper VM: complete synthetic stub path and all 11 stage failure injections passed. No native IO.');})().catch(e=>{console.error(e);process.exitCode=1;});
