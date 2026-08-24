import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/Card';
import { api } from '../../../lib/api';

export function CohortAnalysis() {
    const [cohortData, setCohortData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get('/api/analytics/cohort')
            .then((res: any) => {
                setCohortData(res.data.cohorts || []);
            })
            .catch(err => {
                console.error(err);
                setError('Erro ao carregar dados de cohort.');
            })
            .finally(() => setLoading(false));
    }, []);

    const downloadPdf = async () => {
        try {
            const res: any = await api.get('/api/analytics/export/pdf');
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'relatorio-cohort.pdf');
            document.body.appendChild(link);
            link.click();
        } catch (err) {
            console.error('Erro ao baixar PDF:', err);
            alert('Não foi possível gerar o PDF. Verifique o servidor.');
        }
    };

    if (loading) return <div>Carregando cohort...</div>;
    if (error) return <div className="text-red-500">{error}</div>;

    return (
        <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Análise de Cohort (Retenção)</CardTitle>
                <button
                    onClick={downloadPdf}
                    className="bg-brand text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-brand-active"
                >
                    Baixar PDF
                </button>
            </CardHeader>
            <CardContent>
                {cohortData.length === 0 ? (
                    <div className="text-sm text-ink-2 text-center py-4">Nenhum dado de cohort disponível.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-surface-2 text-ink-2">
                                <tr>
                                    <th className="px-4 py-2 font-semibold">Mês</th>
                                    <th className="px-4 py-2 font-semibold">Total de Negócios</th>
                                    <th className="px-4 py-2 font-semibold">Retenção (Mês 1)</th>
                                    <th className="px-4 py-2 font-semibold">Retenção (Mês 2)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cohortData.map((row, i) => (
                                    <tr key={i} className="border-b border-line hover:bg-surface-2/50">
                                        <td className="px-4 py-2">{row.month}</td>
                                        <td className="px-4 py-2">{row.total}</td>
                                        <td className="px-4 py-2">{row.month1}%</td>
                                        <td className="px-4 py-2">{row.month2}%</td>
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
