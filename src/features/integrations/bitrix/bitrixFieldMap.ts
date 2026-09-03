/**
 * Mapeamento central de campos entre a plataforma e o Bitrix24 — ponte entre os ~35 campos
 * comerciais que já existem (checklist de qualificação do SDR) ou foram adicionados agora
 * (etapa da cadência, motivo de perda, pacote, status do negócio, etc.) e os campos custom
 * (`UF_CRM_*`) reais do portal `atlasgr.bitrix24.com.br`.
 *
 * Por que um código por entidade (Lead x Deal): o Bitrix trata Lead e Negócio (Deal) como objetos
 * inteiramente separados — o mesmo campo de negócio ("Segmento da Operação", por exemplo) tem um
 * `UF_CRM_*` DIFERENTE em cada um. Levantado direto do portal via `crm.lead.fields`/
 * `crm.deal.fields` em 2026-08-05 — se o cliente reconfigurar campos custom no admin do Bitrix,
 * este mapa precisa ser atualizado à mão (não há como descobrir isso automaticamente por nome,
 * já que o "title" de um campo custom no Bitrix é o próprio código, não um rótulo).
 *
 * `enumeration`: Bitrix guarda o VALOR como um ID numérico opaco (ex: "18650"), não o texto. A
 * tradução ID↔texto usa a lista `items` de cada campo, resolvida em tempo real via
 * `crm.lead.fields`/`crm.deal.fields` (ver `resolveEnumMaps` em `service/customFields.ts`) — nunca
 * hardcoded aqui, porque os IDs são específicos deste portal e mudam se o campo for reconfigurado.
 *
 * Este mapa é consumido nas duas direções por `service/customFields.ts`
 * (`buildOutboundCustomFields`/`applyInboundCustomFields`), chamado por `service/outboundSync.ts`
 * (export) e `service/leads.ts`/`service/deals.ts` (import) — achado P0-1 da antiga auditoria
 * BITRIX24-LEAD-FLOW-AUDIT.md (removida do controle de versão em 22/08/2026, ver
 * docs/REMOVED-DOCS.md), que documentava por que ele passou um tempo definido mas desconectado do
 * fluxo real.
 */

/**
 * Onda 40 (auditoria CPI — "Extrações Bitrix sem schema versionado"): versão deste mapeamento
 * UF_CRM_*, carimbada em cada `BitrixExtractionRun.schemaVersion` no momento da extração (ver
 * `service/extraction.ts`). Se o portal Bitrix for reconfigurado (campo custom removido/renomeado)
 * e este mapa for atualizado, incrementar aqui — permite, ao investigar uma extração antiga,
 * confirmar contra qual versão do mapeamento os dados exportados foram interpretados, sem
 * depender de adivinhar pela data. Formato livre (não semver) — só precisa ser comparável/legível.
 */
export const BITRIX_FIELD_MAP_VERSION = '2026-08-05';

export type BitrixFieldValueType =
  | 'string'
  | 'enumeration'
  | 'double'
  | 'date'
  | 'boolean_sim_nao'
  | 'url';

/** Onde este campo mora na Lead da plataforma. */
export type BitrixFieldTarget =
  | { kind: 'lead'; field: string } // coluna top-level de Lead (ex: cadenceStage)
  | { kind: 'qualification'; field: string } // chave dentro do JSON Lead.qualification
  | { kind: 'contact'; field: string }; // campo do Contact vinculado (ex: role/cargo)

export interface BitrixFieldMapping {
  /** Rótulo humano — o mesmo nos dois objetos no Bitrix, usado só para depuração/logs. */
  label: string;
  type: BitrixFieldValueType;
  target: BitrixFieldTarget;
  /** Código UF_CRM_* no objeto Lead do Bitrix, ou null se este campo só existe no Negócio. */
  leadCode: string | null;
  /** Código UF_CRM_* no objeto Deal (Negócio) do Bitrix, ou null se só existe no Lead. */
  dealCode: string | null;
}

