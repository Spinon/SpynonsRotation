param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Assert-UiAsset {
    param(
        [bool]$Condition,
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Test-PowerOfTwo {
    param([int]$Value)
    return $Value -gt 0 -and (($Value -band ($Value - 1)) -eq 0)
}

function Test-Hash {
    param(
        [string]$Path,
        [string]$Expected
    )

    Assert-UiAsset (Test-Path -LiteralPath $Path -PathType Leaf) "Arquivo ausente: $Path"
    $actual = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    Assert-UiAsset ($actual -eq $Expected) "Hash divergente: $Path"
}

function Test-Png {
    param(
        [string]$Path,
        [int]$ExpectedWidth,
        [int]$ExpectedHeight,
        [string]$ExpectedHash
    )

    Test-Hash $Path $ExpectedHash
    $image = [System.Drawing.Image]::FromFile($Path)
    try {
        Assert-UiAsset ($image.Width -eq $ExpectedWidth) "Largura PNG divergente: $Path"
        Assert-UiAsset ($image.Height -eq $ExpectedHeight) "Altura PNG divergente: $Path"
    }
    finally {
        $image.Dispose()
    }
}

function Test-Tga {
    param(
        [string]$Path,
        [int]$ExpectedWidth,
        [int]$ExpectedHeight,
        [string]$ExpectedHash,
        [bool]$RequireVisiblePixels = $false
    )

    Test-Hash $Path $ExpectedHash
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $header = New-Object byte[] 18
        $read = $stream.Read($header, 0, 18)
        Assert-UiAsset ($read -eq 18) "Header TGA incompleto: $Path"
        Assert-UiAsset ($header[2] -eq 2) "TGA não é true-color sem compressão: $Path"
        Assert-UiAsset ([BitConverter]::ToUInt16($header, 12) -eq $ExpectedWidth) "Largura TGA divergente: $Path"
        Assert-UiAsset ([BitConverter]::ToUInt16($header, 14) -eq $ExpectedHeight) "Altura TGA divergente: $Path"
        Assert-UiAsset ($header[16] -eq 32) "TGA não possui 32 bits por pixel: $Path"
        Assert-UiAsset ($header[17] -eq 0x28) "TGA não declara alpha de 8 bits e origem superior esquerda: $Path"
        $expectedLength = 18L + [int64]$ExpectedWidth * [int64]$ExpectedHeight * 4L
        Assert-UiAsset ($stream.Length -eq $expectedLength) "Tamanho TGA divergente: $Path"

        if ($RequireVisiblePixels) {
            $pixelBytes = New-Object byte[] ($stream.Length - 18)
            $pixelRead = $stream.Read($pixelBytes, 0, $pixelBytes.Length)
            Assert-UiAsset ($pixelRead -eq $pixelBytes.Length) "Pixels TGA incompletos: $Path"
            $hasVisiblePixel = $false
            for ($index = 3; $index -lt $pixelBytes.Length; $index += 4) {
                if ($pixelBytes[$index] -gt 0) {
                    $hasVisiblePixel = $true
                    break
                }
            }
            Assert-UiAsset $hasVisiblePixel "Máscara TGA vazia: $Path"
        }
    }
    finally {
        $stream.Dispose()
    }
}

$manifestPath = Join-Path $RepositoryRoot 'assets\ui\runtime\manifest.json'
$runtimeDirectory = Split-Path $manifestPath
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

Assert-UiAsset ($manifest.schemaVersion -eq 1) 'schemaVersion do pacote não suportado.'
Assert-UiAsset ($manifest.format.runtime -eq 'TGA') 'Formato de runtime inesperado.'
Assert-UiAsset ($manifest.format.bitsPerPixel -eq 32) 'Profundidade do pacote inesperada.'
Assert-UiAsset ($manifest.integration.runtimeImplemented -eq $false) 'O handoff não pode declarar runtime implementado.'

$runtimeBytes = 0L
$runtimeFiles = 0
$reviewFiles = 0

$reviewSourcePath = [System.IO.Path]::GetFullPath((Join-Path $runtimeDirectory $manifest.reviewBoard.source))
$reviewPreviewPath = [System.IO.Path]::GetFullPath((Join-Path $runtimeDirectory $manifest.reviewBoard.preview))
Test-Hash $reviewSourcePath $manifest.reviewBoard.sourceSha256
[xml](Get-Content -Raw -LiteralPath $reviewSourcePath) | Out-Null
Test-Png $reviewPreviewPath $manifest.reviewBoard.width $manifest.reviewBoard.height $manifest.reviewBoard.previewSha256

foreach ($componentProperty in $manifest.components.PSObject.Properties) {
    $component = $componentProperty.Value
    if ($component.PSObject.Properties.Name -notcontains 'canvas') {
        continue
    }

    $width = [int]$component.canvas.width
    $height = [int]$component.canvas.height
    Assert-UiAsset (Test-PowerOfTwo $width) "Canvas não é potência de dois: $($componentProperty.Name)"
    Assert-UiAsset (Test-PowerOfTwo $height) "Canvas não é potência de dois: $($componentProperty.Name)"

    $rect = $component.canvas.contentPixelRect
    $uv = $component.canvas.contentUvRect
    $epsilon = 0.000001
    Assert-UiAsset ([Math]::Abs($uv.left - ($rect.x / $width)) -lt $epsilon) "UV left divergente: $($componentProperty.Name)"
    Assert-UiAsset ([Math]::Abs($uv.right - (($rect.x + $rect.width) / $width)) -lt $epsilon) "UV right divergente: $($componentProperty.Name)"
    Assert-UiAsset ([Math]::Abs($uv.top - ($rect.y / $height)) -lt $epsilon) "UV top divergente: $($componentProperty.Name)"
    Assert-UiAsset ([Math]::Abs($uv.bottom - (($rect.y + $rect.height) / $height)) -lt $epsilon) "UV bottom divergente: $($componentProperty.Name)"

    $sourcePath = [System.IO.Path]::GetFullPath((Join-Path $runtimeDirectory $component.source.file))
    Test-Png $sourcePath $component.source.width $component.source.height $component.source.sha256

    foreach ($layerProperty in $component.layers.PSObject.Properties) {
        $layer = $layerProperty.Value
        if ($layer.PSObject.Properties.Name -notcontains 'runtime') {
            continue
        }

        $reviewPath = [System.IO.Path]::GetFullPath((Join-Path $runtimeDirectory $layer.review))
        $runtimePath = Join-Path $runtimeDirectory $layer.runtime
        Test-Png $reviewPath $width $height $layer.reviewSha256
        Test-Tga $runtimePath $width $height $layer.runtimeSha256 ($layerProperty.Name -like '*Mask')
        $runtimeBytes += (Get-Item -LiteralPath $runtimePath).Length
        $runtimeFiles++
        $reviewFiles++
    }
}

Assert-UiAsset ($runtimeBytes -eq $manifest.format.totalRuntimeBytes) 'Tamanho total do pacote diverge do manifest.'
Assert-UiAsset ($manifest.components.globalCooldown.asset -eq $null) 'GCD deve permanecer procedural.'

Write-Output "Kit técnico válido: $runtimeFiles TGA(s), $reviewFiles PNG(s), $runtimeBytes bytes de runtime."
