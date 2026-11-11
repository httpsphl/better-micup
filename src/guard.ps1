# ==============================================================================
# Better MicUP Guard v2 - background watcher & auto-patcher
# ==============================================================================
# Keeps miccord.js/miccord.css injected into Micup's renderer module
# (modules\store\fluxer_renderer\<sha256>) across Micup updates.
#
# v2 fixes (2026-11-10):
#  - Single instance (named mutex). v1 could run 3+ copies at once, all patching
#    the same folder concurrently.
#  - Never writes modules\state.json. v1 force-committed renderer hashes, reset
#    boot_attempt and cleared "rejected", which broke Micup's own rollback and
#    once left state.json as invalid JSON (app would not start).
#  - Waits until a new renderer folder has stopped changing before patching.
#  - Stages index.html / module.json / assets in temp files and swaps them in
#    back-to-back, so Micup never validates a half-patched module.
#  - Injects miccord.js before the app's first module script. v1 fell back to
#    "before </body>" on Micup 1.0.21 (its regex never matched), which ran the
#    mod after the Rspack runtime and broke lazy chunk loading.
#  - Re-syncs assets\miccord.js|css when the copies next to this script change.
#  - -Restore puts the original index.html/module.json back (uninstall).
#
# v3 (2026-11-11): auto-update. Every few hours the guard downloads manifest.json
# from the latest GitHub release, checks its RSA signature against the public key
# below (only the holder of the release key can publish), verifies every file's
# sha256, then swaps the new files in and re-patches Micup. Turn it off with
# update-config.json: { "autoUpdate": false }.
#
# Usage:
#   guard.ps1              run in background (started by guard.vbs at logon)
#   guard.ps1 -CheckOnly   patch once and exit
#   guard.ps1 -UpdateNow   check for an update once, apply it, patch and exit
#   guard.ps1 -Restore     remove the mod from every renderer folder and exit
#   -DataDir <path>        operate on a specific micup_desktop folder (testing)
# ==============================================================================
param(
    [switch]$CheckOnly,
    [switch]$Restore,
    [switch]$UpdateNow,
    [string]$DataDir
)

# --- Auto-update settings -----------------------------------------------------
# $UpdatePublicKeyXml is written by scripts/keygen.mjs. Never edit it by hand: an
# installed guard only accepts releases signed by the matching private key.
$UpdateRepo = "httpsphl/better-micup"
$UpdateManifestUrl = "https://github.com/$UpdateRepo/releases/latest/download/manifest.json"
$UpdatePublicKeyXml = '<RSAKeyValue><Modulus>oQ7IBo484srVZLYwDOykkH4WJccJ8PFOSg+VAOHqW7kM/oXa2BKWyVosL+pEmCVFtE9HbX5VmJtKboPVXlucpAtaBVMDaoGbxX3d2yYl6j/9xTJbo+p4HhlpWmp7hnTp2am/3m0R2kedRa2wBM1tHaQld6SSNFuRUpCAI+U3a2XeRq7JJ2JyI3BfUEIvWbGtPd3tF5issRVNkW6u9wmk8nbL9BX+0q6PCrFGX3OxutLldS8rAZ1wYKk6o1++o9oSThXn4eahSXQLWrEJjOpSxZSmDi21LogEikr2BQ8b/s10qeVlMxca8X/i5RjvakezkHak9Fy96ygrfpskG69Fy7Cm//8byJNlbI38zOhE/glYzGQVDuYxQenAPeDoaIHwXpTDJnw8SAOgTov6KQ1bEEI8YlpuMf7yCPf7LNzkrNiHgiAYkOv8WQ5BrYRZ2RTcwNBDVi4mlmT3rQFWTj7Nz53bui4fyc67ARfjkcEauontxtS7v+UeV0DRFni2KSvb</Modulus><Exponent>AQAB</Exponent></RSAKeyValue>'
$UpdateFiles = @("miccord.js", "miccord.css", "guard.ps1", "guard.vbs", "README.md", "setup.ps1")
$UpdateFirstCheckMinutes = 2
$UpdateIntervalHours = 3

