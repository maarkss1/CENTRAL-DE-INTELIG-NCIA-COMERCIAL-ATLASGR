#Requires -Version 5.1
<#
.SYNOPSIS
    PROSPECTOR-ATLAS - FASE 10 - APPLICATION LAYER (CQRS) - Enterprise Generator Script
.DESCRIPTION
    Este script gera automaticamente toda a camada Application (CQRS) do modulo CRM
    do projeto PROSPECTOR-ATLAS, seguindo os padroes de Domain-Driven Design, Clean
    Architecture, Hexagonal Architecture e SOLID utilizados nas Fases 1 a 9.

    Funcionalidades:
        - Geracao completa de Commands, Queries, Handlers, Use Cases, DTOs,
          Validators, Mappers, Application Services, Requests, Responses,
          Interfaces, Policies, Events, Exceptions e arquivos index.ts (barrel).
        - Modo Dry Run (-WhatIf) para simular a execucao sem tocar no disco.
        - Modo Rollback (-Rollback) para desfazer a Fase 10 usando o manifest.
        - Geracao de manifest JSON (phase-10-manifest.json) com hash SHA-256.
        - Validacao pos-geracao (arquivos vazios, diretorios ausentes, etc).
        - Execucao opcional de lint, tsc --noEmit e testes.
        - Geracao de relatorio HTML profissional (FASE-10-REPORT.html).
.PARAMETER WhatIf
    Executa o script em modo de simulacao. Nenhum arquivo ou diretorio e criado,
    alterado ou removido. Um relatorio de simulacao e exibido no console.
.PARAMETER Rollback
    Reverte a Fase 10 lendo o phase-10-manifest.json e removendo apenas os
    arquivos criados por esta fase, alem de diretorios vazios resultantes.
.PARAMETER RunValidations
    Quando presente, executa (se disponiveis) npm run lint, npx tsc --noEmit
    e npm test apos a geracao dos arquivos, registrando o resultado no relatorio.
.PARAMETER TargetRoot
    Diretorio raiz do projeto onde a estrutura src/... sera criada. Por padrao
    utiliza o diretorio atual de execucao do script.
.EXAMPLE
    .\FASE-10-APPLICATION.ps1
.EXAMPLE
    .\FASE-10-APPLICATION.ps1 -WhatIf
.EXAMPLE
    .\FASE-10-APPLICATION.ps1 -Rollback
.EXAMPLE
    .\FASE-10-APPLICATION.ps1 -RunValidations
.NOTES
    Autor      : Arquiteto de Software Enterprise Senior - PROSPECTOR-ATLAS
    Fase       : 10 - Application Layer (CQRS)
    Compat     : Windows PowerShell 5.1 / PowerShell 7+
    Dependencia: Nenhuma (script autocontido)
#>

[CmdletBinding()]
param(
    [switch]$WhatIf,
    [switch]$Rollback,
    [switch]$RunValidations,
    [string]$TargetRoot = (Get-Location).Path
)

Clear-Host

# ============================================================================
# HEADER ENTERPRISE
# ============================================================================

$Global:PhaseNumber   = 10
$Global:PhaseVersion   = "1.0.0"
$Global:PhaseName      = "APPLICATION LAYER (CQRS)"
$Global:StartTime      = Get-Date
$Global:ManifestFile   = Join-Path -Path $TargetRoot -ChildPath "phase-10-manifest.json"
$Global:HtmlReportFile = Join-Path -Path $TargetRoot -ChildPath "FASE-10-REPORT.html"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  PROSPECTOR-ATLAS - ENTERPRISE CODE GENERATOR" -ForegroundColor Cyan
Write-Host "  FASE $($Global:PhaseNumber) - $($Global:PhaseName)" -ForegroundColor Cyan
Write-Host "  Version: $($Global:PhaseVersion)" -ForegroundColor Cyan
Write-Host "  Data/Hora: $($Global:StartTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# VALIDATION (PARAMETROS)
# ============================================================================

if ($WhatIf -and $Rollback) {
    Write-Host "[ERRO] Os parametros -WhatIf e -Rollback nao podem ser utilizados juntos." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -Path $TargetRoot)) {
    Write-Host "[ERRO] O diretorio TargetRoot informado nao existe: $TargetRoot" -ForegroundColor Red
    exit 1
}

# ============================================================================
# LOGGER
# ============================================================================

$Global:LogBuffer = New-Object System.Collections.Generic.List[string]

function Write-Log {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS", "SIMULATE")][string]$Level = "INFO"
    )

    $timestamp = (Get-Date).ToString("HH:mm:ss")
    $line = "[$timestamp] [$Level] $Message"
    $Global:LogBuffer.Add($line)

    switch ($Level) {
        "INFO"     { Write-Host $line -ForegroundColor Gray }
        "WARN"     { Write-Host $line -ForegroundColor Yellow }
        "ERROR"    { Write-Host $line -ForegroundColor Red }
        "SUCCESS"  { Write-Host $line -ForegroundColor Green }
        "SIMULATE" { Write-Host $line -ForegroundColor DarkCyan }
    }
}

# ============================================================================
# ESTADO GLOBAL DE EXECUCAO
# ============================================================================

$Global:FilesCreated       = New-Object System.Collections.Generic.List[string]
$Global:FilesUpdated       = New-Object System.Collections.Generic.List[string]
$Global:DirectoriesCreated = New-Object System.Collections.Generic.List[string]
$Global:FileHashes         = @{}
$Global:EmptyFilesFound    = New-Object System.Collections.Generic.List[string]
$Global:MissingDirectories = New-Object System.Collections.Generic.List[string]
$Global:ValidationErrors   = New-Object System.Collections.Generic.List[string]

# ============================================================================
# FUNCAO: Write-Folder
# ============================================================================

function Write-Folder {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath
    )

    $fullPath = Join-Path -Path $TargetRoot -ChildPath $RelativePath

    if ($WhatIf) {
        if (-not (Test-Path -Path $fullPath)) {
            Write-Log -Message "[SIMULACAO] Diretorio seria criado: $RelativePath" -Level "SIMULATE"
        }
        return
    }

    if (-not (Test-Path -Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        $Global:DirectoriesCreated.Add($RelativePath)
        Write-Log -Message "Diretorio criado: $RelativePath" -Level "SUCCESS"
    }
}

# ============================================================================
# FUNCAO: Write-FileFromContent
# ============================================================================

function Write-FileFromContent {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [Parameter(Mandatory = $true)][string]$Content
    )

    $fullPath = Join-Path -Path $TargetRoot -ChildPath $RelativePath
    $folderPath = Split-Path -Path $fullPath -Parent

    if ($WhatIf) {
        $verb = if (Test-Path -Path $fullPath) { "atualizado" } else { "criado" }
        Write-Log -Message "[SIMULACAO] Arquivo seria $verb : $RelativePath" -Level "SIMULATE"
        return
    }

    if (-not (Test-Path -Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
    }

    $existed = Test-Path -Path $fullPath
    $normalizedContent = $Content.TrimEnd() + "`r`n"

    Set-Content -Path $fullPath -Value $normalizedContent -Encoding UTF8 -NoNewline

    if ($existed) {
        $Global:FilesUpdated.Add($RelativePath)
        Write-Log -Message "Arquivo atualizado: $RelativePath" -Level "SUCCESS"
    } else {
        $Global:FilesCreated.Add($RelativePath)
        Write-Log -Message "Arquivo criado: $RelativePath" -Level "SUCCESS"
    }

    try {
        $hash = Get-FileHash -Path $fullPath -Algorithm SHA256
        $Global:FileHashes[$RelativePath] = $hash.Hash
    } catch {
        Write-Log -Message "Nao foi possivel calcular hash de $RelativePath" -Level "WARN"
    }
}

# ============================================================================
# ROLLBACK MODE
# ============================================================================

