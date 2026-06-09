param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,

  [string]$HostExePath = "",
  [string]$ManifestPath = ""
)

$ErrorActionPreference = "Stop"

$hostName = "com.pidownloader.bridge"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if ([string]::IsNullOrWhiteSpace($HostExePath)) {
  $repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
  $HostExePath = Join-Path $repoRoot "src-tauri\target\debug\pidownloader-native-host.exe"
}

if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $ManifestPath = Join-Path $scriptDir "$hostName.json"
}

$resolvedHostExePath = Resolve-Path -LiteralPath $HostExePath
$manifest = [ordered]@{
  name = $hostName
  description = "PiDownloader Chrome native messaging bridge"
  path = $resolvedHostExePath.Path
  type = "stdio"
  allowed_origins = @("chrome-extension://$ExtensionId/")
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ManifestPath -Encoding UTF8

$registryPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
New-Item -Path $registryPath -Force | Out-Null
Set-Item -Path $registryPath -Value (Resolve-Path -LiteralPath $ManifestPath).Path

Write-Host "Registered $hostName"
Write-Host "Host: $($resolvedHostExePath.Path)"
Write-Host "Manifest: $ManifestPath"
