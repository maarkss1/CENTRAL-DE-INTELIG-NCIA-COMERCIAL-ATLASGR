import { useState, useEffect } from 'react';
import { Building2, MapPin, Sparkles, Loader2, GitBranch, ArrowRight } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/toast.js';

export interface BranchCompanyItem {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  matrizFilial: string | null;
  situacaoCadastral: string | null;
  cnaePrincipal: string | null;
  cnaePrincipalDescricao: string | null;
  municipioNome: string | null;
  uf: string | null;
  porte: string | null;
}

interface CompanyBranchesViewProps {
  cnpj: string;
  companyName: string;
  onSelectBranch?: (cnpj: string) => void;
}

export function CompanyBranchesView({
  cnpj,
  companyName,
  onSelectBranch,
}: CompanyBranchesViewProps) {
  const [branches, setBranches] = useState<BranchCompanyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingCnpj, setApprovingCnpj] = useState<string | null>(null);

  const cnpjRoot = cnpj.replace(/\D/g, '').slice(0, 8);

  useEffect(() => {
    if (!cnpjRoot) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Busca empresas com a mesma raiz de CNPJ no catálogo
    api
      .get<{ data: BranchCompanyItem[] }>(
        `/api/companies/market-intelligence?cnpj=${cnpjRoot}&pageSize=50`,
      )
      .then((res) => {
        if (!cancelled) {
          setBranches(res.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cnpjRoot]);

  const handleApprove = async (branchCnpj: string) => {
    try {
      setApprovingCnpj(branchCnpj);
      const res = await api.post<{ message: string }>(
        `/api/companies/market-intelligence/${encodeURIComponent(branchCnpj)}/approve-to-pipeline`,
      );
      toast.success(res.message || 'Filial aprovada para o Pipeline CRM!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao aprovar filial');
    } finally {
      setApprovingCnpj(null);
    }
  };

  const matriz = branches.find((b) => b.matrizFilial === 'MATRIZ' || b.cnpj.includes('/0001-'));
  const filiais = branches.filter((b) => b !== matriz);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-ink flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-brand" /> Estrutura de Matriz & Filiais
          </h3>
          <p className="text-xs text-ink-2">
            CNPJ Raiz:{' '}
            <b className="font-mono text-ink">
              {cnpjRoot.replace(/^(\d{2})(\d{3})(\d{3})/, '$1.$2.$3')}
            </b>{' '}
            · {branches.length} unidade{branches.length !== 1 ? 's' : ''} encontrada
            {branches.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center items-center gap-2 text-xs text-ink-2">
          <Loader2 className="w-6 h-6 text-brand animate-spin" /> Carregando estrutura de filiais...
        </div>
      ) : branches.length === 0 ? (
        <div className="p-8 rounded-3xl border border-line bg-surface/50 text-center space-y-2">
          <Building2 className="mx-auto w-8 h-8 text-ink-2" />
          <p className="text-xs font-semibold text-ink">
            Nenhuma outra filial encontrada com este CNPJ Raiz.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Card da Matriz Principal */}
          {matriz && (
            <div className="p-5 rounded-3xl border-2 border-brand/30 bg-brand/5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-brand-active text-white text-[10px] font-black uppercase tracking-wider">
                      Matriz Principal
                    </span>
                    <span className="font-mono text-xs font-bold text-ink">{matriz.cnpj}</span>
                  </div>
                  <h4 className="text-sm font-black text-ink mt-1.5">{matriz.razaoSocial}</h4>
                  <p className="text-xs text-ink-2">{matriz.nomeFantasia || 'Sem nome fantasia'}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleApprove(matriz.cnpj)}
                    disabled={approvingCnpj === matriz.cnpj}
                    className="px-3 py-1.5 rounded-xl bg-brand-active text-white text-xs font-bold hover:brightness-110 flex items-center gap-1 shadow-sm transition-all disabled:opacity-50"
                  >
                    {approvingCnpj === matriz.cnpj ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    Aprovar Matriz
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-xs pt-2 border-t border-line/50 text-ink-2">
                <span className="flex items-center gap-1">
                  <MapPin size={13} className="text-brand" /> {matriz.municipioNome}/{matriz.uf}
                </span>
                <span>
                  CNAE: <b>{matriz.cnaePrincipal}</b>
                </span>
                <span>
                  Porte: <b>{matriz.porte || 'N/A'}</b>
                </span>
                <span>
                  Situação:{' '}
                  <b
                    className={
                      matriz.situacaoCadastral === 'ATIVA' ? 'text-emerald-600' : 'text-amber-600'
                    }
                  >
                    {matriz.situacaoCadastral}
                  </b>
                </span>
              </div>
            </div>
          )}

          {/* Lista de Filiais */}
          {filiais.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-ink-2">
                Filiais & Polos Regionais ({filiais.length})
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filiais.map((f) => (
                  <div
                    key={f.cnpj}
                    className="p-4 rounded-2xl border border-line bg-surface hover:border-brand/30 hover:shadow-xs transition-all space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-ink">{f.cnpj}</span>
                        <h5 className="text-xs font-bold text-ink mt-0.5 truncate max-w-[200px]">
                          {f.nomeFantasia || f.razaoSocial}
                        </h5>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-line font-bold text-ink-2">
                        Filial
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-ink-2">
                      <MapPin size={12} className="text-brand shrink-0" />
                      <span>
                        {f.municipioNome || 'Município'}/{f.uf || 'UF'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-line/50 text-xs">
                      <span
                        className={
                          f.situacaoCadastral === 'ATIVA'
                            ? 'text-emerald-600 font-bold'
                            : 'text-amber-600 font-bold'
                        }
                      >
                        {f.situacaoCadastral || 'ATIVA'}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApprove(f.cnpj)}
                          disabled={approvingCnpj === f.cnpj}
                          className="px-2.5 py-1 rounded-lg bg-brand/10 hover:bg-brand-active text-brand-active dark:text-brand-2 hover:text-white text-[11px] font-bold transition-all"
                        >
                          {approvingCnpj === f.cnpj ? 'Aprovando...' : 'Aprovar'}
                        </button>
                        {onSelectBranch && (
                          <button
                            type="button"
                            onClick={() => onSelectBranch(f.cnpj)}
                            className="p-1 rounded-lg border border-line hover:border-brand text-ink-2 hover:text-brand"
                          >
                            <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
