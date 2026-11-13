"""Fixture-only cached-browser receipt. Never downloads or executes a browser.
Use only an already-owned disposable fixture home; tests exercise setup's cached
branch, not Google acquisition. Acquisition has separate first-run fixtures.
"""
import hashlib,json,pathlib,platform,sys

def seed(home, platform_name=None, arch=None):
    home=pathlib.Path(home)
    if not home.is_dir() or home.is_symlink():raise RuntimeError('fixture-home-required')
    home=home.resolve(strict=True)
    repo=pathlib.Path(__file__).resolve().parent.parent
    pins=json.loads((repo/'packaging'/'browser-downloads.json').read_text())
    platform_name=platform_name or sys.platform
    arch=arch or platform.machine().lower()
    target=('win64' if platform_name=='win32' else ('mac-arm64' if arch in ('arm64','aarch64') else 'mac-x64') if platform_name=='darwin' else 'linux-arm64' if arch in ('arm64','aarch64') else 'linux64')
    pin=next(item for item in pins['archives'] if item['platform']==target)
    ancestor=home
    for component in ('.educationperfected','browsers',pins['version']+'-'+target):
        ancestor=ancestor/component
        if ancestor.is_symlink():raise RuntimeError('symlinked-cache-ancestor')
        if ancestor.exists() and not ancestor.is_dir():raise RuntimeError('invalid-cache-ancestor')
        ancestor.mkdir(exist_ok=True)
    directory=ancestor
    data=b'inert-browser-cache-fixture-never-execute'
    if any(directory.iterdir()):
        if (directory/'inert-browser').read_bytes()!=data:raise RuntimeError('unexpected-cache')
        if not (directory/'COMPLETE.json').is_file():raise RuntimeError('incomplete-fixture-cache')
        return
    (directory/'inert-browser').write_bytes(data)
    (directory/'COMPLETE.json').write_text(json.dumps({'version':pins['version'],'sha256':pin['sha256'],'executable':'inert-browser','executableSha256':hashlib.sha256(data).hexdigest()}))

if __name__=='__main__':
    if len(sys.argv)!=2:raise RuntimeError('fixture-home-required')
    seed(sys.argv[1])
