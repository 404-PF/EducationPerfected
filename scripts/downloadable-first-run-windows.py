#!/usr/bin/env python3
"""Hosted Windows x64 first-run SEA/local-page test. No credentials or live EP."""
import os,sys,pathlib,tempfile,shutil,threading,http.server,importlib.util,json,hashlib,urllib.request
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.server.request_seen=True
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers()
        self.wfile.write(b'<form><input id="loginId"><input id="password" type="password"><button>Log in</button></form>')
        self.server.response_written=True
    def log_message(self,*args):
        # Report only fixed checkpoints, never arbitrary HTTP request data.
        pass

def verify_cache(home,accepted):
    cache=home/'.educationperfected'/'browsers'
    if not accepted:
        assert cache.is_dir() and not list(cache.iterdir())
    else:
        records=list(cache.glob('*/COMPLETE.json'));assert len(records)==1
        record=json.loads(records[0].read_text())
        assert not list(cache.glob('*.lock')) and not list(cache.glob('.download-*'))
        pins=json.loads((pathlib.Path(__file__).resolve().parent.parent/'packaging'/'browser-downloads.json').read_text())
        pin=next(p for p in pins['archives'] if p['platform']=='win64')
        assert records[0]==cache/(pins['version']+'-win64')/'COMPLETE.json'
        assert record['version']==pins['version'] and record['sha256']==pin['sha256']
        executable=(records[0].parent/record['executable']).resolve(strict=True)
        assert executable.is_relative_to(records[0].parent.resolve()) and executable.is_file()
        h=hashlib.sha256()
        with executable.open('rb') as stream:
            for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
        assert h.hexdigest()==record['executableSha256']

def digest(file):
    h=hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def main():
    if sys.platform!='win32' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted' or os.environ.get('RUNNER_OS')!='Windows' or len(sys.argv)!=1:raise RuntimeError('host-guard')
    conpty.audit_abi()
    run_fixture()

def first_run_evidence(data):
    # Literal-presence flags only. No arbitrary child text, paths or credentials.
    markers={
        'endpoint_reported':b'EP_WS_ENDPOINT=',
        'navigation_started':b'Opening EP page...',
        'login_wait':b'Waiting for login page to load...',
        'startup_cause_reported':b'EP_TEST_STARTUP_FAILURE=',
        'interactive_required':b'First browser download needs an interactive terminal',
        'opening':b'Opening EducationPerfected. Finish sign-in in the browser.',
        'integrity_failed':b'Browser payload integrity check failed (EP_BROWSER_CHECKSUM)',
        'archive_verified':b'Browser download checksum verified',
        'owner_ready':b'EP_TEST_LOGIN_READY',
        'commands_ready':b'Commands: start',
        'startup_failed':b'EducationPerfected could not start.',
        'missing_file':b'A required browser or runtime file is missing.',
        'access_denied':b'The operating system denied access.',
        'launch_failed':b'The browser could not launch; check display and system browser dependencies.',
        'connection_closed':b'The browser connection closed.',
        'timed_out':b'The browser or sign-in step timed out.',
        'connection_refused':b'The browser connection was refused.',
        'sandbox_blocked':b'The browser sandbox was blocked by operating-system policy.',
        'generic_failed':b'The operation failed; check the browser, sign-in state and installed runtime.',
        'extractor_missing':b'ZIP extraction needs unzip on PATH',
        'checksum_failed':b'EP_BROWSER_CHECKSUM',
    }
    return {name:literal in data for name,literal in markers.items()}

def parse_startup_failure(data):
    lines=[line for line in data.splitlines() if line.startswith(b'EP_TEST_STARTUP_FAILURE=')]
    if len(lines)!=1:return None
    try:
        def unique_pairs(pairs):
            result={}
            for key,item in pairs:
                if key in result:raise ValueError('Duplicate diagnostic field')
                result[key]=item
            return result
        value=json.loads(lines[0].split(b'=',1)[1],object_pairs_hook=unique_pairs)
        schema=json.loads((pathlib.Path(__file__).resolve().parent.parent/'lib'/'test-startup-schema.json').read_text())
        if set(value)!=set(schema):return None
        if any(not any(type(value[key]) is type(option) and value[key]==option for option in options) for key,options in schema.items()):return None
        return value
    except (ValueError,TypeError,KeyError):return None

