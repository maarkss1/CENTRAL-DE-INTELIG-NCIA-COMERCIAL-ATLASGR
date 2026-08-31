import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { api } from '../../../lib/api';
import { toast } from '../../../lib/toast';

interface CohortRow {
  month: string;
  total: number;
  won30d: number;
  won60d: number;
}

export function CohortAnalysis() {
  const [cohortData, setCohortData] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // `api.get` já desembrulha o envelope `{success,data}` do backend — ver `apiFetch` em
    // `src/lib/api.ts`. Antes desta correção o backend devolvia `{success,cohorts}` (sem
    // `data`), então `res.data` aqui sempre resolvia `undefined` e a tela nunca mostrava nada
    // além do estado de erro, mesmo com o número fictício ainda presente no servidor.
    api
      .get<{ cohorts: CohortRow[] }>('/api/analytics/cohort')
      .then((res) => {
        setCohortData(res.cohorts || []);
      })
      .catch((err) => {
        console.error(err);
        setError('Erro ao carregar dados de cohort.');
      })
      .finally(() => setLoading(false));
  }, []);

  // `api.get`/`apiFetch` sempre chamam `response.json()` (ver `src/lib/api.ts`) — não servem
  // para baixar um arquivo cru. Mesmo padrão de `fetch` bruto + `Blob` já usado em
  // `commercialIntelligence.api.ts` → `downloadExecutiveExport`.
  const downloadCsv = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/analytics/export/csv', {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) throw new Error(`Falha ao exportar CSV (status ${response.status})`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'relatorio-cohort.csv');
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Erro ao baixar CSV:', err);
      toast.error('Não foi possível gerar o CSV. Verifique o servidor.');
    }
  };

  if (loading) return <div>Carregando cohort...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Análise de Cohort (Conversão por mês de criação)</CardTitle>
        <button
          onClick={downloadCsv}
          className="bg-brand text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-active"
        >
          Baixar CSV
        </button>
      </CardHeader>
      <CardContent>
        {cohortData.length === 0 ? (
          <div className="text-sm text-ink-2 text-center py-4">
            Nenhum dado de cohort disponível.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-2 text-ink-2">
                <tr>
                  <th className="px-4 py-2 font-semibold">Mês</th>
                  <th className="px-4 py-2 font-semibold">Leads Criados</th>
                  <th className="px-4 py-2 font-semibold">Ganhos em 30 dias</th>
                  <th className="px-4 py-2 font-semibold">Ganhos em 60 dias</th>
                </tr>
              </thead>
              <tbody>
                {cohortData.map((row) => (
                  <tr key={row.month} className="border-b border-line hover:bg-surface-2/50">
                    <td className="px-4 py-2">{row.month}</td>
                    <td className="px-4 py-2">{row.total}</td>
                    <td className="px-4 py-2">
                      {row.won30d} ({row.total > 0 ? Math.round((row.won30d / row.total) * 100) : 0}
                      %)
                    </td>
                    <td className="px-4 py-2">
                      {row.won60d} ({row.total > 0 ? Math.round((row.won60d / row.total) * 100) : 0}
                      %)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
