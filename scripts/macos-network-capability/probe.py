"""Fixed no-store/no-browser capability check, not complete Mac isolation proof."""
import os,sys,socket,errno,pathlib,stat,subprocess,threading
PORT=43187
ROOT=pathlib.Path(__file__).resolve().parent
DENIED=(errno.EPERM,errno.EACCES)
def require(ok):
 if not ok:raise RuntimeError('refused')
def fd_gate():
 require(len(sys.argv)==1 and sys.platform=='darwin' and os.getuid()!=0 and not os.isatty(0))
 for p in pathlib.Path('/dev/fd').iterdir():
  try:st=os.fstat(int(p.name))
  except OSError:continue
  require(not stat.S_ISSOCK(st.st_mode))
def denied_direct():
 for family,address in [(socket.AF_INET,('192.0.2.1',9)),(socket.AF_INET6,('2001:db8::1',9))]:
  for kind in (socket.SOCK_STREAM,socket.SOCK_DGRAM):
   with socket.socket(family,kind) as s:
    s.settimeout(.5)
    try:
     if kind==socket.SOCK_STREAM:s.connect(address)
     else:s.sendto(b'capability-only',address)
    except OSError as e:require(e.errno in DENIED)
    else:raise RuntimeError('refused')
def denied_other_loopback_port():
 with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as s:
  s.settimeout(.5)
  try:s.connect(('127.0.0.1',43188))
  except OSError as e:require(e.errno in DENIED)
  else:raise RuntimeError('refused')
def denied_lookup():
 # Reserved invalid name only, never an EP lookup. Exact EAI_NONAME is not
 # proof of sandbox rejection; require DNS IPC deny separately in reviewed SBPL.
 try:socket.getaddrinfo('ep-fixture.invalid',443,type=socket.SOCK_STREAM)
 except socket.gaierror:return
 raise RuntimeError('refused')
def child():
 fd_gate();denied_direct();denied_other_loopback_port();denied_lookup()
 with socket.create_connection(('127.0.0.1',PORT),timeout=2) as s:
  s.sendall(b'capability-only');require(s.recv(2)==b'ok')
 print('EP_MAC_CAPABILITY_CHILD=pass',flush=True)
def main():
 fd_gate();denied_direct();denied_other_loopback_port();denied_lookup()
 # Listener must really bind fixed IPv4 loopback, never wildcard.
 with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as listener:
  listener.settimeout(4);listener.bind(('127.0.0.1',PORT));listener.listen(1)
  require(listener.getsockname()==('127.0.0.1',PORT));state=[]
  def serve():
   try:
    conn,remote=listener.accept()
    with conn:
     conn.settimeout(2);require(remote[0]=='127.0.0.1');require(conn.recv(64)==b'capability-only');conn.sendall(b'ok')
    state.append(True)
   except BaseException:state.append(False)
  thread=threading.Thread(target=serve,daemon=True);thread.start()
  # No second sandbox invocation: inherited policy must hold in the child.
  run=subprocess.run([sys.executable,str(ROOT/'child.py')],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8,close_fds=True,env={'PATH':'/usr/bin:/bin','LANG':'C'})
  thread.join(timeout=5);require(not thread.is_alive() and state==[True])
  require(run.returncode==0 and run.stdout==b'EP_MAC_CAPABILITY_CHILD=pass\n' and not run.stderr)
 print('EP_MAC_CAPABILITY_RESULT=pass',flush=True)
if __name__=='__main__':
 try:main()
 except BaseException:print('EP_MAC_CAPABILITY_RESULT=fail',flush=True);sys.exit(1)
