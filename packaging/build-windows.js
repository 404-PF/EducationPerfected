// Local Windows x64 development build only. Unsigned, not for distribution.
if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Development builder requires Windows x64');
require('./build-development').buildDevelopment({
 directory:'windows-x64', browserDirectory:'chrome-win64',
 browserFiles:['chrome.dll','icudtl.dat'],
 nativePackage:'@napi-rs/keyring-win32-x64-msvc', executable:'educationperfected.exe',
}).catch(error=>{console.error(error);process.exitCode=1;});
