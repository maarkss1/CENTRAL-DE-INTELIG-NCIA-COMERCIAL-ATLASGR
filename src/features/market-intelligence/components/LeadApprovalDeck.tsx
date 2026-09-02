import { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '../../../components/ui/Card.js';
import { Button } from '../../../components/ui/Button.js';
import { Badge } from '../../../components/ui/Badge.js';
import { ThumbsUp, ThumbsDown, BrainCircuit } from 'lucide-react';
import { api } from '../../../lib/api.js';
import { toast } from '../../../lib/toast.js';

interface MarketIntelligenceCompanyRow {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnaePrincipalDescricao: string | null;
  municipioNome: string | null;
  uf: string | null;
  capitalSocial: number | null;
  icpTier: string | null;
  icpScore: number | null;
}

export function LeadApprovalDeck() {
  const [accounts, setAccounts] = useState<MarketIntelligenceCompanyRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    // Fetch top accounts (MUITO_ALTO or ALTO). marketIntelligenceService.listCompanies() devolve
    // { data: [...], pagination, filters, metadata } — o array de contas está em .data.
    api
      .get<{ data: MarketIntelligenceCompanyRow[] }>(
        '/api/companies/market-intelligence?icpMinimo=ALTO&pageSize=10',
      )
      .then((result) => {
        setAccounts(result?.data || []);
        setLoading(false);
      })
      .catch((error) => {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar o catálogo de contas.',
        );
        setLoading(false);
      });
  }, []);

  const handleAction = async (approved: boolean) => {
    const account = accounts[currentIndex];
    if (!account || submitting) return;
    setSubmitting(true);
    try {
      if (approved) {
        // Promove a conta do catálogo para o CRM via o endpoint real de criação de empresa
        // (mesmo caminho hexagonal usado pelo cadastro manual: CompanyController → CompanyUseCases
        // → PrismaCompanyRepository), em vez de só simular sucesso no estado local.
        await api.post('/api/companies', {
          legalName: account.razaoSocial,
          tradeName: account.nomeFantasia || account.razaoSocial,
          cnpj: account.cnpj,
          segment: account.cnaePrincipalDescricao ?? undefined,
          city: account.municipioNome ?? undefined,
          state: account.uf ?? undefined,
          tags: [
            'market-intelligence',
            ...(account.icpTier ? [`icp-${account.icpTier.toLowerCase()}`] : []),
          ],
          observations: `Origem: catálogo Market Intelligence (ICP ${account.icpTier ?? 'não calculado'}${account.icpScore != null ? `, score ${account.icpScore}` : ''}).`,
        });
        setFeedback(`${account.razaoSocial} foi aprovado e criado no CRM.`);
        toast.success(`${account.razaoSocial} adicionado ao CRM.`);
      } else {
        setFeedback(`${account.razaoSocial} descartado.`);
      }
      setCurrentIndex((prev) => prev + 1);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : `Não foi possível registrar a decisão para ${account.razaoSocial}.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-ink-2">Carregando IA Deck...</div>;
  if (currentIndex >= accounts.length)
    return <div className="p-8 text-center text-ink-2">Você zerou os leads de hoje! 🎉</div>;

  const account = accounts[currentIndex];

  return (
    <div className="flex flex-col items-center justify-center p-8 min-h-[600px] bg-bg">
      <h1 className="text-2xl text-ink mb-8 font-bold flex items-center gap-2">
        <BrainCircuit className="text-brand" /> LDR - Aprovação Ágil
      </h1>
      {feedback && (
        <div className="mb-4 p-3 bg-success/15 border border-success/30 text-success-active dark:text-success rounded text-sm max-w-md w-full text-center">
          {feedback}
        </div>
      )}
      <Card accentBar className="w-full max-w-md relative overflow-hidden">
        <CardHeader>
          <div className="flex justify-between items-start">
            <CardTitle className="text-xl">{account.nomeFantasia || account.razaoSocial}</CardTitle>
            <Badge variant="success">{account.icpTier || 'FIT ALTO'}</Badge>
          </div>
          <p className="text-sm text-ink-2">{account.cnpj}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-surface-2 rounded border border-line">
            <p className="text-sm text-ink">
              <strong>Capital Social:</strong> R${' '}
              {Number(account.capitalSocial || 0).toLocaleString('pt-BR')}
            </p>
            <p className="text-sm text-ink">
              <strong>Local:</strong> {account.municipioNome} - {account.uf}
            </p>
          </div>
          <div className="text-xs text-ink-2">
            {account.cnaePrincipalDescricao || 'Atividade principal não informada no snapshot.'}
            {account.icpScore != null ? ` · Score ICP ${account.icpScore}` : ''}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between gap-4 mt-4">
          <Button
            variant="destructive"
            className="w-full"
            disabled={submitting}
            onClick={() => handleAction(false)}
          >
            <ThumbsDown className="mr-2 h-4 w-4" /> Descartar
          </Button>
          <Button className="w-full" disabled={submitting} onClick={() => handleAction(true)}>
            <ThumbsUp className="mr-2 h-4 w-4" /> Aprovar
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
