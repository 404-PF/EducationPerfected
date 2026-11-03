// Execute the real inert proof and its mutation suite with both native path shapes.
// No Windows process, native store, browser, credentials or network are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const proof=fs.readFileSync(path.join(__dirname,'native-resolver-proof.js'),'utf8');
const suite=fs.readFileSync(path.join(__dirname,'native-resolver-proof-test.js'),'utf8');
const index=fs.readFileSync(path.join(__dirname,'../index.js'),'utf8');
async function probe(style,crlf,legacy) {
 const paths=path[style],directory=style==='win32'?'C:\\fixture\\scripts':'/fixture/scripts';
 const target=paths.join(directory,'../index.js');let reads=0;
 const fakeFs={readFileSync(file){assert.equal(file,target);reads++;return crlf?index.replace(/\r?\n/g,'\r\n'):index;}};
 const module={exports:{}},output=[],process={exitCode:0};
 const requireFake=id=>{
  if(id==='node:fs')return fakeFs;
  if(id==='node:path')return paths;
  if(id==='node:assert/strict'||id==='node:vm')return require(id);
  throw Error('Unexpected fixed-proof dependency');
 };
 vm.runInNewContext(proof,{require:requireFake,module,__dirname:directory},{timeout:1000}); // NOSONAR: fixed repository proof source above, no user/env/network source; allowlisted builtins and fake fs only.
 const changed=legacy?suite.replace('file !== indexPath',"!String(file).endsWith('/index.js')"):suite;
 vm.runInNewContext(changed,{require:id=>id==='./native-resolver-proof'?module.exports:requireFake(id),__dirname:directory,console:{log:x=>output.push(x),error:x=>output.push(x)},process},{timeout:1000}); // NOSONAR: fixed repository mutation suite with one constant old-suffix substitution; inert fake fs/process and allowlisted dependencies, no external code.
 for(let turn=0;turn<20;turn++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(reads>0);
 assert.equal(process.exitCode,legacy&&style==='win32'?1:0,output.join('\n'));
 if(legacy&&style==='win32')assert.deepEqual(output,['Resolver bridge inert controls failed.']);
 else assert.ok(output.some(line=>line.includes('exact-block bridge:')));
}
(async()=>{
 for(const style of ['posix','win32'])for(const crlf of [false,true])await probe(style,crlf,false);
 for(const crlf of [false,true])await probe('win32',crlf,true);
 console.log('Resolver actual proof+mutation suite under POSIX/Win32 paths and LF/CRLF: corrected PASS, restored slash-suffix Windows RED. Inert path semantics only, not actual Windows/native proof.');
})().catch(error=>{console.error(error);process.exitCode=1;});
