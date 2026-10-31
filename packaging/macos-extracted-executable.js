// Validate the relocated executable before passing it to Puppeteer on macOS.
const fs=require('node:fs'),path=require('node:path');
const EXECUTABLE=path.join('Google Chrome for Testing.app','Contents','MacOS','Google Chrome for Testing');
function macosExtractedExecutable(root,relative) {
 if(relative!==EXECUTABLE)throw Error('Unexpected macOS browser executable manifest path');
 const executable=path.join(root,relative),realRoot=fs.realpathSync(root),real=fs.realpathSync(executable),contained=path.relative(realRoot,real);
 if(contained==='..' || contained.startsWith('..'+path.sep) || path.isAbsolute(contained))throw Error('Extracted macOS browser executable escapes owned root');
 const stat=fs.statSync(executable);
 if(!stat.isFile() || !(stat.mode&0o111))throw Error('Extracted macOS browser executable is not an executable file');
 return executable;
}
module.exports={macosExtractedExecutable};
