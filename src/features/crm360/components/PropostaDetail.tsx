import { useEffect, useState } from 'react';
import { ArrowLeft, Copy, ExternalLink, Loader2, Pencil, Send } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import { Select } from '../../../components/ui/Select';
import { clientLogger } from '../../../lib/clientLogger';
import { toast } from '../../../lib/toast';
import { useActiveRecord } from '../../../contexts/ActiveRecordContext';
import { useAuth } from '../../../contexts/AuthContext';
import { hasRequiredRole } from '../../../lib/auth/authorization';
import { crm360Api } from '../crm360.api';
import type { CrmCommercialDocument, CrmCommercialDocumentVersionDTO } from '../crm360.types';
import { diffProposalVersions } from './proposalVersionDiff';

type DocumentStatus = CrmCommercialDocument['status'];

/** Próximos status que fazem sentido oferecer a partir do status atual — Visualizado avança
    sozinho quando o link público é aberto (ver crm360Public.routes.ts), então não aparece como
    opção manual aqui. */
const STATUS_FLOW: Record<DocumentStatus, DocumentStatus[]> = {
  Rascunho: ['Enviado', 'Cancelado'],
  Enviado: ['Aceito', 'Recusado', 'Cancelado'],
  Visualizado: ['Aceito', 'Recusado', 'Cancelado'],
  Aceito: ['Pago', 'Cancelado'],
  Recusado: ['Cancelado'],
  Vencido: ['Cancelado'],
  Pago: [],
  Cancelado: [],
};

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

interface PropostaDetailProps {
  document: CrmCommercialDocument;
  onBack: () => void;
  onEdit: () => void;
  /** Disparado após qualquer mutação (mudança de status, solicitação de assinatura) — a lista
        pai reconsulta o backend e passa o documento atualizado de volta via prop. */
  onChanged: () => void;
}

