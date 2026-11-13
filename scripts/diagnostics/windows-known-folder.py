"""Read-only Windows path resolution, before Chrome, in identical environment."""
import ctypes,json,os
from ctypes import wintypes
shell=ctypes.WinDLL('shell32',use_last_error=True)
result={}
for name,csidl in [('LocalAppData',0x1c),('AppData',0x1a),('Profile',0x28)]:
 buffer=ctypes.create_unicode_buffer(32768)
 hr=shell.SHGetFolderPathW(None,csidl,None,0,buffer)
 result[name]={'hresult':hr,'path':buffer.value,'exists':os.path.isdir(buffer.value)}
result['environment']={key:os.environ.get(key) for key in ('HOME','USERPROFILE','LOCALAPPDATA','APPDATA','TEMP')}
print(json.dumps(result))
