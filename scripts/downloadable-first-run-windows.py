#!/usr/bin/env python3
"""Hosted Windows x64 first-run SEA/local-page test. No credentials or live EP."""
import os,sys,pathlib,tempfile,shutil,threading,http.server,importlib.util,json,hashlib
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers()
        self.wfile.write(b'<form><input id="loginId"><input id="password" type="password"><button>Log in</button></form>')
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

def report_drain(data):
    print('Windows first-run fixed evidence: '+json.dumps(first_run_evidence(data),sort_keys=True),flush=True)

def child_environment(home,temp,empty,port):
    env={k:v for k,v in os.environ.items() if k.upper() not in ('PATH','NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','PUPPETEER_EXECUTABLE_PATH','PUPPETEER_BROWSER')}
    env.update(HOME=str(home),USERPROFILE=str(home),LOCALAPPDATA=str(home/'local'),APPDATA=str(home/'roaming'),TEMP=str(temp),TMP=str(temp),TMPDIR=str(temp),PATH=str(empty),EP_TEST_BOOT='1',EP_LOGIN_URL='http://127.0.0.1:'+str(port)+'/app/login',EP_LOGIN_HOST='127.0.0.1')
    return env

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
        home=root/'home';home.mkdir();temp=root/'tmp';temp.mkdir();empty=root/'empty';empty.mkdir()
        artifact=root/'educationperfected.exe';shutil.copy2(original,artifact);assert digest(artifact)==expected['sha256']
        env=child_environment(home,temp,empty,server.server_port)
        for accepted in (False,True):
            print('Windows first-run checkpoint: '+('consent-download' if accepted else 'decline'),flush=True)
            safe=False
            def closed():
                nonlocal safe
                safe=True
            prompts=[(b'Type download',b'download\r'),(b'EP_TEST_LOGIN_READY',b'\x03')] if accepted else [(b'Type download',b'cancel\r')]
            conpty.run_console(str(artifact),[],env,str(home),prompts,b'Browser download checksum verified' if accepted else b'Browser download cancelled',expected_exit=130 if accepted else 1,on_closed=closed,process_budget_ms=960000,public_browser_download=True,capability_diagnostics=True,on_drain=report_drain,forbidden_output=() if accepted else (b'EP_TEST_LOGIN_READY',b'Browser download checksum verified'))
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
