#!/usr/bin/env python3
"""Fixed diagnostic transport. Ordinary stdio, NOT ConPTY/console proof."""
import ctypes as c, importlib.util, pathlib, os, subprocess, time
spec=importlib.util.spec_from_file_location('abi',pathlib.Path(__file__).with_name('windows-conpty.py'))
abi=importlib.util.module_from_spec(spec);spec.loader.exec_module(abi)
HANDLE=abi.HANDLE;DWORD=abi.DWORD;SIZE_T=abi.SIZE_T;PTR=abi.PTR
class SECURITY_ATTRIBUTES(c.Structure):
    _fields_=[('length',DWORD),('descriptor',PTR),('inherit',abi.BOOL)]
STAGES=frozenset(('host','pipe','inherit','attributes','job','create','assign','resume','read','output-limit','timeout','exit','job-zero','eof','close'))
class Uncertain(RuntimeError):pass
def kernel32():
    k=abi.kernel32()
    for name,result,args in [
        ('SetHandleInformation',abi.BOOL,[HANDLE,DWORD,DWORD]),
        ('PeekNamedPipe',abi.BOOL,[HANDLE,PTR,DWORD,PTR,c.POINTER(DWORD),PTR])]:
        f=getattr(k,name);f.restype=result;f.argtypes=args
    return k
def run(executable,args,env,cwd,api=None,clock=time.monotonic,sleep=time.sleep):
    """One suspended owned job; no terminal translation or caller output callback.
    Never block on ReadFile: sole reader consumes only PeekNamedPipe byte count.
    A private EOF stdin and combined bounded output are the only inherited handles.
    """
    if os.name!='nt' and api is None:raise Uncertain('host')
    abi.audit_abi()
    k=api or kernel32();handles=[];pi=abi.PROCESS_INFORMATION();job=HANDLE();assigned=False;attrs=None;ready=False
    output=bytearray();eof=False;primary=None;certain=False;exitcode=DWORD()
    def check(ok,stage):
        if not ok:raise Uncertain(stage)
    def close(h):
        if h and h.value:check(k.CloseHandle(h),'close');h.value=None
    def drain():
        nonlocal eof
        available=DWORD()
        if not k.PeekNamedPipe(outread,None,0,None,c.byref(available),None):
            if c.get_last_error() in (109,232):eof=True;return
            raise Uncertain('read')
        if available.value:
            buf=c.create_string_buffer(min(4096,available.value));n=DWORD()
            check(k.ReadFile(outread,buf,len(buf),c.byref(n),None),'read')
            check(0<n.value<=len(buf),'read');output.extend(buf.raw[:n.value])
            check(len(output)<=65536,'output-limit')
    try:
        inread=HANDLE();inwrite=HANDLE();outread=HANDLE();outwrite=HANDLE()
        security=SECURITY_ATTRIBUTES(c.sizeof(SECURITY_ATTRIBUTES),None,True)
        for a,b in ((inread,inwrite),(outread,outwrite)):
            check(k.CreatePipe(c.byref(a),c.byref(b),c.byref(security),0),'pipe');handles.extend((a,b))
        for h in (inwrite,outread):check(k.SetHandleInformation(h,1,0),'inherit')
        close(inwrite) # child stdin sees EOF; no input producer exists
        size=SIZE_T();c.set_last_error(0)
        first=k.InitializeProcThreadAttributeList(None,1,0,c.byref(size))
        check(not first and c.get_last_error()==122 and size.value>0,'attributes')
        attrs=c.create_string_buffer(size.value)
        check(k.InitializeProcThreadAttributeList(attrs,1,0,c.byref(size)),'attributes');ready=True
        inherited=(HANDLE*2)(inread.value,outwrite.value)
        check(k.UpdateProcThreadAttribute(attrs,0,0x20002,inherited,c.sizeof(inherited),None,None),'attributes')
        job=HANDLE(k.CreateJobObjectW(None,None));check(job.value,'job')
        limits=abi.EXTENDED_LIMIT();limits.basic.flags=abi.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        check(k.SetInformationJobObject(job,9,c.byref(limits),c.sizeof(limits)),'job')
        si=abi.STARTUPINFOEX();si.StartupInfo.cb=c.sizeof(si);si.attributes=c.cast(attrs,PTR)
        si.StartupInfo.flags=abi.STARTF_USESTDHANDLES;si.StartupInfo.stdin=inread;si.StartupInfo.stdout=outwrite;si.StartupInfo.stderr=outwrite
        command=c.create_unicode_buffer(subprocess.list2cmdline([str(executable),*args]))
        environment=c.create_unicode_buffer('\0'.join(key+'='+v for key,v in sorted(env.items(),key=lambda kv:kv[0].upper()))+'\0\0')
        check(k.CreateProcessW(str(executable),command,None,None,True,abi.CREATE_SUSPENDED|abi.CREATE_UNICODE_ENVIRONMENT|abi.EXTENDED_STARTUPINFO_PRESENT|0x08000000,environment,str(cwd),c.byref(si.StartupInfo),c.byref(pi)),'create')
        close(inread);close(outwrite)
        check(k.AssignProcessToJobObject(job,pi.process),'assign');assigned=True
        check(k.ResumeThread(pi.thread)!=0xFFFFFFFF,'resume')
        deadline=clock()+120
        while k.WaitForSingleObject(pi.process,0)!=abi.WAIT_OBJECT_0:
            drain();check(clock()<deadline,'timeout');sleep(.01)
        check(k.GetExitCodeProcess(pi.process,c.byref(exitcode)),'exit')
    except BaseException as error:primary=error
    finally:
        try:
            if pi.process:
                if k.WaitForSingleObject(pi.process,0)!=abi.WAIT_OBJECT_0:
                    check(k.TerminateJobObject(job,1) if assigned else k.TerminateProcess(pi.process,1),'exit')
                check(k.WaitForSingleObject(pi.process,5000)==abi.WAIT_OBJECT_0,'exit')
            if assigned:
                deadline=clock()+5
                while True:
                    info=abi.ACCOUNTING();check(k.QueryInformationJobObject(job,1,c.byref(info),c.sizeof(info),None),'job-zero')
                    if info.active==0:break
                    # Descendants must end naturally for success. Termination is failure.
                    if clock()>=deadline:
                        check(k.TerminateJobObject(job,1),'job-zero')
                        # Termination request is not completion. Confirm owned job
                        # zero before releasing the last tracking handle.
                        deadline=clock()+5
                        while True:
                            ended=abi.ACCOUNTING();check(k.QueryInformationJobObject(job,1,c.byref(ended),c.sizeof(ended),None),'job-zero')
                            if ended.active==0:break
                            check(clock()<deadline,'job-zero');sleep(.01)
                        raise Uncertain('job-zero')
                    drain();sleep(.01)
                deadline=clock()+5
                while not eof:
                    drain();check(eof or clock()<deadline,'eof');sleep(.01)
            certain=True
        except BaseException as error:primary=primary or error
        for h in (HANDLE(pi.thread),HANDLE(pi.process),job,*handles):
            try:close(h)
            except BaseException as error:primary=primary or error
        if ready:k.DeleteProcThreadAttributeList(attrs)
    if primary:raise Uncertain(str(primary) if type(primary) is Uncertain and str(primary) in STAGES else 'close')
    if not assigned or not certain or not eof:raise Uncertain('eof')
    return bytes(output),exitcode.value
