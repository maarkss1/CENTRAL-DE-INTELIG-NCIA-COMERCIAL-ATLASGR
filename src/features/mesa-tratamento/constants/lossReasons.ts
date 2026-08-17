/**
 * Opções reais do campo "Motivo de desqualificação" (UF_CRM_1770065854148) do Bitrix24 da AtlasGR
 * — extraídas de bitrix_fields.json (raiz do repo), não inventadas. Mesmo padrão de
 * LeadDetailDrawer.tsx (enums hardcoded no frontend em vez de buscados ao vivo a cada abertura).
 * Se o Bitrix mudar essas opções, atualizar aqui.
 */
export interface LossReasonOption {
    id: string;
    label: string;
}

export const LOSS_REASONS: LossReasonOption[] = [
    { id: '21638', label: 'Não é ICP' },
    { id: '21640', label: 'Busca por transportadora' },
    { id: '21642', label: 'Busca por vaga de emprego' },
    { id: '21644', label: 'Suporte/Informação' },
    { id: '21646', label: 'Acesso por engano' },
    { id: '21648', label: 'Não conseguimos contato' },
    { id: '21650', label: 'Sem Interesse no momento (Sem Timing definido)' },
    { id: '21652', label: 'Sem interesse no momento (Timing definido para reavaliar)' },
    { id: '21654', label: 'Perdeu o embarcador / Operação reduzida' },
    { id: '21656', label: 'Contrato Vigente' },
    { id: '21658', label: 'Tecnologia Sem Integração com a Atlas' },
    { id: '21660', label: 'Avaliação após renovação de apólice' },
    { id: '22084', label: 'Consulta Avulsa - Profile' },
    { id: '22118', label: 'Limitação Técnica' },
    { id: '22142', label: 'CNPJ Baixado' },
    { id: '22154', label: 'Oportunidade Total Trac' },
    { id: '22236', label: 'Oferta de serviços' },
    { id: '22240', label: 'Não responde mais' },
    { id: '22280', label: 'Blacklist' },
    { id: '22328', label: 'Dependência da Matriz' },
    { id: '22340', label: 'Fechou com outra GR' },
    { id: '22386', label: 'Era influenciador. Passou contato do decisor' },
];
