"""Actual helper admission, protocol, privacy and fail-closed tests. Inert only."""
import importlib.util,pathlib,sys,os,io,contextlib,json,unittest
from unittest import mock
sys.dont_write_bytecode=True
s=importlib.util.spec_from_file_location('h',pathlib.Path(__file__).with_name('windows-startup-leg-helper.py'));h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
class Tests(unittest.TestCase):
 def test_helper(self):
  nonce='a'*64;sha='b'*64;version='156.0.8078.47';identity={'length':123,'sha256':sha,'browserVersion':version,'hashVerified':True,'extractionOwned':True,'headlessMode':'test-shell-full-browser','executableSource':'owned-extraction-of-pinned-archive'}
  for mode in ('source','sea'):
   stages=[x for x in h.protocol.STAGES if mode=='source' or x not in ('unpack-entered','unpacked')]
   wire=b'\n'.join([b'EP_DIAGNOSTIC_DRIVER_STAGE='+json.dumps({'nonce':nonce,'mode':mode,'stage':x}).encode() for x in stages]+[b'EP_OWNED_PIPE_SUCCESS='+json.dumps({'nonce':nonce,'mode':mode,'identity':identity,'ready':True,'owned':True,'cleanupCertain':True}).encode()])+b'\n'
   argv=['fixed','/fixed/node.exe',mode,nonce,'123',sha,version]
   for scenario in ('success','host','args','nonce','length','sha','version','node','transport','nonzero','stale','trailing','duplicate','echo-private'):
    args=argv.copy();env={'GITHUB_ACTIONS':'true','RUNNER_ENVIRONMENT':'github-hosted','RUNNER_OS':'Windows','SYSTEMROOT':'fixed','TEMP':'fixed','EP_PASSWORD':'private','NODE_OPTIONS':'private','ARBITRARY_SECRET':'private'}
    if scenario=='args':args.append('arbitrary-root')
    if scenario=='nonce':args[3]='private'
    if scenario=='length':args[4]='-1'
    if scenario=='sha':args[5]='private'
    if scenario=='version':args[6]='private'
    def transport(exe,child_args,child_env,cwd):
     assert child_args[0].endswith('windows-startup-leg.js') and child_args[1:]==args[2:]
     assert not {'EP_PASSWORD','NODE_OPTIONS','ARBITRARY_SECRET'}&set(child_env)
     if scenario=='transport':raise RuntimeError('private-host-path')
     result=wire
     if scenario=='stale':result=result.replace(nonce.encode(),b'c'*64)
     if scenario=='trailing':result+=b'\n'
     if scenario=='duplicate':result+=wire
     if scenario=='echo-private':result+=b'private'
     return result,1 if scenario=='nonzero' else 0
    output=io.StringIO()
    with mock.patch.object(h.sys,'platform','other' if scenario=='host' else 'win32'),mock.patch.object(h.sys,'argv',args),mock.patch.dict(os.environ,env,clear=True),mock.patch.object(pathlib.Path,'is_file',return_value=scenario!='node'),mock.patch.object(pathlib.Path,'is_symlink',return_value=False),mock.patch.object(h.transport,'run',side_effect=transport) as run,contextlib.redirect_stdout(output):
     code=h.entry()
    expected='EP_OWNED_PIPE_NONCE='+nonce+'\nEP_OWNED_PIPE_MODE='+mode+'\nEP_OWNED_PIPE_RESULT=pass\n' if scenario=='success' else 'EP_OWNED_PIPE_RESULT=uncertain\n'
    self.assertEqual(code,0 if scenario=='success' else 20);self.assertEqual(output.getvalue(),expected)
    if scenario in ('host','args','nonce','length','sha','version','node'):self.assertEqual(run.call_count,0)
if __name__=='__main__':unittest.main()
