// Source-only preparation. Native macOS/browser/signature validation still required.
const fs=require('node:fs'),path=require('node:path');
function macosBrowserLayout(browser,arch) {
 if(!['arm64','x64'].includes(arch))throw Error('macOS browser layout requires arm64 or x64');
 if(!path.isAbsolute(browser))throw Error('macOS browser path must be absolute');
 const executable=path.join('Google Chrome for Testing.app','Contents','MacOS','Google Chrome for Testing');
 const root=path.resolve(path.dirname(browser),'../../..');
 if(path.basename(root)!=='chrome-mac-'+arch || path.resolve(root,executable)!==browser)throw Error('Expected complete Chrome for Testing macOS payload layout');
 const realRoot=fs.realpathSync(root);
 const requireContained=(relative,directory)=>{
  const file=path.join(root,relative),real=fs.realpathSync(file),contained=path.relative(realRoot,real);
  if(contained==='..' || contained.startsWith('..'+path.sep) || path.isAbsolute(contained))throw Error('macOS browser payload path escapes owned root');
  const stat=fs.statSync(file);
  if(directory?!stat.isDirectory():!stat.isFile())throw Error('macOS browser payload has invalid file type');
 };
 requireContained(executable,false);
 for(const relative of ['Frameworks','Resources'])requireContained(path.join('Google Chrome for Testing.app','Contents',relative),true);
 requireContained(path.join('Google Chrome for Testing.app','Contents','Info.plist'),false);
 // Audit every archived entry, not only the required app components. Do not
 // follow links recursively; realpath catches dangling/cyclic/outside links.
 const audit=directory=>{
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})) {
   const file=path.join(directory,entry.name),stat=fs.lstatSync(file);
   if(stat.isSymbolicLink()) {
    const link=fs.readlinkSync(file);
    if(path.isAbsolute(link))throw Error('Absolute macOS payload symlink cannot survive relocation');
    // Reject even a temporary lexical excursion which re-enters by root name.
    let depth=path.relative(root,path.dirname(file)).split(path.sep).filter(Boolean).length;
    for(const component of link.split(path.sep)) {
     if(component==='..') { if(--depth<0)throw Error('macOS payload symlink leaves archive root'); }
     else if(component && component!=='.')depth++;
    }
    const relative=path.relative(realRoot,fs.realpathSync(file));
    if(relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative))throw Error('macOS browser payload path escapes owned root');
   } else if(stat.isDirectory())audit(file);
   else if(!stat.isFile())throw Error('Unsupported macOS browser payload entry');
  }
 };
 audit(root);
 return {archiveRoot:root,executable};
}
module.exports={macosBrowserLayout};
