import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Filter,
  Loader2,
  Pencil,
  Plus,
  Search,
  Target,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { EmptyState } from '../../../components/ui/EmptyState';
import { playbookApi, type QualificationMatrixItem } from '../playbook.api';
import { QualificationItemForm } from './QualificationItemForm';
import { clientLogger } from '../../../lib/clientLogger';
import { toast } from '../../../lib/toast';

export function QualificationMatrixPage() {
  const { activeBrand, brandInfo } = useBrand();
  const [items, setItems] = useState<QualificationMatrixItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedSegment, setSelectedSegment] = useState('todos');
  const [selectedPersona, setSelectedPersona] = useState('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<QualificationMatrixItem | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    playbookApi
      .listQualifications(activeBrand)
      .then(setItems)
      .catch((err) => {
        clientLogger.error({ err }, 'Falha ao carregar Matriz de Qualificação');
        setError(err instanceof Error ? err.message : 'Falha ao carregar a matriz.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [activeBrand]);

  const segments = useMemo(
    () => Array.from(new Set(items.map((item) => item.segment))).sort(),
    [items],
  );
  const personas = useMemo(
    () => Array.from(new Set(items.map((item) => item.persona))).sort(),
    [items],
  );
  const filtered = items.filter((item) => {
    if (selectedSegment !== 'todos' && item.segment !== selectedSegment) return false;
    if (selectedPersona !== 'todos' && item.persona !== selectedPersona) return false;
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      const haystack =
        `${item.questionText} ${item.idealAnswer} ${item.framework} ${item.questionCategory}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleDelete = async (item: QualificationMatrixItem) => {
    if (!confirm('Excluir esta pergunta da matriz?')) return;
    try {
      await playbookApi.deleteQualification(item.id);
      toast.success('Pergunta excluída.');
      load();
    } catch (err) {
      clientLogger.error({ err }, 'Falha ao excluir pergunta da matriz');
      toast.error(err instanceof Error ? err.message : 'Falha ao excluir a pergunta.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-transparent p-6 sm:p-8 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <h1 className="text-4xl font-black tracking-tight text-ink flex items-center gap-3">
              <Target className="text-brand" size={32} /> Matriz de Qualificação
            </h1>
            <p className="text-ink-2 text-sm font-medium">
              {items.length} pergunta{items.length !== 1 ? 's' : ''} de diagnóstico
              (SPIN/BANT/MEDDPICC) para {brandInfo.name}, com o sinal ideal de resposta esperado.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingItem(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-2 bg-brand-active hover:brightness-110 text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand/20 active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-5 h-5" /> Nova Pergunta
          </button>
        </div>

        <div className="bg-surface/80 p-4 rounded-2xl border border-line flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-ink flex items-center gap-1.5 shrink-0">
            <Filter size={14} className="text-brand" /> Filtros
          </span>
          <div className="relative flex-1 min-w-[200px]">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-2 pointer-events-none"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por palavra-chave..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface-2 text-ink text-xs font-semibold border border-line focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <select
            aria-label="Filtrar por segmento"
            value={selectedSegment}
            onChange={(e) => setSelectedSegment(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-2 text-ink text-xs font-semibold border border-line focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="todos">Todos os Segmentos</option>
            {segments.map((seg) => (
              <option key={seg} value={seg}>
                {seg}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por persona"
            value={selectedPersona}
            onChange={(e) => setSelectedPersona(e.target.value)}
            className="px-3 py-2 rounded-xl bg-surface-2 text-ink text-xs font-semibold border border-line focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="todos">Todas as Personas</option>
            {personas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="text-[11px] text-ink-2 ml-auto">{filtered.length} resultado(s)</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 text-ink-2 text-sm py-16">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando matriz de qualificação...
          </div>
        ) : error ? (
          <EmptyState
            title="Não foi possível carregar a matriz"
            description={error}
            actionLabel="Tentar novamente"
            onAction={load}
            icon={<WifiOff className="w-10 h-10 text-brand" />}
          />
        ) : (
          <div className="space-y-4">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-sm text-ink-2 bg-surface/60 rounded-2xl border border-dashed border-line">
                {items.length === 0
                  ? 'Nenhuma pergunta cadastrada ainda para esta marca.'
                  : 'Nenhuma pergunta encontrada para os filtros selecionados.'}
              </div>
            ) : (
              filtered.map((item) => (
                <div
                  key={item.id}
                  className="bg-surface/80 p-6 rounded-2xl border border-line space-y-3 shadow-sm"
                >
                  <div className="flex items-center justify-between pb-3 border-b border-line flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-brand/15 text-brand-active dark:text-brand-2 font-bold">
                        {item.framework} · {item.questionCategory}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-info/15 text-info-active dark:text-info font-bold">
                        {item.persona}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleCopy(item.questionText, item.id)}
                        className="text-xs text-ink-2 hover:text-ink flex items-center gap-1.5"
                      >
                        {copiedKey === item.id ? (
                          <Check size={14} className="text-success-active dark:text-success" />
                        ) : (
                          <Copy size={14} />
                        )}
                        {copiedKey === item.id ? 'Copiado' : 'Copiar'}
                      </button>
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setIsFormOpen(true);
                        }}
                        className="text-xs text-ink-2 hover:text-ink flex items-center gap-1.5"
                        aria-label="Editar pergunta"
                      >
                        <Pencil size={14} /> Editar
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-xs text-danger-active dark:text-danger hover:text-danger/80 flex items-center gap-1.5"
                        aria-label="Excluir pergunta"
                      >
                        <Trash2 size={14} /> Excluir
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-black text-sm text-ink mb-1">
                      Pergunta de Diagnóstico ({item.segment})
                    </h3>
                    <p className="text-ink text-sm font-semibold">{item.questionText}</p>
                  </div>

                  <div className="p-4 rounded-xl bg-surface-2 border border-line">
                    <span className="text-[10px] font-black uppercase tracking-wider text-info-active dark:text-info block mb-1">
                      Resposta Ideal / Sinal de Fit
                    </span>
                    <p className="text-sm text-ink-2 leading-relaxed">{item.idealAnswer}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {isFormOpen && (
        <QualificationItemForm
          item={editingItem}
          defaultBrand={activeBrand}
          onClose={() => setIsFormOpen(false)}
          onSave={() => {
            setIsFormOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}
