$ErrorActionPreference = 'Stop'
try {
    $projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $launcher = Join-Path $projectDir 'run_codemind_ai.bat'
    if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw "Launcher not found: $launcher" }
    $desktop = [Environment]::GetFolderPath('Desktop')
    if ([string]::IsNullOrWhiteSpace($desktop)) { throw 'Windows did not return a desktop folder path.' }
    $shortcutPath = Join-Path $desktop 'CodeMind AI.lnk'
    $icon = Join-Path $projectDir 'assets\codemind.ico'
    if (-not (Test-Path -LiteralPath $icon -PathType Leaf)) { $icon = "$env:SystemRoot\System32\SHELL32.dll,21" }
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $env:ComSpec
    $shortcut.Arguments = '/c "' + $launcher + '"'
    $shortcut.WorkingDirectory = $projectDir
    $shortcut.IconLocation = $icon
    $shortcut.Description = 'Launch CodeMind AI local developer analytics'
    $shortcut.Save()
    Write-Host "Desktop shortcut created: $shortcutPath"
} catch {
    Write-Error "Could not create the CodeMind AI desktop shortcut. $($_.Exception.Message)"
    exit 1
}
