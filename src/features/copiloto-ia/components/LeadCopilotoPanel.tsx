import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, ArrowRight } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Skeleton } from '../../../components/ui/Skeleton';
import { copilotoIaApi } from '../copilotoIa.api';

/**
 * Seção compacta do Copiloto Comercial IA dentro do `LeadDetailDrawer` — mesmo raciocínio de
 * `WhatsAppChatPanel` ali: o CRM decide QUANDO oferecer a entrada, não COMO o módulo funciona.
 * Três chamadas independentes e silenciosas (nunca bloqueiam o resto do drawer, nunca mostram erro
 * cheio — é uma seção secundária, não a tela principal).
 */
export function LeadCopilotoPanel({ leadId }: { leadId: string }) {
  const navigate = useNavigate();
  const [conversationCount, setConversationCount] = useState<number | null>(null);
  const [latestScore, setLatestScore] = useState<number | null>(null);
  const [pendingWhatsApp, setPendingWhatsApp] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      copilotoIaApi.listConversations({ leadId }).catch(() => []),
      copilotoIaApi.getLeadDealHealth(leadId).catch(() => []),
      copilotoIaApi.getLeadWhatsAppResponseTime(leadId).catch(() => null),
    ]).then(([conversations, dealHealth, whatsapp]) => {
      if (cancelled) return;
      setConversationCount(conversations.length);
      setLatestScore(dealHealth[0]?.score ?? null);
      setPendingWhatsApp(whatsapp?.hasPendingResponse ?? false);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-ink-2 flex items-center gap-2">
        <Mic className="w-4 h-4 text-brand" /> Copiloto IA
      </h3>
      <div className="bg-surface-2/40 p-4 rounded-2xl border border-line space-y-3">
        {loading ? (
          <Skeleton className="h-6 w-full" />
        ) : (
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-ink-2">
              {conversationCount === 0
                ? 'Nenhuma conversa capturada ainda'
                : `${conversationCount} conversa${conversationCount === 1 ? '' : 's'} capturada${conversationCount === 1 ? '' : 's'}`}
            </span>
            {latestScore != null && (
              <Badge
                variant={latestScore >= 70 ? 'success' : latestScore >= 40 ? 'warning' : 'danger'}
              >
                Deal Health {latestScore}/100
              </Badge>
            )}
            {pendingWhatsApp && <Badge variant="warning">WhatsApp aguardando resposta</Badge>}
          </div>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/app/copiloto_ia?tab=conversas&leadId=${leadId}`)}
        >
          Ver histórico no Copiloto IA <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </div>
    </section>
  );
}
