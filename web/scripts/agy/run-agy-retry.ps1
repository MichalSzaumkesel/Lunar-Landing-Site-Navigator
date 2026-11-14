# Runs a brief through run-agy.ps1 and restarts it (up to -Tries) when the watchdog killed a stalled run (exit 3).
# Gemini backend hangs are random, so a restart with a "continue" note usually succeeds.
# Usage: powershell -NoProfile -File scripts/agy/run-agy-retry.ps1 -Brief tasks/X.md [-Tries 5]
param(
  [Parameter(Mandatory = $true)][string]$Brief,
  [int]$Tries = 5,
  [int]$ToolStallMin = 2,
  [int]$MaxMin = 25
)
$runner = Join-Path $PSScriptRoot 'run-agy.ps1'
$full = (Resolve-Path $Brief).Path
$marker = '## Note (restart)'
for ($i = 1; $i -le $Tries; $i++) {
  Write-Output "attempt $i of $Tries"
  & powershell -NoProfile -File $runner -Brief $Brief -ToolStallMin $ToolStallMin -MaxMin $MaxMin
  $code = $LASTEXITCODE
  if ($code -ne 3) { exit $code }
  if (-not (Select-String -Path $full -SimpleMatch $marker -Quiet)) {
    Add-Content -Path $full -Value "`n$marker`nA previous run stalled. Inspect existing output files and continue; write the report file early and extend it. Read files in ranges under 200 lines. Run shell commands in steps under 60 s."
  }
}
exit 3
