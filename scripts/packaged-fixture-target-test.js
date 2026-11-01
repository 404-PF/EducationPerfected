const assert = require('node:assert/strict');
const path = require('node:path');
const { packagedFixtureTarget } = require('./packaged-fixture-target');
for (const [platform, arch, directory, filename] of [
 ['win32','x64','windows-x64','educationperfected.exe'],
 ['darwin','arm64','macos-arm64','educationperfected'],
 ['darwin','x64','macos-x64','educationperfected'],
 ['linux','x64','linux-x64','educationperfected'],
 ['linux','arm64','linux-arm64','educationperfected'],
]) {
 assert.deepEqual(packagedFixtureTarget(platform, arch), {
  executable: path.resolve(__dirname, '../build', directory, filename), filename,
 });
}
for (const [platform, arch] of [['win32','arm64'],['win32','ia32'],['darwin','ia32'],['linux','arm'],['freebsd','x64'],['linux','../../outside']]) {
 assert.throws(() => packagedFixtureTarget(platform, arch), /No packaged fixture target/);
}
console.log('Five fixed native CLI-fixture targets and unsupported-host rejection passed (path selection only, no native execution).');
