// Downloadable release candidate builder. No upload or publication authority.
const platform=process.platform,arch=process.arch;
if(!['x64','arm64'].includes(arch)||!['linux','darwin','win32'].includes(platform)||(platform==='win32'&&arch!=='x64'))throw new Error('Unsupported native release target');
if(platform==='linux'&&!process.report.getReport().header.glibcVersionRuntime)throw new Error('glibc Linux required');
const target={win32:'windows',darwin:'macos',linux:'linux'}[platform];
const nativeSuffix={win32:'win32-x64-msvc',darwin:'darwin-'+arch,linux:'linux-'+arch+'-gnu'}[platform];
const nativePackage='@napi-rs/keyring-'+nativeSuffix;
require('./build-development').buildDevelopment({directory:target+'-'+arch+'-downloadable',browserMode:'direct-google-download',macosLayout:platform==='darwin',nativePackage,executable:platform==='win32'?'educationperfected.exe':'educationperfected'}).catch(error=>{console.error(error);process.exitCode=1;});
