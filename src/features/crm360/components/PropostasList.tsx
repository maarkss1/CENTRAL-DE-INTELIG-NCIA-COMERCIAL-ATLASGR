import { useEffect, useMemo, useState } from 'react';
import { FileText, Plus, Search, WifiOff } from 'lucide-react';
import { EmptyState } from '../../../components/ui/EmptyState';
import { clientLogger } from '../../../lib/clientLogger';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import { crm360Api } from '../crm360.api';
import type { CrmCommercialDocument } from '../crm360.types';
import { PropostaDetail } from './PropostaDetail';
import { PropostaForm } from './PropostaForm';

type DocumentStatus = CrmCommercialDocument['status'];
type DocumentType = CrmCommercialDocument['type'];

const STATUS_OPTIONS: DocumentStatus[] = [
  'Rascunho',
  'Enviado',
  'Visualizado',
  'Aceito',
  'Recusado',
  'Vencido',
  'Pago',
  'Cancelado',
];
const TYPE_OPTIONS: DocumentType[] = ['Orcamento', 'Proposta', 'Fatura', 'Contrato'];

const STATUS_STYLES: Record<DocumentStatus, string> = {
  Rascunho: 'bg-surface-2 text-ink-2 border-line',
  Enviado: 'bg-info/10 text-info-active dark:text-info border-info/20',
  Visualizado: 'bg-info/10 text-info-active dark:text-info border-info/20',
  Aceito: 'bg-success/10 text-success-active dark:text-success border-success/20',
  Recusado: 'bg-danger/10 text-danger-active dark:text-danger border-danger/20',
  Vencido: 'bg-warn/10 text-warn-active dark:text-warn border-warn/20',
  Pago: 'bg-success/10 text-success-active dark:text-success border-success/20',
  Cancelado: 'bg-surface-2 text-ink-2 border-line',
};

