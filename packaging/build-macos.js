// Local native macOS development build. Ad-hoc signed, never a release artifact.
if(process.platform!=='darwin' || !['arm64','x64'].includes(process.arch))throw Error('Development builder requires macOS arm64 or x64');
require('./build-development').buildDevelopment({
 directory:'macos-'+process.arch,macosLayout:true,
 nativePackage:'@napi-rs/keyring-darwin-'+process.arch,executable:'educationperfected',
}).catch(error=>{console.error(error);process.exitCode=1;});
