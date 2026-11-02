// Inert target/build orchestration contracts. No esbuild/SEA/native load.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{target}=require('./target');
const source=fs.readFileSync(path.join(__dirname,'build-sea-private.js'),'utf8');
async function builder(arch){
 let options,manifest;const t=target('linux',arch),roots=[];
 class Mod{constructor(){} _compile(text){assert(text.includes("name:'private-fixture-endpoint'"));this.exports={async buildDevelopment(o){options=o;}};}}
 const context={__dirname:'/inert/scripts/normal-read-fixture',module:{paths:[]},process:{argv:['node','fixed'],platform:'linux',arch,version:'v22.23.4'},console:{log(){},error(){throw Error('Unexpected refusal');}},require(name){
  if(name==='./target')return {target};if(name==='esbuild')return {stop(){}};
  if(name==='node:path'||name==='node:crypto')return require(name);
  if(name==='node:module')return Mod;
  if(name==='node:fs')return {readFileSync(p,enc){roots.push(p);if(p.endsWith('build-development.js'))return "define: { 'process.env.NODE_ENV': '\"production\"' }";if(p.endsWith('manifest.json'))return '{}';return Buffer.from('inert');},writeFileSync(p,data){manifest=JSON.parse(data);assert(p.includes(t.directory));}};
  throw Error('Unexpected import');
 }};context.require.resolve=name=>{assert.equal(name,t.nativePackage);return '/inert/native';};
 vm.runInNewContext(source,context,{timeout:1000});await new Promise(r=>setImmediate(r));
 assert.equal(options.directory,t.directory);assert.equal(options.browserDirectory,t.browserDirectory);assert.equal(options.nativePackage,t.nativePackage);assert.equal(manifest.arch,arch);assert(!roots.some(p=>p.includes(arch==='arm64'?'linux-x64-normal':'linux-arm64-normal')));
}
(async()=>{for(const arch of ['x64','arm64'])await builder(arch);for(const [p,a] of [['linux','ia32'],['linux','riscv64'],['darwin','arm64'],['win32','x64'],['linux','ARM64']])assert.throws(()=>target(p,a));console.log('Exact x64+arm64 target and actual private-builder VM contracts passed; invalid targets refused. No native build.');})().catch(e=>{console.error(e);process.exitCode=1;});
