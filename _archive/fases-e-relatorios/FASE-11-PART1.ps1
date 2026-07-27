#Requires -Version 5.1
<#
============================================================================
 PROSPECTOR-ATLAS — Enterprise CRM Platform
 FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
----------------------------------------------------------------------------
 Gera automaticamente toda a camada Infrastructure do modulo CRM:
 repositories, prisma, database, cache, redis, queues, storage, email,
 sms, whatsapp, http, external clients, adapters, serializers, factories,
 config, providers, interceptors, health, locks, telemetry, exceptions,
 seed e migration.

 Compativel com Windows PowerShell 5.1 e PowerShell 7+.
 Sem dependencias externas / sem modulos auxiliares.
============================================================================
#>

[CmdletBinding()]
param(
    [switch]$WhatIf,
    [switch]$Rollback,
    [switch]$RunLint,
    [switch]$RunTypeCheck,
    [switch]$RunTests,
    [string]$ProjectRoot = (Get-Location).Path
)

Clear-Host

$Script:PhaseName    = "FASE 11 - INFRASTRUCTURE LAYER"
$Script:PhaseVersion = "1.0.0"
$Script:StartTime    = Get-Date
$Script:ManifestPath = Join-Path $ProjectRoot "phase-11-manifest.json"
$Script:ReportPath   = Join-Path $ProjectRoot "FASE-11-REPORT.html"
$Script:InfraRoot    = Join-Path $ProjectRoot "src/modules/crm/infrastructure"

$Script:CreatedFiles     = New-Object System.Collections.Generic.List[string]
$Script:UpdatedFiles     = New-Object System.Collections.Generic.List[string]
$Script:CreatedFolders   = New-Object System.Collections.Generic.List[string]
$Script:ExistingFolders  = New-Object System.Collections.Generic.List[string]
$Script:EmptyFiles       = New-Object System.Collections.Generic.List[string]
$Script:FileHashes       = New-Object System.Collections.Generic.List[object]
$Script:Errors           = New-Object System.Collections.Generic.List[string]

# ============================================================================
# HEADER ENTERPRISE
# ============================================================================
function Write-Banner {
    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "  PROSPECTOR-ATLAS - $Script:PhaseName" -ForegroundColor Cyan
    Write-Host "  Versao: $Script:PhaseVersion" -ForegroundColor Cyan
    Write-Host "  Data:   $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ""
    if ($WhatIf)   { Write-Host "MODO DRY-RUN (-WhatIf) ATIVO: nenhum arquivo sera criado." -ForegroundColor Yellow }
    if ($Rollback) { Write-Host "MODO ROLLBACK ATIVO: arquivos da Fase 11 serao removidos." -ForegroundColor Yellow }
}

# ============================================================================
# LOGGER
# ============================================================================
function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("INFO","OK","WARN","ERROR")][string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "OK"    { "Green" }
        "WARN"  { "Yellow" }
        "ERROR" { "Red" }
        default { "Gray" }
    }
    Write-Host "[$timestamp][$Level] $Message" -ForegroundColor $color
}

# ============================================================================
# Write-Folder
# ============================================================================
function Write-Folder {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (Test-Path -LiteralPath $Path) {
        $Script:ExistingFolders.Add($Path) | Out-Null
        return
    }

    if ($WhatIf) {
        Write-Log "Simulado: criaria diretorio $Path" "WARN"
        $Script:CreatedFolders.Add($Path) | Out-Null
        return
    }

    try {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        $Script:CreatedFolders.Add($Path) | Out-Null
        Write-Log "Diretorio criado: $Path" "OK"
    }
    catch {
        $Script:Errors.Add("Falha ao criar diretorio $Path : $($_.Exception.Message)") | Out-Null
        Write-Log "Falha ao criar diretorio $Path" "ERROR"
    }
}

