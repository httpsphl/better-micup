' Starts guard.ps1 (same folder as this file) hidden, in the background.
Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
psExe = WshShell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
psPath = Fso.BuildPath(Fso.GetParentFolderName(WScript.ScriptFullName), "guard.ps1")
cmd = """" & psExe & """ -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & psPath & """"
WshShell.Run cmd, 0, False
