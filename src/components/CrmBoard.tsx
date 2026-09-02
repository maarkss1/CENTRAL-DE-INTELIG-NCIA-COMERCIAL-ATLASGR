import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, WifiOff, Sparkles, CheckSquare, Send, X, Loader2 } from 'lucide-react';
import type { Lead, LeadStatus } from '../types';
import { KanbanColumn } from '../features/crm/components/KanbanColumn';
import { KanbanCard } from '../features/crm/components/KanbanCard';
import { LeadDetailDrawer } from '../features/crm/components/LeadDetailDrawer';
import { BitrixImportModal } from '../features/crm/components/BitrixImportModal';
import { bitrixApi } from '../features/integrations/bitrix/bitrix.api';
import { api } from '../lib/api';
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
  KeyboardCode,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type Announcements,
} from '@dnd-kit/core';

// dnd-kit ativa drag por teclado em Space E Enter por padrão — mas KanbanCard também usa Enter pra
// abrir o LeadDetailDrawer (mesma tecla, dois significados). Restringindo o sensor a Space, Enter
// fica livre e sem ambiguidade pra "abrir detalhes"; Space vira exclusivamente "pegar/soltar o card".
const KEYBOARD_DRAG_CODES = {
  start: [KeyboardCode.Space],
  cancel: [KeyboardCode.Esc],
  end: [KeyboardCode.Space],
};

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
  'Negócios Ganhos',
];

interface CrmBoardProps {
  funnel?: 'Lead' | 'Negocio';
  embedded?: boolean;
}

