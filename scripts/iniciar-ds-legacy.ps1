param(
  [switch]$AbrirNavegador
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentFile = Join-Path $projectRoot '.env.docker'
$dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
$applicationUrl = 'http://localhost:8000'
$logDirectory = Join-Path $env:LOCALAPPDATA 'DS Legacy'
$logFile = Join-Path $logDirectory 'inicializacao.log'

function Write-StartupLog {
  param([string]$Message)

  try {
    if (-not (Test-Path -LiteralPath $logDirectory)) {
      New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    }
    Add-Content -LiteralPath $logFile -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
  } catch {
    # Uma falha no log nao deve impedir a inicializacao da aplicacao.
  }
}

function Test-DockerReady {
  $previousErrorActionPreference = $ErrorActionPreference
  try {
    # O Docker pode escrever avisos no stderr mesmo quando o comando funciona.
    $ErrorActionPreference = 'Continue'
    & docker info *> $null
    return $LASTEXITCODE -eq 0
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
}

function Wait-Until {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds,
    [string]$ErrorMessage
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (& $Condition) { return }
    Start-Sleep -Seconds 3
  }
  throw $ErrorMessage
}

try {
  Write-StartupLog 'Inicio solicitado.'

  if (-not (Test-Path -LiteralPath $environmentFile)) {
    throw 'O arquivo .env.docker nao foi encontrado. Solicite ajuda ao responsavel pelo sistema.'
  }
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'O Docker nao esta instalado ou nao foi encontrado neste computador.'
  }

  if (-not (Test-DockerReady)) {
    if (-not (Test-Path -LiteralPath $dockerDesktop)) {
      throw 'O Docker Desktop nao foi encontrado neste computador.'
    }
    Start-Process -FilePath $dockerDesktop -WindowStyle Hidden
    Write-StartupLog 'Aguardando o Docker Desktop.'
    Wait-Until -TimeoutSeconds 240 -ErrorMessage 'O Docker Desktop demorou demais para iniciar.' -Condition {
      Test-DockerReady
    }
  }

  Push-Location $projectRoot
  try {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
      # Avisos do Docker no stderr nao significam necessariamente uma falha.
      $ErrorActionPreference = 'Continue'
      $composeOutput = & docker compose --env-file $environmentFile up -d 2>&1
      $composeExitCode = $LASTEXITCODE
    } finally {
      $ErrorActionPreference = $previousErrorActionPreference
    }
    if ($composeExitCode -ne 0) {
      Write-StartupLog (($composeOutput | Out-String).Trim())
      throw 'Nao foi possivel iniciar os servicos do DS Legacy.'
    }
  } finally {
    Pop-Location
  }

  Wait-Until -TimeoutSeconds 120 -ErrorMessage 'O DS Legacy nao respondeu dentro do tempo esperado.' -Condition {
    try {
      $response = Invoke-RestMethod -Uri "$applicationUrl/api/health" -TimeoutSec 4
      return $response.status -eq 'ok' -and $response.database -eq 'connected'
    } catch {
      return $false
    }
  }

  if ($AbrirNavegador) {
    Start-Process "$applicationUrl/?atalho=1"
  }
  Write-StartupLog 'Aplicacao iniciada com sucesso.'
} catch {
  Write-StartupLog "ERRO: $($_.Exception.Message)"

  # Na entrada do Windows, registra o problema sem interromper o usuario com popups.
  if ($AbrirNavegador) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
      "$($_.Exception.Message)`n`nDetalhes: $logFile",
      'DS Legacy - Falha ao iniciar',
      [System.Windows.MessageBoxButton]::OK,
      [System.Windows.MessageBoxImage]::Error
    ) | Out-Null
  }
  exit 1
}
