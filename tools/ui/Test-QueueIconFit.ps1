param([string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$queueSource = Get-Content -LiteralPath (Join-Path $RepositoryRoot 'addon/UI/Queue.lua') -Raw
$cases = @(
    @{ name = 'current'; file = 'action-current-neutral-v1.png'; originX = 56; originY = 8; scale = 2;
       probes = @(@(98,120), @(240,32), @(409,120), @(240,215)) },
    @{ name = 'queued'; file = 'action-queue-neutral-v1.png'; originX = 8; originY = 8; scale = 3;
       probes = @(@(46,120), @(120,35), @(211,120), @(120,205)) }
)
foreach ($case in $cases) {
    $pattern = '(?s)' + $case.name + ' = \{.*?iconX = (\d+), iconY = (\d+), iconWidth = (\d+), iconHeight = (\d+)'
    $match = [regex]::Match($queueSource, $pattern)
    if (-not $match.Success) { throw "Geometria não encontrada: $($case.name)" }
    $left = $case.originX + [int]$match.Groups[1].Value * $case.scale
    $top = $case.originY + [int]$match.Groups[2].Value * $case.scale
    $right = $left + [int]$match.Groups[3].Value * $case.scale
    $bottom = $top + [int]$match.Groups[4].Value * $case.scale
    $bitmap = [System.Drawing.Bitmap]::new((Join-Path $RepositoryRoot "assets/ui/runtime-source/$($case.file)"))
    try {
        foreach ($probe in $case.probes) {
            $x, $y = $probe
            if ($bitmap.GetPixel($x,$y).A -gt 16) { throw "Probe não pertence à abertura transparente: $x,$y" }
            if ($x -lt $left -or $x -ge $right -or $y -lt $top -or $y -ge $bottom) {
                throw "Ícone não cobre a abertura em $($case.name): $x,$y"
            }
        }
        # Convex outer envelope per scanline: icon stays behind the frame, never outside its sides.
        for ($y = $top; $y -lt $bottom; $y++) {
            $first, $last = -1, -1
            for ($x = 0; $x -lt $bitmap.Width; $x++) {
                if ($bitmap.GetPixel($x,$y).A -gt 16) {
                    if ($first -eq -1) { $first = $x }
                    $last = $x
                }
            }
            if ($first -eq -1 -or $left -lt $first -or ($right - 1) -gt $last) {
                throw "Ícone ultrapassa envelope da moldura $($case.name), linha $y ($first..$last)."
            }
        }
        Write-Output "$($case.name): rect ($left,$top,$($right-$left),$($bottom-$top)); 4 probes transparentes cobertos; envelope lateral preservado."
    } finally { $bitmap.Dispose() }
}
Write-Output 'Verificação geométrica offline; não é rendering nem aprovação Retail.'
