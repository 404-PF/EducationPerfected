#!/bin/sh
# Linux only. Fresh HOME and private D-Bus session, never the user's keyring.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
EP_TEST_HOME=$(mktemp -d)
mkdir -p "$EP_TEST_HOME/runtime"; chmod 700 "$EP_TEST_HOME/runtime"
trap 'rm -rf "$EP_TEST_HOME"' EXIT
HOME="$EP_TEST_HOME" XDG_DATA_HOME="$EP_TEST_HOME/data" XDG_CONFIG_HOME="$EP_TEST_HOME/config" XDG_RUNTIME_DIR="$EP_TEST_HOME/runtime" EP_STORE_TEST_ROOT="$ROOT" dbus-run-session -- sh -eu <<'PRIVATE'
mkdir -p "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"
printf 'disposable-fixture-session' > "$HOME/session-input"
gnome-keyring-daemon --foreground --unlock --components=secrets < "$HOME/session-input" > "$HOME/keyring.log" 2>&1 &
KEYRING_PID=$!
trap 'kill "$KEYRING_PID" 2>/dev/null || :; wait "$KEYRING_PID" 2>/dev/null || :' EXIT
# Wait for the private Secret Service to own its bus name before tests begin.
gdbus wait --session --timeout 5 org.freedesktop.secrets
rm -f "$HOME/session-input"
cd "$EP_STORE_TEST_ROOT"
python3 scripts/setup-pty-test.py
# Real CLI save proof runs only within this private session, not the inert PTY file.
python3 - <<'PTY'
import os,pty,subprocess,select,time
master,slave=pty.openpty()
child=None
try:
    child=subprocess.Popen(['node','bin/cli.js','--setup'],stdin=slave,stdout=slave,stderr=slave,close_fds=True)
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
 console.log('Real CLI setup saved the expected synthetic native record.');
})().catch(() => {console.error('Native CLI record verification failed.');process.exitCode=1;});
VERIFY
node bin/cli.js --forget-credentials
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
