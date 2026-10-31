const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../packaging/build-macos.js'),'utf8');
function probe(platform,arch){
 let target;
 vm.runInNewContext(source,{process:{platform,arch},require:id=>{assert.equal(id,'./build-development');return {buildDevelopment:value=>{target=value;return Promise.resolve();}};},console}); // NOSONAR: fixed repository wrapper and inert target selector only.
 return target;
}
for(const arch of ['arm64','x64']){const target=probe('darwin',arch);assert.equal(target.directory,'macos-'+arch);assert.equal(target.nativePackage,'@napi-rs/keyring-darwin-'+arch);assert.equal(target.macosLayout,true);assert.equal(target.executable,'educationperfected');}
for(const [platform,arch]of [['linux','x64'],['win32','x64'],['darwin','ia32'],['darwin','arm']])assert.throws(()=>probe(platform,arch),/requires macOS arm64 or x64/);
console.log('macOS wrapper fixed native architecture selection and unsupported-host guards passed (inert only).');
