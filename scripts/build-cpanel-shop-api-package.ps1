param(
    [string]$OutputDirectory = 'outputs/cpanel-shop-api'
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$builder = Join-Path $PSScriptRoot 'build-plesk-shop-api-package.ps1'
$legacyArchive = & $builder -OutputDirectory $OutputDirectory
$legacyPath = [IO.Path]::GetFullPath([string]$legacyArchive)
$package = Join-Path (Split-Path -Parent $legacyPath) 'shop-api'
$crmSource = Join-Path $workspace 'server'
$crmTarget = Join-Path $package 'crm'
Copy-Item -LiteralPath $crmSource -Destination $crmTarget -Recurse -Force
foreach ($relative in @('api_config.local.php')) {
    $targetLocal = Join-Path $crmTarget $relative
    if (Test-Path -LiteralPath $targetLocal) { Remove-Item -LiteralPath $targetLocal -Force }
}
Get-ChildItem -LiteralPath $crmTarget -File -Filter 'fisa-service-template*.jpg' |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
$forbidden = Get-ChildItem -LiteralPath $package -Recurse -File | Where-Object {
    $_.Name -match '\.local\.php$|\.secret\.|^\.env$' -or $_.FullName -match '[\\/]tests[\\/]'
}
if ($forbidden) { throw ('Pachetul cPanel conține fișiere interzise: ' + (($forbidden.FullName) -join ', ')) }
$secretHits = Get-ChildItem -LiteralPath $package -Recurse -File -Include '*.php','*.json','*.md','*.ini','*.sql' |
    Select-String -Pattern 'sk_(?:live|test)_[A-Za-z0-9]{20,}|pk_(?:live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|sb_(?:live|test)_[A-Za-z0-9._-]{20,}'
if ($secretHits) { throw 'Pachetul cPanel conține o valoare care seamănă cu un secret Stripe sau SmartBill.' }
$target = Join-Path (Split-Path -Parent $legacyPath) 'cubis-shop-api-cpanel.zip'
if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Force }
Compress-Archive -LiteralPath $package -DestinationPath $target -CompressionLevel Optimal
Remove-Item -LiteralPath $legacyPath -Force
Write-Output $target
