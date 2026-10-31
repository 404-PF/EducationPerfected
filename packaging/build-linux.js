// Local glibc Linux x64/arm64 development build only, not a signed release pipeline.
if (process.platform !== 'linux' || !['x64','arm64'].includes(process.arch) || !process.report.getReport().header.glibcVersionRuntime) {
 throw Error('Development builder requires glibc Linux x64 or arm64');
}
require('./build-development').buildDevelopment({
 directory:'linux-'+process.arch,
 browserDirectory:process.arch === 'x64' ? 'chrome-linux64' : 'chrome-linux-arm64',
 browserFiles:['chrome_crashpad_handler','icudtl.dat'],
 nativePackage:'@napi-rs/keyring-linux-'+process.arch+'-gnu',
 executable:'educationperfected',
}).catch(error=>{console.error(error);process.exitCode=1;});
