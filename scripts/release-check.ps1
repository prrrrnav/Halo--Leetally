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
  $package = Get-Content -LiteralPath (Join-Path $extension "package.json") -Raw | ConvertFrom-Json
  $wxtConfig = Get-Content -LiteralPath (Join-Path $extension "wxt.config.ts") -Raw
  $configuredVersion = [regex]::Match(
    $wxtConfig,
    'version:\s*"(?<version>\d+\.\d+\.\d+)"'
  ).Groups["version"].Value
  if (-not $configuredVersion -or $configuredVersion -ne $package.version) {
    throw "Extension versions do not match: package.json=$($package.version), wxt.config.ts=$configuredVersion"
  }

  npm test
  if ($LASTEXITCODE -ne 0) { throw "Extension tests failed." }
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

  $zipPath = Join-Path $extension ".output\leetally-extension-$($package.version)-chrome.zip"
  if (-not (Test-Path -LiteralPath $zipPath)) { throw "Missing release ZIP: $zipPath" }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
  try {
    $unsafeEntries = $zip.Entries | Where-Object {
      $_.FullName -match '(^|/)(\.env($|\.)|node_modules/|src/|.*\.(pem|p12|pfx|key)$)' -or
      $_.FullName -match 'vad\.worklet\.bundle\.dev\.js$'
    }
    if ($unsafeEntries.Count) {
      throw "Unsafe files were packaged: $($unsafeEntries.FullName -join ', ')"
    }
  } finally { $zip.Dispose() }
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

$screenshotsDirectory = Join-Path $website "store-assets\screenshots"
$screenshots = @(
  Get-ChildItem -LiteralPath $screenshotsDirectory -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in ".png", ".jpg", ".jpeg" }
)
if ($screenshots.Count -lt 1 -or $screenshots.Count -gt 5) {
  throw "Chrome Web Store requires 1-5 real extension screenshots; found $($screenshots.Count) in $screenshotsDirectory."
}
foreach ($screenshot in $screenshots) {
  $image = [System.Drawing.Image]::FromFile($screenshot.FullName)
  try {
    if ($image.Width -ne 1280 -or $image.Height -ne 800) {
      throw "Invalid screenshot dimensions for $($screenshot.FullName): $($image.Width)x$($image.Height); expected 1280x800."
    }
  } finally { $image.Dispose() }
}

Write-Host "Release checks passed." -ForegroundColor Green
