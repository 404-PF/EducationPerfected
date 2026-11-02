// Exact native Linux validation targets, never caller paths or cross-builds.
function target(platform,arch){
 if(platform!=='linux'||!['x64','arm64'].includes(arch))throw Error('Fixture target refused');
 return Object.freeze({arch,directory:'linux-'+arch+'-normal-read-fixture-private',browserDirectory:arch==='x64'?'chrome-linux64':'chrome-linux-arm64',nativePackage:'@napi-rs/keyring-linux-'+arch+'-gnu'});
}
module.exports={target};
