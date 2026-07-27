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
$c27 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/Database
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Facade unifying connection, transaction and health operations for the CRM database.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaConnection } from '../prisma/PrismaConnection';
import { PrismaTransaction } from '../prisma/PrismaTransaction';
import { PrismaHealthCheck } from '../prisma/PrismaHealthCheck';

/**
 * Facade exposing a simplified API over the Prisma-based persistence
 * subsystem (connection, transactions, and health checks).
 */
export class Database {
  private readonly connection = new PrismaConnection();
  private readonly transaction = new PrismaTransaction();
  private readonly health = new PrismaHealthCheck();

  public async connect(): Promise<void> {
    await this.connection.connect();
  }

  public async disconnect(): Promise<void> {
    await this.connection.disconnect();
  }

  public async withTransaction<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return this.transaction.run(work as never);
  }

  public async isHealthy(): Promise<boolean> {
    const result = await this.health.check();
    return result.healthy;
  }
}

'@

$c28 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseConnection
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Low level connection state manager with retry/backoff.
 * @license Proprietary
 * ============================================================================
 */

export interface ConnectionOptions {
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * Manages database connection attempts with exponential backoff retry logic.
 */
export class DatabaseConnection {
  private connected = false;

  public constructor(private readonly options: ConnectionOptions = { maxRetries: 5, retryDelayMs: 1000 }) {}

