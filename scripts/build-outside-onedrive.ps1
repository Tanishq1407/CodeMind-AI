$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tempRoot = [IO.Path]::GetFullPath($env:TEMP)
$staging = Join-Path $tempRoot ("codemind-build-" + [guid]::NewGuid().ToString("N"))
$oneDrive = [Environment]::GetEnvironmentVariable("OneDrive", "Process")

if ([IO.Path]::GetFullPath($staging).StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) {
  throw "The staging directory must be outside the repository."
}
if ($oneDrive -and [IO.Path]::GetFullPath($staging).StartsWith([IO.Path]::GetFullPath($oneDrive), [StringComparison]::OrdinalIgnoreCase)) {
  throw "The TEMP directory resolves inside OneDrive; choose a local TEMP directory outside the sync root."
}

$files = @(
  "package.json", "package-lock.json", "next.config.ts", "tsconfig.json", "next-env.d.ts",
  "postcss.config.mjs", "eslint.config.mjs", "playwright.config.ts", "vitest.config.ts"
)
$directories = @("prisma", "scripts", "src", "public", "e2e", "analysis", "analysis_service", "tests")
$environmentNames = @("DATABASE_URL", "DATABASE_URL_UNPOOLED", "AUTH_SECRET", "AUTH_URL", "NEXT_PUBLIC_APP_URL", "RESEND_API_KEY", "EMAIL_FROM", "AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_ID", "GITHUB_SECRET")
$originalEnvironment = @{}
foreach ($name in $environmentNames) { $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }

try {
  New-Item -ItemType Directory -Path $staging -Force | Out-Null
  foreach ($file in $files) {
    $source = Join-Path $repo $file
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $staging $file) -Force }
  }
  foreach ($directory in $directories) {
    $source = Join-Path $repo $directory
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination (Join-Path $staging $directory) -Recurse -Force }
  }

  # Copy installed dependencies without removing or changing anything in the source tree.
  $dependencyTarget = Join-Path $staging "node_modules"
  New-Item -ItemType Directory -Path $dependencyTarget -Force | Out-Null
  & robocopy (Join-Path $repo "node_modules") $dependencyTarget /E /COPY:DAT /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copying installed dependencies failed (robocopy exit $LASTEXITCODE)." }

  # A clean build needs no production credentials or database connection.
  $env:DATABASE_URL = "postgresql://build:build@127.0.0.1:5432/codemind"
  $env:DATABASE_URL_UNPOOLED = "postgresql://build:build@127.0.0.1:5432/codemind"
  $env:AUTH_SECRET = "temporary-build-only-not-a-secret"
  $env:AUTH_URL = "http://localhost:3000"
  $env:NEXT_PUBLIC_APP_URL = "http://localhost:3000"
  foreach ($name in @("RESEND_API_KEY", "EMAIL_FROM", "AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GITHUB_ID", "GITHUB_SECRET")) {
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
  }

  Write-Host "Staged build directory: $staging"
  Push-Location $staging
  try {
    # Redirect through cmd so detached Next worker processes cannot keep the
    # caller's console pipe open after the build command has finished.
    & $env:ComSpec /d /c "npm.cmd run build > build.log 2>&1"
    $buildExitCode = $LASTEXITCODE
    Get-Content -LiteralPath (Join-Path $staging "build.log") | ForEach-Object { Write-Host $_ }
    if ($buildExitCode -ne 0) { throw "Production build failed (exit $buildExitCode)." }
  } finally {
    Pop-Location
  }
  Write-Host "Production build succeeded outside OneDrive. Build output: $(Join-Path $staging '.next')"
  Write-Host "The staging copy was retained; no source files, environment files, or database data were removed."
} catch {
  Write-Error $_
  exit 1
} finally {
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $originalEnvironment[$name], "Process") }
}

exit 0
