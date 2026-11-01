#!/usr/bin/env python3
"""Hosted disposable Mac only. No existing keychain contents or signing identity access."""
import os, sys, pathlib, platform, subprocess, tempfile, shlex, shutil, signal, time

SECURITY = '/usr/bin/security'

class ChildStillLive(RuntimeError):
    pass

def security(*args):
    return subprocess.run([SECURITY, *args], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15).stdout

def keychain_paths(text):
    return shlex.split(text)

def isolated_store(run_fixture, call=security, root_factory=None):
    # Snapshot before create-keychain, which itself changes the search list.
    defaults = keychain_paths(call('default-keychain', '-d', 'user'))
    previous = keychain_paths(call('list-keychains', '-d', 'user'))
    if len(defaults) != 1 or not previous:
        raise RuntimeError('Cannot snapshot disposable runner user keychain metadata')
    root = pathlib.Path(root_factory() if root_factory else tempfile.mkdtemp(prefix='ep-mac-store-', dir=os.environ['RUNNER_TEMP']))
    owned = str(root / 'synthetic.keychain-db')
    primary = None
    cleanup_failed = False
    # Fixed disposable fixture passphrase, not an account credential.
    password = 'disposable-ep-synthetic-only'
    try:
        call('create-keychain', '-p', password, owned)
        call('unlock-keychain', '-p', password, owned)
        call('default-keychain', '-d', 'user', '-s', owned)
        call('list-keychains', '-d', 'user', '-s', owned)
        if keychain_paths(call('default-keychain', '-d', 'user')) != [owned] or keychain_paths(call('list-keychains', '-d', 'user')) != [owned]:
            raise RuntimeError('Owned keychain selection did not verify; no credential operations allowed')
        run_fixture(root)
    except BaseException as error:
        primary = error
    finally:
        if isinstance(primary, ChildStillLive):
            print('Mac child exit unconfirmed; keychain state retained until hosted VM destruction.', file=sys.stderr)
            raise primary
        # Attempt every metadata restoration step, even if creation or fixture failed.
        for args in [('default-keychain', '-d', 'user', '-s', defaults[0]), ('list-keychains', '-d', 'user', '-s', *previous)]:
            try:
                call(*args)
            except BaseException:
                cleanup_failed = True
        try:
            if keychain_paths(call('default-keychain', '-d', 'user')) != defaults or keychain_paths(call('list-keychains', '-d', 'user')) != previous:
                cleanup_failed = True
        except BaseException:
            cleanup_failed = True
        try:
            if not cleanup_failed and pathlib.Path(owned).exists():
                call('delete-keychain', owned)
            if pathlib.Path(owned).exists():
                raise RuntimeError('Owned keychain remains')
        except BaseException:
            cleanup_failed = True
        if not cleanup_failed:
            shutil.rmtree(root)
        else:
            print('Disposable Mac keychain cleanup or metadata restoration failed; owned root retained.', file=sys.stderr)
    if primary:
        raise primary
    if cleanup_failed:
        raise RuntimeError('Disposable Mac keychain cleanup or metadata restoration failed')

def stop_group(child, killpg=os.killpg, clock=time.monotonic, sleep=time.sleep):
    try:
        killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except BaseException as error:
        raise ChildStillLive('Credential group termination unconfirmed') from error
    try:
        child.wait(timeout=10)
    except BaseException as error:
        raise ChildStillLive('Credential child exit unconfirmed') from error
    deadline = clock()+5
    while True:
        try:
            killpg(child.pid, 0)
        except ProcessLookupError:
            return
        except BaseException as error:
            raise ChildStillLive('Credential group exit unconfirmed') from error
        if clock() >= deadline:
            raise ChildStillLive('Credential process group exit unconfirmed')
        sleep(.05)

def main():
    if sys.platform != 'darwin' or platform.machine() not in ('arm64', 'x86_64') or os.environ.get('GITHUB_ACTIONS') != 'true' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted' or os.environ.get('RUNNER_OS') != 'macOS':
        raise RuntimeError('Requires disposable GitHub-hosted native Mac runner')
    if len(sys.argv) != 1:
        raise RuntimeError('No fixture arguments accepted')
    runner_temp = pathlib.Path(os.environ['RUNNER_TEMP'])
    if not runner_temp.is_absolute() or not runner_temp.is_dir():
        raise RuntimeError('Runner temporary directory unavailable')
    def fixture(root):
        child = subprocess.Popen([sys.executable, str(pathlib.Path(__file__).with_name('macos-store-pty-test.py')), str(root)], start_new_session=True)
        try:
            if child.wait(timeout=90) != 0:
                raise RuntimeError('Credential child failed')
        finally:
            stop_group(child)
    def interrupted(signum, frame):
        raise SystemExit(128+signum)
    for signum in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):
        signal.signal(signum,interrupted)
    isolated_store(fixture)

if __name__ == '__main__':
    try:
        main()
        print('Disposable Mac user keychain selection, credential fixture and metadata restoration passed.')
    except BaseException:
        print('Disposable Mac store fixture failed; no credential contents or native error text printed.', file=sys.stderr)
        sys.exit(1)