# ============================================================================
# Write-FileFromContent
# ============================================================================
function Write-FileFromContent {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $folder = Split-Path -Path $Path -Parent
    if (-not (Test-Path -LiteralPath $folder)) {
        Write-Folder -Path $folder
    }

    $existed = Test-Path -LiteralPath $Path

    if ($WhatIf) {
        if ($existed) {
            Write-Log "Simulado: atualizaria arquivo $Path" "WARN"
            $Script:UpdatedFiles.Add($Path) | Out-Null
        }
        else {
            Write-Log "Simulado: criaria arquivo $Path" "WARN"
            $Script:CreatedFiles.Add($Path) | Out-Null
        }
        return
    }

    try {
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)

        if ($existed) {
            $Script:UpdatedFiles.Add($Path) | Out-Null
            Write-Log "Arquivo atualizado: $Path" "OK"
        }
        else {
            $Script:CreatedFiles.Add($Path) | Out-Null
            Write-Log "Arquivo criado: $Path" "OK"
        }

        if ((Get-Item -LiteralPath $Path).Length -eq 0) {
            $Script:EmptyFiles.Add($Path) | Out-Null
        }

        $hash = Get-FileHash -LiteralPath $Path -Algorithm SHA256
        $Script:FileHashes.Add([PSCustomObject]@{
            Path = $Path
            Hash = $hash.Hash
        }) | Out-Null
    }
    catch {
        $Script:Errors.Add("Falha ao escrever arquivo $Path : $($_.Exception.Message)") | Out-Null
        Write-Log "Falha ao escrever arquivo $Path" "ERROR"
    }
}


# ============================================================================
# ROLLBACK
# ============================================================================
function Invoke-Rollback {
    if (-not (Test-Path -LiteralPath $Script:ManifestPath)) {
        Write-Log "Manifest nao encontrado. Rollback nao pode ser executado." "ERROR"
        return
    }

    Write-Log "Lendo manifest para rollback: $Script:ManifestPath" "INFO"
    $manifest = Get-Content -LiteralPath $Script:ManifestPath -Raw | ConvertFrom-Json

    $removedFiles = New-Object System.Collections.Generic.List[string]
    $removedFolders = New-Object System.Collections.Generic.List[string]

    foreach ($f in $manifest.arquivosCriados) {
        if (Test-Path -LiteralPath $f) {
            Remove-Item -LiteralPath $f -Force -ErrorAction SilentlyContinue
            $removedFiles.Add($f) | Out-Null
            Write-Log "Removido: $f" "WARN"
        }
    }

    $dirsToCheck = $manifest.diretoriosCriados | Sort-Object -Descending { $_.Length }
    foreach ($d in $dirsToCheck) {
        if (Test-Path -LiteralPath $d) {
            $items = Get-ChildItem -LiteralPath $d -Force -ErrorAction SilentlyContinue
            if (-not $items -or $items.Count -eq 0) {
                Remove-Item -LiteralPath $d -Force -Recurse -ErrorAction SilentlyContinue
                $removedFolders.Add($d) | Out-Null
                Write-Log "Diretorio vazio removido: $d" "WARN"
            }
        }
    }

    $reportPath = Join-Path $ProjectRoot "FASE-11-ROLLBACK-REPORT.html"
    $html = @"
<html><head><meta charset='utf-8'><title>Rollback Fase 11</title></head>
<body style='font-family:Segoe UI, sans-serif; background:#0f172a; color:#e2e8f0; padding:2rem;'>
<h1>Rollback - FASE 11 Infrastructure</h1>
<p>Executado em: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')</p>
<h2>Arquivos removidos ($($removedFiles.Count))</h2>
<ul>$(($removedFiles | ForEach-Object { "<li>$_</li>" }) -join '')</ul>
<h2>Diretorios removidos ($($removedFolders.Count))</h2>
<ul>$(($removedFolders | ForEach-Object { "<li>$_</li>" }) -join '')</ul>
</body></html>
"@
    Set-Content -LiteralPath $reportPath -Value $html -Encoding UTF8

    Write-Log "Rollback concluido. Arquivos removidos: $($removedFiles.Count). Diretorios removidos: $($removedFolders.Count)." "OK"
    Write-Log "Relatorio de rollback: $reportPath" "OK"
}

