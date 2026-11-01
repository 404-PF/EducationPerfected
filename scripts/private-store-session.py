#!/usr/bin/env python3
"""Owned Linux synthetic session. Keeps root until both launched daemons exit."""
import os, pathlib, select, shutil, signal, subprocess, sys, tempfile

def stop_owned(child):
    if child.poll() is None:
        child.terminate()
    try:
        child.wait(timeout=5)
    except subprocess.TimeoutExpired:
        child.kill()
        child.wait(timeout=5)
    if child.poll() is None:
        raise RuntimeError('Owned daemon exit unconfirmed')

def main():
    if sys.platform != 'linux' or len(sys.argv) != 1:
        raise RuntimeError('Linux fixture only, no arguments')
    root = pathlib.Path(tempfile.mkdtemp(prefix='ep-private-store-'))
    root.chmod(0o700)
    runtime=root/'runtime'; runtime.mkdir(mode=0o700)
    tmp=root/'tmp';tmp.mkdir(mode=0o700)
    env=dict(os.environ,HOME=str(root),TMPDIR=str(tmp),XDG_DATA_HOME=str(root/'data'),XDG_CONFIG_HOME=str(root/'config'),XDG_RUNTIME_DIR=str(runtime))
    for key in ('DBUS_SESSION_BUS_ADDRESS','DBUS_SESSION_BUS_PID','EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT'):
        env.pop(key,None)
    bus=None;keyring=None;primary=None;cleanup=None; fixture_started=False; fixture_finished=False
    def interrupted(signum,frame):raise RuntimeError('Private session interrupted')
    previous={s:signal.signal(s,interrupted) for s in (signal.SIGINT,signal.SIGTERM,signal.SIGHUP)}
    try:
        bus=subprocess.Popen(['dbus-daemon','--session','--nofork','--nopidfile','--print-address=1'],env=env,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
        if not select.select([bus.stdout],[],[],5)[0]:raise RuntimeError('Private bus startup timed out')
        address=bus.stdout.readline().strip()
        if not address or bus.poll() is not None:raise RuntimeError('Private bus unavailable')
        env['DBUS_SESSION_BUS_ADDRESS']=address
        with open(root/'keyring.log','wb') as log:
            keyring=subprocess.Popen(['gnome-keyring-daemon','--foreground','--unlock','--components=secrets'],env=env,stdin=subprocess.PIPE,stdout=log,stderr=log)
            keyring.stdin.write(b'disposable-fixture-session');keyring.stdin.close()
        subprocess.run(['gdbus','wait','--session','--timeout','5','org.freedesktop.secrets'],env=env,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10)
        fixture_started=True
        subprocess.run(['sh','-eu'],env=env,stdin=sys.stdin,check=True,timeout=120)
        fixture_finished=True
        if any(tmp.iterdir()):raise RuntimeError('Owned extraction residue')
    except BaseException as error:primary=error
    finally:
        for child in (keyring,bus):
            if child is not None:
                try:stop_owned(child)
                except BaseException as error:cleanup=error
        if fixture_started and not fixture_finished:
            cleanup=cleanup or RuntimeError('Fixture descendant exit unconfirmed')
        if cleanup is None:shutil.rmtree(root)
        else:print('Owned daemon exit unconfirmed; private root retained.',file=sys.stderr)
        for s,handler in previous.items():signal.signal(s,handler)
    if primary:raise primary
    if cleanup:raise cleanup
    print('Private native-store session: owned keyring and bus exits confirmed before root removal.')

if __name__=='__main__':
    try:main()
    except BaseException:
        print('Private native-store session failed; no credential/native error contents printed.',file=sys.stderr)
        sys.exit(1)
