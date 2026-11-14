#!/usr/bin/env python3
"""Test-only x64 ConPTY transport. No credential APIs; fixed caller owns records."""
import ctypes as c
import os, re, subprocess, threading, time

# Windows SDK fixed-width ABI. Do not use host c_long (64-bit on POSIX).
DWORD=c.c_uint32; WORD=c.c_uint16; BOOL=c.c_int32; HANDLE=c.c_void_p
SIZE_T=c.c_size_t; PTR=c.c_void_p; LPWSTR=c.POINTER(c.c_wchar)
class COORD(c.Structure):_fields_=[('X',c.c_int16),('Y',c.c_int16)]
class STARTUPINFO(c.Structure):
    _fields_=[('cb',DWORD),('reserved',PTR),('desktop',PTR),('title',PTR),('x',DWORD),('y',DWORD),('xsize',DWORD),('ysize',DWORD),('xchars',DWORD),('ychars',DWORD),('fill',DWORD),('flags',DWORD),('show',WORD),('reserved2size',WORD),('reserved2',PTR),('stdin',HANDLE),('stdout',HANDLE),('stderr',HANDLE)]
class STARTUPINFOEX(c.Structure):_fields_=[('StartupInfo',STARTUPINFO),('attributes',PTR)]
class PROCESS_INFORMATION(c.Structure):_fields_=[('process',HANDLE),('thread',HANDLE),('pid',DWORD),('tid',DWORD)]
class ACCOUNTING(c.Structure):
    _fields_=[('user',c.c_int64),('kernel',c.c_int64),('perioduser',c.c_int64),('periodkernel',c.c_int64),('faults',DWORD),('total',DWORD),('active',DWORD),('terminated',DWORD)]
class BASIC_LIMIT(c.Structure):
    _fields_=[('process_time',c.c_int64),('job_time',c.c_int64),('flags',DWORD),('minworking',SIZE_T),('maxworking',SIZE_T),('active_limit',DWORD),('affinity',SIZE_T),('priority',DWORD),('scheduling',DWORD)]
class IO_COUNTERS(c.Structure):_fields_=[(name,c.c_uint64) for name in ('readops','writeops','otherops','readbytes','writebytes','otherbytes')]
class EXTENDED_LIMIT(c.Structure):
    _fields_=[('basic',BASIC_LIMIT),('io',IO_COUNTERS),('process_memory',SIZE_T),('job_memory',SIZE_T),('peak_process',SIZE_T),('peak_job',SIZE_T)]

CREATE_SUSPENDED=0x4
CREATE_UNICODE_ENVIRONMENT=0x400
EXTENDED_STARTUPINFO_PRESENT=0x80000
PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE=0x20016
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE=0x2000
STARTF_USESTDHANDLES=0x100
WAIT_OBJECT_0=0
WAIT_TIMEOUT=258

class ExitUnconfirmed(RuntimeError):pass
FIXED_STAGES=frozenset(('system-identity','host-guard','node-identity','pipe-create','console-create','attribute-size','attribute-init','attribute-console','job-create','job-limit','process-create','job-assignment-pre-resume','process-resume','process-timeout','process-exit-code','console-status-missing','console-input-missing','Requires x64 pointer ABI','Windows SDK ABI mismatch','process-exit-unconfirmed','job-exit-unconfirmed','console-eof-unconfirmed','console-writer-unconfirmed','console-prompt-order','console-duplicate-prompt','console-prompt-count','console-prompt','console-read','console-write','console-short-write','console-output-limit','job-query','job-terminate','suspended-process-terminate','handle-close','console-child-nonzero','console-command-failed'))
def fixed_stage(error):
    return str(error) if type(error) in (RuntimeError,ExitUnconfirmed) and str(error) in FIXED_STAGES else 'console-command-failed'


def audit_abi():
    if c.sizeof(PTR)!=8:raise RuntimeError('Requires x64 pointer ABI')
    expected=[(COORD,4),(STARTUPINFO,104),(STARTUPINFOEX,112),(PROCESS_INFORMATION,24),(ACCOUNTING,48),(BASIC_LIMIT,64),(IO_COUNTERS,48),(EXTENDED_LIMIT,144)]
    if any(c.sizeof(kind)!=size for kind,size in expected) or ACCOUNTING.active.offset!=40 or BASIC_LIMIT.flags.offset!=16:
        raise RuntimeError('Windows SDK ABI mismatch')

