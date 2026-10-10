param(
    [string]$OutputDirectory = "outputs/plesk-shop-api"
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source = (Resolve-Path (Join-Path $workspace 'shop-api')).Path
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $workspace $OutputDirectory))
if (-not $outputRoot.StartsWith($workspace + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Directorul de ieșire trebuie să rămână în workspace.'
}
$package = Join-Path $outputRoot 'shop-api'
$archive = Join-Path $outputRoot 'cubis-shop-api-plesk.zip'

if (Test-Path -LiteralPath $outputRoot) {
    $resolvedOutput = (Resolve-Path -LiteralPath $outputRoot).Path
    if (-not $resolvedOutput.StartsWith($workspace + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'Ștergerea pachetului anterior a fost blocată: calea nu este sigură.'
    }
    Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
}
New-Item -ItemType Directory -Path $package -Force | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $package -Recurse -Force

foreach ($relative in @('tests', 'examples', 'config.local.php', 'gomag.local.php', 'gomag.local.example.php', 'register-stripe-webhook.php')) {
    $target = Join-Path $package $relative
    if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

$forbidden = Get-ChildItem -LiteralPath $package -Recurse -File | Where-Object {
    $_.Name -match '\.local\.php$|\.secret\.|^\.env$' -or $_.FullName -match '[\\/]tests[\\/]'
}
if ($forbidden) { throw ('Pachetul conține fișiere interzise: ' + (($forbidden.FullName) -join ', ')) }

$secretHits = Get-ChildItem -LiteralPath $package -Recurse -File -Include '*.php','*.json','*.md','*.ini','*.sql' |
    Select-String -Pattern 'sk_(?:live|test)_[A-Za-z0-9]{20,}|pk_(?:live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|sb_(?:live|test)_[A-Za-z0-9._-]{20,}'
if ($secretHits) { throw 'Pachetul conține o valoare care seamănă cu un secret Stripe sau SmartBill.' }

Compress-Archive -LiteralPath $package -DestinationPath $archive -CompressionLevel Optimal
Write-Output $archive

