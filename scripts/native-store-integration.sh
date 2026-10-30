#!/bin/sh
# Linux only. Fresh HOME and private D-Bus session, never the user's keyring.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
EP_TEST_HOME=$(mktemp -d)
mkdir -p "$EP_TEST_HOME/runtime"; chmod 700 "$EP_TEST_HOME/runtime"
trap 'rm -rf "$EP_TEST_HOME"' EXIT
HOME="$EP_TEST_HOME" XDG_DATA_HOME="$EP_TEST_HOME/data" XDG_CONFIG_HOME="$EP_TEST_HOME/config" XDG_RUNTIME_DIR="$EP_TEST_HOME/runtime" EP_STORE_TEST_ROOT="$ROOT" dbus-run-session -- sh -eu <<'PRIVATE'
mkdir -p "$XDG_RUNTIME_DIR"; chmod 700 "$XDG_RUNTIME_DIR"
printf 'disposable-fixture-session' | gnome-keyring-daemon --unlock --components=secrets >/dev/null
cd "$EP_STORE_TEST_ROOT"
python3 scripts/setup-pty-test.py
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
