// Native fixture paths only. This selection is not evidence of native support.
const path = require('node:path');
function packagedFixtureTarget(platform = process.platform, arch = process.arch) {
 const supported = (platform === 'win32' && arch === 'x64') ||
  (['linux', 'darwin'].includes(platform) && ['x64', 'arm64'].includes(arch));
 if (!supported) throw Error('No packaged fixture target for this platform');
 const directory = (platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux') + '-' + arch;
 const filename = platform === 'win32' ? 'educationperfected.exe' : 'educationperfected';
 return { executable: path.resolve(__dirname, '../build', directory, filename), filename };
}
module.exports = { packagedFixtureTarget };
