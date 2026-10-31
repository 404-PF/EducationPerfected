const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
function probe(file,platform,arch,glibc=true) {
 let selected;
 const source=fs.readFileSync(path.resolve(__dirname,'../packaging',file),'utf8');
 // Runs only a fixed sibling repository wrapper in an inert target-selection context.
 vm.runInNewContext(source,{process:{platform,arch,report:{getReport:()=>({header:{glibcVersionRuntime:glibc?'2.35':undefined}})}},require:id=>{assert.equal(id,'./build-development');return {buildDevelopment:target=>{selected=target;return Promise.resolve();}};},console}); // NOSONAR: fixed repository source; no external code or user-controlled input.
 return selected;
}
for(const arch of ['x64','arm64']) {
 const target=probe('build-linux.js','linux',arch);assert.ok(target);assert.equal(target.directory,'linux-'+arch);assert.equal(target.nativePackage,'@napi-rs/keyring-linux-'+arch+'-gnu');
}
const windows=probe('build-windows.js','win32','x64');assert.ok(windows);assert.equal(windows.executable,'educationperfected.exe');
for(const arch of ['ia32','arm64'])assert.throws(()=>probe('build-windows.js','win32',arch),/Development builder requires Windows x64/);
for(const arch of ['ia32','arm','riscv64'])assert.throws(()=>probe('build-linux.js','linux',arch),/Development builder requires glibc Linux x64 or arm64/);
assert.throws(()=>probe('build-linux.js','linux','x64',false),/Development builder requires glibc Linux x64 or arm64/);
assert.throws(()=>probe('build-windows.js','linux','x64'),/Development builder requires Windows x64/);
console.log('Native builder wrappers select supported targets and reject unsupported targets/libc (fixed-source VM).');
