import { useEffect, useState } from 'react';

/**
 * Detecta conectividade do cliente via `navigator.onLine` + eventos `online`/`offline` do
 * `window`. Funciona tanto no browser quanto no WebView do Capacitor (Android/iOS) sem exigir
 * nenhum plugin nativo — `navigator.onLine`/os eventos `online`/`offline` já existem dentro de
 * qualquer WebView moderno. Detecção mais fina de qualidade de rede (ex.: "conectado mas lento")
 * exigiria o plugin `@capacitor/network`, fora de escopo aqui — ver
 * `.agents/handoffs/onda-8/09-para-02-offline-stale-state-ausente.md`.
 *
 * SSR-safe: assume `true` (online) até o efeito rodar no cliente, evitando "Sem conexão" piscar
 * em falso durante hidratação.
 */
export function useOnlineStatus(): boolean {
    const [isOnline, setIsOnline] = useState(
        () => typeof navigator === 'undefined' || navigator.onLine
    );

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Reconfere no mount: o listener sozinho não cobre o caso em que a conectividade mudou
        // entre o render inicial (SSR/primeira pintura) e o efeito montar.
        setIsOnline(navigator.onLine);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
}
