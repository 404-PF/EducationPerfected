"""Run actual capability entry with inert transport, no native APIs."""
import importlib.util,pathlib,sys,os,unittest,io,contextlib,json
from unittest import mock
sys.dont_write_bytecode=True
s=importlib.util.spec_from_file_location('cap',pathlib.Path(__file__).with_name('windows-owned-pipe-capability.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Test(unittest.TestCase):
 def test_entry(self):
  for fail in ('','host','args','node','positive-transport','positive-wire','negative-exit','negative-wire'):
   calls=[]
   def run(node,args,env,cwd):
    mode=args[-1];calls.append(mode);assert set(env)<=set(('SYSTEMROOT','WINDIR','SYSTEMDRIVE','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT'));assert not {'EP_PASSWORD','NODE_OPTIONS'}&set(env)
    if fail=='positive-transport':raise RuntimeError('private')
    identity={'length':123,'sha256':'b'*64,'browserVersion':'156.0.8078.47','hashVerified':True,'extractionOwned':True,'headlessMode':'test-shell-full-browser','executableSource':'owned-extraction-of-pinned-archive'}
    lines=[b'EP_DIAGNOSTIC_DRIVER_STAGE='+json.dumps({'nonce':'a'*64,'mode':'source','stage':x}).encode() for x in m.p.STAGES]
    lines.append(b'EP_OWNED_PIPE_SUCCESS='+json.dumps({'nonce':'a'*64,'mode':'source','identity':identity,'ready':True,'owned':True,'cleanupCertain':True}).encode());wire=b'\n'.join(lines)+b'\n'
    if fail=='positive-wire' and mode=='pass':wire+=b'private'
    return wire,0 if mode=='pass' or fail=='negative-exit' else 7
   out=io.StringIO();argv=['fixed','/fixed/node.exe']+(['extra'] if fail=='args' else [])
   with mock.patch.object(m.sys,'platform','linux' if fail=='host' else 'win32'),mock.patch.object(m.sys,'argv',argv),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_PASSWORD':'private','NODE_OPTIONS':'private'},clear=True),mock.patch.object(pathlib.Path,'is_file',return_value=fail!='node'),mock.patch.object(pathlib.Path,'is_symlink',return_value=False),mock.patch.object(m.t,'run',side_effect=run),contextlib.redirect_stdout(out):code=m.entry()
   # negative-wire mode deliberately still returns a valid record with exit7;
   # protocol must reject on exit regardless of valid-looking positive bytes.
   ok=fail in ('','negative-wire');self.assertEqual(code,0 if ok else 20);self.assertNotIn('private',out.getvalue())
   if fail in ('host','args','node'):self.assertEqual(calls,[])
   if fail in ('positive-transport','positive-wire'):self.assertEqual(calls,['pass'])
if __name__=='__main__':unittest.main()
