import { useCallback, useEffect, useState } from 'react';
import {
  Cpu,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  X,
  Zap,
  Play,
  Filter,
  ZapIcon,
  FlaskConical,
  History,
  Pencil,
  RefreshCw,
} from 'lucide-react';

import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import { toast } from '../../../lib/toast';
import {
  automationsApi,
  describeAutomation,
  TRIGGERS,
  ACTIONS,
  LEAD_STATUSES,
  type Automation,
  type AutomationTrigger,
  type AutomationAction,
  type AutomationConditions,
} from '../automations.api';
import { ColdCallStatusCard } from './ColdCallStatusCard';
import { AutomationDryRunDialog } from './AutomationDryRunDialog';
import { AutomationVersionsDialog } from './AutomationVersionsDialog';

const inputClass =
  'w-full bg-surface-2 border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-2 outline-none focus:border-brand transition-colors';

const labelClass = 'block text-[11px] uppercase tracking-wide text-ink-2 font-semibold mb-1';

// "Ligar via SDR de Voz" só faz sentido partindo de um evento de lead — em "Atividade concluída" o
// motor não tem como ligar de volta para um número (ver automation.engine.ts). Sem esse filtro o
// formulário deixaria o usuário criar uma regra que nunca vai disparar com sucesso.
const ACTIONS_INDISPONIVEIS_POR_GATILHO: Partial<Record<AutomationTrigger, AutomationAction[]>> = {
  'Atividade concluída': ['Ligar via SDR de Voz'],
};

