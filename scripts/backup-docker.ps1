param(
  [string]$EnvFile = ".env.docker",
  [string]$BackupDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot $EnvFile
$backupRoot = Join-Path $projectRoot $BackupDirectory

if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  throw "Arquivo de configuração não encontrado: $envPath"
}

$settings = @{}
foreach ($line in Get-Content -LiteralPath $envPath -Encoding UTF8) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith("#") -or -not $trimmed.Contains("=")) { continue }
  $key, $value = $trimmed.Split("=", 2)
  $settings[$key.Trim()] = $value.Trim()
}

$databaseUser = if ($settings.POSTGRES_USER) { $settings.POSTGRES_USER } else { "ds_legacy" }
$databaseName = if ($settings.POSTGRES_DB) { $settings.POSTGRES_DB } else { "ds_legacy" }
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "ds_legacy_$timestamp.backup"
$backupPath = Join-Path $backupRoot $backupName
$containerBackup = "/tmp/ds_legacy.backup"

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

Push-Location $projectRoot
try {
  & docker compose --env-file $envPath exec -T postgres pg_dump `
    -U $databaseUser -d $databaseName --format=custom --file=$containerBackup
  if ($LASTEXITCODE -ne 0) { throw "O PostgreSQL não conseguiu gerar o backup." }

  & docker compose --env-file $envPath cp "postgres:$containerBackup" $backupPath
  if ($LASTEXITCODE -ne 0) { throw "Não foi possível copiar o backup para o computador." }
} finally {
  Pop-Location
}

Write-Host "Backup criado em: $backupPath"
