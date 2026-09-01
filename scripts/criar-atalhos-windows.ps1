$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'iniciar-ds-legacy.ps1'
$powerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$desktop = [Environment]::GetFolderPath('Desktop')
$startup = [Environment]::GetFolderPath('Startup')
$shell = New-Object -ComObject WScript.Shell

if (-not (Test-Path -LiteralPath $desktop) -or -not (Test-Path -LiteralPath $startup)) {
  throw 'As pastas da Area de Trabalho ou de inicializacao do Windows nao foram encontradas.'
}

function New-DsLegacyShortcut {
  param(
    [string]$Path,
    [switch]$OpenBrowser
  )

  # Recria o arquivo para nao preservar a opcao antiga "Executar como administrador".
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Force
  }

  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $powerShell
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`"$(if ($OpenBrowser) { ' -AbrirNavegador' })"
  $shortcut.WorkingDirectory = $projectRoot
  $shortcut.Description = 'Inicia o servidor e abre o DS Legacy'
  $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
  $shortcut.Save()
}

Get-ChildItem -LiteralPath $startup -Filter '*.lnk' | ForEach-Object {
  $existingShortcut = $shell.CreateShortcut($_.FullName)
  if ($existingShortcut.Arguments -like "*$launcher*") {
    Remove-Item -LiteralPath $_.FullName -Force
  }
}

New-DsLegacyShortcut -Path (Join-Path $desktop 'Iniciar DS Legacy.lnk') -OpenBrowser
New-DsLegacyShortcut -Path (Join-Path $startup 'DS Legacy - Inicio automatico.lnk')

Write-Output 'Atalhos do DS Legacy criados com sucesso.'
