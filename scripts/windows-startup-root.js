// Diagnostic CLI paths are accepted only within this exact fresh-temp layout.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function validateLegRoot(root,mode) {
 if(!['source','sea'].includes(mode)||typeof root!=='string'||!path.isAbsolute(root))throw Error('Diagnostic root uncertainty');
 const temp=fs.realpathSync(os.tmpdir()),parent=path.dirname(root),name=path.basename(parent);
 // Reject raw aliases/traversal and non-direct-temp parents before root metadata access.
 if(root!==path.normalize(root)||path.dirname(parent)!==temp||!/^ep-startup-panel-[A-Za-z0-9]+$/.test(name)||path.basename(root)!==mode)throw Error('Diagnostic root uncertainty');
 if(fs.lstatSync(parent).isSymbolicLink()||fs.lstatSync(root).isSymbolicLink()||!fs.statSync(root).isDirectory())throw Error('Diagnostic root uncertainty');
 const actualParent=fs.realpathSync(parent),actual=fs.realpathSync(root);
 if(path.dirname(actualParent)!==temp||path.dirname(actual)!==actualParent||path.basename(actual)!==mode)throw Error('Diagnostic root uncertainty');
 return actual;
}
function createPanelRoot() {return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'ep-startup-panel-'));}
module.exports={validateLegRoot,createPanelRoot};