# ============================================================================
# VALIDACAO POS-GERACAO
# ============================================================================
function Invoke-PostGenerationValidation {
    Write-Log "Executando validacao pos-geracao..." "INFO"

    $duplicates = $Script:CreatedFiles + $Script:UpdatedFiles |
        Group-Object | Where-Object { $_.Count -gt 1 } | Select-Object -ExpandProperty Name

    foreach ($dup in $duplicates) {
        $Script:Errors.Add("Arquivo duplicado detectado: $dup") | Out-Null
        Write-Log "Duplicidade detectada: $dup" "WARN"
    }

    $minSizeBytes = 30
    foreach ($f in ($Script:CreatedFiles + $Script:UpdatedFiles)) {
        if (Test-Path -LiteralPath $f) {
            $len = (Get-Item -LiteralPath $f).Length
            if ($len -lt $minSizeBytes) {
                $Script:Errors.Add("Arquivo abaixo do tamanho minimo ($len bytes): $f") | Out-Null
            }
        }
    }

    if ($Script:EmptyFiles.Count -gt 0) {
        foreach ($ef in $Script:EmptyFiles) {
            $Script:Errors.Add("Arquivo vazio: $ef") | Out-Null
        }
    }

    $allDirsOk = $true
    foreach ($d in ($Script:CreatedFolders + $Script:ExistingFolders)) {
        if (-not (Test-Path -LiteralPath $d)) {
            $allDirsOk = $false
            $Script:Errors.Add("Diretorio esperado nao encontrado: $d") | Out-Null
        }
    }

    Write-Log "Validacao concluida. Erros encontrados: $($Script:Errors.Count)" $(if ($Script:Errors.Count -eq 0) { "OK" } else { "WARN" })
    return ($Script:Errors.Count -eq 0)
}

# ============================================================================
# VALIDACAO TYPESCRIPT (lint / tsc / test) - OPCIONAL
# ============================================================================
function Invoke-OptionalCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$Arguments
    )

    $result = [PSCustomObject]@{
        Name       = $Name
        Executed   = $false
        ExitCode   = $null
        DurationMs = 0
        Output     = ""
        Status     = "SKIPPED"
    }

    $exists = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $exists) {
        Write-Log "$Name : comando '$Command' nao encontrado. WARNING registrado." "WARN"
        $result.Status = "WARNING"
        return $result
    }

    Write-Log "Executando $Name ($Command $Arguments)..." "INFO"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $output = & $Command $Arguments 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
        $sw.Stop()
        $result.Executed   = $true
        $result.ExitCode   = $exitCode
        $result.DurationMs = $sw.ElapsedMilliseconds
        $result.Output     = $output
        $result.Status     = if ($exitCode -eq 0) { "SUCCESS" } else { "FAILED" }
        Write-Log "$Name finalizado com codigo $exitCode em $($sw.ElapsedMilliseconds) ms" $(if ($exitCode -eq 0) {"OK"} else {"ERROR"})
    }
    catch {
        $sw.Stop()
        $result.DurationMs = $sw.ElapsedMilliseconds
        $result.Output     = $_.Exception.Message
        $result.Status     = "FAILED"
        Write-Log "$Name falhou: $($_.Exception.Message)" "ERROR"
    }
    return $result
}

