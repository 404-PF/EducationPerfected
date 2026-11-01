const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {validateLegRoot}=require('./windows-startup-root');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-startup-panel-')),source=path.join(root,'source');fs.mkdirSync(source);
try {
 assert.equal(validateLegRoot(source,'source'),fs.realpathSync(source));
 for(const bad of [root,path.dirname(root),path.join(root,'source','..'),source+'-other'])assert.throws(()=>validateLegRoot(bad,'source'));
 assert.throws(()=>validateLegRoot(source,'sea'));assert.throws(()=>validateLegRoot('relative','source'));
 if(process.platform!=='win32') {const other=fs.mkdtempSync(path.join(os.tmpdir(),'ep-startup-panel-'));try{fs.symlinkSync(source,path.join(other,'source'));assert.throws(()=>validateLegRoot(path.join(other,'source'),'source'));}finally{fs.rmSync(other,{recursive:true,force:true});}}
 console.log('Diagnostic path CLI: exact canonical temp panel/direct source-sea root, wrongmode/traversal/alias reject (inert paths only).');
}finally{fs.rmSync(root,{recursive:true,force:true});}
