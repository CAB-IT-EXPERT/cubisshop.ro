param(
    [string]$CredentialPath = '.codex-tmp/cubis-cpanel-ftps.credential.xml',
    [string]$FtpsHost = 'd108.dataserver.ro',
    [string]$RemoteDirectory = 'cubisshop.ro/shop-api'
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function New-RandomSecret([int]$bytes = 32) {
    $buffer = [byte[]]::new($bytes)
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) }
    finally { $rng.Dispose() }
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
function Get-Sha256Hex([string]$value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($value)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes)) -replace '-', '').ToLowerInvariant() }
    finally { $sha.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
}
function Set-ConfigVariable([string]$content, [string]$name, [string]$value) {
    if ($value.Contains("'") -or $value.Contains("`r") -or $value.Contains("`n")) { throw "Valoare nesigură pentru $name." }
    $line = "putenv('$name=$value');"
    $pattern = "(?m)^putenv\('" + [regex]::Escape($name) + "=[^']*'\);\r?$"
    if ([regex]::IsMatch($content, $pattern)) { return [regex]::Replace($content, $pattern, $line) }
    $returnPattern = "(?m)^return require __DIR__ \. '/config\.example\.php';\r?$"
    if (-not [regex]::IsMatch($content, $returnPattern)) { throw 'Configurația remote nu are structura așteptată.' }
    return [regex]::Replace($content, $returnPattern, $line + "`n`n" + "return require __DIR__ . '/config.example.php';")
}
function Invoke-Curl([string[]]$arguments, [string]$failure) {
    $output = & curl.exe @arguments
    if ($LASTEXITCODE -ne 0) { throw $failure }
    return $output
}

$credentialFile = [IO.Path]::GetFullPath((Join-Path $workspace $CredentialPath))
if (-not $credentialFile.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $credentialFile)) {
    throw 'Configurația FTPS locală securizată lipsește.'
}
$templatePath = Join-Path $PSScriptRoot 'cpanel-smartbill-stage1-installer.template.php'
if (-not (Test-Path -LiteralPath $templatePath)) { throw 'Șablonul instalatorului SmartBill lipsește.' }
$credential = Import-Clixml -LiteralPath $credentialFile
$ftpPassword = $credential.GetNetworkCredential().Password
$ftpAuth = $credential.UserName + ':' + $ftpPassword
$publicIp = ([string](Invoke-RestMethod -Uri 'https://api.ipify.org')).Trim()
if ($publicIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'IP-ul public nu a putut fi confirmat.' }

$runId = Get-Date -Format 'yyyyMMdd-HHmmss'
$localRoot = Join-Path $workspace ('.codex-tmp\smartbill-stage1-' + $runId)
$backupRoot = Join-Path $localRoot 'remote-backup'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$remoteBase = 'ftp://' + $FtpsHost + '/' + $RemoteDirectory.Trim('/')

foreach ($file in @('api.php', 'smartbill-service.php', 'config.example.php', 'config.local.php')) {
    Invoke-Curl @('--silent','--show-error','--fail','--ftp-ssl','--ftp-ssl-reqd','--user',$ftpAuth,'--output',(Join-Path $backupRoot $file),($remoteBase + '/' + $file)) "Backupul remote $file a eșuat." | Out-Null
}

$configPath = Join-Path $localRoot 'config.local.php'
$config = [IO.File]::ReadAllText((Join-Path $backupRoot 'config.local.php'))
if ($config -notmatch "CUBIS_SMARTBILL_CREDENTIAL_KEY=([^']+)") {
    $config = Set-ConfigVariable $config 'CUBIS_SMARTBILL_CREDENTIAL_KEY' (New-RandomSecret 48)
}
$config = Set-ConfigVariable $config 'CUBIS_SMARTBILL_READ_ENABLED' 'true'
$config = Set-ConfigVariable $config 'CUBIS_SMARTBILL_ISSUING_ENABLED' 'false'
$config = Set-ConfigVariable $config 'CUBIS_SMARTBILL_EMAIL_ENABLED' 'false'
[IO.File]::WriteAllText($configPath, $config, [Text.UTF8Encoding]::new($false))
$config = $null

$uploads = [ordered]@{
    'config.local.php' = $configPath
    'config.example.php' = (Join-Path $workspace 'shop-api\config.example.php')
    'smartbill-service.php' = (Join-Path $workspace 'shop-api\smartbill-service.php')
    'migrate-smartbill-stage1.php' = (Join-Path $workspace 'shop-api\migrate-smartbill-stage1.php')
}
foreach ($entry in $uploads.GetEnumerator()) {
    Invoke-Curl @('--silent','--show-error','--fail','--ftp-ssl','--ftp-ssl-reqd','--user',$ftpAuth,'--upload-file',$entry.Value,($remoteBase + '/' + $entry.Key)) "Încărcarea $($entry.Key) a eșuat." | Out-Null
}

