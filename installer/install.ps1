# ==============================================================================
# Better MicUP - instalador / desinstalador
# ==============================================================================
# Instalar:     Instalar.bat     (ou: install.ps1)
# Desinstalar:  Desinstalar.bat  (ou: install.ps1 -Uninstall)
#
# O que a instalação faz:
#   1. para guards antigos do Better MicUP que estejam rodando
#   2. copia miccord.js/css, guard.ps1/vbs para %APPDATA%\BetterMicUP
#      (se já havia uma versão diferente, ela vai para backup-<data>)
#   3. registra o guard para iniciar com o Windows (HKCU\...\Run)
#   4. aplica o mod no Micup agora e deixa o guard rodando em segundo plano
#
# Desenvolvimento: -PayloadDir ..\src instala direto dos fontes do repositório.
# Parâmetros de teste: -InstallDir, -DataDir (pasta micup_desktop), -RunValueName,
# -NoStart (não inicia o guard em segundo plano), -Yes (não pergunta nada).
# ==============================================================================
param(
    [switch]$Uninstall,
    [switch]$Yes,
    [switch]$NoStart,
    [string]$PayloadDir = (Join-Path $PSScriptRoot "files"),
    [string]$InstallDir = (Join-Path $env:APPDATA "BetterMicUP"),
    [string]$DataDir,
    [string]$RunValueName = "BetterMicUPGuard"
)

$ErrorActionPreference = 'Stop'
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$PayloadDir = [System.IO.Path]::GetFullPath($PayloadDir)
$PayloadFiles = @("miccord.js", "miccord.css", "guard.ps1", "guard.vbs", "README.md")
$InstallDir = [System.IO.Path]::GetFullPath($InstallDir)

function Say([string]$msg, [string]$color = "Gray") { Write-Host $msg -ForegroundColor $color }
function Ok([string]$msg) { Write-Host "  [ok] $msg" -ForegroundColor Green }
function Warn([string]$msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }

function Get-GuardArgs {
    if ($DataDir) { return @("-DataDir", $DataDir) }
    return @()
}

function Stop-Guards {
    $guardPath = [regex]::Escape((Join-Path $InstallDir "guard.ps1"))
    $procs = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
        Where-Object { $_.CommandLine -match $guardPath })
    foreach ($p in $procs) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    if ($procs.Count -gt 0) { Start-Sleep -Milliseconds 500 }
    return $procs.Count
}

function Find-Micup {
    if ($DataDir) { return (Test-Path -LiteralPath $DataDir) }
    $pkgs = Join-Path $env:LOCALAPPDATA "Packages"
    if (Get-ChildItem -LiteralPath $pkgs -Directory -Filter "Micup.Micup*" -ErrorAction SilentlyContinue) { return $true }
    foreach ($c in @((Join-Path $env:APPDATA "micup_desktop"), (Join-Path $env:LOCALAPPDATA "micup_desktop"))) {
        if (Test-Path -LiteralPath $c) { return $true }
    }
    return $false
}

# Runs guard.ps1 with the given switch and returns the log lines it wrote.
function Invoke-Guard([string]$switchName) {
    $log = Join-Path $InstallDir "guard.log"
    $before = if (Test-Path -LiteralPath $log) { @(Get-Content -LiteralPath $log).Count } else { 0 }
    $guardArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $InstallDir "guard.ps1"), $switchName) + (Get-GuardArgs)
    $out = & powershell.exe @guardArgs
    if ($out) { $out | ForEach-Object { Warn $_ } }
    if (-not (Test-Path -LiteralPath $log)) { return @() }
    return @(Get-Content -LiteralPath $log | Select-Object -Skip $before)
}

function Test-MicupRunning {
    return [bool](Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like "Micup*" })
}

