param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDatabaseUrl
)

$ErrorActionPreference = 'Stop'

if ($SourceDatabaseUrl -notmatch 'supabase\.co') {
    throw 'A URL informada não parece ser do Supabase. Este script é deliberadamente restrito ao backup da origem legada.'
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$backupDir = Join-Path $repoRoot 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpFile = "prospector-supabase-public-$timestamp.dump"
$dumpPath = Join-Path $backupDir $dumpFile

Write-Host 'Validando Docker...'
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker não está disponível. Abra o Docker Desktop e execute novamente.'
}

Write-Host 'Exportando o schema public do Supabase para backup local...'
docker run --rm `
    -e "SOURCE_DATABASE_URL=$SourceDatabaseUrl" `
    -e "DUMP_FILE=$dumpFile" `
    --mount "type=bind,source=$backupDir,destination=/backup" `
    postgres:17-alpine `
    sh -lc 'pg_dump "$SOURCE_DATABASE_URL" --schema=public --format=custom --no-owner --no-acl --file="/backup/$DUMP_FILE"'

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $dumpPath)) {
    throw 'O backup falhou. Nenhum serviço cloud deve ser desligado.'
}

$hash = (Get-FileHash -Algorithm SHA256 -Path $dumpPath).Hash
$sizeMb = [math]::Round((Get-Item $dumpPath).Length / 1MB, 2)

Write-Host ''
Write-Host 'BACKUP CONCLUÍDO'
Write-Host "Arquivo: $dumpPath"
Write-Host "Tamanho: $sizeMb MB"
Write-Host "SHA-256: $hash"
Write-Host ''
Write-Host 'Este arquivo contém dados reais. Ele está coberto pelas regras de .gitignore e não deve ser enviado ao GitHub.'
Write-Host 'Não pause nem exclua o Supabase até o restore local ser validado.'
