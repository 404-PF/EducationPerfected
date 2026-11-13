#!/bin/sh
# Linux only. Fresh HOME and private D-Bus session, never the user's keyring.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
python3 scripts/private-store-session-test.py
export EP_STORE_TEST_ROOT="$ROOT"
python3 "$ROOT/scripts/private-store-session.py" <<'PRIVATE'
cd "$EP_STORE_TEST_ROOT"
python3 scripts/setup-pty-test.py
python3 scripts/seed-inert-browser-cache.py "$HOME"
# Real CLI save proof runs only within this private session, not the inert PTY file.
python3 - <<'PTY'
import os,pty,subprocess,select,time
master,slave=pty.openpty()
child=None
try:
    child=subprocess.Popen(['node','bin/cli.js','setup'],stdin=slave,stdout=slave,stderr=slave,close_fds=True)
    data=b''
    for marker,answer in [(b'EP email',b'fixture@example.test\r'),(b'EP password',b'fixture-native-only\r')]:
        deadline=time.time()+8
        while marker not in data:
            if child.poll() is not None or time.time()>deadline: raise RuntimeError('Native CLI prompt failed')
            if select.select([master],[],[],.1)[0]: data+=os.read(master,65536)
        os.write(master,answer)
    child.wait(timeout=10)
    while select.select([master],[],[],.1)[0]: data+=os.read(master,65536)
    assert child.returncode==0
    assert b'fixture-native-only' not in data and b'fixture@example.test' not in data
finally:
    if child is not None and child.poll() is None: child.kill();child.wait(timeout=5)
    os.close(master);os.close(slave)
PTY
node - <<'VERIFY'
const assert = require('node:assert/strict');
const { createCredentialStore } = require('./lib/credential-store');
(async () => {
 const record = await createCredentialStore().read();
 assert.equal(record.email, 'fixture@example.test');
 assert.equal(record.password, 'fixture-native-only');
 await require('./scripts/native-resolver-proof').proveNativeResolver(createCredentialStore(), {email: 'fixture@example.test', password: 'fixture-native-only'});
 console.log('Real CLI setup and exact production source resolver read the expected synthetic native record.');
})().catch(() => {console.error('Native CLI record verification failed.');process.exitCode=1;});
VERIFY
node bin/cli.js forget-credentials
node - <<'JS'
const assert = require('node:assert/strict');
const { createCredentialStore } = require('./lib/credential-store');
(async () => {
 const store = createCredentialStore();
 assert.equal(await store.read(), null);
 const fixture = {email: 'fixture@example.test', password: 'synthetic-only'};
 await store.save(fixture); assert.deepEqual(await store.read(), fixture);
 assert.equal(await store.remove(), true); assert.equal(await store.read(), null);
 console.log('Real native binding with disposable Secret Service write/read/delete passed.');
})().catch(error => { console.error('Disposable-store integration failed (' + (error.code || error.name || 'unknown') + ').'); process.exitCode = 1; });
JS
PRIVATE
