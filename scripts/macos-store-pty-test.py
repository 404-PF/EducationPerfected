#!/usr/bin/env python3
"""Internal fixed synthetic credential fixture, called only after owned keychain verified."""
import os, sys, pathlib, subprocess, pty, select, time, platform

def drain_pty(master, data, ready=None, read=None, clock=time.monotonic):
    ready = ready or (lambda: select.select([master],[],[],.1)[0])
    read = read or (lambda: os.read(master,65536))
    deadline = clock()+2
    while ready():
        if clock() >= deadline:
            raise RuntimeError('Mac credential output drain timed out')
        try:
            chunk = read()
        except OSError as error:
            import errno
            if error.errno == errno.EIO:
                break
            raise
        if not chunk:
            break
        data += chunk
    return data

STAGE = 'host-guard'

def checkpoint(stage):
    global STAGE
    STAGE = stage
    print('Mac store child checkpoint: ' + stage, flush=True)

def main():
    if sys.platform != 'darwin' or os.environ.get('RUNNER_ENVIRONMENT') != 'github-hosted' or len(sys.argv) != 2:
        raise RuntimeError('Requires owned disposable Mac fixture context')
    root = pathlib.Path(sys.argv[1]).resolve()
    owned = str(root / 'synthetic.keychain-db')
    import shlex
    checkpoint('inherited-selection')
    for command in ('default-keychain', 'list-keychains'):
        result = subprocess.run(['/usr/bin/security', command, '-d', 'user'], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if shlex.split(result.stdout) != [owned]:
            raise RuntimeError('Owned keychain verification required')
    checkpoint('fixture-paths')
    repo = pathlib.Path(__file__).resolve().parent.parent
    node = shutil_which_node()
    arch = 'arm64' if platform.machine() == 'arm64' else 'x64'
    executable = repo / 'build' / ('macos-' + arch) / 'educationperfected'
    env = dict(os.environ)
    for key in ('EP_EMAIL', 'EP_PASSWORD', 'NODE_OPTIONS'):
        env.pop(key, None)
    tmp = root / 'tmp'; empty = root / 'empty'
    for directory in (tmp,empty):
        directory.mkdir(mode=0o700)
    # User-domain keychain metadata belongs to the inherited runner HOME.
    # Fresh HOME selects different metadata, so this lane intentionally retains it.
    # Only the system ZIP extractor is exposed; no Node or browser on PATH.
    (empty/'unzip').symlink_to('/usr/bin/unzip')
    env.update(TMPDIR=str(tmp), PATH=str(empty))
    checkpoint('inherited-home-selection')
    for keychain_command in ('default-keychain', 'list-keychains'):
        selection = subprocess.run(['/usr/bin/security', keychain_command, '-d', 'user'], env=env, check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
        if shlex.split(selection.stdout) != [owned]:
            raise RuntimeError('Inherited HOME owned keychain selection changed; no credential operations allowed')
    def run(args):
        return subprocess.run(args, cwd=repo, env=env, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
    # Source and packaged setup each start from an independently verified absent record.
    verify_absent = "require('./lib/credential-store').createCredentialStore().read().then(x=>{if(x!==null)process.exitCode=1}).catch(()=>{process.exitCode=1})"
    verify_saved = "require('./lib/credential-store').createCredentialStore().read().then(x=>{if(x?.email!==['fixture','example.test'].join('@')||x?.password!==['synthetic','mac','only'].join('-'))process.exitCode=1}).catch(()=>{process.exitCode=1})"
    for label, command in [('source',[node,str(repo/'bin/cli.js')]), ('sea',[str(executable)])]:
        checkpoint(label+'-absence')
        run([node,'-e',verify_absent])
        checkpoint(label+'-setup')
        master, slave = pty.openpty(); child=None
        try:
            child = subprocess.Popen([*command,'setup'], stdin=slave, stdout=slave, stderr=slave, cwd=repo, env=env, close_fds=True)
            data=b'';download_answered=False
            for marker, answer in [(b'EP email',b'fixture@example.test\r'),(b'EP password',b'synthetic-mac-only\r')]:
                deadline=time.monotonic()+10
                while marker not in data:
                    if child.poll() is not None:
                        raise RuntimeError('Mac credential child exited before prompt: '+marker.decode())
                    if time.monotonic()>deadline:
                        banner=' after store banner' if b'Save a login' in data else ' before store banner'
                        raise RuntimeError('Mac credential prompt timed out: '+marker.decode()+banner)
                    if not download_answered and b'Type download to fetch' in data:
                        download_answered=True
                        deadline=time.monotonic()+950 # Installer has a 15-minute hard timeout.
                        os.write(master,b'download\r');data=b''
                    if download_answered and b'Browser ready.' in data:
                        download_answered=False;deadline=time.monotonic()+10
                    if select.select([master],[],[],.1)[0]:
                        data+=os.read(master,65536)
                os.write(master,answer)
            # A hosted save can be slow: keep a generous outer budget, and on each
            # quiet slice drain the stream and probe the record so a final failure
            # says both whether the ack printed and whether the record landed.
            stuck_deadline=time.monotonic()+120
            while True:
                try:
                    child.wait(timeout=15)
                    break
                except subprocess.TimeoutExpired:
                    data=drain_pty(master,data)
                    ack='printed' if b'Login saved in the OS credential store.' in data else 'missing'
                    try:
                        run([node,'-e',verify_saved])
                        landed='present'
                    except subprocess.CalledProcessError:
                        landed='absent'
                    if time.monotonic()>=stuck_deadline:
                        child.kill();child.wait(timeout=10)
                        raise RuntimeError('Mac credential setup child stuck after prompts; saved record '+landed+'; save ack '+ack)
            data=drain_pty(master,data)
            problems=[]
            if child.returncode != 0:problems.append('nonzero-exit')
            if b'Login saved in the OS credential store.' not in data:problems.append('ack-missing')
            if b'fixture@example.test' not in data:problems.append('email-echo-missing')
            if b'synthetic-mac-only' not in data:problems.append('password-echo-missing')
            if problems:raise RuntimeError('Mac credential setup output contract failed: '+','.join(problems))
        finally:
            if child is not None and child.poll() is None:
                child.kill();child.wait(timeout=10)
            os.close(master);os.close(slave)
        if label == 'source':
            checkpoint('source-saved-verification')
            run([node,'-e',verify_saved])
            checkpoint('source-native-resolver')
            run([node,'-e',"require('./scripts/native-resolver-proof').proveNativeResolver(require('./lib/credential-store').createCredentialStore(), {email:['fixture','example.test'].join('@'),password:['synthetic','mac','only'].join('-')}).catch(()=>{process.exitCode=1})"])
        else:
            # A source Node read of a SEA-created secret timed out on BOTH native
            # architectures. Do not broaden ACLs or pretend this proves the value.
            checkpoint('sea-save-acknowledged-exact-record-read-unproved')
        checkpoint(label+'-health-read')
        health = run([*command,'check-credentials'])
        if health.stdout != b'Saved login is available and its record is valid.\n':
            raise RuntimeError('Saved login health read did not confirm a valid record')
        if any(tmp.iterdir()):
            raise RuntimeError('Mac setup or health-read extraction residue')
        checkpoint(label+'-delete')
        result = run([*command,'forget-credentials'])
        if b'Saved login removed from the OS credential store.' not in result.stdout:
            raise RuntimeError('Mac credential deletion not confirmed')
        checkpoint(label+'-deleted-verification')
        run([node,'-e',verify_absent])
        if any(tmp.iterdir()):
            raise RuntimeError('Mac deletion extraction residue')
    print('Mac source exact synthetic save/read/delete plus SEA setup acknowledgement/health read/delete/source absence/extraction cleanup passed. SEA exact saved value unproved (isolated keychain, inherited HOME, no browser/no-Node/terminal certification).')

def shutil_which_node():
    import shutil
    value=shutil.which('node')
    if not value:
        raise RuntimeError('Native fixture Node unavailable')
    return value

if __name__=='__main__':
    try:
        main()
    except BaseException as error:
        cause=str(error) if type(error) is RuntimeError else type(error).__name__
        print('Mac synthetic credential child failed at fixed checkpoint: '+STAGE+'; fixed cause: '+cause+'; no record or native error contents printed.',file=sys.stderr)
        sys.exit(1)
