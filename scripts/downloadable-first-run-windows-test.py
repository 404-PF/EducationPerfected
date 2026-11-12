#!/usr/bin/env python3
"""Inert cache assertions/host guard only. No Windows APIs or browser are opened."""
import importlib.util,pathlib,tempfile,json,hashlib,os,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('first_run',pathlib.Path(__file__).with_name('downloadable-first-run-windows.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
saved=os.environ.get('GITHUB_ACTIONS');os.environ['GITHUB_ACTIONS']='false'
try:
    try:m.main()
    except RuntimeError as error:assert str(error)=='host-guard'
    else:raise AssertionError('Expected host guard before native use')
finally:
    if saved is None:del os.environ['GITHUB_ACTIONS']
    else:os.environ['GITHUB_ACTIONS']=saved
with tempfile.TemporaryDirectory(prefix='ep-first-run-inert-') as folder:
    home=pathlib.Path(folder);cache=home/'.educationperfected'/'browsers';cache.mkdir(parents=True)
    m.verify_cache(home,False)
    pins=json.loads((pathlib.Path(__file__).resolve().parent.parent/'packaging'/'browser-downloads.json').read_text());pin=next(p for p in pins['archives'] if p['platform']=='win64')
    install=cache/(pins['version']+'-win64');install.mkdir();exe=install/'inert.exe';exe.write_bytes(b'inert not executable')
    receipt=install/'COMPLETE.json';record={'version':pins['version'],'sha256':pin['sha256'],'executable':exe.name,'executableSha256':hashlib.sha256(exe.read_bytes()).hexdigest()}
    receipt.write_text(json.dumps(record));m.verify_cache(home,True)
    def refuses():
        try:m.verify_cache(home,True)
        except (AssertionError,FileNotFoundError):pass
        else:raise AssertionError('Cache tamper accepted')
    for delta in ({'version':'wrong'},{'sha256':'wrong'},{'executableSha256':'wrong'},{'executable':'../../escape'}):
        receipt.write_text(json.dumps({**record,**delta}));refuses()
    receipt.write_text(json.dumps(record))
    lock=cache/'synthetic.lock';lock.touch();refuses();lock.unlink()
    staging=cache/'.download-inert';staging.mkdir();refuses();staging.rmdir()
    wrong=cache/'wrong-directory';install.rename(wrong);refuses();wrong.rename(install)
    exe.write_bytes(b'changed');refuses()
print('Windows first-run driver host/cache/receipt/executable-hash/lock/staging controls passed (inert only).')

evidence=m.first_run_evidence(b'private@example.test C:\\private\\token EP_TEST_LOGIN_READY Browser download checksum verified')
assert evidence['owner_ready'] and evidence['archive_verified'] and not evidence['startup_failed']
assert all(type(value) is bool for value in evidence.values())
assert not any(value in json.dumps(evidence) for value in ('private@example.test','private','token'))
assert not any(m.first_run_evidence(b'arbitrary child output').values())
print('Windows first-run fixed drain evidence excludes private and arbitrary child data (inert only).')

# Source-only parity contract. No Node or child process needed in the driver.
import ast,re
source=ast.parse(pathlib.Path(m.__file__).read_text())
function=next(node for node in source.body if isinstance(node,ast.FunctionDef) and node.name=='first_run_evidence')
assignment=next(node for node in function.body if isinstance(node,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='markers' for t in node.targets))
python_literals=set(ast.literal_eval(assignment.value).values())
js=pathlib.Path(__file__).with_name('packaged-startup-evidence.js').read_text()
js_literals={value.encode() for value in re.findall(r"^ [A-Za-z]+:'([^']+)',?$",js,re.MULTILINE)}
assert len(js_literals)>=14 and js_literals<=python_literals
assert m.first_run_evidence(b'First browser download needs an interactive terminal')['interactive_required']
print('Windows first-run fixed marker table contains every packaged startup literal; interactive-terminal category covered (source parity only).')

cause={'category':'other','name':'Error','code':'other','browserCreated':False,'controllerConnected':None,'browserExit':'unobserved',**{key:False for key in ('frameDetached','targetClosed','browserLaunch','processSpawn','protocolTimeout','navigationNetwork','missingContext')}}
line=b'EP_TEST_STARTUP_FAILURE='+json.dumps(cause).encode()
assert m.parse_startup_failure(line)==cause
for bad in (line+b'\n'+line,b'EP_TEST_STARTUP_FAILURE={bad}',b'EP_TEST_STARTUP_FAILURE='+json.dumps({**cause,'name':'private'}).encode(),b'EP_TEST_STARTUP_FAILURE='+json.dumps({**cause,'private':'private'}).encode()):assert m.parse_startup_failure(bad) is None
print('Windows owner cause parser rejects duplicate/malformed/unknown/private receipt data (inert only).')
