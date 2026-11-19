# Copies "Bearer <DAWN_TIMER_TOKEN>" from .env.local to the clipboard without showing it,
# for pasting into cron-job.org's Authorization header. Run: & .\scripts\copy-timer-token.ps1
$line = Get-Content (Join-Path $PSScriptRoot "..\.env.local") | Where-Object { $_ -match '^DAWN_TIMER_TOKEN=' } | Select-Object -Last 1
if (-not $line) { Write-Host "No DAWN_TIMER_TOKEN in .env.local yet: run save-timer-token.ps1 first." -ForegroundColor Yellow; return }
Set-Clipboard -Value ("Bearer " + $line.Substring("DAWN_TIMER_TOKEN=".Length).Trim())
Write-Host "'Bearer <token>' is on your clipboard again: paste it with Ctrl+V." -ForegroundColor Green