# ------------------------------------------------------------------------------
function Install-BetterMicUP {
    Say ""
    Say "Better MicUP - instalação" "Cyan"
    Say "Destino: $InstallDir"
    Say ""

    foreach ($f in $PayloadFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $PayloadDir $f))) {
            throw "Arquivo do pacote ausente: files$f. Extraia o zip inteiro antes de instalar."
        }
    }
    if (-not (Find-Micup)) {
        Warn "Micup não encontrado. O mod será aplicado sozinho quando o Micup for instalado e aberto."
    }

    $stopped = Stop-Guards
    if ($stopped -gt 0) { Ok "$stopped guard(s) antigo(s) parado(s)" }

    if (-not (Test-Path -LiteralPath $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null }

    # Back up the previous version when something actually changes.
    $changed = @($PayloadFiles | Where-Object {
        $dest = Join-Path $InstallDir $_
        (Test-Path -LiteralPath $dest) -and
        ((Get-FileHash -LiteralPath $dest).Hash -ne (Get-FileHash -LiteralPath (Join-Path $PayloadDir $_)).Hash)
    })
    if ($changed.Count -gt 0) {
        $bk = Join-Path $InstallDir ("backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
        New-Item -ItemType Directory -Path $bk -Force | Out-Null
        foreach ($f in $changed) { Copy-Item -LiteralPath (Join-Path $InstallDir $f) -Destination $bk -Force }
        Ok "versão anterior guardada em $(Split-Path -Leaf $bk)"
    }

    foreach ($f in $PayloadFiles) {
        $dest = Join-Path $InstallDir $f
        Copy-Item -LiteralPath (Join-Path $PayloadDir $f) -Destination $dest -Force
        Unblock-File -LiteralPath $dest -ErrorAction SilentlyContinue  # tira a marca de "baixado da internet"
    }
    # Keep an uninstaller next to the installed files.
    Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $InstallDir "setup.ps1") -Force
    $uninstallBat = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0setup.ps1`" -Uninstall`r`npause`r`n"
    [System.IO.File]::WriteAllText((Join-Path $InstallDir "Desinstalar.bat"), $uninstallBat, (New-Object System.Text.UTF8Encoding($false)))
    Unblock-File -LiteralPath (Join-Path $InstallDir "setup.ps1") -ErrorAction SilentlyContinue
    Ok "arquivos copiados"

    if (-not (Test-Path -LiteralPath $RunKey)) { New-Item -Path $RunKey -Force | Out-Null }
    $runValue = "wscript.exe `"$(Join-Path $InstallDir 'guard.vbs')`""
    Set-ItemProperty -Path $RunKey -Name $RunValueName -Value $runValue
    Ok "guard registrado para iniciar com o Windows"

    $lines = Invoke-Guard "-CheckOnly"
    $applied = @($lines | Where-Object { $_ -match "applied to renderer" })
    $failed = @($lines | Where-Object { $_ -match "Failed|Error|failed" })
    foreach ($l in $applied) { Ok ("mod aplicado: " + ($l -replace '^.*build ', 'Micup ').TrimEnd(').')) }
    foreach ($l in $failed) { Warn $l }
    if ($applied.Count -eq 0 -and $failed.Count -eq 0) { Ok "o Micup já estava com esta versão do mod" }

    if (-not $NoStart) {
        # Started through WMI so the guard is not a child of whatever ran the installer (a
        # terminal, a launcher's job object...) and doesn't die when that closes.
        $guardCmd = "wscript.exe `"$(Join-Path $InstallDir 'guard.vbs')`""
        $started = $false
        try {
            $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $guardCmd }
            $started = ($r.ReturnValue -eq 0)
        } catch {}
        if (-not $started) { Start-Process -FilePath "wscript.exe" -ArgumentList "`"$(Join-Path $InstallDir 'guard.vbs')`"" }
        Ok "guard rodando em segundo plano"
    }

    Say ""
    Say "Pronto!" "Green"
    if (Test-MicupRunning) {
        Say "O Micup está aberto: feche pela bandeja (botão direito > Sair) e abra de novo para carregar o mod." "Yellow"
    } else {
        Say "Abra o Micup. As opções do mod ficam no Ctrl+Shift+M."
    }
    Say "Para desinstalar: $(Join-Path $InstallDir 'Desinstalar.bat')"
}

# ------------------------------------------------------------------------------
function Uninstall-BetterMicUP {
    Say ""
    Say "Better MicUP - desinstalação" "Cyan"
    Say ""
    if (-not $Yes) {
        $answer = Read-Host "Remover o Better MicUP e devolver o Micup ao original? (S/N)"
        if ($answer -notmatch '^[sSyY]') { Say "Cancelado."; return }
    }

    $stopped = Stop-Guards
    if ($stopped -gt 0) { Ok "guard parado" }

    if (Test-Path -LiteralPath (Join-Path $InstallDir "guard.ps1")) {
        $lines = Invoke-Guard "-Restore"
        foreach ($l in ($lines | Where-Object { $_ -match "Restored" })) { Ok ("Micup restaurado: " + ($l -replace '^.*renderer ', '').Substring(0, 12) + "...") }
        foreach ($l in ($lines | Where-Object { $_ -notmatch "Restored" })) { Warn $l }
    } else {
        Warn "guard.ps1 não encontrado em $InstallDir; não foi possível restaurar o Micup."
    }

    if (Get-ItemProperty -Path $RunKey -Name $RunValueName -ErrorAction SilentlyContinue) {
        Remove-ItemProperty -Path $RunKey -Name $RunValueName
        Ok "inicialização com o Windows removida"
    }

    if (Test-Path -LiteralPath $InstallDir) {
        $runningFromInstallDir = $PSScriptRoot -and ([System.IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -ieq $InstallDir.TrimEnd('\'))
        if ($runningFromInstallDir) {
            # This script (and the .bat that called it) live there: delete once they exit.
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c timeout /t 3 /nobreak >nul & rmdir /s /q `"$InstallDir`"" -WindowStyle Hidden
            Ok "pasta $InstallDir será apagada em alguns segundos"
        } else {
            Remove-Item -LiteralPath $InstallDir -Recurse -Force
            Ok "pasta $InstallDir apagada"
        }
    }

    Say ""
    Say "Better MicUP removido." "Green"
    if (Test-MicupRunning) { Say "Feche o Micup pela bandeja (Sair) e abra de novo." "Yellow" }
}

try {
    if ($Uninstall) { Uninstall-BetterMicUP } else { Install-BetterMicUP }
} catch {
    Say ""
    Say "ERRO: $($_.Exception.Message)" "Red"
    exit 1
}
