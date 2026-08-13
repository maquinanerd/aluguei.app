param(
  [string]$Target = "C:\Users\pablo\Documents\OpenCode\Aluguei-app"
)

$ErrorActionPreference = "Stop"
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path $Target)) {
  New-Item -ItemType Directory -Force -Path $Target | Out-Null
}

Get-ChildItem -Path $Source -Force | Where-Object { $_.Name -ne "install-bootstrap.ps1" -and $_.Name -ne ".git" } | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination $Target -Recurse -Force
}

Write-Host "Bootstrap otimizado instalado em $Target"
Write-Host "O diretório .git existente foi preservado."
Write-Host "Reinicie o OpenCode para recarregar plugins e execute /preflight; depois /autopilot."