$basicUser = 'cubis-' + [Guid]::NewGuid().ToString('N')
$basicPassword = New-RandomSecret 36
$deployToken = New-RandomSecret 48
$installerName = 'cubis-smartbill-stage1-' + [Guid]::NewGuid().ToString('N') + '.php'
$installerPath = Join-Path $localRoot $installerName
$template = [IO.File]::ReadAllText($templatePath)
$generated = $template.Replace('__EXPECTED_IP__', $publicIp)
$generated = $generated.Replace('__BASIC_USER_SHA256__', (Get-Sha256Hex $basicUser))
$generated = $generated.Replace('__BASIC_PASS_SHA256__', (Get-Sha256Hex $basicPassword))
$generated = $generated.Replace('__TOKEN_SHA256__', (Get-Sha256Hex $deployToken))
[IO.File]::WriteAllText($installerPath, $generated, [Text.UTF8Encoding]::new($false))
$httpsUrl = 'https://cubisshop.ro/shop-api/' + $installerName
$uploadedInstaller = $false
try {
    Invoke-Curl @('--silent','--show-error','--fail','--ftp-ssl','--ftp-ssl-reqd','--user',$ftpAuth,'--upload-file',$installerPath,($remoteBase + '/' + $installerName)) 'Încărcarea instalatorului temporar a eșuat.' | Out-Null
    $uploadedInstaller = $true
    $httpAuth = $basicUser + ':' + $basicPassword
    $basicHeader = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($httpAuth))
    $result = Invoke-RestMethod -Method Post -Uri $httpsUrl -ContentType 'application/json' -Headers @{
        Authorization = 'Basic ' + $basicHeader
        'X-Cubis-Deploy-Token' = $deployToken
    } -Body (@{ confirm = 'cabitro_cubisshop.ro' } | ConvertTo-Json -Compress)
    if (-not $result.success -or $result.database -ne 'cabitro_cubisshop.ro' -or $result.schema_version -ne '2026101003' -or -not $result.openssl_available -or $result.issuing_enabled -or $result.email_enabled) {
        throw 'Răspunsul instalatorului nu confirmă izolarea și schema SmartBill.'
    }

    Invoke-Curl @('--silent','--show-error','--fail','--ftp-ssl','--ftp-ssl-reqd','--user',$ftpAuth,'--upload-file',(Join-Path $workspace 'shop-api\api.php'),($remoteBase + '/api.php')) 'Încărcarea API-ului final a eșuat.' | Out-Null

    $apiKeyMatch = [regex]::Match([IO.File]::ReadAllText($configPath), "CUBIS_API_KEY=([^']+)" )
    if (-not $apiKeyMatch.Success) { throw 'Cheia server-to-server nu a putut fi citită din configurația locală securizată.' }
    $healthRaw = Invoke-Curl @('--silent','--show-error','--fail-with-body','--header',('X-API-Key: ' + $apiKeyMatch.Groups[1].Value),'https://cubisshop.ro/shop-api/api-v2.php?action=health') 'Health-check-ul API a eșuat.'
    $health = ($healthRaw -join "`n") | ConvertFrom-Json
    if (-not $health.success -or $health.database -ne 'cabitro_cubisshop.ro') { throw 'Health-check-ul nu confirmă baza Cubis Shop.' }

    [pscustomobject]@{
        success = $true
        database = $result.database
        schema_version = $result.schema_version
        credential_vault_exists = $result.credential_vault_exists
        credential_audit_exists = $result.credential_audit_exists
        series_history_columns = $result.series_history_columns
        openssl_available = $result.openssl_available
        read_enabled = $result.read_enabled
        issuing_enabled = $result.issuing_enabled
        email_enabled = $result.email_enabled
        table_count = $result.table_count
        backup_file = $result.backup_file
        api_health = $health.success
        products = $health.products
        orders = $health.orders
    } | ConvertTo-Json -Compress
} finally {
    if ($uploadedInstaller) {
        & curl.exe --silent --show-error --ftp-ssl --ftp-ssl-reqd --user $ftpAuth --quote ('DELE /' + $RemoteDirectory.Trim('/') + '/' + $installerName) ('ftp://' + $FtpsHost + '/') | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Ștergerea instalatorului temporar a eșuat.' }
        $remaining = & curl.exe --silent --show-error --ftp-ssl --ftp-ssl-reqd --user $ftpAuth --list-only ($remoteBase + '/')
        if ($LASTEXITCODE -ne 0 -or $remaining -contains $installerName) { throw 'Instalatorul temporar este încă prezent pe server.' }
    }
    $ftpPassword = $null
    $basicPassword = $null
    $deployToken = $null
}

$status = & curl.exe --silent --output NUL --write-out '%{http_code}' $httpsUrl
if ($status -match '^2') { throw 'Instalatorul temporar răspunde încă public.' }
Write-Output ('{"temporary_installer_removed":true,"https_status":' + $status + '}')
