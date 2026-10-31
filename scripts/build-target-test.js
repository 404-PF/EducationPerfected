const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function probe(file,platform,arch,glibc=true) {
 let selected;
 const source=fs.readFileSync(path.resolve(__dirname,'../packaging',file),'utf8');
 vm.runInNewContext(source,{process:{platform,arch,report:{getReport:()=>({header:{glibcVersionRuntime:glibc?'2.35':undefined}})}},require:id=>{assert.equal(id,'./build-development');return {buildDevelopment:target=>{selected=target;return Promise.resolve();}};},console});
 return selected;
}
for(const arch of ['x64','arm64']) {
 const target=probe('build-linux.js','linux',arch);assert.equal(target.directory,'linux-'+arch);assert.equal(target.nativePackage,'@napi-rs/keyring-linux-'+arch+'-gnu');
}
assert.equal(probe('build-windows.js','win32','x64').executable,'educationperfected.exe');
for(const arch of ['ia32','arm64'])assert.throws(()=>probe('build-windows.js','win32',arch));
for(const arch of ['ia32','arm','riscv64'])assert.throws(()=>probe('build-linux.js','linux',arch));
assert.throws(()=>probe('build-linux.js','linux','x64',false));
assert.throws(()=>probe('build-windows.js','linux','x64'));
console.log('Native builder wrappers select supported targets and reject unsupported targets/libc (fixed-source VM).');
