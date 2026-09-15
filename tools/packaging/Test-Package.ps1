param([Parameter(Mandatory = $true)][string]$Directory)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$packageRoot = (Resolve-Path -LiteralPath $Directory).Path
$manifest = Get-Content -LiteralPath (Join-Path $packageRoot 'manifest.json') -Raw | ConvertFrom-Json
$zipPath = Join-Path $packageRoot 'SpynonRotation.zip'
if ((Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash -ne $manifest.zipSha256) { throw 'ZIP hash mismatch.' }
# Independent standard-library reader; reads streams only and never extracts files.
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    if ($archive.Entries.Count -ne $manifest.files.Count) { throw 'Entry count mismatch.' }
    foreach ($expected in $manifest.files) {
        $entry = $archive.GetEntry($expected.path)
        if ($null -eq $entry -or $entry.Length -ne $expected.bytes) { throw 'Missing or invalid entry.' }
        if ($entry.LastWriteTime.Year -ne 1980 -or $entry.LastWriteTime.Month -ne 1 -or $entry.LastWriteTime.Day -ne 1) {
            throw 'Noncanonical timestamp.'
        }
        $stream = $entry.Open()
        try { $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($stream)) }
        finally { $stream.Dispose() }
        if ($hash -ne $expected.sha256) { throw "Entry hash mismatch: $($entry.FullName)" }
    }
    Write-Output "Independent ZIP reader: $($archive.Entries.Count) entries verified; nothing extracted or installed."
} finally { $archive.Dispose() }