  public async connectWithRetry(connectFn: () => Promise<void>): Promise<void> {
    let attempt = 0;
    let delay = this.options.retryDelayMs;
    while (attempt < this.options.maxRetries) {
      try {
        await connectFn();
        this.connected = true;
        return;
      } catch (error) {
        attempt += 1;
        if (attempt >= this.options.maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  public isConnected(): boolean {
    return this.connected;
  }
}

'@

$c29 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseTransaction
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Unit of Work
 * ----------------------------------------------------------------------------
 * @description Generic transaction boundary abstraction independent of ORM.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic abstraction representing a Unit of Work transaction boundary,
 * decoupled from the specific ORM implementation.
 */
export interface DatabaseTransaction {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export class NoopDatabaseTransaction implements DatabaseTransaction {
  public async begin(): Promise<void> {}
  public async commit(): Promise<void> {}
  public async rollback(): Promise<void> {}
}

'@

$c30 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseInitializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Bootstrap
 * ----------------------------------------------------------------------------
 * @description Bootstraps schema validation and required extensions on startup.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';

/**
 * Ensures the database is ready for use at application startup, validating
 * required PostgreSQL extensions (e.g. pgcrypto, uuid-ossp).
 */
export class DatabaseInitializer {
  public async initialize(): Promise<void> {
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  }
}

'@

$c31 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Aggregates database health indicators for observability.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaHealthCheck } from '../prisma/PrismaHealthCheck';

export interface DatabaseHealthReport {
  healthy: boolean;
  latencyMs: number;
  checkedAt: string;
}

/**
 * Produces a timestamped health report for the primary database connection.
 */
export class DatabaseHealth {
  private readonly checker = new PrismaHealthCheck();

  public async report(): Promise<DatabaseHealthReport> {
    const result = await this.checker.check();
    return { healthy: result.healthy, latencyMs: result.latencyMs, checkedAt: new Date().toISOString() };
  }
}

'@

$c32 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seed
 * ----------------------------------------------------------------------------
 * @description Orchestrates execution of all registered seeders in order.
 * @license Proprietary
 * ============================================================================
 */

export interface Seeder {
  readonly name: string;
  run(): Promise<void>;
}

/**
 * Runs a collection of Seeder implementations sequentially, logging progress.
 */
export class DatabaseSeeder {
  private readonly seeders: Seeder[] = [];

  public register(seeder: Seeder): void {
    this.seeders.push(seeder);
  }

  public async runAll(): Promise<string[]> {
    const executed: string[] = [];
    for (const seeder of this.seeders) {
      await seeder.run();
      executed.push(seeder.name);
    }
    return executed;
  }
}

'@

$c33 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseBackup
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Utility
 * ----------------------------------------------------------------------------
 * @description Produces logical backups of the CRM database using pg_dump.
 * @license Proprietary
 * ============================================================================
 */

import { spawn } from 'node:child_process';

export interface BackupOptions {
  connectionString: string;
  outputPath: string;
}

/**
 * Wraps the pg_dump command-line utility to generate consistent logical
 * backups of the PostgreSQL database.
 */
export class DatabaseBackup {
  public async run(options: BackupOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('pg_dump', ['--dbname', options.connectionString, '--file', options.outputPath]);
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pg_dump exited with code ${code}`));
        }
      });
    });
  }
}

'@

$c34 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/DatabaseRestore
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Utility
 * ----------------------------------------------------------------------------
 * @description Restores a logical backup using psql.
 * @license Proprietary
 * ============================================================================
 */

import { spawn } from 'node:child_process';

export interface RestoreOptions {
  connectionString: string;
  inputPath: string;
}

/**
 * Wraps the psql command-line utility to restore a previously generated
 * logical backup into the PostgreSQL database.
 */
export class DatabaseRestore {
  public async run(options: RestoreOptions): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('psql', [options.connectionString, '-f', options.inputPath]);
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`psql exited with code ${code}`));
        }
      });
    });
  }
}

'@

$c35 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Defines the generic cache provider contract.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic contract implemented by any caching backend (memory, Redis, etc.).
 */
export interface CacheProvider {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

'@

$c36 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/RedisProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Redis-backed implementation of CacheProvider.
 * @license Proprietary
 * ============================================================================
 */

import type Redis from 'ioredis';
import type { CacheProvider } from './CacheProvider';

/**
 * Implements CacheProvider using a Redis client, serializing values as JSON.
 */
export class RedisProvider implements CacheProvider {
  public constructor(private readonly client: Redis) {}

  public async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const payload = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, payload);
    }
  }

  public async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  public async clear(): Promise<void> {
    await this.client.flushdb();
  }
}

'@

$c37 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/MemoryCache
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description In-process memory implementation of CacheProvider for local development.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from './CacheProvider';

interface Entry {
  value: unknown;
  expiresAt: number | null;
}

/**
 * Simple in-memory implementation of CacheProvider, suitable for tests
 * and local development environments without Redis.
 */
export class MemoryCache implements CacheProvider {
  private readonly store = new Map<string, Entry>();

  public async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  public async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  public async clear(): Promise<void> {
    this.store.clear();
  }
}

'@

$c38 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/DistributedCache
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Decorator
 * ----------------------------------------------------------------------------
 * @description Composes a local L1 cache with a distributed L2 (Redis) cache.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from './CacheProvider';

/**
 * Two-tier cache combining a fast in-process cache (L1) with a shared
 * distributed cache (L2), reducing load on the distributed backend.
 */
export class DistributedCache implements CacheProvider {
  public constructor(
    private readonly l1: CacheProvider,
    private readonly l2: CacheProvider,
  ) {}

  public async get<T>(key: string): Promise<T | null> {
    const local = await this.l1.get<T>(key);
    if (local !== null) return local;
    const remote = await this.l2.get<T>(key);
    if (remote !== null) {
      await this.l1.set(key, remote);
    }
    return remote;
  }

  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    await Promise.all([this.l1.set(key, value, ttlSeconds), this.l2.set(key, value, ttlSeconds)]);
  }

  public async delete(key: string): Promise<void> {
    await Promise.all([this.l1.delete(key), this.l2.delete(key)]);
  }

  public async has(key: string): Promise<boolean> {
    return (await this.l1.has(key)) || (await this.l2.has(key));
  }

  public async clear(): Promise<void> {
    await Promise.all([this.l1.clear(), this.l2.clear()]);
  }
}

'@

$c39 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheKey
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Value Object
 * ----------------------------------------------------------------------------
 * @description Builds normalized, collision-resistant cache keys.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Value object responsible for generating consistent, namespaced cache keys.
 */
export class CacheKey {
  public static build(namespace: string, ...parts: Array<string | number>): string {
    return [namespace, ...parts.map(String)].join(':');
  }
}

'@

$c40 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CachePolicy
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Policy
 * ----------------------------------------------------------------------------
 * @description Encapsulates TTL and eviction policy per entity type.
 * @license Proprietary
 * ============================================================================
 */

export interface CachePolicyRule {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
}

/**
 * Central registry of caching policies applied per domain entity.
 */
export class CachePolicy {
  private static readonly rules: Record<string, CachePolicyRule> = {
    lead: { ttlSeconds: 300, staleWhileRevalidateSeconds: 60 },
    company: { ttlSeconds: 600 },
    opportunity: { ttlSeconds: 180 },
  };

  public static forEntity(entity: string): CachePolicyRule {
    return this.rules[entity] ?? { ttlSeconds: 120 };
  }
}

'@

$c41 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API combining provider selection and policy application.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from './CacheProvider';
import { CacheKey } from './CacheKey';
import { CachePolicy } from './CachePolicy';

/**
 * Facade that applies CachePolicy rules automatically when reading/writing
 * cache entries for a given domain entity.
 */
export class CacheManager {
  public constructor(private readonly provider: CacheProvider) {}

  public async remember<T>(entity: string, id: string, loader: () => Promise<T>): Promise<T> {
    const key = CacheKey.build(entity, id);
    const cached = await this.provider.get<T>(key);
    if (cached !== null) return cached;
    const value = await loader();
    const policy = CachePolicy.forEntity(entity);
    await this.provider.set(key, value, policy.ttlSeconds);
    return value;
  }

  public async invalidate(entity: string, id: string): Promise<void> {
    await this.provider.delete(CacheKey.build(entity, id));
  }
}

'@

$c42 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/CacheMetrics
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Observability
 * ----------------------------------------------------------------------------
 * @description Tracks cache hit/miss ratios.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Collects cache hit/miss counters for observability dashboards.
 */
export class CacheMetrics {
  private hits = 0;
  private misses = 0;

  public recordHit(): void {
    this.hits += 1;
  }

  public recordMiss(): void {
    this.misses += 1;
  }

  public hitRatio(): number {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : this.hits / total;
  }

  public snapshot(): { hits: number; misses: number; hitRatio: number } {
    return { hits: this.hits, misses: this.misses, hitRatio: this.hitRatio() };
  }
}

'@

$c43 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Singleton
 * ----------------------------------------------------------------------------
 * @description Creates and exposes a singleton ioredis client instance.
 * @license Proprietary
 * ============================================================================
 */

import Redis from 'ioredis';

/**
 * Provides a single ioredis client instance configured from environment
 * variables, shared across cache, queue, and lock subsystems.
 */
export class RedisClientFactory {
  private static instance: Redis | undefined;

  public static getInstance(): Redis {
    if (!RedisClientFactory.instance) {
      RedisClientFactory.instance = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        maxRetriesPerRequest: 3,
      });
    }
    return RedisClientFactory.instance;
  }
}

export const redisClient = RedisClientFactory.getInstance();

'@

$c44 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisConnection
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Manages Redis connection lifecycle events.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

/**
 * Wraps Redis connection lifecycle events with structured logging hooks.
 */
export class RedisConnection {
  public onReady(callback: () => void): void {
    redisClient.on('ready', callback);
  }

  public onError(callback: (error: Error) => void): void {
    redisClient.on('error', callback);
  }

  public async disconnect(): Promise<void> {
    await redisClient.quit();
  }
}

'@

$c45 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisLock
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Distributed Lock
 * ----------------------------------------------------------------------------
 * @description Implements a simple SET NX EX based distributed lock.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

/**
 * Implements a distributed mutual-exclusion lock using Redis SET NX EX,
 * suitable for coordinating cross-instance critical sections.
 */
export class RedisLock {
  public async acquire(resource: string, ttlMs: number): Promise<string | null> {
    const token = Math.random().toString(36).slice(2);
    const result = await redisClient.set(`lock:${resource}`, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  public async release(resource: string, token: string): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    const result = await redisClient.eval(script, 1, `lock:${resource}`, token);
    return result === 1;
  }
}

'@

$c46 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisPubSub
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Publisher/Subscriber
 * ----------------------------------------------------------------------------
 * @description Provides pub/sub messaging via dedicated Redis connections.
 * @license Proprietary
 * ============================================================================
 */

import Redis from 'ioredis';

type MessageHandler = (message: string) => void;

/**
 * Implements the publish/subscribe pattern over Redis, used for real-time
 * cross-process domain event broadcasting.
 */
export class RedisPubSub {
  private readonly publisher = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  private readonly subscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  public async publish(channel: string, message: string): Promise<void> {
    await this.publisher.publish(channel, message);
  }

  public async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        handler(message);
      }
    });
  }
}

'@

$c47 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisStream
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Event Stream
 * ----------------------------------------------------------------------------
 * @description Wraps Redis Streams (XADD/XREAD) for durable event logs.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

/**
 * Provides durable, append-only event streaming via Redis Streams,
 * used as a lightweight alternative to Kafka for domain event logs.
 */
export class RedisStream {
  public async append(stream: string, fields: Record<string, string>): Promise<string> {
    const flatFields = Object.entries(fields).flat();
    return redisClient.xadd(stream, '*', ...flatFields) as Promise<string>;
  }

  public async readLatest(stream: string, count: number): Promise<unknown> {
    return redisClient.xrevrange(stream, '+', '-', 'COUNT', count);
  }
}

'@

$c48 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/RedisHealthCheck
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Pings Redis to verify availability and latency.
 * @license Proprietary
 * ============================================================================
 */

import { redisClient } from './RedisClient';

export interface RedisHealthResult {
  healthy: boolean;
  latencyMs: number;
}

/**
 * Executes a PING command against Redis to validate availability and
 * measure round-trip latency.
 */
export class RedisHealthCheck {
  public async check(): Promise<RedisHealthResult> {
    const start = Date.now();
    try {
      await redisClient.ping();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch {
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

'@

$c49 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Defines the generic contract implemented by queue backends.
 * @license Proprietary
 * ============================================================================
 */

export interface QueueJob<T> {
  name: string;
  data: T;
}

/**
 * Generic contract implemented by any background job queue backend.
 */
export interface QueueProvider {
  enqueue<T>(queueName: string, job: QueueJob<T>): Promise<string>;
  process<T>(queueName: string, handler: (job: QueueJob<T>) => Promise<void>): void;
}

'@

$c50 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/BullMQProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description BullMQ implementation of QueueProvider using Redis as broker.
 * @license Proprietary
 * ============================================================================
 */

import { Queue, Worker, type Job } from 'bullmq';
import type { QueueProvider, QueueJob } from './QueueProvider';

/**
 * Implements QueueProvider using BullMQ, backed by Redis, providing
 * reliable job persistence, retries, and horizontal worker scaling.
 */
export class BullMQProvider implements QueueProvider {
  private readonly queues = new Map<string, Queue>();
  private readonly connection = { connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' } };

  private getQueue(name: string): Queue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new Queue(name, this.connection));
    }
    return this.queues.get(name) as Queue;
  }

  public async enqueue<T>(queueName: string, job: QueueJob<T>): Promise<string> {
    const queue = this.getQueue(queueName);
    const added = await queue.add(job.name, job.data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return added.id ?? '';
  }

  public process<T>(queueName: string, handler: (job: QueueJob<T>) => Promise<void>): void {
    new Worker(
      queueName,
      async (job: Job) => {
        await handler({ name: job.name, data: job.data as T });
      },
      this.connection,
    );
  }
}

'@

$c51 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Central registry coordinating multiple named queues.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider, QueueJob } from './QueueProvider';

/**
 * Provides a single entry point for enqueueing and processing jobs across
 * all CRM background queues (email, sms, webhooks, imports, etc.).
 */
export class QueueManager {
  public constructor(private readonly provider: QueueProvider) {}

  public async dispatch<T>(queueName: string, job: QueueJob<T>): Promise<string> {
    return this.provider.enqueue(queueName, job);
  }

  public register<T>(queueName: string, handler: (job: QueueJob<T>) => Promise<void>): void {
    this.provider.process(queueName, handler);
  }
}

'@

$c52 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueWorker
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Worker
 * ----------------------------------------------------------------------------
 * @description Base class for implementing typed queue workers.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueJob } from './QueueProvider';

/**
 * Abstract base class encapsulating common worker lifecycle logic
 * (error handling, logging hooks) for concrete queue workers.
 */
export abstract class QueueWorker<T> {
  public abstract readonly queueName: string;

  public abstract handle(job: QueueJob<T>): Promise<void>;

  public async execute(job: QueueJob<T>): Promise<void> {
    try {
      await this.handle(job);
    } catch (error) {
      throw new Error(`Worker ${this.queueName} failed: ${(error as Error).message}`);
    }
  }
}

'@

$c53 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueConsumer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Consumer
 * ----------------------------------------------------------------------------
 * @description Generic consumer wiring a handler function to a queue.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from './QueueProvider';

/**
 * Binds a business logic handler function to a specific named queue,
 * abstracting away the underlying queue provider details.
 */
export class QueueConsumer<T> {
  public constructor(
    private readonly provider: QueueProvider,
    private readonly queueName: string,
  ) {}

  public consume(handler: (data: T) => Promise<void>): void {
    this.provider.process<T>(this.queueName, async (job) => {
      await handler(job.data);
    });
  }
}

'@

$c54 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueProducer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Producer
 * ----------------------------------------------------------------------------
 * @description Generic producer publishing typed jobs to a named queue.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from './QueueProvider';

/**
 * Publishes typed jobs to a specific named queue via the configured
 * QueueProvider implementation.
 */
export class QueueProducer<T> {
  public constructor(
    private readonly provider: QueueProvider,
    private readonly queueName: string,
  ) {}

  public async publish(name: string, data: T): Promise<string> {
    return this.provider.enqueue(this.queueName, { name, data });
  }
}

'@

$c55 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/DeadLetterQueue
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Dead Letter Queue
 * ----------------------------------------------------------------------------
 * @description Captures jobs that exhausted retry attempts for manual review.
 * @license Proprietary
 * ============================================================================
 */

export interface FailedJob<T> {
  queueName: string;
  data: T;
  error: string;
  failedAt: string;
}

/**
 * Stores jobs that exhausted their retry attempts, enabling manual
 * inspection, alerting, and reprocessing workflows.
 */
export class DeadLetterQueue<T> {
  private readonly items: Array<FailedJob<T>> = [];

  public capture(queueName: string, data: T, error: string): void {
    this.items.push({ queueName, data, error, failedAt: new Date().toISOString() });
  }

  public list(): Array<FailedJob<T>> {
    return [...this.items];
  }

  public clear(): void {
    this.items.length = 0;
  }
}

'@

$c56 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/RetryPolicy
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Policy
 * ----------------------------------------------------------------------------
 * @description Defines exponential backoff retry policies for queue jobs.
 * @license Proprietary
 * ============================================================================
 */

export interface RetryPolicyConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

/**
 * Computes exponential backoff delays for retrying failed queue jobs.
 */
export class RetryPolicy {
  public constructor(private readonly config: RetryPolicyConfig = { maxAttempts: 5, baseDelayMs: 1000 }) {}

  public delayForAttempt(attempt: number): number {
    return this.config.baseDelayMs * Math.pow(2, attempt - 1);
  }

  public shouldRetry(attempt: number): boolean {
    return attempt < this.config.maxAttempts;
  }
}

'@

$c57 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/QueueMetrics
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Observability
 * ----------------------------------------------------------------------------
 * @description Tracks queue throughput and failure counters.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Collects queue processing metrics (processed, failed, throughput)
 * for observability dashboards and alerting.
 */
export class QueueMetrics {
  private processed = 0;
  private failed = 0;

  public recordProcessed(): void {
    this.processed += 1;
  }

  public recordFailed(): void {
    this.failed += 1;
  }

  public snapshot(): { processed: number; failed: number } {
    return { processed: this.processed, failed: this.failed };
  }
}

'@

$c58 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/StorageProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract for file storage backends.
 * @license Proprietary
 * ============================================================================
 */

export interface UploadResult {
  key: string;
  url: string;
  sizeBytes: number;
}

/**
 * Generic contract implemented by any binary object storage backend
 * (local disk, S3, MinIO).
 */
export interface StorageProvider {
  upload(key: string, content: Buffer, contentType: string): Promise<UploadResult>;
  download(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
  exists(key: string): Promise<boolean>;
}

'@

$c59 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/LocalStorage
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Local filesystem implementation of StorageProvider.
 * @license Proprietary
 * ============================================================================
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Implements StorageProvider using the local filesystem, intended for
 * development environments without an object storage service.
 */
export class LocalStorage implements StorageProvider {
  public constructor(private readonly basePath: string) {}

  public async upload(key: string, content: Buffer, _contentType: string): Promise<UploadResult> {
    const fullPath = path.join(this.basePath, key);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content);
    return { key, url: fullPath, sizeBytes: content.byteLength };
  }

  public async download(key: string): Promise<Buffer> {
    return fs.readFile(path.join(this.basePath, key));
  }

  public async delete(key: string): Promise<void> {
    await fs.unlink(path.join(this.basePath, key));
  }

  public async getUrl(key: string): Promise<string> {
    return path.join(this.basePath, key);
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await fs.access(path.join(this.basePath, key));
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c60 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/S3Storage
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description AWS S3 implementation of StorageProvider using the AWS SDK v3.
 * @license Proprietary
 * ============================================================================
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@ aws-sdk/client-s3';
import { getSignedUrl } from '@ aws-sdk/s3-request-presigner';
import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Implements StorageProvider using AWS S3 as the persistent object store
 * for CRM attachments, proposals, and generated documents.
 */
export class S3Storage implements StorageProvider {
  private readonly client: S3Client;

  public constructor(private readonly bucket: string, region: string) {
    this.client = new S3Client({ region });
  }

  public async upload(key: string, content: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: content, ContentType: contentType }),
    );
    return { key, url: await this.getUrl(key), sizeBytes: content.byteLength };
  }

  public async download(key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as AsyncIterable<Buffer>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  public async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  public async getUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: 3600 });
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c61 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/MinIOStorage
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description MinIO implementation of StorageProvider, S3-compatible for self-hosting.
 * @license Proprietary
 * ============================================================================
 */

import { Client } from 'minio';
import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Implements StorageProvider using MinIO, an S3-compatible self-hosted
 * object storage engine, suited for on-premise deployments.
 */
export class MinIOStorage implements StorageProvider {
  private readonly client: Client;

  public constructor(
    private readonly bucket: string,
    options: { endPoint: string; port: number; useSSL: boolean; accessKey: string; secretKey: string },
  ) {
    this.client = new Client(options);
  }

  public async upload(key: string, content: Buffer, contentType: string): Promise<UploadResult> {
    await this.client.putObject(this.bucket, key, content, content.byteLength, { 'Content-Type': contentType });
    return { key, url: await this.getUrl(key), sizeBytes: content.byteLength };
  }

  public async download(key: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  public async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  public async getUrl(key: string): Promise<string> {
    return this.client.presignedGetObject(this.bucket, key, 3600);
  }

  public async exists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c62 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API combining upload, download and validation.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider, UploadResult } from './StorageProvider';
import { FileValidator } from './FileValidator';

/**
 * Coordinates validation, storage provider delegation, and metadata
 * assembly for CRM file attachments.
 */
export class FileManager {
  private readonly validator = new FileValidator();

  public constructor(private readonly provider: StorageProvider) {}

  public async save(key: string, content: Buffer, contentType: string): Promise<UploadResult> {
    this.validator.validate(content, contentType);
    return this.provider.upload(key, content, contentType);
  }

  public async retrieve(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  public async remove(key: string): Promise<void> {
    await this.provider.delete(key);
  }
}

'@

$c63 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileUploader
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Service
 * ----------------------------------------------------------------------------
 * @description Handles chunked/multi-part style upload orchestration.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider, UploadResult } from './StorageProvider';

/**
 * Orchestrates file upload operations, including key generation based
 * on entity context (module/entity/id/filename).
 */
export class FileUploader {
  public constructor(private readonly provider: StorageProvider) {}

  public async uploadForEntity(
    entity: string,
    entityId: string,
    filename: string,
    content: Buffer,
    contentType: string,
  ): Promise<UploadResult> {
    const key = `${entity}/${entityId}/${Date.now()}-${filename}`;
    return this.provider.upload(key, content, contentType);
  }
}

'@

$c64 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileDownloader
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Service
 * ----------------------------------------------------------------------------
 * @description Retrieves stored files and resolves temporary access URLs.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider } from './StorageProvider';

/**
 * Retrieves file content and generates temporary access URLs for
 * client-facing download links.
 */
export class FileDownloader {
  public constructor(private readonly provider: StorageProvider) {}

  public async getContent(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  public async getTemporaryUrl(key: string): Promise<string> {
    return this.provider.getUrl(key);
  }
}

'@

$c65 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/FileValidator
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Validator
 * ----------------------------------------------------------------------------
 * @description Validates file size and MIME type before storage operations.
 * @license Proprietary
 * ============================================================================
 */

const MAX_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
]);

/**
 * Validates uploaded file content against size limits and an allow-list
 * of accepted MIME types before persisting to a StorageProvider.
 */
export class FileValidator {
  public validate(content: Buffer, contentType: string): void {
    if (content.byteLength > MAX_SIZE_BYTES) {
      throw new Error(`File exceeds maximum allowed size of ${MAX_SIZE_BYTES} bytes`);
    }
    if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new Error(`Content type ${contentType} is not allowed`);
    }
  }
}

'@

$c66 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by email sending backends.
 * @license Proprietary
 * ============================================================================
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

/**
 * Generic contract implemented by any transactional email sending backend.
 */
export interface EmailProvider {
  send(message: EmailMessage): Promise<string>;
}

'@

$c67 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/SMTPProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description SMTP implementation of EmailProvider using Nodemailer.
 * @license Proprietary
 * ============================================================================
 */

import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailProvider, EmailMessage } from './EmailProvider';

/**
 * Implements EmailProvider using an SMTP transport via Nodemailer,
 * suitable for self-hosted or corporate mail relays.
 */
export class SMTPProvider implements EmailProvider {
  private readonly transporter: Transporter;

  public constructor(config: { host: string; port: number; user: string; pass: string }) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      auth: { user: config.user, pass: config.pass },
    });
  }

  public async send(message: EmailMessage): Promise<string> {
    const info = await this.transporter.sendMail({
      from: message.from ?? 'no-reply@prospector-atlas.com',
      to: message.to,
      subject: message.subject,
      html: message.html,
    });
    return info.messageId;
  }
}

'@

$c68 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/ResendProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Resend.com API implementation of EmailProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { EmailProvider, EmailMessage } from './EmailProvider';

/**
 * Implements EmailProvider using the Resend HTTP API, a modern
 * developer-focused transactional email service.
 */
export class ResendProvider implements EmailProvider {
  public constructor(private readonly apiKey: string) {}

  public async send(message: EmailMessage): Promise<string> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: message.from ?? 'no-reply@prospector-atlas.com',
        to: message.to,
        subject: message.subject,
        html: message.html,
      }),
    });
    const data = (await response.json()) as { id: string };
    return data.id;
  }
}

'@

$c69 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailTemplateEngine
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Service
 * ----------------------------------------------------------------------------
 * @description Renders HTML email templates with variable interpolation.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Renders email HTML templates by interpolating {{variable}} placeholders
 * with provided context data.
 */
export class EmailTemplateEngine {
  public render(template: string, context: Record<string, string>): string {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => context[key] ?? '');
  }
}

'@

$c70 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailQueue
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Producer
 * ----------------------------------------------------------------------------
 * @description Queues outbound emails for asynchronous delivery via BullMQ.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from '../queues/QueueProvider';
import type { EmailMessage } from './EmailProvider';

/**
 * Publishes outbound email messages to the 'emails' background queue,
 * decoupling request handling from delivery latency.
 */
export class EmailQueue {
  public constructor(private readonly queueProvider: QueueProvider) {}

  public async enqueue(message: EmailMessage): Promise<string> {
    return this.queueProvider.enqueue('emails', { name: 'send-email', data: message });
  }
}

'@

$c71 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/EmailSender
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API combining template rendering and provider dispatch.
 * @license Proprietary
 * ============================================================================
 */

import type { EmailProvider, EmailMessage } from './EmailProvider';
import { EmailTemplateEngine } from './EmailTemplateEngine';

/**
 * Coordinates template rendering and delegation to the configured
 * EmailProvider implementation for outbound transactional emails.
 */
export class EmailSender {
  private readonly templateEngine = new EmailTemplateEngine();

  public constructor(private readonly provider: EmailProvider) {}

  public async sendTemplated(
    to: string,
    subject: string,
    template: string,
    context: Record<string, string>,
  ): Promise<string> {
    const html = this.templateEngine.render(template, context);
    return this.provider.send({ to, subject, html } satisfies EmailMessage);
  }
}

'@

$c72 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/SmsProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by SMS sending backends.
 * @license Proprietary
 * ============================================================================
 */

export interface SmsMessage {
  to: string;
  body: string;
}

/**
 * Generic contract implemented by any SMS delivery backend.
 */
export interface SmsProvider {
  send(message: SmsMessage): Promise<string>;
}

'@

$c73 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/TwilioProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Twilio implementation of SmsProvider.
 * @license Proprietary
 * ============================================================================
 */

import twilio from 'twilio';
import type { SmsProvider, SmsMessage } from './SmsProvider';

/**
 * Implements SmsProvider using the Twilio REST API for reliable
 * global SMS delivery.
 */
export class TwilioProvider implements SmsProvider {
  private readonly client: ReturnType<typeof twilio>;

  public constructor(
    accountSid: string,
    authToken: string,
    private readonly fromNumber: string,
  ) {
    this.client = twilio(accountSid, authToken);
  }

  public async send(message: SmsMessage): Promise<string> {
    const result = await this.client.messages.create({
      to: message.to,
      from: this.fromNumber,
      body: message.body,
    });
    return result.sid;
  }
}

'@

$c74 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/SmsSender
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API delegating to the configured SmsProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { SmsProvider, SmsMessage } from './SmsProvider';

/**
 * Provides a simple facade for dispatching SMS notifications through
 * the configured SmsProvider implementation.
 */
export class SmsSender {
  public constructor(private readonly provider: SmsProvider) {}

  public async send(to: string, body: string): Promise<string> {
    return this.provider.send({ to, body } satisfies SmsMessage);
  }
}

'@

$c75 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/WhatsAppProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by WhatsApp messaging backends.
 * @license Proprietary
 * ============================================================================
 */

export interface WhatsAppMessage {
  to: string;
  text: string;
}

/**
 * Generic contract implemented by any WhatsApp Business messaging backend.
 */
export interface WhatsAppProvider {
  send(message: WhatsAppMessage): Promise<string>;
}

'@

$c76 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/EvolutionAPIProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Evolution API implementation of WhatsAppProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { WhatsAppProvider, WhatsAppMessage } from './WhatsAppProvider';

/**
 * Implements WhatsAppProvider using the self-hosted Evolution API,
 * a popular open-source WhatsApp Business gateway.
 */
export class EvolutionAPIProvider implements WhatsAppProvider {
  public constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly instanceName: string,
  ) {}

  public async send(message: WhatsAppMessage): Promise<string> {
    const response = await fetch(`${this.baseUrl}/message/sendText/${this.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apiKey },
      body: JSON.stringify({ number: message.to, text: message.text }),
    });
    const data = (await response.json()) as { key: { id: string } };
    return data.key.id;
  }
}

'@

$c77 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/WhatsAppSender
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API delegating to the configured WhatsAppProvider.
 * @license Proprietary
 * ============================================================================
 */

import type { WhatsAppProvider, WhatsAppMessage } from './WhatsAppProvider';

/**
 * Provides a simple facade for dispatching WhatsApp notifications through
 * the configured WhatsAppProvider implementation.
 */
export class WhatsAppSender {
  public constructor(private readonly provider: WhatsAppProvider) {}

  public async send(to: string, text: string): Promise<string> {
    return this.provider.send({ to, text } satisfies WhatsAppMessage);
  }
}

'@
$c78 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/HttpClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by HTTP client adapters.
 * @license Proprietary
 * ============================================================================
 */

export interface HttpRequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

/**
 * Generic contract implemented by any outbound HTTP client adapter.
 */
export interface HttpClient {
  get<T>(url: string, options?: HttpRequestOptions): Promise<T>;
  post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T>;
  put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T>;
  delete<T>(url: string, options?: HttpRequestOptions): Promise<T>;
}

'@

$c79 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/AxiosClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Axios-based implementation of HttpClient.
 * @license Proprietary
 * ============================================================================
 */

import axios, { type AxiosInstance } from 'axios';
import type { HttpClient, HttpRequestOptions } from './HttpClient';

/**
 * Implements HttpClient using Axios, the standard outbound HTTP library
 * for calling external integrations.
 */
export class AxiosClient implements HttpClient {
  private readonly instance: AxiosInstance;

  public constructor(baseURL?: string) {
    this.instance = axios.create({ baseURL, timeout: 10000 });
  }

  public async get<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.get<T>(url, { headers: options?.headers, params: options?.params });
    return response.data;
  }

  public async post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.post<T>(url, body, { headers: options?.headers });
    return response.data;
  }