function Invoke-Rollback {
    Write-Log -Message "Iniciando processo de ROLLBACK da FASE $($Global:PhaseNumber)..." -Level "WARN"

    if (-not (Test-Path -Path $Global:ManifestFile)) {
        Write-Log -Message "Manifest nao encontrado: $($Global:ManifestFile). Rollback abortado." -Level "ERROR"
        exit 1
    }

    $manifestContent = Get-Content -Path $Global:ManifestFile -Raw | ConvertFrom-Json

    $removedFiles = New-Object System.Collections.Generic.List[string]
    $removedDirs  = New-Object System.Collections.Generic.List[string]
    $notFoundFiles = New-Object System.Collections.Generic.List[string]

    $allManifestFiles = @()
    if ($manifestContent.filesCreated) { $allManifestFiles += $manifestContent.filesCreated }
    if ($manifestContent.filesUpdated) { $allManifestFiles += $manifestContent.filesUpdated }

    foreach ($relPath in $allManifestFiles) {
        $fullPath = Join-Path -Path $TargetRoot -ChildPath $relPath
        if (Test-Path -Path $fullPath) {
            Remove-Item -Path $fullPath -Force
            $removedFiles.Add($relPath)
            Write-Log -Message "Arquivo removido: $relPath" -Level "WARN"
        } else {
            $notFoundFiles.Add($relPath)
        }
    }

    if ($manifestContent.directoriesCreated) {
        $sortedDirs = $manifestContent.directoriesCreated | Sort-Object -Property Length -Descending
        foreach ($dir in $sortedDirs) {
            $fullDirPath = Join-Path -Path $TargetRoot -ChildPath $dir
            if (Test-Path -Path $fullDirPath) {
                $items = Get-ChildItem -Path $fullDirPath -Force -ErrorAction SilentlyContinue
                if (-not $items -or $items.Count -eq 0) {
                    Remove-Item -Path $fullDirPath -Force -Recurse
                    $removedDirs.Add($dir)
                    Write-Log -Message "Diretorio removido (vazio): $dir" -Level "WARN"
                }
            }
        }
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Yellow
    Write-Host "  RELATORIO DE ROLLBACK - FASE $($Global:PhaseNumber)" -ForegroundColor Yellow
    Write-Host "============================================================" -ForegroundColor Yellow
    Write-Host "  Arquivos removidos    : $($removedFiles.Count)" -ForegroundColor White
    Write-Host "  Diretorios removidos  : $($removedDirs.Count)" -ForegroundColor White
    Write-Host "  Arquivos nao encontrados: $($notFoundFiles.Count)" -ForegroundColor White
    Write-Host "============================================================" -ForegroundColor Yellow

    if (Test-Path -Path $Global:ManifestFile) {
        Remove-Item -Path $Global:ManifestFile -Force
        Write-Log -Message "Manifest da Fase $($Global:PhaseNumber) removido." -Level "WARN"
    }

    Write-Log -Message "Rollback concluido." -Level "SUCCESS"
    exit 0
}

if ($Rollback) {
    Invoke-Rollback
}

if ($WhatIf) {
    Write-Log -Message "Executando em MODO DRY RUN (-WhatIf). Nenhuma alteracao sera persistida em disco." -Level "SIMULATE"
}

# ============================================================================
# ESTRUTURA DE DIRETORIOS DA FASE 10
# ============================================================================

$Phase10Directories = @(
    "src/modules/crm/application",
    "src/modules/crm/application/commands",
    "src/modules/crm/application/dto",
    "src/modules/crm/application/events",
    "src/modules/crm/application/exceptions",
    "src/modules/crm/application/handlers",
    "src/modules/crm/application/interfaces",
    "src/modules/crm/application/mappers",
    "src/modules/crm/application/policies",
    "src/modules/crm/application/queries",
    "src/modules/crm/application/requests",
    "src/modules/crm/application/responses",
    "src/modules/crm/application/services",
    "src/modules/crm/application/use-cases",
    "src/modules/crm/application/validators"
)

Write-Log -Message "Criando estrutura de diretorios da FASE $($Global:PhaseNumber)..." -Level "INFO"
foreach ($dir in $Phase10Directories) {
    Write-Folder -RelativePath $dir
}

# ============================================================================
# GERACAO DOS ARQUIVOS TYPESCRIPT DA APPLICATION LAYER (CQRS)
# ============================================================================

Write-Log -Message "Gerando arquivos TypeScript da camada Application (CQRS)..." -Level "INFO"

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CreateLeadCommand.ts" -Content @'
/**
 * @file CreateLeadCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CreateLeadCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CreateLeadCommand
 * Immutable command object carrying the data required to execute
 * the CreateLeadCommand use case following the CQRS write-side contract.
 */
export class CreateLeadCommand implements ICommand {
  public readonly commandName: string = 'CreateLeadCommand';

  public constructor(
    public readonly leadId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly source: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/UpdateLeadCommand.ts" -Content @'
/**
 * @file UpdateLeadCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the UpdateLeadCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * UpdateLeadCommand
 * Immutable command object carrying the data required to execute
 * the UpdateLeadCommand use case following the CQRS write-side contract.
 */
export class UpdateLeadCommand implements ICommand {
  public readonly commandName: string = 'UpdateLeadCommand';

  public constructor(
    public readonly leadId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly source: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/DeleteLeadCommand.ts" -Content @'
/**
 * @file DeleteLeadCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the DeleteLeadCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * DeleteLeadCommand
 * Immutable command object carrying the data required to execute
 * the DeleteLeadCommand use case following the CQRS write-side contract.
 */
export class DeleteLeadCommand implements ICommand {
  public readonly commandName: string = 'DeleteLeadCommand';

  public constructor(
    public readonly leadId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly source: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/QualifyLeadCommand.ts" -Content @'
/**
 * @file QualifyLeadCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the QualifyLeadCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * QualifyLeadCommand
 * Immutable command object carrying the data required to execute
 * the QualifyLeadCommand use case following the CQRS write-side contract.
 */
export class QualifyLeadCommand implements ICommand {
  public readonly commandName: string = 'QualifyLeadCommand';

  public constructor(
    public readonly leadId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly source: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/MoveLeadPipelineCommand.ts" -Content @'
/**
 * @file MoveLeadPipelineCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the MoveLeadPipelineCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * MoveLeadPipelineCommand
 * Immutable command object carrying the data required to execute
 * the MoveLeadPipelineCommand use case following the CQRS write-side contract.
 */
export class MoveLeadPipelineCommand implements ICommand {
  public readonly commandName: string = 'MoveLeadPipelineCommand';

  public constructor(
    public readonly leadId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly source: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/AssignLeadCommand.ts" -Content @'
/**
 * @file AssignLeadCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the AssignLeadCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * AssignLeadCommand
 * Immutable command object carrying the data required to execute
 * the AssignLeadCommand use case following the CQRS write-side contract.
 */
export class AssignLeadCommand implements ICommand {
  public readonly commandName: string = 'AssignLeadCommand';

  public constructor(
    public readonly leadId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly source: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CreateCompanyCommand.ts" -Content @'
/**
 * @file CreateCompanyCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CreateCompanyCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CreateCompanyCommand
 * Immutable command object carrying the data required to execute
 * the CreateCompanyCommand use case following the CQRS write-side contract.
 */
export class CreateCompanyCommand implements ICommand {
  public readonly commandName: string = 'CreateCompanyCommand';

  public constructor(
    public readonly companyId: string,
    public readonly name: string,
    public readonly cnpj: string,
    public readonly industry: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/UpdateCompanyCommand.ts" -Content @'
/**
 * @file UpdateCompanyCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the UpdateCompanyCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * UpdateCompanyCommand
 * Immutable command object carrying the data required to execute
 * the UpdateCompanyCommand use case following the CQRS write-side contract.
 */
export class UpdateCompanyCommand implements ICommand {
  public readonly commandName: string = 'UpdateCompanyCommand';

  public constructor(
    public readonly companyId: string,
    public readonly name: string,
    public readonly cnpj: string,
    public readonly industry: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/DeleteCompanyCommand.ts" -Content @'
/**
 * @file DeleteCompanyCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the DeleteCompanyCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * DeleteCompanyCommand
 * Immutable command object carrying the data required to execute
 * the DeleteCompanyCommand use case following the CQRS write-side contract.
 */
export class DeleteCompanyCommand implements ICommand {
  public readonly commandName: string = 'DeleteCompanyCommand';

  public constructor(
    public readonly companyId: string,
    public readonly name: string,
    public readonly cnpj: string,
    public readonly industry: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CreateContactCommand.ts" -Content @'
/**
 * @file CreateContactCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CreateContactCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CreateContactCommand
 * Immutable command object carrying the data required to execute
 * the CreateContactCommand use case following the CQRS write-side contract.
 */
export class CreateContactCommand implements ICommand {
  public readonly commandName: string = 'CreateContactCommand';

  public constructor(
    public readonly contactId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly companyId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/UpdateContactCommand.ts" -Content @'
/**
 * @file UpdateContactCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the UpdateContactCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * UpdateContactCommand
 * Immutable command object carrying the data required to execute
 * the UpdateContactCommand use case following the CQRS write-side contract.
 */
export class UpdateContactCommand implements ICommand {
  public readonly commandName: string = 'UpdateContactCommand';

  public constructor(
    public readonly contactId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly companyId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/DeleteContactCommand.ts" -Content @'
/**
 * @file DeleteContactCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the DeleteContactCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * DeleteContactCommand
 * Immutable command object carrying the data required to execute
 * the DeleteContactCommand use case following the CQRS write-side contract.
 */
export class DeleteContactCommand implements ICommand {
  public readonly commandName: string = 'DeleteContactCommand';

  public constructor(
    public readonly contactId: string,
    public readonly name: string,
    public readonly email: string,
    public readonly phone: string,
    public readonly companyId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CreateOpportunityCommand.ts" -Content @'
/**
 * @file CreateOpportunityCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CreateOpportunityCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CreateOpportunityCommand
 * Immutable command object carrying the data required to execute
 * the CreateOpportunityCommand use case following the CQRS write-side contract.
 */
export class CreateOpportunityCommand implements ICommand {
  public readonly commandName: string = 'CreateOpportunityCommand';

  public constructor(
    public readonly opportunityId: string,
    public readonly title: string,
    public readonly amount: number,
    public readonly stage: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/UpdateOpportunityCommand.ts" -Content @'
/**
 * @file UpdateOpportunityCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the UpdateOpportunityCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * UpdateOpportunityCommand
 * Immutable command object carrying the data required to execute
 * the UpdateOpportunityCommand use case following the CQRS write-side contract.
 */
export class UpdateOpportunityCommand implements ICommand {
  public readonly commandName: string = 'UpdateOpportunityCommand';

  public constructor(
    public readonly opportunityId: string,
    public readonly title: string,
    public readonly amount: number,
    public readonly stage: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/DeleteOpportunityCommand.ts" -Content @'
/**
 * @file DeleteOpportunityCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the DeleteOpportunityCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * DeleteOpportunityCommand
 * Immutable command object carrying the data required to execute
 * the DeleteOpportunityCommand use case following the CQRS write-side contract.
 */
export class DeleteOpportunityCommand implements ICommand {
  public readonly commandName: string = 'DeleteOpportunityCommand';

  public constructor(
    public readonly opportunityId: string,
    public readonly title: string,
    public readonly amount: number,
    public readonly stage: string,
    public readonly ownerId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CreateTaskCommand.ts" -Content @'
/**
 * @file CreateTaskCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CreateTaskCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CreateTaskCommand
 * Immutable command object carrying the data required to execute
 * the CreateTaskCommand use case following the CQRS write-side contract.
 */
export class CreateTaskCommand implements ICommand {
  public readonly commandName: string = 'CreateTaskCommand';

  public constructor(
    public readonly taskId: string,
    public readonly title: string,
    public readonly dueDate: Date,
    public readonly assigneeId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CompleteTaskCommand.ts" -Content @'
/**
 * @file CompleteTaskCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CompleteTaskCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CompleteTaskCommand
 * Immutable command object carrying the data required to execute
 * the CompleteTaskCommand use case following the CQRS write-side contract.
 */
export class CompleteTaskCommand implements ICommand {
  public readonly commandName: string = 'CompleteTaskCommand';

  public constructor(
    public readonly taskId: string,
    public readonly title: string,
    public readonly dueDate: Date,
    public readonly assigneeId: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CreateMeetingCommand.ts" -Content @'
/**
 * @file CreateMeetingCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CreateMeetingCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CreateMeetingCommand
 * Immutable command object carrying the data required to execute
 * the CreateMeetingCommand use case following the CQRS write-side contract.
 */
export class CreateMeetingCommand implements ICommand {
  public readonly commandName: string = 'CreateMeetingCommand';

  public constructor(
    public readonly meetingId: string,
    public readonly title: string,
    public readonly scheduledAt: Date,
    public readonly participants: readonly string[],
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/SendProposalCommand.ts" -Content @'
/**
 * @file SendProposalCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the SendProposalCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * SendProposalCommand
 * Immutable command object carrying the data required to execute
 * the SendProposalCommand use case following the CQRS write-side contract.
 */
export class SendProposalCommand implements ICommand {
  public readonly commandName: string = 'SendProposalCommand';

  public constructor(
    public readonly proposalId: string,
    public readonly opportunityId: string,
    public readonly amount: number,
    public readonly validUntil: Date,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/CloseDealCommand.ts" -Content @'
/**
 * @file CloseDealCommand.ts
 * @module modules/crm/application/commands
 * @description Command DTO representing the CloseDealCommand intent within the CQRS write pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommand } from '../interfaces/ICommand';

/**
 * CloseDealCommand
 * Immutable command object carrying the data required to execute
 * the CloseDealCommand use case following the CQRS write-side contract.
 */
export class CloseDealCommand implements ICommand {
  public readonly commandName: string = 'CloseDealCommand';

  public constructor(
    public readonly dealId: string,
    public readonly opportunityId: string,
    public readonly closedAt: Date,
    public readonly amount: number,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetLeadByIdQuery.ts" -Content @'
/**
 * @file GetLeadByIdQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetLeadByIdQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetLeadByIdQuery
 * Immutable query object describing the parameters required to
 * resolve the GetLeadByIdQuery read model.
 */
export class GetLeadByIdQuery implements IQuery {
  public readonly queryName: string = 'GetLeadByIdQuery';

  public constructor(
    public readonly leadId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
    public readonly filters?: Readonly<Record<string, string>>,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetCompanyByIdQuery.ts" -Content @'
/**
 * @file GetCompanyByIdQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetCompanyByIdQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetCompanyByIdQuery
 * Immutable query object describing the parameters required to
 * resolve the GetCompanyByIdQuery read model.
 */
export class GetCompanyByIdQuery implements IQuery {
  public readonly queryName: string = 'GetCompanyByIdQuery';

  public constructor(
    public readonly companyId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetContactByIdQuery.ts" -Content @'
/**
 * @file GetContactByIdQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetContactByIdQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetContactByIdQuery
 * Immutable query object describing the parameters required to
 * resolve the GetContactByIdQuery read model.
 */
export class GetContactByIdQuery implements IQuery {
  public readonly queryName: string = 'GetContactByIdQuery';

  public constructor(
    public readonly contactId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetOpportunityByIdQuery.ts" -Content @'
/**
 * @file GetOpportunityByIdQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetOpportunityByIdQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetOpportunityByIdQuery
 * Immutable query object describing the parameters required to
 * resolve the GetOpportunityByIdQuery read model.
 */
export class GetOpportunityByIdQuery implements IQuery {
  public readonly queryName: string = 'GetOpportunityByIdQuery';

  public constructor(
    public readonly opportunityId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetPipelineQuery.ts" -Content @'
/**
 * @file GetPipelineQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetPipelineQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetPipelineQuery
 * Immutable query object describing the parameters required to
 * resolve the GetPipelineQuery read model.
 */
export class GetPipelineQuery implements IQuery {
  public readonly queryName: string = 'GetPipelineQuery';

  public constructor(
    public readonly pipelineId?: string,
    public readonly ownerId?: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetTasksQuery.ts" -Content @'
/**
 * @file GetTasksQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetTasksQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetTasksQuery
 * Immutable query object describing the parameters required to
 * resolve the GetTasksQuery read model.
 */
export class GetTasksQuery implements IQuery {
  public readonly queryName: string = 'GetTasksQuery';

  public constructor(
    public readonly assigneeId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetMeetingsQuery.ts" -Content @'
/**
 * @file GetMeetingsQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetMeetingsQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetMeetingsQuery
 * Immutable query object describing the parameters required to
 * resolve the GetMeetingsQuery read model.
 */
export class GetMeetingsQuery implements IQuery {
  public readonly queryName: string = 'GetMeetingsQuery';

  public constructor(
    public readonly participantId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/GetActivitiesQuery.ts" -Content @'
/**
 * @file GetActivitiesQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the GetActivitiesQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * GetActivitiesQuery
 * Immutable query object describing the parameters required to
 * resolve the GetActivitiesQuery read model.
 */
export class GetActivitiesQuery implements IQuery {
  public readonly queryName: string = 'GetActivitiesQuery';

  public constructor(
    public readonly id?: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/SearchLeadsQuery.ts" -Content @'
/**
 * @file SearchLeadsQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the SearchLeadsQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * SearchLeadsQuery
 * Immutable query object describing the parameters required to
 * resolve the SearchLeadsQuery read model.
 */
export class SearchLeadsQuery implements IQuery {
  public readonly queryName: string = 'SearchLeadsQuery';

  public constructor(
    public readonly leadId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
    public readonly filters?: Readonly<Record<string, string>>,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/SearchCompaniesQuery.ts" -Content @'
/**
 * @file SearchCompaniesQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the SearchCompaniesQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * SearchCompaniesQuery
 * Immutable query object describing the parameters required to
 * resolve the SearchCompaniesQuery read model.
 */
export class SearchCompaniesQuery implements IQuery {
  public readonly queryName: string = 'SearchCompaniesQuery';

  public constructor(
    public readonly id?: string,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/SearchContactsQuery.ts" -Content @'
/**
 * @file SearchContactsQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the SearchContactsQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * SearchContactsQuery
 * Immutable query object describing the parameters required to
 * resolve the SearchContactsQuery read model.
 */
export class SearchContactsQuery implements IQuery {
  public readonly queryName: string = 'SearchContactsQuery';

  public constructor(
    public readonly contactId?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/SearchDealsQuery.ts" -Content @'
/**
 * @file SearchDealsQuery.ts
 * @module modules/crm/application/queries
 * @description Query object representing the SearchDealsQuery read intent within the CQRS read pipeline.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQuery } from '../interfaces/IQuery';

/**
 * SearchDealsQuery
 * Immutable query object describing the parameters required to
 * resolve the SearchDealsQuery read model.
 */
export class SearchDealsQuery implements IQuery {
  public readonly queryName: string = 'SearchDealsQuery';

  public constructor(
    public readonly term?: string,
    public readonly page: number = 1,
    public readonly pageSize: number = 20,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CreateLeadCommandHandler.ts" -Content @'
/**
 * @file CreateLeadCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CreateLeadCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CreateLeadCommand } from '../commands/CreateLeadCommand';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * CreateLeadCommandHandlerHandler
 * Resolves a CreateLeadCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CreateLeadCommandHandlerHandler implements ICommandHandler<CreateLeadCommand, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: CreateLeadCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/UpdateLeadCommandHandler.ts" -Content @'
/**
 * @file UpdateLeadCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of UpdateLeadCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { UpdateLeadCommand } from '../commands/UpdateLeadCommand';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * UpdateLeadCommandHandlerHandler
 * Resolves a UpdateLeadCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class UpdateLeadCommandHandlerHandler implements ICommandHandler<UpdateLeadCommand, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: UpdateLeadCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/DeleteLeadCommandHandler.ts" -Content @'
/**
 * @file DeleteLeadCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of DeleteLeadCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { DeleteLeadCommand } from '../commands/DeleteLeadCommand';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * DeleteLeadCommandHandlerHandler
 * Resolves a DeleteLeadCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class DeleteLeadCommandHandlerHandler implements ICommandHandler<DeleteLeadCommand, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: DeleteLeadCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/QualifyLeadCommandHandler.ts" -Content @'
/**
 * @file QualifyLeadCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of QualifyLeadCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { QualifyLeadCommand } from '../commands/QualifyLeadCommand';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * QualifyLeadCommandHandlerHandler
 * Resolves a QualifyLeadCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class QualifyLeadCommandHandlerHandler implements ICommandHandler<QualifyLeadCommand, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: QualifyLeadCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/MoveLeadPipelineCommandHandler.ts" -Content @'
/**
 * @file MoveLeadPipelineCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of MoveLeadPipelineCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { MoveLeadPipelineCommand } from '../commands/MoveLeadPipelineCommand';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * MoveLeadPipelineCommandHandlerHandler
 * Resolves a MoveLeadPipelineCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class MoveLeadPipelineCommandHandlerHandler implements ICommandHandler<MoveLeadPipelineCommand, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: MoveLeadPipelineCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/AssignLeadCommandHandler.ts" -Content @'
/**
 * @file AssignLeadCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of AssignLeadCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { AssignLeadCommand } from '../commands/AssignLeadCommand';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * AssignLeadCommandHandlerHandler
 * Resolves a AssignLeadCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class AssignLeadCommandHandlerHandler implements ICommandHandler<AssignLeadCommand, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: AssignLeadCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CreateCompanyCommandHandler.ts" -Content @'
/**
 * @file CreateCompanyCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CreateCompanyCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CreateCompanyCommand } from '../commands/CreateCompanyCommand';
import type { CompanyApplicationService } from '../services/CompanyApplicationService';

/**
 * CreateCompanyCommandHandlerHandler
 * Resolves a CreateCompanyCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CreateCompanyCommandHandlerHandler implements ICommandHandler<CreateCompanyCommand, unknown> {
  public constructor(private readonly service: CompanyApplicationService) {}

  public async handle(input: CreateCompanyCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/UpdateCompanyCommandHandler.ts" -Content @'
/**
 * @file UpdateCompanyCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of UpdateCompanyCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { UpdateCompanyCommand } from '../commands/UpdateCompanyCommand';
import type { CompanyApplicationService } from '../services/CompanyApplicationService';

/**
 * UpdateCompanyCommandHandlerHandler
 * Resolves a UpdateCompanyCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class UpdateCompanyCommandHandlerHandler implements ICommandHandler<UpdateCompanyCommand, unknown> {
  public constructor(private readonly service: CompanyApplicationService) {}

  public async handle(input: UpdateCompanyCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/DeleteCompanyCommandHandler.ts" -Content @'
/**
 * @file DeleteCompanyCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of DeleteCompanyCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { DeleteCompanyCommand } from '../commands/DeleteCompanyCommand';
import type { CompanyApplicationService } from '../services/CompanyApplicationService';

/**
 * DeleteCompanyCommandHandlerHandler
 * Resolves a DeleteCompanyCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class DeleteCompanyCommandHandlerHandler implements ICommandHandler<DeleteCompanyCommand, unknown> {
  public constructor(private readonly service: CompanyApplicationService) {}

  public async handle(input: DeleteCompanyCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CreateContactCommandHandler.ts" -Content @'
/**
 * @file CreateContactCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CreateContactCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CreateContactCommand } from '../commands/CreateContactCommand';
import type { ContactApplicationService } from '../services/ContactApplicationService';

/**
 * CreateContactCommandHandlerHandler
 * Resolves a CreateContactCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CreateContactCommandHandlerHandler implements ICommandHandler<CreateContactCommand, unknown> {
  public constructor(private readonly service: ContactApplicationService) {}

  public async handle(input: CreateContactCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/UpdateContactCommandHandler.ts" -Content @'
/**
 * @file UpdateContactCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of UpdateContactCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { UpdateContactCommand } from '../commands/UpdateContactCommand';
import type { ContactApplicationService } from '../services/ContactApplicationService';

/**
 * UpdateContactCommandHandlerHandler
 * Resolves a UpdateContactCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class UpdateContactCommandHandlerHandler implements ICommandHandler<UpdateContactCommand, unknown> {
  public constructor(private readonly service: ContactApplicationService) {}

  public async handle(input: UpdateContactCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/DeleteContactCommandHandler.ts" -Content @'
/**
 * @file DeleteContactCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of DeleteContactCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { DeleteContactCommand } from '../commands/DeleteContactCommand';
import type { ContactApplicationService } from '../services/ContactApplicationService';

/**
 * DeleteContactCommandHandlerHandler
 * Resolves a DeleteContactCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class DeleteContactCommandHandlerHandler implements ICommandHandler<DeleteContactCommand, unknown> {
  public constructor(private readonly service: ContactApplicationService) {}

  public async handle(input: DeleteContactCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CreateOpportunityCommandHandler.ts" -Content @'
/**
 * @file CreateOpportunityCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CreateOpportunityCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CreateOpportunityCommand } from '../commands/CreateOpportunityCommand';
import type { OpportunityApplicationService } from '../services/OpportunityApplicationService';

/**
 * CreateOpportunityCommandHandlerHandler
 * Resolves a CreateOpportunityCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CreateOpportunityCommandHandlerHandler implements ICommandHandler<CreateOpportunityCommand, unknown> {
  public constructor(private readonly service: OpportunityApplicationService) {}

  public async handle(input: CreateOpportunityCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/UpdateOpportunityCommandHandler.ts" -Content @'
/**
 * @file UpdateOpportunityCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of UpdateOpportunityCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { UpdateOpportunityCommand } from '../commands/UpdateOpportunityCommand';
import type { OpportunityApplicationService } from '../services/OpportunityApplicationService';

/**
 * UpdateOpportunityCommandHandlerHandler
 * Resolves a UpdateOpportunityCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class UpdateOpportunityCommandHandlerHandler implements ICommandHandler<UpdateOpportunityCommand, unknown> {
  public constructor(private readonly service: OpportunityApplicationService) {}

  public async handle(input: UpdateOpportunityCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/DeleteOpportunityCommandHandler.ts" -Content @'
/**
 * @file DeleteOpportunityCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of DeleteOpportunityCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { DeleteOpportunityCommand } from '../commands/DeleteOpportunityCommand';
import type { OpportunityApplicationService } from '../services/OpportunityApplicationService';

/**
 * DeleteOpportunityCommandHandlerHandler
 * Resolves a DeleteOpportunityCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class DeleteOpportunityCommandHandlerHandler implements ICommandHandler<DeleteOpportunityCommand, unknown> {
  public constructor(private readonly service: OpportunityApplicationService) {}

  public async handle(input: DeleteOpportunityCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CreateTaskCommandHandler.ts" -Content @'
/**
 * @file CreateTaskCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CreateTaskCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CreateTaskCommand } from '../commands/CreateTaskCommand';
import type { TaskApplicationService } from '../services/TaskApplicationService';

/**
 * CreateTaskCommandHandlerHandler
 * Resolves a CreateTaskCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CreateTaskCommandHandlerHandler implements ICommandHandler<CreateTaskCommand, unknown> {
  public constructor(private readonly service: TaskApplicationService) {}

  public async handle(input: CreateTaskCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CompleteTaskCommandHandler.ts" -Content @'
/**
 * @file CompleteTaskCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CompleteTaskCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CompleteTaskCommand } from '../commands/CompleteTaskCommand';
import type { TaskApplicationService } from '../services/TaskApplicationService';

/**
 * CompleteTaskCommandHandlerHandler
 * Resolves a CompleteTaskCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CompleteTaskCommandHandlerHandler implements ICommandHandler<CompleteTaskCommand, unknown> {
  public constructor(private readonly service: TaskApplicationService) {}

  public async handle(input: CompleteTaskCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CreateMeetingCommandHandler.ts" -Content @'
/**
 * @file CreateMeetingCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CreateMeetingCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CreateMeetingCommand } from '../commands/CreateMeetingCommand';
import type { MeetingApplicationService } from '../services/MeetingApplicationService';

/**
 * CreateMeetingCommandHandlerHandler
 * Resolves a CreateMeetingCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CreateMeetingCommandHandlerHandler implements ICommandHandler<CreateMeetingCommand, unknown> {
  public constructor(private readonly service: MeetingApplicationService) {}

  public async handle(input: CreateMeetingCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/SendProposalCommandHandler.ts" -Content @'
/**
 * @file SendProposalCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of SendProposalCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { SendProposalCommand } from '../commands/SendProposalCommand';
import type { ProposalApplicationService } from '../services/ProposalApplicationService';

/**
 * SendProposalCommandHandlerHandler
 * Resolves a SendProposalCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class SendProposalCommandHandlerHandler implements ICommandHandler<SendProposalCommand, unknown> {
  public constructor(private readonly service: ProposalApplicationService) {}

  public async handle(input: SendProposalCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/CloseDealCommandHandler.ts" -Content @'
/**
 * @file CloseDealCommandHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of CloseDealCommand.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICommandHandler } from '../interfaces/ICommandHandler';
import type { CloseDealCommand } from '../commands/CloseDealCommand';
import type { DealApplicationService } from '../services/DealApplicationService';

/**
 * CloseDealCommandHandlerHandler
 * Resolves a CloseDealCommand by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class CloseDealCommandHandlerHandler implements ICommandHandler<CloseDealCommand, unknown> {
  public constructor(private readonly service: DealApplicationService) {}

  public async handle(input: CloseDealCommand): Promise<unknown> {
    return this.service.handleCommand(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetLeadByIdQueryHandler.ts" -Content @'
/**
 * @file GetLeadByIdQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetLeadByIdQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetLeadByIdQuery } from '../queries/GetLeadByIdQuery';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * GetLeadByIdQueryHandlerHandler
 * Resolves a GetLeadByIdQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetLeadByIdQueryHandlerHandler implements IQueryHandler<GetLeadByIdQuery, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: GetLeadByIdQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetCompanyByIdQueryHandler.ts" -Content @'
/**
 * @file GetCompanyByIdQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetCompanyByIdQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetCompanyByIdQuery } from '../queries/GetCompanyByIdQuery';
import type { CompanyApplicationService } from '../services/CompanyApplicationService';

/**
 * GetCompanyByIdQueryHandlerHandler
 * Resolves a GetCompanyByIdQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetCompanyByIdQueryHandlerHandler implements IQueryHandler<GetCompanyByIdQuery, unknown> {
  public constructor(private readonly service: CompanyApplicationService) {}

  public async handle(input: GetCompanyByIdQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetContactByIdQueryHandler.ts" -Content @'
/**
 * @file GetContactByIdQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetContactByIdQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetContactByIdQuery } from '../queries/GetContactByIdQuery';
import type { ContactApplicationService } from '../services/ContactApplicationService';

/**
 * GetContactByIdQueryHandlerHandler
 * Resolves a GetContactByIdQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetContactByIdQueryHandlerHandler implements IQueryHandler<GetContactByIdQuery, unknown> {
  public constructor(private readonly service: ContactApplicationService) {}

  public async handle(input: GetContactByIdQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetOpportunityByIdQueryHandler.ts" -Content @'
/**
 * @file GetOpportunityByIdQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetOpportunityByIdQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetOpportunityByIdQuery } from '../queries/GetOpportunityByIdQuery';
import type { OpportunityApplicationService } from '../services/OpportunityApplicationService';

/**
 * GetOpportunityByIdQueryHandlerHandler
 * Resolves a GetOpportunityByIdQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetOpportunityByIdQueryHandlerHandler implements IQueryHandler<GetOpportunityByIdQuery, unknown> {
  public constructor(private readonly service: OpportunityApplicationService) {}

  public async handle(input: GetOpportunityByIdQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetPipelineQueryHandler.ts" -Content @'
/**
 * @file GetPipelineQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetPipelineQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetPipelineQuery } from '../queries/GetPipelineQuery';
import type { PipelineApplicationService } from '../services/PipelineApplicationService';

/**
 * GetPipelineQueryHandlerHandler
 * Resolves a GetPipelineQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetPipelineQueryHandlerHandler implements IQueryHandler<GetPipelineQuery, unknown> {
  public constructor(private readonly service: PipelineApplicationService) {}

  public async handle(input: GetPipelineQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetTasksQueryHandler.ts" -Content @'
/**
 * @file GetTasksQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetTasksQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetTasksQuery } from '../queries/GetTasksQuery';
import type { TaskApplicationService } from '../services/TaskApplicationService';

/**
 * GetTasksQueryHandlerHandler
 * Resolves a GetTasksQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetTasksQueryHandlerHandler implements IQueryHandler<GetTasksQuery, unknown> {
  public constructor(private readonly service: TaskApplicationService) {}

  public async handle(input: GetTasksQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetMeetingsQueryHandler.ts" -Content @'
/**
 * @file GetMeetingsQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetMeetingsQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetMeetingsQuery } from '../queries/GetMeetingsQuery';
import type { MeetingApplicationService } from '../services/MeetingApplicationService';

/**
 * GetMeetingsQueryHandlerHandler
 * Resolves a GetMeetingsQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetMeetingsQueryHandlerHandler implements IQueryHandler<GetMeetingsQuery, unknown> {
  public constructor(private readonly service: MeetingApplicationService) {}

  public async handle(input: GetMeetingsQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/GetActivitiesQueryHandler.ts" -Content @'
/**
 * @file GetActivitiesQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of GetActivitiesQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { GetActivitiesQuery } from '../queries/GetActivitiesQuery';
import type { GenericApplicationService } from '../services/GenericApplicationService';

/**
 * GetActivitiesQueryHandlerHandler
 * Resolves a GetActivitiesQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class GetActivitiesQueryHandlerHandler implements IQueryHandler<GetActivitiesQuery, unknown> {
  public constructor(private readonly service: GenericApplicationService) {}

  public async handle(input: GetActivitiesQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/SearchLeadsQueryHandler.ts" -Content @'
/**
 * @file SearchLeadsQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of SearchLeadsQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { SearchLeadsQuery } from '../queries/SearchLeadsQuery';
import type { LeadApplicationService } from '../services/LeadApplicationService';

/**
 * SearchLeadsQueryHandlerHandler
 * Resolves a SearchLeadsQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class SearchLeadsQueryHandlerHandler implements IQueryHandler<SearchLeadsQuery, unknown> {
  public constructor(private readonly service: LeadApplicationService) {}

  public async handle(input: SearchLeadsQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/SearchCompaniesQueryHandler.ts" -Content @'
/**
 * @file SearchCompaniesQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of SearchCompaniesQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { SearchCompaniesQuery } from '../queries/SearchCompaniesQuery';
import type { GenericApplicationService } from '../services/GenericApplicationService';

/**
 * SearchCompaniesQueryHandlerHandler
 * Resolves a SearchCompaniesQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class SearchCompaniesQueryHandlerHandler implements IQueryHandler<SearchCompaniesQuery, unknown> {
  public constructor(private readonly service: GenericApplicationService) {}

  public async handle(input: SearchCompaniesQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/SearchContactsQueryHandler.ts" -Content @'
/**
 * @file SearchContactsQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of SearchContactsQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { SearchContactsQuery } from '../queries/SearchContactsQuery';
import type { ContactApplicationService } from '../services/ContactApplicationService';

/**
 * SearchContactsQueryHandlerHandler
 * Resolves a SearchContactsQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class SearchContactsQueryHandlerHandler implements IQueryHandler<SearchContactsQuery, unknown> {
  public constructor(private readonly service: ContactApplicationService) {}

  public async handle(input: SearchContactsQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/SearchDealsQueryHandler.ts" -Content @'
/**
 * @file SearchDealsQueryHandlerHandler.ts
 * @module modules/crm/application/handlers
 * @description Handler responsible for orchestrating the execution of SearchDealsQuery.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IQueryHandler } from '../interfaces/IQueryHandler';
import type { SearchDealsQuery } from '../queries/SearchDealsQuery';
import type { DealApplicationService } from '../services/DealApplicationService';

/**
 * SearchDealsQueryHandlerHandler
 * Resolves a SearchDealsQuery by delegating to the corresponding
 * application service, keeping the CQRS handler thin and orchestration-only.
 */
export class SearchDealsQueryHandlerHandler implements IQueryHandler<SearchDealsQuery, unknown> {
  public constructor(private readonly service: DealApplicationService) {}

  public async handle(input: SearchDealsQuery): Promise<unknown> {
    return this.service.handleQuery(input);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/CreateLeadUseCase.ts" -Content @'
/**
 * @file CreateLeadUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for CreateLeadUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { LeadMapper } from '../mappers/LeadMapper';
import type { LeadPolicy } from '../policies/LeadPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CreateLeadUseCaseInput
 * Input contract required to execute the CreateLeadUseCase.
 */
export interface CreateLeadUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * CreateLeadUseCaseOutput
 * Output contract produced after executing the CreateLeadUseCase.
 */
export interface CreateLeadUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * CreateLeadUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class CreateLeadUseCase {
  public constructor(
    private readonly mapper: LeadMapper,
    private readonly policy: LeadPolicy,
  ) {}

  public async execute(input: CreateLeadUseCaseInput): Promise<CreateLeadUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute CreateLeadUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/UpdateLeadUseCase.ts" -Content @'
/**
 * @file UpdateLeadUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for UpdateLeadUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { LeadMapper } from '../mappers/LeadMapper';
import type { LeadPolicy } from '../policies/LeadPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * UpdateLeadUseCaseInput
 * Input contract required to execute the UpdateLeadUseCase.
 */
export interface UpdateLeadUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * UpdateLeadUseCaseOutput
 * Output contract produced after executing the UpdateLeadUseCase.
 */
export interface UpdateLeadUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * UpdateLeadUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class UpdateLeadUseCase {
  public constructor(
    private readonly mapper: LeadMapper,
    private readonly policy: LeadPolicy,
  ) {}

  public async execute(input: UpdateLeadUseCaseInput): Promise<UpdateLeadUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute UpdateLeadUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/DeleteLeadUseCase.ts" -Content @'
/**
 * @file DeleteLeadUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for DeleteLeadUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { LeadMapper } from '../mappers/LeadMapper';
import type { LeadPolicy } from '../policies/LeadPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * DeleteLeadUseCaseInput
 * Input contract required to execute the DeleteLeadUseCase.
 */
export interface DeleteLeadUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * DeleteLeadUseCaseOutput
 * Output contract produced after executing the DeleteLeadUseCase.
 */
export interface DeleteLeadUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * DeleteLeadUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class DeleteLeadUseCase {
  public constructor(
    private readonly mapper: LeadMapper,
    private readonly policy: LeadPolicy,
  ) {}

  public async execute(input: DeleteLeadUseCaseInput): Promise<DeleteLeadUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute DeleteLeadUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/QualifyLeadUseCase.ts" -Content @'
/**
 * @file QualifyLeadUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for QualifyLeadUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { LeadMapper } from '../mappers/LeadMapper';
import type { LeadPolicy } from '../policies/LeadPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * QualifyLeadUseCaseInput
 * Input contract required to execute the QualifyLeadUseCase.
 */
export interface QualifyLeadUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * QualifyLeadUseCaseOutput
 * Output contract produced after executing the QualifyLeadUseCase.
 */
export interface QualifyLeadUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * QualifyLeadUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class QualifyLeadUseCase {
  public constructor(
    private readonly mapper: LeadMapper,
    private readonly policy: LeadPolicy,
  ) {}

  public async execute(input: QualifyLeadUseCaseInput): Promise<QualifyLeadUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute QualifyLeadUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/MoveLeadPipelineUseCase.ts" -Content @'
/**
 * @file MoveLeadPipelineUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for MoveLeadPipelineUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { LeadMapper } from '../mappers/LeadMapper';
import type { LeadPolicy } from '../policies/LeadPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * MoveLeadPipelineUseCaseInput
 * Input contract required to execute the MoveLeadPipelineUseCase.
 */
export interface MoveLeadPipelineUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * MoveLeadPipelineUseCaseOutput
 * Output contract produced after executing the MoveLeadPipelineUseCase.
 */
export interface MoveLeadPipelineUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * MoveLeadPipelineUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class MoveLeadPipelineUseCase {
  public constructor(
    private readonly mapper: LeadMapper,
    private readonly policy: LeadPolicy,
  ) {}

  public async execute(input: MoveLeadPipelineUseCaseInput): Promise<MoveLeadPipelineUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute MoveLeadPipelineUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/AssignLeadUseCase.ts" -Content @'
/**
 * @file AssignLeadUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for AssignLeadUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { LeadMapper } from '../mappers/LeadMapper';
import type { LeadPolicy } from '../policies/LeadPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * AssignLeadUseCaseInput
 * Input contract required to execute the AssignLeadUseCase.
 */
export interface AssignLeadUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * AssignLeadUseCaseOutput
 * Output contract produced after executing the AssignLeadUseCase.
 */
export interface AssignLeadUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * AssignLeadUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class AssignLeadUseCase {
  public constructor(
    private readonly mapper: LeadMapper,
    private readonly policy: LeadPolicy,
  ) {}

  public async execute(input: AssignLeadUseCaseInput): Promise<AssignLeadUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute AssignLeadUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/CreateCompanyUseCase.ts" -Content @'
/**
 * @file CreateCompanyUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for CreateCompanyUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { CompanyMapper } from '../mappers/CompanyMapper';
import type { CompanyPolicy } from '../policies/CompanyPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CreateCompanyUseCaseInput
 * Input contract required to execute the CreateCompanyUseCase.
 */
export interface CreateCompanyUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * CreateCompanyUseCaseOutput
 * Output contract produced after executing the CreateCompanyUseCase.
 */
export interface CreateCompanyUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * CreateCompanyUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class CreateCompanyUseCase {
  public constructor(
    private readonly mapper: CompanyMapper,
    private readonly policy: CompanyPolicy,
  ) {}

  public async execute(input: CreateCompanyUseCaseInput): Promise<CreateCompanyUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute CreateCompanyUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/CreateContactUseCase.ts" -Content @'
/**
 * @file CreateContactUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for CreateContactUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ContactMapper } from '../mappers/ContactMapper';
import type { ContactPolicy } from '../policies/ContactPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CreateContactUseCaseInput
 * Input contract required to execute the CreateContactUseCase.
 */
export interface CreateContactUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * CreateContactUseCaseOutput
 * Output contract produced after executing the CreateContactUseCase.
 */
export interface CreateContactUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * CreateContactUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class CreateContactUseCase {
  public constructor(
    private readonly mapper: ContactMapper,
    private readonly policy: ContactPolicy,
  ) {}

  public async execute(input: CreateContactUseCaseInput): Promise<CreateContactUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute CreateContactUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/CreateOpportunityUseCase.ts" -Content @'
/**
 * @file CreateOpportunityUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for CreateOpportunityUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { OpportunityMapper } from '../mappers/OpportunityMapper';
import type { OpportunityPolicy } from '../policies/OpportunityPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CreateOpportunityUseCaseInput
 * Input contract required to execute the CreateOpportunityUseCase.
 */
export interface CreateOpportunityUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * CreateOpportunityUseCaseOutput
 * Output contract produced after executing the CreateOpportunityUseCase.
 */
export interface CreateOpportunityUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * CreateOpportunityUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class CreateOpportunityUseCase {
  public constructor(
    private readonly mapper: OpportunityMapper,
    private readonly policy: OpportunityPolicy,
  ) {}

  public async execute(input: CreateOpportunityUseCaseInput): Promise<CreateOpportunityUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute CreateOpportunityUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/CloseDealUseCase.ts" -Content @'
/**
 * @file CloseDealUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for CloseDealUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { DealMapper } from '../mappers/DealMapper';
import type { DealPolicy } from '../policies/DealPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CloseDealUseCaseInput
 * Input contract required to execute the CloseDealUseCase.
 */
export interface CloseDealUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * CloseDealUseCaseOutput
 * Output contract produced after executing the CloseDealUseCase.
 */
export interface CloseDealUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * CloseDealUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class CloseDealUseCase {
  public constructor(
    private readonly mapper: DealMapper,
    private readonly policy: DealPolicy,
  ) {}

  public async execute(input: CloseDealUseCaseInput): Promise<CloseDealUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute CloseDealUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/CompleteTaskUseCase.ts" -Content @'
/**
 * @file CompleteTaskUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for CompleteTaskUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { TaskMapper } from '../mappers/TaskMapper';
import type { TaskPolicy } from '../policies/TaskPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CompleteTaskUseCaseInput
 * Input contract required to execute the CompleteTaskUseCase.
 */
export interface CompleteTaskUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * CompleteTaskUseCaseOutput
 * Output contract produced after executing the CompleteTaskUseCase.
 */
export interface CompleteTaskUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * CompleteTaskUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class CompleteTaskUseCase {
  public constructor(
    private readonly mapper: TaskMapper,
    private readonly policy: TaskPolicy,
  ) {}

  public async execute(input: CompleteTaskUseCaseInput): Promise<CompleteTaskUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute CompleteTaskUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/ScheduleMeetingUseCase.ts" -Content @'
/**
 * @file ScheduleMeetingUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for ScheduleMeetingUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { MeetingMapper } from '../mappers/MeetingMapper';
import type { MeetingPolicy } from '../policies/MeetingPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * ScheduleMeetingUseCaseInput
 * Input contract required to execute the ScheduleMeetingUseCase.
 */
export interface ScheduleMeetingUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * ScheduleMeetingUseCaseOutput
 * Output contract produced after executing the ScheduleMeetingUseCase.
 */
export interface ScheduleMeetingUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * ScheduleMeetingUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class ScheduleMeetingUseCase {
  public constructor(
    private readonly mapper: MeetingMapper,
    private readonly policy: MeetingPolicy,
  ) {}

  public async execute(input: ScheduleMeetingUseCaseInput): Promise<ScheduleMeetingUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute ScheduleMeetingUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/SendProposalUseCase.ts" -Content @'
/**
 * @file SendProposalUseCase.ts
 * @module modules/crm/application/use-cases
 * @description Use case encapsulating the business orchestration for SendProposalUseCase.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ProposalMapper } from '../mappers/ProposalMapper';
import type { ProposalPolicy } from '../policies/ProposalPolicy';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * SendProposalUseCaseInput
 * Input contract required to execute the SendProposalUseCase.
 */
export interface SendProposalUseCaseInput {
  readonly requesterId: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * SendProposalUseCaseOutput
 * Output contract produced after executing the SendProposalUseCase.
 */
export interface SendProposalUseCaseOutput {
  readonly success: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * SendProposalUseCase
 * Coordinates domain policies, mappers and repositories to fulfil
 * a single, well-defined business capability.
 */
export class SendProposalUseCase {
  public constructor(
    private readonly mapper: ProposalMapper,
    private readonly policy: ProposalPolicy,
  ) {}

  public async execute(input: SendProposalUseCaseInput): Promise<SendProposalUseCaseOutput> {
    if (!input.requesterId) {
      throw new ApplicationValidationException('requesterId is required to execute SendProposalUseCase.');
    }

    this.policy.assertCanExecute(input.requesterId);
    const mapped = this.mapper.toDomain(input.payload);

    return {
      success: true,
      data: this.mapper.toDTO(mapped) as unknown as Readonly<Record<string, unknown>>,
    };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/CreateLeadDTO.ts" -Content @'
/**
 * @file CreateLeadDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of CreateLeadDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * CreateLeadDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface CreateLeadDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  ownerId: string;
  createdAt: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/UpdateLeadDTO.ts" -Content @'
/**
 * @file UpdateLeadDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of UpdateLeadDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * UpdateLeadDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface UpdateLeadDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  ownerId: string;
  createdAt: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/LeadResponseDTO.ts" -Content @'
/**
 * @file LeadResponseDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of LeadResponseDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * LeadResponseDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface LeadResponseDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  ownerId: string;
  createdAt: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/CompanyDTO.ts" -Content @'
/**
 * @file CompanyDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of CompanyDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * CompanyDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface CompanyDTO {
  id: string;
  name: string;
  cnpj: string;
  industry: string;
  createdAt: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/ContactDTO.ts" -Content @'
/**
 * @file ContactDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of ContactDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ContactDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface ContactDTO {
  id: string;
  name: string;
  email: string;
  phone: string;
  companyId: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/OpportunityDTO.ts" -Content @'
/**
 * @file OpportunityDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of OpportunityDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * OpportunityDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface OpportunityDTO {
  id: string;
  title: string;
  amount: number;
  stage: string;
  ownerId: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/TaskDTO.ts" -Content @'
/**
 * @file TaskDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of TaskDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * TaskDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface TaskDTO {
  id: string;
  title: string;
  dueDate: string;
  completed: boolean;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/MeetingDTO.ts" -Content @'
/**
 * @file MeetingDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of MeetingDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * MeetingDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface MeetingDTO {
  id: string;
  title: string;
  scheduledAt: string;
  participants: readonly string[];
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/ProposalDTO.ts" -Content @'
/**
 * @file ProposalDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of ProposalDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ProposalDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface ProposalDTO {
  id: string;
  opportunityId: string;
  amount: number;
  validUntil: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/DealDTO.ts" -Content @'
/**
 * @file DealDTO.ts
 * @module modules/crm/application/dto
 * @description Data transfer object describing the shape of DealDTO.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * DealDTO
 * Plain, serializable data contract exchanged between the
 * application layer and its external consumers.
 */
export interface DealDTO {
  id: string;
  opportunityId: string;
  amount: number;
  closedAt: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/CreateLeadValidator.ts" -Content @'
/**
 * @file CreateLeadValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Lead-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CreateLeadValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class CreateLeadValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/UpdateLeadValidator.ts" -Content @'
/**
 * @file UpdateLeadValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Lead-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * UpdateLeadValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class UpdateLeadValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/CompanyValidator.ts" -Content @'
/**
 * @file CompanyValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Company-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * CompanyValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class CompanyValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/ContactValidator.ts" -Content @'
/**
 * @file ContactValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Contact-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * ContactValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class ContactValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/OpportunityValidator.ts" -Content @'
/**
 * @file OpportunityValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Opportunity-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * OpportunityValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class OpportunityValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/TaskValidator.ts" -Content @'
/**
 * @file TaskValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Task-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * TaskValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class TaskValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/MeetingValidator.ts" -Content @'
/**
 * @file MeetingValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Meeting-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * MeetingValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class MeetingValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/ProposalValidator.ts" -Content @'
/**
 * @file ProposalValidator.ts
 * @module modules/crm/application/validators
 * @description Validator enforcing invariants for Proposal-related input payloads.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IValidator } from '../interfaces/IValidator';
import { ApplicationValidationException } from '../exceptions/ApplicationValidationException';

/**
 * ProposalValidator
 * Validates incoming application-layer payloads before they reach
 * the domain layer, ensuring fail-fast behaviour on invalid input.
 */
export class ProposalValidator implements IValidator<Readonly<Record<string, unknown>>> {
  public validate(input: Readonly<Record<string, unknown>>): void {
    const errors: string[] = [];

    if (input === null || input === undefined) {
      errors.push('Input payload must not be null or undefined.');
    }

    if (typeof input === 'object' && Object.keys(input).length === 0) {
      errors.push('Input payload must not be empty.');
    }

    if (errors.length > 0) {
      throw new ApplicationValidationException(errors.join(' '));
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/LeadMapper.ts" -Content @'
/**
 * @file LeadMapper.ts
 * @module modules/crm/application/mappers
 * @description Mapper responsible for translating Lead domain entities into DTOs and vice versa.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IMapper } from '../interfaces/IMapper';

/**
 * LeadMapper
 * Bidirectional mapper between the Lead domain representation
 * and its application-layer DTO representation.
 */
export class LeadMapper implements IMapper<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> {
  public toDTO(domainEntity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...domainEntity };
  }

  public toDomain(dto: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...dto };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/CompanyMapper.ts" -Content @'
/**
 * @file CompanyMapper.ts
 * @module modules/crm/application/mappers
 * @description Mapper responsible for translating Company domain entities into DTOs and vice versa.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IMapper } from '../interfaces/IMapper';

/**
 * CompanyMapper
 * Bidirectional mapper between the Company domain representation
 * and its application-layer DTO representation.
 */
export class CompanyMapper implements IMapper<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> {
  public toDTO(domainEntity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...domainEntity };
  }

  public toDomain(dto: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...dto };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/ContactMapper.ts" -Content @'
/**
 * @file ContactMapper.ts
 * @module modules/crm/application/mappers
 * @description Mapper responsible for translating Contact domain entities into DTOs and vice versa.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IMapper } from '../interfaces/IMapper';

/**
 * ContactMapper
 * Bidirectional mapper between the Contact domain representation
 * and its application-layer DTO representation.
 */
export class ContactMapper implements IMapper<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> {
  public toDTO(domainEntity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...domainEntity };
  }

  public toDomain(dto: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...dto };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/OpportunityMapper.ts" -Content @'
/**
 * @file OpportunityMapper.ts
 * @module modules/crm/application/mappers
 * @description Mapper responsible for translating Opportunity domain entities into DTOs and vice versa.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IMapper } from '../interfaces/IMapper';

/**
 * OpportunityMapper
 * Bidirectional mapper between the Opportunity domain representation
 * and its application-layer DTO representation.
 */
export class OpportunityMapper implements IMapper<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> {
  public toDTO(domainEntity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...domainEntity };
  }

  public toDomain(dto: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...dto };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/TaskMapper.ts" -Content @'
/**
 * @file TaskMapper.ts
 * @module modules/crm/application/mappers
 * @description Mapper responsible for translating Task domain entities into DTOs and vice versa.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IMapper } from '../interfaces/IMapper';

/**
 * TaskMapper
 * Bidirectional mapper between the Task domain representation
 * and its application-layer DTO representation.
 */
export class TaskMapper implements IMapper<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> {
  public toDTO(domainEntity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...domainEntity };
  }

  public toDomain(dto: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...dto };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/ProposalMapper.ts" -Content @'
/**
 * @file ProposalMapper.ts
 * @module modules/crm/application/mappers
 * @description Mapper responsible for translating Proposal domain entities into DTOs and vice versa.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IMapper } from '../interfaces/IMapper';

/**
 * ProposalMapper
 * Bidirectional mapper between the Proposal domain representation
 * and its application-layer DTO representation.
 */
export class ProposalMapper implements IMapper<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> {
  public toDTO(domainEntity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...domainEntity };
  }

  public toDomain(dto: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...dto };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/DealMapper.ts" -Content @'
/**
 * @file DealMapper.ts
 * @module modules/crm/application/mappers
 * @description Mapper responsible for translating Deal domain entities into DTOs and vice versa.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IMapper } from '../interfaces/IMapper';

/**
 * DealMapper
 * Bidirectional mapper between the Deal domain representation
 * and its application-layer DTO representation.
 */
export class DealMapper implements IMapper<Readonly<Record<string, unknown>>, Readonly<Record<string, unknown>>> {
  public toDTO(domainEntity: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...domainEntity };
  }

  public toDomain(dto: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
    return { ...dto };
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/services/LeadApplicationService.ts" -Content @'
/**
 * @file LeadApplicationService.ts
 * @module modules/crm/application/services
 * @description Application service coordinating Lead use cases, commands and queries.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ILeadApplicationService } from '../interfaces/ILeadApplicationService';
import type { LeadMapper } from '../mappers/LeadMapper';
import type { LeadPolicy } from '../policies/LeadPolicy';

/**
 * LeadApplicationService
 * Central orchestration point for Lead application logic,
 * exposed to CQRS handlers and inbound adapters.
 */
export class LeadApplicationService implements ILeadApplicationService {
  public constructor(
    private readonly mapper: LeadMapper,
    private readonly policy: LeadPolicy,
  ) {}

  public async handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }

  public async handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/services/CompanyApplicationService.ts" -Content @'
/**
 * @file CompanyApplicationService.ts
 * @module modules/crm/application/services
 * @description Application service coordinating Company use cases, commands and queries.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { ICompanyApplicationService } from '../interfaces/ICompanyApplicationService';
import type { CompanyMapper } from '../mappers/CompanyMapper';
import type { CompanyPolicy } from '../policies/CompanyPolicy';

/**
 * CompanyApplicationService
 * Central orchestration point for Company application logic,
 * exposed to CQRS handlers and inbound adapters.
 */
export class CompanyApplicationService implements ICompanyApplicationService {
  public constructor(
    private readonly mapper: CompanyMapper,
    private readonly policy: CompanyPolicy,
  ) {}

  public async handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }

  public async handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/services/ContactApplicationService.ts" -Content @'
/**
 * @file ContactApplicationService.ts
 * @module modules/crm/application/services
 * @description Application service coordinating Contact use cases, commands and queries.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IContactApplicationService } from '../interfaces/IContactApplicationService';
import type { ContactMapper } from '../mappers/ContactMapper';
import type { ContactPolicy } from '../policies/ContactPolicy';

/**
 * ContactApplicationService
 * Central orchestration point for Contact application logic,
 * exposed to CQRS handlers and inbound adapters.
 */
export class ContactApplicationService implements IContactApplicationService {
  public constructor(
    private readonly mapper: ContactMapper,
    private readonly policy: ContactPolicy,
  ) {}

  public async handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }

  public async handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/services/OpportunityApplicationService.ts" -Content @'
/**
 * @file OpportunityApplicationService.ts
 * @module modules/crm/application/services
 * @description Application service coordinating Opportunity use cases, commands and queries.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IOpportunityApplicationService } from '../interfaces/IOpportunityApplicationService';
import type { OpportunityMapper } from '../mappers/OpportunityMapper';
import type { OpportunityPolicy } from '../policies/OpportunityPolicy';

/**
 * OpportunityApplicationService
 * Central orchestration point for Opportunity application logic,
 * exposed to CQRS handlers and inbound adapters.
 */
export class OpportunityApplicationService implements IOpportunityApplicationService {
  public constructor(
    private readonly mapper: OpportunityMapper,
    private readonly policy: OpportunityPolicy,
  ) {}

  public async handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }

  public async handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/services/ProposalApplicationService.ts" -Content @'
/**
 * @file ProposalApplicationService.ts
 * @module modules/crm/application/services
 * @description Application service coordinating Proposal use cases, commands and queries.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IProposalApplicationService } from '../interfaces/IProposalApplicationService';
import type { ProposalMapper } from '../mappers/ProposalMapper';
import type { ProposalPolicy } from '../policies/ProposalPolicy';

/**
 * ProposalApplicationService
 * Central orchestration point for Proposal application logic,
 * exposed to CQRS handlers and inbound adapters.
 */
export class ProposalApplicationService implements IProposalApplicationService {
  public constructor(
    private readonly mapper: ProposalMapper,
    private readonly policy: ProposalPolicy,
  ) {}

  public async handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }

  public async handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>> {
    const domain = this.mapper.toDomain(input);
    return this.mapper.toDTO(domain);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/requests/CreateLeadRequest.ts" -Content @'
/**
 * @file CreateLeadRequest.ts
 * @module modules/crm/application/requests
 * @description Inbound request contract for CreateLeadRequest.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * CreateLeadRequest
 * Inbound request contract validated at the boundary of the
 * application layer before entering the CQRS pipeline.
 */
export interface CreateLeadRequest {
  id?: string;
  payload: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/requests/UpdateLeadRequest.ts" -Content @'
/**
 * @file UpdateLeadRequest.ts
 * @module modules/crm/application/requests
 * @description Inbound request contract for UpdateLeadRequest.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * UpdateLeadRequest
 * Inbound request contract validated at the boundary of the
 * application layer before entering the CQRS pipeline.
 */
export interface UpdateLeadRequest {
  id?: string;
  payload: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/requests/SearchLeadRequest.ts" -Content @'
/**
 * @file SearchLeadRequest.ts
 * @module modules/crm/application/requests
 * @description Inbound request contract for SearchLeadRequest.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * SearchLeadRequest
 * Inbound request contract validated at the boundary of the
 * application layer before entering the CQRS pipeline.
 */
export interface SearchLeadRequest {
  term: string;
  page: number;
  pageSize: number;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/requests/PaginationRequest.ts" -Content @'
/**
 * @file PaginationRequest.ts
 * @module modules/crm/application/requests
 * @description Inbound request contract for PaginationRequest.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * PaginationRequest
 * Inbound request contract validated at the boundary of the
 * application layer before entering the CQRS pipeline.
 */
export interface PaginationRequest {
  page: number;
  pageSize: number;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/LeadResponse.ts" -Content @'
/**
 * @file LeadResponse.ts
 * @module modules/crm/application/responses
 * @description Outbound response contract for LeadResponse.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * LeadResponse
 * Outbound response contract returned to callers of the
 * application layer.
 */
export interface LeadResponse {
  id: string;
  data: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/CompanyResponse.ts" -Content @'
/**
 * @file CompanyResponse.ts
 * @module modules/crm/application/responses
 * @description Outbound response contract for CompanyResponse.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * CompanyResponse
 * Outbound response contract returned to callers of the
 * application layer.
 */
export interface CompanyResponse {
  id: string;
  data: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/ContactResponse.ts" -Content @'
/**
 * @file ContactResponse.ts
 * @module modules/crm/application/responses
 * @description Outbound response contract for ContactResponse.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ContactResponse
 * Outbound response contract returned to callers of the
 * application layer.
 */
export interface ContactResponse {
  id: string;
  data: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/OpportunityResponse.ts" -Content @'
/**
 * @file OpportunityResponse.ts
 * @module modules/crm/application/responses
 * @description Outbound response contract for OpportunityResponse.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * OpportunityResponse
 * Outbound response contract returned to callers of the
 * application layer.
 */
export interface OpportunityResponse {
  id: string;
  data: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/TaskResponse.ts" -Content @'
/**
 * @file TaskResponse.ts
 * @module modules/crm/application/responses
 * @description Outbound response contract for TaskResponse.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * TaskResponse
 * Outbound response contract returned to callers of the
 * application layer.
 */
export interface TaskResponse {
  id: string;
  data: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/ProposalResponse.ts" -Content @'
/**
 * @file ProposalResponse.ts
 * @module modules/crm/application/responses
 * @description Outbound response contract for ProposalResponse.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ProposalResponse
 * Outbound response contract returned to callers of the
 * application layer.
 */
export interface ProposalResponse {
  id: string;
  data: Readonly<Record<string, unknown>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/PaginatedResponse.ts" -Content @'
/**
 * @file PaginatedResponse.ts
 * @module modules/crm/application/responses
 * @description Outbound response contract for PaginatedResponse.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * PaginatedResponse
 * Outbound response contract returned to callers of the
 * application layer.
 */
export interface PaginatedResponse {
  items: readonly Readonly<Record<string, unknown>>[];
  total: number;
  page: number;
  pageSize: number;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/ILeadApplicationService.ts" -Content @'
/**
 * @file ILeadApplicationService.ts
 * @module modules/crm/application/interfaces
 * @description Contract describing the public surface of LeadApplicationService.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ILeadApplicationService
 * Application service contract for Lead, decoupling the
 * CQRS handlers from concrete service implementations.
 */
export interface ILeadApplicationService {
  handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/ICompanyApplicationService.ts" -Content @'
/**
 * @file ICompanyApplicationService.ts
 * @module modules/crm/application/interfaces
 * @description Contract describing the public surface of CompanyApplicationService.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ICompanyApplicationService
 * Application service contract for Company, decoupling the
 * CQRS handlers from concrete service implementations.
 */
export interface ICompanyApplicationService {
  handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/IContactApplicationService.ts" -Content @'
/**
 * @file IContactApplicationService.ts
 * @module modules/crm/application/interfaces
 * @description Contract describing the public surface of ContactApplicationService.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * IContactApplicationService
 * Application service contract for Contact, decoupling the
 * CQRS handlers from concrete service implementations.
 */
export interface IContactApplicationService {
  handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/IOpportunityApplicationService.ts" -Content @'
/**
 * @file IOpportunityApplicationService.ts
 * @module modules/crm/application/interfaces
 * @description Contract describing the public surface of OpportunityApplicationService.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * IOpportunityApplicationService
 * Application service contract for Opportunity, decoupling the
 * CQRS handlers from concrete service implementations.
 */
export interface IOpportunityApplicationService {
  handleCommand(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
  handleQuery(input: Readonly<Record<string, unknown>>): Promise<Readonly<Record<string, unknown>>>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/IMapper.ts" -Content @'
/**
 * @file IMapper.ts
 * @module modules/crm/application/interfaces
 * @description Generic bidirectional mapper contract.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * IMapper
 * Generic contract for bidirectional translation between a domain
 * representation and a DTO representation.
 */
export interface IMapper<TDomain, TDto> {
  toDTO(domainEntity: TDomain): TDto;
  toDomain(dto: TDto): TDomain;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/IValidator.ts" -Content @'
/**
 * @file IValidator.ts
 * @module modules/crm/application/interfaces
 * @description Generic validator contract.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * IValidator
 * Generic contract for validating an application-layer payload,
 * throwing an ApplicationValidationException on failure.
 */
export interface IValidator<T> {
  validate(input: T): void;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/ICommand.ts" -Content @'
/**
 * @file ICommand.ts
 * @module modules/crm/application/interfaces
 * @description Marker contract for CQRS command objects.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ICommand
 * Marker interface identifying a class as a CQRS command.
 */
export interface ICommand {
  readonly commandName: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/IQuery.ts" -Content @'
/**
 * @file IQuery.ts
 * @module modules/crm/application/interfaces
 * @description Marker contract for CQRS query objects.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * IQuery
 * Marker interface identifying a class as a CQRS query.
 */
export interface IQuery {
  readonly queryName: string;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/ICommandHandler.ts" -Content @'
/**
 * @file ICommandHandler.ts
 * @module modules/crm/application/interfaces
 * @description Generic contract for CQRS command handlers.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ICommandHandler
 * Generic contract implemented by every command handler in the
 * application layer.
 */
export interface ICommandHandler<TCommand, TResult> {
  handle(command: TCommand): Promise<TResult>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/IQueryHandler.ts" -Content @'
/**
 * @file IQueryHandler.ts
 * @module modules/crm/application/interfaces
 * @description Generic contract for CQRS query handlers.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * IQueryHandler
 * Generic contract implemented by every query handler in the
 * application layer.
 */
export interface IQueryHandler<TQuery, TResult> {
  handle(query: TQuery): Promise<TResult>;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/IDomainEvent.ts" -Content @'
/**
 * @file IDomainEvent.ts
 * @module modules/crm/application/interfaces
 * @description Generic contract for application-level domain events.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * IDomainEvent
 * Generic contract implemented by every event published from the
 * application layer.
 */
export interface IDomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/policies/LeadPolicy.ts" -Content @'
/**
 * @file LeadPolicy.ts
 * @module modules/crm/application/policies
 * @description Authorization and business-rule policy for Lead.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import { ApplicationAuthorizationException } from '../exceptions/ApplicationAuthorizationException';

/**
 * LeadPolicy
 * Encapsulates authorization and invariant checks that must hold
 * true before a Lead-related use case is executed.
 */
export class LeadPolicy {
  public assertCanExecute(requesterId: string): void {
    if (!requesterId || requesterId.trim().length === 0) {
      throw new ApplicationAuthorizationException('requesterId is required to authorize this operation.');
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/policies/OpportunityPolicy.ts" -Content @'
/**
 * @file OpportunityPolicy.ts
 * @module modules/crm/application/policies
 * @description Authorization and business-rule policy for Opportunity.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import { ApplicationAuthorizationException } from '../exceptions/ApplicationAuthorizationException';

/**
 * OpportunityPolicy
 * Encapsulates authorization and invariant checks that must hold
 * true before a Opportunity-related use case is executed.
 */
export class OpportunityPolicy {
  public assertCanExecute(requesterId: string): void {
    if (!requesterId || requesterId.trim().length === 0) {
      throw new ApplicationAuthorizationException('requesterId is required to authorize this operation.');
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/policies/CRMPolicy.ts" -Content @'
/**
 * @file CRMPolicy.ts
 * @module modules/crm/application/policies
 * @description Authorization and business-rule policy for Generic.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import { ApplicationAuthorizationException } from '../exceptions/ApplicationAuthorizationException';

/**
 * CRMPolicy
 * Encapsulates authorization and invariant checks that must hold
 * true before a Generic-related use case is executed.
 */
export class CRMPolicy {
  public assertCanExecute(requesterId: string): void {
    if (!requesterId || requesterId.trim().length === 0) {
      throw new ApplicationAuthorizationException('requesterId is required to authorize this operation.');
    }
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/events/LeadApplicationEvent.ts" -Content @'
/**
 * @file LeadApplicationEvent.ts
 * @module modules/crm/application/events
 * @description Application-level event emitted after a Lead state transition.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IDomainEvent } from '../interfaces/IDomainEvent';

/**
 * LeadApplicationEvent
 * Application event published after a successful Lead
 * operation, enabling downstream event-driven integrations.
 */
export class LeadApplicationEvent implements IDomainEvent {
  public readonly eventName: string = 'LeadApplicationEvent';
  public readonly occurredAt: Date = new Date();

  public constructor(
    public readonly aggregateId: string,
    public readonly payload: Readonly<Record<string, unknown>>,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/events/OpportunityApplicationEvent.ts" -Content @'
/**
 * @file OpportunityApplicationEvent.ts
 * @module modules/crm/application/events
 * @description Application-level event emitted after a Opportunity state transition.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IDomainEvent } from '../interfaces/IDomainEvent';

/**
 * OpportunityApplicationEvent
 * Application event published after a successful Opportunity
 * operation, enabling downstream event-driven integrations.
 */
export class OpportunityApplicationEvent implements IDomainEvent {
  public readonly eventName: string = 'OpportunityApplicationEvent';
  public readonly occurredAt: Date = new Date();

  public constructor(
    public readonly aggregateId: string,
    public readonly payload: Readonly<Record<string, unknown>>,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/events/TaskApplicationEvent.ts" -Content @'
/**
 * @file TaskApplicationEvent.ts
 * @module modules/crm/application/events
 * @description Application-level event emitted after a Task state transition.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

import type { IDomainEvent } from '../interfaces/IDomainEvent';

/**
 * TaskApplicationEvent
 * Application event published after a successful Task
 * operation, enabling downstream event-driven integrations.
 */
export class TaskApplicationEvent implements IDomainEvent {
  public readonly eventName: string = 'TaskApplicationEvent';
  public readonly occurredAt: Date = new Date();

  public constructor(
    public readonly aggregateId: string,
    public readonly payload: Readonly<Record<string, unknown>>,
  ) {}
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/exceptions/ApplicationValidationException.ts" -Content @'
/**
 * @file ApplicationValidationException.ts
 * @module modules/crm/application/exceptions
 * @description Application-layer exception representing a 400 error scenario.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ApplicationValidationException
 * Application-layer exception used to signal a well-defined
 * failure scenario to the presentation layer.
 */
export class ApplicationValidationException extends Error {
  public readonly statusCode: number = 400;

  public constructor(message: string) {
    super(message);
    this.name = 'ApplicationValidationException';
    Object.setPrototypeOf(this, ApplicationValidationException.prototype);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/exceptions/ApplicationConflictException.ts" -Content @'
/**
 * @file ApplicationConflictException.ts
 * @module modules/crm/application/exceptions
 * @description Application-layer exception representing a 409 error scenario.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ApplicationConflictException
 * Application-layer exception used to signal a well-defined
 * failure scenario to the presentation layer.
 */
export class ApplicationConflictException extends Error {
  public readonly statusCode: number = 409;

  public constructor(message: string) {
    super(message);
    this.name = 'ApplicationConflictException';
    Object.setPrototypeOf(this, ApplicationConflictException.prototype);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/exceptions/ApplicationAuthorizationException.ts" -Content @'
/**
 * @file ApplicationAuthorizationException.ts
 * @module modules/crm/application/exceptions
 * @description Application-layer exception representing a 403 error scenario.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ApplicationAuthorizationException
 * Application-layer exception used to signal a well-defined
 * failure scenario to the presentation layer.
 */
export class ApplicationAuthorizationException extends Error {
  public readonly statusCode: number = 403;

  public constructor(message: string) {
    super(message);
    this.name = 'ApplicationAuthorizationException';
    Object.setPrototypeOf(this, ApplicationAuthorizationException.prototype);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/exceptions/ApplicationNotFoundException.ts" -Content @'
/**
 * @file ApplicationNotFoundException.ts
 * @module modules/crm/application/exceptions
 * @description Application-layer exception representing a 404 error scenario.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

/**
 * ApplicationNotFoundException
 * Application-layer exception used to signal a well-defined
 * failure scenario to the presentation layer.
 */
export class ApplicationNotFoundException extends Error {
  public readonly statusCode: number = 404;

  public constructor(message: string) {
    super(message);
    this.name = 'ApplicationNotFoundException';
    Object.setPrototypeOf(this, ApplicationNotFoundException.prototype);
  }
}
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/commands/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/commands
 * @description Barrel export for the commands folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './AssignLeadCommand';
export * from './CloseDealCommand';
export * from './CompleteTaskCommand';
export * from './CreateCompanyCommand';
export * from './CreateContactCommand';
export * from './CreateLeadCommand';
export * from './CreateMeetingCommand';
export * from './CreateOpportunityCommand';
export * from './CreateTaskCommand';
export * from './DeleteCompanyCommand';
export * from './DeleteContactCommand';
export * from './DeleteLeadCommand';
export * from './DeleteOpportunityCommand';
export * from './MoveLeadPipelineCommand';
export * from './QualifyLeadCommand';
export * from './SendProposalCommand';
export * from './UpdateCompanyCommand';
export * from './UpdateContactCommand';
export * from './UpdateLeadCommand';
export * from './UpdateOpportunityCommand';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/queries/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/queries
 * @description Barrel export for the queries folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './GetActivitiesQuery';
export * from './GetCompanyByIdQuery';
export * from './GetContactByIdQuery';
export * from './GetLeadByIdQuery';
export * from './GetMeetingsQuery';
export * from './GetOpportunityByIdQuery';
export * from './GetPipelineQuery';
export * from './GetTasksQuery';
export * from './SearchCompaniesQuery';
export * from './SearchContactsQuery';
export * from './SearchDealsQuery';
export * from './SearchLeadsQuery';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/handlers/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/handlers
 * @description Barrel export for the handlers folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './AssignLeadCommandHandler';
export * from './CloseDealCommandHandler';
export * from './CompleteTaskCommandHandler';
export * from './CreateCompanyCommandHandler';
export * from './CreateContactCommandHandler';
export * from './CreateLeadCommandHandler';
export * from './CreateMeetingCommandHandler';
export * from './CreateOpportunityCommandHandler';
export * from './CreateTaskCommandHandler';
export * from './DeleteCompanyCommandHandler';
export * from './DeleteContactCommandHandler';
export * from './DeleteLeadCommandHandler';
export * from './DeleteOpportunityCommandHandler';
export * from './GetActivitiesQueryHandler';
export * from './GetCompanyByIdQueryHandler';
export * from './GetContactByIdQueryHandler';
export * from './GetLeadByIdQueryHandler';
export * from './GetMeetingsQueryHandler';
export * from './GetOpportunityByIdQueryHandler';
export * from './GetPipelineQueryHandler';
export * from './GetTasksQueryHandler';
export * from './MoveLeadPipelineCommandHandler';
export * from './QualifyLeadCommandHandler';
export * from './SearchCompaniesQueryHandler';
export * from './SearchContactsQueryHandler';
export * from './SearchDealsQueryHandler';
export * from './SearchLeadsQueryHandler';
export * from './SendProposalCommandHandler';
export * from './UpdateCompanyCommandHandler';
export * from './UpdateContactCommandHandler';
export * from './UpdateLeadCommandHandler';
export * from './UpdateOpportunityCommandHandler';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/use-cases/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/use-cases
 * @description Barrel export for the use-cases folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './AssignLeadUseCase';
export * from './CloseDealUseCase';
export * from './CompleteTaskUseCase';
export * from './CreateCompanyUseCase';
export * from './CreateContactUseCase';
export * from './CreateLeadUseCase';
export * from './CreateOpportunityUseCase';
export * from './DeleteLeadUseCase';
export * from './MoveLeadPipelineUseCase';
export * from './QualifyLeadUseCase';
export * from './ScheduleMeetingUseCase';
export * from './SendProposalUseCase';
export * from './UpdateLeadUseCase';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/dto/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/dto
 * @description Barrel export for the dto folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './CompanyDTO';
export * from './ContactDTO';
export * from './CreateLeadDTO';
export * from './DealDTO';
export * from './LeadResponseDTO';
export * from './MeetingDTO';
export * from './OpportunityDTO';
export * from './ProposalDTO';
export * from './TaskDTO';
export * from './UpdateLeadDTO';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/validators/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/validators
 * @description Barrel export for the validators folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './CompanyValidator';
export * from './ContactValidator';
export * from './CreateLeadValidator';
export * from './MeetingValidator';
export * from './OpportunityValidator';
export * from './ProposalValidator';
export * from './TaskValidator';
export * from './UpdateLeadValidator';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/mappers/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/mappers
 * @description Barrel export for the mappers folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './CompanyMapper';
export * from './ContactMapper';
export * from './DealMapper';
export * from './LeadMapper';
export * from './OpportunityMapper';
export * from './ProposalMapper';
export * from './TaskMapper';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/services/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/services
 * @description Barrel export for the services folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './CompanyApplicationService';
export * from './ContactApplicationService';
export * from './LeadApplicationService';
export * from './OpportunityApplicationService';
export * from './ProposalApplicationService';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/events/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/events
 * @description Barrel export for the events folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './LeadApplicationEvent';
export * from './OpportunityApplicationEvent';
export * from './TaskApplicationEvent';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/policies/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/policies
 * @description Barrel export for the policies folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './CRMPolicy';
export * from './LeadPolicy';
export * from './OpportunityPolicy';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/interfaces/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/interfaces
 * @description Barrel export for the interfaces folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './ICommand';
export * from './ICommandHandler';
export * from './ICompanyApplicationService';
export * from './IContactApplicationService';
export * from './IDomainEvent';
export * from './ILeadApplicationService';
export * from './IMapper';
export * from './IOpportunityApplicationService';
export * from './IQuery';
export * from './IQueryHandler';
export * from './IValidator';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/exceptions/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/exceptions
 * @description Barrel export for the exceptions folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './ApplicationAuthorizationException';
export * from './ApplicationConflictException';
export * from './ApplicationNotFoundException';
export * from './ApplicationValidationException';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/responses/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/responses
 * @description Barrel export for the responses folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './CompanyResponse';
export * from './ContactResponse';
export * from './LeadResponse';
export * from './OpportunityResponse';
export * from './PaginatedResponse';
export * from './ProposalResponse';
export * from './TaskResponse';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/requests/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/requests
 * @description Barrel export for the requests folder.
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './CreateLeadRequest';
export * from './PaginationRequest';
export * from './SearchLeadRequest';
export * from './UpdateLeadRequest';
'@

Write-FileFromContent -RelativePath "src/modules/crm/application/index.ts" -Content @'
/**
 * @file index.ts
 * @module modules/crm/application/application
 * @description Barrel export for the entire CRM Application layer (FASE 10).
 * @layer Application
 * @pattern CQRS
 * @architecture Clean Architecture / DDD / Hexagonal
 * @generated PROSPECTOR-ATLAS FASE 10
 */

export * from './commands';
export * from './queries';
export * from './handlers';
export * from './use-cases';
export * from './dto';
export * from './validators';
export * from './mappers';
export * from './services';
export * from './events';
export * from './policies';
export * from './interfaces';
export * from './exceptions';
export * from './responses';
export * from './requests';
'@


# ============================================================================
# VALIDACAO POS-GERACAO
# ============================================================================

Write-Log -Message "Executando validacao pos-geracao..." -Level "INFO"

if (-not $WhatIf) {
    foreach ($dir in $Phase10Directories) {
        $fullDirPath = Join-Path -Path $TargetRoot -ChildPath $dir
        if (-not (Test-Path -Path $fullDirPath)) {
            $Global:MissingDirectories.Add($dir)
            $Global:ValidationErrors.Add("Diretorio ausente apos geracao: $dir")
            Write-Log -Message "Diretorio ausente apos geracao: $dir" -Level "ERROR"
        }
    }

    $allGeneratedFiles = @()
    $allGeneratedFiles += $Global:FilesCreated
    $allGeneratedFiles += $Global:FilesUpdated

    foreach ($relPath in $allGeneratedFiles) {
        $fullPath = Join-Path -Path $TargetRoot -ChildPath $relPath
        if (Test-Path -Path $fullPath) {
            $fileInfo = Get-Item -Path $fullPath
            if ($fileInfo.Length -eq 0) {
                $Global:EmptyFilesFound.Add($relPath)
                $Global:ValidationErrors.Add("Arquivo vazio detectado: $relPath")
                Write-Log -Message "Arquivo vazio detectado: $relPath" -Level "ERROR"
            }
        } else {
            $Global:ValidationErrors.Add("Arquivo esperado nao encontrado: $relPath")
            Write-Log -Message "Arquivo esperado nao encontrado: $relPath" -Level "ERROR"
        }
    }

    if ($Global:ValidationErrors.Count -eq 0) {
        Write-Log -Message "Validacao pos-geracao concluida sem erros." -Level "SUCCESS"
    } else {
        Write-Log -Message "Validacao pos-geracao encontrou $($Global:ValidationErrors.Count) problema(s)." -Level "ERROR"
    }
} else {
    Write-Log -Message "Validacao pos-geracao ignorada em modo -WhatIf." -Level "SIMULATE"
}

# ============================================================================
# MANIFEST DA FASE
# ============================================================================

$Global:EndTime = Get-Date
$Global:ExecutionTime = ($Global:EndTime - $Global:StartTime).TotalSeconds

if (-not $WhatIf) {
    $manifestObject = [ordered]@{
        phase               = $Global:PhaseNumber
        version             = $Global:PhaseVersion
        generatedAt         = $Global:EndTime.ToString("yyyy-MM-ddTHH:mm:ss")
        executionTime       = "$([math]::Round($Global:ExecutionTime, 3)) s"
        filesCreated        = $Global:FilesCreated
        filesUpdated        = $Global:FilesUpdated
        directoriesCreated  = $Global:DirectoriesCreated
        sha256              = $Global:FileHashes
    }

    $manifestJson = $manifestObject | ConvertTo-Json -Depth 10
    Set-Content -Path $Global:ManifestFile -Value $manifestJson -Encoding UTF8
    Write-Log -Message "Manifest gerado: $($Global:ManifestFile)" -Level "SUCCESS"
} else {
    Write-Log -Message "Manifest nao gerado em modo -WhatIf (simulacao)." -Level "SIMULATE"
}

# ============================================================================
# VALIDACAO TYPESCRIPT / LINT / TESTES (OPCIONAL)
# ============================================================================

$Global:LintResult = [ordered]@{ executed = $false; exitCode = $null; output = ""; durationSeconds = 0 }
$Global:TscResult  = [ordered]@{ executed = $false; exitCode = $null; output = ""; durationSeconds = 0 }
$Global:TestResult = [ordered]@{ executed = $false; exitCode = $null; output = ""; durationSeconds = 0 }

function Invoke-ValidationCommand {
    param(
        [Parameter(Mandatory = $true)][string]$CommandName,
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $result = [ordered]@{ executed = $false; exitCode = $null; output = ""; durationSeconds = 0 }

    $resolvedCommand = Get-Command -Name $Executable -ErrorAction SilentlyContinue
    if (-not $resolvedCommand) {
        Write-Log -Message "Comando '$Executable' nao encontrado. Pulando $CommandName." -Level "WARN"
        return $result
    }

    Write-Log -Message "Executando $CommandName..." -Level "INFO"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        $output = & $Executable $Arguments 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
    } catch {
        $output = $_.Exception.Message
        $exitCode = -1
    }

    $sw.Stop()

    $result.executed = $true
    $result.exitCode = $exitCode
    $result.output = $output
    $result.durationSeconds = [math]::Round($sw.Elapsed.TotalSeconds, 3)

    if ($exitCode -eq 0) {
        Write-Log -Message "$CommandName concluido com sucesso (exit code 0)." -Level "SUCCESS"
    } else {
        Write-Log -Message "$CommandName finalizado com exit code $exitCode." -Level "WARN"
    }

    return $result
}

if ($RunValidations -and -not $WhatIf) {
    Push-Location -Path $TargetRoot
    try {
        $Global:LintResult = Invoke-ValidationCommand -CommandName "npm run lint" -Executable "npm" -Arguments @("run", "lint")
        $Global:TscResult  = Invoke-ValidationCommand -CommandName "npx tsc --noEmit" -Executable "npx" -Arguments @("tsc", "--noEmit")
        $Global:TestResult = Invoke-ValidationCommand -CommandName "npm test" -Executable "npm" -Arguments @("test")
    } finally {
        Pop-Location
    }
} else {
    Write-Log -Message "Validacoes de lint/tsc/test nao executadas (use -RunValidations para habilitar)." -Level "INFO"
}

# ============================================================================
# STATUS GERAL
# ============================================================================

$Global:OverallStatus = "SUCCESS"
if ($Global:ValidationErrors.Count -gt 0) {
    $Global:OverallStatus = "FAILED"
} elseif (($Global:LintResult.executed -and $Global:LintResult.exitCode -ne 0) -or
          ($Global:TscResult.executed -and $Global:TscResult.exitCode -ne 0) -or
          ($Global:TestResult.executed -and $Global:TestResult.exitCode -ne 0)) {
    $Global:OverallStatus = "WARNING"
}
if ($WhatIf) {
    $Global:OverallStatus = "SIMULATED"
}

# ============================================================================
# RELATORIO HTML
# ============================================================================

function New-HtmlReport {

    $statusColor = switch ($Global:OverallStatus) {
        "SUCCESS"   { "#22c55e" }
        "WARNING"   { "#f59e0b" }
        "FAILED"    { "#ef4444" }
        "SIMULATED" { "#3b82f6" }
        default     { "#6b7280" }
    }

    $filesCreatedRows = ($Global:FilesCreated | ForEach-Object { "<li>$_</li>" }) -join "`n"
    $filesUpdatedRows = ($Global:FilesUpdated | ForEach-Object { "<li>$_</li>" }) -join "`n"
    $dirsCreatedRows  = ($Global:DirectoriesCreated | ForEach-Object { "<li>$_</li>" }) -join "`n"
    $emptyFilesRows   = ($Global:EmptyFilesFound | ForEach-Object { "<li>$_</li>" }) -join "`n"
    $treeRows         = ($Phase10Directories | Sort-Object | ForEach-Object { "<li>$_</li>" }) -join "`n"

    $hashRows = ($Global:FileHashes.Keys | Sort-Object | ForEach-Object {
        "<tr><td>$_</td><td class='hash'>$($Global:FileHashes[$_])</td></tr>"
    }) -join "`n"

    $lintOutputEscaped = [System.Web.HttpUtility]::HtmlEncode($Global:LintResult.output)
    $tscOutputEscaped  = [System.Web.HttpUtility]::HtmlEncode($Global:TscResult.output)
    $testOutputEscaped = [System.Web.HttpUtility]::HtmlEncode($Global:TestResult.output)

    $html = @"
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<title>FASE 10 - Application Layer Report - PROSPECTOR-ATLAS</title>
<style>
  :root {
    --bg: #0f172a;
    --card: #1e293b;
    --border: #334155;
    --text: #e2e8f0;
    --muted: #94a3b8;
    --accent: #38bdf8;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
  }
  header {
    background: linear-gradient(135deg, #0ea5e9, #6366f1);
    padding: 2.5rem 2rem;
    text-align: center;
  }
  header h1 { margin: 0; font-size: 1.8rem; }
  header p { margin: 0.4rem 0 0; opacity: 0.9; }
  .container {
    max-width: 1100px;
    margin: -1.5rem auto 3rem;
    padding: 0 1.5rem;
  }
  .status-badge {
    display: inline-block;
    padding: 0.4rem 1.2rem;
    border-radius: 999px;
    font-weight: 600;
    background: $statusColor;
    color: #0f172a;
    margin-top: 0.8rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
    margin: 2rem 0;
  }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.2rem 1.4rem;
    box-shadow: 0 4px 14px rgba(0,0,0,0.35);
  }
  .card h3 { margin: 0 0 0.4rem; font-size: 0.85rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
  .card .value { font-size: 1.8rem; font-weight: 700; color: var(--accent); }
  section { margin: 2.4rem 0; }
  section h2 {
    border-left: 4px solid var(--accent);
    padding-left: 0.7rem;
    font-size: 1.15rem;
  }
  ul { columns: 2; column-gap: 2rem; padding-left: 1.2rem; }
  li { margin-bottom: 0.3rem; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.8rem; }
  th, td { border: 1px solid var(--border); padding: 0.5rem 0.7rem; text-align: left; font-size: 0.85rem; }
  th { background: #0b1220; color: var(--accent); }
  td.hash { font-family: 'Consolas', monospace; font-size: 0.75rem; color: var(--muted); word-break: break-all; }
  pre {
    background: #0b1220;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 1rem;
    overflow-x: auto;
    font-size: 0.8rem;
    max-height: 300px;
  }
  footer { text-align: center; color: var(--muted); padding: 2rem 0; font-size: 0.85rem; }
</style>
</head>
<body>
<header>
  <h1>PROSPECTOR-ATLAS &mdash; FASE 10 &mdash; APPLICATION LAYER (CQRS)</h1>
  <p>Relatorio de execucao gerado em $($Global:EndTime.ToString('yyyy-MM-dd HH:mm:ss'))</p>
  <div class="status-badge">STATUS: $($Global:OverallStatus)</div>
</header>
<div class="container">

  <div class="grid">
    <div class="card"><h3>Tempo Total</h3><div class="value">$([math]::Round($Global:ExecutionTime,2)) s</div></div>
    <div class="card"><h3>Arquivos Criados</h3><div class="value">$($Global:FilesCreated.Count)</div></div>
    <div class="card"><h3>Arquivos Atualizados</h3><div class="value">$($Global:FilesUpdated.Count)</div></div>
    <div class="card"><h3>Diretorios Criados</h3><div class="value">$($Global:DirectoriesCreated.Count)</div></div>
    <div class="card"><h3>Arquivos Vazios</h3><div class="value">$($Global:EmptyFilesFound.Count)</div></div>
    <div class="card"><h3>Erros de Validacao</h3><div class="value">$($Global:ValidationErrors.Count)</div></div>
  </div>

  <section>
    <h2>Resultado das Validacoes</h2>
    <table>
      <tr><th>Validacao</th><th>Executado</th><th>Exit Code</th><th>Duracao</th></tr>
      <tr><td>npm run lint</td><td>$($Global:LintResult.executed)</td><td>$($Global:LintResult.exitCode)</td><td>$($Global:LintResult.durationSeconds) s</td></tr>
      <tr><td>npx tsc --noEmit</td><td>$($Global:TscResult.executed)</td><td>$($Global:TscResult.exitCode)</td><td>$($Global:TscResult.durationSeconds) s</td></tr>
      <tr><td>npm test</td><td>$($Global:TestResult.executed)</td><td>$($Global:TestResult.exitCode)</td><td>$($Global:TestResult.durationSeconds) s</td></tr>
    </table>
  </section>

  <section>
    <h2>Saida do Lint</h2>
    <pre>$lintOutputEscaped</pre>
  </section>

  <section>
    <h2>Saida do TypeScript (tsc --noEmit)</h2>
    <pre>$tscOutputEscaped</pre>
  </section>

  <section>
    <h2>Saida dos Testes</h2>
    <pre>$testOutputEscaped</pre>
  </section>

  <section>
    <h2>Arquivos Criados ($($Global:FilesCreated.Count))</h2>
    <ul>$filesCreatedRows</ul>
  </section>

  <section>
    <h2>Arquivos Atualizados ($($Global:FilesUpdated.Count))</h2>
    <ul>$filesUpdatedRows</ul>
  </section>

  <section>
    <h2>Diretorios Criados ($($Global:DirectoriesCreated.Count))</h2>
    <ul>$dirsCreatedRows</ul>
  </section>

  <section>
    <h2>Arquivos Vazios Encontrados ($($Global:EmptyFilesFound.Count))</h2>
    <ul>$emptyFilesRows</ul>
  </section>

  <section>
    <h2>Arvore Completa de Diretorios Gerados</h2>
    <ul>$treeRows</ul>
  </section>

  <section>
    <h2>Hashes SHA-256</h2>
    <table>
      <tr><th>Arquivo</th><th>SHA-256</th></tr>
      $hashRows
    </table>
  </section>

</div>
<footer>
  PROSPECTOR-ATLAS &copy; $($Global:EndTime.Year) &mdash; Gerado automaticamente pelo FASE-10-APPLICATION.ps1
</footer>
</body>
</html>
"@

    Set-Content -Path $Global:HtmlReportFile -Value $html -Encoding UTF8
    Write-Log -Message "Relatorio HTML gerado: $($Global:HtmlReportFile)" -Level "SUCCESS"
}

Add-Type -AssemblyName System.Web -ErrorAction SilentlyContinue

if (-not $WhatIf) {
    New-HtmlReport
} else {
    Write-Log -Message "Relatorio HTML nao gerado em modo -WhatIf (simulacao)." -Level "SIMULATE"
}

# ============================================================================
# RESUMO FINAL NO CONSOLE
# ============================================================================

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "FASE $($Global:PhaseNumber) FINALIZADA" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Arquivos criados:      $($Global:FilesCreated.Count)"
Write-Host "Arquivos atualizados:  $($Global:FilesUpdated.Count)"
Write-Host "Pastas criadas:        $($Global:DirectoriesCreated.Count)"
Write-Host "Tempo:                 $([math]::Round($Global:ExecutionTime,2)) s"
Write-Host "Validacao:             $(if ($Global:ValidationErrors.Count -eq 0) { 'OK' } else { "$($Global:ValidationErrors.Count) erro(s)" })"
Write-Host "Manifest:              $(if ($WhatIf) { 'N/A (dry run)' } else { $Global:ManifestFile })"
Write-Host "HTML Report:           $(if ($WhatIf) { 'N/A (dry run)' } else { $Global:HtmlReportFile })"
Write-Host "Status:                $($Global:OverallStatus)"
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

if ($Global:OverallStatus -eq "FAILED") {
    exit 1
} else {
    exit 0
}
