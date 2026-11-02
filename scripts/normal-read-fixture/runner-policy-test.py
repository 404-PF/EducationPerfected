"""Inert refusal tests for actual preflight. No namespace/store/display/product."""
import importlib.util,pathlib,unittest.mock as mock,types,os,sys
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parent))
p=pathlib.Path(__file__).with_name('run-isolated.py');spec=importlib.util.spec_from_file_location('runner',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def refused():
 try:m.preflight()
 except RuntimeError:return
 raise AssertionError('Expected refusal')
with mock.patch.object(m.os,'getuid',return_value=0):refused()
with mock.patch.object(m.os,'getuid',return_value=1001),mock.patch.object(m.os,'isatty',return_value=True):refused()
with mock.patch.object(m.os,'getuid',return_value=1001),mock.patch.object(m.os,'isatty',return_value=False),mock.patch.object(m.sys,'argv',['fixed','extra']):refused()
original=pathlib.Path.read_text
for status in ['CapEff:\t0000000000000001\nNoNewPrivs:\t1','CapEff:\t0000000000000000\nNoNewPrivs:\t0']:
 def read(p,*a,**k):return status if str(p)=='/proc/self/status' else original(p,*a,**k)
 with mock.patch.object(m.os,'getuid',return_value=1001),mock.patch.object(m.os,'isatty',return_value=False),mock.patch.object(m.sys,'argv',['fixed']),mock.patch.object(pathlib.Path,'read_text',read):refused()
# This suite deliberately never calls main. It does not simulate successful native use.
print('Actual runner preflight root/TTY/argv/capability/no_new_privs refusal passed (inert).')