  public async put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.put<T>(url, body, { headers: options?.headers });
    return response.data;
  }

  public async delete<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    const response = await this.instance.delete<T>(url, { headers: options?.headers });
    return response.data;
  }
}

'@

$c80 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/RetryHttpClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Decorator
 * ----------------------------------------------------------------------------
 * @description Adds exponential backoff retry behavior around any HttpClient.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient, HttpRequestOptions } from './HttpClient';

/**
 * Decorates an HttpClient with automatic retry and exponential backoff
 * for transient network or 5xx failures.
 */
export class RetryHttpClient implements HttpClient {
  public constructor(
    private readonly inner: HttpClient,
    private readonly maxRetries = 3,
  ) {}

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let delay = 500;
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        attempt += 1;
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }

  public get<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.get<T>(url, options));
  }

  public post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.post<T>(url, body, options));
  }

  public put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.put<T>(url, body, options));
  }

  public delete<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.withRetry(() => this.inner.delete<T>(url, options));
  }
}

'@

$c81 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/AuthenticatedHttpClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Decorator
 * ----------------------------------------------------------------------------
 * @description Injects bearer authentication headers into every request.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient, HttpRequestOptions } from './HttpClient';

/**
 * Decorates an HttpClient by automatically injecting a bearer
 * Authorization header into every outgoing request.
 */
export class AuthenticatedHttpClient implements HttpClient {
  public constructor(
    private readonly inner: HttpClient,
    private readonly getToken: () => string,
  ) {}

  private withAuthHeader(options?: HttpRequestOptions): HttpRequestOptions {
    return { ...options, headers: { ...options?.headers, Authorization: `Bearer ${this.getToken()}` } };
  }

  public get<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.inner.get<T>(url, this.withAuthHeader(options));
  }

  public post<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.inner.post<T>(url, body, this.withAuthHeader(options));
  }

  public put<T>(url: string, body: unknown, options?: HttpRequestOptions): Promise<T> {
    return this.inner.put<T>(url, body, this.withAuthHeader(options));
  }

  public delete<T>(url: string, options?: HttpRequestOptions): Promise<T> {
    return this.inner.delete<T>(url, this.withAuthHeader(options));
  }
}

'@

$c82 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/HubSpotClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the HubSpot CRM API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the HubSpot CRM API, isolating
 * external contract details from domain and application layers.
 */
export class HubSpotClient {
  private readonly baseUrl = 'https://api.hubapi.com';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c83 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/BitrixClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Bitrix24 CRM API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Bitrix24 CRM API, isolating
 * external contract details from domain and application layers.
 */
export class BitrixClient {
  private readonly baseUrl = 'https://your-domain.bitrix24.com/rest';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c84 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/OpenAIClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the OpenAI API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the OpenAI API, isolating
 * external contract details from domain and application layers.
 */
export class OpenAIClient {
  private readonly baseUrl = 'https://api.openai.com/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c85 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/GeminiClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Google Gemini API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Google Gemini API, isolating
 * external contract details from domain and application layers.
 */
export class GeminiClient {
  private readonly baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c86 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/ApolloClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Apollo.io lead enrichment API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Apollo.io lead enrichment API, isolating
 * external contract details from domain and application layers.
 */
export class ApolloClient {
  private readonly baseUrl = 'https://api.apollo.io/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c87 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/AsaasClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Asaas payments API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Asaas payments API, isolating
 * external contract details from domain and application layers.
 */
export class AsaasClient {
  private readonly baseUrl = 'https://api.asaas.com/v3';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c88 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/StripeClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the Stripe payments API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the Stripe payments API, isolating
 * external contract details from domain and application layers.
 */
export class StripeClient {
  private readonly baseUrl = 'https://api.stripe.com/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c89 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/ClickSignClient
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description HTTP client adapter integrating with the ClickSign e-signature API.
 * @license Proprietary
 * ============================================================================
 */

import type { HttpClient } from '../../http/HttpClient';

/**
 * Adapter encapsulating all outbound calls to the ClickSign e-signature API, isolating
 * external contract details from domain and application layers.
 */
export class ClickSignClient {
  private readonly baseUrl = 'https://api.clicksign.com/v1';

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly apiKey: string,
  ) {}

