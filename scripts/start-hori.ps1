param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
  [int]$OllamaPort = 11434,
  [switch]$ExitAfterReady,
  [switch]$NoClipboard
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$script:LauncherName = "Hori Launcher"
$script:LauncherRoot = Join-Path $env:LOCALAPPDATA "Hori"
$script:LogsRoot = Join-Path $script:LauncherRoot "logs"
$script:StateRoot = Join-Path $script:LauncherRoot "state"
$script:StateFile = Join-Path $script:StateRoot "launcher-state.json"
$script:OllamaPidFile = Join-Path $script:StateRoot "ollama.pid"
$script:TunnelPidFile = Join-Path $script:StateRoot "tunnel.pid"
$script:OllamaStdOutLog = Join-Path $script:LogsRoot "ollama-serve.out.log"
$script:OllamaStdErrLog = Join-Path $script:LogsRoot "ollama-serve.err.log"
$script:CloudflaredLog = Join-Path $script:LogsRoot "cloudflared-tunnel.log"
$script:NgrokLog = Join-Path $script:LogsRoot "ngrok-tunnel.log"
$script:NgrokErrLog = Join-Path $script:LogsRoot "ngrok-tunnel.err.log"
$script:LocalhostRunLog = Join-Path $script:LogsRoot "localhostrun-tunnel.log"
$script:LocalhostRunErrLog = Join-Path $script:LogsRoot "localhostrun-tunnel.err.log"
$script:LocalTunnelLog = Join-Path $script:LogsRoot "localtunnel.log"
$script:LocalTunnelErrLog = Join-Path $script:LogsRoot "localtunnel.err.log"
$script:TailscaleLog = Join-Path $script:LogsRoot "tailscale-tunnel.log"
$script:TailscaleProxyStdOutLog = Join-Path $script:LogsRoot "tailscale-ollama-proxy.out.log"
$script:TailscaleProxyStdErrLog = Join-Path $script:LogsRoot "tailscale-ollama-proxy.err.log"
$script:TailscaleProxyPidFile = Join-Path $script:StateRoot "tailscale-ollama-proxy.pid"
$script:TailscaleProxyScript = Join-Path $PSScriptRoot "ollama-host-proxy.mjs"
$script:TunnelCommandFile = Join-Path ([Environment]::GetFolderPath("Desktop")) "Хори URL.txt"
$script:TailscaleLoginFile = Join-Path ([Environment]::GetFolderPath("Desktop")) "Хори Tailscale.txt"
$script:NgrokTokenFile = Join-Path ([Environment]::GetFolderPath("Desktop")) "Хори NGROK.txt"
$script:LocalTunnelSubdomainFile = Join-Path $script:StateRoot "localtunnel-subdomain.txt"
$script:OllamaBaseUrl = "http://localhost:$OllamaPort"
$script:OllamaTagsUrl = "$($script:OllamaBaseUrl)/api/tags"
$script:TailscaleProxyPort = $OllamaPort + 1
$script:TailscaleProxyUrl = "http://127.0.0.1:$($script:TailscaleProxyPort)"
$script:ManagedTunnelProcess = $null
$script:ManagedTunnelProvider = ""
$script:ManagedTailscaleProxyProcess = $null
$script:ManagedOllamaProcess = $null
$script:StartedOllamaHere = $false
$script:MutexAcquired = $false
$script:LauncherMutex = $null
$script:TunnelHealthCheckIntervalSeconds = 20
$script:TunnelHealthTimeoutSeconds = 12
$script:TunnelHealthFailuresBeforeRestart = 2

function Write-Banner {
  Write-Host ""
  Write-Host "=============================================" -ForegroundColor Cyan
  Write-Host "  Hori Launcher" -ForegroundColor Cyan
  Write-Host "=============================================" -ForegroundColor Cyan
  Write-Host "  Project: $ProjectRoot" -ForegroundColor DarkGray
  Write-Host "  Logs:    $script:LogsRoot" -ForegroundColor DarkGray
  Write-Host ""
}

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "[$Title]" -ForegroundColor White
}

function Write-Step {
  param([string]$Message)

  Write-Host "[*] $Message" -ForegroundColor Cyan
}

function Write-Ok {
  param([string]$Message)

  Write-Host "[+] $Message" -ForegroundColor Green
}

function Write-WarnLine {
  param([string]$Message)

  Write-Host "[!] $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)

  Write-Host "[x] $Message" -ForegroundColor Red
}

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Remove-FileIfExists {
  param([string]$Path)

  if (Test-Path $Path) {
    Remove-Item $Path -Force -ErrorAction SilentlyContinue
  }
}

function Read-PidFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  $value = (Get-Content $Path -Raw -ErrorAction SilentlyContinue).Trim()
  if ($value -match '^\d+$') {
    return [int]$value
  }

  return $null
}

function Write-PidFile {
  param(
    [string]$Path,
    [int]$ProcessId
  )

  Set-Content -Path $Path -Value $ProcessId -Encoding ASCII
}

function Get-ProcessByIdSafe {
  param([int]$ProcessId)

  return Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
}

function Stop-ProcessTreeSafe {
  param(
    [int]$ProcessId,
    [string]$Label
  )

  $process = Get-ProcessByIdSafe -ProcessId $ProcessId
  if (-not $process) {
    return
  }

  Write-Step "Останавливаю $Label (PID $ProcessId)..."
  & taskkill /PID $ProcessId /T /F *> $null
  Start-Sleep -Milliseconds 600
}

function Save-LauncherState {
  param(
    [string]$Status,
    [string]$TunnelUrl = "",
    [string]$TunnelProvider = "",
    [string]$TunnelLog = ""
  )

  $state = [ordered]@{
    savedAt = (Get-Date).ToString("s")
    status = $Status
    projectRoot = $ProjectRoot
    localOllamaUrl = $script:OllamaBaseUrl
    tunnelUrl = $TunnelUrl
    tunnelProvider = $TunnelProvider
    tunnelLog = $TunnelLog
    ollamaStdOutLog = $script:OllamaStdOutLog
    ollamaStdErrLog = $script:OllamaStdErrLog
  }

  $state | ConvertTo-Json -Depth 4 | Set-Content -Path $script:StateFile -Encoding UTF8
}

function Show-LastKnownState {
  if (-not (Test-Path $script:StateFile)) {
    return
  }

  try {
    $state = Get-Content $script:StateFile -Raw | ConvertFrom-Json
  } catch {
    return
  }

  Write-WarnLine "Похоже, launcher уже запущен в другом окне."
  if ($state.tunnelUrl) {
    Write-Host "    Последний URL: $($state.tunnelUrl)" -ForegroundColor DarkGray
  }
  if ($state.tunnelProvider) {
    Write-Host "    Провайдер:    $($state.tunnelProvider)" -ForegroundColor DarkGray
  }
  if ($state.savedAt) {
    Write-Host "    Состояние от: $($state.savedAt)" -ForegroundColor DarkGray
  }
}

