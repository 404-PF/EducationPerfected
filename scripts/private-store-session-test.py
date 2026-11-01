#!/usr/bin/env python3
"""Inert ownership/retention controls. No actual process or credential API."""
import importlib.util, pathlib, subprocess, tempfile, shutil, io, os, sys
sys.dont_write_bytecode=True
from unittest import mock
spec=importlib.util.spec_from_file_location('session',pathlib.Path(__file__).with_name('private-store-session.py'))
session=importlib.util.module_from_spec(spec);spec.loader.exec_module(session)
class Child:
    def __init__(self, live=False):self.done=False;self.live=live;self.terminated=False;self.killed=False;self.stdout=io.StringIO('unix:path=/inert/bus\n');self.stdin=io.BytesIO()
    def poll(self):return 0 if self.done else None
    def terminate(self):self.terminated=True
    def kill(self):self.killed=True
    def wait(self,timeout):
        if self.live:raise subprocess.TimeoutExpired('inert',timeout)
        self.done=True;return 0
for scenario in ['success','bus-start-failure','fixture-failure','keyring-live','bus-live']:
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-session-inert-'));shutil.rmtree(root)
    bus=Child(scenario=='bus-live');keyring=Child(scenario=='keyring-live');calls=[]
    primary=RuntimeError('inert primary')
    def popen(args,**kwargs):
        assert kwargs['env']['HOME']==str(root)
        assert all(key not in kwargs['env'] for key in ('EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT','DBUS_SESSION_BUS_PID'))
        assert '--nofork' in args if args[0]=='dbus-daemon' else '--foreground' in args
        calls.append(args[0]);return bus if args[0]=='dbus-daemon' else keyring
    def run(args,**kwargs):
        assert kwargs['env']['DBUS_SESSION_BUS_ADDRESS']=='unix:path=/inert/bus'
        if args[0]=='sh' and scenario=='fixture-failure':raise primary
        return subprocess.CompletedProcess(args,0)
    try:
        with mock.patch.object(session.sys,'argv',['fixed']),mock.patch.object(session.sys,'platform','linux'),mock.patch.object(session.tempfile,'mkdtemp',side_effect=lambda **kw:(root.mkdir(),str(root))[1]),mock.patch.object(session.subprocess,'Popen',side_effect=popen),mock.patch.object(session.subprocess,'run',side_effect=run),mock.patch.object(session.select,'select',return_value=([] if scenario=='bus-start-failure' else [bus.stdout],[],[])),mock.patch.dict(os.environ,{'EP_EMAIL':str(0),'EP_PASSWORD':str(0),'EP_TEST_BOOT':'1','DBUS_SESSION_BUS_PID':'123'}):
            try:session.main();assert scenario=='success'
            except BaseException as error:
                assert scenario!='success'
                if scenario=='fixture-failure':assert error is primary
        assert root.exists()==(scenario in ['fixture-failure','keyring-live','bus-live'])
        assert bus.terminated
        if scenario!='bus-start-failure':assert keyring.terminated
        if scenario=='keyring-live':assert keyring.killed and bus.done
        if scenario=='bus-live':assert bus.killed and keyring.done
    finally:shutil.rmtree(root,ignore_errors=True)
print('Private session inert controls: exact owned daemons, bounded termination, live-root retention and primary failure preserved.')