$ErrorActionPreference = 'Stop'
$guardAppDataDir = Join-Path ([System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)) "BetterMicUP"
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { $guardAppDataDir }
$global:utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$global:logPath = Join-Path $scriptDir "guard.log"

$CssTag = '<link href="/assets/miccord.css" rel="stylesheet">'
$JsTag = '<script nonce="{{CSP_NONCE_PLACEHOLDER}}" src="/assets/miccord.js" type="module"></script>'
$ModPaths = @("index.html", "assets/miccord.js", "assets/miccord.css")

# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------
function Write-GuardLog([string]$msg) {
    try {
        if ((Test-Path -LiteralPath $global:logPath) -and ((Get-Item -LiteralPath $global:logPath).Length -gt 512KB)) {
            Move-Item -LiteralPath $global:logPath -Destination "$($global:logPath).old" -Force
        }
        $line = "[{0}] [pid {1}] {2}`r`n" -f (Get-Date).ToString("yyyy-MM-dd HH:mm:ss"), $PID, $msg
        [System.IO.File]::AppendAllText($global:logPath, $line, $global:utf8NoBom)
    } catch {}
}

function Read-TextNoBom([string]$path) {
    return [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8).TrimStart([char]0xFEFF)
}

function Get-BytesSha256([byte[]]$bytes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    } finally {
        $sha.Dispose()
    }
}

function Get-FileSha256([string]$path) {
    if (-not (Test-Path -LiteralPath $path)) { return $null }
    return Get-BytesSha256 ([System.IO.File]::ReadAllBytes($path))
}

# Replace $dest with $tmp. Retries because Micup may hold the file open for a moment.
function Move-Into([string]$tmp, [string]$dest) {
    for ($i = 1; $i -le 6; $i++) {
        try {
            if (Test-Path -LiteralPath $dest) {
                # [NullString]::Value: a plain $null becomes "" when passed to a .NET string parameter
                [System.IO.File]::Replace($tmp, $dest, [NullString]::Value)
            } else {
                [System.IO.File]::Move($tmp, $dest)
            }
            return
        } catch {
            if ($i -eq 6) { throw }
            Start-Sleep -Milliseconds (150 * $i)
        }
    }
}

function Find-MicupDataDirs {
    $results = New-Object System.Collections.Generic.List[string]
    if ($DataDir) {
        if (Test-Path -LiteralPath $DataDir) { $results.Add((Resolve-Path -LiteralPath $DataDir).Path) }
        return $results
    }
    $localAppData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::LocalApplicationData)
    $appData = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)

    # Microsoft Store (MSIX) install: data is virtualized under Packages\Micup.Micup_*\LocalCache
    $packagesDir = Join-Path $localAppData "Packages"
    if (Test-Path -LiteralPath $packagesDir) {
        foreach ($pkg in (Get-ChildItem -LiteralPath $packagesDir -Directory -Filter "Micup.Micup*" -ErrorAction SilentlyContinue)) {
            foreach ($sub in @("LocalCache\Roaming\micup_desktop", "LocalCache\Local\micup_desktop")) {
                $c = Join-Path $pkg.FullName $sub
                if ((Test-Path -LiteralPath $c) -and -not $results.Contains($c)) { $results.Add($c) }
            }
        }
    }
    # Classic installer
    foreach ($c in @((Join-Path $appData "micup_desktop"), (Join-Path $localAppData "micup_desktop"))) {
        if ((Test-Path -LiteralPath $c) -and -not $results.Contains($c)) { $results.Add($c) }
    }
    return $results
}

