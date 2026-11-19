# Saves the GitHub "Dawn timer" token into .env.local (git-ignored) without showing it on screen,
# and copies "Bearer <token>" to the clipboard, ready to paste into cron-job.org's Authorization header.
# Run: & .\scripts\save-timer-token.ps1
$envFile = Join-Path $PSScriptRoot "..\.env.local"
$secure = Read-Host "Paste the token (it stays hidden), then press Enter" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($token -notmatch '^(github_pat_|ghp_)[A-Za-z0-9_]+$') {
  Write-Host "That doesn't look like a GitHub token (it should start with github_pat_). Nothing saved." -ForegroundColor Yellow
  return
}
$lines = @()
if (Test-Path $envFile) { $lines = Get-Content $envFile | Where-Object { $_ -notmatch '^DAWN_TIMER_TOKEN=' } }
$lines += "DAWN_TIMER_TOKEN=$token"
[IO.File]::WriteAllLines((Resolve-Path $envFile), $lines)
Set-Clipboard -Value "Bearer $token"
Write-Host "Saved to .env.local as DAWN_TIMER_TOKEN." -ForegroundColor Green
Write-Host "'Bearer <token>' is now on your clipboard: paste it as the Authorization header value in cron-job.org."
