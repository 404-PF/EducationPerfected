#!/usr/bin/env python3
"""Inert probe privacy/closure/parser contracts only. No Windows API/browser."""
import importlib.util,pathlib,sys,os,json,io,tempfile,shutil,contextlib
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('probe',pathlib.Path(__file__).with_name('windows-stage-transport-probe.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
nonce='a'*64
stages=p.helper.DRIVER_STAGES[:5]
data=b''.join(b'EP_DIAGNOSTIC_DRIVER_STAGE='+json.dumps({'nonce':nonce,'mode':'source','stage':stage},separators=(',',':')).encode()+b'\r\n' for stage in stages)
assert p.evidence(data)['strictPrefixStage']=='archive-check-entered'
for bad in (b'',b'private-host-path',b'\x1b[?25l'+data,data.replace(nonce.encode(),b'b'*64),data+data,data.replace(b'cli-root-checked',b'archive-verified')):
    assert p.evidence(bad)['strictPrefixStage']=='unknown'
assert p.evidence(b'\x1b[?25l'+data)['vtPresent'] is True
root=pathlib.Path(tempfile.mkdtemp(prefix='ep-probe-inert-')).resolve();node=root/'node.exe';node.write_bytes(b'inert')
try:
 for scenario in ('success','wrapped','unconfirmed','setup-failure','closed-child-failure','no-drain','returned-without-confirm','private-transport-error','private-closure-error'):
    calls=[]
    def transport(exe,args,env,cwd,**kwargs):
        calls.append((exe,args,env,cwd,kwargs))
        assert kwargs.get('process_budget_ms',30000)==30000 and not kwargs.get('prompts')
        if scenario!='no-drain':kwargs['on_drain'](b'\x1b[?25l'+data if scenario=='wrapped' else data)
        if scenario=='unconfirmed':raise p.helper.conpty.ExitUnconfirmed('job-exit-unconfirmed')
        if scenario=='private-closure-error':raise p.helper.conpty.ExitUnconfirmed('private cleanup error /private-host-path')
        if scenario!='returned-without-confirm':kwargs['on_closed']()
        if scenario=='setup-failure':raise RuntimeError('process-create')
        if scenario=='private-transport-error':raise RuntimeError('private transport error /private-host-path')
        if scenario=='closed-child-failure':raise RuntimeError('console-child-nonzero')
    with mock.patch.object(p.sys,'platform','win32'),mock.patch.object(p.sys,'argv',['fixed',str(node)]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_EMAIL':'private','EP_PASSWORD':'private','NODE_OPTIONS':'private','NODE_EXTRA_CA_CERTS':'private','ARBITRARY_SECRET':'private'},clear=True),mock.patch.object(p.helper.conpty,'run_console',side_effect=transport),contextlib.redirect_stdout(io.StringIO()) as out:
        code=p.entry()
    record=json.loads(out.getvalue().split('=',1)[1]);assert len(calls)==1
    assert record['observedClosed']==(scenario not in ('unconfirmed','returned-without-confirm','private-closure-error'))
    assert record['outcome']==('wire-observed' if scenario=='success' else 'wire-parser-unknown' if scenario in ('wrapped','no-drain') else 'uncertainty')
    assert code==(0 if scenario=='success' else 20)
    assert record['stage']==('console-command-failed' if scenario in ('private-transport-error','private-closure-error') else 'job-exit-unconfirmed' if scenario=='unconfirmed' else 'process-create' if scenario=='setup-failure' else 'console-child-nonzero' if scenario=='closed-child-failure' else 'complete')
    assert 'private' not in out.getvalue() and str(root) not in out.getvalue() and nonce not in out.getvalue()
    assert all(name not in calls[0][2] for name in ('EP_EMAIL','EP_PASSWORD','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','ARBITRARY_SECRET'))
 # Exercise the actual parent entry catch, not the ConPTY drain observer catch.
 for exception_type in (KeyboardInterrupt,SystemExit):
  for closure_confirmed in (False,True):
    def interrupted_transport(exe,args,env,cwd,**kwargs):
        kwargs['on_drain'](data)
        if closure_confirmed:kwargs['on_closed']()
        raise exception_type('private interrupt /private-host-path')
    with mock.patch.object(p.sys,'platform','win32'),mock.patch.object(p.sys,'argv',['fixed',str(node)]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted'},clear=True),mock.patch.object(p.helper.conpty,'run_console',side_effect=interrupted_transport),contextlib.redirect_stdout(io.StringIO()) as out,contextlib.redirect_stderr(io.StringIO()) as err:
        code=p.entry()
    text=out.getvalue();assert text.count('EP_STAGE_PROBE=')==1 and len(text.splitlines())==1
    record=json.loads(text.split('=',1)[1])
    assert code==20 and record['outcome']=='uncertainty' and record['stage']=='console-command-failed'
    assert record['observedClosed'] is closure_confirmed
    assert record['strictPrefixStage']=='archive-check-entered' and record['streamObserved'] is True
    assert 'private' not in text and str(root) not in text and nonce not in text and err.getvalue()==''
 child=pathlib.Path(__file__).with_name('windows-stage-transport-probe.js').read_text()
 assert all(token not in child for token in ('puppeteer','child_process','node:fs','require(\'fs\')'))
 assert 'process.argv.length!==2' in child
 print('Zero-browser probe strict parser/VT/stale/duplicate controls and independent closure/status/privacy tests passed (inert only).')
finally:shutil.rmtree(root)

# Pre-allocation host rejection reasons use only fixed booleans.
good=dict(GITHUB_ACTIONS='true',RUNNER_OS='Windows',RUNNER_ENVIRONMENT='github-hosted')
keys=set(p.HOST_KEYS)
for scenario in ('platform','actions','os','hosted','argc0','argc2','all','missing'):
 env=good.copy();platform='win32';argv=['fixed','PRIVATE_NODE_PATH'];false=set()
 if scenario in ('platform','all'):platform='PRIVATE_PLATFORM';false.add('platformMatch')
 for case,name,key in [('actions','GITHUB_ACTIONS','actionsMatch'),('os','RUNNER_OS','runnerOSMatch'),('hosted','RUNNER_ENVIRONMENT','hostedMatch')]:
  if scenario in (case,'all'):env[name]='PRIVATE_'+name;false.add(key)
 if scenario in ('argc0','all'):argv=['fixed'];false.add('argumentCountMatch')
 if scenario=='argc2':argv+=['PRIVATE_EXTRA'];false.add('argumentCountMatch')
 if scenario=='missing':env={};false.update(('actionsMatch','runnerOSMatch','hostedMatch'))
 with mock.patch.object(p.sys,'platform',platform),mock.patch.object(p.sys,'argv',argv),mock.patch.dict(os.environ,env,clear=True),mock.patch.object(p.helper.conpty,'run_console',side_effect=AssertionError('native must not run')) as native,mock.patch.object(p.pathlib,'Path',side_effect=AssertionError('metadata must not run')) as path,contextlib.redirect_stdout(io.StringIO()) as out:
  code=p.entry()
 raw=out.getvalue();r=json.loads(raw.split('=',1)[1]);assert code==20 and r['stage']=='probe-host' and r['outcome']=='uncertainty';assert not native.called and not path.called;assert set(r['hostChecks'])==keys;assert {k for k,v in r['hostChecks'].items() if v is False}==false;assert all(type(v) is bool for v in r['hostChecks'].values());assert 'PRIVATE' not in raw and len(raw.splitlines())==1;assert r['observedClosed'] is False and r['streamObserved'] is False and r['strictPrefixStage']=='unknown'
# A diagnostic calculation exception never promotes host acceptance or closes anything.
with mock.patch.object(p,'host_checks',side_effect=KeyboardInterrupt('PRIVATE')),contextlib.redirect_stdout(io.StringIO()) as out:
 assert p.entry()==20
r=json.loads(out.getvalue().split('=',1)[1]);assert set(r['hostChecks'])==keys and set(r['hostChecks'].values())=={'unknown'} and r['stage']=='probe-host'
print('Host guard fixed-key refusal/privacy/no-metadata/no-native controls passed (inert only).')

# Inert fixed-key shape reasons supplement, never replace, strict acceptance.
import unittest
import importlib.util
spec=importlib.util.spec_from_file_location('probe_shape',pathlib.Path(__file__).with_name('windows-stage-transport-probe.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
shape,KEYS,PREFIX,STAGES=p.wire_shape,p.WIRE_KEYS,p.PREFIX,p.STAGES
ns={'observed_driver_stage':p.helper.observed_driver_stage}
N='a'*64
def row(st,**kw):return PREFIX+json.dumps(dict(nonce=N,mode='source',stage=st,**kw),separators=(',',':')).encode()+b'\r\n'
D=b''.join(row(x) for x in STAGES[:5])
class Checks(unittest.TestCase):
 def test_reason_matrix(self):
  cases=[(D,'accepted-prefix'),(b'','no-marker-line'),(b'\x1b[?25l'+D,'prefix-not-at-line-start'),(b'\x1b[?25l\r\n'+D,'accepted-prefix'),(D.replace(b'cli-entry',b'cli-\x1b[0mentry'),'json-invalid'),(D.replace(b'"nonce":"',b'"nonce":\r\n"'),'json-invalid'),(D+D,'stage-order-mismatch'),(D.replace(N.encode(),b'b'*64),'binding-mismatch'),(D.replace(b'cli-root-checked',b'archive-verified'),'stage-order-mismatch'),(row('cli-entry',extra='PRIVATE_SECRET'),'schema-mismatch'),(PREFIX+b'null\r\n','json-not-object'),(PREFIX+b'[]\r\n','json-not-object'),(PREFIX+b'{bad}\r\n','json-invalid'),(D.replace(b'cli-entry',b'\xff'),'non-ascii-marker-line'),(b'PRIVATE_HOST_PATH\r\n'+D,'accepted-prefix'),(D.replace(b'"source"',b'"sea"'),'binding-mismatch'),(row('cli-root-checked'),'stage-order-mismatch'),(PREFIX+b'{"nonce":"'+N.encode()+b'","mode":"source","stage":[]}\r\n','stage-order-mismatch')]
  for data,reason in cases:
   with self.subTest(reason=reason):
    r=shape(data,'source',N);self.assertEqual(r['reason'],reason);self.assertEqual(set(r),set(KEYS));self.assertTrue(all(type(v) is bool or v=='unknown' for k,v in r.items() if k!='reason'));self.assertNotIn('PRIVATE',json.dumps(r));self.assertNotIn(N,json.dumps(r));self.assertEqual(reason=='accepted-prefix',ns['observed_driver_stage'](data,'source',N)!='unknown'); self.assertEqual(p.evidence(data)['wireShape'],r)
 def test_input_boundaries(self):
  for d,m,n in [(b'x'*65537,'source',N),('notbytes','source',N),(D,'other',N),(D,'source','bad')]:self.assertEqual(shape(d,m,n)['reason'],'input-rejected')
 def test_vt_not_cause(self):
  self.assertTrue(shape(b'\x1b[?25l\r\n'+D,'source',N)['vtPresent']);self.assertFalse(shape(b'\x1b[?25l\r\n'+D,'source',N)['markerLineHasVT']);self.assertTrue(shape(b'\x1b[?25l'+D,'source',N)['markerLineHasVT'])
 def test_host_guard_no_shape(self):
  with mock.patch.object(p,'host_checks',return_value=dict.fromkeys(p.HOST_KEYS,False)),mock.patch.object(p,'wire_shape',side_effect=AssertionError('shape must not run before host')),contextlib.redirect_stdout(io.StringIO()) as out:
   self.assertEqual(p.entry(),20)
  self.assertEqual(json.loads(out.getvalue().split('=',1)[1])['wireShape'],dict.fromkeys(KEYS,'unknown'))
 def test_no_repair(self):
  self.assertEqual(shape(b'junk'+D,'source',N)['reason'],'prefix-not-at-line-start');self.assertEqual(shape(D.replace(b'\r\n',b''),'source',N)['reason'],'json-invalid')

suite=unittest.defaultTestLoader.loadTestsFromTestCase(Checks)
assert unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful()