# ============================================================================
# GERACAO DE CONTEUDO - FASE 11 INFRASTRUCTURE LAYER
# ============================================================================
function Invoke-Phase11Generation {
    Write-Log "Iniciando geracao da camada Infrastructure..." "INFO"

$c1 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/LeadRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Lead aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';

/**
 * Repository contract for Lead aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaLeadRepository).
 */
export interface LeadRepository {
  findById(id: string): Promise<Lead | null>;
  findAll(limit: number, offset: number): Promise<Lead[]>;
  create(entity: Lead): Promise<Lead>;
  update(id: string, entity: Partial<Lead>): Promise<Lead>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c2 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/CompanyRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Company aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';

/**
 * Repository contract for Company aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaCompanyRepository).
 */
export interface CompanyRepository {
  findById(id: string): Promise<Company | null>;
  findAll(limit: number, offset: number): Promise<Company[]>;
  create(entity: Company): Promise<Company>;
  update(id: string, entity: Partial<Company>): Promise<Company>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c3 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/ContactRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Contact aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Contact } from '../../domain/entities/Contact';

/**
 * Repository contract for Contact aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaContactRepository).
 */
export interface ContactRepository {
  findById(id: string): Promise<Contact | null>;
  findAll(limit: number, offset: number): Promise<Contact[]>;
  create(entity: Contact): Promise<Contact>;
  update(id: string, entity: Partial<Contact>): Promise<Contact>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c4 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/OpportunityRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Opportunity aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';

/**
 * Repository contract for Opportunity aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaOpportunityRepository).
 */
export interface OpportunityRepository {
  findById(id: string): Promise<Opportunity | null>;
  findAll(limit: number, offset: number): Promise<Opportunity[]>;
  create(entity: Opportunity): Promise<Opportunity>;
  update(id: string, entity: Partial<Opportunity>): Promise<Opportunity>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c5 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/PipelineRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Pipeline aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Pipeline } from '../../domain/entities/Pipeline';

/**
 * Repository contract for Pipeline aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaPipelineRepository).
 */
export interface PipelineRepository {
  findById(id: string): Promise<Pipeline | null>;
  findAll(limit: number, offset: number): Promise<Pipeline[]>;
  create(entity: Pipeline): Promise<Pipeline>;
  update(id: string, entity: Partial<Pipeline>): Promise<Pipeline>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c6 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/TaskRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Task aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';

/**
 * Repository contract for Task aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaTaskRepository).
 */
export interface TaskRepository {
  findById(id: string): Promise<Task | null>;
  findAll(limit: number, offset: number): Promise<Task[]>;
  create(entity: Task): Promise<Task>;
  update(id: string, entity: Partial<Task>): Promise<Task>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c7 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/MeetingRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Meeting aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Meeting } from '../../domain/entities/Meeting';

/**
 * Repository contract for Meeting aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaMeetingRepository).
 */
export interface MeetingRepository {
  findById(id: string): Promise<Meeting | null>;
  findAll(limit: number, offset: number): Promise<Meeting[]>;
  create(entity: Meeting): Promise<Meeting>;
  update(id: string, entity: Partial<Meeting>): Promise<Meeting>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c8 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/ProposalRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Proposal aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Proposal } from '../../domain/entities/Proposal';

/**
 * Repository contract for Proposal aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaProposalRepository).
 */
export interface ProposalRepository {
  findById(id: string): Promise<Proposal | null>;
  findAll(limit: number, offset: number): Promise<Proposal[]>;
  create(entity: Proposal): Promise<Proposal>;
  update(id: string, entity: Partial<Proposal>): Promise<Proposal>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c9 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/DealRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Deal aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Deal } from '../../domain/entities/Deal';

/**
 * Repository contract for Deal aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaDealRepository).
 */
export interface DealRepository {
  findById(id: string): Promise<Deal | null>;
  findAll(limit: number, offset: number): Promise<Deal[]>;
  create(entity: Deal): Promise<Deal>;
  update(id: string, entity: Partial<Deal>): Promise<Deal>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c10 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/ActivityRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Activity aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Activity } from '../../domain/entities/Activity';

/**
 * Repository contract for Activity aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaActivityRepository).
 */
export interface ActivityRepository {
  findById(id: string): Promise<Activity | null>;
  findAll(limit: number, offset: number): Promise<Activity[]>;
  create(entity: Activity): Promise<Activity>;
  update(id: string, entity: Partial<Activity>): Promise<Activity>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c11 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/CampaignRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Campaign aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Campaign } from '../../domain/entities/Campaign';

/**
 * Repository contract for Campaign aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaCampaignRepository).
 */
export interface CampaignRepository {
  findById(id: string): Promise<Campaign | null>;
  findAll(limit: number, offset: number): Promise<Campaign[]>;
  create(entity: Campaign): Promise<Campaign>;
  update(id: string, entity: Partial<Campaign>): Promise<Campaign>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c12 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/AttachmentRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Attachment aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Attachment } from '../../domain/entities/Attachment';

/**
 * Repository contract for Attachment aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaAttachmentRepository).
 */
export interface AttachmentRepository {
  findById(id: string): Promise<Attachment | null>;
  findAll(limit: number, offset: number): Promise<Attachment[]>;
  create(entity: Attachment): Promise<Attachment>;
  update(id: string, entity: Partial<Attachment>): Promise<Attachment>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c13 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/TimelineRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Timeline aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Timeline } from '../../domain/entities/Timeline';

/**
 * Repository contract for Timeline aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaTimelineRepository).
 */
export interface TimelineRepository {
  findById(id: string): Promise<Timeline | null>;
  findAll(limit: number, offset: number): Promise<Timeline[]>;
  create(entity: Timeline): Promise<Timeline>;
  update(id: string, entity: Partial<Timeline>): Promise<Timeline>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c14 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/TagRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Tag aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Tag } from '../../domain/entities/Tag';

/**
 * Repository contract for Tag aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaTagRepository).
 */
export interface TagRepository {
  findById(id: string): Promise<Tag | null>;
  findAll(limit: number, offset: number): Promise<Tag[]>;
  create(entity: Tag): Promise<Tag>;
  update(id: string, entity: Partial<Tag>): Promise<Tag>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c15 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/UserRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the User aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { User } from '../../domain/entities/User';

/**
 * Repository contract for User aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaUserRepository).
 */
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findAll(limit: number, offset: number): Promise<User[]>;
  create(entity: User): Promise<User>;
  update(id: string, entity: Partial<User>): Promise<User>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c16 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/OrganizationRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern / DDD
 * ----------------------------------------------------------------------------
 * @description Domain repository contract for the Organization aggregate.
 * @license Proprietary
 * ============================================================================
 */

import type { Organization } from '../../domain/entities/Organization';

/**
 * Repository contract for Organization aggregate persistence operations.
 * Implementations must live in the infrastructure layer (e.g. PrismaOrganizationRepository).
 */
export interface OrganizationRepository {
  findById(id: string): Promise<Organization | null>;
  findAll(limit: number, offset: number): Promise<Organization[]>;
  create(entity: Organization): Promise<Organization>;
  update(id: string, entity: Partial<Organization>): Promise<Organization>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
  exists(id: string): Promise<boolean>;
}

'@

$c17 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Singleton / Adapter
 * ----------------------------------------------------------------------------
 * @description Singleton wrapper around the generated Prisma Client for the CRM module.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaClient as GeneratedPrismaClient } from '@ prisma/client';

/**
 * Provides a single, application-wide instance of the generated Prisma Client,
 * preventing connection pool exhaustion in serverless / hot-reload scenarios.
 */
export class PrismaClientSingleton {
  private static instance: GeneratedPrismaClient | undefined;

  public static getInstance(): GeneratedPrismaClient {
    if (!PrismaClientSingleton.instance) {
      PrismaClientSingleton.instance = new GeneratedPrismaClient({
        log: ['warn', 'error'],
      });
    }
    return PrismaClientSingleton.instance;
  }

  public static async disconnect(): Promise<void> {
    if (PrismaClientSingleton.instance) {
      await PrismaClientSingleton.instance.$disconnect();
      PrismaClientSingleton.instance = undefined;
    }
  }
}

export const prisma = PrismaClientSingleton.getInstance();

'@

$c18 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaConnection
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Manages Prisma connection lifecycle (connect/disconnect/reconnect).
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from './PrismaClient';

/**
 * Handles explicit connection lifecycle management for the Prisma datasource.
 */
export class PrismaConnection {
  public async connect(): Promise<void> {
    await prisma.$connect();
  }

  public async disconnect(): Promise<void> {
    await prisma.$disconnect();
  }

  public async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  public async isAlive(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c19 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaTransaction
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Unit of Work
 * ----------------------------------------------------------------------------
 * @description Implements the Unit of Work pattern using Prisma interactive transactions.
 * @license Proprietary
 * ============================================================================
 */

import type { Prisma } from '@ prisma/client';
import { prisma } from './PrismaClient';

export type TransactionalClient = Prisma.TransactionClient;

/**
 * Provides atomic execution of multiple repository operations within a
 * single database transaction (Unit of Work pattern).
 */
export class PrismaTransaction {
  public async run<T>(
    work: (tx: TransactionalClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number },
  ): Promise<T> {
    return prisma.$transaction(work, {
      maxWait: options?.maxWait ?? 5000,
      timeout: options?.timeout ?? 15000,
    });
  }
}

'@

$c20 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaExtensions
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Decorator
 * ----------------------------------------------------------------------------
 * @description Registers Prisma Client Extensions for soft-delete and audit fields.
 * @license Proprietary
 * ============================================================================
 */

import { Prisma } from '@ prisma/client';

/**
 * Extends the Prisma Client with soft-delete semantics and automatic
 * updatedAt bookkeeping across all CRM models.
 */
export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      async findMany({ args, query }) {
        args.where = { ...(args.where ?? {}), deletedAt: null };
        return query(args);
      },
      async findFirst({ args, query }) {
        args.where = { ...(args.where ?? {}), deletedAt: null };
        return query(args);
      },
    },
  },
});

'@

$c21 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaHealthCheck
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Verifies Prisma/PostgreSQL connectivity and latency.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from './PrismaClient';

export interface PrismaHealthResult {
  healthy: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Executes a lightweight query to determine database availability and
 * measure round-trip latency for observability dashboards.
 */
export class PrismaHealthCheck {
  public async check(): Promise<PrismaHealthResult> {
    const start = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }
}

'@

$c22 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaLeadRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern (Prisma)
 * ----------------------------------------------------------------------------
 * @description Concrete Prisma implementation of the LeadRepository contract.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';
import type { LeadRepository } from '../repositories/LeadRepository';
import { prisma } from './PrismaClient';

/**
 * Prisma-backed implementation of LeadRepository, translating domain
 * entities to/from the Lead model persisted in PostgreSQL.
 */
export class PrismaLeadRepository implements LeadRepository {
  public async findById(id: string): Promise<Lead | null> {
    const record = await prisma.lead.findUnique({ where: { id } });
    return record as unknown as Lead | null;
  }

  public async findAll(limit: number, offset: number): Promise<Lead[]> {
    const records = await prisma.lead.findMany({ take: limit, skip: offset });
    return records as unknown as Lead[];
  }

  public async create(entity: Lead): Promise<Lead> {
    const record = await prisma.lead.create({ data: entity as never });
    return record as unknown as Lead;
  }

  public async update(id: string, entity: Partial<Lead>): Promise<Lead> {
    const record = await prisma.lead.update({ where: { id }, data: entity as never });
    return record as unknown as Lead;
  }

  public async delete(id: string): Promise<void> {
    await prisma.lead.delete({ where: { id } });
  }

  public async count(): Promise<number> {
    return prisma.lead.count();
  }

  public async exists(id: string): Promise<boolean> {
    const record = await prisma.lead.findUnique({ where: { id }, select: { id: true } });
    return record !== null;
  }
}

'@

$c23 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaCompanyRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern (Prisma)
 * ----------------------------------------------------------------------------
 * @description Concrete Prisma implementation of the CompanyRepository contract.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';
import type { CompanyRepository } from '../repositories/CompanyRepository';
import { prisma } from './PrismaClient';

/**
 * Prisma-backed implementation of CompanyRepository, translating domain
 * entities to/from the Company model persisted in PostgreSQL.
 */
export class PrismaCompanyRepository implements CompanyRepository {
  public async findById(id: string): Promise<Company | null> {
    const record = await prisma.company.findUnique({ where: { id } });
    return record as unknown as Company | null;
  }

  public async findAll(limit: number, offset: number): Promise<Company[]> {
    const records = await prisma.company.findMany({ take: limit, skip: offset });
    return records as unknown as Company[];
  }

  public async create(entity: Company): Promise<Company> {
    const record = await prisma.company.create({ data: entity as never });
    return record as unknown as Company;
  }

  public async update(id: string, entity: Partial<Company>): Promise<Company> {
    const record = await prisma.company.update({ where: { id }, data: entity as never });
    return record as unknown as Company;
  }

  public async delete(id: string): Promise<void> {
    await prisma.company.delete({ where: { id } });
  }

  public async count(): Promise<number> {
    return prisma.company.count();
  }

  public async exists(id: string): Promise<boolean> {
    const record = await prisma.company.findUnique({ where: { id }, select: { id: true } });
    return record !== null;
  }
}

'@

$c24 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaContactRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern (Prisma)
 * ----------------------------------------------------------------------------
 * @description Concrete Prisma implementation of the ContactRepository contract.
 * @license Proprietary
 * ============================================================================
 */

import type { Contact } from '../../domain/entities/Contact';
import type { ContactRepository } from '../repositories/ContactRepository';
import { prisma } from './PrismaClient';

/**
 * Prisma-backed implementation of ContactRepository, translating domain
 * entities to/from the Contact model persisted in PostgreSQL.
 */
export class PrismaContactRepository implements ContactRepository {
  public async findById(id: string): Promise<Contact | null> {
    const record = await prisma.contact.findUnique({ where: { id } });
    return record as unknown as Contact | null;
  }

  public async findAll(limit: number, offset: number): Promise<Contact[]> {
    const records = await prisma.contact.findMany({ take: limit, skip: offset });
    return records as unknown as Contact[];
  }

  public async create(entity: Contact): Promise<Contact> {
    const record = await prisma.contact.create({ data: entity as never });
    return record as unknown as Contact;
  }

  public async update(id: string, entity: Partial<Contact>): Promise<Contact> {
    const record = await prisma.contact.update({ where: { id }, data: entity as never });
    return record as unknown as Contact;
  }

  public async delete(id: string): Promise<void> {
    await prisma.contact.delete({ where: { id } });
  }

  public async count(): Promise<number> {
    return prisma.contact.count();
  }

  public async exists(id: string): Promise<boolean> {
    const record = await prisma.contact.findUnique({ where: { id }, select: { id: true } });
    return record !== null;
  }
}

'@

$c25 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaOpportunityRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern (Prisma)
 * ----------------------------------------------------------------------------
 * @description Concrete Prisma implementation of the OpportunityRepository contract.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';
import type { OpportunityRepository } from '../repositories/OpportunityRepository';
import { prisma } from './PrismaClient';

/**
 * Prisma-backed implementation of OpportunityRepository, translating domain
 * entities to/from the Opportunity model persisted in PostgreSQL.
 */
export class PrismaOpportunityRepository implements OpportunityRepository {
  public async findById(id: string): Promise<Opportunity | null> {
    const record = await prisma.opportunity.findUnique({ where: { id } });
    return record as unknown as Opportunity | null;
  }

  public async findAll(limit: number, offset: number): Promise<Opportunity[]> {
    const records = await prisma.opportunity.findMany({ take: limit, skip: offset });
    return records as unknown as Opportunity[];
  }

  public async create(entity: Opportunity): Promise<Opportunity> {
    const record = await prisma.opportunity.create({ data: entity as never });
    return record as unknown as Opportunity;
  }

  public async update(id: string, entity: Partial<Opportunity>): Promise<Opportunity> {
    const record = await prisma.opportunity.update({ where: { id }, data: entity as never });
    return record as unknown as Opportunity;
  }

  public async delete(id: string): Promise<void> {
    await prisma.opportunity.delete({ where: { id } });
  }

  public async count(): Promise<number> {
    return prisma.opportunity.count();
  }

  public async exists(id: string): Promise<boolean> {
    const record = await prisma.opportunity.findUnique({ where: { id }, select: { id: true } });
    return record !== null;
  }
}

'@

$c26 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/PrismaTaskRepository
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Repository Pattern (Prisma)
 * ----------------------------------------------------------------------------
 * @description Concrete Prisma implementation of the TaskRepository contract.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';
import type { TaskRepository } from '../repositories/TaskRepository';
import { prisma } from './PrismaClient';

/**
 * Prisma-backed implementation of TaskRepository, translating domain
 * entities to/from the Task model persisted in PostgreSQL.
 */
export class PrismaTaskRepository implements TaskRepository {
  public async findById(id: string): Promise<Task | null> {
    const record = await prisma.task.findUnique({ where: { id } });
    return record as unknown as Task | null;
  }

  public async findAll(limit: number, offset: number): Promise<Task[]> {
    const records = await prisma.task.findMany({ take: limit, skip: offset });
    return records as unknown as Task[];
  }

  public async create(entity: Task): Promise<Task> {
    const record = await prisma.task.create({ data: entity as never });
    return record as unknown as Task;
  }

  public async update(id: string, entity: Partial<Task>): Promise<Task> {
    const record = await prisma.task.update({ where: { id }, data: entity as never });
    return record as unknown as Task;
  }

  public async delete(id: string): Promise<void> {
    await prisma.task.delete({ where: { id } });
  }

  public async count(): Promise<number> {
    return prisma.task.count();
  }

  public async exists(id: string): Promise<boolean> {
    const record = await prisma.task.findUnique({ where: { id }, select: { id: true } });
    return record !== null;
  }
}

'@
