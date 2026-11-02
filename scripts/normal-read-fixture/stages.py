"""Diagnostic vocabulary only. Never substitutes for lifecycle/admission checks."""
import selectors,subprocess,time,os
PREFIX=b'EP_NORMAL_READ_STAGE='
FAIL=b'EP_NORMAL_READ_FAILURE='
RESULT=b'EP_NORMAL_READ_RESULT='
PRODUCT=('product.admission','product.artifact','product.store.empty','product.store.seed','product.server','product.spawn','product.observe','product.quit','product.group','product.store.remove','product.cleanup')
PREFLIGHT=('preflight.identity','preflight.baseline','preflight.capabilities','preflight.fds','preflight.links','preflight.routes','preflight.nss','preflight.resolver','preflight.egress','preflight.lookup','preflight.namespace')
INNER=('boundary.inner',)+PREFLIGHT+('artifact.manifest','artifact.hash','owned.directories','bus.start','bus.ready','keyring.start','keyring.ready','display.start','display.ready','display.read','display.number','product.environment','product.helper')+PRODUCT+('owned.empty','inner.cleanup')
ALL=('boundary.enter',)+INNER+('boundary.cleanup',)
MAX_BYTES=4096
class DiagnosticError(Exception):pass
class Stages:
 def __init__(self):self.current=None;self.primary=None
 def mark(self,token):
  if token not in ALL:raise DiagnosticError()
  self.current=token;print((PREFIX+token.encode()).decode(),flush=True)
 def failed(self,token=None):
  if self.primary is None:self.primary=token or self.current
 def finish(self,good):
  if not good:
   if self.primary not in ALL:raise DiagnosticError()
   print((FAIL+self.primary.encode()).decode(),flush=True)
  print('EP_NORMAL_READ_RESULT='+('pass' if good else 'fail'),flush=True)
def parse(data,sequence,cleanup):
 if cleanup!=sequence[-1]:raise DiagnosticError()
 if len(data)>MAX_BYTES or not data.endswith(b'\n'):raise DiagnosticError()
 lines=data.splitlines(keepends=True)
 if len(lines)>len(sequence)+2:raise DiagnosticError()
 seen=[];failure=None;result=None;aborted=False;position=-1
 for line in lines:
  if line.startswith(PREFIX) and failure is None and result is None:
   token=line[len(PREFIX):-1].decode('ascii')
   # A normal contiguous prefix; failure unwinding may skip only to a
   # declared cleanup stage, never resume operational stages afterward.
   cleanups=('product.cleanup','inner.cleanup')
   if token not in sequence or token in seen:raise DiagnosticError()
   index=sequence.index(token)
   if index<=position:raise DiagnosticError()
   if index!=position+1:
    if token not in cleanups:raise DiagnosticError()
    aborted=True
   if aborted and token not in cleanups:raise DiagnosticError()
   position=index;seen.append(token)
  elif line.startswith(FAIL) and failure is None and result is None:
   failure=line[len(FAIL):-1].decode('ascii')
   candidates=seen[-1:] + [x for x in seen if x not in ('product.cleanup','inner.cleanup')][-1:]
   if seen[-2:]==['product.cleanup','inner.cleanup']:candidates.append('product.cleanup')
   if failure not in candidates:raise DiagnosticError()
  elif line in (RESULT+b'pass\n',RESULT+b'fail\n') and result is None:
   result=line==RESULT+b'pass\n'
  else:raise DiagnosticError()
 if result is None or (result and (failure is not None or tuple(seen)!=sequence)) or (not result and failure is None):raise DiagnosticError()
 return seen,failure,result

def capture(args,*,env,timeout,sequence,cleanup,stdin=subprocess.DEVNULL,**kwargs):
 """Bound stdout/stderr while reading, not after an unbounded communicate()."""
 p=subprocess.Popen(args,env=env,stdin=stdin,stdout=subprocess.PIPE,stderr=subprocess.PIPE,close_fds=True,**kwargs)
 data=bytearray();end=time.monotonic()+timeout
 try:
  with selectors.DefaultSelector() as sel:
   sel.register(p.stdout,selectors.EVENT_READ,'out');sel.register(p.stderr,selectors.EVENT_READ,'err')
   while sel.get_map():
    left=end-time.monotonic()
    if left<=0:raise DiagnosticError()
    for key,_ in sel.select(min(left,.25)):
     chunk=os.read(key.fileobj.fileno(),min(512,MAX_BYTES+1-len(data)))
     if not chunk:sel.unregister(key.fileobj);continue
     if key.data=='err':raise DiagnosticError()
     data.extend(chunk)
     if len(data)>MAX_BYTES:raise DiagnosticError()
   code=p.wait(timeout=max(.01,end-time.monotonic()))
  seen,failure,passed=parse(bytes(data),sequence,cleanup)
  if passed!=(code==0):raise DiagnosticError()
  return seen,failure,passed
 finally:
  if p.poll() is None:p.kill();p.wait(timeout=5)
  p.stdout.close();p.stderr.close()
