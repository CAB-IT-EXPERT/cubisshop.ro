param(
    [string]$CredentialPath = '.codex-tmp/cubis-cpanel-ftps.credential.xml',
    [string]$TemplatePath = 'scripts/cpanel-schema-finalizer.template.php',
    [string]$FtpsHost = 'd108.dataserver.ro',
    [string]$RemoteDirectory = 'cubisshop.ro/shop-api'
)

$ErrorActionPreference = 'Stop'

function Get-Sha256Hex([string]$Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    try {
        return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    } finally {
        [Array]::Clear($bytes, 0, $bytes.Length)
    }
}

if (-not (Test-Path -LiteralPath $CredentialPath)) { throw 'Configurația FTPS locală lipsește.' }
if (-not (Test-Path -LiteralPath $TemplatePath)) { throw 'Șablonul finalizatorului lipsește.' }

$credential = Import-Clixml -LiteralPath $CredentialPath
$ftpPassword = $credential.GetNetworkCredential().Password
$publicIp = ([string](Invoke-RestMethod -Uri 'https://api.ipify.org')).Trim()
if ($publicIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'IP-ul public nu a putut fi confirmat.' }

$basicUser = 'cubis-' + [Guid]::NewGuid().ToString('N')
$basicPassword = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$deployToken = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$remoteName = 'cubis-schema-finalizer-' + [Guid]::NewGuid().ToString('N') + '.php'
$localPath = Join-Path '.codex-tmp' $remoteName
$remoteUrl = 'ftp://' + $FtpsHost + '/' + $RemoteDirectory.Trim('/') + '/' + $remoteName
$httpsUrl = 'https://cubisshop.ro/shop-api/' + $remoteName

$template = Get-Content -LiteralPath $TemplatePath -Raw
$generated = $template.Replace('__EXPECTED_IP__', $publicIp)
$generated = $generated.Replace('__BASIC_USER_SHA256__', (Get-Sha256Hex $basicUser))
$generated = $generated.Replace('__BASIC_PASS_SHA256__', (Get-Sha256Hex $basicPassword))
$generated = $generated.Replace('__TOKEN_SHA256__', (Get-Sha256Hex $deployToken))
[IO.File]::WriteAllText((Join-Path (Get-Location) $localPath), $generated, [Text.UTF8Encoding]::new($false))

$ftpAuth = $credential.UserName + ':' + $ftpPassword
$httpAuth = $basicUser + ':' + $basicPassword
$uploaded = $false
try {
    & curl.exe --silent --show-error --fail --ftp-ssl --ftp-ssl-reqd --user $ftpAuth --upload-file $localPath $remoteUrl
    if ($LASTEXITCODE -ne 0) { throw 'Încărcarea finalizatorului a eșuat.' }
    $uploaded = $true

    $response = & curl.exe --silent --show-error --fail-with-body --user $httpAuth `
        --header ('X-Cubis-Deploy-Token: ' + $deployToken) `
        --header 'Content-Type: application/json' `
        --data '{"confirm":"cabitro_cubisshop.ro"}' `
        $httpsUrl
    if ($LASTEXITCODE -ne 0) { throw ('Finalizarea schemei a eșuat: ' + $response) }
    $result = $response | ConvertFrom-Json
    if (-not $result.success -or $result.database -ne 'cabitro_cubisshop.ro' -or $result.installed_version -ne '2026101002') {
        throw 'Răspunsul finalizatorului nu confirmă schema țintă.'
    }

    [pscustomobject]@{
        success = $true
        database = $result.database
        previous_version = $result.previous_version
        installed_version = $result.installed_version
        verified_smartbill_tables = $result.verified_smartbill_tables
        verified_smartbill_columns = $result.verified_smartbill_columns
        issuing_enabled = $result.issuing_enabled
        table_count = $result.table_count
        backup_file = $result.backup_file
    } | ConvertTo-Json -Compress
} finally {
    if ($uploaded) {
        & curl.exe --silent --show-error --ftp-ssl --ftp-ssl-reqd --user $ftpAuth `
            --quote ('DELE /' + $RemoteDirectory.Trim('/') + '/' + $remoteName) `
            ('ftp://' + $FtpsHost + '/') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Ștergerea FTPS a finalizatorului a eșuat.' }
        $remainingFiles = & curl.exe --silent --show-error --ftp-ssl --ftp-ssl-reqd --user $ftpAuth `
            --list-only ('ftp://' + $FtpsHost + '/' + $RemoteDirectory.Trim('/') + '/')
        if ($LASTEXITCODE -ne 0 -or $remainingFiles -contains $remoteName) {
            throw 'Finalizatorul temporar este încă prezent pe server.'
        }
    }
    if (Test-Path -LiteralPath $localPath) { Remove-Item -LiteralPath $localPath -Force }
    $ftpPassword = $null
    $basicPassword = $null
    $deployToken = $null
}

$status = & curl.exe --silent --output NUL --write-out '%{http_code}' $httpsUrl
if ($status -notin @('403', '404')) { throw 'Finalizatorul temporar nu a fost eliminat complet.' }
Write-Output ('{"temporary_installer_removed":true,"https_status":' + $status + '}')
