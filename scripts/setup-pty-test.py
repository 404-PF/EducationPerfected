# Standard-library PTY test with an inert store. Safe outside any D-Bus session.
import os, pty, subprocess, select, time, termios, contextlib
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
@contextlib.contextmanager
def session():
    master, slave = pty.openpty()
    before = termios.tcgetattr(slave)
    child = None
    try:
        child = subprocess.Popen(['node', '--require', os.path.join(ROOT, 'scripts/setup-inert-store.cjs'), 'bin/cli.js', '--setup'], stdin=slave, stdout=slave, stderr=slave, cwd=ROOT, close_fds=True)
        yield child, master, slave, before
    finally:
        if child is not None and child.poll() is None:
            child.kill()
            child.wait(timeout=5)
        os.close(master)
        os.close(slave)
def until(child, master, data, marker):
    deadline = time.time() + 8
    while marker not in data:
        if child.poll() is not None or time.time() > deadline:
            raise AssertionError('Setup prompt checkpoint failed')
        if select.select([master], [], [], .1)[0]:
            data += os.read(master, 65536)
    return data
with session() as (child, master, slave, before):
    data = until(child, master, b'', b'EP email')
    os.write(master, b'fixture@example.test\r')
    data = until(child, master, data, b'EP password')
    os.write(master, b'fixture-only-password\r')
    child.wait(timeout=10)
    while select.select([master], [], [], .1)[0]:
        data += os.read(master, 65536)
    assert child.returncode == 0
    assert b'fixture@example.test' not in data and b'fixture-only-password' not in data
    assert b'Login saved in the OS credential store.' in data
    assert termios.tcgetattr(slave)[3] & termios.ECHO == before[3] & termios.ECHO
print('Inert-store PTY setup: fields hidden and terminal echo restored.')
for signum in [2, 15]:
    with session() as (child, master, slave, before):
        until(child, master, b'', b'EP email')
        child.send_signal(signum)
        child.wait(timeout=5)
        assert child.returncode == 128 + signum
        assert termios.tcgetattr(slave)[3] & termios.ECHO == before[3] & termios.ECHO
print('Setup SIGINT/SIGTERM restore terminal echo; inert store never accesses native credentials.')