export const BITRIX_FIELD_MAP: BitrixFieldMapping[] = [
  // ── 4.2.1 Contexto Operacional (já existentes em LeadQualification) ────────────────────────
  {
    label: 'Segmento da Operação',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'segmentoOperacao' },
    leadCode: 'UF_CRM_1770145921858',
    dealCode: 'UF_CRM_698344FA440C5',
  },
  {
    label: 'Tipo de Carga',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'tipoCarga' },
    leadCode: 'UF_CRM_1770146353739',
    dealCode: 'UF_CRM_698344FA6D7AF',
  },
  {
    label: 'Principais Rotas',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'principaisRotas' },
    leadCode: 'UF_CRM_1770148446038',
    dealCode: 'UF_CRM_698344FB2C1E5',
  },
  {
    label: 'Usa Motoristas Terceiros?',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'usaTerceiros' },
    leadCode: 'UF_CRM_1770149677223',
    dealCode: 'UF_CRM_698344FC48A7B',
  },
  {
    label: 'Média mensal de contratação de terceiros',
    type: 'double',
    target: { kind: 'qualification', field: 'mediaContratacaoTerceiros' },
    leadCode: 'UF_CRM_1770147938904',
    dealCode: 'UF_CRM_698344FA965F3',
  },
  {
    label: 'Média de viagem / mês',
    type: 'double',
    target: { kind: 'qualification', field: 'viagensPorMes' },
    leadCode: 'UF_CRM_1770729673990',
    dealCode: 'UF_CRM_698B42C3ACA99',
  },
  {
    label: 'Frota Própria (Quantidade)',
    type: 'double',
    target: { kind: 'qualification', field: 'frotaPropria' },
    leadCode: 'UF_CRM_1770148071015',
    dealCode: 'UF_CRM_698344FABD243',
  },
  {
    label: 'Agregados (Quantidade)',
    type: 'double',
    target: { kind: 'qualification', field: 'frotaAgregados' },
    leadCode: 'UF_CRM_1770148150760',
    dealCode: 'UF_CRM_698344FADD6F6',
  },
  {
    label: 'Frota de Terceiros (Quantidade)',
    type: 'double',
    target: { kind: 'qualification', field: 'frotaTerceiros' },
    leadCode: null,
    dealCode: 'UF_CRM_698344FB09F56',
  },

  // ── 4.2.2 Estrutura Atual (já existentes em LeadQualification, + 3 novos "atual") ───────────
  {
    label: 'ERP/TMS Utilizado',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'ermTms' },
    leadCode: 'UF_CRM_1770148888607',
    dealCode: 'UF_CRM_698344FB4F78D',
  },
  {
    label: 'Rastreador Utilizado',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'rastreador' },
    leadCode: 'UF_CRM_1770149168635',
    dealCode: 'UF_CRM_698344FB71361',
  },
  {
    label: 'Seguradora',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'seguradora' },
    leadCode: 'UF_CRM_1770149252221',
    dealCode: 'UF_CRM_698344FB97C78',
  },
  {
    label: 'Corretora',
    type: 'string',
    target: { kind: 'qualification', field: 'corretora' },
    leadCode: 'UF_CRM_1770149275773',
    dealCode: 'UF_CRM_698344FBBC1C9',
  },
  {
    label: 'Possui Gestão de Risco?',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'possuiGR' },
    leadCode: 'UF_CRM_1770149638958',
    dealCode: 'UF_CRM_698344FC0D4CB',
  },
  {
    label: 'Fornecedor de GR Atual',
    type: 'string',
    target: { kind: 'qualification', field: 'fornecedorGRAtual' },
    leadCode: 'UF_CRM_1770149521989',
    dealCode: 'UF_CRM_698344FBE30C0',
  },
  {
    label: 'Possui Consulta e Cadastro de Motorista?',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'possuiCadastroMotorista' },
    leadCode: 'UF_CRM_1770150023444',
    dealCode: 'UF_CRM_698344FCDB17C',
  },
  {
    label: 'Consulta e Cadastro Atual',
    type: 'string',
    target: { kind: 'qualification', field: 'consultaCadastroAtual' },
    leadCode: 'UF_CRM_1770150125622',
    dealCode: 'UF_CRM_698344FD0C59C',
  },
  {
    label: 'Possui Software Logístico?',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'possuiSoftwareLogistico' },
    leadCode: 'UF_CRM_1770149731149',
    dealCode: 'UF_CRM_698344FC6D3F3',
  },
  {
    label: 'Software Logístico Atual',
    type: 'string',
    target: { kind: 'qualification', field: 'softwareLogisticoAtual' },
    leadCode: 'UF_CRM_1770149877991',
    dealCode: 'UF_CRM_698344FC93124',
  },

  // ── 4.2.3 Dor Mapeada (já existentes em LeadQualification) ──────────────────────────────────
  {
    label: 'Dor Principal Mapeada',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'dorPrincipal' },
    leadCode: 'UF_CRM_1770151930149',
    dealCode: 'UF_CRM_698344FD5B3B3',
  },
  {
    label: 'Detalhamento da dor',
    type: 'string',
    target: { kind: 'qualification', field: 'detalhamentoDor' },
    leadCode: 'UF_CRM_1770152008547',
    dealCode: 'UF_CRM_698344FD847AA',
  },
  {
    label: 'Dor se conecta a qual solução Atlas?',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'solucaoAtlas' },
    leadCode: 'UF_CRM_1770152253210',
    dealCode: 'UF_CRM_698344FDA84D8',
  },

  // ── 4.2.4 Interesse e Autoridade (já existentes em LeadQualification) ───────────────────────
  {
    label: 'Nível de autoridade',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'nivelAutoridade' },
    leadCode: 'UF_CRM_1770152630292',
    dealCode: 'UF_CRM_698344FE1EFBF',
  },
  {
    label: 'Interesse percebido',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'interessePercebido' },
    leadCode: 'UF_CRM_1770152737250',
    dealCode: 'UF_CRM_698344FE41AA5',
  },
  {
    label: 'Horizonte de Decisão',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'horizonteDecisao' },
    leadCode: 'UF_CRM_1770152849132',
    dealCode: 'UF_CRM_698344FE65928',
  },
  {
    label: 'Cargo',
    type: 'string',
    target: { kind: 'contact', field: 'role' },
    leadCode: 'UF_CRM_1770152565002',
    dealCode: 'UF_CRM_698344FDF3C1D',
  },

  // ── Campos comerciais novos (fora do checklist de qualificação — colunas top-level do Lead) ─
  {
    label: 'Etapa da Cadência',
    type: 'enumeration',
    target: { kind: 'lead', field: 'cadenceStage' },
    leadCode: 'UF_CRM_1770055709670',
    dealCode: 'UF_CRM_698344F958C10',
  },
  {
    label: 'Motivo de Perda/Desqualificação',
    type: 'enumeration',
    target: { kind: 'lead', field: 'lossReason' },
    leadCode: 'UF_CRM_1770065854148',
    dealCode: 'UF_CRM_6908AECC40696',
  },
  {
    label: 'Data de Retomada',
    type: 'date',
    target: { kind: 'lead', field: 'resumeDate' },
    leadCode: 'UF_CRM_1770125490990',
    dealCode: 'UF_CRM_698344FA1F824',
  },
  {
    label: 'Pacote',
    type: 'enumeration',
    target: { kind: 'lead', field: 'dealPackage' },
    leadCode: null,
    dealCode: 'UF_CRM_1701982911626',
  },
  {
    label: 'Status do Negócio',
    type: 'enumeration',
    target: { kind: 'lead', field: 'dealStatus' },
    leadCode: null,
    dealCode: 'UF_CRM_1770228641807',
  },
  {
    label: 'Nível de Relacionamento',
    type: 'enumeration',
    target: { kind: 'lead', field: 'relationshipLevel' },
    leadCode: null,
    dealCode: 'UF_CRM_1728912680',
  },
  {
    label: '% Comissão',
    type: 'enumeration',
    target: { kind: 'lead', field: 'commissionPercent' },
    leadCode: null,
    dealCode: 'UF_CRM_1775666671895',
  },
  {
    label: 'Parceiro / Corretor',
    type: 'string',
    target: { kind: 'lead', field: 'partnerBroker' },
    leadCode: null,
    dealCode: 'UF_CRM_1775666389456',
  },
  {
    label: 'Qualificação validada pelo AM?',
    type: 'boolean_sim_nao',
    target: { kind: 'lead', field: 'qualificationValidatedByAM' },
    leadCode: null,
    dealCode: 'UF_CRM_1770225838272',
  },

  // ── Campos que já existem como coluna nativa do Lead (Origem/Temperatura) ───────────────────
  {
    label: 'Origem',
    type: 'enumeration',
    target: { kind: 'lead', field: 'source' },
    leadCode: 'UF_CRM_1750448346',
    dealCode: 'UF_CRM_6855C08ACB72B',
  },
  {
    label: 'Temperatura',
    type: 'enumeration',
    target: { kind: 'lead', field: 'temperature' },
    leadCode: 'UF_CRM_1785162221346',
    dealCode: 'UF_CRM_1784922718473',
  },

  // `Lead.score` (Fit Score) NÃO tem entrada aqui de propósito — achado P3 da auditoria (ver PR
  // #328): hoje ele só viaja para o Bitrix como texto dentro de COMMENTS/timeline
  // (`service/outboundSync.ts`), não como campo filtrável/relatável. Diferente dos outros campos
  // deste mapa, não dá para simplesmente adicionar uma entrada `{ target: { kind: 'lead', field:
  // 'score' }, type: 'double', ... }` — não existe hoje nenhum `UF_CRM_*` reservado para isso no
  // portal `atlasgr.bitrix24.com.br` (confirmado varrendo este arquivo: nenhuma ocorrência de
  // "score"). Pré-requisito real, fora do alcance de uma mudança de código: um admin do Bitrix
  // precisa criar um campo customizado numérico em Lead e em Deal primeiro (mesmo padrão dual
  // leadCode/dealCode do resto do mapa) — só depois disso vale adicionar a entrada aqui e
  // incrementar BITRIX_FIELD_MAP_VERSION.

  // Achado em public/tools/portal-comercial (ferramenta de referência standalone, ex-extrator-bitrix.html) — não
  // fazia parte do levantamento original de 2026-08-05 que gerou o resto deste mapa. Só código
  // Lead conhecido; nenhum equivalente Deal foi identificado até agora.
  {
    label: 'Data do contrato assinado',
    type: 'date',
    target: { kind: 'lead', field: 'contractSignedDate' },
    leadCode: 'UF_CRM_1770928318695',
    dealCode: null,
  },

  // ── Novos Campos Adicionados a Pedido do Usuário ─────────────────────────────────────────────
  {
    label: 'Fluxo do Lead',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'fluxoLead' },
    leadCode: 'UF_CRM_1770064518213',
    dealCode: null,
  },
  {
    label: 'Linkedin',
    type: 'url',
    target: { kind: 'contact', field: 'linkedin' },
    leadCode: 'UF_CRM_1770152500250',
    dealCode: null,
  },
  {
    label: 'Perfil da Operação?',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'perfilOperacao' },
    leadCode: 'UF_CRM_LEAD_1779122574144',
    dealCode: null,
  },
  {
    label: 'O que você busca?',
    type: 'string',
    target: { kind: 'qualification', field: 'oqueBusca' },
    leadCode: 'UF_CRM_LEAD_1779122708096',
    dealCode: null,
  },
  {
    label: 'Finalidade Principal',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'finalidadePrincipal' },
    leadCode: 'UF_CRM_LEAD_1779123387103',
    dealCode: null,
  },
  {
    label: 'Média de Contratações Mês',
    type: 'double',
    target: { kind: 'qualification', field: 'mediaContratacoesMes' },
    leadCode: 'UF_CRM_LEAD_1779123481887',
    dealCode: null,
  },
  {
    label: 'Segmento',
    type: 'enumeration',
    target: { kind: 'qualification', field: 'segmento' },
    leadCode: 'UF_CRM_1785868909310',
    dealCode: null,
  },
  {
    label: 'Telefone (Custom)',
    type: 'string',
    target: { kind: 'qualification', field: 'telefoneCustom' },
    leadCode: 'UF_CRM_1772808964686',
    dealCode: null,
  },
  {
    label: 'Observações (Custom)',
    type: 'string',
    target: { kind: 'qualification', field: 'observacoesCustom' },
    leadCode: 'UF_CRM_1772808989707',
    dealCode: null,
  },
];
