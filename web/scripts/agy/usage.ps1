# Prints agy usage limits (the CLI's /usage command, works in print mode) and warns when a pool runs low.
# Usage: powershell -NoProfile -File web/scripts/agy/usage.ps1
# Pools: "Gemini Models" (cheap Flash work) and "Claude and GPT models" (small; keep for reviews).
$out = agy --model gemini-3.8-flash-low --print-timeout 60s -p '/usage' 2>&1 | Out-String
Write-Output $out.Trim()
foreach ($line in ($out -split "`r?`n")) {
  if ($line -match '^(?<pool>.+?)\s+(?<kind>Weekly Limit|Five Hour Limit) Remaining\s+(?<pct>\d+)%\s+(?<reset>\S+)') {
    if ([int]$Matches.pct -le 20) {
      Write-Output "LOW: $($Matches.pool) $($Matches.kind) at $($Matches.pct)% (resets $($Matches.reset))"
    }
  }
}
