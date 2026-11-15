<#
Regenerates the 30 s submission video from scratch against the running app.

  powershell -ExecutionPolicy Bypass -File video\make-video.ps1
  powershell -ExecutionPolicy Bypass -File video\make-video.ps1 -Url "https://example.org/app" -Team "Team name"

-AppUrl       dev server of the app (default: $env:APP_URL or http://localhost:5173).
              If nothing answers there, the script starts its own Vite dev server from ..\web on
              port 5390 and stops it (by PID) when done. It never touches other node processes.
-Url          public URL shown on the end card (default: $env:VIDEO_URL; omitted when empty).
-Team         team name shown on the end card (default: $env:VIDEO_TEAM; omitted when empty).
-SkipCapture  reuse work\frames and only redo captions, audio and encoding (fast, ~1.5 min).
-Only         capture only these shots, e.g. -Only "slip,surface" (others are reused).
#>
param(
  [string]$AppUrl = $(if ($env:APP_URL) { $env:APP_URL } else { 'http://localhost:5173' }),
  [string]$Url = $env:VIDEO_URL,
  [string]$Team = $env:VIDEO_TEAM,
  [switch]$SkipCapture,
  [string]$Only = ''
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$web = Join-Path (Split-Path -Parent $here) 'web'
$started = $null
$sw = [Diagnostics.Stopwatch]::StartNew()

function Test-App([string]$u) {
  try { $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 4; return $r.StatusCode -eq 200 } catch { return $false }
}
function Invoke-Step([string]$name, [string[]]$nodeArgs) {
  Write-Host "== $name"
  & node @nodeArgs
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

try {
  if (-not $SkipCapture) {
    if (-not (Test-App $AppUrl)) {
      $AppUrl = 'http://localhost:5390'
      if (-not (Test-App $AppUrl)) {
        Write-Host "No app at the given URL; starting a private dev server on port 5390"
        $vite = Join-Path $web 'node_modules\vite\bin\vite.js'
        $started = Start-Process -FilePath 'node' -ArgumentList "`"$vite`" --port 5390 --strictPort" -WorkingDirectory $web -WindowStyle Hidden -PassThru
        $ok = $false
        foreach ($i in 1..40) { Start-Sleep -Milliseconds 500; if (Test-App $AppUrl) { $ok = $true; break } }
        if (-not $ok) { throw 'The private dev server did not start' }
      }
    }
    Write-Host "App: $AppUrl"
    $env:APP_URL = $AppUrl
    $cap = @((Join-Path $here 'scripts\capture.mjs'))
    if ($Only) { $cap += "--only=$Only" }
    Invoke-Step 'capture (frame by frame, about 2.5 min)' $cap
  }
  $env:VIDEO_URL = $Url
  $env:VIDEO_TEAM = $Team
  Invoke-Step 'compose (captions, zooms, end card)' @((Join-Path $here 'scripts\compose.mjs'))
  Invoke-Step 'audio (synthesised soundtrack)' @((Join-Path $here 'scripts\audio.mjs'))
  Invoke-Step 'assemble (ffmpeg)' @((Join-Path $here 'scripts\assemble.mjs'))
  Write-Host ("Done in {0:n0} s -> {1}" -f $sw.Elapsed.TotalSeconds, (Join-Path $here 'out\lunar-landing-navigator-30s.mp4'))
}
finally {
  if ($started -and -not $started.HasExited) { Stop-Process -Id $started.Id -Force -Confirm:$false }
}