export function PropostaDetail({ document, onBack, onEdit, onChanged }: PropostaDetailProps) {
  const { currentUser } = useAuth();
  // Mesmo gate de PropostasList.tsx — POST/PUT /documents exigem ADMIN/GESTOR/CLOSER/SDR no
  // backend (achado real: nenhum destes 3 controles de escrita tinha checagem de papel antes).
  const canWrite =
    !!currentUser && hasRequiredRole(currentUser.role, ['ADMIN', 'GESTOR', 'CLOSER', 'SDR']);
  const [versions, setVersions] = useState<CrmCommercialDocumentVersionDTO[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [nextStatus, setNextStatus] = useState<DocumentStatus | ''>('');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [signerEmail, setSignerEmail] = useState(document.contact?.email ?? '');
  const [signerName, setSignerName] = useState(document.contact?.name ?? '');
  const [requestingSignature, setRequestingSignature] = useState(false);

  useEffect(() => {
    setLoadingVersions(true);
    crm360Api
      .listDocumentVersions(document.id)
      .then(setVersions)
      .catch((err) => clientLogger.error({ err }, 'Falha ao carregar versões do documento'))
      .finally(() => setLoadingVersions(false));
  }, [document.id]);

  // Torna o copiloto de IA global ciente de qual documento comercial está aberto na tela.
  const { setActiveRecord, clearActiveRecord } = useActiveRecord();
  useEffect(() => {
    setActiveRecord({
      type: 'document',
      id: document.id,
      label: `${document.number} — ${document.title}`,
      summary: [document.type, document.status].filter(Boolean).join(' — '),
    });
    return () => clearActiveRecord(document.id);
  }, [document, setActiveRecord, clearActiveRecord]);

  const money = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: document.currency || 'BRL',
  });
  const availableNextStatuses = STATUS_FLOW[document.status] ?? [];
  const publicUrl = `${window.location.origin}/api/public/proposals/${document.publicToken}/view`;

  const handleStatusChange = async () => {
    if (!nextStatus) return;
    setUpdatingStatus(true);
    try {
      await crm360Api.updateDocumentStatus(document.id, nextStatus);
      toast.success(`Status atualizado para "${nextStatus}".`);
      setNextStatus('');
      onChanged();
    } catch (error) {
      clientLogger.error({ err: error }, 'Falha ao atualizar status do documento');
      toast.error(error instanceof Error ? error.message : 'Falha ao atualizar status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRequestSignature = async () => {
    if (!signerEmail.trim()) {
      toast.error('Informe o e-mail de quem vai assinar.');
      return;
    }
    setRequestingSignature(true);
    try {
      await crm360Api.requestSignature(document.id, {
        signerEmail: signerEmail.trim(),
        signerName: signerName.trim() || undefined,
      });
      toast.success('Solicitação de assinatura enviada.');
      onChanged();
    } catch (error) {
      clientLogger.error({ err: error }, 'Falha ao solicitar assinatura');
      toast.error(error instanceof Error ? error.message : 'Falha ao solicitar assinatura.');
    } finally {
      setRequestingSignature(false);
    }
  };

  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('Link copiado.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-surface-2 text-ink-2 hover:text-ink transition-colors"
          aria-label="Voltar para a lista"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-ink-2 font-semibold">
            {document.number} · {document.type}
          </p>
          <h2 className="text-xl font-black text-ink truncate">{document.title}</h2>
        </div>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border shrink-0 ${STATUS_STYLES[document.status]}`}
        >
          {document.status}
        </span>
        {canWrite && (
          <Button type="button" variant="ghost" onClick={onEdit} className="text-xs h-9 shrink-0">
            <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-card border border-line bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-ink-2 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left p-3 font-bold">Item</th>
                  <th className="text-right p-3 font-bold">Qtd</th>
                  <th className="text-right p-3 font-bold">Preço unit.</th>
                  <th className="text-right p-3 font-bold">Desc.</th>
                  <th className="text-right p-3 font-bold">Total</th>
                </tr>
              </thead>
              <tbody>
                {document.lineItems.map((item, idx) => (
                  <tr key={idx} className="border-t border-line">
                    <td className="p-3">
                      <p className="font-semibold text-ink">{item.name}</p>
                      {item.sku && <p className="text-xs text-ink-2">SKU {item.sku}</p>}
                    </td>
                    <td className="p-3 text-right text-ink-2">{item.quantity}</td>
                    <td className="p-3 text-right text-ink-2">{money.format(item.unitPrice)}</td>
                    <td className="p-3 text-right text-ink-2">
                      {item.discountPercent > 0 ? `${item.discountPercent}%` : '—'}
                    </td>
                    <td className="p-3 text-right font-bold text-ink">
                      {money.format(item.total ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t border-line bg-surface-2/50 flex flex-col items-end gap-1 text-sm">
              <span className="text-ink-2">
                Subtotal:{' '}
                <span className="text-ink font-semibold">{money.format(document.subtotal)}</span>
              </span>
              {document.discount > 0 && (
                <span className="text-ink-2">
                  Desconto:{' '}
                  <span className="text-ink font-semibold">-{money.format(document.discount)}</span>
                </span>
              )}
              {document.tax > 0 && (
                <span className="text-ink-2">
                  Impostos:{' '}
                  <span className="text-ink font-semibold">{money.format(document.tax)}</span>
                </span>
              )}
              <span className="text-base text-ink-2">
                Total:{' '}
                <span className="text-brand-active dark:text-brand-2 font-black">
                  {money.format(document.total)}
                </span>
              </span>
            </div>
          </div>

          {(document.notes || document.terms) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {document.notes && (
                <div className="rounded-card border border-line bg-surface p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-2 mb-2">
                    Notas internas
                  </p>
                  <p className="text-sm text-ink whitespace-pre-wrap">{document.notes}</p>
                </div>
              )}
              {document.terms && (
                <div className="rounded-card border border-line bg-surface p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-2 mb-2">
                    Termos e condições
                  </p>
                  <p className="text-sm text-ink whitespace-pre-wrap">{document.terms}</p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-card border border-line bg-surface p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-2 mb-3">
              Histórico de versões
            </p>
            {loadingVersions ? (
              <div className="flex items-center gap-2 text-ink-2 text-sm py-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            ) : versions.length === 0 ? (
              <p className="text-sm text-ink-2">Nenhuma versão registrada ainda.</p>
            ) : (
              <ul className="space-y-2">
                {versions.map((version, idx) => {
                  const previous = versions[idx + 1] ?? null;
                  const diff = diffProposalVersions(previous, version);
                  return (
                    <li
                      key={version.id}
                      className="flex items-center justify-between text-sm border-t border-line pt-2 first:border-t-0 first:pt-0"
                    >
                      <div>
                        <span className="font-semibold text-ink">
                          Versão {version.versionNumber}
                        </span>
                        <span className="text-ink-2 ml-2">
                          {new Date(version.createdAt).toLocaleString('pt-BR')}
                        </span>
                        {version.changeReason && (
                          <p className="text-xs text-ink-2">{version.changeReason}</p>
                        )}
                      </div>
                      <span
                        className={diff.totalChanged ? 'text-brand font-semibold' : 'text-ink-2'}
                      >
                        {money.format(diff.newTotal)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-line bg-surface p-4 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-2">
              Registro vinculado
            </p>
            {document.company ? (
              <p className="text-sm text-ink">🏢 {document.company.tradeName}</p>
            ) : document.lead ? (
              <p className="text-sm text-ink">🎯 {document.lead.title || 'Negócio sem título'}</p>
            ) : (
              <p className="text-sm text-ink-2">Nenhum registro vinculado.</p>
            )}
            {document.contact && <p className="text-sm text-ink-2">👤 {document.contact.name}</p>}
          </div>

          {canWrite && availableNextStatuses.length > 0 && (
            <div className="rounded-card border border-line bg-surface p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Mudar status</p>
              <Select
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as DocumentStatus)}
              >
                <option value="">Selecione…</option>
                {availableNextStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Button
                type="button"
                onClick={handleStatusChange}
                disabled={!nextStatus || updatingStatus}
                className="w-full"
              >
                {updatingStatus && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Confirmar
              </Button>
            </div>
          )}

          {canWrite && (document.status === 'Enviado' || document.status === 'Visualizado') && (
            <div className="rounded-card border border-line bg-surface p-4 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wide text-ink-2">
                Solicitar assinatura eletrônica
              </p>
              <div className="space-y-2">
                <Label htmlFor="signer-email" className="text-xs">
                  E-mail de quem assina
                </Label>
                <Input
                  id="signer-email"
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signer-name" className="text-xs">
                  Nome (opcional)
                </Label>
                <Input
                  id="signer-name"
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={handleRequestSignature}
                disabled={requestingSignature}
                className="w-full"
              >
                {requestingSignature ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Solicitar assinatura
              </Button>
            </div>
          )}

          <div className="rounded-card border border-line bg-surface p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-2">Link público</p>
            <p className="text-xs text-ink-2">
              {document.viewCount > 0
                ? `Visualizado ${document.viewCount}x`
                : 'Ainda não visualizado'}
              {document.lastViewedAt &&
                ` · última vez em ${new Date(document.lastViewedAt).toLocaleString('pt-BR')}`}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={copyPublicLink}
                className="flex-1 text-xs h-9"
              >
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Copiar link
              </Button>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="shrink-0">
                <Button type="button" variant="ghost" className="h-9 w-9 p-0">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </a>
            </div>
            <p className="text-[11px] text-ink-2">
              Retorna o JSON da API pública — ainda não existe uma página de visualização própria no
              app.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