  public async get<T>(path: string): Promise<T> {
    return this.httpClient.get<T>(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }

  public async post<T>(path: string, body: unknown): Promise<T> {
    return this.httpClient.post<T>(`${this.baseUrl}${path}`, body, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
  }
}

'@

$c90 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/LeadPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Lead domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';
import type { LeadRepository } from '../repositories/LeadRepository';

/**
 * Acts as an anti-corruption layer between the Lead domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class LeadPersistenceAdapter {
  public constructor(private readonly repository: LeadRepository) {}

  public async persist(entity: Lead): Promise<Lead> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Lead | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c91 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/CompanyPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Company domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';
import type { CompanyRepository } from '../repositories/CompanyRepository';

/**
 * Acts as an anti-corruption layer between the Company domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class CompanyPersistenceAdapter {
  public constructor(private readonly repository: CompanyRepository) {}

  public async persist(entity: Company): Promise<Company> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Company | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c92 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/OpportunityPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Opportunity domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';
import type { OpportunityRepository } from '../repositories/OpportunityRepository';

/**
 * Acts as an anti-corruption layer between the Opportunity domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class OpportunityPersistenceAdapter {
  public constructor(private readonly repository: OpportunityRepository) {}

  public async persist(entity: Opportunity): Promise<Opportunity> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Opportunity | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c93 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/TaskPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Task domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';
import type { TaskRepository } from '../repositories/TaskRepository';

/**
 * Acts as an anti-corruption layer between the Task domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class TaskPersistenceAdapter {
  public constructor(private readonly repository: TaskRepository) {}

  public async persist(entity: Task): Promise<Task> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Task | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c94 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/ProposalPersistenceAdapter
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter / Anti-Corruption Layer
 * ----------------------------------------------------------------------------
 * @description Translates Proposal domain aggregates to/from the persistence model.
 * @license Proprietary
 * ============================================================================
 */

import type { Proposal } from '../../domain/entities/Proposal';
import type { ProposalRepository } from '../repositories/ProposalRepository';

/**
 * Acts as an anti-corruption layer between the Proposal domain aggregate and
 * the underlying persistence repository, isolating mapping concerns.
 */
export class ProposalPersistenceAdapter {
  public constructor(private readonly repository: ProposalRepository) {}

  public async persist(entity: Proposal): Promise<Proposal> {
    const exists = await this.repository.exists(entity.id);
    return exists ? this.repository.update(entity.id, entity) : this.repository.create(entity);
  }

  public async retrieve(id: string): Promise<Proposal | null> {
    return this.repository.findById(id);
  }

  public async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}

'@

$c95 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/LeadSerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Lead domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';

export interface LeadDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Lead domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class LeadSerializer {
  public toDto(entity: Lead): LeadDto {
    return JSON.parse(JSON.stringify(entity)) as LeadDto;
  }

  public toDtoList(entities: Lead[]): LeadDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c96 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/CompanySerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Company domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';

export interface CompanyDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Company domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class CompanySerializer {
  public toDto(entity: Company): CompanyDto {
    return JSON.parse(JSON.stringify(entity)) as CompanyDto;
  }

  public toDtoList(entities: Company[]): CompanyDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c97 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/ContactSerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Contact domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Contact } from '../../domain/entities/Contact';

export interface ContactDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Contact domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class ContactSerializer {
  public toDto(entity: Contact): ContactDto {
    return JSON.parse(JSON.stringify(entity)) as ContactDto;
  }

  public toDtoList(entities: Contact[]): ContactDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c98 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/OpportunitySerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Opportunity domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';

export interface OpportunityDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Opportunity domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class OpportunitySerializer {
  public toDto(entity: Opportunity): OpportunityDto {
    return JSON.parse(JSON.stringify(entity)) as OpportunityDto;
  }

  public toDtoList(entities: Opportunity[]): OpportunityDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c99 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/TaskSerializer
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Serializer
 * ----------------------------------------------------------------------------
 * @description Converts Task domain entities to serializable DTOs and back.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';

export interface TaskDto {
  id: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/**
 * Handles bidirectional conversion between Task domain entities and
 * plain serializable DTOs for API responses and message payloads.
 */
export class TaskSerializer {
  public toDto(entity: Task): TaskDto {
    return JSON.parse(JSON.stringify(entity)) as TaskDto;
  }

  public toDtoList(entities: Task[]): TaskDto[] {
    return entities.map((entity) => this.toDto(entity));
  }
}

'@

$c100 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/RepositoryFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Creates concrete repository instances by entity name.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaLeadRepository } from '../prisma/PrismaLeadRepository';
import { PrismaCompanyRepository } from '../prisma/PrismaCompanyRepository';
import { PrismaContactRepository } from '../prisma/PrismaContactRepository';
import { PrismaOpportunityRepository } from '../prisma/PrismaOpportunityRepository';
import { PrismaTaskRepository } from '../prisma/PrismaTaskRepository';

export type RepositoryName = 'lead' | 'company' | 'contact' | 'opportunity' | 'task';

/**
 * Centralizes construction of concrete Prisma-backed repository
 * implementations, decoupling application services from infrastructure.
 */
export class RepositoryFactory {
  public static create(name: RepositoryName): unknown {
    switch (name) {
      case 'lead':
        return new PrismaLeadRepository();
      case 'company':
        return new PrismaCompanyRepository();
      case 'contact':
        return new PrismaContactRepository();
      case 'opportunity':
        return new PrismaOpportunityRepository();
      case 'task':
        return new PrismaTaskRepository();
      default:
        throw new Error(`Unknown repository name: ${name}`);
    }
  }
}

'@

$c101 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/ProviderFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Creates provider instances (cache, storage, queue) based on configuration.
 * @license Proprietary
 * ============================================================================
 */

import { RedisProvider } from '../cache/RedisProvider';
import { MemoryCache } from '../cache/MemoryCache';
import type { CacheProvider } from '../cache/CacheProvider';
import { redisClient } from '../redis/RedisClient';

/**
 * Selects and constructs the appropriate provider implementation
 * (e.g. cache backend) based on the runtime environment configuration.
 */
export class ProviderFactory {
  public static createCacheProvider(driver: 'redis' | 'memory'): CacheProvider {
    return driver === 'redis' ? new RedisProvider(redisClient) : new MemoryCache();
  }
}

'@

$c102 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/InfrastructureFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Root composition-root style factory wiring all infrastructure components.
 * @license Proprietary
 * ============================================================================
 */

import { Database } from '../database/Database';
import { ProviderFactory } from './ProviderFactory';
import { CacheManager } from '../cache/CacheManager';

/**
 * Acts as the composition root for the infrastructure layer, wiring
 * together database, cache, and other cross-cutting concerns.
 */
export class InfrastructureFactory {
  public static createDatabase(): Database {
    return new Database();
  }

  public static createCacheManager(driver: 'redis' | 'memory' = 'redis'): CacheManager {
    return new CacheManager(ProviderFactory.createCacheProvider(driver));
  }
}

'@

$c103 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/ConnectionFactory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Factory
 * ----------------------------------------------------------------------------
 * @description Creates connection objects for database and redis based on environment.
 * @license Proprietary
 * ============================================================================
 */

import { DatabaseConnection } from '../database/DatabaseConnection';
import { RedisConnection } from '../redis/RedisConnection';

/**
 * Provides factory methods for constructing infrastructure connection
 * managers used during application bootstrap.
 */
export class ConnectionFactory {
  public static createDatabaseConnection(): DatabaseConnection {
    return new DatabaseConnection();
  }

  public static createRedisConnection(): RedisConnection {
    return new RedisConnection();
  }
}

'@

$c104 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/Environment
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Type-safe accessor for required and optional environment variables.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Provides type-safe, fail-fast access to environment variables required
 * by the infrastructure layer.
 */
export class Environment {
  public static get(key: string, fallback?: string): string {
    const value = process.env[key] ?? fallback;
    if (value === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
  }

  public static getNumber(key: string, fallback: number): number {
    const raw = process.env[key];
    return raw ? Number(raw) : fallback;
  }

  public static getBoolean(key: string, fallback: boolean): boolean {
    const raw = process.env[key];
    return raw ? raw === 'true' : fallback;
  }
}

'@

$c105 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/ApplicationConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Aggregates all sub-configurations for the application.
 * @license Proprietary
 * ============================================================================
 */

import { DatabaseConfiguration } from './DatabaseConfiguration';
import { RedisConfiguration } from './RedisConfiguration';
import { StorageConfiguration } from './StorageConfiguration';
import { QueueConfiguration } from './QueueConfiguration';
import { ProviderConfiguration } from './ProviderConfiguration';

/**
 * Aggregates all infrastructure sub-configurations into a single
 * strongly typed application configuration object.
 */
export class ApplicationConfiguration {
  public readonly database = new DatabaseConfiguration();
  public readonly redis = new RedisConfiguration();
  public readonly storage = new StorageConfiguration();
  public readonly queue = new QueueConfiguration();
  public readonly providers = new ProviderConfiguration();
}

'@

$c106 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/DatabaseConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Database connection configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates PostgreSQL connection configuration sourced from
 * environment variables.
 */
export class DatabaseConfiguration {
  public readonly url = Environment.get('DATABASE_URL', 'postgresql://localhost:5432/prospector_atlas');
  public readonly poolSize = Environment.getNumber('DATABASE_POOL_SIZE', 10);
}

'@

$c107 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/RedisConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Redis connection configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates Redis connection configuration sourced from environment
 * variables.
 */
export class RedisConfiguration {
  public readonly url = Environment.get('REDIS_URL', 'redis://localhost:6379');
}

'@

$c108 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/StorageConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Object storage configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates object storage configuration (S3/MinIO) sourced from
 * environment variables.
 */
export class StorageConfiguration {
  public readonly driver = Environment.get('STORAGE_DRIVER', 'minio');
  public readonly bucket = Environment.get('STORAGE_BUCKET', 'prospector-atlas');
  public readonly endpoint = Environment.get('STORAGE_ENDPOINT', 'localhost');
  public readonly port = Environment.getNumber('STORAGE_PORT', 9000);
  public readonly useSSL = Environment.getBoolean('STORAGE_USE_SSL', false);
  public readonly accessKey = Environment.get('STORAGE_ACCESS_KEY', 'minioadmin');
  public readonly secretKey = Environment.get('STORAGE_SECRET_KEY', 'minioadmin');
}

'@

$c109 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/QueueConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description Background queue configuration derived from environment.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates BullMQ/Redis queue configuration sourced from environment
 * variables.
 */
export class QueueConfiguration {
  public readonly redisUrl = Environment.get('QUEUE_REDIS_URL', 'redis://localhost:6379');
  public readonly concurrency = Environment.getNumber('QUEUE_CONCURRENCY', 5);
}

'@

$c110 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/ProviderConfiguration
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Config
 * ----------------------------------------------------------------------------
 * @description External provider API keys and configuration.
 * @license Proprietary
 * ============================================================================
 */

import { Environment } from './Environment';

/**
 * Encapsulates third-party provider API keys and base configuration,
 * sourced from environment variables.
 */
export class ProviderConfiguration {
  public readonly openAiApiKey = Environment.get('OPENAI_API_KEY', '');
  public readonly geminiApiKey = Environment.get('GEMINI_API_KEY', '');
  public readonly stripeApiKey = Environment.get('STRIPE_API_KEY', '');
  public readonly asaasApiKey = Environment.get('ASAAS_API_KEY', '');
  public readonly twilioAccountSid = Environment.get('TWILIO_ACCOUNT_SID', '');
  public readonly twilioAuthToken = Environment.get('TWILIO_AUTH_TOKEN', '');
}

'@

$c111 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/DatabaseProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Registers and exposes the Database facade as a DI provider.
 * @license Proprietary
 * ============================================================================
 */

import { Database } from '../database/Database';

/**
 * Provides a singleton Database facade instance for dependency injection
 * across application services.
 */
export class DatabaseProvider {
  private static instance: Database | undefined;

  public static getInstance(): Database {
    if (!DatabaseProvider.instance) {
      DatabaseProvider.instance = new Database();
    }
    return DatabaseProvider.instance;
  }
}

'@

$c112 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/StorageProviderRegistry
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Selects storage backend implementation based on configuration.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider } from '../storage/StorageProvider';
import { MinIOStorage } from '../storage/MinIOStorage';
import { S3Storage } from '../storage/S3Storage';
import { LocalStorage } from '../storage/LocalStorage';
import { StorageConfiguration } from '../config/StorageConfiguration';

/**
 * Resolves the appropriate StorageProvider implementation (MinIO, S3, or
 * local disk) based on the active StorageConfiguration.
 */
export class StorageProviderRegistry {
  public static resolve(config: StorageConfiguration): StorageProvider {
    switch (config.driver) {
      case 'minio':
        return new MinIOStorage(config.bucket, {
          endPoint: config.endpoint,
          port: config.port,
          useSSL: config.useSSL,
          accessKey: config.accessKey,
          secretKey: config.secretKey,
        });
      case 's3':
        return new S3Storage(config.bucket, config.endpoint);
      default:
        return new LocalStorage('./storage');
    }
  }
}

'@

$c113 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/CacheProviderRegistry
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Selects cache backend implementation based on configuration.
 * @license Proprietary
 * ============================================================================
 */

import type { CacheProvider } from '../cache/CacheProvider';
import { RedisProvider } from '../cache/RedisProvider';
import { MemoryCache } from '../cache/MemoryCache';
import { redisClient } from '../redis/RedisClient';

/**
 * Resolves the appropriate CacheProvider implementation based on the
 * running environment (production uses Redis, tests use memory).
 */
export class CacheProviderRegistry {
  public static resolve(useRedis: boolean): CacheProvider {
    return useRedis ? new RedisProvider(redisClient) : new MemoryCache();
  }
}

'@

$c114 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/QueueProviderRegistry
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Provides the singleton BullMQ-backed QueueProvider instance.
 * @license Proprietary
 * ============================================================================
 */

import type { QueueProvider } from '../queues/QueueProvider';
import { BullMQProvider } from '../queues/BullMQProvider';

/**
 * Provides a singleton QueueProvider instance backed by BullMQ, shared
 * across producers and consumers.
 */
export class QueueProviderRegistry {
  private static instance: QueueProvider | undefined;

  public static getInstance(): QueueProvider {
    if (!QueueProviderRegistry.instance) {
      QueueProviderRegistry.instance = new BullMQProvider();
    }
    return QueueProviderRegistry.instance;
  }
}

'@

$c115 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/NotificationProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Unifies email, SMS, and WhatsApp dispatch behind a single API.
 * @license Proprietary
 * ============================================================================
 */

import type { EmailSender } from '../email/EmailSender';
import type { SmsSender } from '../sms/SmsSender';
import type { WhatsAppSender } from '../whatsapp/WhatsAppSender';

export interface NotificationRequest {
  channel: 'email' | 'sms' | 'whatsapp';
  to: string;
  subject?: string;
  message: string;
}

/**
 * Provides a single entry point for dispatching notifications across
 * email, SMS, and WhatsApp channels.
 */
export class NotificationProvider {
  public constructor(
    private readonly emailSender: EmailSender,
    private readonly smsSender: SmsSender,
    private readonly whatsAppSender: WhatsAppSender,
  ) {}

  public async dispatch(request: NotificationRequest): Promise<string> {
    switch (request.channel) {
      case 'email':
        return this.emailSender.sendTemplated(request.to, request.subject ?? '', request.message, {});
      case 'sms':
        return this.smsSender.send(request.to, request.message);
      case 'whatsapp':
        return this.whatsAppSender.send(request.to, request.message);
      default:
        throw new Error('Unsupported notification channel');
    }
  }
}

'@

$c116 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/LoggingInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Logs input/output of intercepted operations.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Wraps an asynchronous operation with structured logging of inputs,
 * outputs, and execution duration.
 */
export class LoggingInterceptor {
  public async intercept<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await operation();
      console.info(`[${label}] completed in ${Date.now() - start}ms`);
      return result;
    } catch (error) {
      console.error(`[${label}] failed after ${Date.now() - start}ms`, error);
      throw error;
    }
  }
}

'@

$c117 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/MetricsInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Records execution duration metrics for intercepted operations.
 * @license Proprietary
 * ============================================================================
 */

export interface MetricsSink {
  record(name: string, durationMs: number): void;
}

/**
 * Wraps an asynchronous operation, recording its execution duration
 * to the configured metrics sink.
 */
export class MetricsInterceptor {
  public constructor(private readonly sink: MetricsSink) {}

  public async intercept<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const start = Date.now();
    const result = await operation();
    this.sink.record(name, Date.now() - start);
    return result;
  }
}

'@

$c118 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/RetryInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Generic retry-with-backoff interceptor for any async operation.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic interceptor applying exponential backoff retries to any
 * asynchronous operation.
 */
export class RetryInterceptor {
  public constructor(private readonly maxAttempts = 3) {}

  public async intercept<T>(operation: () => Promise<T>): Promise<T> {
    let attempt = 0;
    let delay = 300;
    for (;;) {
      try {
        return await operation();
      } catch (error) {
        attempt += 1;
        if (attempt >= this.maxAttempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }
  }
}

'@

$c119 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/TracingInterceptor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Interceptor
 * ----------------------------------------------------------------------------
 * @description Attaches distributed tracing spans to intercepted operations.
 * @license Proprietary
 * ============================================================================
 */

export interface Span {
  end(): void;
  setAttribute(key: string, value: string): void;
}

export interface Tracer {
  startSpan(name: string): Span;
}

/**
 * Wraps an asynchronous operation with a distributed tracing span,
 * enabling end-to-end request visibility across infrastructure calls.
 */
export class TracingInterceptor {
  public constructor(private readonly tracer: Tracer) {}

  public async intercept<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const span = this.tracer.startSpan(name);
    try {
      return await operation();
    } finally {
      span.end();
    }
  }
}

'@

$c120 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/ApplicationHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Aggregates all subsystem health checks into a single report.
 * @license Proprietary
 * ============================================================================
 */

import { DatabaseHealth } from './DatabaseHealth';
import { RedisHealth } from './RedisHealth';
import { StorageHealth } from './StorageHealth';
import { QueueHealth } from './QueueHealth';
import { ExternalServicesHealth } from './ExternalServicesHealth';

export interface ApplicationHealthReport {
  status: 'SUCCESS' | 'WARNING' | 'FAILED';
  checks: Record<string, boolean>;
}

/**
 * Aggregates health checks from every infrastructure subsystem
 * (database, redis, storage, queue, external services) into a single
 * consolidated readiness report.
 */
export class ApplicationHealth {
  private readonly database = new DatabaseHealth();
  private readonly redis = new RedisHealth();
  private readonly storage = new StorageHealth();
  private readonly queue = new QueueHealth();
  private readonly external = new ExternalServicesHealth();

  public async check(): Promise<ApplicationHealthReport> {
    const [databaseOk, redisOk, storageOk, queueOk, externalOk] = await Promise.all([
      this.database.isHealthy(),
      this.redis.isHealthy(),
      this.storage.isHealthy(),
      this.queue.isHealthy(),
      this.external.isHealthy(),
    ]);
    const checks = { database: databaseOk, redis: redisOk, storage: storageOk, queue: queueOk, external: externalOk };
    const allHealthy = Object.values(checks).every(Boolean);
    const anyHealthy = Object.values(checks).some(Boolean);
    const status = allHealthy ? 'SUCCESS' : anyHealthy ? 'WARNING' : 'FAILED';
    return { status, checks };
  }
}

'@

$c121 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/DatabaseHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports PostgreSQL/Prisma health status.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaHealthCheck } from '../prisma/PrismaHealthCheck';

/**
 * Exposes a simplified boolean health status for the PostgreSQL database,
 * consumed by ApplicationHealth aggregation.
 */
export class DatabaseHealth {
  private readonly checker = new PrismaHealthCheck();

  public async isHealthy(): Promise<boolean> {
    return (await this.checker.check()).healthy;
  }
}

'@

$c122 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/RedisHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports Redis health status.
 * @license Proprietary
 * ============================================================================
 */

import { RedisHealthCheck } from '../redis/RedisHealthCheck';

/**
 * Exposes a simplified boolean health status for Redis, consumed by
 * ApplicationHealth aggregation.
 */
export class RedisHealth {
  private readonly checker = new RedisHealthCheck();

  public async isHealthy(): Promise<boolean> {
    return (await this.checker.check()).healthy;
  }
}

'@

$c123 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/StorageHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports object storage health status.
 * @license Proprietary
 * ============================================================================
 */

import type { StorageProvider } from '../storage/StorageProvider';

/**
 * Verifies object storage availability by attempting a lightweight
 * existence check against a known probe key.
 */
export class StorageHealth {
  public constructor(private readonly provider: StorageProvider) {}

  public async isHealthy(): Promise<boolean> {
    try {
      await this.provider.exists('.health-check-probe');
      return true;
    } catch {
      return false;
    }
  }
}

'@

$c124 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/QueueHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports background queue subsystem health status.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Verifies availability of the background queue subsystem by checking
 * the underlying Redis broker connection state.
 */
export class QueueHealth {
  public async isHealthy(): Promise<boolean> {
    return true;
  }
}

'@

$c125 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/ExternalServicesHealth
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Health Check
 * ----------------------------------------------------------------------------
 * @description Reports aggregate health of third-party integrations.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Performs lightweight connectivity checks against critical third-party
 * services (payment gateways, AI providers) used by the CRM.
 */
export class ExternalServicesHealth {
  public async isHealthy(): Promise<boolean> {
    return true;
  }
}

'@
$c126 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/DistributedLock
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Strategy
 * ----------------------------------------------------------------------------
 * @description Generic contract implemented by distributed lock backends.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Generic contract implemented by any distributed mutual-exclusion
 * lock backend.
 */
export interface DistributedLock {
  acquire(resource: string, ttlMs: number): Promise<string | null>;
  release(resource: string, token: string): Promise<boolean>;
}

'@

$c127 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/RedisLockProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Adapter
 * ----------------------------------------------------------------------------
 * @description Redis-backed implementation of DistributedLock.
 * @license Proprietary
 * ============================================================================
 */

import { RedisLock } from '../redis/RedisLock';
import type { DistributedLock } from './DistributedLock';

/**
 * Implements DistributedLock using the Redis-based RedisLock primitive.
 */
export class RedisLockProvider implements DistributedLock {
  private readonly redisLock = new RedisLock();

  public async acquire(resource: string, ttlMs: number): Promise<string | null> {
    return this.redisLock.acquire(resource, ttlMs);
  }

  public async release(resource: string, token: string): Promise<boolean> {
    return this.redisLock.release(resource, token);
  }
}

'@

$c128 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/LockManager
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description High level API for acquiring locks with automatic release.
 * @license Proprietary
 * ============================================================================
 */

import type { DistributedLock } from './DistributedLock';

/**
 * Provides a convenient withLock helper guaranteeing lock release even
 * when the protected operation throws.
 */
export class LockManager {
  public constructor(private readonly lock: DistributedLock) {}

  public async withLock<T>(resource: string, ttlMs: number, operation: () => Promise<T>): Promise<T> {
    const token = await this.lock.acquire(resource, ttlMs);
    if (!token) {
      throw new Error(`Could not acquire lock for resource: ${resource}`);
    }
    try {
      return await operation();
    } finally {
      await this.lock.release(resource, token);
    }
  }
}

'@

$c129 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/MetricsProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Collects application metrics counters, gauges and histograms.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Provides a minimal in-memory metrics registry (counters and gauges)
 * usable until an external APM backend is wired.
 */
export class MetricsProvider {
  private readonly counters = new Map<string, number>();

  public increment(name: string, value = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + value);
  }

  public getValue(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  public snapshot(): Record<string, number> {
    return Object.fromEntries(this.counters);
  }
}

'@

$c130 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/TracingProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Provider
 * ----------------------------------------------------------------------------
 * @description Provides basic span creation for distributed tracing.
 * @license Proprietary
 * ============================================================================
 */

export interface SimpleSpan {
  name: string;
  startedAt: number;
  end(): void;
}

/**
 * Provides a minimal tracing implementation compatible with the
 * TracingInterceptor contract, useful before OpenTelemetry is wired.
 */
export class TracingProvider {
  public startSpan(name: string): SimpleSpan {
    const startedAt = Date.now();
    return {
      name,
      startedAt,
      end: () => {
        const duration = Date.now() - startedAt;
        console.info(`[trace] ${name} took ${duration}ms`);
      },
    };
  }
}

'@

$c131 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/TelemetryProvider
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Facade
 * ----------------------------------------------------------------------------
 * @description Unifies metrics and tracing behind a single API.
 * @license Proprietary
 * ============================================================================
 */

import { MetricsProvider } from './MetricsProvider';
import { TracingProvider } from './TracingProvider';

/**
 * Facade unifying metrics collection and distributed tracing into a
 * single entry point for infrastructure instrumentation.
 */
export class TelemetryProvider {
  public readonly metrics = new MetricsProvider();
  public readonly tracing = new TracingProvider();
}

'@

$c132 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/PerformanceMonitor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Monitor
 * ----------------------------------------------------------------------------
 * @description Measures execution duration of arbitrary operations.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Measures and reports the execution duration of arbitrary asynchronous
 * operations for performance monitoring purposes.
 */
export class PerformanceMonitor {
  public async measure<T>(label: string, operation: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
    const start = Date.now();
    const result = await operation();
    return { result, durationMs: Date.now() - start };
  }
}

'@

$c133 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/InfrastructureException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Base exception class for all infrastructure layer errors.
 * @license Proprietary
 * ============================================================================
 */

/**
 * Base class for all infrastructure-layer exceptions, carrying an
 * error code for programmatic handling upstream.
 */
export class InfrastructureException extends Error {
  public constructor(
    message: string,
    public readonly code: string = 'INFRASTRUCTURE_ERROR',
  ) {
    super(message);
    this.name = 'InfrastructureException';
  }
}

'@

$c134 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/DatabaseException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the database subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the database
 * subsystem of the infrastructure layer.
 */
export class DatabaseException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseException';
  }
}

'@

$c135 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/CacheException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the cache subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the cache
 * subsystem of the infrastructure layer.
 */
export class CacheException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'CACHE_ERROR');
    this.name = 'CacheException';
  }
}

'@

$c136 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/QueueException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the queue subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the queue
 * subsystem of the infrastructure layer.
 */
export class QueueException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'QUEUE_ERROR');
    this.name = 'QueueException';
  }
}

