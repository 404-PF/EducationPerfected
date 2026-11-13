"""Approved hosted local-only trace. No login, secrets, broad ACL changes or uploads."""
import os,sys,pathlib,subprocess,tempfile,time,json,urllib.request,http.server,threading,shutil,socket

def commands():
    # Failure-only exports; no symbol download and no successful-call dumps.
    calls=[('kernelbase!AppContainerDeriveSidFromMoniker','DeriveSid','1'),('kernelbase!AppContainerRegisterSid','RegisterSid','1')]
    result=['.sympath ""','.echo EPTRACE_SPARSE_START']
    for symbol,name,condition in calls:
        ret=f'.if ({condition}) {{ .echo EPTRACE_RETURN_{name}; r @$tid; r rax; !gle; }}; gc'
        result.append(f'bu {symbol} "~.bp /1 poi(@rsp) \\"{ret}\\"; gc"')
    result+=['g']
    return '\n'.join(result)+'\n'

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200);self.end_headers();self.wfile.write(b'<html><body><input id="loginId"></body></html>')
    def log_message(self,*args):pass

def main():
    if sys.platform!='win32' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted' or os.environ.get('GITHUB_REPOSITORY')!='404-PF/EducationPerfected':raise RuntimeError('host-guard')
    cdb=pathlib.Path(os.environ['ProgramFiles(x86)'])/'Windows Kits/10/Debuggers/x64/cdb.exe'
    if not cdb.is_file():raise RuntimeError('CDB unavailable; no browser effects started')
    chrome=pathlib.Path(os.environ['EP_TRACE_CHROME']).resolve(strict=True)
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-profile-trace-'))
    command=root/'trace.cdb';command.write_text(commands())
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        print('EPTRACE HOST '+json.dumps({'platform':sys.getwindowsversion().build,'arch':os.environ.get('PROCESSOR_ARCHITECTURE'),'source':os.environ['GITHUB_SHA']}),flush=True)
        failures=0
        for mode in (os.environ['EP_TRACE_MODE'],):
            home=root/mode;home.mkdir();profile=home/'chrome-profile';log=home/'debug.log'
            exe=chrome
            env=dict(os.environ)
            if mode!='baseline-inherited':
                for name in ('empty','tmp'):(home/name).mkdir()
                env.update(HOME=str(home),USERPROFILE=str(home),PATH=str(home/'empty'),TEMP=str(home/'tmp'),TMP=str(home/'tmp'),TMPDIR=str(home/'tmp'))
            if mode=='baseline-preserve-profile':env['USERPROFILE']=os.environ['USERPROFILE']
            if mode=='baseline-complete-profile':
                (home/'AppData'/'Local').mkdir(parents=True)
                (home/'AppData'/'Roaming').mkdir(parents=True)
            probe=subprocess.run([sys.executable,'scripts/diagnostics/windows-known-folder.py'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,timeout=15)
            print('EPTRACE FOLDER '+mode+' '+probe.stdout,flush=True)
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            with log.open('wb') as out:
                args=json.loads(subprocess.check_output(['node','-e','(async()=>console.log(JSON.stringify(await require("puppeteer").defaultArgs({headless:"shell",userDataDir:process.argv[1]}))))().catch(()=>process.exit(1))',str(profile)],text=True))
                launch=[str(exe),*args,'--remote-debugging-port='+str(port)]
                if mode.startswith('trace'):launch=[str(cdb),'-hd','-G','-cf',str(command),*launch]
                child=subprocess.Popen(launch,stdout=out,stderr=subprocess.STDOUT,env=env)
                try:
                    deadline=time.monotonic()+90
                    while True:
                        try:
                            with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/json/version',timeout=1) as response:json.load(response)
                            break
                        except Exception:
                            if child.poll() is not None or time.monotonic()>deadline:raise RuntimeError('debugger-browser-startup')
                            time.sleep(.1)
                    # A tiny Node observer drives only owned local page and emits
                    # fixed booleans/network-specific histogram/sandbox results.
                    result=subprocess.run(['node','scripts/diagnostics/windows-profile-observe.js',str(port),str(server.server_port)],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=45,text=True)
                    print('EPTRACE MODE '+mode+' OBSERVER '+result.stdout,flush=True)
                    if result.returncode:failures+=1
                except Exception as error:
                    failures+=1
                    print('EPTRACE MODE '+mode+' FAILED '+type(error).__name__+': '+str(error),flush=True)
                finally:
                    # Closing the broker closes child processes; taskkill is a
                    # disposable-VM containment fallback, not a product fix.
                    subprocess.run([os.path.join(os.environ['SystemRoot'],'System32','taskkill.exe'),'/pid',str(child.pid),'/T','/F'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
                    child.wait(timeout=15)
            text=log.read_text(errors='replace')
            raw=text.splitlines();selected=set()
            for i,line in enumerate(raw):
                if line.startswith('EPTRACE') or any(x in line for x in ('Syntax error','evaluation failed','network_sandbox','error_code=','err:','exited')):selected.update(range(max(0,i-1),min(len(raw),i+12)))
            print('EPTRACE MODE '+mode+' DEBUGGER '+json.dumps([raw[i] for i in sorted(selected)][:10000]),flush=True)
        if failures:raise RuntimeError('incomplete diagnostic modes: '+str(failures))
    finally:
        server.shutdown();server.server_close();thread.join(3)
        # Trace stays private to disposable runner; no upload even on failure.
        print('EPTRACE finished; temporary trace remains only until runner destruction.',flush=True)
if __name__=='__main__':main()
