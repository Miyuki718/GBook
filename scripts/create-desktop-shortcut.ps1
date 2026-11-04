param(
    [string]$DataDirectory = $(if ($env:GBOOK_DATA_DIR) { $env:GBOOK_DATA_DIR } else { Join-Path $env:LOCALAPPDATA 'GBook' }),
    [ValidateRange(1024, 65535)][int]$Port = 3030
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'open-gbook.ps1'
$node = (Get-Command node.exe).Source
$data = [IO.Path]::GetFullPath($DataDirectory)
if (!(Test-Path -LiteralPath (Join-Path $project 'apps/web/.next/BUILD_ID'))) {
    throw 'Run npm ci --ignore-scripts and npm run build first.'
}

$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$path = Join-Path $desktop 'GBook.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($path)
$shortcut.TargetPath = (Get-Command powershell.exe).Source
$shortcut.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "{0}" -DataDirectory "{1}" -NodePath "{2}" -Port {3}' -f $launcher, $data, $node, $Port
$shortcut.WorkingDirectory = $project
$shortcut.IconLocation = "$node,0"
$shortcut.Description = 'Open the local GBook library'
$shortcut.Save()
Write-Output "Created: $path"
