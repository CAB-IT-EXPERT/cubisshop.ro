param(
    [Parameter(Mandatory = $true)]
    [string]$ExpectedIp,
    [string]$CredentialFile = '.codex-tmp/cubis-cpanel-ftps.credential.xml',
    [string]$StripeCredentialFile = '.codex-tmp/cubis-stripe-test.credential.xml',
    [string]$StripeWebhookCredentialFile = '.codex-tmp/cubis-stripe-webhook.credential.xml',
    [string]$SmartBillV1CredentialFile = '.codex-tmp/cubis-smartbill-v1.credential.xml',
    [string]$SmartBillV3CredentialFile = '.codex-tmp/cubis-smartbill-v3.credential.xml',
    [string]$SmartBillCif = '',
    [string]$OutputDirectory = '.codex-tmp/cpanel-deploy'
)

$ErrorActionPreference = 'Stop'
$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Resolve-WorkspacePath([string]$Path, [bool]$MustExist = $false) {
    $full = [IO.Path]::GetFullPath((Join-Path $workspace $Path))
    if (-not $full.StartsWith($workspace + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw 'Calea trebuie să rămână în workspace.'
    }
    if ($MustExist -and -not (Test-Path -LiteralPath $full)) { throw "Lipsește fișierul: $Path" }
    return $full
}

function New-RandomSecret([int]$Bytes = 32) {
    $buffer = [byte[]]::new($Bytes)
    [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
    return [Convert]::ToBase64String($buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Get-Sha256([string]$Value) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    try { return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant() }
    finally { [Array]::Clear($bytes, 0, $bytes.Length) }
}

function ConvertTo-PhpLiteral([string]$Value) {
    if ($Value.Contains("`r") -or $Value.Contains("`n") -or $Value.Contains([char]0)) { throw 'Valoare de configurare invalidă.' }
    return "'" + $Value.Replace('\', '\\').Replace("'", "\'") + "'"
}

if ($ExpectedIp -notmatch '^[0-9a-fA-F:.]+$') { throw 'Adresa IP pentru instalator nu este validă.' }
$credentialPath = Resolve-WorkspacePath $CredentialFile $true
$stripePath = Resolve-WorkspacePath $StripeCredentialFile $false
$stripeWebhookPath = Resolve-WorkspacePath $StripeWebhookCredentialFile $false
$smartBillV1Path = Resolve-WorkspacePath $SmartBillV1CredentialFile $false
$smartBillV3Path = Resolve-WorkspacePath $SmartBillV3CredentialFile $false
$outputPath = Resolve-WorkspacePath $OutputDirectory $false
New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

$ftpCredential = Import-Clixml -LiteralPath $credentialPath
$databasePassword = $ftpCredential.GetNetworkCredential().Password
$stripePublishable = ''
$stripeSecret = ''
$stripeWebhookSecret = ''
$smartBillV1Email = ''
$smartBillV1Token = ''
$smartBillV3Token = ''
if (Test-Path -LiteralPath $stripePath) {
    $stripeCredential = Import-Clixml -LiteralPath $stripePath
    $stripePublishable = $stripeCredential.UserName
    $stripeSecret = $stripeCredential.GetNetworkCredential().Password
    if ((($stripePublishable -ne '') -and (-not $stripePublishable.StartsWith('pk_test_'))) -or (($stripeSecret -ne '') -and (-not $stripeSecret.StartsWith('sk_test_')))) {
        throw 'Fișierul Stripe conține chei care nu sunt TEST.'
    }
}
if (Test-Path -LiteralPath $stripeWebhookPath) {
    $stripeWebhookCredential = Import-Clixml -LiteralPath $stripeWebhookPath
    $stripeWebhookSecret = $stripeWebhookCredential.GetNetworkCredential().Password
    if ($stripeWebhookSecret -ne '' -and -not $stripeWebhookSecret.StartsWith('whsec_')) {
        throw 'Fișierul Stripe webhook nu conține un secret de semnare valid.'
    }
}
if (Test-Path -LiteralPath $smartBillV1Path) {
    $smartBillV1Credential = Import-Clixml -LiteralPath $smartBillV1Path
    $smartBillV1Email = $smartBillV1Credential.UserName.Trim()
    $smartBillV1Token = $smartBillV1Credential.GetNetworkCredential().Password
    if ($smartBillV1Email -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$' -or $smartBillV1Token -eq '') {
        throw 'Fișierul SmartBill V1 nu conține email și token valide.'
    }
}
if (Test-Path -LiteralPath $smartBillV3Path) {
    $smartBillV3Credential = Import-Clixml -LiteralPath $smartBillV3Path
    $smartBillV3Token = $smartBillV3Credential.GetNetworkCredential().Password
    if ($smartBillV3Token -ne '' -and -not $smartBillV3Token.StartsWith('sb_')) {
        throw 'Fișierul SmartBill V3 nu conține un token recunoscut.'
    }
}
$SmartBillCif = $SmartBillCif.Trim()
if ($SmartBillCif -ne '' -and $SmartBillCif -notmatch '^[A-Za-z]{0,3}[0-9]{2,20}$') {
    throw 'CIF-ul SmartBill nu are un format valid.'
}
$smartBillReadConfigured = $smartBillV1Email -ne '' -and $smartBillV1Token -ne '' -and $smartBillV3Token -ne '' -and $SmartBillCif -ne ''

$apiKey = New-RandomSecret 36
$environment = [ordered]@{
    CUBIS_API_KEY = $apiKey
    CUBIS_DB_HOST = 'localhost'
    CUBIS_DB_PORT = '3306'
    CUBIS_DB_NAME = 'cabitro_cubisshop.ro'
    CUBIS_DB_USER = 'cabitro_admin'
    CUBIS_DB_PASS = $databasePassword
    CUBIS_PUBLIC_API_URL = 'https://cubisshop.ro/shop-api'
    CUBIS_WEBSITE_URL = 'https://cubisshop.ro'
    CUBIS_SERVICE_SHEET_PDF_BASE_URL = 'https://cubisshop.ro/fs/'
    CUBIS_ALLOWED_ORIGINS = 'https://cubisshop.ro,https://www.cubisshop.ro'
    CUBIS_AUTOMATIONS_ENABLED = 'false'
    CUBIS_WEBSITE_GENERATION_ENABLED = 'false'
    CUBIS_EMAIL_ENABLED = 'false'
    CUBIS_ADMIN_EMAIL_ENABLED = 'false'
    CUBIS_SPV_ENABLED = 'false'
    CUBIS_STRIPE_SECRET_KEY = $stripeSecret
    CUBIS_STRIPE_PUBLISHABLE_KEY = $stripePublishable
    CUBIS_STRIPE_WEBHOOK_SECRET = $stripeWebhookSecret
    CUBIS_SMARTBILL_V1_EMAIL = $smartBillV1Email
    CUBIS_SMARTBILL_V1_TOKEN = $smartBillV1Token
    CUBIS_SMARTBILL_V3_TOKEN = $smartBillV3Token
    CUBIS_SMARTBILL_CIF = $SmartBillCif
    CUBIS_SMARTBILL_READ_ENABLED = $(if ($smartBillReadConfigured) { 'true' } else { 'false' })
    CUBIS_SMARTBILL_ISSUING_ENABLED = 'false'
    CUBIS_SMARTBILL_EMAIL_ENABLED = 'false'
    CUBIS_SMARTBILL_INVENTORY_AUTHORITY = 'true'
}

$configLines = @(
    '<?php',
    'declare(strict_types=1);',
    '',
    '// Generated local server configuration. Protected by shop-api/.htaccess.',
    '// All external automations remain disabled for Stage 3.'
)
foreach ($entry in $environment.GetEnumerator()) {
    $assignment = $entry.Key + '=' + [string]$entry.Value
    $configLines += 'putenv(' + (ConvertTo-PhpLiteral $assignment) + ');'
}
$configLines += ''
$configLines += "return require __DIR__ . '/config.example.php';"
$configLines += ''
$configPath = Join-Path $outputPath 'config.local.php'
[IO.File]::WriteAllText($configPath, ($configLines -join "`n"), [Text.UTF8Encoding]::new($false))

$crmConfigLines = @(
    '<?php',
    'declare(strict_types=1);',
    '',
    '// Generated local CRM configuration. Protected by crm/.htaccess.'
)
$crmEnvironmentNames = @(
    'CUBIS_API_KEY',
    'CUBIS_DB_HOST',
    'CUBIS_DB_PORT',
    'CUBIS_DB_NAME',
    'CUBIS_DB_USER',
    'CUBIS_DB_PASS',
    'CUBIS_ALLOWED_ORIGINS',
    'CUBIS_SERVICE_SHEET_PDF_BASE_URL'
)
foreach ($entry in $environment.GetEnumerator() | Where-Object { $_.Key -in $crmEnvironmentNames }) {
    $assignment = $entry.Key + '=' + [string]$entry.Value
    $crmConfigLines += 'putenv(' + (ConvertTo-PhpLiteral $assignment) + ');'
}
$crmConfigLines += ''
$crmConfigLines += "return require __DIR__ . '/api_config.example.php';"
$crmConfigLines += ''
$crmConfigPath = Join-Path $outputPath 'api_config.local.php'
[IO.File]::WriteAllText($crmConfigPath, ($crmConfigLines -join "`n"), [Text.UTF8Encoding]::new($false))

$basicUser = 'cubis-' + (New-RandomSecret 9).ToLowerInvariant()
$basicPassword = New-RandomSecret 30
$deployToken = New-RandomSecret 40
$installerName = 'cubis-install-' + (New-RandomSecret 18).ToLowerInvariant() + '.php'
$templatePath = Resolve-WorkspacePath 'scripts/cpanel-temporary-installer.template.php' $true
$installer = [IO.File]::ReadAllText($templatePath)
$installer = $installer.Replace('__EXPECTED_IP__', $ExpectedIp)
$installer = $installer.Replace('__BASIC_USER_SHA256__', (Get-Sha256 $basicUser))
$installer = $installer.Replace('__BASIC_PASS_SHA256__', (Get-Sha256 $basicPassword))
$installer = $installer.Replace('__TOKEN_SHA256__', (Get-Sha256 $deployToken))
$installerPath = Join-Path $outputPath $installerName
[IO.File]::WriteAllText($installerPath, $installer, [Text.UTF8Encoding]::new($false))

$basicSecure = ConvertTo-SecureString $basicPassword -AsPlainText -Force
[pscredential]::new($basicUser, $basicSecure) | Export-Clixml -LiteralPath (Join-Path $outputPath 'installer-basic.credential.xml')
$tokenSecure = ConvertTo-SecureString $deployToken -AsPlainText -Force
[pscredential]::new('cubis-deploy-token', $tokenSecure) | Export-Clixml -LiteralPath (Join-Path $outputPath 'installer-token.credential.xml')

$metadata = [ordered]@{
    expected_ip = $ExpectedIp
    installer_name = $installerName
    database = 'cabitro_cubisshop.ro'
    stripe_test_keys_configured = ($stripePublishable -ne '' -and $stripeSecret -ne '')
    stripe_webhook_secret_configured = ($stripeWebhookSecret -ne '')
    smartbill_read_configured = $smartBillReadConfigured
    smartbill_issuing_enabled = $false
    smartbill_email_enabled = $false
}
[IO.File]::WriteAllText(
    (Join-Path $outputPath 'metadata.json'),
    ($metadata | ConvertTo-Json),
    [Text.UTF8Encoding]::new($false)
)

$databasePassword = $null
$stripeSecret = $null
$stripeWebhookSecret = $null
$smartBillV1Token = $null
$smartBillV3Token = $null
$apiKey = $null
$basicPassword = $null
$deployToken = $null

[pscustomobject]@{
    OutputDirectory = $outputPath
    ConfigFile = $configPath
    CrmConfigFile = $crmConfigPath
    InstallerFile = $installerPath
    InstallerName = $installerName
    StripeTestConfigured = $metadata.stripe_test_keys_configured
    WebhookSecretConfigured = $metadata.stripe_webhook_secret_configured
    SmartBillReadConfigured = $metadata.smartbill_read_configured
}