function Get-RendererDirs([string]$micupDataDir) {
    $storeDir = Join-Path $micupDataDir "modules\store\fluxer_renderer"
    if (-not (Test-Path -LiteralPath $storeDir)) { return @() }
    return @(Get-ChildItem -LiteralPath $storeDir -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^[0-9a-f]{64}$' })
}

# Micup extracts a module into store\.incoming-<sha> and renames it into place, so a
# folder is complete once it shows up. Still wait a few seconds so we never race the
# first validation pass Micup does right after installing it.
function Test-FolderSettled([string]$rendererDir) {
    $limit = (Get-Date).ToUniversalTime().AddSeconds(-4)
    foreach ($name in @("index.html", "module.json")) {
        $p = Join-Path $rendererDir $name
        if (-not (Test-Path -LiteralPath $p)) { return $false }
        if ((Get-Item -LiteralPath $p).LastWriteTimeUtc -gt $limit) { return $false }
    }
    return $true
}

# sha256 declared for $relPath in module.json text (cheap regex, no JSON parse).
function Get-DeclaredSha([string]$moduleText, [string]$relPath) {
    $pattern = '"path"\s*:\s*"' + [regex]::Escape($relPath) + '"\s*,\s*"sha256"\s*:\s*"([0-9a-f]{64})"'
    $m = [regex]::Match($moduleText, $pattern)
    if ($m.Success) { return $m.Groups[1].Value }
    return $null
}

# Remove any previous injection and inject again at the right spot.
function Build-PatchedHtml([string]$html) {
    $opts = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    $clean = [regex]::Replace($html, '<link\b[^>]*?/assets/miccord\.css[^>]*>', '', $opts)
    $clean = [regex]::Replace($clean, '<script\b[^>]*?/assets/miccord\.js[^>]*>\s*</script>', '', $opts)

    $headIdx = $clean.IndexOf("</head>", [System.StringComparison]::OrdinalIgnoreCase)
    if ($headIdx -ge 0) { $clean = $clean.Insert($headIdx, $CssTag) } else { $clean = $CssTag + $clean }

    # miccord.js must run before the Rspack runtime: put it before the first app
    # script that loads from /assets (all of them are type="module", so order is kept).
    $first = [regex]::Match($clean, '<script\b[^>]*\bsrc="/assets/[^"]+\.js"[^>]*>', $opts)
    if ($first.Success) {
        $clean = $clean.Insert($first.Index, $JsTag)
    } else {
        $bodyIdx = $clean.LastIndexOf("</body>", [System.StringComparison]::OrdinalIgnoreCase)
        if ($bodyIdx -ge 0) { $clean = $clean.Insert($bodyIdx, $JsTag) } else { $clean += $JsTag }
    }
    return $clean
}

function Save-OriginalBackup([string]$rendererDir, [string]$micupDataDir, [string]$html) {
    if ($html -match 'miccord\.js') { return }  # already modified, nothing pristine to save
    $hash = Split-Path -Leaf $rendererDir
    $backupDir = Join-Path $micupDataDir "modules\miccord_backups\$hash"
    if (-not (Test-Path -LiteralPath $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
    $idxBak = Join-Path $backupDir "index.html.orig"
    $modBak = Join-Path $backupDir "module.json.orig"
    if (-not (Test-Path -LiteralPath $idxBak)) { Copy-Item -LiteralPath (Join-Path $rendererDir "index.html") -Destination $idxBak -Force }
    if (-not (Test-Path -LiteralPath $modBak)) { Copy-Item -LiteralPath (Join-Path $rendererDir "module.json") -Destination $modBak -Force }
}

# ------------------------------------------------------------------------------
# Patch one renderer folder. Returns $true when something was written.
# ------------------------------------------------------------------------------
function Update-RendererFolder([string]$rendererDir, [string]$micupDataDir) {
    $hash = Split-Path -Leaf $rendererDir
    $indexPath = Join-Path $rendererDir "index.html"
    $modulePath = Join-Path $rendererDir "module.json"
    $assetsDir = Join-Path $rendererDir "assets"
    $srcJs = Join-Path $scriptDir "miccord.js"
    $srcCss = Join-Path $scriptDir "miccord.css"
    if (-not (Test-Path -LiteralPath $srcJs) -or -not (Test-Path -LiteralPath $srcCss)) {
        Write-GuardLog "miccord.js/miccord.css not found next to guard.ps1; skipping."
        return $false
    }
    if (-not (Test-Path -LiteralPath $assetsDir)) { return $false }

    $html = Read-TextNoBom $indexPath
    $moduleText = Read-TextNoBom $modulePath
    $newHtml = Build-PatchedHtml $html
    $newHtmlBytes = $global:utf8NoBom.GetBytes($newHtml)
    $jsBytes = [System.IO.File]::ReadAllBytes($srcJs)
    $cssBytes = [System.IO.File]::ReadAllBytes($srcCss)

    $want = @{
        "index.html"         = @{ sha = (Get-BytesSha256 $newHtmlBytes); bytes = $newHtmlBytes.Length }
        "assets/miccord.js"  = @{ sha = (Get-BytesSha256 $jsBytes); bytes = $jsBytes.Length }
        "assets/miccord.css" = @{ sha = (Get-BytesSha256 $cssBytes); bytes = $cssBytes.Length }
    }
    $have = @{
        "index.html"         = (Get-BytesSha256 ([System.IO.File]::ReadAllBytes($indexPath)))
        "assets/miccord.js"  = (Get-FileSha256 (Join-Path $assetsDir "miccord.js"))
        "assets/miccord.css" = (Get-FileSha256 (Join-Path $assetsDir "miccord.css"))
    }

    $upToDate = $true
    foreach ($p in $ModPaths) {
        if ($have[$p] -ne $want[$p].sha) { $upToDate = $false }
        if ((Get-DeclaredSha $moduleText $p) -ne $want[$p].sha) { $upToDate = $false }
    }
    if ($upToDate) { return $false }

    Write-GuardLog "Renderer $hash needs (re)patching."
    Save-OriginalBackup $rendererDir $micupDataDir $html

    # Build the new module.json: Micup only serves files listed there, and checks
    # every file against its sha256/bytes.
    $modObj = $moduleText | ConvertFrom-Json
    if (-not $modObj.files -or -not $modObj.module -or -not $modObj.build_version) {
        Write-GuardLog "module.json of $hash looks wrong; not touching it."
        return $false
    }
    $files = New-Object System.Collections.ArrayList
    foreach ($f in $modObj.files) {
        if ($ModPaths -notcontains $f.path) { [void]$files.Add($f) }
    }
    foreach ($p in $ModPaths) {
        [void]$files.Add([PSCustomObject]@{ path = $p; sha256 = $want[$p].sha; bytes = $want[$p].bytes })
    }
    $modObj.files = $files
    $newModuleBytes = $global:utf8NoBom.GetBytes(($modObj | ConvertTo-Json -Depth 20))

    # Sanity check before writing anything.
    $check = ($global:utf8NoBom.GetString($newModuleBytes) | ConvertFrom-Json)
    if (@($check.files).Count -ne @($files).Count) {
        Write-GuardLog "Generated module.json for $hash failed the sanity check; aborting."
        return $false
    }

    # Stage everything first, then swap it in back-to-back.
    $staged = @(
        @{ tmp = (Join-Path $assetsDir "miccord.css.bmu-tmp"); dest = (Join-Path $assetsDir "miccord.css"); bytes = $cssBytes },
        @{ tmp = (Join-Path $assetsDir "miccord.js.bmu-tmp"); dest = (Join-Path $assetsDir "miccord.js"); bytes = $jsBytes },
        @{ tmp = "$indexPath.bmu-tmp"; dest = $indexPath; bytes = $newHtmlBytes },
        @{ tmp = "$modulePath.bmu-tmp"; dest = $modulePath; bytes = $newModuleBytes }
    )
    try {
        foreach ($s in $staged) { [System.IO.File]::WriteAllBytes($s.tmp, $s.bytes) }
        foreach ($s in $staged) { Move-Into $s.tmp $s.dest }
    } catch {
        Write-GuardLog "Failed to patch $hash : $($_.Exception.Message)"
        foreach ($s in $staged) { Remove-Item -LiteralPath $s.tmp -Force -ErrorAction SilentlyContinue }
        return $false
    }
    Write-GuardLog "Better MicUP applied to renderer $hash (build $($modObj.build_version))."
    return $true
}

# ------------------------------------------------------------------------------
# Remove the mod from one renderer folder (uses the pristine backups).
# ------------------------------------------------------------------------------
function Restore-RendererFolder([string]$rendererDir, [string]$micupDataDir) {
    $hash = Split-Path -Leaf $rendererDir
    $indexPath = Join-Path $rendererDir "index.html"
    if (-not (Test-Path -LiteralPath $indexPath)) { return }
    if ((Read-TextNoBom $indexPath) -notmatch 'miccord\.js') { return }

    $backupDir = Join-Path $micupDataDir "modules\miccord_backups\$hash"
    $idxBak = Join-Path $backupDir "index.html.orig"
    $modBak = Join-Path $backupDir "module.json.orig"
    if (-not (Test-Path -LiteralPath $idxBak) -or -not (Test-Path -LiteralPath $modBak)) {
        Write-GuardLog "No backup for $hash; delete that folder and Micup will download it again."
        return
    }
    # The backup is only usable if the original module.json vouches for the original index.html.
    $declared = Get-DeclaredSha (Read-TextNoBom $modBak) "index.html"
    if ($declared -and ($declared -ne (Get-FileSha256 $idxBak))) {
        Write-GuardLog "Backup for $hash does not match its module.json; skipping."
        return
    }
    Copy-Item -LiteralPath $idxBak -Destination "$indexPath.bmu-tmp" -Force
    Copy-Item -LiteralPath $modBak -Destination (Join-Path $rendererDir "module.json.bmu-tmp") -Force
    Move-Into "$indexPath.bmu-tmp" $indexPath
    Move-Into (Join-Path $rendererDir "module.json.bmu-tmp") (Join-Path $rendererDir "module.json")
    foreach ($n in @("miccord.js", "miccord.css")) {
        Remove-Item -LiteralPath (Join-Path $rendererDir "assets\$n") -Force -ErrorAction SilentlyContinue
    }
    Write-GuardLog "Restored original renderer $hash."
}

function Invoke-PatchAll {
    $changed = $false
    foreach ($d in (Find-MicupDataDirs)) {
        foreach ($r in (Get-RendererDirs $d)) {
            try {
                if (-not (Test-FolderSettled $r.FullName)) { continue }
                if (Update-RendererFolder $r.FullName $d) { $changed = $true }
            } catch {
                Write-GuardLog "Error while checking $($r.Name): $($_.Exception.Message)"
            }
        }
    }
    return $changed
}

# ------------------------------------------------------------------------------
# Auto-update
# ------------------------------------------------------------------------------
function Get-InstalledVersion {
    $js = Join-Path $scriptDir "miccord.js"
    if (Test-Path -LiteralPath $js) {
        $m = [regex]::Match((Read-TextNoBom $js), 'const VERSION = "(\d+(?:\.\d+){1,3})"')
        if ($m.Success) { return [version]$m.Groups[1].Value }
    }
    return [version]"0.0.0"
}

function Get-UpdateConfig {
    $cfg = @{ enabled = $true; manifestUrl = $UpdateManifestUrl }
    $p = Join-Path $scriptDir "update-config.json"
    if (Test-Path -LiteralPath $p) {
        try {
            $o = Read-TextNoBom $p | ConvertFrom-Json
            if ($o.autoUpdate -eq $false) { $cfg.enabled = $false }
            if ($o.manifestUrl) { $cfg.manifestUrl = [string]$o.manifestUrl }
        } catch {
            Write-GuardLog "update-config.json is not valid JSON; using defaults."
        }
    }
    return $cfg
}

function Get-UrlBytes([string]$url) {
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing -TimeoutSec 60 -Headers @{ "User-Agent" = "BetterMicUP-Guard" }
        # the leading comma keeps PowerShell from unrolling the byte[] into the pipeline
        return , [System.IO.File]::ReadAllBytes($tmp)
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Test-ManifestSignature([byte[]]$data, [byte[]]$signature) {
    $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
    try {
        $rsa.PersistKeyInCsp = $false
        $rsa.FromXmlString($UpdatePublicKeyXml)
        return $rsa.VerifyData($data, "SHA256", $signature)
    } finally {
        $rsa.Dispose()
    }
}

# Returns: disabled | no-key | current | updated | restart (guard.ps1 itself changed)
function Invoke-SelfUpdate {
    $cfg = Get-UpdateConfig
    if (-not $cfg.enabled) { return "disabled" }
    if ($UpdatePublicKeyXml -notmatch '<Modulus>') { return "no-key" }

    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $global:ProgressPreference = 'SilentlyContinue'  # Invoke-WebRequest is very slow with a progress bar

    $manifestBytes = Get-UrlBytes $cfg.manifestUrl
    $sigUrl = $cfg.manifestUrl -replace 'manifest\.json$', 'manifest.sig'
    $sigText = [System.Text.Encoding]::ASCII.GetString((Get-UrlBytes $sigUrl)).Trim()
    if (-not (Test-ManifestSignature $manifestBytes ([Convert]::FromBase64String($sigText)))) {
        throw "manifest signature is INVALID (not signed by the release key); ignoring it"
    }
    $manifest = $global:utf8NoBom.GetString($manifestBytes).TrimStart([char]0xFEFF) | ConvertFrom-Json
    if ($manifest.name -ne "better-micup") { throw "manifest is for '$($manifest.name)', not better-micup" }

    $remote = [version][string]$manifest.version
    $local = Get-InstalledVersion
    if ($remote -le $local) { return "current" }
    Write-GuardLog "Update available: $local -> $remote"

    $names = @($manifest.files | ForEach-Object { [string]$_.path })
    foreach ($required in @("miccord.js", "guard.ps1")) {
        if ($names -notcontains $required) { throw "manifest has no $required" }
    }

    # Download everything to staging and verify before touching the installed files.
    $staging = Join-Path $scriptDir "update-staging"
    if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    try {
        foreach ($f in $manifest.files) {
            $name = [string]$f.path
            if ($UpdateFiles -notcontains $name) { throw "manifest lists a file that is not allowed: $name" }
            $bytes = Get-UrlBytes ([string]$f.url)
            if ($bytes.Length -ne [int64]$f.size -or (Get-BytesSha256 $bytes) -ne ([string]$f.sha256).ToLowerInvariant()) {
                throw "downloaded $name does not match the signed manifest"
            }
            [System.IO.File]::WriteAllBytes((Join-Path $staging $name), $bytes)
        }

        # Keep the current version around (last 3) in case the new one misbehaves.
        $backupRoot = Join-Path $scriptDir "backup-auto"
        $backup = Join-Path $backupRoot $local.ToString()
        New-Item -ItemType Directory -Path $backup -Force | Out-Null
        foreach ($name in $names) {
            $cur = Join-Path $scriptDir $name
            if (Test-Path -LiteralPath $cur) { Copy-Item -LiteralPath $cur -Destination $backup -Force }
        }
        Get-ChildItem -LiteralPath $backupRoot -Directory | Sort-Object LastWriteTime -Descending |
            Select-Object -Skip 3 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

        $guardChanged = (Get-FileSha256 (Join-Path $scriptDir "guard.ps1")) -ne (Get-FileSha256 (Join-Path $staging "guard.ps1"))
        foreach ($name in $names) {
            $dest = Join-Path $scriptDir $name
            Copy-Item -LiteralPath (Join-Path $staging $name) -Destination "$dest.bmu-tmp" -Force
            Move-Into "$dest.bmu-tmp" $dest
        }
    } finally {
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-GuardLog "Better MicUP updated to $remote."
    if ($guardChanged) { return "restart" }
    return "updated"
}

# ------------------------------------------------------------------------------
# Entry point
# ------------------------------------------------------------------------------
$mutexName = if ($DataDir) { "Local\BetterMicUPGuard-" + (Get-BytesSha256 ($global:utf8NoBom.GetBytes($DataDir.ToLowerInvariant()))).Substring(0, 16) } else { "Local\BetterMicUPGuard" }
$mutex = New-Object System.Threading.Mutex($false, $mutexName)
$owned = $false
try {
    $owned = $mutex.WaitOne([TimeSpan]::FromSeconds($(if ($CheckOnly -or $Restore -or $UpdateNow) { 15 } else { 0 })))
} catch [System.Threading.AbandonedMutexException] {
    $owned = $true
}
if (-not $owned) {
    if ($CheckOnly -or $Restore -or $UpdateNow) {
        Write-Output "Outro guard esta rodando. Pare-o antes (veja o README)."
        exit 1
    }
    exit 0
}

try {
    if ($Restore) {
        foreach ($d in (Find-MicupDataDirs)) {
            foreach ($r in (Get-RendererDirs $d)) {
                try { Restore-RendererFolder $r.FullName $d } catch { Write-GuardLog "Restore failed for $($r.Name): $($_.Exception.Message)" }
            }
        }
        exit 0
    }

    if ($UpdateNow) {
        $result = "error"
        try {
            $result = Invoke-SelfUpdate
        } catch {
            Write-GuardLog "Update failed: $($_.Exception.Message)"
            Write-Output "Falha na atualizacao: $($_.Exception.Message)"
            exit 1
        }
        if ($result -eq "updated" -or $result -eq "restart") { Invoke-PatchAll | Out-Null }
        Write-Output "Resultado: $result (versao instalada: $(Get-InstalledVersion))"
        exit 0
    }

    Write-GuardLog "Guard v3 started (version $(Get-InstalledVersion), CheckOnly=$CheckOnly)."
    Invoke-PatchAll | Out-Null
    if ($CheckOnly) { exit 0 }

    $i = 0
    foreach ($d in (Find-MicupDataDirs)) {
        $modulesDir = Join-Path $d "modules"
        if (-not (Test-Path -LiteralPath $modulesDir)) { continue }
        $w = New-Object System.IO.FileSystemWatcher
        $w.Path = $modulesDir
        $w.IncludeSubdirectories = $true
        $w.NotifyFilter = [System.IO.NotifyFilters]::FileName -bor [System.IO.NotifyFilters]::DirectoryName -bor [System.IO.NotifyFilters]::LastWrite
        foreach ($evt in @("Created", "Changed", "Renamed")) {
            Register-ObjectEvent -InputObject $w -EventName $evt -SourceIdentifier "BMU_$($i)_$evt" | Out-Null
        }
        $w.EnableRaisingEvents = $true
        $i++
        Write-GuardLog "Watching $modulesDir"
    }

    # Debounce: Micup writes thousands of files while installing an update. Wait until
    # things are quiet for a few seconds, then check once. Also re-check every minute.
    $pending = $false
    $lastEvent = Get-Date
    $lastCheck = Get-Date
    $nextUpdateCheck = (Get-Date).AddMinutes($UpdateFirstCheckMinutes)
    while ($true) {
        $ev = Wait-Event -Timeout 2
        if ($ev) {
            Get-Event | Remove-Event
            $pending = $true
            $lastEvent = Get-Date
        }
        $now = Get-Date
        if ($pending -and ($now - $lastEvent).TotalSeconds -ge 5) {
            $pending = $false
            Invoke-PatchAll | Out-Null
            $lastCheck = $now
        } elseif (($now - $lastCheck).TotalSeconds -ge 60) {
            Invoke-PatchAll | Out-Null
            $lastCheck = $now
        }

        if ($now -ge $nextUpdateCheck) {
            $nextUpdateCheck = $now.AddHours($UpdateIntervalHours)
            $result = "error"
            try {
                $result = Invoke-SelfUpdate
            } catch {
                Write-GuardLog "Update check failed: $($_.Exception.Message)"
                $nextUpdateCheck = $now.AddMinutes(30)
            }
            if ($result -eq "updated" -or $result -eq "restart") {
                Invoke-PatchAll | Out-Null
                $lastCheck = Get-Date
            }
            if ($result -eq "restart") {
                # guard.ps1 itself changed: hand over to a fresh process running the new code.
                Write-GuardLog "Restarting the guard to run the new version."
                try { $mutex.ReleaseMutex() } catch {}
                $owned = $false
                Start-Process -FilePath "wscript.exe" -ArgumentList "`"$(Join-Path $scriptDir 'guard.vbs')`""
                exit 0
            }
        }
    }
} finally {
    if ($owned) { try { $mutex.ReleaseMutex() } catch {} }
}
