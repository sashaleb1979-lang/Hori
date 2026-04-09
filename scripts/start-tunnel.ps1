# start-tunnel.ps1 — Запуск Ollama + Cloudflare Tunnel в одну команду
# Выводит URL туннеля, который можно вставить командой /bot-ai-url в Discord

$ErrorActionPreference = "Stop"

$cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
if (-not (Test-Path $cloudflared)) {
  $cloudflared = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
  if (-not $cloudflared) {
    Write-Host "[!] cloudflared не найден. Установи: winget install cloudflare.cloudflared" -ForegroundColor Red
    exit 1
  }
}

# --- 1. Убить старые процессы ---
Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# --- 2. Запустить Ollama ---
$env:OLLAMA_ORIGINS = "*"
$env:OLLAMA_HOST = "0.0.0.0:11434"

Write-Host "[*] Запускаю Ollama..." -ForegroundColor Cyan
$ollamaProcess = Start-Process -FilePath "ollama" -ArgumentList "serve" `
  -PassThru -WindowStyle Hidden `
  -Environment @{ OLLAMA_ORIGINS = "*"; OLLAMA_HOST = "0.0.0.0:11434" }

# Подождать пока Ollama запустится
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
  try {
    $r = Invoke-WebRequest -Uri "http://localhost:11434" -UseBasicParsing -TimeoutSec 2
    if ($r.StatusCode -eq 200) { $ready = $true; break }
  } catch {}
  Start-Sleep -Seconds 1
}

if (-not $ready) {
  Write-Host "[!] Ollama не отвечает на localhost:11434" -ForegroundColor Red
  exit 1
}
Write-Host "[+] Ollama запущена" -ForegroundColor Green

# --- 3. Запустить Cloudflare Tunnel и поймать URL ---
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
  if (Test-Path $tunnelLogFile) {
    $content = Get-Content $tunnelLogFile -Raw -ErrorAction SilentlyContinue
    if ($content -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
      $tunnelUrl = $Matches[0]
      break
    }
  }
}

if (-not $tunnelUrl) {
  Write-Host "[!] Не удалось получить URL туннеля. Проверь лог: $tunnelLogFile" -ForegroundColor Red
  exit 1
}

# --- 4. Проверить что туннель работает ---
try {
  $check = Invoke-WebRequest -Uri $tunnelUrl -UseBasicParsing -TimeoutSec 10
  if ($check.StatusCode -ne 200) { throw "bad status" }
} catch {
  Write-Host "[!] Туннель не отвечает: $tunnelUrl" -ForegroundColor Red
  exit 1
}

# --- 5. Вывести результат ---
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
Write-Host "  Чтобы остановить: Ctrl+C" -ForegroundColor DarkGray
Write-Host "=============================================" -ForegroundColor Green

# --- 6. Скопировать в буфер обмена ---
try {
  $tunnelUrl | Set-Clipboard
  Write-Host "  (URL скопирован в буфер обмена)" -ForegroundColor DarkGray
} catch {}

# --- 7. Держать скрипт живым, пока не нажмут Ctrl+C ---
try {
  while ($true) {
    if ($ollamaProcess.HasExited -or $tunnelProcess.HasExited) {
      Write-Host "[!] Один из процессов завершился" -ForegroundColor Red
      break
    }
    Start-Sleep -Seconds 5
  }
} finally {
  Write-Host "[*] Завершение..." -ForegroundColor Cyan
  Stop-Process -Id $tunnelProcess.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $ollamaProcess.Id -Force -ErrorAction SilentlyContinue
}
