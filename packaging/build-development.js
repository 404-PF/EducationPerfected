// Shared local development SEA builder. No signing or distribution authority.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createGzip } = require('node:zlib');
const { createHash } = require('node:crypto');
const esbuild = require('esbuild');
const { packTar } = require('modern-tar/fs');
async function buildDevelopment(target) {
 if (process.argv.length > 2) throw Error('This development builder accepts no output path arguments');
 if (process.env.PUPPETEER_EXECUTABLE_PATH) throw Error('Custom browser paths are not accepted by this development builder');
 const out = path.resolve(__dirname, '../build', target.directory); fs.mkdirSync(out, { recursive: true });
 const browser = await require('puppeteer').executablePath(), browserDir = path.dirname(browser);
 if (!fs.existsSync(browser)) throw Error('Chrome for Testing is not installed; run npx puppeteer browsers install chrome');
 if (path.basename(browserDir) !== target.browserDirectory || target.browserFiles.some(file => !fs.existsSync(path.join(browserDir,file)))) throw Error('Expected a Chrome for Testing payload directory');
 const archive = path.join(out, 'browser.tar.gz');
 await pipeline(packTar(browserDir), createGzip(), fs.createWriteStream(archive));
 const hash = createHash('sha256'); for await (const chunk of fs.createReadStream(archive)) hash.update(chunk);
 fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ length: fs.statSync(archive).size, sha256: hash.digest('hex'), executable: path.basename(browser) }));
 await esbuild.build({ entryPoints: [path.join(__dirname, 'bootstrap.js')], bundle: true, platform: 'node', format: 'cjs', outfile: path.join(out, 'main.cjs'), external: ['keytar', '@napi-rs/keyring'], define: { 'process.env.NODE_ENV': '"production"' } });
 // Inventory every installed production dependency, including missing notice files.
 // This is an audit aid, not permission to redistribute an incomplete notice set.
 const notices = path.join(out, 'THIRD-PARTY-NOTICES'); fs.mkdirSync(notices, { recursive: true });
 const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../package-lock.json'), 'utf8'));
 const inventory = [];
 for (const [relative, record] of Object.entries(lock.packages)) {
  if (!relative || record.dev) continue;
  const directory = path.join(__dirname, '..', relative);
  if (!fs.existsSync(directory)) {
   if (record.optional) continue; // Other-platform optional binary, not in this build.
   throw Error('Missing required production dependency: ' + relative);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const copied = [];
  for (const filename of fs.readdirSync(directory).filter(name => /^(LICENSE|COPYING|NOTICE)/i.test(name))) {
   if (fs.statSync(path.join(directory, filename)).isFile()) {
    const destination = relative.replaceAll('/', '-') + '-' + filename;
    fs.copyFileSync(path.join(directory, filename), path.join(notices, destination)); copied.push(destination);
   }
  }
  if (!copied.length) {
   const recovered = require('./notices/provenance.json').find(item => item.name === pkg.name && item.version === pkg.version);
   if (recovered) {
    const source = path.join(__dirname, 'notices', recovered.file);
    const bytes = fs.readFileSync(source);
    if (createHash('sha256').update(bytes).digest('hex') !== recovered.sha256) throw Error('Recovered notice checksum mismatch');
    fs.copyFileSync(source, path.join(notices, recovered.file)); copied.push(recovered.file);
   }
  }
  inventory.push({ name: pkg.name, version: pkg.version, license: pkg.license || null, repository: pkg.repository || null, files: copied, status: copied.length ? 'files-copied-not-legally-reviewed' : 'MISSING-NOTICE-REQUIRES-REVIEW' });
 }
 fs.copyFileSync(path.join(__dirname, 'notices/provenance.json'), path.join(notices, 'RECOVERED-NOTICE-PROVENANCE.json'));
 fs.writeFileSync(path.join(notices, 'DEPENDENCY-INVENTORY.json'), JSON.stringify(inventory, null, 2));
 fs.writeFileSync(path.join(notices, 'BROWSER.txt'), 'Chrome for Testing browser files are bundled without removal of their accompanying notices. Redistribution and project licensing review remain release gates.\n');
 const missing = inventory.filter(item => !item.files.length);
 fs.writeFileSync(path.join(notices, 'NOT-FOR-DISTRIBUTION.txt'), 'Development artifact only. License/notice completeness and project rights are NOT cleared. Missing notices: ' + missing.map(item => item.name).join(', ') + '\n');
 if (missing.length) console.warn('Development build has missing third-party notice files; distribution is blocked. See DEPENDENCY-INVENTORY.json.');
 const config = { main: path.join(out, 'main.cjs'), output: path.join(out, 'main.blob'), disableExperimentalSEAWarning: true, useSnapshot: false, useCodeCache: false, execArgvExtension: 'none', assets: { browser: archive, manifest: path.join(out, 'manifest.json'), native: require.resolve(target.nativePackage) } };
 fs.writeFileSync(path.join(out, 'sea.json'), JSON.stringify(config));
 cp.execFileSync(process.execPath, ['--experimental-sea-config', path.join(out, 'sea.json')], { stdio: 'inherit' });
 const executable = path.join(out, target.executable); fs.copyFileSync(process.execPath, executable); fs.chmodSync(executable, 0o700);
 cp.execFileSync(process.execPath, [require.resolve('postject/dist/cli.js'), executable, 'NODE_SEA_BLOB', config.output, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });
 // Browser is a SEA asset; no data is appended after executable generation.
 console.log('Development executable: ' + executable);
}
module.exports = { buildDevelopment };
