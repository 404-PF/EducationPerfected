; Per-user EducationPerfected installer for Windows. No administrator rights.
; Compiled by the beta-preparation candidate lane with /DAppVersion and /DSourceExe.
[Setup]
AppId={{5C0EDD47-9C42-5901-AF48-2393F39A36CD}
AppName=EducationPerfected
AppVersion={#AppVersion}
AppPublisher=404-PF
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
ChangesUninstall=yes

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "educationperfected-windows-x64.exe"; Flags: ignoreversion

[Tasks]
Name: "addtopath"; Description: "Add EducationPerfected to your PATH"; GroupDescription: "Extra options:"

[Icons]
Name: "{group}\EducationPerfected"; Filename: "{app}\educationperfected-windows-x64.exe"
Name: "{group}\Uninstall EducationPerfected"; Filename: "{uninstallexe}"

[Code]
const
  EnvironmentKey = 'Environment';

procedure AddAppToPath;
var
  CurrentPath: string;
begin
  if not RegQueryStringValue(HKCU, EnvironmentKey, 'Path', CurrentPath) then
    CurrentPath := '';
  if Pos(Uppercase(ExpandConstant('{app}')), Uppercase(CurrentPath)) = 0 then
  begin
    if CurrentPath = '' then
      RegWriteStringValue(HKCU, EnvironmentKey, 'Path', ExpandConstant('{app}'))
    else
      RegWriteStringValue(HKCU, EnvironmentKey, 'Path', CurrentPath + ';' + ExpandConstant('{app}'));
  end;
end;

procedure RemoveAppFromPath;
var
  CurrentPath, Cleaned: string;
begin
  if RegQueryStringValue(HKCU, EnvironmentKey, 'Path', CurrentPath) then
  begin
    Cleaned := CurrentPath;
    StringChange(Cleaned, ';' + ExpandConstant('{app}'), '');
    StringChange(Cleaned, ExpandConstant('{app}') + ';', '');
    StringChange(Cleaned, ExpandConstant('{app}'), '');
    if Cleaned <> CurrentPath then
      RegWriteStringValue(HKCU, EnvironmentKey, 'Path', Cleaned);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and IsTaskSelected('addtopath') then
    AddAppToPath;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveAppFromPath;
end;
