const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {validateLegRoot,createPanelRoot}=require('./windows-startup-root');
const root=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'ep-startup-panel-')),source=path.join(root,'source'),sea=path.join(root,'sea');fs.mkdirSync(source);fs.mkdirSync(sea);
const expected={message:'Diagnostic root uncertainty'};
function rejectsBeforeMetadata(value,mode='source') {
 const original={lstatSync:fs.lstatSync,statSync:fs.statSync,realpathSync:fs.realpathSync};let calls=0;
 try {
  for(const name of ['lstatSync','statSync'])fs[name]=()=>{calls++;throw Error('Unexpected root metadata');};
  fs.realpathSync=(value,...args)=>{if(value===os.tmpdir())return original.realpathSync(value,...args);calls++;throw Error('Unexpected root metadata');};
  assert.throws(()=>validateLegRoot(value,mode),expected);assert.equal(calls,0);
 } finally {Object.assign(fs,original);}
}
try {
 assert.equal(validateLegRoot(source,'source'),fs.realpathSync(source));
 assert.equal(validateLegRoot(sea,'sea'),fs.realpathSync(sea));
 for(const bad of [root,path.dirname(root),source+'-other','relative',source+path.sep+'..'+path.sep+'source'])rejectsBeforeMetadata(bad);
 rejectsBeforeMetadata(source,'sea');
 const outsideParent=fs.mkdtempSync(path.join(os.tmpdir(),'ep-outside-panel-'));
 try {
  const outside=path.join(outsideParent,'ep-startup-panel-Probe','source');fs.mkdirSync(outside,{recursive:true});rejectsBeforeMetadata(outside);
 } finally {fs.rmSync(outsideParent,{recursive:true,force:true});}
 if(process.platform!=='win32') {
  const aliasRoot=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'ep-temp-alias-')),actualTemp=path.join(aliasRoot,'actual'),aliasTemp=path.join(aliasRoot,'alias');fs.mkdirSync(actualTemp);fs.symlinkSync(actualTemp,aliasTemp);const originalTemp=os.tmpdir;
  try {
   os.tmpdir=()=>aliasTemp;
   const panelSource=fs.readFileSync(path.join(__dirname,'windows-startup-panel.js'),'utf8');
   assert.ok(panelSource.includes("const {createPanelRoot}=require('./windows-startup-root');"));
   assert.ok(panelSource.includes('const root=createPanelRoot();'));
   const panelRoot=createPanelRoot(),leg=path.join(panelRoot,'source');fs.mkdirSync(leg);
   assert.equal(validateLegRoot(leg,'source'),fs.realpathSync(leg),'Shared panel root creation accepts aliased temp through canonical root');
  } finally {os.tmpdir=originalTemp;fs.rmSync(aliasRoot,{recursive:true,force:true});}
 }
 if(process.platform!=='win32') {const other=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'ep-startup-panel-'));try{fs.symlinkSync(source,path.join(other,'source'));assert.throws(()=>validateLegRoot(path.join(other,'source'),'source'),expected);}finally{fs.rmSync(other,{recursive:true,force:true});}}
 else console.log('SKIP: native Windows symlink/junction fixture not executed.');
 console.log('Inert static paths: source and sea accepted; raw traversal, wrong mode/name, relative and outside-direct-temp roots rejected before root metadata; POSIX final symlink rejected and shared panel canonical creation accepts aliased temp when available. No ownership/race/native Windows proof.');
}finally{fs.rmSync(root,{recursive:true,force:true});}
