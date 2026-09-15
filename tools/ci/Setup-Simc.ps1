Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or -not $env:GH_TOKEN) { throw 'This download uses only the ephemeral GitHub Actions token.' }
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$pins = (Get-Content -LiteralPath (Join-Path $repositoryRoot 'tools/toolchain/pins.json') -Raw | ConvertFrom-Json).simulationCraft
$ci = Get-Content -LiteralPath (Join-Path $repositoryRoot 'tools/ci/pins.json') -Raw | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = 'application/vnd.github+json' }
$endpoint = "https://api.github.com/repos/$($pins.sourceRepository)/actions/artifacts/$($pins.artifactId)"
$artifact = Invoke-RestMethod -Uri $endpoint -Headers $headers
if ($artifact.expired -or $artifact.id -ne $pins.artifactId -or $artifact.name -ne $pins.artifactName -or
    $artifact.workflow_run.id -ne $pins.workflowRunId -or $artifact.workflow_run.head_sha -ne $pins.workflowCommit) {
    throw 'SimC artifact identity mismatch or expired; no silent upgrade.'
}
$downloads = Join-Path $repositoryRoot '.tools/ci-downloads'
$null = New-Item -ItemType Directory -Path $downloads -Force
$outerZip = Join-Path $downloads 'simc-artifact.zip'
if (Test-Path -LiteralPath $outerZip) { throw 'Fresh CI SimC output required.' }
Invoke-WebRequest -Uri "$endpoint/zip" -Headers $headers -OutFile $outerZip
if ((Get-FileHash -LiteralPath $outerZip -Algorithm SHA256).Hash -ne $ci.simcArtifactZipSha256) { throw 'SimC artifact ZIP hash mismatch.' }
$targetArchive = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $pins.archive))
$targetExe = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $pins.executable))
$simcRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot '.tools/simc'))
foreach ($target in @($targetArchive, $targetExe)) {
    if (-not $target.StartsWith($simcRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'SimC target outside owned directory.' }
}
if (Test-Path -LiteralPath $simcRoot) { throw 'Fresh CI SimC directory required.' }
$null = New-Item -ItemType Directory -Path $simcRoot
$archive = [IO.Compression.ZipFile]::OpenRead($outerZip)
try {
    $entries = @($archive.Entries | Where-Object { $_.FullName -eq [IO.Path]::GetFileName($targetArchive) })
    if ($entries.Count -ne 1) { throw 'Expected exactly the pinned 7z in the artifact.' }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entries[0], $targetArchive, $false)
} finally { $archive.Dispose() }
if ((Get-FileHash -LiteralPath $targetArchive -Algorithm SHA256).Hash -ne $pins.archiveSha256) { throw 'SimC 7z hash mismatch.' }
$sevenZip = Join-Path $env:ProgramFiles '7-Zip/7z.exe'
if (-not (Test-Path -LiteralPath $sevenZip)) { throw '7-Zip missing on hosted runner.' }
& $sevenZip x $targetArchive "-o$simcRoot" -y -bso0
if ($LASTEXITCODE -ne 0) { throw 'SimC extraction failed.' }
if ((Get-FileHash -LiteralPath $targetExe -Algorithm SHA256).Hash -ne $pins.executableSha256) { throw 'SimC executable hash mismatch.' }
Write-Output "SimulationCraft $($pins.version) prepared from pinned artifact; no matrix generation or release publication."
