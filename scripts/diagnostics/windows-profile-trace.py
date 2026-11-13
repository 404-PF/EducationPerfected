"""Approved hosted local-only trace. No login, secrets, broad ACL changes or uploads."""
import os,sys,pathlib,subprocess,tempfile,time,json,urllib.request,http.server,threading,shutil

def commands():
    # Debug only the Chrome broker. Child processes run normally, preserving
    # sandbox behavior. Return breakpoints are one-shot/current-thread only.
    calls=[('userenv!DeriveAppContainerSidFromAppContainerName','DeriveSid'),('kernelbase!AppContainerRegisterSid','RegisterSid'),('kernelbase!CreateMutexW','CreateMutex'),('kernelbase!WaitForSingleObject','Wait'),('kernelbase!CreateDirectoryW','CreateDirectory'),('advapi32!SetNamedSecurityInfoW','SetNamedSecurity'),('sechost!SetNamedSecurityInfoW','SetNamedSecurityHost'),('advapi32!GetNamedSecurityInfoW','GetNamedSecurity'),('sechost!GetNamedSecurityInfoW','GetNamedSecurityHost'),('advapi32!SetSecurityDescriptorSacl','SetSDLabel'),('kernelbase!GetFileAttributesW','GetFileAttributes')]
    result=['.symfix','.sympath+ srv*https://chromium-browser-symsrv.commondatastorage.googleapis.com','.printf "EPTRACE START\\n"']
    for symbol,name in calls:
        ret=f'.echo EPTRACE_RETURN_{name}; r @$tid; r rax; !gle; gc'
        if name=='Wait':ret='.if (@eax != 0) { .echo EPTRACE_RETURN_Wait_Nonzero; r @$tid; r rax; !gle; k 6; }; gc'
        escaped=ret.replace('"','\\"')
        entry=f'.echo EPTRACE_ENTER_{name}; r @$tid; r rcx; r rdx;'
        if name=='Wait':entry=''
        if name in ('CreateDirectory','GetFileAttributes','GetNamedSecurity','GetNamedSecurityHost','SetNamedSecurity','SetNamedSecurityHost','DeriveSid'):entry+=' du @rcx;'
        if name=='CreateMutex':entry+=' du @r8;'
        if name=='RegisterSid':entry+=' du @rdx;'
        result.append(f'bu {symbol} "{entry} ~.bp /1 poi(@rsp) \\"{escaped}\\"; gc"')
    result+=['bl','g']
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
        for mode in ('baseline-inherited','baseline-isolated','trace-inherited','trace-isolated'):
            home=root/mode;home.mkdir();profile=home/'chrome-profile';log=home/'debug.log'
            env=dict(os.environ)
            if mode.endswith('isolated'):
                for name in ('local','roaming','tmp'):(home/name).mkdir()
                env.update(HOME=str(home),USERPROFILE=str(home),LOCALAPPDATA=str(home/'local'),APPDATA=str(home/'roaming'),TEMP=str(home/'tmp'),TMP=str(home/'tmp'))
            with log.open('wb') as out:
                args=json.loads(subprocess.check_output(['node','-e','console.log(JSON.stringify(require("puppeteer").defaultArgs({headless:false,userDataDir:process.argv[1]})))',str(profile)],text=True))
                launch=[str(chrome),*args,'--remote-debugging-port=0']
                if mode.startswith('trace'):launch=[str(cdb),'-hd','-G','-cf',str(command),*launch]
                child=subprocess.Popen(launch,stdout=out,stderr=subprocess.STDOUT,env=env)
                try:
                    deadline=time.monotonic()+90
                    while not (profile/'DevToolsActivePort').exists():
                        if child.poll() is not None or time.monotonic()>deadline:raise RuntimeError('debugger-browser-startup')
                        time.sleep(.1)
                    port=int((profile/'DevToolsActivePort').read_text().splitlines()[0])
                    # A tiny Node observer drives only owned local page and emits
                    # fixed booleans/network-specific histogram/sandbox results.
                    result=subprocess.run(['node','scripts/diagnostics/windows-profile-observe.js',str(port),str(server.server_port)],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=45,text=True)
                    print('EPTRACE MODE '+mode+' OBSERVER '+result.stdout,flush=True)
                except Exception as error:
                    print('EPTRACE MODE '+mode+' FAILED '+type(error).__name__+': '+str(error),flush=True)
                finally:
                    # Closing the broker closes child processes; taskkill is a
                    # disposable-VM containment fallback, not a product fix.
                    subprocess.run([os.path.join(os.environ['SystemRoot'],'System32','taskkill.exe'),'/pid',str(child.pid),'/T','/F'],stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
                    child.wait(timeout=15)
            text=log.read_text(errors='replace')
            raw=text.splitlines();lines=[]
            for index,line in enumerate(raw):
                if any(x in line for x in ('EPTRACE','Syntax error','Couldn','Unable','ambiguous')):
                    lines.extend(raw[index:index+8])
            print('EPTRACE MODE '+mode+' DEBUGGER '+json.dumps(lines[-1600:]),flush=True)
    finally:
        server.shutdown();server.server_close();thread.join(3)
        # Trace stays private to disposable runner; no upload even on failure.
        print('EPTRACE finished; temporary trace remains only until runner destruction.',flush=True)
if __name__=='__main__':main()
