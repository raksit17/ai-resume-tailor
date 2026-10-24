$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (Test-Path .env) { Write-Host '.env already exists; kept unchanged.'; exit 0 }
function New-HexSecret {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
$content = Get-Content .env.example -Raw
$content = $content.Replace('replace-with-generated-hex', (New-HexSecret))
$content = $content.Replace('replace-with-generated-token-at-least-24-characters', (New-HexSecret))
[System.IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $content, [System.Text.UTF8Encoding]::new($false))
Write-Host '.env created. Set JOB_WATCHER_BASE_URL to your existing API port.'
Write-Host 'Next: docker compose up -d --build'
