; Per-user EducationPerfected installer for Windows. No administrator rights.
; Compiled by the beta-preparation candidate lane with /DAppVersion and /DSourceExe.
[Setup]
AppId={{5C0EDD47-9C42-5901-AF48-2393F39A36CD}
AppName=EducationPerfected
AppVersion={#AppVersion}
AppPublisher=404-Page-Found
DefaultDirName={localappdata}\Programs\EducationPerfected
DefaultGroupName=EducationPerfected
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=educationperfected-setup-windows-x64
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
DisableDirPage=yes
DisableProgramGroupPage=yes
UninstallDisplayName=EducationPerfected
ChangesEnvironment=yes

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "educationperfected-windows-x64.exe"; Flags: ignoreversion

[Tasks]
Name: "addtopath"; Description: "Add EducationPerfected to your PATH"; GroupDescription: "Extra options:"

[Icons]
Name: "{group}\EducationPerfected"; Filename: "{app}\educationperfected-windows-x64.exe"
Name: "{group}\Uninstall EducationPerfected"; Filename: "{uninstallexe}"

[UninstallDelete]
Type: files; Name: "{app}\educationperfected-windows-x64.exe.backup"
Type: files; Name: "{app}\educationperfected-windows-x64.exe.update-result"
Type: files; Name: "{app}\educationperfected-windows-x64.exe.update.lock"
Type: filesandordirs; Name: "{app}\.update-*"

[Code]
const
  EnvironmentKey = 'Environment';

procedure AddAppToPath;
var
  CurrentPath, Entry, Rest: string;
  P: Integer;
begin
  if not RegQueryStringValue(HKCU, EnvironmentKey, 'Path', CurrentPath) then
    CurrentPath := '';
  Rest := CurrentPath;
  while True do
  begin
    P := Pos(';', Rest);
    if P = 0 then
      Entry := Rest
    else
    begin
      Entry := Copy(Rest, 1, P - 1);
      Rest := Copy(Rest, P + 1, Length(Rest));
    end;
    if CompareText(Entry, ExpandConstant('{app}')) = 0 then
      Exit;
    if P = 0 then
      Break;
  end;
  if CurrentPath = '' then
    RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', ExpandConstant('{app}'))
  else
    RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', CurrentPath + ';' + ExpandConstant('{app}'));
end;

procedure RemoveAppFromPath;
var
  CurrentPath, Entry, Rest, Cleaned: string;
  P: Integer;
begin
  if not RegQueryStringValue(HKCU, EnvironmentKey, 'Path', CurrentPath) then
    Exit;
  Rest := CurrentPath;
  Cleaned := '';
  while True do
  begin
    P := Pos(';', Rest);
    if P = 0 then
      Entry := Rest
    else
    begin
      Entry := Copy(Rest, 1, P - 1);
      Rest := Copy(Rest, P + 1, Length(Rest));
    end;
    if CompareText(Entry, ExpandConstant('{app}')) <> 0 then
    begin
      if Cleaned = '' then
        Cleaned := Entry
      else
        Cleaned := Cleaned + ';' + Entry;
    end;
    if P = 0 then
      Break;
  end;
  if Cleaned <> CurrentPath then
    RegWriteExpandStringValue(HKCU, EnvironmentKey, 'Path', Cleaned);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
    AddAppToPath;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  AppData: string;
  ResultCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    if MsgBox('Also remove the saved EducationPerfected login from the Windows credential store?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = idYes then
      if not Exec(ExpandConstant('{app}\educationperfected-windows-x64.exe'), 'forget-credentials', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
        MsgBox('The saved login could not be removed automatically. Run: educationperfected-windows-x64.exe forget-credentials', mbInformation, MB_OK);
    AppData := ExpandConstant('{%USERPROFILE}\.educationperfected');
    if DirExists(AppData) and (MsgBox('Also remove EducationPerfected app data and downloaded browsers (' + AppData + ')?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = idYes) then
      DelTree(AppData, True, True, True);
  end;
  if CurUninstallStep = usPostUninstall then
    RemoveAppFromPath;
end;