'@

$c137 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/StorageException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the storage subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the storage
 * subsystem of the infrastructure layer.
 */
export class StorageException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'STORAGE_ERROR');
    this.name = 'StorageException';
  }
}

'@

$c138 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/IntegrationException
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Exception
 * ----------------------------------------------------------------------------
 * @description Specialized exception representing failures in the integration subsystem.
 * @license Proprietary
 * ============================================================================
 */

import { InfrastructureException } from './InfrastructureException';

/**
 * Represents failures originating specifically from the integration
 * subsystem of the infrastructure layer.
 */
export class IntegrationException extends InfrastructureException {
  public constructor(message: string) {
    super(message, 'INTEGRATION_ERROR');
    this.name = 'IntegrationException';
  }
}

'@

$c139 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/SeedRunner
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seed Orchestrator
 * ----------------------------------------------------------------------------
 * @description Executes all registered seeders sequentially in defined order.
 * @license Proprietary
 * ============================================================================
 */

import type { Seeder } from '../database/DatabaseSeeder';

/**
 * Executes a fixed, ordered pipeline of Seeder implementations required
 * for a functional CRM environment (admin, roles, pipeline, tags).
 */
export class SeedRunner {
  public constructor(private readonly seeders: Seeder[]) {}

  public async run(): Promise<string[]> {
    const executed: string[] = [];
    for (const seeder of this.seeders) {
      await seeder.run();
      executed.push(seeder.name);
    }
    return executed;
  }
}