export function CrmBoard({ funnel: funnelProp, embedded = false }: CrmBoardProps) {
  const { brandInfo } = useBrand();
  const [searchParams, setSearchParams] = useSearchParams();
  const funnel: 'Lead' | 'Negocio' =
    funnelProp ?? (searchParams.get('funnel') === 'Negocio' ? 'Negocio' : 'Lead');
  const columns = funnel === 'Lead' ? LEAD_COLUMNS : DEAL_COLUMNS;
  const {
    leads,
    setLeads,
    loading,
    error,
    fetchLeads,
    handleConvert,
    handleCardEnrich,
    handleBatchEnrich,
  } = useCrmBoardController(funnel);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const keyboardDragStatusRef = useRef<LeadStatus | null>(null);

  // Multi-seleção e ações em lote
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [isBitrixModalOpen, setIsBitrixModalOpen] = useState(false);
  const [isBatchUpdating, setIsBatchUpdating] = useState(false);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    // /api/users nunca existiu como rota (404 silencioso todo carregamento — achado do teste
    // de console limpo em crm.spec.ts) — o endpoint real de nome/id de usuários da organização
    // pra reatribuição é /api/team/assignable (ver team.routes.ts).
    api
      .get<{ owners: { id: string; name: string }[] }>('/api/team/assignable')
      .then((res) => setUsers(res.owners))
      .catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/api/notifications/stream', { withCredentials: true });
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'voice-qualified') {
          toast.success(data.message);
          // Atualiza a lista para refletir possíveis mudanças
          fetchLeads();
        }
      } catch (err) {
        clientLogger.error({ err }, 'Erro ao processar evento SSE');
      }
    };
    return () => {
      eventSource.close();
    };
  }, [fetchLeads]);

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
  const columnKeyboardCoordinateGetter = useCallback(
    (
      event: KeyboardEvent,
      {
        context,
      }: {
        context: {
          droppableRects: Map<
            string | number,
            { left: number; top: number; width: number; height: number }
          >;
        };
      },
    ) => {
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
    },
    [columns],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: columnKeyboardCoordinateGetter,
      keyboardCodes: KEYBOARD_DRAG_CODES,
    }),
  );

  /** Resolve a coluna de destino a partir do `over.id` do dnd-kit — pode ser o id da própria
        coluna (drop numa coluna vazia) ou o id de um card dentro dela (drop entre dois cards). */
  const resolveStatusFromOverId = useCallback(
    (overId: string | number): LeadStatus | null => {
      if (typeof overId === 'string' && columns.includes(overId as LeadStatus)) {
        return overId as LeadStatus;
      }
      const overLead = leads.find((l) => l.id === overId);
      return overLead ? overLead.status : null;
    },
    [leads, columns],
  );

  const leadLabel = useCallback((lead: Lead | null | undefined) => {
    if (!lead) return 'Card';
    return (
      lead.company?.tradeName || lead.company?.legalName || lead.contact?.name || 'Lead sem empresa'
    );
  }, []);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const lead = leads.find((l) => l.id === active.id);
      if (lead) {
        setActiveLead(lead);
        keyboardDragStatusRef.current = lead.status;
      }
    },
    [leads],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveLead(null);
      keyboardDragStatusRef.current = null;

      if (!over) return;

      const leadId = active.id;
      const targetStatus = resolveStatusFromOverId(over.id);
      if (!targetStatus) return;

      const currentLead = leads.find((l) => l.id === leadId);
      if (currentLead && currentLead.status !== targetStatus) {
        setLeads((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, status: targetStatus } : lead)),
        );

        try {
          // /api/leads/:id só existe como PUT (lead.routes.ts) — api.patch mandava PATCH,
          // que o backend nunca registrou (404 silencioso engolido pelo catch abaixo).
          // Resultado real: mover um card no Kanban nunca persistia, sempre revertia com o
          // toast "a alteração foi desfeita" (achado do teste E2E de drag-and-drop).
          await api.put(`/api/leads/${leadId}`, { status: targetStatus });
        } catch (error) {
          clientLogger.error({ err: error }, 'Error updating lead status');
          toast.error(
            `Não foi possível mover ${leadLabel(currentLead)} — a alteração foi desfeita.`,
          );
          fetchLeads();
        }
      }
    },
    [leads, fetchLeads, resolveStatusFromOverId, leadLabel],
  );

  const handleDragCancel = useCallback(() => {
    setActiveLead(null);
    keyboardDragStatusRef.current = null;
  }, []);

  // Announcements acessíveis do dnd-kit — o default ("Draggable item l2...") expõe o id
  // interno do lead, que não diz nada pro usuário. Trocado por nome da empresa + coluna,
  // sem introduzir dependência nova (accessibility.announcements é nativo do @dnd-kit/core).
  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }) {
        const lead = leads.find((l) => l.id === active.id);
        return `${leadLabel(lead)} selecionado para mover, coluna atual ${lead?.status ?? ''}. Use as setas para escolher o destino, espaço para soltar, Esc para cancelar.`;
      },
      onDragOver({ active, over }) {
        const lead = leads.find((l) => l.id === active.id);
        const status = over ? resolveStatusFromOverId(over.id) : null;
        if (!status) return `${leadLabel(lead)} não está sobre nenhuma coluna.`;
        return `${leadLabel(lead)} sobre a coluna ${status}.`;
      },
      onDragEnd({ active, over }) {
        const lead = leads.find((l) => l.id === active.id);
        const status = over ? resolveStatusFromOverId(over.id) : null;
        if (!status) return `Movimentação de ${leadLabel(lead)} cancelada.`;
        return `${leadLabel(lead)} movido para ${status}.`;
      },
      onDragCancel({ active }) {
        const lead = leads.find((l) => l.id === active.id);
        // `leads` nunca é tocado durante o drag (só no drop, em handleDragEnd), então
        // lead.status aqui já é a coluna de origem, sem precisar de nenhuma ref à parte.
        return `Movimentação de ${leadLabel(lead)} cancelada. O card permanece em ${lead?.status ?? ''}.`;
      },
    }),
    [leads, leadLabel, resolveStatusFromOverId],
  );

  const handleCardClick = useCallback(
    (lead: Lead) => {
      if (selectionMode) {
        handleToggleSelect(lead.id);
        return;
      }
      setSelectedLeadId(lead.id);
    },
    [selectionMode],
  );

  const handleToggleSelect = useCallback((leadId: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId);
      else next.add(leadId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedLeadIds.size === leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map((l) => l.id)));
    }
  }, [leads, selectedLeadIds.size]);

  const handleClearSelection = useCallback(() => {
    setSelectedLeadIds(new Set());
    setSelectionMode(false);
  }, []);

  const handleBatchMoveStage = async (newStatus: string) => {
    if (selectedLeadIds.size === 0 || !newStatus) return;
    setIsBatchUpdating(true);
    try {
      // Usa o resultado real da API (updatedCount/failedCount), não selectedLeadIds.size — o
      // backend filtra ids inexistentes/de outro tenant e só conta como atualizado quando algo
      // realmente mudou, então a contagem solicitada podia ser maior que a real sem o usuário
      // nunca saber (achado de auditoria).
      const result = await api.post<{ updatedCount: number; total: number; failedCount: number }>(
        '/api/leads/batch-update',
        { leadIds: Array.from(selectedLeadIds), updates: { status: newStatus } },
      );
      if (result.failedCount > 0) {
        toast.error(
          `${result.updatedCount} de ${result.total} leads movidos para "${newStatus}" — ${result.failedCount} falharam.`,
        );
      } else {
        toast.success(`${result.updatedCount} lead(s) movido(s) para "${newStatus}"!`);
      }
      fetchLeads();
      setSelectedLeadIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao mover leads em lote.');
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleBatchReassignOwner = async (ownerId: string) => {
    if (selectedLeadIds.size === 0) return;
    const ownerUser = users.find((u) => u.id === ownerId);
    const ownerName = ownerUser?.name || ownerId;
    setIsBatchUpdating(true);
    try {
      const result = await api.post<{ updatedCount: number; total: number; failedCount: number }>(
        '/api/leads/batch-update',
        { leadIds: Array.from(selectedLeadIds), updates: { owner: ownerName } },
      );
      if (result.failedCount > 0) {
        toast.error(
          `${result.updatedCount} de ${result.total} leads reatribuídos para "${ownerName}" — ${result.failedCount} falharam.`,
        );
      } else {
        toast.success(`${result.updatedCount} lead(s) reatribuído(s) para "${ownerName}"!`);
      }
      fetchLeads();
      setSelectedLeadIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao reatribuir leads.');
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleBatchExportBitrix = async () => {
    if (selectedLeadIds.size === 0) {
      // Se nenhum lead selecionado, pergunta se deseja exportar todos
      try {
        const res = await bitrixApi.exportLeadsBatch();
        toast.success(
          `Exportação concluída: ${res.data.exportedCount} leads enviados para o Bitrix24!`,
        );
        fetchLeads();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Falha ao exportar para Bitrix24.');
      }
      return;
    }

    setIsBatchUpdating(true);
    try {
      const res = await bitrixApi.exportLeadsBatch(Array.from(selectedLeadIds));
      toast.success(`${res.data.exportedCount} leads enviados com sucesso para o Bitrix24!`);
      fetchLeads();
      setSelectedLeadIds(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao exportar para Bitrix24.');
    } finally {
      setIsBatchUpdating(false);
    }
  };

  const handleFunnelChange = useCallback(
    (next: 'Lead' | 'Negocio') => {
      if (funnelProp) return; // funil fixado por prop — toggle não se aplica
      setSelectedLeadId(null); // evita abrir o drawer de um lead que já não está no funil visível
      setSelectedLeadIds(new Set());
      setSearchParams(next === 'Lead' ? {} : { funnel: next }, { replace: true });
    },
    [funnelProp, setSearchParams],
  );

  const handleExportCsv = async () => {
    try {
      const response = await fetch('/api/leads/export/csv', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Falha ao exportar');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `leads_${brandInfo.name.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao exportar leads. Tente novamente.');
    }
  };

  const groupedLeads = useMemo(() => {
    const grouped: Partial<Record<LeadStatus, Lead[]>> = Object.fromEntries(
      columns.map((status) => [status, [] as Lead[]]),
    );
    leads.forEach((lead) => {
      grouped[lead.status]?.push(lead);
    });
    return grouped;
  }, [leads, columns]);

  return (
    <div
      className={`flex-1 flex flex-col bg-bg text-ink animate-in fade-in duration-500 overflow-hidden relative ${embedded ? 'min-h-[680px] h-full' : 'h-full'}`}
    >
      {/* Header com estilo moderno */}
      <div className="p-6 border-b border-line flex flex-col sm:flex-row items-start sm:items-center justify-between bg-surface/75 backdrop-blur-xl shrink-0 gap-4">
        <div>
          <h2 className="font-extrabold text-2xl text-ink tracking-tight flex items-center gap-2">
            🎯 {funnel === 'Lead' ? 'Leads e pré-vendas' : 'Negócios e fechamento'}
          </h2>
          <p className="text-ink-2 text-xs mt-1">
            {funnel === 'Lead'
              ? 'Qualifique, nutra e converta os leads prontos para o pipeline de negócios.'
              : `Gerencie propostas, pilotos e receita do ${brandInfo.name} em um funil separado.`}
          </p>
          {!funnelProp && (
            <div
              className="inline-flex items-center gap-1 p-1 mt-3 bg-surface-2 rounded-lg border border-line"
              role="group"
              aria-label="Funil do pipeline"
            >
              <button
                type="button"
                onClick={() => handleFunnelChange('Lead')}
                aria-pressed={funnel === 'Lead'}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${funnel === 'Lead' ? 'bg-brand-active text-white' : 'text-ink-2 hover:bg-surface hover:text-ink'}`}
              >
                Leads
              </button>
              <button
                type="button"
                onClick={() => handleFunnelChange('Negocio')}
                aria-pressed={funnel === 'Negocio'}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${funnel === 'Negocio' ? 'bg-brand-active text-white' : 'text-ink-2 hover:bg-surface hover:text-ink'}`}
              >
                Negócios
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Botão de Modo de Seleção Múltipla */}
          <Button
            onClick={() => {
              setSelectionMode(!selectionMode);
              if (selectionMode) setSelectedLeadIds(new Set());
            }}
            variant={selectionMode ? 'default' : 'secondary'}
            className="text-xs"
            title="Ativar seleção múltipla de cards no Kanban"
          >
            <CheckSquare className="w-4 h-4 shrink-0" />
            <span>{selectionMode ? 'Cancelar Seleção' : 'Seleção em Lote'}</span>
          </Button>

          {/* Botão Receber do Bitrix (Modal Manual) */}
          <Button
            onClick={() => setIsBitrixModalOpen(true)}
            variant="secondary"
            className="text-xs"
            title="Abrir painel para buscar e receber leads do Bitrix24"
          >
            <Download className="w-4 h-4 rotate-180 shrink-0 text-sky-500" />
            <span>📥 Receber do Bitrix</span>
          </Button>

          {/* Botão Enviar para Bitrix (Manual) */}
          <Button
            onClick={handleBatchExportBitrix}
            variant="secondary"
            className="text-xs"
            title="Enviar leads para o portal Bitrix24"
          >
            <Send className="w-4 h-4 shrink-0 text-sky-500" />
            <span>📤 Enviar para Bitrix</span>
          </Button>

          <Button
            onClick={handleBatchEnrich}
            disabled={loading}
            variant="secondary"
            className="text-xs"
            title="Enriquecer leads não enriquecidos em lote"
          >
            <Sparkles className="w-4 h-4 shrink-0 text-yellow-500" />
            <span className="hidden sm:inline">✨ Enriquecer Lote</span>
          </Button>

          <Button
            onClick={handleExportCsv}
            variant="secondary"
            className="text-xs"
            title="Exportar todos os leads para uma planilha CSV"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">💾 CSV</span>
          </Button>
        </div>
      </div>

      {/* Contextual Tip Banner */}
      {!embedded && (
        <div className="px-6 pt-4 shrink-0">
          <ContextualTip
            id="tip-crm-pipeline"
            title="💡 Dica de Gestão de Funil CRM"
            description="Passe o cursor sobre os cards para ver o tempo de estagnação e tecnologias. Use 'Seleção em Lote' para mover dezenas de leads simultaneamente ou exportá-los para o Bitrix24!"
          />
        </div>
      )}

      {/* Região com scroll horizontal do Kanban */}
      <div
        className="flex-1 overflow-x-auto overflow-y-hidden p-6 custom-scrollbar bg-bg pb-24"
        // role="region" torna o aria-label válido (div genérica não aceita nome acessível) e
        // sinaliza a screen readers que é uma landmark navegável — não só satisfaz o linter.
        role="region"
        // Div não-interativa com scroll — tabIndex é intencional (torna a região focável/rolável
        // via teclado), não um erro de a11y. Mesmo padrão de VirtualTable.tsx.
        // biome-ignore lint/a11y/noNoninteractiveTabindex: scroll horizontal via teclado, ver comentário acima
        tabIndex={0}
        aria-label="Colunas do pipeline — role o conteúdo horizontalmente"
      >
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
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
            <div className="flex gap-6 h-full">
              {columns.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  leads={groupedLeads[status] ?? []}
                  onCardClick={handleCardClick}
                  onCardEnrich={handleCardEnrich}
                  onConvert={
                    funnel === 'Lead' && status === 'Convertido em Oportunidade'
                      ? handleConvert
                      : undefined
                  }
                  selectedLeadIds={selectedLeadIds}
                  onToggleSelect={handleToggleSelect}
                  selectionMode={selectionMode}
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

      {/* Barra Flutuante de Ações em Lote (Fixa na parte inferior quando há leads selecionados) */}
      {selectedLeadIds.size > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 bg-surface/95 backdrop-blur-xl border border-line shadow-2xl rounded-3xl p-3 px-5 flex flex-wrap items-center gap-3 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-center gap-2 pr-3 border-r border-line">
            <span className="w-6 h-6 rounded-full bg-brand-active text-white text-xs font-black flex items-center justify-center">
              {selectedLeadIds.size}
            </span>
            <span className="text-xs font-bold text-ink">selecionado(s)</span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] font-bold text-brand-active dark:text-brand-2 hover:underline ml-1"
            >
              {selectedLeadIds.size === leads.length ? 'Desmarcar Todos' : 'Todos'}
            </button>
          </div>

          {/* Mover Etapa em Massa */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-ink-2">Etapa:</span>
            <select
              onChange={(e) => {
                if (e.target.value) handleBatchMoveStage(e.target.value);
              }}
              disabled={isBatchUpdating}
              defaultValue=""
              className="px-2.5 py-1.5 bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink focus:outline-none focus:border-brand"
            >
              <option value="" disabled>
                Mover para...
              </option>
              {columns.map((col) => (
                <option key={col} value={col}>
                  {col}
                </option>
              ))}
            </select>
          </div>

          {/* Reatribuir Vendedor */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-ink-2">Dono:</span>
            <select
              onChange={(e) => {
                if (e.target.value) handleBatchReassignOwner(e.target.value);
              }}
              disabled={isBatchUpdating}
              defaultValue=""
              className="px-2.5 py-1.5 bg-surface-2 border border-line rounded-xl text-xs font-bold text-ink focus:outline-none focus:border-brand"
            >
              <option value="" disabled>
                Atribuir a...
              </option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Enviar Selecionados para Bitrix */}
          <button
            type="button"
            onClick={handleBatchExportBitrix}
            disabled={isBatchUpdating}
            className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {isBatchUpdating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            Enviar ao Bitrix24
          </button>

          <button
            type="button"
            onClick={handleClearSelection}
            className="p-1.5 rounded-xl hover:bg-surface-2 text-ink-2 hover:text-ink transition-colors"
            title="Desmarcar todos"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Modal de Importação Bitrix24 */}
      <BitrixImportModal
        isOpen={isBitrixModalOpen}
        onClose={() => setIsBitrixModalOpen(false)}
        onImportSuccess={fetchLeads}
      />

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
