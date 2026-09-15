Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$pins = Get-Content -LiteralPath (Join-Path $repositoryRoot 'tools/ci/pins.json') -Raw | ConvertFrom-Json
$toolchain = Get-Content -LiteralPath (Join-Path $repositoryRoot 'tools/toolchain/pins.json') -Raw | ConvertFrom-Json
function Get-VerifiedTool([string]$Url, [string]$Relative, [string]$Expected) {
    $target = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $Relative))
    $allowed = [IO.Path]::GetFullPath((Join-Path $repositoryRoot '.tools')) + [IO.Path]::DirectorySeparatorChar
    if (-not $target.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Tool destination outside .tools.' }
    if (-not (Test-Path -LiteralPath $target)) {
        $null = New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force
        Invoke-WebRequest -Uri $Url -OutFile $target
    }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $Expected) { throw "Tool hash mismatch: $Relative. File preserved; not executed." }
    return $target
}
$luaArchive = Get-VerifiedTool $pins.luaJitZip.url '.tools/ci-downloads/LuaJIT-2.1.19907-win64.zip' $pins.luaJitZip.sha256
$luaRoot = Join-Path $repositoryRoot '.tools/ci-luajit'
if (-not (Test-Path -LiteralPath $luaRoot)) {
    # A pinned portable archive; no installer, registry mutation or administrator setup.
    [IO.Compression.ZipFile]::ExtractToDirectory($luaArchive, $luaRoot)
}
# Verify every extracted file before running it, including DLLs and Lua libraries.
$archive = [IO.Compression.ZipFile]::OpenRead($luaArchive)
try {
    foreach ($entry in $archive.Entries) {
        if ($entry.FullName.EndsWith('/')) { continue }
        $entryPath = [IO.Path]::GetFullPath((Join-Path $luaRoot $entry.FullName))
        if (-not $entryPath.StartsWith($luaRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path.' }
        $stream = $entry.Open()
        try { $expected = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) }
        finally { $stream.Dispose() }
        if ((Get-FileHash -LiteralPath $entryPath -Algorithm SHA256).Hash -ne $expected) { throw 'Extracted LuaJIT mismatch.' }
    }
} finally { $archive.Dispose() }
$null = Get-VerifiedTool 'https://github.com/lunarmodules/luacheck/releases/download/v1.2.0/luacheck.exe' '.tools/luacheck/luacheck.exe' $toolchain.luacheck.sha256
$null = Get-VerifiedTool 'https://github.com/TradeSkillMaster/wowlua-ls/releases/download/v0.30.4/wowlua_ls-x86_64-pc-windows-msvc.exe' '.tools/wowlua-ls/wowlua_ls.exe' $toolchain.wowluaLs.sha256
& (Join-Path $luaRoot 'bin/luajit.exe') -v
if ($LASTEXITCODE -ne 0) { throw 'LuaJIT startup failed.' }
Write-Output 'Portable CI tools verified; no global installation.'