function Acquire-LauncherMutex {
  $createdNew = $false
  $script:LauncherMutex = New-Object System.Threading.Mutex($true, "Local\HoriLauncher", [ref]$createdNew)

  if (-not $createdNew) {
    Show-LastKnownState
    exit 2
  }

  $script:MutexAcquired = $true
}

function Release-LauncherMutex {
  if ($script:LauncherMutex) {
    if ($script:MutexAcquired) {
      $script:LauncherMutex.ReleaseMutex()
      $script:MutexAcquired = $false
    }

    $script:LauncherMutex.Dispose()
    $script:LauncherMutex = $null
  }
}

function Resolve-Executable {
  param(
    [string]$Name,
    [string[]]$CandidatePaths,
    [switch]$PreferCmdWrapper
  )

  foreach ($candidate in $CandidatePaths) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }

  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $command) {
    return $null
  }

  $source = $command.Source
  if ($PreferCmdWrapper -and $source -like "*.ps1") {
    $cmdPath = [System.IO.Path]::ChangeExtension($source, ".cmd")
    if (Test-Path $cmdPath) {
      return $cmdPath
    }
  }

  return $source
}

function Get-ExecutableVersion {
  param([string]$Path)

  try {
    return (& $Path --version 2>$null | Select-Object -First 1)
  } catch {
    return $null
  }
}

function Get-LauncherStateObject {
  if (-not (Test-Path $script:StateFile)) {
    return $null
  }

  try {
    return Get-Content $script:StateFile -Raw | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-NgrokConfigPaths {
  return @(
    (Join-Path $env:LOCALAPPDATA "ngrok\ngrok.yml"),
    (Join-Path $env:USERPROFILE ".config\ngrok\ngrok.yml"),
    (Join-Path $env:APPDATA "ngrok\ngrok.yml")
  )
}

function Ensure-NgrokTokenTemplate {
  if (Test-Path $script:NgrokTokenFile) {
    return
  }

  $content = @(
    "# Вставь сюда токен ngrok и сохрани файл.",
    "# Где взять: https://dashboard.ngrok.com/get-started/your-authtoken",
    "# Формат: NGROK_AUTHTOKEN=твоя_длинная_строка",
    "NGROK_AUTHTOKEN="
  ) -join [Environment]::NewLine

  Set-Content -Path $script:NgrokTokenFile -Value $content -Encoding UTF8
}

function Get-NgrokAuthTokenFromFile {
  if (-not (Test-Path $script:NgrokTokenFile)) {
    return $null
  }

  foreach ($line in Get-Content $script:NgrokTokenFile -ErrorAction SilentlyContinue) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#") -or $trimmed.StartsWith(";")) {
      continue
    }

    if ($trimmed -match '^(?:NGROK_AUTHTOKEN|AUTHTOKEN)\s*=\s*(.+)$') {
      $value = $Matches[1].Trim()
      if ($value) {
        return $value
      }
    }

    if ($trimmed -notmatch '=') {
      return $trimmed
    }
  }

  return $null
}

function Get-NgrokAuthToken {
  if ($env:NGROK_AUTHTOKEN) {
    return $env:NGROK_AUTHTOKEN.Trim()
  }

  $fileToken = Get-NgrokAuthTokenFromFile
  if ($fileToken) {
    return $fileToken
  }

  foreach ($path in Get-NgrokConfigPaths) {
    if (-not (Test-Path $path)) {
      continue
    }

    try {
      $content = Get-Content $path -Raw -ErrorAction Stop
      if ($content -match '(?m)^\s*authtoken\s*:\s*(\S+)') {
        return $Matches[1].Trim()
      }
    } catch {}
  }

  return $null
}

function Test-NgrokConfigured {
  return -not [string]::IsNullOrWhiteSpace((Get-NgrokAuthToken))
}

function Get-TailscaleStatusJson {
  param([string]$ExecutablePath)

  try {
    return (& $ExecutablePath status --json | ConvertFrom-Json)
  } catch {
    return $null
  }
}

function Get-TailscaleHostName {
  param([string]$ExecutablePath)

  $status = Get-TailscaleStatusJson -ExecutablePath $ExecutablePath
  if (-not $status) {
    return $null
  }

  $dnsName = $status.Self.DNSName
  if ($dnsName) {
    return $dnsName.TrimEnd(".")
  }

  $certDomain = @($status.CertDomains)[0]
  if ($certDomain) {
    return [string]$certDomain
  }

  return $null
}

function Test-TailscaleLoggedIn {
  param([string]$ExecutablePath)

  $status = Get-TailscaleStatusJson -ExecutablePath $ExecutablePath
  if (-not $status) {
    return $false
  }

  return $status.BackendState -eq "Running" -and -not [string]::IsNullOrWhiteSpace((Get-TailscaleHostName -ExecutablePath $ExecutablePath))
}

function Get-TailscaleFunnelUrl {
  param([string]$ExecutablePath)

  try {
    $funnelStatus = (& $ExecutablePath funnel status 2>&1 | Out-String)
    if ($funnelStatus -match 'https://[a-z0-9.-]+') {
      return $Matches[0]
    }

    if ($funnelStatus -match 'No serve config') {
      return $null
    }
  } catch {
    return $null
  }

  $hostName = Get-TailscaleHostName -ExecutablePath $ExecutablePath
  if ($hostName) {
    return "https://$hostName"
  }

  return $null
}

function Request-TailscaleLogin {
  param([string]$ExecutablePath)

  $loginOutput = ""
  try {
    $loginOutput = (& $ExecutablePath login --qr --timeout 10s 2>&1 | Out-String)
  } catch {
    $loginOutput = ($_ | Out-String)
  }

  $loginUrl = [regex]::Match($loginOutput, 'https://login\.tailscale\.com/a/[A-Za-z0-9]+').Value
  $content = @(
    "Tailscale login",
    ""
  )

  if ($loginUrl) {
    $content += $loginUrl
    $content += ""
    $content += "1. Открой ссылку"
    $content += "2. Войди в Tailscale"
    $content += "3. После входа снова запусти Хори.cmd"
    Set-Content -Path $script:TailscaleLoginFile -Value $content -Encoding UTF8

    try {
      Start-Process $loginUrl | Out-Null
    } catch {}

    Write-WarnLine "Tailscale требует вход. Открой: $script:TailscaleLoginFile"
    return
  }

  $content += "Tailscale не выдал ссылку автоматически."
  $content += ""
  $content += ($loginOutput.Trim())
  Set-Content -Path $script:TailscaleLoginFile -Value $content -Encoding UTF8
  Write-WarnLine "Tailscale требует вход. Открой окно Tailscale или файл: $script:TailscaleLoginFile"
}

function Wait-HttpReady {
  param(
    [Parameter(Mandatory)]
    [string]$Url,
    [int]$Attempts = 30,
    [int]$DelaySeconds = 2,
    [int]$TimeoutSeconds = 5
  )

  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $null = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
      return $true
    } catch {}

    Start-Sleep -Seconds $DelaySeconds
  }

  return $false
}