def failure_category(error):
    stage=fixed_stage(error)
    kind='ownership' if isinstance(error,ExitUnconfirmed) else 'argument' if isinstance(error,(TypeError,c.ArgumentError)) else 'api-unavailable' if isinstance(error,AttributeError) else 'os-error' if isinstance(error,OSError) else 'fixed-check' if stage!='console-command-failed' else 'other'
    code=getattr(error,'winerror',None)
    code=str(code) if code in (2,5,6,50,87,109,122,232) else 'other'
    return 'stage='+stage+'; category='+kind+'; win32='+code

def kernel32():
    audit_abi()
    dll=c.WinDLL('kernel32',use_last_error=True)
    signatures={
        'CreatePipe':(BOOL,[c.POINTER(HANDLE),c.POINTER(HANDLE),PTR,DWORD]),
        'CloseHandle':(BOOL,[HANDLE]),
        'CreatePseudoConsole':(c.c_int32,[COORD,HANDLE,HANDLE,DWORD,c.POINTER(HANDLE)]),
        'ClosePseudoConsole':(None,[HANDLE]),
        'InitializeProcThreadAttributeList':(BOOL,[PTR,DWORD,DWORD,c.POINTER(SIZE_T)]),
        'UpdateProcThreadAttribute':(BOOL,[PTR,DWORD,SIZE_T,PTR,SIZE_T,PTR,PTR]),
        'DeleteProcThreadAttributeList':(None,[PTR]),
        'CreateJobObjectW':(HANDLE,[PTR,c.c_wchar_p]),
        'SetInformationJobObject':(BOOL,[HANDLE,c.c_int32,PTR,DWORD]),
        'QueryInformationJobObject':(BOOL,[HANDLE,c.c_int32,PTR,DWORD,PTR]),
        'AssignProcessToJobObject':(BOOL,[HANDLE,HANDLE]),
        'TerminateJobObject':(BOOL,[HANDLE,c.c_uint32]),
        'CreateProcessW':(BOOL,[c.c_wchar_p,LPWSTR,PTR,PTR,BOOL,DWORD,PTR,c.c_wchar_p,c.POINTER(STARTUPINFO),c.POINTER(PROCESS_INFORMATION)]),
        'ResumeThread':(DWORD,[HANDLE]),
        'TerminateProcess':(BOOL,[HANDLE,c.c_uint32]),
        'WaitForSingleObject':(DWORD,[HANDLE,DWORD]),
        'GetExitCodeProcess':(BOOL,[HANDLE,c.POINTER(DWORD)]),
        'ReadFile':(BOOL,[HANDLE,PTR,DWORD,c.POINTER(DWORD),PTR]),
        'WriteFile':(BOOL,[HANDLE,PTR,DWORD,c.POINTER(DWORD),PTR]),
    }
    for name,(result,args) in signatures.items():
        fn=getattr(dll,name);fn.restype=result;fn.argtypes=args
    return dll

def checked(value,stage):
    if not value:raise RuntimeError(stage)

PUBLIC_DOWNLOAD_PROMPT=b'Download now? [y/N]'

