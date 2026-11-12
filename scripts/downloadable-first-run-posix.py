#!/usr/bin/env python3
"""Native SEA first-run UI/download probe. Local pages and no credentials; not no-Node proof."""
import os,sys,pathlib,platform,pty,subprocess,tempfile,select,time,threading,http.server,shutil,signal
class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers()
        self.wfile.write(b'<form><input id="loginId"><input id="password" type="password"><button>Log in</button></form>')
    def log_message(self,*args):
        # Suppress request logs: this fixture reports only fixed checkpoints.
        pass

def main():
    if sys.platform not in ('linux','darwin') or len(sys.argv)!=1:raise RuntimeError('Native POSIX fixture only')
    repo=pathlib.Path(__file__).resolve().parent.parent
    arch='arm64' if platform.machine() in ('aarch64','arm64') else 'x64'
    source=repo/'build'/(('macos' if sys.platform=='darwin' else 'linux')+'-'+arch+'-downloadable')/'educationperfected'
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-download-ui-'));child=None;master=slave=None
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        home=root/'home';home.mkdir();temp=root/'tmp';temp.mkdir();artifact=root/'educationperfected';shutil.copy2(source,artifact)
        env={k:v for k,v in os.environ.items() if k not in ('EP_EMAIL','EP_PASSWORD','NODE_OPTIONS','PUPPETEER_EXECUTABLE_PATH')}
        env.update(HOME=str(home),XDG_CONFIG_HOME=str(home/'config'),XDG_CACHE_HOME=str(home/'cache'),TMPDIR=str(temp),EP_TEST_BOOT='1',EP_LOGIN_URL='http://127.0.0.1:'+str(server.server_port)+'/app/login',EP_LOGIN_HOST='127.0.0.1')
        for response in (b'cancel\n',b'download\n'):
            master,slave=pty.openpty();child=subprocess.Popen([str(artifact)],env=env,cwd=home,stdin=slave,stdout=slave,stderr=slave,close_fds=True,start_new_session=True)
            text=b'';sent=False;ready=False;deadline=time.monotonic()+930
            while child.poll() is None and time.monotonic()<deadline:
                if select.select([master],[],[],.1)[0]:
                    try:text+=os.read(master,65536)
                    except OSError:break
                if not sent and b'Type download' in text:os.write(master,response);sent=True
                if b'EP_TEST_LOGIN_READY' in text:
                    ready=True;os.kill(child.pid,signal.SIGINT);break
            child.wait(timeout=15)
            if response.startswith(b'cancel'):
                assert sent and child.returncode==1 and not ready
                assert b'Browser download checksum verified' not in text
                cache=home/'.educationperfected'/'browsers';assert not list(cache.iterdir())
            else:
                assert sent and ready and b'Browser download checksum verified' in text and child.returncode==130
                cache=home/'.educationperfected'/'browsers';assert len(list(cache.glob('*/COMPLETE.json')))==1
                assert not list(cache.glob('*.lock')) and not list(cache.glob('.download-*'))
            assert not list(temp.glob('educationperfected-*'))
            os.close(master);os.close(slave);master=slave=None;child=None
        print('Native first-run SEA: fresh-home interactive decline leaves no cache; fresh download consent verifies archive, reaches local login-ready, SIGINT130 and owned extraction/install-lock cleanup passed. Not physical-console/no-Node proof.',flush=True)
    finally:
        if child is not None and child.poll() is None:
            os.killpg(child.pid,signal.SIGKILL);child.wait(timeout=10)
        if master is not None:os.close(master)
        if slave is not None:os.close(slave)
        server.shutdown();server.server_close();thread.join(timeout=3);shutil.rmtree(root)
if __name__=='__main__':main()