function Wait-DnsReady {
  param(
    [Parameter(Mandatory)]
    [string]$Url,
    [int]$Attempts = 12,
    [int]$DelaySeconds = 2
  )

  try {
    $hostName = ([uri]$Url).Host
  } catch {
    return $false
  }

  for ($i = 1; $i -le $Attempts; $i++) {
    try {
      $resolved = Resolve-DnsName $hostName -ErrorAction Stop
      if ($resolved) {
        return $true
      }
    } catch {}

    Start-Sleep -Seconds $DelaySeconds
  }

  return $false
}

function Get-ErrorSummary {
  param([System.Management.Automation.ErrorRecord]$ErrorRecord)

  if ($ErrorRecord.ErrorDetails -and $ErrorRecord.ErrorDetails.Message) {
    return $ErrorRecord.ErrorDetails.Message.Trim()
  }

  if ($ErrorRecord.Exception -and $ErrorRecord.Exception.Message) {
    return $ErrorRecord.Exception.Message.Trim()
  }

  return ($ErrorRecord | Out-String).Trim()
}

function Normalize-SubdomainPart {
  param([string]$Value)

  $sourceValue = if ($null -ne $Value) { $Value } else { "" }
  $normalized = $sourceValue.ToLowerInvariant() -replace '[^a-z0-9-]+', '-'
  $normalized = $normalized.Trim('-')

  if (-not $normalized) {
    return "hori"
  }

  return $normalized
}

function Get-LocalTunnelSubdomain {
  if (Test-Path $script:LocalTunnelSubdomainFile) {
    $stored = (Get-Content $script:LocalTunnelSubdomainFile -Raw -ErrorAction SilentlyContinue).Trim().ToLowerInvariant()
    if ($stored -match '^[a-z0-9-]{4,63}$') {
      return $stored
    }
  }

  $computer = Normalize-SubdomainPart -Value $env:COMPUTERNAME
  $user = Normalize-SubdomainPart -Value $env:USERNAME
  $subdomain = "hori-$computer-$user"

  if ($subdomain.Length -gt 63) {
    $subdomain = $subdomain.Substring(0, 63).TrimEnd('-')
  }

  if ($subdomain.Length -lt 4) {
    $subdomain = "hori-$([System.Guid]::NewGuid().ToString('N').Substring(0, 8))"
  }

  Set-Content -Path $script:LocalTunnelSubdomainFile -Value $subdomain -Encoding ASCII
  return $subdomain
}

function Get-TunnelHealth {
  param(
    [Parameter(Mandatory)]
    [string]$TunnelUrl,
    [int]$TimeoutSeconds = 12,
    [switch]$AllowRootFallback
  )

  $status = [ordered]@{
    Healthy = $false
    CheckedUrl = "$TunnelUrl/api/tags"
    Error = ""
  }

  try {
    $response = Invoke-RestMethod -Uri "$TunnelUrl/api/tags" -TimeoutSec $TimeoutSeconds
    $status.Healthy = $true
    $status.Models = @($response.models | ForEach-Object { $_.name })
    return [pscustomobject]$status
  } catch {
    $status.Error = Get-ErrorSummary -ErrorRecord $_
  }

  if ($AllowRootFallback) {
    try {
      $null = Invoke-WebRequest -Uri $TunnelUrl -UseBasicParsing -TimeoutSec ([Math]::Min($TimeoutSeconds, 8))
      $status.Healthy = $true
      $status.CheckedUrl = $TunnelUrl
      $status.Error = ""
      return [pscustomobject]$status
    } catch {
      $status.CheckedUrl = $TunnelUrl
      $status.Error = Get-ErrorSummary -ErrorRecord $_
    }
  }

  return [pscustomobject]$status
}

function Wait-TunnelReady {
  param(
    [Parameter(Mandatory)]
    [string]$TunnelUrl,
    [Parameter(Mandatory)]
    [string]$Provider
  )

  $attempts = if ($Provider -eq "cloudflared") {
    30
  } elseif ($Provider -eq "tailscale") {
    12
  } else {
    20
  }

  $timeoutSeconds = if ($Provider -eq "cloudflared") {
    12
  } elseif ($Provider -eq "tailscale") {
    6
  } else {
    10
  }

  for ($i = 1; $i -le $attempts; $i++) {
    $health = Get-TunnelHealth -TunnelUrl $TunnelUrl -TimeoutSeconds $timeoutSeconds -AllowRootFallback
    if ($health.Healthy) {
      return $health
    }

    Start-Sleep -Seconds 2
  }

  return $null
}

function Get-TunnelUrlFromLog {
  param([string]$LogPath)

  if (-not (Test-Path $LogPath)) {
    return $null
  }

  $content = Get-Content $LogPath -Raw -ErrorAction SilentlyContinue

  if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    return $Matches[0]
  }

  if ($content -match 'https://[a-z0-9-]+\.loca\.lt') {
    return $Matches[0]
  }

  if ($content -match 'https://[a-z0-9.-]+\.lhr\.life') {
    return $Matches[0]
  }

  if ($content -match 'https://[a-z0-9.-]+\.ts\.net') {
    return $Matches[0]
  }

  return $null
}

function Get-NgrokTunnelUrl {
  try {
    $payload = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 3
    $publicUrls = @($payload.tunnels | ForEach-Object { $_.public_url }) | Where-Object { $_ -like "https://*" }
    return $publicUrls | Select-Object -First 1
  } catch {
    return $null
  }
}

function Update-TunnelCommandFile {
  param(
    [string]$TunnelUrl,
    [string]$TunnelProvider
  )

  $content = @(
    "Хори: текущий туннель",
    "",
    "Время: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))",
    "Провайдер: $TunnelProvider",
    "URL: $TunnelUrl",
    "",
    "Команда для Discord:",
    "/bot-ai-url url:$TunnelUrl"
  ) -join [Environment]::NewLine

  Set-Content -Path $script:TunnelCommandFile -Value $content -Encoding UTF8
}

function Show-LogTail {
  param(
    [string]$LogPath,
    [string]$Title,
    [int]$Lines = 18
  )

  if (-not (Test-Path $LogPath)) {
    return
  }

  Write-Host "[i] $Title" -ForegroundColor DarkGray
  Get-Content $LogPath -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "    $_" -ForegroundColor DarkGray
  }
}

function Get-OllamaModels {
  try {
    $payload = Invoke-RestMethod -Uri $script:OllamaTagsUrl -TimeoutSec 5
    return @($payload.models | ForEach-Object { $_.name })
  } catch {
    return @()
  }
}

