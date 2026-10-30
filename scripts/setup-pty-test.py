# Linux/macOS PTY integration: run ONLY inside a disposable credential-store session.
import os,pty,subprocess,select,time,termios
assert os.environ.get('EP_DISPOSABLE_STORE_TEST') == '1', 'Run only with the disposable-store test wrapper'
master,slave=pty.openpty()
before=termios.tcgetattr(slave)
p=subprocess.Popen(['node','bin/cli.js','--setup'],stdin=slave,stdout=slave,stderr=slave,cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),close_fds=True)
data=b''
def until(marker):
 global data
 deadline=time.time()+8
 while marker not in data:
  if time.time()>deadline: raise AssertionError('prompt timeout')
  if select.select([master],[],[],.1)[0]: data+=os.read(master,65536)
until(b'EP email');os.write(master,b'fixture@example.test\r')
until(b'EP password');os.write(master,b'fixture-only-password\r')
p.wait(timeout=10)
while select.select([master],[],[],.1)[0]:
 data+=os.read(master,65536)
assert p.returncode==0,data
assert b'fixture@example.test' not in data and b'fixture-only-password' not in data
assert b'Login saved in the OS credential store.' in data
assert termios.tcgetattr(slave)[3] & termios.ECHO == before[3] & termios.ECHO
os.close(master);os.close(slave)
print('Real PTY setup: both fields hidden, native write succeeds, terminal echo restored.')
# Check raw-terminal restoration when setup is interrupted before any save.
for signum in [2, 15]:
 master,slave=pty.openpty(); before=termios.tcgetattr(slave)
 p=subprocess.Popen(['node','bin/cli.js','--setup'],stdin=slave,stdout=slave,stderr=slave,cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),close_fds=True)
 data=b''; until(b'EP email'); p.send_signal(signum); p.wait(timeout=5)
 assert p.returncode==128+signum
 assert termios.tcgetattr(slave)[3] & termios.ECHO == before[3] & termios.ECHO
 os.close(master);os.close(slave)
print('Setup SIGINT/SIGTERM restore terminal echo before exiting.')
