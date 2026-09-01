import { useEffect, useState } from 'react';
import { Download, ShieldAlert, Loader2, Search } from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { useConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { api } from '../../../lib/api';
import { contactsDB } from '../../../lib/db';
import { toast } from '../../../lib/toast';
import type { Contact } from '../../../types';

function contactLabel(contact: Contact): string {
  const company = contact.company?.tradeName || contact.company?.legalName;
  return [contact.name, company].filter(Boolean).join(' — ');
}

/**
 * `DELETE /api/lgpd/titular/:contactId` (exclusão/anonimização, LGPD Art. 18) e
 * `GET /api/lgpd/titular/:contactId/export` (portabilidade, Art. 18 V) já existiam prontas,
 * testadas ponta-a-ponta (RLS, isolamento de tenant, idempotência da anonimização), mas sem
 * NENHUM ponto de acionamento em nenhuma tela — se um titular exercesse esses direitos junto à
 * empresa, o time comercial não tinha como atender pela interface, só chamando a API manualmente
 * (achado real do Piloto 025). `requireRole(['ADMIN','GESTOR'])` no backend — mesmo gate aplicado
 * aqui na UI.
 */
export function DataSubjectRights() {
  const { confirm, dialog } = useConfirmDialog();
  const [contactSearch, setContactSearch] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState<unknown>(null);
  const [erasing, setErasing] = useState(false);

  useEffect(() => {
    if (selected || contactSearch.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      contactsDB
        .list({ search: contactSearch, limit: 6 })
        .then((res) => {
          if (!cancelled) setResults(res.data);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contactSearch, selected]);

  const reset = () => {
    setSelected(null);
    setContactSearch('');
    setExportResult(null);
  };

  const handleExport = async () => {
    if (!selected) return;
    setExporting(true);
    setExportResult(null);
    try {
      const data = await api.get<unknown>(`/api/lgpd/titular/${selected.id}/export`);
      setExportResult(data);
      toast.success('Dados do titular exportados. Registrado na trilha de auditoria.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao exportar os dados do titular.');
    } finally {
      setExporting(false);
    }
  };

  const handleErase = async () => {
    if (!selected) return;
    if (
      !(await confirm({
        title: `Excluir/anonimizar dados de "${selected.name}"`,
        description: `Excluir/anonimizar PERMANENTEMENTE os dados de "${selected.name}"? Esta ação não pode ser desfeita e remove o nome, e-mail, telefone e demais dados pessoais deste contato.`,
        confirmLabel: 'Excluir/anonimizar',
        variant: 'danger',
      }))
    )
      return;
    setErasing(true);
    try {
      await api.delete(`/api/lgpd/titular/${selected.id}`);
      toast.success(`Dados de "${selected.name}" anonimizados. Registrado na trilha de auditoria.`);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao anonimizar os dados do titular.');
    } finally {
      setErasing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-brand" />
          Direitos do Titular (LGPD Art. 18)
        </CardTitle>
        <CardDescription>
          Exportar (portabilidade) ou excluir/anonimizar (esquecimento) os dados pessoais de um
          contato específico, a pedido do titular.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <label
            htmlFor="lgpd-contact-search"
            className="block text-xs font-semibold text-ink-2 mb-1"
          >
            Contato (titular dos dados)
          </label>
          {selected ? (
            <div className="flex items-center justify-between gap-2 bg-surface-2 border border-brand/30 rounded-xl px-3 py-2.5">
              <span className="text-sm font-bold text-ink truncate">{contactLabel(selected)}</span>
              <button
                type="button"
                onClick={reset}
                className="text-xs font-semibold text-ink-2 hover:text-ink shrink-0"
              >
                Trocar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-2" />
                <input
                  id="lgpd-contact-search"
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Buscar contato por nome ou e-mail..."
                  autoComplete="off"
                  className="w-full pl-9 pr-3 py-2.5 bg-surface-2 border border-line rounded-xl text-sm text-ink placeholder-ink-2 outline-none focus:ring-1 focus:ring-brand"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-ink-2" />
                )}
              </div>
              {results.length > 0 && (
                <div className="mt-1 bg-surface border border-line rounded-xl shadow-xl max-h-48 overflow-y-auto">
                  {results.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setResults([]);
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-ink hover:bg-surface-2 transition-colors border-b border-line last:border-b-0"
                    >
                      {contactLabel(c)}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              Exportar dados
            </Button>
            <Button
              type="button"
              onClick={() => void handleErase()}
              disabled={erasing}
              className="bg-danger text-white hover:bg-danger-active"
            >
              {erasing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ShieldAlert className="w-4 h-4 mr-2" />
              )}
              Excluir/anonimizar dados
            </Button>
          </div>
        )}

        {exportResult != null && (
          <pre className="bg-surface-2 border border-line rounded-xl p-3 text-[11px] text-ink-2 overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(exportResult, null, 2)}
          </pre>
        )}
      </CardContent>
      {dialog}
    </Card>
  );
}
