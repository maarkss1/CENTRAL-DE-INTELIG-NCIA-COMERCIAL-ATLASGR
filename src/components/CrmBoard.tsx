import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, WifiOff } from 'lucide-react';
import { Lead, LeadStatus } from '../types';
import { KanbanColumn } from '../features/crm/components/KanbanColumn';
import { KanbanCard } from '../features/crm/components/KanbanCard';
import { LeadDetailDrawer } from '../features/crm/components/LeadDetailDrawer';
import { api } from '../lib/api';
import { leadsDB } from '../lib/db';
import { ContextualTip } from './ui/ContextualTip';
import { EmptyState } from './ui/EmptyState';
import { Button } from './ui/Button';
import { useBrand } from '../contexts/BrandContext';
import { toast } from '../lib/toast';
import { clientLogger } from '../lib/clientLogger';
import { useCrmBoardController } from '../hooks/useCrmBoardController';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragOverlay,
    DragStartEvent,
    DragEndEvent,
    Announcements
} from '@dnd-kit/core';

const LEAD_COLUMNS: LeadStatus[] = [
    'Lead Recebido',
    'Cadência Iniciada',
    'Qualificação (SDR)',
    'Reunião Agendada',
    'Lead Desqualificado',
    'Convertido em Oportunidade',
];

const DEAL_COLUMNS: LeadStatus[] = [
    'Nova Oportunidade',
    'Proposta Enviada',
    'Call/Visita Agendada',
    'Piloto VTECH',
    'Piloto Atlas Profile',
    'Piloto Atlas Profile - Concluído',
    'Piloto Atlas Profile - Cancelado',
    'Piloto Logística',
    'Piloto Logístico - Concluído',
    'Piloto Logístico - Cancelado',
    'Negócios Perdidos',
    'Negócios Ganhos'
];

interface CrmBoardProps {
    funnel?: 'Lead' | 'Negocio';
    embedded?: boolean;
}

