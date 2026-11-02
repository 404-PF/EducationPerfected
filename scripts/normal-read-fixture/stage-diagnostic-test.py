"""Inert injection of actual diagnostic parser/capture and Python runners.
No namespace, mount, native credential store, browser, or product is launched.
"""
import contextlib,io,importlib.util,json,pathlib,subprocess,sys,tempfile,types,unittest,unittest.mock as M
HERE=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import stages as S

def module(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m

def wire(seq,failure=None,passed=False):
 return b''.join(S.PREFIX+x.encode()+b'\n' for x in seq)+(S.FAIL+failure.encode()+b'\n' if failure else b'')+S.RESULT+(b'pass\n' if passed else b'fail\n')
class Tests(unittest.TestCase):
 def test_parser(self):
  for seq,cleanup in [(S.PRODUCT,'product.cleanup'),(S.INNER,'inner.cleanup')]:
   self.assertTrue(S.parse(wire(seq,passed=True),seq,cleanup)[2])
   for i,t in enumerate(seq):
    tail=tuple(x for x in ('product.cleanup','inner.cleanup') if x in seq and seq.index(x)>i)
    trace=seq[:i+1]+tail
    self.assertEqual(S.parse(wire(trace,t),seq,cleanup)[1],t)
   bad=[b'',b'raw path /private\n',wire(seq,passed=True)+b'x',wire(seq,passed=True).replace(b'\n',b'\r\n'),wire(seq,passed=True).replace(S.PREFIX,S.PREFIX+b'unknown.',1),wire(seq,passed=True)+wire(seq,passed=True),S.PREFIX+b'x'*5000+b'\n',wire(seq,passed=True).replace(S.PREFIX+seq[0].encode()+b'\n',b'',1),wire(seq,passed=True).replace(S.PREFIX+seq[0].encode()+b'\n',(S.PREFIX+seq[0].encode()+b'\n')*2,1),wire(seq[:1],seq[-1]),wire(seq[:1],passed=True),wire(seq[:1],seq[0]).replace(b'fail\n',b'pass\n'),wire(seq[:1],seq[0])+b'\xff\n']
   for data in bad:
    with self.assertRaises((S.DiagnosticError,UnicodeError)):S.parse(data,seq,cleanup)
 def test_actual_outer_capture(self):
  # Real bounded pipe reader, but only an inert Python writer is launched.
  good=wire(S.PRODUCT,passed=True)
  cases=[(good,b'',0,True),(wire(S.PRODUCT[:2],'product.artifact'),b'',1,False)]
  for data,err,code,passed in cases:
   script='import os;os.write(1,'+repr(data)+');os.write(2,'+repr(err)+');raise SystemExit('+str(code)+')'
   self.assertEqual(S.capture([sys.executable,'-c',script],env={},timeout=3,sequence=S.PRODUCT,cleanup='product.cleanup')[2],passed)
  for data,err,code in [(good,b'error private value',0),(good,b'',1),(wire(S.PRODUCT[:1],'product.admission'),b'',0),(b'x'*100000,b'',1),(good+good,b'',0),(b'EP_NORMAL_READ_STAGE=arbitrary\n',b'',1)]:
   script='import os;os.write(1,'+repr(data)+');os.write(2,'+repr(err)+');raise SystemExit('+str(code)+')'
   with self.assertRaises(S.DiagnosticError):S.capture([sys.executable,'-c',script],env={},timeout=3,sequence=S.PRODUCT,cleanup='product.cleanup')
  with self.assertRaises(S.DiagnosticError):S.capture([sys.executable,'-c','import time;time.sleep(5)'],env={},timeout=.05,sequence=S.PRODUCT,cleanup='product.cleanup')
 def test_outer_executed_main(self):
  m=module('outer','enter-boundary.py')
  for response in [(S.INNER[:S.INNER.index('preflight.capabilities')+1],'preflight.capabilities',False),(S.INNER,None,True)]:
   m.stages=S.Stages();out=io.StringIO()
   with tempfile.TemporaryDirectory() as d,contextlib.redirect_stdout(out),M.patch.object(m.os,'getuid',return_value=1001),M.patch.object(m,'create_baseline',return_value=None),M.patch.object(m.os,'readlink',return_value='net:[123]'),M.patch.object(m.sys,'argv',['fixed']),M.patch.object(m.tempfile,'mkdtemp',return_value=d),M.patch.object(m,'capture',return_value=response) as cap,M.patch.object(m.shutil,'rmtree'):
    if response[2]:m.main();m.stages.finish(True)
    else:
     with self.assertRaises(S.DiagnosticError):m.main()
     m.stages.failed();m.stages.finish(False)
    self.assertEqual(cap.call_count,1)
   self.assertNotIn(d,out.getvalue());self.assertIn('EP_NORMAL_READ_STAGE=boundary.enter',out.getvalue())
   if not response[2]:self.assertIn('EP_NORMAL_READ_FAILURE=preflight.capabilities',out.getvalue())
  m.stages=S.Stages();out=io.StringIO()
  with contextlib.redirect_stdout(out),M.patch.object(m.os,'getuid',return_value=1001),M.patch.object(m.sys,'argv',['fixed']),M.patch.object(m,'capture',side_effect=S.DiagnosticError()),M.patch.object(m,'create_baseline',return_value=None),M.patch.object(m.os,'readlink',return_value='net:[123]'):
   with self.assertRaises(S.DiagnosticError):m.main()
   m.stages.failed();m.stages.finish(False)
  self.assertIn('EP_NORMAL_READ_FAILURE=boundary.enter',out.getvalue())
 def test_outer_with_real_capture_malformed(self):
  m=module('outer_real','enter-boundary.py')
  original=S.subprocess.Popen
  for data in [b'private path /inert/secret\n',wire(S.INNER,passed=True)*2,S.PREFIX+b'unknown\n',b'x'*100000,wire(S.INNER[:2],'preflight.identity')+b'extra\n']:
   script='import os;os.write(1,'+repr(data)+');raise SystemExit(1)'
   def inert_popen(*a,**kw):return original([sys.executable,'-c',script],**kw)
   m.stages=S.Stages();out=io.StringIO()
   with contextlib.redirect_stdout(out),M.patch.object(m.os,'getuid',return_value=1001),M.patch.object(m,'create_baseline',return_value=None),M.patch.object(m.os,'readlink',return_value='net:[123]'),M.patch.object(m.sys,'argv',['fixed']),M.patch.object(S.subprocess,'Popen',side_effect=inert_popen):
    with self.assertRaises(S.DiagnosticError):m.main()
    m.stages.failed();m.stages.finish(False)
   self.assertEqual(out.getvalue(),'EP_NORMAL_READ_STAGE=boundary.enter\nEP_NORMAL_READ_STAGE=boundary.cleanup\nEP_NORMAL_READ_FAILURE=boundary.enter\nEP_NORMAL_READ_RESULT=fail\n')
 def test_inner_stage_injection(self):
  m=module('inner','run-isolated.py')
  # Throw at each real mark before the adjacent operation. The collector is the
  # only injection seam; there is no runtime env/argv failure-injection option.
  for target in S.INNER:
   if target in S.PRODUCT:continue # covered by executed JS VM harness
   trace=[];collector=S.Stages();out=io.StringIO()
   def mark(t):
    collector.mark(t);trace.append(t)
    if t==target:raise RuntimeError('PRIVATE_SENTINEL')
   fake=types.SimpleNamespace(mark=mark,failed=collector.failed)
   fakeproc=types.SimpleNamespace(stdout=io.StringIO('unix:path=/inert\n'),stdin=io.BytesIO(),poll=lambda:None)
   class DummyPipe:
    def write(self,x):pass
    def close(self):pass
   fakeproc.stdin=DummyPipe()
   def preflight():
    for t in S.PREFLIGHT:mark(t)
    return {}
   with tempfile.TemporaryDirectory() as d,contextlib.redirect_stdout(out),M.patch.object(m,'stages',fake),M.patch.object(m,'preflight',side_effect=preflight),M.patch.object(pathlib.Path,'read_text',return_value=json.dumps({'kind':'MODIFIED-VALIDATION-ONLY-NOT-RELEASE','sha256':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'})),M.patch.object(pathlib.Path,'read_bytes',return_value=b''),M.patch.object(m.tempfile,'mkdtemp',return_value=d),M.patch.object(m.subprocess,'Popen',return_value=fakeproc),M.patch('select.select',return_value=([1],[],[])),M.patch.object(m,'cmd'),M.patch.object(m.os,'pipe',return_value=(100,101)),M.patch.object(m.os,'close'),M.patch.object(m.os,'read',return_value=b'42\n'),M.patch.object(m,'capture',return_value=(S.PRODUCT,None,True)),M.patch.object(m,'stop'),M.patch.object(m.shutil,'rmtree'):
    with self.assertRaises(BaseException):m.main()
    collector.failed();collector.finish(False)
   self.assertIn(target,trace,target)
   self.assertNotIn('PRIVATE_SENTINEL',out.getvalue())
   self.assertNotIn('EP_NORMAL_READ_RESULT=pass',out.getvalue())
 def test_actual_preflight_injections(self):
  m=module('preflight','run-isolated.py')
  # Reach each actual preflight mark with inert OS results. A thrown sentinel
  # stops execution before its following check. No OS network call is executed.
  class Sock:
   def __enter__(self):return self
   def __exit__(self,*a):pass
   def settimeout(self,x):pass
   def connect(self,x):raise OSError(101,'inert')
  texts={'/proc/self/status':'CapInh:\t0\nCapPrm:\t0\nCapEff:\t0\nCapBnd:\t0\nCapAmb:\t0\nNoNewPrivs:\t1\n','/etc/nsswitch.conf':'hosts: files dns\n','/etc/resolv.conf':'nameserver 192.0.2.53\n','/etc/hosts':'127.0.0.1 localhost\n::1 localhost\n'}
  for target in S.PREFLIGHT:
   seen=[]
   def mark(t):
    seen.append(t)
    if t==target:raise RuntimeError('injected')
   def command(args,**kw):return types.SimpleNamespace(stdout=json.dumps([{'ifname':'lo','flags':['UP']}] if args==['ip','-j','link'] else []).encode())
   with M.patch.object(m,'consume_baseline',return_value=b'net:[123]'),M.patch.object(m,'stages',types.SimpleNamespace(mark=mark)),M.patch.object(m.os,'getuid',return_value=1001),M.patch.object(m.os,'isatty',return_value=False),M.patch.object(m.sys,'argv',['fixed']),M.patch.object(pathlib.Path,'read_text',lambda p:texts[str(p)]),M.patch.object(pathlib.Path,'iterdir',return_value=[]),M.patch.object(pathlib.Path,'exists',return_value=False),M.patch.object(m,'cmd',side_effect=command),M.patch.object(m.socket,'socket',return_value=Sock()),M.patch.object(m.subprocess,'run',return_value=types.SimpleNamespace(returncode=2,stdout=b'',stderr=b'')):
    with self.assertRaisesRegex(RuntimeError,'injected'):m.preflight()
   self.assertEqual(seen[-1],target)
 def test_inner_primary_and_cleanup(self):
  m=module('cleanup_inner','run-isolated.py')
  # Actual main: operation error then stop error must keep bus.start primary.
  # A cleanup-only stop error must identify inner.cleanup, never pass.
  for operational in [True,False]:
   collector=S.Stages();out=io.StringIO()
   def preflight():
    for t in S.PREFLIGHT:collector.mark(t)
    return {}
   class DummyPipe:
    def write(self,x):pass
    def close(self):pass
   proc=types.SimpleNamespace(stdout=io.StringIO('unix:path=/inert\n'),stdin=DummyPipe(),poll=lambda:None)
   with tempfile.TemporaryDirectory() as d,contextlib.redirect_stdout(out),M.patch.object(m,'stages',collector),M.patch.object(m,'preflight',side_effect=preflight),M.patch.object(pathlib.Path,'read_text',return_value=json.dumps({'kind':'MODIFIED-VALIDATION-ONLY-NOT-RELEASE','sha256':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'})),M.patch.object(pathlib.Path,'read_bytes',return_value=b''),M.patch.object(m.tempfile,'mkdtemp',return_value=d),M.patch.object(m.subprocess,'Popen',side_effect=RuntimeError('PRIVATE') if operational else None,return_value=proc),M.patch('select.select',return_value=([1],[],[])),M.patch.object(m,'cmd'),M.patch.object(m.os,'pipe',return_value=(100,101)),M.patch.object(m.os,'close'),M.patch.object(m.os,'read',return_value=b'42\n'),M.patch.object(m,'capture',return_value=(S.PRODUCT,None,True)),M.patch.object(m,'stop',side_effect=RuntimeError('PRIVATE_CLEANUP')):
    with self.assertRaises(RuntimeError):m.main()
    collector.failed();collector.finish(False)
   self.assertIn('EP_NORMAL_READ_FAILURE='+('bus.start' if operational else 'inner.cleanup'),out.getvalue())
   self.assertNotIn('PRIVATE',out.getvalue());self.assertNotIn('RESULT=pass',out.getvalue())
 def test_primary_preserved(self):
  c=S.Stages();o=io.StringIO()
  with contextlib.redirect_stdout(o):
   c.mark('product.observe');c.failed();c.mark('inner.cleanup');c.failed();c.finish(False)
  self.assertIn('EP_NORMAL_READ_FAILURE=product.observe',o.getvalue())
if __name__=='__main__':unittest.main()
