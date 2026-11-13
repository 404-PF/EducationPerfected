// Synthetic filesystem ownership only. No browser, native binding or user files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {createRuntimeDirectory, processState} = require('../lib/runtime-directory');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-runtime-inert-'));
try {
    const dead = () => { throw Object.assign(new Error('inert'), {code:'ESRCH'}); };
    assert.equal(processState(1, dead), 'dead');
    assert.equal(processState(1, () => {}), 'alive');
    assert.equal(processState(1, () => { throw Object.assign(new Error('inert'), {code:'EPERM'}); }), 'unknown');
    const first = createRuntimeDirectory({home, pid:41, kill:dead});
    const tmp = path.join(home, '.educationperfected', 'tmp');
    assert.equal(path.dirname(first.directory), tmp);
    fs.writeFileSync(path.join(first.directory, 'keyring.node'), 'inert-native');
    fs.mkdirSync(path.join(first.directory, 'puppeteer_dev_chrome_profile-inert'));
    assert.equal(first.remove(false), false);
    assert.ok(fs.existsSync(first.directory), 'uncertain browser ownership must retain runtime');
    const browserCache = path.join(home, '.educationperfected', 'browsers');
    fs.mkdirSync(browserCache);
    fs.writeFileSync(path.join(browserCache, 'receipt-inert'), 'keep');
    const stale = path.join(tmp, 'run-ABC123');
    fs.mkdirSync(stale);
    fs.writeFileSync(path.join(stale, 'OWNER.json'), JSON.stringify({schema:1,pid:42,state:'cleanup-ready'}));
    const live = path.join(tmp, 'run-DEF456');
    fs.mkdirSync(live);
    fs.writeFileSync(path.join(live, 'OWNER.json'), JSON.stringify({schema:1,pid:43,state:'cleanup-ready'}));
    const uncertain = path.join(tmp, 'run-GHI789');
    fs.mkdirSync(uncertain);
    fs.writeFileSync(path.join(uncertain, 'OWNER.json'), JSON.stringify({schema:1,pid:44,state:'running'}));
    const invalid = path.join(tmp, 'run-JKL012');
    fs.mkdirSync(invalid);
    fs.writeFileSync(path.join(invalid, 'OWNER.json'), 'not-json');
    const next = createRuntimeDirectory({home, pid:45, kill:pid => { if (pid !== 43) dead(); }});
    assert.equal(fs.existsSync(stale), false);
    for (const directory of [first.directory, live, uncertain, invalid]) assert.ok(fs.existsSync(directory));
    assert.equal(fs.readFileSync(path.join(browserCache, 'receipt-inert'), 'utf8'), 'keep');
    assert.equal(next.remove(true), true);
    assert.equal(next.remove(true), true);
    assert.equal(fs.existsSync(next.directory), false);
    assert.equal(first.remove(true), true);
    // Symlink tests apply where the local OS permits creating them. Windows
    // hosted integration must not be inferred from a POSIX synthetic fixture.
    if (process.platform !== 'win32') {
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ep-runtime-outside-'));
        try {
            fs.writeFileSync(path.join(outside, 'keep'), 'outside');
            const link = path.join(tmp, 'run-MNO345');
            fs.symlinkSync(outside, link, 'dir');
            const last = createRuntimeDirectory({home, kill:dead});
            assert.equal(fs.readFileSync(path.join(outside, 'keep'), 'utf8'), 'outside');
            assert.ok(fs.lstatSync(link).isSymbolicLink());
            last.remove(true);
            fs.unlinkSync(link);
            fs.rmSync(tmp, {recursive:true});
            fs.symlinkSync(outside, tmp, 'dir');
            assert.throws(() => createRuntimeDirectory({home}), /real directory/);
        } finally { fs.rmSync(outside, {recursive:true, force:true}); }
    }
    console.log('Runtime root containment, cache preservation, live/uncertain ownership and safe stale cleanup passed (synthetic only).');
} finally { fs.rmSync(home, {recursive:true, force:true}); }