export function CrmBoard({ funnel: funnelProp, embedded = false }: CrmBoardProps) {
    const { brandInfo } = useBrand();
    // Funil vem da prop quando informada explicitamente (uso embutido/composição futura) ou da
    // URL (?funnel=Negocio) na rota /app/crm — sem prop e sem query param, cai no padrão 'Lead'.
    // Antes desta correção não existia nenhum jeito de o usuário alcançar o funil "Negocio" (com
    // os 12 estágios de negócio, incluindo os 7 estágios "Piloto"): a prop nunca era passada pela
    // única rota que monta este componente (src/App.tsx: <Route path="crm" element={<CrmBoard />} />).
    const [searchParams, setSearchParams] = useSearchParams();
    const funnel: 'Lead' | 'Negocio' = funnelProp ?? (searchParams.get('funnel') === 'Negocio' ? 'Negocio' : 'Lead');
    const columns = funnel === 'Lead' ? LEAD_COLUMNS : DEAL_COLUMNS;
    const { leads, setLeads, loading, error, fetchLeads, handleConvert, handleImportBitrix, handleCardEnrich } = useCrmBoardController(funnel);
    const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
    const [activeLead, setActiveLead] = useState<Lead | null>(null);
    /** "Cursor" virtual do drag por teclado — avança/recua com ArrowRight/ArrowLeft, independente
        de `leads`. Ver comentário do coordinateGetter abaixo pra explicação completa. */
    const keyboardDragStatusRef = useRef<LeadStatus | null>(null);

    // `sortableKeyboardCoordinates` (@dnd-kit/sortable) foi testado primeiro, por ser a opção
    // nativa do dnd-kit — mas falhou em execução real neste board multi-coluna: sua busca por
    // distância de canto (closestCorners) compara o card contra TODOS os droppables registrados
    // (cada card individual E o droppable de cada coluna inteira via useDroppable em
    // KanbanColumn), e o droppable da coluna, bem mais alto, tende a "ganhar" essa comparação
    // antes de a seta conseguir avançar — ArrowRight repetido nunca saía da coluna vizinha mais
    // próxima da origem.
    //
    // A primeira correção tentada usava um coordinateGetter próprio lendo `leads` (state) +
    // um handleDragOver que reparentava o card otimisticamente no array `leads` a cada mudança de
    // `over`, pra dar ao getter algo atualizado pra ler. Também falhou, por dois motivos
    // confirmados em execução real: (1) o KeyboardSensor do dnd-kit congela a função
    // coordinateGetter no momento em que o drag é ativado (Space) e reusa essa MESMA closure pro
    // resto do gesto — fechar sobre `leads` direto sempre lia o valor de quando o drag começou,
    // nunca o atualizado, nem trocando por uma ref sempre-atual resolvia sozinho; (2) reparentar o
    // card de verdade em `leads` fazia o React desmontar/remontar o KanbanCard em outra
    // <SortableContext> (coluna diferente = subárvore diferente, reconciliação por `key` não
    // atravessa colunas), derrubando o foco real do DOM pro <body> no meio do drag — e esse
    // remount, combinado com a remedição contínua de retângulos do dnd-kit
    // (MeasuringStrategy.WhileDragging), também fazia a "coluna atual" pular sozinha sem nenhuma
    // tecla ser pressionada.
    //
    // A solução abaixo evita os dois problemas não tocando em `leads` durante o drag: o
    // coordinateGetter mantém seu próprio "cursor" (`keyboardDragStatusRef`), que ele mesmo lê E
    // escreve a cada seta — autocontido, imune a re-render e a remontagem. `leads` só muda de
    // verdade no drop (handleDragEnd), igual ao mouse já fazia antes desta rodada. O preview
    // visual durante o drag continua vindo do <DragOverlay> (já existia antes desta rodada), que o
    // dnd-kit já anima seguindo a posição virtual — não precisa de reparentação nenhuma pra isso.
    const columnKeyboardCoordinateGetter = useCallback((event: KeyboardEvent, { context }: { context: { droppableRects: Map<string | number, { left: number; top: number; width: number; height: number }> } }) => {
        if (event.code !== 'ArrowLeft' && event.code !== 'ArrowRight') return undefined;
        const currentStatus = keyboardDragStatusRef.current;
        if (!currentStatus) return undefined;

        const currentIndex = columns.indexOf(currentStatus);
        if (currentIndex === -1) return undefined;
        const nextIndex = event.code === 'ArrowRight' ? currentIndex + 1 : currentIndex - 1;
        const nextStatus = columns[nextIndex];
        if (!nextStatus) return undefined; // já está na primeira/última coluna

        const rect = context.droppableRects.get(nextStatus);
        if (!rect) return undefined;

        event.preventDefault();
        keyboardDragStatusRef.current = nextStatus;
        // Mira no CENTRO do retângulo da coluna, não perto do topo: closestCenter compara
        // centro-a-centro contra TODOS os droppables (cada card E cada coluna inteira). Um ponto
        // perto do topo fica geometricamente mais perto do centro de um card vizinho (retângulo
        // pequeno) do que do centro da própria coluna (retângulo alto) — fazia o alvo "grudar" na
        // coluna anterior por 1-2 teclas antes de reagir, ou pular coluna vazia. Mirando no centro
        // real da coluna, ela sempre vence essa comparação pra ela mesma.
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, [columns]);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: columnKeyboardCoordinateGetter,
        })
    );

    /** Resolve a coluna de destino a partir do `over.id` do dnd-kit — pode ser o id da própria
        coluna (drop numa coluna vazia) ou o id de um card dentro dela (drop entre dois cards). */
    const resolveStatusFromOverId = useCallback((overId: string | number): LeadStatus | null => {
        if (typeof overId === 'string' && columns.includes(overId as LeadStatus)) {
            return overId as LeadStatus;
        }
        const overLead = leads.find(l => l.id === overId);
        return overLead ? overLead.status : null;
    }, [leads, columns]);

    const leadLabel = useCallback((lead: Lead | null | undefined) => {
        if (!lead) return 'Card';
        return lead.company?.tradeName || lead.company?.legalName || lead.contact?.name || 'Lead sem empresa';
    }, []);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const lead = leads.find(l => l.id === active.id);
        if (lead) {
            setActiveLead(lead);
            keyboardDragStatusRef.current = lead.status;
        }
    }, [leads]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveLead(null);
        keyboardDragStatusRef.current = null;

        if (!over) return;

        const leadId = active.id;
        const targetStatus = resolveStatusFromOverId(over.id);
        if (!targetStatus) return;

        const currentLead = leads.find(l => l.id === leadId);
        if (currentLead && currentLead.status !== targetStatus) {
            setLeads(prev => prev.map(lead => lead.id === leadId ? { ...lead, status: targetStatus } : lead));

            try {
                await leadsDB.updateStatus(leadId as string, targetStatus);
            } catch (error) {
                clientLogger.error({ err: error }, 'Error updating lead status');
                toast.error(`Não foi possível mover ${leadLabel(currentLead)} — a alteração foi desfeita.`);
                fetchLeads();
            }
        }
    }, [leads, fetchLeads, resolveStatusFromOverId, leadLabel]);

    const handleDragCancel = useCallback(() => {
        setActiveLead(null);
        keyboardDragStatusRef.current = null;
    }, []);

    // Announcements acessíveis do dnd-kit — o default ("Draggable item l2...") expõe o id
    // interno do lead, que não diz nada pro usuário. Trocado por nome da empresa + coluna,
    // sem introduzir dependência nova (accessibility.announcements é nativo do @dnd-kit/core).
    const announcements: Announcements = useMemo(() => ({
        onDragStart({ active }) {
            const lead = leads.find(l => l.id === active.id);
            return `${leadLabel(lead)} selecionado para mover, coluna atual ${lead?.status ?? ''}. Use as setas para escolher o destino, espaço para soltar, Esc para cancelar.`;
        },
        onDragOver({ active, over }) {
            const lead = leads.find(l => l.id === active.id);
            const status = over ? resolveStatusFromOverId(over.id) : null;
            if (!status) return `${leadLabel(lead)} não está sobre nenhuma coluna.`;
            return `${leadLabel(lead)} sobre a coluna ${status}.`;
        },
        onDragEnd({ active, over }) {
            const lead = leads.find(l => l.id === active.id);
            const status = over ? resolveStatusFromOverId(over.id) : null;
            if (!status) return `Movimentação de ${leadLabel(lead)} cancelada.`;
            return `${leadLabel(lead)} movido para ${status}.`;
        },
        onDragCancel({ active }) {
            const lead = leads.find(l => l.id === active.id);
            // `leads` nunca é tocado durante o drag (só no drop, em handleDragEnd), então
            // lead.status aqui já é a coluna de origem, sem precisar de nenhuma ref à parte.
            return `Movimentação de ${leadLabel(lead)} cancelada. O card permanece em ${lead?.status ?? ''}.`;
        },
    }), [leads, leadLabel, resolveStatusFromOverId]);

    const handleCardClick = useCallback((lead: Lead) => {
        setSelectedLeadId(lead.id);
    }, []);

    const handleFunnelChange = useCallback((next: 'Lead' | 'Negocio') => {
        if (funnelProp) return; // funil fixado por prop — toggle não se aplica
        setSelectedLeadId(null); // evita abrir o drawer de um lead que já não está no funil visível
        setSearchParams(next === 'Lead' ? {} : { funnel: next }, { replace: true });
    }, [funnelProp, setSearchParams]);

    const handleExportCsv = () => {
        const headers = ['ID', 'Empresa', 'CNPJ', 'Contato', 'Email', 'Telefone', 'Status', 'Pontuacao'];
        const rows = leads.map(l => [
            l.id,
            l.company?.tradeName || l.company?.legalName || '',
            l.company?.cnpj || '',
            l.contact?.name || '',
            l.contact?.email || '',
            l.contact?.phone || '',
            l.status,
            l.score || ''
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `leads_${brandInfo.name.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const groupedLeads = useMemo(() => {
        const grouped: Partial<Record<LeadStatus, Lead[]>> = Object.fromEntries(
            columns.map((status) => [status, [] as Lead[]]),
        );
        leads.forEach(lead => {
            grouped[lead.status]?.push(lead);
        });
        return grouped;
    }, [leads, columns]);

    return (
        <div className={`flex-1 flex flex-col bg-bg text-ink animate-in fade-in duration-500 overflow-hidden ${embedded ? 'min-h-[680px] h-full' : 'h-full'}`}>
            {/* Header com estilo moderno */}
            <div className="p-6 border-b border-line flex flex-col sm:flex-row items-start sm:items-center justify-between bg-bg/90 backdrop-blur-xl shrink-0 gap-4">
                <div>
                    <h2 className="font-extrabold text-2xl text-ink tracking-tight flex items-center gap-2">
                        🎯 {funnel === 'Lead' ? 'Leads e pré-vendas' : 'Negócios e fechamento'}
                    </h2>
                    <p className="text-ink-2 text-xs mt-1">
                        {funnel === 'Lead'
                            ? 'Qualifique, nutra e converta os leads prontos para o pipeline de negócios.'
                            : `Gerencie propostas, pilotos e receita do ${brandInfo.name} em um funil separado.`}
                    </p>
                    {/* Único jeito de alcançar o funil "Negocio" (12 estágios, incluindo os 7
                        estágios "Piloto") — antes desta correção não havia rota, aba ou link para
                        ele; o board só sabia renderizá-lo se recebesse a prop `funnel`, que nunca
                        era passada por nenhuma tela real. bg-brand-active/text-white é o mesmo
                        padrão já validado em AA (5.28:1 AtlasGR / 11.26:1 Total Trac) usado no
                        toggle de PIC em LeadDetailDrawer.tsx. */}
                    {!funnelProp && (
                        <div className="inline-flex items-center gap-1 p-1 mt-3 bg-surface-2 rounded-xl border border-line" role="group" aria-label="Funil do pipeline">
                            <button
                                type="button"
                                onClick={() => handleFunnelChange('Lead')}
                                aria-pressed={funnel === 'Lead'}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${funnel === 'Lead' ? 'bg-brand-active text-white' : 'text-ink-2 hover:text-ink'}`}
                            >
                                Leads
                            </button>
                            <button
                                type="button"
                                onClick={() => handleFunnelChange('Negocio')}
                                aria-pressed={funnel === 'Negocio'}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${funnel === 'Negocio' ? 'bg-brand-active text-white' : 'text-ink-2 hover:text-ink'}`}
                            >
                                Negócios
                            </button>
                        </div>
                    )}
                </div>
                {/* Em 390px os dois botões, com o label completo, não cabiam lado a lado (medido:
                    "Exportar CSV" terminava em ~377px, 2px além do viewport de 375px) — ação
                    ficava presente no DOM mas inalcançável. Grid de 2 colunas full-width + label
                    curto abaixo do breakpoint sm resolve sem esconder nenhuma ação nem criar menu
                    "...". A partir de sm volta ao layout original (flex, largura de conteúdo). */}
                <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:items-center sm:gap-3">
                    <Button
                        onClick={handleImportBitrix}
                        disabled={loading}
                        variant="secondary"
                        className="text-xs w-full sm:w-auto"
                        title="Importar leads recentes do Bitrix24"
                    >
                        <Download className="w-4 h-4 rotate-180 shrink-0" />
                        {loading ? 'Importando...' : (
                            <>
                                <span className="sm:hidden">📥 Bitrix24</span>
                                <span className="hidden sm:inline">📥 Sincronizar Bitrix24</span>
                            </>
                        )}
                    </Button>
                    <Button
                        onClick={handleExportCsv}
                        variant="secondary"
                        className="text-xs w-full sm:w-auto"
                        title="Exportar todos os leads para uma planilha CSV"
                    >
                        <Download className="w-4 h-4 shrink-0" />
                        <span className="sm:hidden">💾 CSV</span>
                        <span className="hidden sm:inline">💾 Exportar CSV</span>
                    </Button>
                </div>
            </div>

            {/* Contextual Tip Banner */}
            {!embedded && <div className="px-6 pt-4 shrink-0">
                <ContextualTip
                    id="tip-crm-pipeline"
                    title="💡 Dica de Gestão de Funil CRM"
                    description="Passe o cursor sobre os cards para ver as ferramentas da empresa e o score de engajamento antes de agendar a próxima call comercial!"
                />
            </div>}

            {/* Região com scroll horizontal precisa estar no tab order pra ser rolável via teclado
                (axe-core: scrollable-region-focusable). jsx-a11y trata todo tabIndex em <div> como
                suspeito por padrão, mas essa é a correção recomendada pelas ARIA Authoring Practices
                pra containers de scroll não-interativos — daí o disable pontual logo abaixo. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 custom-scrollbar bg-surface-2/50" tabIndex={0} aria-label="Colunas do pipeline — role o conteúdo horizontalmente">
                {loading ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                            {/* dark:border-brand-2 pelo mesmo motivo do drop target/hover do card:
                                --brand cru da Total Trac (#374898) só dá 2.25:1 sobre superfície
                                escura — ver relato da Rodada B pra matriz completa. */}
                            <div className="w-8 h-8 border-4 border-brand dark:border-brand-2 border-t-transparent rounded-full animate-spin" />
                            <p className="text-ink-2 font-medium text-sm">Carregando pipeline comercial...</p>
                        </div>
                    </div>
                ) : error ? (
                    <EmptyState
                        icon={<WifiOff className="w-8 h-8 text-brand" />}
                        title="Não foi possível carregar o pipeline"
                        description={error}
                        actionLabel="Tentar novamente"
                        onAction={fetchLeads}
                    />
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onDragCancel={handleDragCancel}
                        accessibility={{ announcements }}
                    >
                        <div className="flex gap-6 h-full items-start">
                            {columns.map(status => (
                                <KanbanColumn
                                    key={status}
                                    status={status}
                                    leads={groupedLeads[status] ?? []}
                                    onCardClick={handleCardClick}
                                    onCardEnrich={handleCardEnrich}
                                    onConvert={funnel === 'Lead' && status === 'Convertido em Oportunidade' ? handleConvert : undefined}
                                />
                            ))}
                        </div>
                        <DragOverlay>
                            {activeLead ? (
                                <div className="w-[320px] rotate-2 scale-[1.03] opacity-95 shadow-2xl pointer-events-none">
                                    <KanbanCard lead={activeLead} onClick={() => {}} />
                                </div>
                            ) : null}
                        </DragOverlay>
                    </DndContext>
                )}
            </div>

            {selectedLeadId && (
                <LeadDetailDrawer
                    leadId={selectedLeadId}
                    onClose={() => setSelectedLeadId(null)}
                    onChanged={fetchLeads}
                />
            )}
        </div>
    );
}