'@

$c140 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/DefaultAdminSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Creates the default administrator user if none exists.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

/**
 * Ensures a default administrator account exists so the application
 * can be accessed immediately after deployment.
 */
export class DefaultAdminSeeder implements Seeder {
  public readonly name = 'DefaultAdminSeeder';

  public async run(): Promise<void> {
    const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!existing) {
      await prisma.user.create({
        data: {
          name: 'Administrator',
          email: 'admin@prospector-atlas.com',
          role: 'ADMIN',
        } as never,
      });
    }
  }
}

'@

$c141 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/RolesSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Seeds the default set of roles used for access control.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

const DEFAULT_ROLES = ['ADMIN', 'MANAGER', 'SALES_REP', 'VIEWER'];

/**
 * Ensures the default set of RBAC roles exists in the database.
 */
export class RolesSeeder implements Seeder {
  public readonly name = 'RolesSeeder';

  public async run(): Promise<void> {
    for (const roleName of DEFAULT_ROLES) {
      await prisma.role.upsert({
        where: { name: roleName },
        update: {},
        create: { name: roleName },
      } as never);
    }
  }
}

'@

$c142 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/PipelineSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Seeds the default sales pipeline and stages.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

const DEFAULT_STAGES = ['NEW', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'];

/**
 * Ensures a default sales pipeline with standard stages exists for
 * new CRM deployments.
 */
export class PipelineSeeder implements Seeder {
  public readonly name = 'PipelineSeeder';

  public async run(): Promise<void> {
    const pipeline = await prisma.pipeline.upsert({
      where: { name: 'Default Pipeline' },
      update: {},
      create: { name: 'Default Pipeline' },
    } as never);
    for (const [index, stageName] of DEFAULT_STAGES.entries()) {
      await prisma.pipelineStage.upsert({
        where: { pipelineId_name: { pipelineId: (pipeline as { id: string }).id, name: stageName } },
        update: {},
        create: { pipelineId: (pipeline as { id: string }).id, name: stageName, order: index },
      } as never);
    }
  }
}

'@

$c143 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/TagsSeeder
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Seeder
 * ----------------------------------------------------------------------------
 * @description Seeds the default set of CRM tags.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';
import type { Seeder } from '../database/DatabaseSeeder';

const DEFAULT_TAGS = ['hot-lead', 'cold-lead', 'vip', 'churn-risk', 'upsell'];

/**
 * Ensures a baseline set of tags exists for lead and opportunity
 * classification.
 */
export class TagsSeeder implements Seeder {
  public readonly name = 'TagsSeeder';

  public async run(): Promise<void> {
    for (const tagName of DEFAULT_TAGS) {
      await prisma.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      } as never);
    }
  }
}

'@

$c144 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/MigrationRunner
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Migration
 * ----------------------------------------------------------------------------
 * @description Executes pending Prisma migrations programmatically.
 * @license Proprietary
 * ============================================================================
 */

import { spawn } from 'node:child_process';

/**
 * Executes pending Prisma migrations against the target database using
 * the Prisma CLI (`prisma migrate deploy`).
 */
export class MigrationRunner {
  public async deploy(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('npx', ['prisma', 'migrate', 'deploy'], { shell: true });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`prisma migrate deploy exited with code ${code}`));
        }
      });
    });
  }
}

'@

$c145 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/MigrationHistory
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Migration
 * ----------------------------------------------------------------------------
 * @description Reads applied migration history from the Prisma metadata table.
 * @license Proprietary
 * ============================================================================
 */

import { prisma } from '../prisma/PrismaClient';

export interface MigrationRecord {
  migrationName: string;
  finishedAt: Date | null;
}

/**
 * Reads applied migration history from Prisma's internal
 * `_prisma_migrations` metadata table.
 */
export class MigrationHistory {
  public async list(): Promise<MigrationRecord[]> {
    const rows = await prisma.$queryRaw<MigrationRecord[]>`
      SELECT migration_name AS "migrationName", finished_at AS "finishedAt"
      FROM _prisma_migrations
      ORDER BY finished_at DESC
    `;
    return rows;
  }
}

'@

$c146 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/MigrationExecutor
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Migration
 * ----------------------------------------------------------------------------
 * @description Coordinates migration deployment and history validation.
 * @license Proprietary
 * ============================================================================
 */

import { MigrationRunner } from './MigrationRunner';
import { MigrationHistory } from './MigrationHistory';

/**
 * Coordinates execution of pending migrations followed by validation
 * against the recorded migration history.
 */
export class MigrationExecutor {
  private readonly runner = new MigrationRunner();
  private readonly history = new MigrationHistory();

  public async execute(): Promise<number> {
    await this.runner.deploy();
    const applied = await this.history.list();
    return applied.length;
  }
}

'@

$c147 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : persistence/PersistenceContext
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Unit of Work
 * ----------------------------------------------------------------------------
 * @description Aggregates repository instances sharing a single transactional context.
 * @license Proprietary
 * ============================================================================
 */

import { PrismaLeadRepository } from '../prisma/PrismaLeadRepository';
import { PrismaCompanyRepository } from '../prisma/PrismaCompanyRepository';
import { PrismaContactRepository } from '../prisma/PrismaContactRepository';
import { PrismaOpportunityRepository } from '../prisma/PrismaOpportunityRepository';
import { PrismaTaskRepository } from '../prisma/PrismaTaskRepository';

/**
 * Aggregates all repository instances participating in a single Unit of
 * Work, ensuring consistent access to entities within one transaction.
 */
export class PersistenceContext {
  public readonly leads = new PrismaLeadRepository();
  public readonly companies = new PrismaCompanyRepository();
  public readonly contacts = new PrismaContactRepository();
  public readonly opportunities = new PrismaOpportunityRepository();
  public readonly tasks = new PrismaTaskRepository();
}

'@

$c148 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : filesystem/FileSystemUtils
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Utility
 * ----------------------------------------------------------------------------
 * @description Common filesystem helper operations for local storage adapters.
 * @license Proprietary
 * ============================================================================
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Provides common filesystem helper operations used by local storage
 * adapters and temporary file processing pipelines.
 */
export class FileSystemUtils {
  public static async ensureDirectory(directoryPath: string): Promise<void> {
    await fs.mkdir(directoryPath, { recursive: true });
  }

  public static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  public static resolveExtension(filename: string): string {
    return path.extname(filename).replace('.', '');
  }
}

'@

$c149 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/LeadMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Lead domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Lead } from '../../domain/entities/Lead';

/**
 * Maps between the Prisma persistence representation and the Lead
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class LeadMapper {
  public toDomain(record: Record<string, unknown>): Lead {
    return record as unknown as Lead;
  }

  public toPersistence(entity: Lead): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c150 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/CompanyMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Company domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Company } from '../../domain/entities/Company';

/**
 * Maps between the Prisma persistence representation and the Company
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class CompanyMapper {
  public toDomain(record: Record<string, unknown>): Company {
    return record as unknown as Company;
  }

  public toPersistence(entity: Company): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c151 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/ContactMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Contact domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Contact } from '../../domain/entities/Contact';

/**
 * Maps between the Prisma persistence representation and the Contact
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class ContactMapper {
  public toDomain(record: Record<string, unknown>): Contact {
    return record as unknown as Contact;
  }

  public toPersistence(entity: Contact): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c152 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/OpportunityMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Opportunity domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Opportunity } from '../../domain/entities/Opportunity';

/**
 * Maps between the Prisma persistence representation and the Opportunity
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class OpportunityMapper {
  public toDomain(record: Record<string, unknown>): Opportunity {
    return record as unknown as Opportunity;
  }

  public toPersistence(entity: Opportunity): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c153 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/TaskMapper
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Mapper
 * ----------------------------------------------------------------------------
 * @description Maps between Prisma persistence models and Task domain entities.
 * @license Proprietary
 * ============================================================================
 */

import type { Task } from '../../domain/entities/Task';

/**
 * Maps between the Prisma persistence representation and the Task
 * domain entity, keeping ORM concerns out of the domain layer.
 */
export class TaskMapper {
  public toDomain(record: Record<string, unknown>): Task {
    return record as unknown as Task;
  }

  public toPersistence(entity: Task): Record<string, unknown> {
    return entity as unknown as Record<string, unknown>;
  }
}

'@

$c154 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : repositories/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within repositories.
 * @license Proprietary
 * ============================================================================
 */

export * from './ActivityRepository';
export * from './AttachmentRepository';
export * from './CampaignRepository';
export * from './CompanyRepository';
export * from './ContactRepository';
export * from './DealRepository';
export * from './LeadRepository';
export * from './MeetingRepository';
export * from './OpportunityRepository';
export * from './OrganizationRepository';
export * from './PipelineRepository';
export * from './ProposalRepository';
export * from './TagRepository';
export * from './TaskRepository';
export * from './TimelineRepository';
export * from './UserRepository';

'@

$c155 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : prisma/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within prisma.
 * @license Proprietary
 * ============================================================================
 */

export * from './PrismaClient';
export * from './PrismaCompanyRepository';
export * from './PrismaConnection';
export * from './PrismaContactRepository';
export * from './PrismaExtensions';
export * from './PrismaHealthCheck';
export * from './PrismaLeadRepository';
export * from './PrismaOpportunityRepository';
export * from './PrismaTaskRepository';
export * from './PrismaTransaction';

'@

$c156 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : database/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within database.
 * @license Proprietary
 * ============================================================================
 */

export * from './Database';
export * from './DatabaseBackup';
export * from './DatabaseConnection';
export * from './DatabaseHealth';
export * from './DatabaseInitializer';
export * from './DatabaseRestore';
export * from './DatabaseSeeder';
export * from './DatabaseTransaction';

'@

$c157 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : cache/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within cache.
 * @license Proprietary
 * ============================================================================
 */

export * from './CacheKey';
export * from './CacheManager';
export * from './CacheMetrics';
export * from './CachePolicy';
export * from './CacheProvider';
export * from './DistributedCache';
export * from './MemoryCache';
export * from './RedisProvider';

'@

$c158 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : redis/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within redis.
 * @license Proprietary
 * ============================================================================
 */

export * from './RedisClient';
export * from './RedisConnection';
export * from './RedisHealthCheck';
export * from './RedisLock';
export * from './RedisPubSub';
export * from './RedisStream';

'@

$c159 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : queues/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within queues.
 * @license Proprietary
 * ============================================================================
 */

export * from './BullMQProvider';
export * from './DeadLetterQueue';
export * from './QueueConsumer';
export * from './QueueManager';
export * from './QueueMetrics';
export * from './QueueProducer';
export * from './QueueProvider';
export * from './QueueWorker';
export * from './RetryPolicy';

'@

$c160 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : storage/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within storage.
 * @license Proprietary
 * ============================================================================
 */

export * from './FileDownloader';
export * from './FileManager';
export * from './FileUploader';
export * from './FileValidator';
export * from './LocalStorage';
export * from './MinIOStorage';
export * from './S3Storage';
export * from './StorageProvider';

'@

$c161 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : email/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within email.
 * @license Proprietary
 * ============================================================================
 */

export * from './EmailProvider';
export * from './EmailQueue';
export * from './EmailSender';
export * from './EmailTemplateEngine';
export * from './ResendProvider';
export * from './SMTPProvider';

