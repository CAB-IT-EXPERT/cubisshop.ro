param(
    [ValidateSet('Test', 'List', 'MakeDirectory', 'UploadFile', 'UploadDirectory', 'DownloadFile')]
    [string]$Mode = 'Test',
    [string]$Server = 'ftp.cab-it.ro',
    [int]$Port = 21,
    [string]$Username = 'alexie@cab-it.ro',
    [string]$RemotePath = '',
    [string]$LocalPath = '',
    [string]$CredentialFile = '.codex-tmp/cubis-cpanel-ftps.credential.xml',
    [string]$ExpectedCertificateSha256 = ''
)

$ErrorActionPreference = 'Stop'
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

if ($ExpectedCertificateSha256) {
    $script:ExpectedFtpsCertificateSha256 = ($ExpectedCertificateSha256 -replace '[^0-9A-Fa-f]', '').ToUpperInvariant()
    if ($script:ExpectedFtpsCertificateSha256.Length -ne 64) { throw 'Amprenta SHA-256 FTPS trebuie să conțină exact 64 de caractere hexazecimale.' }
    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = {
        param($sender, $certificate, $chain, $sslPolicyErrors)
        if ($sslPolicyErrors -eq [System.Net.Security.SslPolicyErrors]::None) { return $true }
        if ($sslPolicyErrors -ne [System.Net.Security.SslPolicyErrors]::RemoteCertificateNameMismatch) { return $false }
        if ($null -eq $certificate) { return $false }
        $certificate2 = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate)
        try {
            $actual = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($certificate2.RawData))
            return [string]::Equals($actual, $script:ExpectedFtpsCertificateSha256, [System.StringComparison]::Ordinal)
        } finally {
            $certificate2.Dispose()
        }
    }
}

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$credentialPath = [System.IO.Path]::GetFullPath((Join-Path $workspace $CredentialFile))
if (-not $credentialPath.StartsWith($workspace + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Fișierul de credențiale trebuie să rămână în workspace.'
}
if (-not (Test-Path -LiteralPath $credentialPath)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $credentialPath) -Force | Out-Null
    $secret = Read-Host 'Parola FTPS' -AsSecureString
    [pscredential]::new($Username, $secret) | Export-Clixml -LiteralPath $credentialPath
}
$credential = Import-Clixml -LiteralPath $credentialPath

function Normalize-RemotePath([string]$Path) {
    $clean = ($Path -replace '\\', '/').Trim('/')
    if (($clean -split '/') -contains '..') { throw 'Calea remote nu poate conține ..' }
    return $clean
}

function Remote-Uri([string]$Path) {
    $clean = Normalize-RemotePath $Path
    $escaped = (($clean -split '/') | Where-Object { $_ -ne '' } | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $suffix = if ($escaped -eq '') { '' } else { '/' + $escaped }
    return "ftp://$Server`:$Port$suffix"
}

function New-FtpsRequest([string]$Path, [string]$Method) {
    $request = [System.Net.FtpWebRequest]::Create((Remote-Uri $Path))
    $request.Method = $Method
    $request.Credentials = $credential.GetNetworkCredential()
    $request.EnableSsl = $true
    $request.UsePassive = $true
    $request.UseBinary = $true
    $request.KeepAlive = $false
    $request.Timeout = 30000
    $request.ReadWriteTimeout = 120000
    return $request
}

function Get-RemoteList([string]$Path) {
    $request = New-FtpsRequest $Path ([System.Net.WebRequestMethods+Ftp]::ListDirectory)
    $response = $request.GetResponse()
    try {
        $reader = [System.IO.StreamReader]::new($response.GetResponseStream())
        try {
            $items = @()
            while (-not $reader.EndOfStream) {
                $name = $reader.ReadLine()
                if ($name -and $name -notin @('.', '..')) { $items += $name }
            }
            return $items
        } finally { $reader.Dispose() }
    } finally { $response.Dispose() }
}

function Ensure-RemoteDirectory([string]$Path) {
    $clean = Normalize-RemotePath $Path
    if ($clean -eq '') { return }
    $cursor = ''
    foreach ($segment in ($clean -split '/')) {
        $cursor = if ($cursor -eq '') { $segment } else { "$cursor/$segment" }
        try {
            $request = New-FtpsRequest $cursor ([System.Net.WebRequestMethods+Ftp]::MakeDirectory)
            $response = $request.GetResponse()
            $response.Dispose()
        } catch [System.Net.WebException] {
            $response = $_.Exception.Response
            $status = if ($response) { [int]$response.StatusCode } else { 0 }
            if ($response) { $response.Dispose() }
            if ($status -notin @(550, 521)) { throw }
        }
    }
}

function Send-File([string]$Source, [string]$Destination) {
    $parent = Split-Path (Normalize-RemotePath $Destination) -Parent
    if ($parent) { Ensure-RemoteDirectory ($parent -replace '\\', '/') }
    $request = New-FtpsRequest $Destination ([System.Net.WebRequestMethods+Ftp]::UploadFile)
    $bytes = [System.IO.File]::ReadAllBytes($Source)
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    $response = $request.GetResponse()
    $response.Dispose()
}

switch ($Mode) {
    'Test' {
        [void](Get-RemoteList $RemotePath)
        'FTPS_OK'
    }
    'List' {
        Get-RemoteList $RemotePath
    }
    'MakeDirectory' {
        Ensure-RemoteDirectory $RemotePath
        'DIRECTORY_OK'
    }
    'UploadFile' {
        $resolved = (Resolve-Path -LiteralPath $LocalPath).Path
        Send-File $resolved $RemotePath
        'UPLOAD_OK'
    }
    'UploadDirectory' {
        $resolved = (Resolve-Path -LiteralPath $LocalPath).Path
        if (-not (Test-Path -LiteralPath $resolved -PathType Container)) { throw 'LocalPath trebuie să fie director.' }
        Ensure-RemoteDirectory $RemotePath
        $files = Get-ChildItem -LiteralPath $resolved -Recurse -File -Force
        $index = 0
        foreach ($file in $files) {
            $relative = [System.IO.Path]::GetRelativePath($resolved, $file.FullName) -replace '\\', '/'
            $destination = if ((Normalize-RemotePath $RemotePath) -eq '') { $relative } else { (Normalize-RemotePath $RemotePath) + '/' + $relative }
            Send-File $file.FullName $destination
            $index++
            if (($index % 25) -eq 0 -or $index -eq $files.Count) { "UPLOADED $index/$($files.Count)" }
        }
    }
    'DownloadFile' {
        $target = [System.IO.Path]::GetFullPath($LocalPath)
        $targetParent = Split-Path -Parent $target
        if ($targetParent) { New-Item -ItemType Directory -Path $targetParent -Force | Out-Null }
        $request = New-FtpsRequest $RemotePath ([System.Net.WebRequestMethods+Ftp]::DownloadFile)
        $response = $request.GetResponse()
        try {
            $input = $response.GetResponseStream()
            $output = [System.IO.File]::Create($target)
            try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
        } finally { $response.Dispose() }
        'DOWNLOAD_OK'
    }
}

