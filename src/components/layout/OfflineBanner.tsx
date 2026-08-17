import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

/**
 * Indicador persistente de perda de conectividade — ver
 * `.agents/handoffs/onda-8/09-para-02-offline-stale-state-ausente.md`. Sem isto, dado já
 * carregado na tela (dashboard, CRM, listas) continua sendo exibido como se fosse atual mesmo
 * depois do dispositivo perder conexão, sem nenhuma indicação de que a informação pode estar
 * desatualizada — bloqueador #6 do AGENTS.md por extensão ("dados fictícios/desatualizados
 * apresentados como reais").
 *
 * Fica montado em fluxo normal (não `position: fixed`) no topo de `MainLayout`, acima de
 * Sidebar/Topbar, empurrando o conteúdo para baixo em vez de sobrepor — uma faixa fixa por cima
 * cobriria parte da busca/notificações do Topbar. `role="status"`/`aria-live="polite"` mantido
 * sempre montado (só o conteúdo entra/sai) para leitor de tela anunciar tanto o aparecimento
 * quanto o desaparecimento da mensagem.
 */
export function OfflineBanner() {
    const isOnline = useOnlineStatus();

    return (
        <div role="status" aria-live="polite" className="shrink-0">
            <AnimatePresence initial={false}>
                {!isOnline && (
                    <motion.div
                        key="offline-banner"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        className="overflow-hidden bg-warn/15 border-b border-warn/40"
                    >
                        <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold text-ink">
                            <WifiOff className="w-4 h-4 shrink-0 text-ink" aria-hidden="true" />
                            <span>Sem conexão — os dados exibidos podem estar desatualizados.</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