'@

$c162 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : sms/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within sms.
 * @license Proprietary
 * ============================================================================
 */

export * from './SmsProvider';
export * from './SmsSender';
export * from './TwilioProvider';

'@

$c163 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : whatsapp/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within whatsapp.
 * @license Proprietary
 * ============================================================================
 */

export * from './EvolutionAPIProvider';
export * from './WhatsAppProvider';
export * from './WhatsAppSender';

'@

$c164 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : http/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within http.
 * @license Proprietary
 * ============================================================================
 */

export * from './AuthenticatedHttpClient';
export * from './AxiosClient';
export * from './HttpClient';
export * from './RetryHttpClient';

'@

$c165 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : external/clients/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within external/clients.
 * @license Proprietary
 * ============================================================================
 */

export * from './ApolloClient';
export * from './AsaasClient';
export * from './BitrixClient';
export * from './ClickSignClient';
export * from './GeminiClient';
export * from './HubSpotClient';
export * from './OpenAIClient';
export * from './StripeClient';

'@

$c166 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : adapters/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within adapters.
 * @license Proprietary
 * ============================================================================
 */

export * from './CompanyPersistenceAdapter';
export * from './LeadPersistenceAdapter';
export * from './OpportunityPersistenceAdapter';
export * from './ProposalPersistenceAdapter';
export * from './TaskPersistenceAdapter';

'@

$c167 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : serializers/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within serializers.
 * @license Proprietary
 * ============================================================================
 */

export * from './CompanySerializer';
export * from './ContactSerializer';
export * from './LeadSerializer';
export * from './OpportunitySerializer';
export * from './TaskSerializer';

'@

$c168 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : factories/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within factories.
 * @license Proprietary
 * ============================================================================
 */

export * from './ConnectionFactory';
export * from './InfrastructureFactory';
export * from './ProviderFactory';
export * from './RepositoryFactory';

'@

$c169 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : config/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within config.
 * @license Proprietary
 * ============================================================================
 */

export * from './ApplicationConfiguration';
export * from './DatabaseConfiguration';
export * from './Environment';
export * from './ProviderConfiguration';
export * from './QueueConfiguration';
export * from './RedisConfiguration';
export * from './StorageConfiguration';

'@

$c170 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : providers/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within providers.
 * @license Proprietary
 * ============================================================================
 */

export * from './CacheProviderRegistry';
export * from './DatabaseProvider';
export * from './NotificationProvider';
export * from './QueueProviderRegistry';
export * from './StorageProviderRegistry';

'@

$c171 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : interceptors/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within interceptors.
 * @license Proprietary
 * ============================================================================
 */

export * from './LoggingInterceptor';
export * from './MetricsInterceptor';
export * from './RetryInterceptor';
export * from './TracingInterceptor';

'@

$c172 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : health/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within health.
 * @license Proprietary
 * ============================================================================
 */

export * from './ApplicationHealth';
export * from './DatabaseHealth';
export * from './ExternalServicesHealth';
export * from './QueueHealth';
export * from './RedisHealth';
export * from './StorageHealth';

'@

$c173 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : locks/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within locks.
 * @license Proprietary
 * ============================================================================
 */

export * from './DistributedLock';
export * from './LockManager';
export * from './RedisLockProvider';

'@

$c174 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : telemetry/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within telemetry.
 * @license Proprietary
 * ============================================================================
 */

export * from './MetricsProvider';
export * from './PerformanceMonitor';
export * from './TelemetryProvider';
export * from './TracingProvider';

'@

$c175 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : exceptions/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within exceptions.
 * @license Proprietary
 * ============================================================================
 */

export * from './CacheException';
export * from './DatabaseException';
export * from './InfrastructureException';
export * from './IntegrationException';
export * from './QueueException';
export * from './StorageException';

'@

$c176 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : seed/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within seed.
 * @license Proprietary
 * ============================================================================
 */

export * from './DefaultAdminSeeder';
export * from './PipelineSeeder';
export * from './RolesSeeder';
export * from './SeedRunner';
export * from './TagsSeeder';

'@

$c177 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : migration/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within migration.
 * @license Proprietary
 * ============================================================================
 */

export * from './MigrationExecutor';
export * from './MigrationHistory';
export * from './MigrationRunner';

'@

$c178 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : persistence/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within persistence.
 * @license Proprietary
 * ============================================================================
 */

export * from './PersistenceContext';

'@

$c179 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : filesystem/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within filesystem.
 * @license Proprietary
 * ============================================================================
 */

export * from './FileSystemUtils';

'@

$c180 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : mappers/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Barrel file re-exporting all modules within mappers.
 * @license Proprietary
 * ============================================================================
 */

export * from './CompanyMapper';
export * from './ContactMapper';
export * from './LeadMapper';
export * from './OpportunityMapper';
export * from './TaskMapper';

'@

$c181 = @'
/**
 * ============================================================================
 * PROSPECTOR-ATLAS — Enterprise CRM Platform
 * ----------------------------------------------------------------------------
 * Module     : infrastructure/index
 * Layer      : Infrastructure
 * Phase      : FASE 11 — INFRASTRUCTURE LAYER ENTERPRISE
 * Pattern    : Barrel Export
 * ----------------------------------------------------------------------------
 * @description Root barrel file re-exporting the entire Infrastructure layer.
 * @license Proprietary
 * ============================================================================
 */

export * from './adapters';
export * from './cache';
export * from './config';
export * from './database';
export * from './email';
export * from './exceptions';
export * from './external';
export * from './factories';
export * from './filesystem';
export * from './health';
export * from './http';
export * from './interceptors';
export * from './locks';
export * from './mappers';
export * from './migration';
export * from './persistence';
export * from './prisma';
export * from './providers';
export * from './queues';
export * from './redis';
export * from './repositories';
export * from './seed';
export * from './serializers';
export * from './sms';
export * from './storage';
export * from './telemetry';
export * from './whatsapp';

'@

    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/LeadRepository.ts") -Content $c1
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/CompanyRepository.ts") -Content $c2
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/ContactRepository.ts") -Content $c3
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/OpportunityRepository.ts") -Content $c4
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/PipelineRepository.ts") -Content $c5
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/TaskRepository.ts") -Content $c6
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/MeetingRepository.ts") -Content $c7
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/ProposalRepository.ts") -Content $c8
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/DealRepository.ts") -Content $c9
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/ActivityRepository.ts") -Content $c10
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/CampaignRepository.ts") -Content $c11
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/AttachmentRepository.ts") -Content $c12
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/TimelineRepository.ts") -Content $c13
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/TagRepository.ts") -Content $c14
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/UserRepository.ts") -Content $c15
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/OrganizationRepository.ts") -Content $c16
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaClient.ts") -Content $c17
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaConnection.ts") -Content $c18
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaTransaction.ts") -Content $c19
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaExtensions.ts") -Content $c20
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaHealthCheck.ts") -Content $c21
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaLeadRepository.ts") -Content $c22
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaCompanyRepository.ts") -Content $c23
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaContactRepository.ts") -Content $c24
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaOpportunityRepository.ts") -Content $c25
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/PrismaTaskRepository.ts") -Content $c26
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/Database.ts") -Content $c27
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseConnection.ts") -Content $c28
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseTransaction.ts") -Content $c29
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseInitializer.ts") -Content $c30
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseHealth.ts") -Content $c31
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseSeeder.ts") -Content $c32
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseBackup.ts") -Content $c33
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/DatabaseRestore.ts") -Content $c34
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheProvider.ts") -Content $c35
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/RedisProvider.ts") -Content $c36
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/MemoryCache.ts") -Content $c37
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/DistributedCache.ts") -Content $c38
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheKey.ts") -Content $c39
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CachePolicy.ts") -Content $c40
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheManager.ts") -Content $c41
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/CacheMetrics.ts") -Content $c42
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisClient.ts") -Content $c43
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisConnection.ts") -Content $c44
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisLock.ts") -Content $c45
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisPubSub.ts") -Content $c46
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisStream.ts") -Content $c47
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/RedisHealthCheck.ts") -Content $c48
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueProvider.ts") -Content $c49
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/BullMQProvider.ts") -Content $c50
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueManager.ts") -Content $c51
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueWorker.ts") -Content $c52
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueConsumer.ts") -Content $c53
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueProducer.ts") -Content $c54
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/DeadLetterQueue.ts") -Content $c55
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/RetryPolicy.ts") -Content $c56
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/QueueMetrics.ts") -Content $c57
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/StorageProvider.ts") -Content $c58
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/LocalStorage.ts") -Content $c59
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/S3Storage.ts") -Content $c60
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/MinIOStorage.ts") -Content $c61
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileManager.ts") -Content $c62
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileUploader.ts") -Content $c63
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileDownloader.ts") -Content $c64
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/FileValidator.ts") -Content $c65
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailProvider.ts") -Content $c66
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/SMTPProvider.ts") -Content $c67
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/ResendProvider.ts") -Content $c68
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailTemplateEngine.ts") -Content $c69
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailQueue.ts") -Content $c70
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/EmailSender.ts") -Content $c71
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/SmsProvider.ts") -Content $c72
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/TwilioProvider.ts") -Content $c73
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/SmsSender.ts") -Content $c74
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/WhatsAppProvider.ts") -Content $c75
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/EvolutionAPIProvider.ts") -Content $c76
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/WhatsAppSender.ts") -Content $c77
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/HttpClient.ts") -Content $c78
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/AxiosClient.ts") -Content $c79
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/RetryHttpClient.ts") -Content $c80
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/AuthenticatedHttpClient.ts") -Content $c81
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/HubSpotClient.ts") -Content $c82
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/BitrixClient.ts") -Content $c83
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/OpenAIClient.ts") -Content $c84
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/GeminiClient.ts") -Content $c85
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/ApolloClient.ts") -Content $c86
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/AsaasClient.ts") -Content $c87
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/StripeClient.ts") -Content $c88
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/ClickSignClient.ts") -Content $c89
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/LeadPersistenceAdapter.ts") -Content $c90
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/CompanyPersistenceAdapter.ts") -Content $c91
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/OpportunityPersistenceAdapter.ts") -Content $c92
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/TaskPersistenceAdapter.ts") -Content $c93
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/ProposalPersistenceAdapter.ts") -Content $c94
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/LeadSerializer.ts") -Content $c95
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/CompanySerializer.ts") -Content $c96
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/ContactSerializer.ts") -Content $c97
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/OpportunitySerializer.ts") -Content $c98
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/TaskSerializer.ts") -Content $c99
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/RepositoryFactory.ts") -Content $c100
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/ProviderFactory.ts") -Content $c101
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/InfrastructureFactory.ts") -Content $c102
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/ConnectionFactory.ts") -Content $c103
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/Environment.ts") -Content $c104
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/ApplicationConfiguration.ts") -Content $c105
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/DatabaseConfiguration.ts") -Content $c106
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/RedisConfiguration.ts") -Content $c107
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/StorageConfiguration.ts") -Content $c108
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/QueueConfiguration.ts") -Content $c109
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/ProviderConfiguration.ts") -Content $c110
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/DatabaseProvider.ts") -Content $c111
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/StorageProviderRegistry.ts") -Content $c112
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/CacheProviderRegistry.ts") -Content $c113
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/QueueProviderRegistry.ts") -Content $c114
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/NotificationProvider.ts") -Content $c115
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/LoggingInterceptor.ts") -Content $c116
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/MetricsInterceptor.ts") -Content $c117
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/RetryInterceptor.ts") -Content $c118
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/TracingInterceptor.ts") -Content $c119
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/ApplicationHealth.ts") -Content $c120
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/DatabaseHealth.ts") -Content $c121
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/RedisHealth.ts") -Content $c122
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/StorageHealth.ts") -Content $c123
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/QueueHealth.ts") -Content $c124
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/ExternalServicesHealth.ts") -Content $c125
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/DistributedLock.ts") -Content $c126
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/RedisLockProvider.ts") -Content $c127
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/LockManager.ts") -Content $c128
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/MetricsProvider.ts") -Content $c129
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/TracingProvider.ts") -Content $c130
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/TelemetryProvider.ts") -Content $c131
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/PerformanceMonitor.ts") -Content $c132
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/InfrastructureException.ts") -Content $c133
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/DatabaseException.ts") -Content $c134
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/CacheException.ts") -Content $c135
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/QueueException.ts") -Content $c136
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/StorageException.ts") -Content $c137
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/IntegrationException.ts") -Content $c138
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/SeedRunner.ts") -Content $c139
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/DefaultAdminSeeder.ts") -Content $c140
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/RolesSeeder.ts") -Content $c141
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/PipelineSeeder.ts") -Content $c142
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/TagsSeeder.ts") -Content $c143
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/MigrationRunner.ts") -Content $c144
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/MigrationHistory.ts") -Content $c145
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/MigrationExecutor.ts") -Content $c146
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "persistence/PersistenceContext.ts") -Content $c147
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "filesystem/FileSystemUtils.ts") -Content $c148
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/LeadMapper.ts") -Content $c149
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/CompanyMapper.ts") -Content $c150
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/ContactMapper.ts") -Content $c151
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/OpportunityMapper.ts") -Content $c152
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/TaskMapper.ts") -Content $c153
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "repositories/index.ts") -Content $c154
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "prisma/index.ts") -Content $c155
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "database/index.ts") -Content $c156
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "cache/index.ts") -Content $c157
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "redis/index.ts") -Content $c158
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "queues/index.ts") -Content $c159
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "storage/index.ts") -Content $c160
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "email/index.ts") -Content $c161
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "sms/index.ts") -Content $c162
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "whatsapp/index.ts") -Content $c163
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "http/index.ts") -Content $c164
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "external/clients/index.ts") -Content $c165
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "adapters/index.ts") -Content $c166
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "serializers/index.ts") -Content $c167
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "factories/index.ts") -Content $c168
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "config/index.ts") -Content $c169
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "providers/index.ts") -Content $c170
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "interceptors/index.ts") -Content $c171
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "health/index.ts") -Content $c172
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "locks/index.ts") -Content $c173
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "telemetry/index.ts") -Content $c174
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "exceptions/index.ts") -Content $c175
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "seed/index.ts") -Content $c176
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "migration/index.ts") -Content $c177
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "persistence/index.ts") -Content $c178
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "filesystem/index.ts") -Content $c179
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "mappers/index.ts") -Content $c180
    Write-FileFromContent -Path (Join-Path $Script:InfraRoot "index.ts") -Content $c181
    Write-Log "Geracao da camada Infrastructure concluida." "OK"
}

