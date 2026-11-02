"""Inert machine/runner/manifest architecture consistency contracts."""
import importlib.util,pathlib,sys,unittest,unittest.mock as M,json,io,contextlib
HERE=pathlib.Path(__file__).resolve().parent;sys.path.insert(0,str(HERE))
spec=importlib.util.spec_from_file_location('runner',HERE/'run-isolated.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Tests(unittest.TestCase):
 def test_native_targets(self):
  for machine,arch in [('x86_64','x64'),('aarch64','arm64')]:
   with M.patch.object(m.platform,'machine',return_value=machine),M.patch.object(m.sys,'platform','linux'):self.assertEqual(m.native_arch(),arch)
  for machine in ['AMD64','arm64','i386','riscv64','x86_64\n']:
   with M.patch.object(m.platform,'machine',return_value=machine),M.patch.object(m.sys,'platform','linux'):
    with self.assertRaises(RuntimeError):m.native_arch()
  with M.patch.object(m.sys,'platform','darwin'):
   with self.assertRaises(RuntimeError):m.native_arch()
 def test_workflow(self):
  source=(HERE.parents[1]/'.github/workflows/phase3-normal-read-once.yml').read_text()
  self.assertEqual(source.count('runs-on:'),1);self.assertIn('runs-on: ubuntu-22.04-arm',source);self.assertNotIn('matrix:',source);self.assertIn('test "$(uname -m)" = aarch64',source)
  self.assertIn('process.arch!=="arm64"',source);self.assertIn('build/linux-arm64-normal-read-fixture-private/PRIVATE-FIXTURE.json',source);self.assertNotIn('linux-x64-normal-read-fixture-private',source)
 def test_actual_manifest_gate(self):
  for machine,arch in [('x86_64','x64'),('aarch64','arm64')]:
   for manifest_arch in [arch,'arm64' if arch=='x64' else 'x64']:
    with contextlib.redirect_stdout(io.StringIO()),M.patch.object(m,'preflight',return_value={}),M.patch.object(m.platform,'machine',return_value=machine),M.patch.object(m.sys,'platform','linux'),M.patch.object(pathlib.Path,'read_text',return_value=json.dumps({'kind':'MODIFIED-VALIDATION-ONLY-NOT-RELEASE','arch':manifest_arch,'sha256':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'})),M.patch.object(pathlib.Path,'read_bytes',return_value=b''),M.patch.object(m.tempfile,'mkdtemp',side_effect=RuntimeError('directories-sentinel')) as create:
     with self.assertRaises(RuntimeError):m.main()
    self.assertEqual(create.call_count,1 if arch==manifest_arch else 0)
 def test_fixed_path_and_manifest_gate(self):
  source=(HERE/'run-isolated.py').read_text()
  self.assertIn("manifest['arch']==arch",source);self.assertIn("pathlib.Path('/opt/hostedtoolcache/node/22.23.4')/arch/'bin/node'",source)
  self.assertNotIn('EP_FIXTURE_ARCH',source);self.assertNotIn('EP_FIXTURE_NODE',source)
if __name__=='__main__':unittest.main()