function Show-DependencySummary {
  param(
    [string]$OllamaPath,
    [string]$TailscalePath,
    [string]$CloudflaredPath,
    [string]$NgrokPath,
    [string]$SshPath,
    [string]$NpxPath
  )

  Write-Section "Зависимости"
  Write-Host ("  Ollama:      {0}" -f $OllamaPath) -ForegroundColor DarkGray
  Write-Host ("  Tailscale:   {0}" -f $(if ($TailscalePath) { $TailscalePath } else { "<не найден>" })) -ForegroundColor DarkGray
  Write-Host ("  Cloudflared: {0}" -f $(if ($CloudflaredPath) { $CloudflaredPath } else { "<не найден>" })) -ForegroundColor DarkGray
  Write-Host ("  Ngrok:       {0}" -f $(if ($NgrokPath) { $NgrokPath } else { "<не найден>" })) -ForegroundColor DarkGray
  Write-Host ("  SSH tunnel:  {0}" -f $(if ($SshPath) { $SshPath } else { "<не найден>" })) -ForegroundColor DarkGray
  Write-Host ("  npx:         {0}" -f $(if ($NpxPath) { $NpxPath } else { "<не найден>" })) -ForegroundColor DarkGray

  $ollamaVersion = Get-ExecutableVersion -Path $OllamaPath
  if ($ollamaVersion) {
    Write-Host ("  Версия Ollama: {0}" -f $ollamaVersion) -ForegroundColor DarkGray
  }

  if ($CloudflaredPath) {
    $cloudflaredVersion = Get-ExecutableVersion -Path $CloudflaredPath
    if ($cloudflaredVersion) {
      Write-Host ("  Версия Cloudflared: {0}" -f $cloudflaredVersion) -ForegroundColor DarkGray
    }
  }

  if ($TailscalePath) {
    $tailscaleVersion = Get-ExecutableVersion -Path $TailscalePath
    if ($tailscaleVersion) {
      Write-Host ("  Версия Tailscale: {0}" -f $tailscaleVersion) -ForegroundColor DarkGray
    }

    if (Test-TailscaleLoggedIn -ExecutablePath $TailscalePath) {
      $tailscaleHost = Get-TailscaleHostName -ExecutablePath $TailscalePath
      Write-Host ("  Tailscale:    готов ({0})" -f $tailscaleHost) -ForegroundColor DarkGray
    } else {
      Write-WarnLine "Tailscale установлен, но не подключён. Логин-файл: $script:TailscaleLoginFile"
    }
  }

  if ($NgrokPath) {
    $ngrokVersion = Get-ExecutableVersion -Path $NgrokPath
    if ($ngrokVersion) {
      Write-Host ("  Версия Ngrok: {0}" -f $ngrokVersion) -ForegroundColor DarkGray
    }

    if (Test-NgrokConfigured) {
      Write-Host "  Ngrok auth:  настроен" -ForegroundColor DarkGray
    } else {
      Ensure-NgrokTokenTemplate
      Write-WarnLine "Ngrok установлен, но не настроен. Вставь токен в файл: $script:NgrokTokenFile"
    }
  }
}

