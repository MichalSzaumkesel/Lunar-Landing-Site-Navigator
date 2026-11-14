# Runs one scope B brief through the Antigravity CLI (Gemini 3.8 Flash), fully automatic,
# with a watchdog that kills it when it stops making progress.
#
# Usage: powershell -NoProfile -File web/scripts/agy/run-agy.ps1 -Brief web/tasks/B0-mocks.md
#
# - Permissions are skipped (--dangerously-skip-permissions) because headless agy otherwise hangs on
#   trivial commands. The brief's "Forbidden" section is the only guard, so the lead reviews the result.
# - The prompt is short on purpose (it names the brief file). Long multi-line prompts get mangled by
#   Windows PowerShell 5.1 when passed to a native program.
# - Progress comes from --output-format stream-json: every step is an event. The watchdog kills the
#   process tree when no event arrives for StallMin minutes (default 9: big generations are silent
#   for a while), when a tool call stays open for ToolStallMin minutes, or after MaxMin minutes in
#   total. One minute before the silence kill a warning line is printed.
# Exit codes: 0 done, 1 agy reported failure, 3 stalled, 4 time limit.
param(
  [Parameter(Mandatory = $true)][string]$Brief,
  [string]$Model = 'gemini-3.8-flash-high',
  [string]$Effort = 'high',
  [int]$StallMin = 9,
  [int]$ToolStallMin = 4,
  [int]$MaxMin = 25
)

$webRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$briefFull = (Resolve-Path $Brief).Path
if (-not $briefFull.StartsWith($webRoot)) { throw "Brief must live under $webRoot" }
$briefRel = $briefFull.Substring($webRoot.Length + 1).Replace('\', '/')

$runDir = Join-Path $env:TEMP 'agy-runs'
New-Item -ItemType Directory -Force $runDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$name = [IO.Path]::GetFileNameWithoutExtension($briefFull)
$out = Join-Path $runDir "$name-$stamp.jsonl"
$err = Join-Path $runDir "$name-$stamp.err"

$prompt = "Read the file tasks/_common.md and then the file $briefRel in the current directory, and follow both exactly. Your final message must be the report in the format given in _common.md."
$agyArgs = @(
  '--model', $Model, '--effort', $Effort,
  '--dangerously-skip-permissions',
  '--output-format', 'stream-json',
  '--print-timeout', "$($MaxMin)m",
  '-p', "`"$prompt`""
)

$agyExe = (Get-Command agy).Source
$p = Start-Process -FilePath $agyExe -ArgumentList $agyArgs -WorkingDirectory $webRoot `
  -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -PassThru
Write-Output "agy started (pid $($p.Id)), log: $out"

function Stop-Tree([int]$id) { taskkill /PID $id /T /F | Out-Null }

$start = Get-Date
$lastEvent = Get-Date
$lastLen = 0
$openTools = @{}   # step_index -> start time of tool calls that have not finished
$warned = $false

while (-not $p.HasExited) {
  Start-Sleep -Seconds 5
  if (-not (Test-Path $out)) { continue }
  $len = (Get-Item $out).Length
  if ($len -ne $lastLen) {
    $lastLen = $len
    $lastEvent = Get-Date
    foreach ($line in (Get-Content $out -ErrorAction SilentlyContinue | Select-Object -Last 6)) {
      try { $ev = $line | ConvertFrom-Json } catch { continue }
      $su = $ev.step_update
      if ($su -and $su.step_type -eq 'tool') {
        if ($su.state -eq 'ACTIVE' -and -not $openTools.ContainsKey($su.step_index)) {
          $openTools[$su.step_index] = Get-Date
        } elseif ($su.state -eq 'DONE') { $openTools.Remove($su.step_index) }
      }
    }
  }
  $idleMin = ((Get-Date) - $lastEvent).TotalMinutes
  if ($idleMin -ge ($StallMin - 1) -and -not $warned) {
    $warned = $true
    Write-Output "WARNING: no event for $([math]::Round($idleMin,1)) min, killing in 1 min unless agy responds."
  }
  if ($idleMin -lt ($StallMin - 1)) { $warned = $false }
  $oldestTool = if ($openTools.Count) { (($openTools.Values | Sort-Object | Select-Object -First 1) - (Get-Date)).Negate().TotalMinutes } else { 0 }
  if ($idleMin -ge $StallMin -or $oldestTool -ge $ToolStallMin) {
    Stop-Tree $p.Id
    Write-Output "STALLED: no event for $([math]::Round($idleMin,1)) min, oldest open tool call $([math]::Round($oldestTool,1)) min. Killed."
    exit 3
  }
  if (((Get-Date) - $start).TotalMinutes -ge $MaxMin) {
    Stop-Tree $p.Id
    Write-Output "TIME LIMIT: killed after $MaxMin min."
    exit 4
  }
}

$result = $null
$toolSteps = @{}
foreach ($line in (Get-Content $out -ErrorAction SilentlyContinue)) {
  try { $ev = $line | ConvertFrom-Json } catch { continue }
  if ($ev.event -eq 'result') { $result = $ev.result }
  $su = $ev.step_update
  if ($su -and $su.step_type -eq 'tool') { $toolSteps[$su.step_index] = $true }
}
$toolCount = $toolSteps.Count
if (-not $result) {
  Write-Output "No result event. stderr:"
  Get-Content $err -ErrorAction SilentlyContinue | Select-Object -Last 15
  exit 1
}
Write-Output "agy status: $($result.status), $([math]::Round($result.duration_seconds)) s, $toolCount tool calls"
Write-Output $result.response
if ($result.status -eq 'SUCCESS') { exit 0 } else { exit 1 }
