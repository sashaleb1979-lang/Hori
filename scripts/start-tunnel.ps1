# start-tunnel.ps1 — Запуск Ollama + Cloudflare Tunnel в одну команду
# Выводит URL туннеля, который можно вставить командой /bot-ai-url в Discord

$ErrorActionPreference = "Stop"

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

  return $null
}

function Show-LogTail {
  param(
    [string]$LogPath,
    [string]$Title,
    [int]$Lines = 12
  )

  if (-not (Test-Path $LogPath)) {
    return
  }

  Write-Host "[i] $Title" -ForegroundColor DarkGray
  Get-Content $LogPath -Tail $Lines -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "    $_" -ForegroundColor DarkGray
  }
}

function Find-Executable {
  param([string]$Name, [string[]]$Paths)

  foreach ($p in $Paths) {
    if (Test-Path $p) { return $p }
  }

  $found = (Get-Command $Name -ErrorAction SilentlyContinue).Source
  if ($found) { return $found }

  return $null
}

# --- 0. Найти зависимости ---
$cloudflared = Find-Executable "cloudflared" @(
  "C:\Program Files (x86)\cloudflared\cloudflared.exe",
  "C:\Program Files\cloudflared\cloudflared.exe",
  "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
)

if (-not $cloudflared) {
  Write-Host "[!] cloudflared не найден. Установи: winget install cloudflare.cloudflared" -ForegroundColor Red
  exit 1
}

$ollama = Find-Executable "ollama" @(
  "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe",
  "C:\Program Files\Ollama\ollama.exe"
)

if (-not $ollama) {
  Write-Host "[!] ollama не найден. Установи: https://ollama.com/download" -ForegroundColor Red
  exit 1
}

$npx = Find-Executable "npx" @()

# --- 1. Убить старые процессы ---
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

# --- 2. Проверить или запустить Ollama ---
$env:OLLAMA_ORIGINS = "*"
$env:OLLAMA_HOST = "0.0.0.0:11434"

$ollamaHealthUrl = "http://localhost:11434/api/tags"
$ollamaStdOutLog = Join-Path $env:TEMP "ollama-serve.out.log"
$ollamaStdErrLog = Join-Path $env:TEMP "ollama-serve.err.log"
$ollamaProcess = $null

if (Wait-HttpReady -Url $ollamaHealthUrl -Attempts 2 -DelaySeconds 1 -TimeoutSeconds 2) {
  Write-Host "[+] Ollama уже отвечает на localhost:11434" -ForegroundColor Green
} else {
  Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  if (Test-Path $ollamaStdOutLog) { Remove-Item $ollamaStdOutLog -Force }
  if (Test-Path $ollamaStdErrLog) { Remove-Item $ollamaStdErrLog -Force }

  Write-Host "[*] Запускаю Ollama..." -ForegroundColor Cyan
  $ollamaProcess = Start-Process -FilePath $ollama -ArgumentList "serve" `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput $ollamaStdOutLog `
    -RedirectStandardError $ollamaStdErrLog

  $ready = Wait-HttpReady -Url $ollamaHealthUrl -Attempts 20 -DelaySeconds 1 -TimeoutSeconds 2

  if (-not $ready) {
    Write-Host "[!] Ollama не отвечает на localhost:11434/api/tags" -ForegroundColor Red
    Show-LogTail -LogPath $ollamaStdErrLog -Title "ollama stderr"
    Show-LogTail -LogPath $ollamaStdOutLog -Title "ollama stdout"
    exit 1
  }

  Write-Host "[+] Ollama запущена" -ForegroundColor Green
}

# --- 3. Запустить Cloudflare Tunnel ---
Write-Host "[*] Запускаю туннель..." -ForegroundColor Cyan

$tunnelLogFile = Join-Path $env:TEMP "cloudflared-tunnel.log"
if (Test-Path $tunnelLogFile) { Remove-Item $tunnelLogFile -Force }

