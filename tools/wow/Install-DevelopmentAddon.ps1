param(
    [Parameter(Mandatory = $true)][string]$RetailRoot
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$clientRoot = (Resolve-Path -LiteralPath $RetailRoot).Path
$clientExe = Join-Path $clientRoot 'Wow.exe'
if (-not (Test-Path -LiteralPath $clientExe -PathType Leaf)) { throw 'RetailRoot precisa conter Wow.exe.' }
$clientVersion = (Get-Item -LiteralPath $clientExe).VersionInfo.FileVersion
Push-Location -LiteralPath $repositoryRoot
try {
    & node tools/wow-api/cli.mjs check
    if ($LASTEXITCODE -ne 0) { throw 'Pins, relatório ou política de compatibilidade inválidos.' }
} finally { Pop-Location }
$clientPolicy = Get-Content -LiteralPath (Join-Path $repositoryRoot 'tools\wow-api\sources.json') -Raw | ConvertFrom-Json
$permittedVersions = @($clientPolicy.developmentSmokeBuilds | ForEach-Object { $clientPolicy.builds.$_.version })
if ($clientVersion -notin $permittedVersions) { throw "Build divergente: $clientVersion. Rever Compat antes de instalar." }
$sourceRoot = Join-Path $repositoryRoot 'addon'
$addonsRoot = Join-Path $clientRoot 'Interface\AddOns'
$destination = [IO.Path]::GetFullPath((Join-Path $addonsRoot 'SpynonRotation'))
if ((Split-Path -Parent $destination) -ne $addonsRoot -or (Split-Path -Leaf $destination) -ne 'SpynonRotation') {
    throw 'Destino fora da pasta exata do addon.'
}
$receiptPath = Join-Path $destination '.spynon-dev-install.json'
$sourceFiles = @(Get-ChildItem -LiteralPath $sourceRoot -File -Recurse |
    Where-Object { $_.Extension -in @('.lua', '.toc', '.tga') })
$sourceIndex = @{}
foreach ($file in $sourceFiles) {
    $relative = [IO.Path]::GetRelativePath($sourceRoot, $file.FullName)
    $sourceIndex[$relative] = $file
}
if (Test-Path -LiteralPath $destination) {
    if (-not (Test-Path -LiteralPath $receiptPath -PathType Leaf)) {
        throw 'Já existe um addon sem recibo gerenciado. Nenhum arquivo foi sobrescrito.'
    }
    $previous = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if ($previous.project -ne 'SpynonsRotation' -or $previous.schemaVersion -ne 1) { throw 'Recibo inválido.' }
    $previousIndex = @{}
    foreach ($entry in $previous.files) { $previousIndex[$entry.path] = $entry.sha256 }
    $existing = @(Get-ChildItem -LiteralPath $destination -File -Recurse |
        Where-Object { $_.FullName -ne $receiptPath })
    if ($existing.Count -ne $previousIndex.Count) { throw 'Instalação alterada: quantidade de arquivos divergente.' }
    foreach ($file in $existing) {
        $relative = [IO.Path]::GetRelativePath($destination, $file.FullName)
        if (-not $previousIndex.ContainsKey($relative) -or -not $sourceIndex.ContainsKey($relative) -or
            (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash -ne $previousIndex[$relative]) {
            throw "Instalação alterada ou arquivo removido da fonte: $relative. Nada foi sobrescrito."
        }
    }
}
$receiptFiles = @()
foreach ($relative in @($sourceIndex.Keys | Sort-Object)) {
    $sourceFile = $sourceIndex[$relative]
    $targetFile = Join-Path $destination $relative
    $null = New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force
    Copy-Item -LiteralPath $sourceFile.FullName -Destination $targetFile -Force
    $expected = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash
    if ((Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash -ne $expected) { throw "Falha de cópia: $relative" }
    $receiptFiles += @{ path = $relative; sha256 = $expected }
}
$sourceCommit = git -C $repositoryRoot rev-parse HEAD
@{
    schemaVersion = 1; project = 'SpynonsRotation'; kind = 'development-only'; sourceCommit = $sourceCommit
    installedAt = [DateTime]::UtcNow.ToString('o'); clientVersion = $clientVersion; files = $receiptFiles
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $receiptPath -Encoding utf8
Write-Output "Instalação de desenvolvimento verificada: $destination; $($receiptFiles.Count) arquivos; build $clientVersion."
Write-Output 'Nenhum release foi publicado. SavedVariables e outros addons não foram alterados.'
