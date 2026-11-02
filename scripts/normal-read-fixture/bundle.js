// Private review bundles only: no SEA generation, native load, browser, or publication.
const esbuild=require('esbuild'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),endpoint=path.join(root,'lib/login-endpoint.js');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function bundle(out) {
 const common={absWorkingDir:root,entryPoints:['packaging/bootstrap.js'],bundle:true,platform:'node',format:'cjs',external:['keytar','@napi-rs/keyring'],define:{'process.env.NODE_ENV':'"production"'},metafile:true,write:false};
 const fixtureSource=fs.readFileSync(path.join(__dirname,'endpoint.js'),'utf8');
 const override={name:'fixture-only-endpoint',setup(build){build.onLoad({filter:/[/\\]lib[/\\]login-endpoint\.js$/},args=>{if(args.path!==endpoint)throw Error('Unexpected endpoint alias');return {contents:fixtureSource,loader:'js',resolveDir:path.dirname(endpoint)};});}};
 const production=await esbuild.build(common),fixture=await esbuild.build({...common,plugins:[override]});
 const prod=production.outputFiles[0].text,fix=fixture.outputFiles[0].text;
 // esbuild emits a named CommonJS module region for each input. Only endpoint's
 // contents are overridden, with its resolved module identity preserved.
 const marker='// lib/login-endpoint.js\n';
 function split(text){const at=text.indexOf(marker);if(at<0||text.indexOf(marker,at+1)!==-1)throw Error('Endpoint region unavailable');const end=text.indexOf('\n// ',at+marker.length);if(end<0)throw Error('Endpoint region end unavailable');return {before:text.slice(0,at),module:text.slice(at,end),after:text.slice(end)};}
 const a=split(prod),b=split(fix);
 if(a.before!==b.before||a.after!==b.after)throw Error('Unattributed bundle delta outside endpoint module');
 if(JSON.stringify(production.metafile)!==JSON.stringify(fixture.metafile)){
  // Source/output byte counts legitimately differ for the one substituted module.
  const pa=structuredClone(production.metafile),pb=structuredClone(fixture.metafile);
  for(const meta of [pa,pb]){delete meta.inputs['lib/login-endpoint.js'].bytes;for(const output of Object.values(meta.outputs)){delete output.bytes;delete output.inputs['lib/login-endpoint.js'].bytesInOutput;}}
  if(JSON.stringify(pa)!==JSON.stringify(pb))throw Error('Unattributed module graph delta');
 }
 fs.mkdirSync(out,{recursive:true});
 const inputs=Object.fromEntries(Object.keys(production.metafile.inputs).map(name=>[name,{sha256:hash(fs.readFileSync(path.join(root,name))),fixtureSha256:name==='lib/login-endpoint.js'?hash(fixtureSource):hash(fs.readFileSync(path.join(root,name)))}]));
 fs.writeFileSync(path.join(out,'production.cjs'),prod);fs.writeFileSync(path.join(out,'fixture.cjs'),fix);
 fs.writeFileSync(path.join(out,'production-metafile.json'),JSON.stringify(production.metafile,null,2));fs.writeFileSync(path.join(out,'fixture-metafile.json'),JSON.stringify(fixture.metafile,null,2));
 const manifest={kind:'MODIFIED-VALIDATION-ONLY-JS-BUNDLES-NOT-SEA',sourceBase:'7e3e3075773a4e3ca903c88be26cc1c5267aaa0c',node:process.version,esbuild:esbuild.version,productionSha256:hash(prod),fixtureSha256:hash(fix),soleOverriddenModule:'lib/login-endpoint.js',fixtureModuleSource:'scripts/normal-read-fixture/endpoint.js',wholeBundleOutsideEndpointByteIdentical:true,moduleGraphOutsideEndpointCountsIdentical:true,inputs};
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));return manifest;
}
module.exports={bundle};
if(require.main===module)bundle(path.join(root,'build/normal-read-review')).finally(()=>esbuild.stop()).then(()=>console.log('Review-only production/modified-fixture bundles and full module attribution written. No native execution.')).catch(()=>{console.error('Review bundle attribution failed.');process.exitCode=1;});