$tunnelProcess = Start-Process -FilePath $cloudflared `
  -ArgumentList "tunnel","--url","http://localhost:11434","--logfile",$tunnelLogFile `
  -PassThru -WindowStyle Hidden

# Подождать пока URL появится в логе
$tunnelUrl = $null
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  if ($tunnelProcess.HasExited) {
    break
  }

  $tunnelUrl = Get-TunnelUrlFromLog -LogPath $tunnelLogFile
  if ($tunnelUrl) {
    break
  }
}

if (-not $tunnelUrl) {
  Write-Host "[!] Не удалось получить URL cloudflared tunnel" -ForegroundColor Red
  Show-LogTail -LogPath $tunnelLogFile -Title "cloudflared log"

  if ($npx) {
    Write-Host "[*] Пробую fallback через localtunnel..." -ForegroundColor Yellow
    $localTunnelLogFile = Join-Path $env:TEMP "localtunnel.log"
    if (Test-Path $localTunnelLogFile) { Remove-Item $localTunnelLogFile -Force }

    $tunnelProcess = Start-Process -FilePath $npx `
      -ArgumentList "-y","localtunnel","--port","11434" `
      -PassThru -WindowStyle Hidden `
      -RedirectStandardOutput $localTunnelLogFile `
      -RedirectStandardError $localTunnelLogFile

    $tunnelLogFile = $localTunnelLogFile
    for ($i = 0; $i -lt 30; $i++) {
      Start-Sleep -Seconds 1
      if ($tunnelProcess.HasExited) {
        break
      }

      $tunnelUrl = Get-TunnelUrlFromLog -LogPath $tunnelLogFile
      if ($tunnelUrl) {
        break
      }
    }

    if (-not $tunnelUrl) {
      Write-Host "[!] Localtunnel тоже не дал URL" -ForegroundColor Red
      Show-LogTail -LogPath $tunnelLogFile -Title "localtunnel log"
      exit 1
    }
  } else {
    exit 1
  }
}

# --- 4. Проверить что туннель живой ---
$tunnelReady = Wait-HttpReady -Url "$tunnelUrl/api/tags" -Attempts 15 -DelaySeconds 2 -TimeoutSeconds 5
if (-not $tunnelReady) {
  $tunnelReady = Wait-HttpReady -Url $tunnelUrl -Attempts 5 -DelaySeconds 2 -TimeoutSeconds 5
}

if (-not $tunnelReady) {
  Write-Host "[!] Туннель не отвечает: $tunnelUrl" -ForegroundColor Red
  Show-LogTail -LogPath $tunnelLogFile -Title "tunnel log"
  exit 1
}

# --- 5. Результат ---
Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  Туннель готов!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "  URL: $tunnelUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "  В Discord введи:" -ForegroundColor White
Write-Host "  /bot-ai-url url:$tunnelUrl" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Ctrl+C чтобы остановить" -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Green

try { $tunnelUrl | Set-Clipboard; Write-Host "  (URL скопирован)" -ForegroundColor DarkGray } catch {}

# --- 6. Держать живым ---
try {
  while ($true) {
    $ollamaExited = $ollamaProcess -and $ollamaProcess.HasExited
    if ($ollamaExited -or $tunnelProcess.HasExited) {
      Write-Host "[!] Один из процессов завершился" -ForegroundColor Red
      if ($ollamaExited) {
        Show-LogTail -LogPath $ollamaStdErrLog -Title "ollama stderr"
      }
      if ($tunnelProcess.HasExited) {
        Show-LogTail -LogPath $tunnelLogFile -Title "tunnel log"
      }
      break
    }
    Start-Sleep -Seconds 5
  }
} finally {
  Write-Host "[*] Завершение..." -ForegroundColor Cyan
  Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
  if ($ollamaProcess) {
    Stop-Process -Id $ollamaProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
