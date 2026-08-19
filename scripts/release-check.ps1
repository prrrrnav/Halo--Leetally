$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$extension = Join-Path $root "extension"
$website = Join-Path $root "website"
$backend = Join-Path $root "backend"
$python = Join-Path $backend ".venv-release\Scripts\python.exe"

if (-not (Test-Path -LiteralPath $python)) {
  throw "Create backend/.venv-release and install backend/requirements-dev.txt first."
}

Push-Location $backend
try {
  & $python -m pytest -q -p no:cacheprovider
  if ($LASTEXITCODE -ne 0) { throw "Backend tests failed." }
} finally { Pop-Location }

Push-Location $extension
try {
  npm run compile
  if ($LASTEXITCODE -ne 0) { throw "Extension compile failed." }
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Extension build failed." }
  npm run zip
  if ($LASTEXITCODE -ne 0) { throw "Extension ZIP failed." }

  $manifestPath = Join-Path $extension ".output\chrome-mv3\manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ($manifest.manifest_version -ne 3) { throw "Manifest V3 is required." }
  if ($manifest.permissions -contains "activeTab") { throw "Unexpected activeTab permission." }
  if ($manifest.host_permissions -contains "https://*.supabase.co/*") {
    throw "Wildcard Supabase host permission is not allowed."
  }
  $unexpectedHosts = @(
    "https://neetcode.io/*",
    "https://takeuforward.org/*",
    "https://www.techinterviewhandbook.org/*",
    "https://namastedev.com/*",
    "https://www.codingninjas.com/*"
  ) | Where-Object { $manifest.host_permissions -contains $_ }
  if ($unexpectedHosts.Count) { throw "Unused host permissions remain: $unexpectedHosts" }
  if (Test-Path -LiteralPath (Join-Path $extension ".output\chrome-mv3\vad\vad.worklet.bundle.dev.js")) {
    throw "Development VAD bundle was packaged."
  }
} finally { Pop-Location }

Push-Location $website
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "Website build failed." }
} finally { Pop-Location }

Add-Type -AssemblyName System.Drawing
$promo = Join-Path $website "store-assets\promo-440x280.png"
$icon = Join-Path $extension "public\icon\128.png"
foreach ($asset in @(@($promo, 440, 280), @($icon, 128, 128))) {
  if (-not (Test-Path -LiteralPath $asset[0])) { throw "Missing asset: $($asset[0])" }
  $image = [System.Drawing.Image]::FromFile($asset[0])
  try {
    if ($image.Width -ne $asset[1] -or $image.Height -ne $asset[2]) {
      throw "Invalid dimensions for $($asset[0]): $($image.Width)x$($image.Height)"
    }
  } finally { $image.Dispose() }
}

Write-Host "Release checks passed." -ForegroundColor Green
