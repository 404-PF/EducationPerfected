"""Inert tests of actual capability code. No Mac/native/keychain work."""
import importlib.util,pathlib,sys,unittest,unittest.mock as M,types,socket,errno,subprocess,os
HERE=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
import probe,run
class Tests(unittest.TestCase):
 def test_profile(self):
  text=(HERE/'boundary.sb').read_text()
  self.assertIn('(deny network*)',text);self.assertIn('(deny mach-lookup)',text)
  self.assertEqual(text.count('(allow network'),3)
  self.assertNotIn('(allow network*',text);self.assertNotIn('(remote unix-socket)',text)
  self.assertIn('(remote tcp "localhost:43187")',text)
  self.assertNotIn('EP_LOGIN',text)
 def test_exact_denials(self):
  class Sock:
   def __init__(self,e):self.e=e
   def __enter__(self):return self
   def __exit__(self,*x):pass
   def settimeout(self,x):pass
   def connect(self,x):
    if self.e is not None:raise OSError(self.e,'private')
   def sendto(self,*x):return self.connect(None)
  for code in (errno.EPERM,errno.EACCES):
   with M.patch.object(probe.socket,'socket',return_value=Sock(code)) as call:probe.denied_direct();self.assertEqual(call.call_count,4)
  for code in (None,errno.ENETUNREACH,errno.ECONNREFUSED,errno.ETIMEDOUT):
   with M.patch.object(probe.socket,'socket',return_value=Sock(code)):
    with self.assertRaises(RuntimeError):probe.denied_direct()
 def test_wrong_port_requires_policy_errno(self):
  class Sock:
   def __enter__(self):return self
   def __exit__(self,*x):pass
   def settimeout(self,x):pass
   def connect(self,address):self.address=address;raise OSError(errno.EPERM,'inert')
  with M.patch.object(probe.socket,'socket',return_value=Sock()):probe.denied_other_loopback_port()
 def test_lookup_not_equated_to_proof(self):
  with M.patch.object(probe.socket,'getaddrinfo',side_effect=socket.gaierror()):probe.denied_lookup()
  with M.patch.object(probe.socket,'getaddrinfo',return_value=[]):
   with self.assertRaises(RuntimeError):probe.denied_lookup()
 def test_real_bounded_capture(self):
  cases=[(run.EXPECTED,b'',0,True),(run.EXPECTED,run.WARNING,0,True),(run.EXPECTED,b'unknown private error',0,False),(run.EXPECTED*2,b'',0,False),(b'x'*1000,b'',0,False),(run.EXPECTED,b'',1,False)]
  for out,err,code,okay in cases:
   code_text='import os;os.write(1,'+repr(out)+');os.write(2,'+repr(err)+');raise SystemExit('+str(code)+')'
   p=subprocess.Popen([sys.executable,'-c',code_text],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
   if okay:run.collect(p)
   else:
    with self.assertRaises(RuntimeError):run.collect(p)
   self.assertIsNotNone(p.poll())
 def test_host_and_command_gate(self):
  env={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'macOS'}
  with M.patch.object(run.sys,'platform','darwin'),M.patch.object(run.platform,'machine',return_value='arm64'),M.patch.object(run.os,'getuid',return_value=1001),M.patch.object(run.sys,'argv',['fixed']),M.patch.dict(run.os.environ,env,clear=True),M.patch.object(run.subprocess,'Popen') as popen,M.patch.object(run,'collect'),M.patch('builtins.print'):
   run.main();args=popen.call_args.args[0];self.assertEqual(args[0],'/usr/bin/sandbox-exec');self.assertEqual(args[1],'-f');self.assertEqual(args[-1],str(HERE/'probe.py'))
  with M.patch.object(run.sys,'platform','linux'),M.patch.object(run.subprocess,'Popen') as popen:
   with self.assertRaises(RuntimeError):run.main()
   popen.assert_not_called()
 def test_no_product_workflow(self):
  s=(HERE.parents[1]/'.github/workflows/phase3-normal-read-once.yml').read_text()
  for value in ['npm ci','build-sea','gnome-keyring','macos-isolated-store','upload-artifact','workflow_dispatch']:self.assertNotIn(value,s)
  self.assertIn('runner: [macos-15, macos-15-intel]',s)
if __name__=='__main__':unittest.main()