def run_console(executable,args,env,cwd,prompts=(),expected=b'',api=None,clock=time.monotonic,capability_diagnostics=False,expected_exit=0,on_closed=None,forbidden_output=(),process_budget_ms=30000,on_drain=None,public_browser_download=False):
    """Only drain-side bytes are inspected. No arbitrary child output is printed."""
    # Exact public browser-consent protocol only. Never an arbitrary echo waiver:
    # setup callers keep the visible-input echo checks and 30s/120s budgets.
    public_protocols=(
        ((PUBLIC_DOWNLOAD_PROMPT,b'n\r'),),
        ((PUBLIC_DOWNLOAD_PROMPT,b'y\r'),(b'EP email',b'\r')),
    )
    if type(public_browser_download) is not bool:raise RuntimeError('host-guard')
    if public_browser_download:
        if args!=['setup'] or tuple(prompts) not in public_protocols or type(process_budget_ms) is not int or process_budget_ms!=960000:raise RuntimeError('host-guard')
    elif type(process_budget_ms) is not int or process_budget_ms not in (30000,120000):raise RuntimeError('host-guard')
    def missing_echo(data):
        return any(answer.rstrip(b'\r\n') not in (b'',b'\x03') and answer.rstrip(b'\r\n') not in data
                   for marker,answer in prompts if not (public_browser_download and marker==PUBLIC_DOWNLOAD_PROMPT))
    api=api or kernel32()
    handles=[];pc=HANDLE();pi=PROCESS_INFORMATION();attributes=None;attribute_ready=False
    job=None;assigned=False;reader=None;writer=None
    output=bytearray();condition=threading.Condition();eof=threading.Event();writer_done=threading.Event();errors=[];sent=[]
    primary=None;cleanup=None;code=DWORD();creation_sides=[]
    def prompt_ready(index):
        marker=prompts[index][0]
        data=bytes(output)
        if any(data.count(token)>1 for token,_ in prompts):raise RuntimeError('console-duplicate-prompt')
        if any(token in data for token,_ in prompts[index+1:]):raise RuntimeError('console-prompt-order')
        return marker in data
    def close(handle):
        if handle and handle.value:
            checked(api.CloseHandle(handle),'handle-close');handle.value=None
    def read_output():
        try:
            while True:
                buffer=c.create_string_buffer(4096);count=DWORD()
                ok=api.ReadFile(output_read,buffer,len(buffer),c.byref(count),None)
                if not ok:
                    if c.get_last_error() in (109,232):break
                    raise RuntimeError('console-read')
                if not count.value:break
                with condition:
                    output.extend(buffer.raw[:count.value])
                    if len(output)>65536:raise RuntimeError('console-output-limit')
                    condition.notify_all()
        except BaseException as error:errors.append(error)
        finally:
            eof.set()
            with condition:condition.notify_all()
    def write_prompts():
        try:
            for index,(marker,answer) in enumerate(prompts):
                deadline=clock()+(950 if public_browser_download and index==1 else 10)
                with condition:
                    while not prompt_ready(index):
                        if eof.is_set() or clock()>=deadline:raise RuntimeError('console-prompt')
                        condition.wait(.05)
                data=c.create_string_buffer(answer);count=DWORD()
                checked(api.WriteFile(input_write,data,len(answer),c.byref(count),None),'console-write')
                if count.value!=len(answer):raise RuntimeError('console-short-write')
                sent.append(answer)
        except BaseException as error:errors.append(error)
        finally:writer_done.set()
    try:
        input_read=HANDLE();input_write=HANDLE();output_read=HANDLE();output_write=HANDLE()
        for a,b in ((input_read,input_write),(output_read,output_write)):
            checked(api.CreatePipe(c.byref(a),c.byref(b),None,0),'pipe-create');handles.extend((a,b))
        creation_sides=[input_read,output_write]
        if api.CreatePseudoConsole(COORD(120,30),input_read,output_write,0,c.byref(pc))!=0 or not pc.value:raise RuntimeError('console-create')
        size=SIZE_T();c.set_last_error(0)
        first=api.InitializeProcThreadAttributeList(None,1,0,c.byref(size))
        if first or c.get_last_error()!=122 or not size.value:raise RuntimeError('attribute-size')
        attributes=c.create_string_buffer(size.value)
        checked(api.InitializeProcThreadAttributeList(attributes,1,0,c.byref(size)),'attribute-init');attribute_ready=True
        checked(api.UpdateProcThreadAttribute(attributes,0,PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE,pc,c.sizeof(HANDLE),None,None),'attribute-console')
        job=HANDLE(api.CreateJobObjectW(None,None));checked(job.value,'job-create')
        limits=EXTENDED_LIMIT();limits.basic.flags=JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        checked(api.SetInformationJobObject(job,9,c.byref(limits),c.sizeof(limits)),'job-limit')
        si=STARTUPINFOEX();si.StartupInfo.cb=c.sizeof(si);si.attributes=c.cast(attributes,PTR)
        # Redirected runner std handles otherwise get duplicated despite FALSE inheritance.
        # Match maintained node-pty's ConPTY launch, not generic pipe inheritance.
        si.StartupInfo.flags=STARTF_USESTDHANDLES
        si.StartupInfo.stdin=None;si.StartupInfo.stdout=None;si.StartupInfo.stderr=None
        command=c.create_unicode_buffer(subprocess.list2cmdline([str(executable),*args]))
        environment=c.create_unicode_buffer('\0'.join(k+'='+v for k,v in sorted(env.items(),key=lambda kv:kv[0].upper()))+'\0\0')
        checked(api.CreateProcessW(str(executable),command,None,None,False,CREATE_SUSPENDED|CREATE_UNICODE_ENVIRONMENT|EXTENDED_STARTUPINFO_PRESENT,environment,str(cwd),c.byref(si.StartupInfo),c.byref(pi)),'process-create')
        for handle in creation_sides:close(handle)
        checked(api.AssignProcessToJobObject(job,pi.process),'job-assignment-pre-resume');assigned=True
        reader=threading.Thread(target=read_output,daemon=True);reader.start()
        checked(api.ResumeThread(pi.thread)!=0xFFFFFFFF,'process-resume')
        writer=threading.Thread(target=write_prompts,daemon=True);writer.start()
        if api.WaitForSingleObject(pi.process,process_budget_ms)!=WAIT_OBJECT_0:raise RuntimeError('process-timeout')
        checked(api.GetExitCodeProcess(pi.process,c.byref(code)),'process-exit-code')
    except BaseException as error:primary=error
    finally:
        try:
            if pi.process:
                if api.WaitForSingleObject(pi.process,0)!=WAIT_OBJECT_0:
                    if assigned:checked(api.TerminateJobObject(job,1),'job-terminate')
                    else:checked(api.TerminateProcess(pi.process,1),'suspended-process-terminate')
                if api.WaitForSingleObject(pi.process,5000)!=WAIT_OBJECT_0:raise ExitUnconfirmed('process-exit-unconfirmed')
            if assigned:
                deadline=clock()+5
                while True:
                    info=ACCOUNTING();checked(api.QueryInformationJobObject(job,1,c.byref(info),c.sizeof(info),None),'job-query')
                    if info.active==0:break
                    if clock()>=deadline:raise ExitUnconfirmed('job-exit-unconfirmed')
                    time.sleep(.05)
            if pc.value:api.ClosePseudoConsole(pc);pc.value=None
            if reader:
                reader.join(5)
                if not eof.is_set() or reader.is_alive():raise ExitUnconfirmed('console-eof-unconfirmed')
            if writer:
                writer.join(12)
                if writer.is_alive():raise ExitUnconfirmed('console-writer-unconfirmed')
        except BaseException as error:cleanup=error
        # Closing the owned job enforces kill-on-close even on a failed certainty check.
        for handle in (HANDLE(pi.thread),HANDLE(pi.process),job):
            if handle:
                try:close(handle)
                except BaseException as error:cleanup=cleanup or error
        if pc.value:
            try:api.ClosePseudoConsole(pc)
            except BaseException as error:cleanup=cleanup or error
        if attribute_ready:api.DeleteProcThreadAttributeList(attributes)
        if not (reader and reader.is_alive()) and not (writer and writer.is_alive()):
            for handle in handles:
                try:close(handle)
                except BaseException as error:cleanup=cleanup or error
    # Optional diagnostic observer only; it cannot certify closure or replace failures.
    if on_drain:
        try:on_drain(bytes(output))
        except BaseException:pass # Observation must not replace primary/cleanup outcomes.
    # Inspect the whole drained stream even when another operation failed. A
    # missing typed-input echo is a fixed primary and forbids native cleanup
    # certification; a run whose inputs were never fully sent or whose drain
    # never finished has no complete stream to judge.
    if not errors and eof.is_set() and len(sent)==len(prompts) and missing_echo(bytes(output)):
        raise ExitUnconfirmed('console-input-missing') from RuntimeError('console-input-missing')
    if cleanup:raise ExitUnconfirmed(fixed_stage(cleanup)) from primary
    if on_closed:on_closed()
    if primary:raise primary
    if capability_diagnostics:
        data=bytes(output)
        matches=re.findall(rb'^CONPTY_CAPABILITY stdinTTY=([01]) stdoutTTY=([01]) rawMode=([01])\r?$',data,re.MULTILINE)
        values=[part.decode('ascii') for part in matches[0]] if len(matches)==1 else ['unknown']*3
        fields=[name+'='+value for name,value in zip(('stdinTTY','stdoutTTY','rawMode'),values)]
        print('ConPTY fixed child capability: '+'; '.join(fields)+'; exit='+('zero' if code.value==0 else 'nonzero')+'; exitDWORD='+str(code.value))
    if code.value!=expected_exit:raise RuntimeError('console-child-nonzero')
    if errors:raise RuntimeError(fixed_stage(errors[0]))
    if not writer_done.is_set():raise RuntimeError('console-command-failed')
    captured=bytes(output)
    if expected not in captured:raise RuntimeError('console-status-missing')
    if any(token in captured for token in forbidden_output):raise RuntimeError('console-command-failed')
    if any(captured.count(token)!=1 for token,_ in prompts):raise RuntimeError('console-prompt-count')
    if missing_echo(captured):raise RuntimeError('console-input-missing')
    return True
