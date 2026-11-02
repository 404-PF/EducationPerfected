"""Inert sealed baseline handoff tests; never unshare or launch native code."""
import fcntl,importlib.util,io,json,os,pathlib,subprocess,sys,tempfile,unittest,unittest.mock as M,contextlib
HERE=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import namespace_baseline as N
CHILD="import sys,os;sys.path.insert(0,sys.argv[1]);import namespace_baseline as n;v=n.consume();assert v.startswith(b'net:[');assert os.readlink('/proc/self/fd/0')=='/dev/null';print('sealed-data-consumed-closed')"
class Tests(unittest.TestCase):
 def test_actual_fd(self):
  fd=N.create()
  try:
   self.assertEqual(fcntl.fcntl(fd,fcntl.F_GET_SEALS),N.SEALS)
   for op in [lambda:os.write(fd,b'x'),lambda:os.ftruncate(fd,0),lambda:os.ftruncate(fd,100)]:
    with self.assertRaises(OSError):op()
   r=subprocess.run([sys.executable,'-c',CHILD,str(HERE)],stdin=fd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3)
   self.assertEqual((r.returncode,r.stdout,r.stderr),(0,b'sealed-data-consumed-closed\n',b''))
  finally:os.close(fd)
 def test_identities(self):
  for value in [b'',b'net:[0]',b'net:[0123]',b'net:[1]\n',b'pid:[123]',b'net:[-1]',b'net:[x]',b'net:['+b'1'*40+b']',b'net:[1]/private',b'net:[\xff]']:
   with self.assertRaises(N.BaselineRefused):N.identity(value)
  self.assertEqual(N.identity(b'net:[4026531992]'),b'net:[4026531992]')
 def test_refuse_fd_variants(self):
  for mode in ['file','unsealed','wrongname','wrongmode','offset','overlong','malformed']:
   if mode=='file':file=tempfile.TemporaryFile();fd=file.fileno();os.write(fd,b'net:[123]');os.fchmod(fd,0o400);os.lseek(fd,0,0)
   else:
    fd=os.memfd_create('other' if mode=='wrongname' else N.NAME,os.MFD_ALLOW_SEALING);os.write(fd,b'x'*100 if mode=='overlong' else b'net:[bad]' if mode=='malformed' else b'net:[123]');os.fchmod(fd,0o600 if mode=='wrongmode' else 0o400);os.lseek(fd,1 if mode=='offset' else 0,0)
    if mode!='unsealed':fcntl.fcntl(fd,fcntl.F_ADD_SEALS,N.SEALS)
   try:
    r=subprocess.run([sys.executable,'-c',CHILD,str(HERE)],stdin=fd,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=3)
    self.assertNotEqual(r.returncode,0,mode);self.assertEqual(r.stdout,b'')
   finally:
    if mode=='file':file.close()
    else:os.close(fd)
 def test_bootstrap_actual_capture_handoff(self):
  spec=importlib.util.spec_from_file_location('outer',HERE/'enter-boundary.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  import stages
  original=subprocess.Popen
  script="import sys;sys.path.insert(0,sys.argv[1]);import namespace_baseline as n;import stages as s;n.consume();print('EP_NORMAL_READ_STAGE=boundary.inner');print('EP_NORMAL_READ_STAGE=preflight.identity');print('EP_NORMAL_READ_STAGE=preflight.baseline');print('EP_NORMAL_READ_FAILURE=preflight.baseline');print('EP_NORMAL_READ_RESULT=fail');raise SystemExit(1)"
  seen=[]
  def inert(args,**kwargs):
   self.assertEqual(args[0],'unshare');self.assertIsInstance(kwargs['stdin'],int);seen.append(kwargs['stdin'])
   return original([sys.executable,'-c',script,str(HERE)],**kwargs)
  out=io.StringIO()
  with contextlib.redirect_stdout(out),M.patch.object(m.os,'getuid',return_value=os.getuid()),M.patch.object(m.sys,'argv',['fixed']),M.patch.object(subprocess,'Popen',side_effect=inert):
   with self.assertRaises(stages.DiagnosticError):m.main()
   m.stages.failed();m.stages.finish(False)
  self.assertIn('EP_NORMAL_READ_FAILURE=preflight.baseline',out.getvalue())
  self.assertNotIn('net:[',out.getvalue());self.assertEqual(len(seen),1)
  with self.assertRaises(OSError):os.fstat(seen[0])
 def test_actual_preflight_equality_gate(self):
  spec=importlib.util.spec_from_file_location('inner',HERE/'run-isolated.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
  class Sock:
   def __enter__(self):return self
   def __exit__(self,*x):pass
   def settimeout(self,x):pass
   def connect(self,x):raise OSError(101,'inert')
  texts={'/proc/self/status':'CapInh:\t0\nCapPrm:\t0\nCapEff:\t0\nCapBnd:\t0\nCapAmb:\t0\nNoNewPrivs:\t1\n','/etc/nsswitch.conf':'hosts: files dns\n','/etc/resolv.conf':'nameserver 192.0.2.53\n','/etc/hosts':'127.0.0.1 localhost\n::1 localhost\n'}
  for current,okay in [('net:[123]',False),('net:[124]',True),('garbage',False)]:
   calls=[]
   def link(p):calls.append(str(p));return current
   def cmd(args,**kw):return type('R',(),{'stdout':json.dumps([{'ifname':'lo','flags':['UP']}] if args==['ip','-j','link'] else []).encode()})()
   with contextlib.redirect_stdout(io.StringIO()),M.patch.object(m,'consume_baseline',return_value=b'net:[123]'),M.patch.object(m.os,'getuid',return_value=1001),M.patch.object(m.os,'isatty',return_value=False),M.patch.object(m.sys,'argv',['fixed']),M.patch.object(pathlib.Path,'read_text',lambda p:texts[str(p)]),M.patch.object(pathlib.Path,'iterdir',return_value=[]),M.patch.object(pathlib.Path,'exists',return_value=False),M.patch.object(m,'cmd',side_effect=cmd),M.patch.object(m.socket,'socket',return_value=Sock()),M.patch.object(m.subprocess,'run',return_value=type('R',(),{'returncode':2,'stdout':b'','stderr':b''})()),M.patch.object(m.os,'readlink',side_effect=link):
    if okay:self.assertEqual(m.preflight()['namespace'],'loopback-only')
    else:
     with self.assertRaises((RuntimeError,N.BaselineRefused)):m.preflight()
   self.assertEqual(calls,['/proc/self/ns/net']);self.assertNotIn('/proc/1/ns/net',calls)
if __name__=='__main__':unittest.main()