function Stop-LegacyQuickTunnels {
  $legacyProcesses = Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'tunnel' -and $_.CommandLine -match 'localhost:11434' }

  foreach ($legacy in $legacyProcesses) {
    Write-WarnLine "Найден старый quick tunnel от прошлого запуска (PID $($legacy.ProcessId)). Останавливаю."
    Stop-Process -Id $legacy.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-LegacySshTunnels {
  $legacyProcesses = Get-CimInstance Win32_Process -Filter "Name = 'ssh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'localhost.run' -and $_.CommandLine -match '11434' }

  foreach ($legacy in $legacyProcesses) {
    Write-WarnLine "Найден старый localhost.run туннель (PID $($legacy.ProcessId)). Останавливаю."
    Stop-Process -Id $legacy.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

function Stop-LegacyTailscaleFunnel {
  param([string]$TailscalePath)

  if (-not $TailscalePath) {
    return
  }

  $state = Get-LauncherStateObject
  if (-not $state -or $state.tunnelProvider -ne "tailscale") {
    return
  }

  try {
    Write-WarnLine "Сбрасываю предыдущий Tailscale Funnel от прошлого запуска."
    & $TailscalePath funnel reset *> $null
  } catch {}
}

function Ensure-OllamaReady {
  param([string]$OllamaPath)

  $env:OLLAMA_ORIGINS = "*"
  $env:OLLAMA_HOST = "0.0.0.0:$OllamaPort"

  Write-Section "Ollama"

  if (Wait-HttpReady -Url $script:OllamaTagsUrl -Attempts 2 -DelaySeconds 1 -TimeoutSeconds 2) {
    $models = Get-OllamaModels
    $modelText = if ($models.Count) { $models -join ", " } else { "список моделей не получен" }
    Write-Ok "Ollama уже отвечает на $script:OllamaBaseUrl"
    Write-Host ("  Модели: {0}" -f $modelText) -ForegroundColor DarkGray
    return [pscustomobject]@{
      StartedHere = $false
      Models = $models
    }
  }

  $stalePid = Read-PidFile -Path $script:OllamaPidFile
  if ($stalePid) {
    Stop-ProcessTreeSafe -ProcessId $stalePid -Label "старую Ollama"
    Remove-FileIfExists -Path $script:OllamaPidFile
  }

  Remove-FileIfExists -Path $script:OllamaStdOutLog
  Remove-FileIfExists -Path $script:OllamaStdErrLog

  Write-Step "Запускаю Ollama serve..."
  $script:ManagedOllamaProcess = Start-Process -FilePath $OllamaPath -ArgumentList "serve" `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $script:OllamaStdOutLog `
    -RedirectStandardError $script:OllamaStdErrLog

  $script:StartedOllamaHere = $true
  Write-PidFile -Path $script:OllamaPidFile -ProcessId $script:ManagedOllamaProcess.Id

  if (-not (Wait-HttpReady -Url $script:OllamaTagsUrl -Attempts 25 -DelaySeconds 1 -TimeoutSeconds 2)) {
    Write-Fail "Ollama не поднялась на $script:OllamaTagsUrl"
    Show-LogTail -LogPath $script:OllamaStdErrLog -Title "ollama stderr"
    Show-LogTail -LogPath $script:OllamaStdOutLog -Title "ollama stdout"
    throw "Ollama start failed"
  }

  $models = Get-OllamaModels
  $modelText = if ($models.Count) { $models -join ", " } else { "список моделей не получен" }
  Write-Ok "Ollama запущена"
  Write-Host ("  Локальный URL: {0}" -f $script:OllamaBaseUrl) -ForegroundColor DarkGray
  Write-Host ("  Модели:        {0}" -f $modelText) -ForegroundColor DarkGray

  return [pscustomobject]@{
    StartedHere = $true
    Models = $models
  }
}

function Restore-EnvValue {
  param(
    [string]$Name,
    [AllowNull()]
    [string]$Value
  )

  if ($null -eq $Value) {
    Remove-Item "Env:$Name" -ErrorAction SilentlyContinue
    return
  }

  Set-Item "Env:$Name" -Value $Value
}

function Stop-TailscaleOllamaProxy {
  $proxyPid = Read-PidFile -Path $script:TailscaleProxyPidFile
  if ($proxyPid) {
    Stop-ProcessTreeSafe -ProcessId $proxyPid -Label "локальный Ollama proxy для Tailscale"
  } elseif ($script:ManagedTailscaleProxyProcess) {
    Stop-ProcessTreeSafe -ProcessId $script:ManagedTailscaleProxyProcess.Id -Label "локальный Ollama proxy для Tailscale"
  }

  $script:ManagedTailscaleProxyProcess = $null
  Remove-FileIfExists -Path $script:TailscaleProxyPidFile
}

function Ensure-TailscaleOllamaProxyReady {
  $nodePath = Resolve-Executable "node" @(
    "C:\Program Files\nodejs\node.exe",
    "$env:ProgramFiles\nodejs\node.exe"
  )

  if (-not $nodePath) {
    Write-WarnLine "Tailscale proxy пропускаю: node.exe не найден."
    return $null
  }

  if (-not (Test-Path $script:TailscaleProxyScript)) {
    Write-WarnLine "Tailscale proxy пропускаю: не найден $script:TailscaleProxyScript"
    return $null
  }

  Stop-TailscaleOllamaProxy
  Remove-FileIfExists -Path $script:TailscaleProxyStdOutLog
  Remove-FileIfExists -Path $script:TailscaleProxyStdErrLog

  $previousProxyHost = $env:HORI_PROXY_HOST
  $previousProxyPort = $env:HORI_PROXY_PORT
  $previousOllamaHost = $env:HORI_OLLAMA_HOST
  $previousOllamaPort = $env:HORI_OLLAMA_PORT

  try {
    $env:HORI_PROXY_HOST = "127.0.0.1"
    $env:HORI_PROXY_PORT = "$($script:TailscaleProxyPort)"
    $env:HORI_OLLAMA_HOST = "127.0.0.1"
    $env:HORI_OLLAMA_PORT = "$OllamaPort"

    Write-Step "Запускаю локальный proxy для Tailscale на $script:TailscaleProxyUrl..."
    $proxyProcess = Start-Process -FilePath $nodePath -ArgumentList @($script:TailscaleProxyScript) `
      -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput $script:TailscaleProxyStdOutLog `
      -RedirectStandardError $script:TailscaleProxyStdErrLog

    $script:ManagedTailscaleProxyProcess = $proxyProcess
    Write-PidFile -Path $script:TailscaleProxyPidFile -ProcessId $proxyProcess.Id
  } finally {
    Restore-EnvValue -Name "HORI_PROXY_HOST" -Value $previousProxyHost
    Restore-EnvValue -Name "HORI_PROXY_PORT" -Value $previousProxyPort
    Restore-EnvValue -Name "HORI_OLLAMA_HOST" -Value $previousOllamaHost
    Restore-EnvValue -Name "HORI_OLLAMA_PORT" -Value $previousOllamaPort
  }

  if (-not (Wait-HttpReady -Url "$($script:TailscaleProxyUrl)/api/tags" -Attempts 15 -DelaySeconds 1 -TimeoutSeconds 3)) {
    Write-WarnLine "Локальный Tailscale proxy не отвечает на /api/tags"
    Show-LogTail -LogPath $script:TailscaleProxyStdOutLog -Title "tailscale proxy stdout"
    Show-LogTail -LogPath $script:TailscaleProxyStdErrLog -Title "tailscale proxy stderr"
    Stop-TailscaleOllamaProxy
    return $null
  }

  Write-Ok "Локальный Tailscale proxy готов"
  return [pscustomobject]@{
    Url = $script:TailscaleProxyUrl
    Port = $script:TailscaleProxyPort
    Process = $script:ManagedTailscaleProxyProcess
    LogPath = $script:TailscaleProxyStdErrLog
  }
}

function Stop-PreviousManagedTunnel {
  $tunnelPid = Read-PidFile -Path $script:TunnelPidFile
  if ($tunnelPid) {
    Stop-ProcessTreeSafe -ProcessId $tunnelPid -Label "предыдущий туннель"
    Remove-FileIfExists -Path $script:TunnelPidFile
  }
}

function Start-TunnelProvider {
  param(
    [ValidateSet("tailscale", "cloudflared", "ngrok", "localhostrun", "localtunnel")]
    [string]$Provider,
    [string]$ExecutablePath
  )

  $logPath = if ($Provider -eq "tailscale") {
    $script:TailscaleLog
  } elseif ($Provider -eq "cloudflared") {
    $script:CloudflaredLog
  } elseif ($Provider -eq "ngrok") {
    $script:NgrokLog
  } elseif ($Provider -eq "localhostrun") {
    $script:LocalhostRunLog
  } else {
    $script:LocalTunnelLog
  }
  Remove-FileIfExists -Path $logPath
  if ($Provider -eq "localtunnel") {
    Remove-FileIfExists -Path $script:LocalTunnelErrLog
  } elseif ($Provider -eq "ngrok") {
    Remove-FileIfExists -Path $script:NgrokErrLog
  } elseif ($Provider -eq "localhostrun") {
    Remove-FileIfExists -Path $script:LocalhostRunErrLog
  }

  Write-Step "Запускаю туннель через $Provider..."

  if ($Provider -eq "tailscale") {
    Remove-FileIfExists -Path $logPath

    if (-not (Test-TailscaleLoggedIn -ExecutablePath $ExecutablePath)) {
      Request-TailscaleLogin -ExecutablePath $ExecutablePath
      return $null
    }

    $proxyInfo = Ensure-TailscaleOllamaProxyReady
    if (-not $proxyInfo) {
      return $null
    }

    try {
      $resetOutLog = Join-Path $script:LogsRoot "tailscale-funnel-reset.out.log"
      $resetErrLog = Join-Path $script:LogsRoot "tailscale-funnel-reset.err.log"
      Remove-FileIfExists -Path $resetOutLog
      Remove-FileIfExists -Path $resetErrLog

      $resetProcess = Start-Process -FilePath $ExecutablePath -ArgumentList @("funnel", "reset") `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $resetOutLog `
        -RedirectStandardError $resetErrLog
      $resetExited = $resetProcess.WaitForExit(10000)
      if (-not $resetExited) {
        Stop-Process -Id $resetProcess.Id -Force -ErrorAction SilentlyContinue
        "tailscale funnel reset timed out" | Add-Content -Path $logPath -Encoding UTF8
      }

      if (Test-Path $resetOutLog) {
        Get-Content $resetOutLog -Raw -ErrorAction SilentlyContinue | Add-Content -Path $logPath -Encoding UTF8
      }

      if (Test-Path $resetErrLog) {
        Get-Content $resetErrLog -Raw -ErrorAction SilentlyContinue | Add-Content -Path $logPath -Encoding UTF8
      }
    } catch {
      "tailscale funnel reset failed: $(Get-ErrorSummary -ErrorRecord $_)" | Add-Content -Path $logPath -Encoding UTF8
    }

    $startOutLog = Join-Path $script:LogsRoot "tailscale-funnel-start.out.log"
    $startErrLog = Join-Path $script:LogsRoot "tailscale-funnel-start.err.log"
    Remove-FileIfExists -Path $startOutLog
    Remove-FileIfExists -Path $startErrLog

    $startProcess = Start-Process -FilePath $ExecutablePath -ArgumentList @("funnel", "--bg", "--yes", "$($proxyInfo.Port)") `
      -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput $startOutLog `
      -RedirectStandardError $startErrLog
    $startExited = $startProcess.WaitForExit(25000)

    if (-not $startExited) {
      Stop-Process -Id $startProcess.Id -Force -ErrorAction SilentlyContinue
      "tailscale funnel start timed out. Funnel may require browser approval." | Add-Content -Path $logPath -Encoding UTF8
    }

    if (Test-Path $startOutLog) {
      Get-Content $startOutLog -Raw -ErrorAction SilentlyContinue | Add-Content -Path $logPath -Encoding UTF8
    }

    if (Test-Path $startErrLog) {
      Get-Content $startErrLog -Raw -ErrorAction SilentlyContinue | Add-Content -Path $logPath -Encoding UTF8
    }

    $tailscaleStartLog = if (Test-Path $logPath) { Get-Content $logPath -Raw -ErrorAction SilentlyContinue } else { "" }
    $funnelEnableUrl = [regex]::Match($tailscaleStartLog, 'https://login\.tailscale\.com/f/funnel\?node=[A-Za-z0-9]+').Value
    $serveEnableUrl = [regex]::Match($tailscaleStartLog, 'https://login\.tailscale\.com/f/serve\?node=[A-Za-z0-9]+').Value
    if ($funnelEnableUrl -or $serveEnableUrl) {
      $content = @(
        "Tailscale Funnel",
        "",
        "Включи доступы для этого компьютера:"
      ) -join [Environment]::NewLine
      if ($funnelEnableUrl) {
        $content += [Environment]::NewLine + [Environment]::NewLine + "Funnel:" + [Environment]::NewLine + $funnelEnableUrl
      }
      if ($serveEnableUrl) {
        $content += [Environment]::NewLine + [Environment]::NewLine + "Serve:" + [Environment]::NewLine + $serveEnableUrl
      }
      $content += [Environment]::NewLine + [Environment]::NewLine + "После включения снова запусти Хори.cmd."
      Set-Content -Path $script:TailscaleLoginFile -Value $content -Encoding UTF8
      try {
        if ($funnelEnableUrl) {
          Start-Process $funnelEnableUrl | Out-Null
        }
        if ($serveEnableUrl) {
          Start-Process $serveEnableUrl | Out-Null
        }
      } catch {}
      Write-WarnLine "Tailscale Funnel ещё не включён. Открыл ссылку и записал её в: $script:TailscaleLoginFile"
      Stop-TailscaleOllamaProxy
      return $null
    }

    $url = $null
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Seconds 1
      $url = Get-TailscaleFunnelUrl -ExecutablePath $ExecutablePath
      if ($url) {
        break
      }
    }

    if (-not $url) {
      Write-WarnLine "Tailscale не выдал публичный URL"
      Show-LogTail -LogPath $logPath -Title "tailscale log"
      try {
        & $ExecutablePath funnel status | Out-Null
      } catch {}
      Stop-TailscaleOllamaProxy
      return $null
    }

    $health = Wait-TunnelReady -TunnelUrl $url -Provider $Provider
    if (-not $health) {
      Write-WarnLine "Tailscale дал URL, но локальная проверка с этого ПК пока не отвечает: $url"
      Write-WarnLine "Funnel подтверждён самим Tailscale, поэтому оставляю его основным и не сбрасываю."
      Show-LogTail -LogPath $logPath -Title "tailscale log"
      $health = [pscustomobject]@{
        Healthy = $true
        CheckedUrl = $url
        Error = "Local health check failed; trusted tailscale funnel status."
      }
    }

    return [pscustomobject]@{
      Provider = $Provider
      Url = $url
      Process = $null
      LogPath = $logPath
      Health = $health
    }
  }

  $launchAttempts = @()
  if ($Provider -eq "cloudflared") {
    $launchAttempts += [pscustomobject]@{
      Label = "default"
      Args = @("tunnel", "--url", $script:OllamaBaseUrl, "--logfile", $logPath)
      PreferredUrl = $null
    }
  } elseif ($Provider -eq "ngrok") {
    $ngrokAuthToken = Get-NgrokAuthToken
    if (-not $ngrokAuthToken) {
      Write-WarnLine "Ngrok пропускаю: нет authtoken."
      return $null
    }

    $launchAttempts += [pscustomobject]@{
      Label = "default"
      Args = @("http", $script:OllamaBaseUrl, "--authtoken", $ngrokAuthToken, "--log", "stdout", "--log-format", "json")
      PreferredUrl = $null
    }
  } elseif ($Provider -eq "localhostrun") {
    $launchAttempts += [pscustomobject]@{
      Label = "anonymous"
      Args = @("-T", "-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=30", "-o", "ExitOnForwardFailure=yes", "-R", "80:localhost:$OllamaPort", "nokey@localhost.run")
      PreferredUrl = $null
    }
  } else {
    $preferredSubdomain = Get-LocalTunnelSubdomain
    $launchAttempts += [pscustomobject]@{
      Label = "preferred-subdomain"
      Args = @("-y", "localtunnel", "--port", "$OllamaPort", "--subdomain", $preferredSubdomain)
      PreferredUrl = "https://$preferredSubdomain.loca.lt"
    }
    $launchAttempts += [pscustomobject]@{
      Label = "random-subdomain"
      Args = @("-y", "localtunnel", "--port", "$OllamaPort")
      PreferredUrl = $null
    }
  }

  foreach ($launchAttempt in $launchAttempts) {
    if ($Provider -eq "localtunnel" -and $launchAttempt.Label -eq "preferred-subdomain") {
      Write-Host ("    Пробую сохранить стабильный адрес: {0}" -f $launchAttempt.PreferredUrl) -ForegroundColor DarkGray
    }

    if ($Provider -eq "localtunnel") {
      $process = Start-Process -FilePath $ExecutablePath `
        -ArgumentList $launchAttempt.Args `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logPath `
        -RedirectStandardError $script:LocalTunnelErrLog
    } elseif ($Provider -eq "ngrok") {
      $process = Start-Process -FilePath $ExecutablePath `
        -ArgumentList $launchAttempt.Args `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logPath `
        -RedirectStandardError $script:NgrokErrLog
    } elseif ($Provider -eq "localhostrun") {
      $process = Start-Process -FilePath $ExecutablePath `
        -ArgumentList $launchAttempt.Args `
        -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput $logPath `
        -RedirectStandardError $script:LocalhostRunErrLog
    } else {
      $process = Start-Process -FilePath $ExecutablePath `
        -ArgumentList $launchAttempt.Args `
        -PassThru -WindowStyle Hidden
    }

    $url = $null
    for ($i = 0; $i -lt 45; $i++) {
      Start-Sleep -Seconds 1
      if ($process.HasExited) {
        break
      }

      $url = if ($Provider -eq "ngrok") { Get-NgrokTunnelUrl } else { Get-TunnelUrlFromLog -LogPath $logPath }
      if ($url) {
        break
      }
    }

    if (-not $url -and $launchAttempt.PreferredUrl -and -not $process.HasExited) {
      $url = $launchAttempt.PreferredUrl
    }

    if (-not $url) {
      Write-WarnLine "$Provider не выдал URL"
      Show-LogTail -LogPath $logPath -Title "$Provider log"
      if ($Provider -eq "localtunnel") {
        Show-LogTail -LogPath $script:LocalTunnelErrLog -Title "$Provider stderr"
      } elseif ($Provider -eq "ngrok") {
        Show-LogTail -LogPath $script:NgrokErrLog -Title "$Provider stderr"
      } elseif ($Provider -eq "localhostrun") {
        Show-LogTail -LogPath $script:LocalhostRunErrLog -Title "$Provider stderr"
      }
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      continue
    }

    if ($Provider -eq "cloudflared" -and -not (Wait-DnsReady -Url $url -Attempts 30 -DelaySeconds 2)) {
      Write-WarnLine "Cloudflare URL не резолвится через DNS: $url"
      Show-LogTail -LogPath $logPath -Title "$Provider log"
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      continue
    }

    $health = Wait-TunnelReady -TunnelUrl $url -Provider $Provider
    if (-not $health) {
      Write-WarnLine "$Provider дал URL, но он не отвечает: $url"
      Show-LogTail -LogPath $logPath -Title "$Provider log"
      if ($Provider -eq "localtunnel") {
        Show-LogTail -LogPath $script:LocalTunnelErrLog -Title "$Provider stderr"
      } elseif ($Provider -eq "ngrok") {
        Show-LogTail -LogPath $script:NgrokErrLog -Title "$Provider stderr"
      } elseif ($Provider -eq "localhostrun") {
        Show-LogTail -LogPath $script:LocalhostRunErrLog -Title "$Provider stderr"
      }
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      continue
    }

    Write-PidFile -Path $script:TunnelPidFile -ProcessId $process.Id

    return [pscustomobject]@{
      Provider = $Provider
      Url = $url
      Process = $process
      LogPath = $logPath
      Health = $health
    }
  }

  return $null
}

function Ensure-TunnelReady {
  param(
    [string]$TailscalePath,
    [string]$CloudflaredPath,
    [string]$NgrokPath,
    [string]$SshPath,
    [string]$NpxPath
  )

  Write-Section "Туннель"

  Stop-PreviousManagedTunnel
  Stop-LegacyTailscaleFunnel -TailscalePath $TailscalePath
  Stop-LegacyQuickTunnels
  Stop-LegacySshTunnels

  $providers = @()
  if ($TailscalePath) {
    $providers += [pscustomobject]@{ Name = "tailscale"; Path = $TailscalePath }
  }
  if ($NgrokPath) {
    $providers += [pscustomobject]@{ Name = "ngrok"; Path = $NgrokPath }
  }
  if ($SshPath) {
    $providers += [pscustomobject]@{ Name = "localhostrun"; Path = $SshPath }
  }
  if ($CloudflaredPath) {
    $providers += [pscustomobject]@{ Name = "cloudflared"; Path = $CloudflaredPath }
  }
  if ($NpxPath) {
    $providers += [pscustomobject]@{ Name = "localtunnel"; Path = $NpxPath }
  }

  foreach ($provider in $providers) {
    $result = Start-TunnelProvider -Provider $provider.Name -ExecutablePath $provider.Path
    if ($result) {
      $script:ManagedTunnelProcess = $result.Process
      $script:ManagedTunnelProvider = $result.Provider
      Save-LauncherState -Status "ready" -TunnelUrl $result.Url -TunnelProvider $result.Provider -TunnelLog $result.LogPath
      Write-Ok "Туннель готов через $($result.Provider)"
      Write-Host ("  URL:  {0}" -f $result.Url) -ForegroundColor DarkGray
      Write-Host ("  Лог:  {0}" -f $result.LogPath) -ForegroundColor DarkGray
      return $result
    }
  }

  throw "No tunnel provider succeeded"
}

function Copy-TunnelCommand {
  param([string]$TunnelUrl)

  if ($NoClipboard) {
    return
  }

  $command = "/bot-ai-url url:$TunnelUrl"

  try {
    Set-Clipboard -Value $command
    Write-Ok "Команда для Discord скопирована в буфер обмена."
  } catch {
    Write-WarnLine "Не удалось скопировать команду в буфер обмена."
  }
}

function Show-ReadySummary {
  param(
    [object]$OllamaInfo,
    [object]$TunnelInfo
  )

  Write-Section "Готово"
  Write-Host "  Ollama:  $script:OllamaBaseUrl" -ForegroundColor White
  Write-Host "  Tunnel:  $($TunnelInfo.Url)" -ForegroundColor Yellow
  Write-Host "  Provider: $($TunnelInfo.Provider)" -ForegroundColor DarkGray
  Write-Host ""
  Write-Host "  В Discord введи:" -ForegroundColor White
  Write-Host "  /bot-ai-url url:$($TunnelInfo.Url)" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "  Worker подтянет URL из базы сам, если в Railway не задан статический AI_URL." -ForegroundColor DarkGray
  Write-Host "  Ctrl+C чтобы остановить управляемый туннель." -ForegroundColor DarkGray

  if ($OllamaInfo.Models.Count) {
    Write-Host ""
    Write-Host ("  Модели Ollama: {0}" -f ($OllamaInfo.Models -join ", ")) -ForegroundColor DarkGray
  }

  Write-Host ""
  Write-Host ("  Логи Ollama:  {0}" -f $script:OllamaStdErrLog) -ForegroundColor DarkGray
  Write-Host ("  Логи Tunnel:  {0}" -f $TunnelInfo.LogPath) -ForegroundColor DarkGray

  Update-TunnelCommandFile -TunnelUrl $TunnelInfo.Url -TunnelProvider $TunnelInfo.Provider
  Copy-TunnelCommand -TunnelUrl $TunnelInfo.Url
}

function Cleanup-Launcher {
  if ($script:ManagedTunnelProvider -eq "tailscale") {
    try {
      & "C:\Program Files\Tailscale\tailscale.exe" funnel reset *> $null
    } catch {}
  } elseif ($script:ManagedTunnelProcess) {
    & taskkill /PID $script:ManagedTunnelProcess.Id /T /F *> $null
    $script:ManagedTunnelProcess = $null
  }

  Stop-TailscaleOllamaProxy

  Remove-FileIfExists -Path $script:TunnelPidFile
  $script:ManagedTunnelProvider = ""

  if ($script:StartedOllamaHere -and $script:ManagedOllamaProcess) {
    & taskkill /PID $script:ManagedOllamaProcess.Id /T /F *> $null
    $script:ManagedOllamaProcess = $null
  }

  if ($script:StartedOllamaHere) {
    Remove-FileIfExists -Path $script:OllamaPidFile
  }

  Save-LauncherState -Status "stopped"
  Release-LauncherMutex
}

function Invoke-MonitorLoop {
  param(
    [string]$OllamaPath,
    [string]$TailscalePath,
    [string]$CloudflaredPath,
    [string]$NgrokPath,
    [string]$SshPath,
    [string]$NpxPath,
    [object]$CurrentOllamaInfo,
    [object]$CurrentTunnelInfo
  )

  $ollamaInfo = $CurrentOllamaInfo
  $tunnelInfo = $CurrentTunnelInfo
  $secondsSinceTunnelHealthCheck = 0
  $consecutiveTunnelHealthFailures = 0

  while ($true) {
    Start-Sleep -Seconds 5
    $secondsSinceTunnelHealthCheck += 5

    $tunnelExited = $script:ManagedTunnelProcess -and $script:ManagedTunnelProcess.HasExited
    $ollamaExited = $script:StartedOllamaHere -and $script:ManagedOllamaProcess -and $script:ManagedOllamaProcess.HasExited

    if ($ollamaExited) {
      Write-WarnLine "Ollama завершилась. Пробую перезапустить..."
      $ollamaInfo = Ensure-OllamaReady -OllamaPath $OllamaPath
      $tunnelInfo = Ensure-TunnelReady -TailscalePath $TailscalePath -CloudflaredPath $CloudflaredPath -NgrokPath $NgrokPath -SshPath $SshPath -NpxPath $NpxPath
      $secondsSinceTunnelHealthCheck = 0
      $consecutiveTunnelHealthFailures = 0
      Show-ReadySummary -OllamaInfo $ollamaInfo -TunnelInfo $tunnelInfo
      continue
    }

    if ($tunnelExited) {
      Write-WarnLine "Туннель завершился. Пробую поднять новый..."
      $oldTunnelUrl = if ($tunnelInfo) { $tunnelInfo.Url } else { $null }
      $tunnelInfo = Ensure-TunnelReady -TailscalePath $TailscalePath -CloudflaredPath $CloudflaredPath -NgrokPath $NgrokPath -SshPath $SshPath -NpxPath $NpxPath
      $secondsSinceTunnelHealthCheck = 0
      $consecutiveTunnelHealthFailures = 0
      Show-ReadySummary -OllamaInfo $ollamaInfo -TunnelInfo $tunnelInfo
      if ($oldTunnelUrl -and $oldTunnelUrl -ne $tunnelInfo.Url) {
        Write-WarnLine "URL изменился. В Discord снова введи: /bot-ai-url url:$($tunnelInfo.Url)"
      }
      continue
    }

    if ($tunnelInfo -and $secondsSinceTunnelHealthCheck -ge $script:TunnelHealthCheckIntervalSeconds) {
      $secondsSinceTunnelHealthCheck = 0
      $health = Get-TunnelHealth -TunnelUrl $tunnelInfo.Url -TimeoutSeconds $script:TunnelHealthTimeoutSeconds

      if ($health.Healthy) {
        $consecutiveTunnelHealthFailures = 0
        continue
      }

      $consecutiveTunnelHealthFailures += 1
      Write-WarnLine "Туннель не отвечает ($consecutiveTunnelHealthFailures/$script:TunnelHealthFailuresBeforeRestart): $($health.Error)"

      if ($consecutiveTunnelHealthFailures -lt $script:TunnelHealthFailuresBeforeRestart) {
        continue
      }

      Write-WarnLine "Туннель снаружи умер. Поднимаю новый..."
      $oldTunnelUrl = $tunnelInfo.Url
      $tunnelInfo = Ensure-TunnelReady -TailscalePath $TailscalePath -CloudflaredPath $CloudflaredPath -NgrokPath $NgrokPath -SshPath $SshPath -NpxPath $NpxPath
      $secondsSinceTunnelHealthCheck = 0
      $consecutiveTunnelHealthFailures = 0
      Show-ReadySummary -OllamaInfo $ollamaInfo -TunnelInfo $tunnelInfo
      if ($oldTunnelUrl -ne $tunnelInfo.Url) {
        Write-WarnLine "URL изменился. В Discord снова введи: /bot-ai-url url:$($tunnelInfo.Url)"
      }
    }
  }
}

Ensure-Directory -Path $script:LauncherRoot
Ensure-Directory -Path $script:LogsRoot
Ensure-Directory -Path $script:StateRoot

Acquire-LauncherMutex
Save-LauncherState -Status "starting"

$oldWindowTitle = $Host.UI.RawUI.WindowTitle
$Host.UI.RawUI.WindowTitle = $script:LauncherName

try {
  Write-Banner

  $ollama = Resolve-Executable "ollama" @(
    "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
    "C:\Program Files\Ollama\ollama.exe"
  )
  if (-not $ollama) {
    Write-Fail "ollama не найден. Установи: https://ollama.com/download"
    exit 1
  }

  $cloudflared = Resolve-Executable "cloudflared" @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
  )
  $tailscale = Resolve-Executable "tailscale" @(
    "C:\Program Files\Tailscale\tailscale.exe"
  )
  $ngrok = Resolve-Executable "ngrok" @(
    "$env:LOCALAPPDATA\ngrok\ngrok.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe",
    "$env:ProgramFiles\ngrok\ngrok.exe"
  )
  $ssh = Resolve-Executable "ssh" @(
    "C:\WINDOWS\System32\OpenSSH\ssh.exe"
  )
  $npx = Resolve-Executable "npx" @(
    "C:\Program Files\nodejs\npx.cmd",
    "$env:ProgramFiles\nodejs\npx.cmd"
  ) -PreferCmdWrapper

  if (-not $tailscale -and -not $cloudflared -and -not $ngrok -and -not $ssh -and -not $npx) {
    Write-Fail "Не найден ни tailscale, ни cloudflared, ни ngrok, ни ssh localhost.run, ни npx/localtunnel. Установи хотя бы один туннельный клиент."
    exit 1
  }

  Show-DependencySummary -OllamaPath $ollama -TailscalePath $tailscale -CloudflaredPath $cloudflared -NgrokPath $ngrok -SshPath $ssh -NpxPath $npx

  $ollamaInfo = Ensure-OllamaReady -OllamaPath $ollama
  $tunnelInfo = Ensure-TunnelReady -TailscalePath $tailscale -CloudflaredPath $cloudflared -NgrokPath $ngrok -SshPath $ssh -NpxPath $npx
  Show-ReadySummary -OllamaInfo $ollamaInfo -TunnelInfo $tunnelInfo

  if ($ExitAfterReady) {
    Write-Host ""
    Write-Host "Режим проверки: успешный старт подтверждён, завершаюсь." -ForegroundColor DarkGray
    exit 0
  }

  Invoke-MonitorLoop -OllamaPath $ollama -TailscalePath $tailscale -CloudflaredPath $cloudflared -NgrokPath $ngrok -SshPath $ssh -NpxPath $npx -CurrentOllamaInfo $ollamaInfo -CurrentTunnelInfo $tunnelInfo
} finally {
  $Host.UI.RawUI.WindowTitle = $oldWindowTitle
  Cleanup-Launcher
}