def report_drain(data):
    print('Windows fixed owner startup cause: '+json.dumps(parse_startup_failure(data),sort_keys=True),flush=True)
    print('Windows first-run fixed evidence: '+json.dumps(first_run_evidence(data),sort_keys=True),flush=True)

def child_environment(home,temp,empty,port):
    env={k:v for k,v in os.environ.items() if k.upper() not in ('PATH','NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','PUPPETEER_EXECUTABLE_PATH','PUPPETEER_BROWSER')}
    env.update(HOME=str(home),USERPROFILE=str(home),LOCALAPPDATA=str(home/'local'),APPDATA=str(home/'roaming'),TEMP=str(temp),TMP=str(temp),TMPDIR=str(temp),PATH=str(empty),EP_TEST_BOOT='1',EP_LOGIN_URL='http://127.0.0.1:'+str(port)+'/app/login',EP_LOGIN_HOST='127.0.0.1')
    return env

def listener_preflight(port):
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://127.0.0.1:'+str(port)+'/app/login',timeout=5) as response:
            assert response.status==200
            assert b'id="loginId"' in response.read()
    except BaseException:
        print('Windows first-run checkpoint: listener-preflight-failed',flush=True)
        raise

def http_evidence(server):
    # Positive observations are monotonic within a probe. An absent observation
    # is unknown, not false, because handler work may still be outstanding.
    return {'requestSeen':True if server.request_seen else None,'responseWritten':True if server.response_written else None}

def run_fixture():
    source=pathlib.Path(__file__).resolve().parent.parent/'build'/'windows-x64-downloadable'
    candidate=json.loads((source/'CANDIDATE.json').read_text())
    assert candidate['sourceCommit']==os.environ['GITHUB_SHA'] and candidate['target']=='windows-x64'
    assert candidate['distributionMode']=='direct-google-download' and candidate['browserBundled'] is False
    original=source/'educationperfected.exe';expected=next(f for f in candidate['files'] if f['path']==original.name)
    assert digest(original)==expected['sha256'] and original.stat().st_size==expected['size']
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-download-ui-'));safe=True
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        # Verify the local listener before any browser/console work; no proxy.
        listener_preflight(server.server_port)
        home=root/'home';home.mkdir();temp=root/'tmp';temp.mkdir();empty=root/'empty';empty.mkdir()
        artifact=root/'educationperfected.exe';shutil.copy2(original,artifact);assert digest(artifact)==expected['sha256']
        env=child_environment(home,temp,empty,server.server_port)
        for accepted in (False,True):
            print('Windows first-run checkpoint: '+('consent-download' if accepted else 'decline'),flush=True)
            safe=False
            server.request_seen=False;server.response_written=False
            def drain(data):
                report_drain(data)
                print('Windows local HTTP evidence: '+json.dumps(http_evidence(server)),flush=True)
            def closed():
                nonlocal safe
                safe=True
            prompts=[(b'Type download',b'download\r'),(b'EP_TEST_LOGIN_READY',b'\x03')] if accepted else [(b'Type download',b'cancel\r')]
            conpty.run_console(str(artifact),[],env,str(home),prompts,b'Browser download checksum verified' if accepted else b'Browser download cancelled',expected_exit=130 if accepted else 1,on_closed=closed,process_budget_ms=960000,public_browser_download=True,capability_diagnostics=True,on_drain=drain,forbidden_output=() if accepted else (b'EP_TEST_LOGIN_READY',b'Browser download checksum verified'))
            verify_cache(home,accepted);assert not list(temp.glob('educationperfected-*'))
        print('Windows exact copied SEA fresh-home decline/download/checksum/local login-ready/raw ETX130 and owned job/EOF/extraction/cache-lock cleanup passed. Empty child PATH, not clean-machine no-Node or physical-console evidence.',flush=True)
    finally:
        server.shutdown();server.server_close();thread.join(timeout=3)
        if safe:shutil.rmtree(root)
        else:print('Windows child closure uncertain; owned fixture retained for hosted VM destruction.',file=sys.stderr)
if __name__=='__main__':
    try:main()
    except BaseException as error:
        print('Windows first-run fixture failed: '+conpty.fixed_stage(error)+'; no release evidence recorded.',file=sys.stderr);sys.exit(1)
