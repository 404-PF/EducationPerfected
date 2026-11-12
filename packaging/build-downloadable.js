// Downloadable-beta candidate builder. No upload or publication authority.
const platform=process.platform,arch=process.arch;
if(!['x64','arm64'].includes(arch)||!['linux','darwin','win32'].includes(platform)||(platform==='win32'&&arch!=='x64'))throw Error('Unsupported native beta target');
if(platform==='linux'&&!process.report.getReport().header.glibcVersionRuntime)throw Error('glibc Linux required');
const target=platform==='win32'?'windows':platform==='darwin'?'macos':'linux';
const nativePackage='@napi-rs/keyring-'+(platform==='win32'?'win32-x64-msvc':platform==='darwin'?'darwin-'+arch:'linux-'+arch+'-gnu');
require('./build-development').buildDevelopment({directory:target+'-'+arch+'-downloadable',browserMode:'direct-google-download',macosLayout:platform==='darwin',nativePackage,executable:platform==='win32'?'educationperfected.exe':'educationperfected'}).catch(error=>{console.error(error);process.exitCode=1;});