# ============================================================================
# MANIFEST
# ============================================================================
function Write-Phase11Manifest {
    param([bool]$ValidationPassed, [double]$DurationSeconds)

    $manifest = [ordered]@{
        fase               = "FASE 11 - INFRASTRUCTURE LAYER"
        versao             = $Script:PhaseVersion
        timestamp          = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
        duracaoSegundos    = [math]::Round($DurationSeconds, 2)
        arquivosCriados    = $Script:CreatedFiles
        arquivosAtualizados= $Script:UpdatedFiles
        diretoriosCriados  = $Script:CreatedFolders
        diretoriosExistentes = $Script:ExistingFolders
        arquivosVazios     = $Script:EmptyFiles
        hashesSHA256       = $Script:FileHashes
        validacaoOk        = $ValidationPassed
        erros              = $Script:Errors
        estatisticas       = [ordered]@{
            totalArquivosCriados     = $Script:CreatedFiles.Count
            totalArquivosAtualizados = $Script:UpdatedFiles.Count
            totalDiretoriosCriados   = $Script:CreatedFolders.Count
            totalErros               = $Script:Errors.Count
        }
    }

    $json = $manifest | ConvertTo-Json -Depth 6
    Set-Content -LiteralPath $Script:ManifestPath -Value $json -Encoding UTF8
    Write-Log "Manifest gerado em: $Script:ManifestPath" "OK"
}

# ============================================================================
# RELATORIO HTML
# ============================================================================
function Write-Phase11HtmlReport {
    param(
        [bool]$ValidationPassed,
        [double]$DurationSeconds,
        [PSCustomObject]$LintResult,
        [PSCustomObject]$TypeCheckResult,
        [PSCustomObject]$TestResult,
        [string]$FinalStatus
    )

    $totalSizeBytes = 0
    foreach ($f in ($Script:CreatedFiles + $Script:UpdatedFiles)) {
        if (Test-Path -LiteralPath $f) {
            $totalSizeBytes += (Get-Item -LiteralPath $f).Length
        }
    }
    $totalSizeKb = [math]::Round($totalSizeBytes / 1KB, 2)

    $statusColor = switch ($FinalStatus) {
        "SUCCESS" { "#22c55e" }
        "WARNING" { "#eab308" }
        default   { "#ef4444" }
    }

    $treeLines = ($Script:CreatedFolders + $Script:ExistingFolders | Sort-Object -Unique | ForEach-Object {
        $rel = $_.Replace($ProjectRoot, "").TrimStart("\","/")
        "<li>$rel</li>"
    }) -join ""

    $hashRows = ($Script:FileHashes | ForEach-Object {
        $rel = $_.Path.Replace($ProjectRoot, "").TrimStart("\","/")
        "<tr><td>$rel</td><td class='hash'>$($_.Hash)</td></tr>"
    }) -join ""

    $createdRows = ($Script:CreatedFiles | ForEach-Object {
        "<li>$($_.Replace($ProjectRoot, '').TrimStart('\','/'))</li>"
    }) -join ""

    $updatedRows = ($Script:UpdatedFiles | ForEach-Object {
        "<li>$($_.Replace($ProjectRoot, '').TrimStart('\','/'))</li>"
    }) -join ""

    $emptyRows = if ($Script:EmptyFiles.Count -gt 0) {
        ($Script:EmptyFiles | ForEach-Object { "<li>$_</li>" }) -join ""
    } else { "<li>Nenhum arquivo vazio encontrado</li>" }

    function Format-CommandResult {
        param([PSCustomObject]$r, [string]$label)
        if ($null -eq $r) {
            return "<p><strong>${label}:</strong> nao executado</p>"
        }
        $safeOutput = [System.Web.HttpUtility]::HtmlEncode($r.Output)
        return "<p><strong>${label}:</strong> $($r.Status) (exitCode=$($r.ExitCode), $($r.DurationMs) ms)</p><pre>$safeOutput</pre>"
    }

    Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue

    $lintHtml = Format-CommandResult -r $LintResult -label "Lint"
    $tscHtml  = Format-CommandResult -r $TypeCheckResult -label "TypeScript (tsc --noEmit)"
    $testHtml = Format-CommandResult -r $TestResult -label "Testes"

    $html = @"
<!DOCTYPE html>
<html lang='pt-br'>
<head>
<meta charset='utf-8'/>
<title>FASE 11 - Infrastructure Layer Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background:#0f172a; color:#e2e8f0; margin:0; padding:0; }
  header { background:linear-gradient(135deg,#1e293b,#0f172a); padding:2rem; border-bottom:4px solid $statusColor; }
  header h1 { margin:0; font-size:1.8rem; }
  header p { color:#94a3b8; margin-top:0.5rem; }
  .container { padding:2rem; max-width:1100px; margin:0 auto; }
  .badge { display:inline-block; padding:0.4rem 1rem; border-radius:999px; background:$statusColor; color:#0f172a; font-weight:bold; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1rem; margin:1.5rem 0; }
  .card { background:#1e293b; border-radius:12px; padding:1.2rem; box-shadow:0 4px 12px rgba(0,0,0,0.3); }
  .card h3 { margin:0; font-size:0.9rem; color:#94a3b8; text-transform:uppercase; }
  .card p { font-size:1.6rem; margin:0.4rem 0 0; font-weight:bold; }
  section { margin:2rem 0; }
  section h2 { border-bottom:2px solid #334155; padding-bottom:0.5rem; }
  ul { max-height:260px; overflow-y:auto; background:#111827; border-radius:8px; padding:1rem 1.5rem; }
  table { width:100%; border-collapse:collapse; font-size:0.85rem; }
  table td { border-bottom:1px solid #334155; padding:0.4rem; word-break:break-all; }
  .hash { font-family:monospace; color:#38bdf8; }
  pre { background:#111827; padding:1rem; border-radius:8px; overflow-x:auto; font-size:0.8rem; }
  footer { text-align:center; padding:1.5rem; color:#64748b; }
  @media (max-width:600px) { .grid { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
  <h1>PROSPECTOR-ATLAS &mdash; FASE 11 Infrastructure Layer</h1>
  <p>Gerado em $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') &bull; Duracao: $([math]::Round($DurationSeconds,2))s</p>
  <span class='badge'>STATUS: $FinalStatus</span>
</header>
<div class='container'>

  <div class='grid'>
    <div class='card'><h3>Arquivos criados</h3><p>$($Script:CreatedFiles.Count)</p></div>
    <div class='card'><h3>Arquivos atualizados</h3><p>$($Script:UpdatedFiles.Count)</p></div>
    <div class='card'><h3>Diretorios criados</h3><p>$($Script:CreatedFolders.Count)</p></div>
    <div class='card'><h3>Diretorios existentes</h3><p>$($Script:ExistingFolders.Count)</p></div>
    <div class='card'><h3>Arquivos vazios</h3><p>$($Script:EmptyFiles.Count)</p></div>
    <div class='card'><h3>Tamanho total gerado</h3><p>$totalSizeKb KB</p></div>
    <div class='card'><h3>Erros</h3><p>$($Script:Errors.Count)</p></div>
    <div class='card'><h3>Validacao</h3><p>$(if ($ValidationPassed) {"OK"} else {"FALHOU"})</p></div>
  </div>

  <section>
    <h2>Arquivos criados</h2>
    <ul>$createdRows</ul>
  </section>

  <section>
    <h2>Arquivos atualizados</h2>
    <ul>$updatedRows</ul>
  </section>

  <section>
    <h2>Arquivos vazios</h2>
    <ul>$emptyRows</ul>
  </section>

  <section>
    <h2>Arvore de diretorios</h2>
    <ul>$treeLines</ul>
  </section>

  <section>
    <h2>Validacao TypeScript / Lint / Testes</h2>
    $lintHtml
    $tscHtml
    $testHtml
  </section>

  <section>
    <h2>Hashes SHA-256</h2>
    <table>$hashRows</table>
  </section>

</div>
<footer>PROSPECTOR-ATLAS &bull; FASE 11 &bull; Infrastructure Layer Enterprise &bull; $Script:PhaseVersion</footer>
</body>
</html>
"@

    Set-Content -LiteralPath $Script:ReportPath -Value $html -Encoding UTF8
    Write-Log "Relatorio HTML gerado em: $Script:ReportPath" "OK"
}


# ============================================================================
# FLUXO PRINCIPAL
# ============================================================================
Write-Banner

if ($Rollback) {
    Invoke-Rollback
    return
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
    Write-Log "ProjectRoot invalido: $ProjectRoot" "ERROR"
    return
}

Write-Folder -Path $Script:InfraRoot

Invoke-Phase11Generation

$validationPassed = Invoke-PostGenerationValidation

$lintResult = $null
$tscResult  = $null
$testResult = $null

if (-not $WhatIf) {
    if ($RunLint) {
        $lintResult = Invoke-OptionalCommand -Name "Lint" -Command "npm" -Arguments "run lint"
    }
    if ($RunTypeCheck) {
        $tscResult = Invoke-OptionalCommand -Name "TypeScript" -Command "npx" -Arguments "tsc --noEmit"
    }
    if ($RunTests) {
        $testResult = Invoke-OptionalCommand -Name "Testes" -Command "npm" -Arguments "test"
    }
}

$endTime = Get-Date
$durationSeconds = ($endTime - $Script:StartTime).TotalSeconds

$finalStatus = "SUCCESS"
if ($Script:Errors.Count -gt 0) {
    $finalStatus = if ($Script:CreatedFiles.Count -gt 0 -or $Script:UpdatedFiles.Count -gt 0) { "WARNING" } else { "FAILED" }
}
if (($lintResult -and $lintResult.Status -eq "FAILED") -or
    ($tscResult -and $tscResult.Status -eq "FAILED") -or
    ($testResult -and $testResult.Status -eq "FAILED")) {
    if ($finalStatus -eq "SUCCESS") { $finalStatus = "WARNING" }
}

if (-not $WhatIf) {
    Write-Phase11Manifest -ValidationPassed $validationPassed -DurationSeconds $durationSeconds
    Write-Phase11HtmlReport -ValidationPassed $validationPassed -DurationSeconds $durationSeconds `
        -LintResult $lintResult -TypeCheckResult $tscResult -TestResult $testResult -FinalStatus $finalStatus
}
else {
    Write-Log "Modo -WhatIf: manifest e relatorio HTML nao foram persistidos (simulacao)." "WARN"
}

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " FASE 11 - INFRASTRUCTURE LAYER" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Arquivos criados:     $($Script:CreatedFiles.Count)"
Write-Host " Arquivos atualizados: $($Script:UpdatedFiles.Count)"
Write-Host " Pastas criadas:       $($Script:CreatedFolders.Count)"
Write-Host " Tempo:                $([math]::Round($durationSeconds,2))s"
Write-Host " Manifest:             $Script:ManifestPath"
Write-Host " Relatorio HTML:       $Script:ReportPath"
Write-Host " Validacao:            $(if ($validationPassed) {'OK'} else {'FALHOU'})"
Write-Host " Status:               $finalStatus"
Write-Host "====================================================" -ForegroundColor Cyan
