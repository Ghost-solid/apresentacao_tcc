param([string]$BackupFile = "")
$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $BackupFile) {
  $latest = Get-ChildItem -LiteralPath (Join-Path $projectRoot "backups/automatic") -Filter "*.backup" |
    Sort-Object Name -Descending | Select-Object -First 1
  if (-not $latest) { throw "Nenhum backup automatico encontrado." }
  $BackupFile = $latest.FullName
}
$resolvedBackup = (Resolve-Path -LiteralPath $BackupFile).Path
if (-not (Test-Path -LiteralPath $resolvedBackup -PathType Leaf)) { throw "Backup invalido." }
$testName = "ds-legacy-restore-test-" + [guid]::NewGuid().ToString("N")
$created = $false
try {
  # Isolated disposable PostgreSQL: no network, no production volumes or credentials.
  & docker run --detach --name $testName --network none `
    --env POSTGRES_HOST_AUTH_METHOD=trust `
    --mount "type=bind,source=$resolvedBackup,target=/restore.backup,readonly" `
    postgres:17-alpine | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Falha ao iniciar banco isolado." }
  $created = $true
  $ready = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    & docker exec $testName pg_isready -U postgres -h 127.0.0.1 *> $null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "Banco de teste nao iniciou." }
  & docker exec $testName createdb -U postgres restore_test
  if ($LASTEXITCODE -ne 0) { throw "Falha ao criar banco de teste." }
  & docker exec $testName pg_restore -U postgres -d restore_test `
    --no-owner --no-privileges --exit-on-error --single-transaction /restore.backup
  if ($LASTEXITCODE -ne 0) { throw "RESTAURACAO FALHOU. O backup nao foi validado." }
  $sql = @"
SELECT 'readers' AS tabela, COUNT(*) AS registros FROM readers
UNION ALL SELECT 'readers_archived', COUNT(*) FROM readers WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'books', COUNT(*) FROM books
UNION ALL SELECT 'books_archived', COUNT(*) FROM books WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'loans', COUNT(*) FROM loans
UNION ALL SELECT 'reservations', COUNT(*) FROM reservations
UNION ALL SELECT 'app_users', COUNT(*) FROM app_users
UNION ALL SELECT 'app_sessions', COUNT(*) FROM app_sessions
UNION ALL SELECT 'legacy_book_imports', COUNT(*) FROM legacy_book_imports;
"@
  & docker exec $testName psql -U postgres -d restore_test -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0) { throw "Falha na verificacao das tabelas restauradas." }
  & docker exec $testName psql -U postgres -d restore_test -v ON_ERROR_STOP=1 -c "SELECT to_regclass('public.audit_logs') IS NOT NULL AS possui_historico_acoes;"
  if ($LASTEXITCODE -ne 0) { throw "Falha ao verificar historico de acoes." }
  Write-Host "Restauracao validada: $resolvedBackup"
  Write-Host "O banco de producao nao foi alterado."
} finally {
  if ($created) {
    & docker rm --force --volumes $testName | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Remova o container de teste: $testName" }
  }
}
