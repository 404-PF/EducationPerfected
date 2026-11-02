"""Hosted Mac network capability only. No build, native store or product."""
import os,sys,pathlib,subprocess,platform,selectors,time,signal
ROOT=pathlib.Path(__file__).resolve().parent
EXPECTED=b'EP_MAC_CAPABILITY_RESULT=pass\n'
# Deprecated sandbox-exec may emit this one public fixed warning. No regex or
# unknown warning/error forwarding. A new wording fails closed.
WARNING=b'WARNING: sandbox-exec is deprecated. Consider adopting the App Sandbox instead.\n'
def require(ok):
 if not ok:raise RuntimeError('refused')
def stop_group(p):
 try:os.killpg(p.pid,signal.SIGKILL)
 except ProcessLookupError:pass
 p.wait(timeout=5)
 end=time.monotonic()+5
 while True:
  try:os.killpg(p.pid,0)
  except ProcessLookupError:return
  require(time.monotonic()<end);time.sleep(.05)
def collect(p):
 out=bytearray();err=bytearray();end=time.monotonic()+20
 try:
  with selectors.DefaultSelector() as sel:
   sel.register(p.stdout,selectors.EVENT_READ,out);sel.register(p.stderr,selectors.EVENT_READ,err)
   while sel.get_map():
    left=end-time.monotonic();require(left>0)
    for key,_ in sel.select(min(left,.2)):
     data=os.read(key.fileobj.fileno(),256)
     if not data:sel.unregister(key.fileobj);continue
     key.data.extend(data);require(len(out)<=256 and len(err)<=256)
   code=p.wait(timeout=max(.01,end-time.monotonic()))
  require(code==0 and bytes(out)==EXPECTED and bytes(err) in (b'',WARNING))
 finally:
  try:stop_group(p)
  finally:p.stdout.close();p.stderr.close()
def main():
 require(len(sys.argv)==1 and sys.platform=='darwin' and platform.machine() in ('arm64','x86_64') and os.getuid()!=0)
 require(os.environ.get('GITHUB_ACTIONS')=='true' and os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted' and os.environ.get('RUNNER_OS')=='macOS')
 p=subprocess.Popen(['/usr/bin/sandbox-exec','-f',str(ROOT/'boundary.sb'),sys.executable,str(ROOT/'probe.py')],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,close_fds=True,start_new_session=True,env={'PATH':'/usr/bin:/bin','LANG':'C'})
 collect(p)
 print('EP_MAC_CAPABILITY_RESULT=pass',flush=True)
if __name__=='__main__':
 try:main()
 except BaseException:print('EP_MAC_CAPABILITY_RESULT=fail',flush=True);sys.exit(1)