function VisualNode({
  icon: Icon,
  title,
  subtitle,
  children,
  isLast,
}: {
  icon: any;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div className="relative">
      {!isLast && (
        <div className="absolute left-6 top-12 bottom-[-16px] w-px bg-brand/30 border-l border-dashed border-brand/40" />
      )}
      <div className="flex gap-4 items-start relative z-10">
        <div className="w-12 h-12 rounded-full bg-surface-2 border border-brand/20 flex items-center justify-center shrink-0 shadow-sm z-10">
          <Icon className="w-5 h-5 text-brand" />
        </div>
        <div className="flex-1 bg-surface-2 border border-line rounded-2xl p-4 shadow-sm mb-4">
          <h4 className="text-sm font-bold text-ink mb-1">{title}</h4>
          {subtitle && <p className="text-[11px] text-ink-2 mb-3">{subtitle}</p>}
          <div className="space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * `editing` presente = modo edição (`automationsApi.update`), ausente = criação. O sistema de
 * versionamento com diff (`AutomationVersionsDialog.tsx`) já existia pronto e testado no backend
 * pra mostrar "Gatilho: X → Y"/"Condições: A → B"/"Ação: C → D", mas até o Piloto 018 a única
 * chamada de `update` em todo o front era o toggle ativa/pausa — não existia nenhum jeito de editar
 * o conteúdo de uma regra pela UI, então esse histórico nunca mostrava nada além de mudança de
 * status na prática de uso real.
 */
function AutomationForm({
  editing,
  onCancel,
  onSaved,
}: {
  editing?: Automation | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const actionConfig = editing?.actionConfig ?? {};
  const conditions = editing?.conditions ?? null;
  const [name, setName] = useState(editing?.name ?? '');
  const [trigger, setTrigger] = useState<AutomationTrigger>(
    editing?.trigger ?? 'Lead mudou de status',
  );
  const [statusCondition, setStatusCondition] = useState(
    (typeof conditions?.status === 'string' ? conditions.status : '') || '',
  );
  const [stagnationDays, setStagnationDays] = useState(
    conditions?.daysSinceLastInteraction &&
      typeof conditions.daysSinceLastInteraction === 'object' &&
      'gte' in conditions.daysSinceLastInteraction
      ? String(conditions.daysSinceLastInteraction.gte)
      : '',
  );
  const [action, setAction] = useState<AutomationAction>(editing?.action ?? 'Notificar equipe');
  const acoesDisponiveis = ACTIONS.filter(
    (a) => !ACTIONS_INDISPONIVEIS_POR_GATILHO[trigger]?.includes(a),
  );
  const [title, setTitle] = useState(
    typeof actionConfig.title === 'string' ? actionConfig.title : '',
  );
  const [body, setBody] = useState(typeof actionConfig.body === 'string' ? actionConfig.body : '');
  const [emailChannel, setEmailChannel] = useState(actionConfig.channel === 'email');
  const [emailTo, setEmailTo] = useState(
    typeof actionConfig.to === 'string' ? actionConfig.to : '',
  );
  const [dueInDays, setDueInDays] = useState(
    typeof actionConfig.dueInDays === 'number' ? String(actionConfig.dueInDays) : '1',
  );
  const [saving, setSaving] = useState(false);

  const permiteCondicaoStatus = trigger === 'Lead mudou de status' || trigger === 'Lead estagnado';
  const requiresStagnationDays = trigger === 'Lead estagnado';

  const submit = useCallback(async () => {
    if (!name.trim()) {
      toast.error('Dê um nome à automação.');
      return;
    }
    const stagnationThreshold =
      requiresStagnationDays && stagnationDays.trim() ? Number(stagnationDays) : null;
    if (
      requiresStagnationDays &&
      (stagnationThreshold == null ||
        !Number.isFinite(stagnationThreshold) ||
        stagnationThreshold <= 0)
    ) {
      toast.error('O número de dias parado precisa ser maior que zero.');
      return;
    }
    if (emailChannel && !emailTo.trim()) {
      toast.error('Informe o e-mail de destino para o canal de e-mail.');
      return;
    }
    setSaving(true);
    try {
      const nextConditions: AutomationConditions = {};
      if (permiteCondicaoStatus && statusCondition) nextConditions.status = statusCondition;
      if (stagnationThreshold != null)
        nextConditions.daysSinceLastInteraction = { gte: stagnationThreshold };

      const draft = {
        name: name.trim(),
        trigger,
        action,
        conditions: Object.keys(nextConditions).length > 0 ? nextConditions : null,
        actionConfig:
          action === 'Notificar equipe'
            ? {
                title: title.trim() || name.trim(),
                body: body.trim() || undefined,
                kind: 'Info',
                ...(emailChannel ? { channel: 'email', to: emailTo.trim() } : {}),
              }
            : action === 'Ligar via SDR de Voz'
              ? {}
              : { dueInDays: Number(dueInDays) || 1, type: 'Follow_up' },
      };

      if (editing) {
        await automationsApi.update(editing.id, draft);
        toast.success('Automação atualizada.');
      } else {
        await automationsApi.create(draft);
        toast.success('Automação criada.');
      }
      onSaved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [
    editing,
    name,
    trigger,
    action,
    statusCondition,
    stagnationDays,
    title,
    body,
    emailChannel,
    emailTo,
    dueInDays,
    permiteCondicaoStatus,
    requiresStagnationDays,
    onSaved,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-6 overflow-y-auto">
      <div className="w-full max-w-2xl bg-surface rounded-2xl shadow-xl overflow-hidden flex flex-col my-auto max-h-full">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between bg-surface-2/50">
          <h2 className="text-lg font-bold text-ink">
            {editing ? 'Editar Automação' : 'Construtor de Automação'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-line/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="mb-6">
            <label className={labelClass} htmlFor="auto-nome">
              Nome
            </label>
            <input
              id="auto-nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Avisar em Proposta Enviada"
              className={inputClass}
              /* modal ("Construtor de Automação") aberto por ação do usuário; foca o primeiro
                 campo do formulário que acabou de abrir, padrão de diálogo do WAI-ARIA
                 Authoring Practices. */
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </div>

          <div className="pt-2">
            <VisualNode icon={Play} title="Gatilho" subtitle="O que dispara esta automação?">
              <label className={labelClass} htmlFor="auto-trigger">
                Quando
              </label>
              <select
                id="auto-trigger"
                value={trigger}
                onChange={(e) => {
                  const novoGatilho = e.target.value as AutomationTrigger;
                  setTrigger(novoGatilho);
                  if (ACTIONS_INDISPONIVEIS_POR_GATILHO[novoGatilho]?.includes(action)) {
                    setAction(
                      ACTIONS.find(
                        (a) => !ACTIONS_INDISPONIVEIS_POR_GATILHO[novoGatilho]?.includes(a),
                      ) ?? 'Notificar equipe',
                    );
                  }
                }}
                className={inputClass}
              >
                {TRIGGERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </VisualNode>

            {permiteCondicaoStatus && (
              <VisualNode icon={Filter} title="Condições" subtitle="Filtros adicionais (opcional)">
                <div>
                  <label className={labelClass} htmlFor="auto-status">
                    Somente na etapa
                  </label>
                  <select
                    id="auto-status"
                    value={statusCondition}
                    onChange={(e) => setStatusCondition(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Qualquer etapa</option>
                    {LEAD_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {requiresStagnationDays && (
                  <div className="mt-3">
                    <label className={labelClass} htmlFor="auto-stagnation">
                      Reavaliar todo dia se ficar parado por (dias)
                    </label>
                    <input
                      id="auto-stagnation"
                      type="number"
                      min="1"
                      value={stagnationDays}
                      onChange={(e) => setStagnationDays(e.target.value)}
                      placeholder="Ex: 3"
                      className={inputClass}
                    />
                  </div>
                )}
              </VisualNode>
            )}

            <VisualNode icon={ZapIcon} title="Ação" subtitle="O que acontece depois?" isLast>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as AutomationAction)}
                className={inputClass}
              >
                {acoesDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>

              {action === 'Notificar equipe' ? (
                <div className="space-y-3 mt-3 p-3 bg-soft rounded-xl border border-line">
                  <div>
                    <label className={labelClass} htmlFor="auto-notify-title">
                      Título do aviso
                    </label>
                    <input
                      id="auto-notify-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ex: Novo lead quente!"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass} htmlFor="auto-notify-body">
                      Detalhe (opcional)
                    </label>
                    <input
                      id="auto-notify-body"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-xs text-ink-2 select-none cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailChannel}
                      onChange={(e) => setEmailChannel(e.target.checked)}
                      className="rounded border-line"
                    />
                    Também enviar por e-mail
                  </label>
                  {emailChannel && (
                    <div>
                      <label className={labelClass} htmlFor="auto-email-to">
                        Enviar para (e-mail)
                      </label>
                      <input
                        id="auto-email-to"
                        type="email"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="gestor@atlasgr.com.br"
                        className={inputClass}
                      />
                    </div>
                  )}
                </div>
              ) : action === 'Ligar via SDR de Voz' ? (
                <p className="text-xs text-ink-2 mt-2 bg-surface-2 p-2 rounded-lg border border-line">
                  A IA de voz assumirá o fluxo de ligação automaticamente se o contato possuir
                  telefone.
                </p>
              ) : (
                <div className="mt-3 p-3 bg-soft rounded-xl border border-line">
                  <label className={labelClass} htmlFor="auto-followup-days">
                    Criar follow-up em (dias)
                  </label>
                  <input
                    id="auto-followup-days"
                    type="number"
                    min="1"
                    value={dueInDays}
                    onChange={(e) => setDueInDays(e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
            </VisualNode>
          </div>
        </div>

        <div className="px-6 py-4 bg-surface-2/30 border-t border-line flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing ? 'Salvar alterações' : 'Criar'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Automations() {
  const accent = useBrandAccent();
  const { currentUser } = useAuth();
  // Criar/editar/remover/simular/ver-versões exigem ADMIN/GESTOR no backend
  // (`automation.routes.ts`), mas nenhum desses controles verificava o papel do usuário — SDR/
  // CLOSER viam todos os botões habilitados e só descobriam a falta de permissão com um 403 depois
  // de clicar (achado do Piloto 018, mesmo padrão já corrigido no Piloto 017/Playbook).
  const canManage = !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR']);
  // `/api/automations/stagnation-scan` é restrita a ADMIN no backend (roda para TODAS as
  // organizações, não só a de quem chama — ver `automation.routes.ts`), então o botão de disparo
  // manual precisa do mesmo corte, mais estrito que `canManage` (ADMIN/GESTOR). Achado do
  // Piloto 018: a rota já existia, testada, mas sem nenhum ponto de acionamento na UI.
  const isAdmin = !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN']);
  const [items, setItems] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingItem, setEditingItem] = useState<Automation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dryRunTarget, setDryRunTarget] = useState<Automation | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<Automation | null>(null);
  const [scanningStagnation, setScanningStagnation] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await automationsApi.list());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (item: Automation) => {
      const anterior = items;
      setItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, enabled: !a.enabled } : a)));
      try {
        await automationsApi.update(item.id, { enabled: !item.enabled });
      } catch (err) {
        setItems(anterior);
        toast.error((err as Error).message);
      }
    },
    [items],
  );

  const remove = useCallback(async (item: Automation) => {
    if (!window.confirm(`Remover a automação "${item.name}"?`)) return;
    setBusyId(item.id);
    try {
      await automationsApi.remove(item.id);
      setItems((prev) => prev.filter((a) => a.id !== item.id));
      toast.success('Automação removida.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }, []);

  // Roda a varredura de estagnação (cron diário, `runStagnationScan`) sob demanda, para TODAS as
  // organizações — mesma operação, só que agora, em vez de esperar o horário agendado (03:17). É
  // uma operação de custo real (reavalia leads de todas as organizações), daí o confirm antes de
  // disparar, mesmo padrão já usado em `remove` acima para ações administrativas destrutivas.
  const runStagnationScanNow = useCallback(async () => {
    if (
      !window.confirm(
        'Rodar agora a varredura de estagnação para TODAS as organizações? Isso reavalia imediatamente as automações de "Lead estagnado" já configuradas, sem esperar o cron diário (03:17).',
      )
    ) {
      return;
    }
    setScanningStagnation(true);
    try {
      const result = await automationsApi.runStagnationScan();
      toast.success(
        `Varredura concluída: ${result.automationsEvaluated} automação(ões) avaliada(s), ${result.leadsScanned} lead(s) examinado(s), ${result.fired} disparo(s)${
          result.failures > 0 ? `, ${result.failures} falha(s)` : ''
        }.`,
      );
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setScanningStagnation(false);
    }
  }, [load]);

  return (
    <div className="flex-1 overflow-y-auto bg-bg p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 border-b border-line pb-6">
          <div className="flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center ${accent.bgSoft} ${accent.text}`}
            >
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-ink">Automações</h1>
              <p className="text-sm text-ink-2">
                {loading
                  ? 'Carregando…'
                  : `${items.length} regra${items.length === 1 ? '' : 's'} · ${items.filter((a) => a.enabled).length} ativa(s)`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void runStagnationScanNow()}
                disabled={scanningStagnation}
                title='Reavalia agora as automações de "Lead estagnado" para todas as organizações, sem esperar o cron diário'
              >
                {scanningStagnation ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Rodar varredura de estagnação agora
              </Button>
            )}
            {canManage && (
              <Button type="button" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4 mr-2" /> Nova automação
              </Button>
            )}
          </div>
        </div>

        <ColdCallStatusCard />

        {loading && (
          <Card padding="lg" className="text-center text-ink-2 text-sm">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> Carregando…
          </Card>
        )}

        {error && !loading && (
          <Card padding="lg" className="text-center">
            <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-warning-active dark:text-warning" />
            <p className="text-sm text-ink-2 mb-4">{error}</p>
            <Button type="button" variant="outline" onClick={() => void load()}>
              Tentar novamente
            </Button>
          </Card>
        )}

        {!loading && !error && items.length === 0 && (
          <Card padding="lg" className="text-center border-dashed">
            <Zap className="w-12 h-12 mx-auto mb-4 text-ink-2" />
            <h3 className="text-lg font-semibold text-ink mb-1">Nenhuma automação ainda</h3>
            <p className="text-sm text-ink-2 max-w-md mx-auto mb-5">
              Regras disparam sozinhas quando um lead é criado, muda de etapa ou uma atividade é
              concluída — avisando a equipe ou agendando o follow-up.
            </p>
            {canManage && (
              <Button type="button" onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4 mr-2" /> Criar a primeira
              </Button>
            )}
          </Card>
        )}

        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} padding="sm" className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-ink truncate">{item.name}</p>
                  <span
                    className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      item.enabled
                        ? 'bg-ok/15 text-ok-active dark:text-ok'
                        : 'bg-surface-2 text-ink-2'
                    }`}
                  >
                    {item.enabled ? 'ativa' : 'pausada'}
                  </span>
                </div>
                <p className="text-xs text-ink-2 mt-0.5">{describeAutomation(item)}</p>
                <p className="text-[11px] text-ink-2 mt-0.5">
                  {item.runCount === 0
                    ? 'ainda não disparou'
                    : `${item.runCount} execução(ões)${item.lastRunAt ? ` · última em ${new Date(item.lastRunAt).toLocaleDateString('pt-BR')}` : ''}`}
                </p>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDryRunTarget(item)}
                      title="Simular esta regra antes de confiar nela"
                      aria-label={`Simular automação ${item.name}`}
                      className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-line/50 transition-colors"
                    >
                      <FlaskConical className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setVersionsTarget(item)}
                      title="Ver histórico de versões desta regra"
                      aria-label={`Ver histórico de versões de ${item.name}`}
                      className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-line/50 transition-colors"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingItem(item)}
                      title="Editar automação"
                      aria-label={`Editar automação ${item.name}`}
                      className="p-2 rounded-lg text-ink-2 hover:text-ink hover:bg-line/50 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => void toggle(item)}
                  disabled={!canManage}
                  role="switch"
                  aria-checked={item.enabled}
                  aria-label={`${item.enabled ? 'Pausar' : 'Ativar'} ${item.name}`}
                  className={`w-10 h-5 rounded-full transition-colors relative disabled:opacity-40 disabled:cursor-not-allowed ${
                    item.enabled ? accent.bg : 'bg-surface-2 border border-line'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                      item.enabled ? 'left-[22px]' : 'left-0.5'
                    }`}
                  />
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => void remove(item)}
                    disabled={busyId === item.id}
                    title="Remover automação"
                    className="p-2 rounded-lg text-ink-2 hover:text-danger-active dark:hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-40"
                  >
                    {busyId === item.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {creating && (
        <AutomationForm
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      )}

      {editingItem && (
        <AutomationForm
          editing={editingItem}
          onCancel={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            void load();
          }}
        />
      )}

      <AutomationDryRunDialog automation={dryRunTarget} onClose={() => setDryRunTarget(null)} />
      <AutomationVersionsDialog
        automation={versionsTarget}
        onClose={() => setVersionsTarget(null)}
      />
    </div>
  );
}
