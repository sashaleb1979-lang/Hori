param(
  [string]$ProjectRoot,
  [int]$OllamaPort = 11434,
  [switch]$ExitAfterReady,
  [switch]$NoClipboard
)

$targetScript = Join-Path $PSScriptRoot "start-hori.ps1"
if (-not (Test-Path $targetScript)) {
  throw "Не найден основной launcher: $targetScript"
}

& $targetScript @PSBoundParameters
exit $LASTEXITCODE