export function PropostasList() {
  const { currentUser } = useAuth();
  // POST/PUT /documents exigem ADMIN/GESTOR/CLOSER/SDR no backend (`writeRoles`,
  // crm360.routes.ts) — antes desta correção, PropostasList/PropostaDetail/PropostaForm não
  // faziam nenhuma checagem de papel, então um VISUALIZADOR via os controles de escrita
  // normalmente e só recebia um 403 do backend ao tentar (achado real, mesmo padrão já corrigido
  // em Knowledge Base/Automations/Playbook/Document Editor).
  const canWrite =
    !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);
  const [documents, setDocuments] = useState<CrmCommercialDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inputValue, setInputValue] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<DocumentType | ''>('');

  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<CrmCommercialDocument | null>(null);

  // Espera o usuário parar de digitar antes de filtrar — mesmo padrão de debounce já usado em
  // CompanyList.tsx/ContactList.tsx (a busca aqui é client-side, sem parâmetro de texto na API
  // de /api/crm/documents, mas o debounce evita recalcular o filtro a cada tecla mesmo assim).
  useEffect(() => {
    const timer = window.setTimeout(() => setSearchTerm(inputValue), 300);
    return () => window.clearTimeout(timer);
  }, [inputValue]);

  const load = () => {
    setLoading(true);
    setError(null);
    crm360Api
      .listDocuments()
      .then(setDocuments)
      .catch((err) => {
        clientLogger.error({ err }, 'Falha ao carregar documentos comerciais');
        setError(err instanceof Error ? err.message : 'Falha ao carregar documentos.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return documents.filter((doc) => {
      if (statusFilter && doc.status !== statusFilter) return false;
      if (typeFilter && doc.type !== typeFilter) return false;
      if (
        term &&
        !doc.number.toLowerCase().includes(term) &&
        !doc.title.toLowerCase().includes(term)
      )
        return false;
      return true;
    });
  }, [documents, searchTerm, statusFilter, typeFilter]);

  const selectedDocument = selectedDocumentId
    ? (documents.find((d) => d.id === selectedDocumentId) ?? null)
    : null;

  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  if (selectedDocument) {
    return (
      <div className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8">
        <div className="max-w-6xl mx-auto">
          <PropostaDetail
            document={selectedDocument}
            onBack={() => setSelectedDocumentId(null)}
            onEdit={() => {
              setEditingDocument(selectedDocument);
              setIsFormOpen(true);
            }}
            onChanged={load}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-bg text-ink p-6 md:p-8 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-surface p-6 rounded-3xl border border-line">
          <div>
            <h1 className="text-3xl font-extrabold text-ink flex items-center gap-3 tracking-tight">
              📄 Propostas & Documentos
              <span className="text-xs bg-surface-2 text-brand-active dark:text-brand-2 border border-brand/30 px-3 py-1 rounded-full font-bold">
                {documents.length}
              </span>
            </h1>
            <p className="text-ink-2 text-sm mt-1">
              Orçamentos, propostas, faturas e contratos — com versionamento e assinatura
              eletrônica.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => {
                setEditingDocument(null);
                setIsFormOpen(true);
              }}
              className="flex items-center gap-2 bg-brand-active hover:brightness-110 text-white px-5 py-2.5 rounded-2xl font-bold transition-all shadow-lg shadow-brand/20 active:scale-95 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              Novo Documento
            </button>
          )}
        </div>

        <div className="bg-surface p-4 rounded-2xl border border-line shadow-lg flex flex-col sm:flex-row gap-3 items-center">
          <div className="relative flex-1 w-full">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-2" />
            <input
              type="text"
              placeholder="Buscar por número ou título..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-surface-2 border border-line text-ink placeholder-ink-2 rounded-xl focus:ring-2 focus:ring-brand/30 focus:border-brand transition-all outline-none text-sm"
            />
          </div>
          <select
            aria-label="Filtrar por tipo de documento"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DocumentType | '')}
            className="w-full sm:w-auto px-3 py-2.5 bg-surface-2 border border-line text-ink rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">Todos os tipos</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as DocumentStatus | '')}
            className="w-full sm:w-auto px-3 py-2.5 bg-surface-2 border border-line text-ink rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="">Todos os status</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="p-16 text-center bg-surface rounded-3xl border border-line flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-ink-2 font-medium text-sm">Carregando documentos comerciais...</p>
          </div>
        ) : error ? (
          <div className="bg-surface border border-line rounded-3xl p-8">
            <EmptyState
              title="Não foi possível carregar os documentos"
              description={error}
              actionLabel="Tentar novamente"
              onAction={load}
              icon={<WifiOff className="w-10 h-10 text-brand" />}
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-surface border border-line rounded-3xl p-8">
            {documents.length === 0 ? (
              <EmptyState
                title="Nenhum documento comercial ainda"
                description="Crie um orçamento, proposta, fatura ou contrato para começar."
                actionLabel={canWrite ? 'Novo Documento' : undefined}
                onAction={
                  canWrite
                    ? () => {
                        setEditingDocument(null);
                        setIsFormOpen(true);
                      }
                    : undefined
                }
                icon={<FileText className="w-10 h-10 text-brand" />}
              />
            ) : (
              <EmptyState
                title="Nenhum documento encontrado"
                description="Ajuste os filtros ou o termo de busca."
                icon={<Search className="w-10 h-10 text-brand" />}
              />
            )}
          </div>
        ) : (
          <div className="bg-surface rounded-3xl border border-line overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-ink-2 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left p-4 font-bold">Número</th>
                    <th className="text-left p-4 font-bold">Título</th>
                    <th className="text-left p-4 font-bold">Tipo</th>
                    <th className="text-left p-4 font-bold">Vinculado</th>
                    <th className="text-left p-4 font-bold">Status</th>
                    <th className="text-right p-4 font-bold">Total</th>
                    <th className="text-right p-4 font-bold">Emitido em</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDocumentId(doc.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDocumentId(doc.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Ver detalhes de ${doc.title || doc.number}`}
                      className="border-t border-line hover:bg-surface-2/60 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                    >
                      <td className="p-4 font-semibold text-ink">{doc.number}</td>
                      <td className="p-4 text-ink max-w-xs truncate">{doc.title}</td>
                      <td className="p-4 text-ink-2">{doc.type}</td>
                      <td className="p-4 text-ink-2">
                        {doc.company?.tradeName || doc.lead?.title || '—'}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${STATUS_STYLES[doc.status]}`}
                        >
                          {doc.status}
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-ink">
                        {money.format(doc.total)}
                      </td>
                      <td className="p-4 text-right text-ink-2">
                        {new Date(doc.issueDate).toLocaleDateString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {isFormOpen && (
        <PropostaForm
          document={editingDocument}
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
