import { useCallback, useEffect, useState } from 'react';
import { featureFlagsApi, type ResolvedFeatureFlag } from '../features/feature-flags/featureFlags.api';

// Cache in-memory compartilhado entre todos os componentes que usam este hook na mesma aba —
// evita um GET /api/feature-flags redundante por componente montado (BugReportButton +
// eventualmente o painel de Settings). Não usa react-query (dependência já presente no
// package.json mas sem QueryClientProvider montado em lugar nenhum do app hoje — introduzir o
// provider só para isto seria escopo maior do que o necessário; ver seção 11 do CLAUDE.md sobre
// não adicionar dependência sem necessidade real).
let cache: ResolvedFeatureFlag[] | null = null;
let inFlight: Promise<ResolvedFeatureFlag[]> | null = null;

async function fetchFlags(): Promise<ResolvedFeatureFlag[]> {
    if (!inFlight) {
        inFlight = featureFlagsApi.list()
            .then((flags) => {
                cache = flags;
                return flags;
            })
            .finally(() => {
                inFlight = null;
            });
    }
    return inFlight;
}

/** Chamado depois de alterar um override em Settings, para que o próximo componente que ler o
 *  flag (ex.: BugReportButton) veja o valor novo sem precisar de reload da página. */
export function invalidateFeatureFlagsCache(): void {
    cache = null;
}

export function useFeatureFlags() {
    const [flags, setFlags] = useState<ResolvedFeatureFlag[] | null>(cache);
    const [isLoading, setIsLoading] = useState(!cache);

    const load = useCallback(() => {
        setIsLoading(true);
        fetchFlags()
            .then((f) => setFlags(f))
            .catch(() => setFlags((prev) => prev ?? []))
            .finally(() => setIsLoading(false));
    }, []);

    const refetch = useCallback(() => {
        invalidateFeatureFlagsCache();
        load();
    }, [load]);

    useEffect(() => {
        if (cache) {
            setFlags(cache);
            setIsLoading(false);
            return;
        }
        load();
    }, [load]);

    return { flags: flags ?? [], isLoading, refetch };
}

/**
 * @param fallback valor assumido enquanto a lista ainda carrega, ou se a chave não existir no
 * catálogo. Default `true` — fail-open, o oposto do fail-closed usado no backend
 * (featureFlags.service.ts#isEnabled): aqui é só uma flag de exibição de UI não-crítica, e uma
 * falha de rede não deve esconder silenciosamente um botão que já devia estar visível.
 */
export function useFeatureFlag(key: string, fallback = true): boolean {
    const { flags, isLoading } = useFeatureFlags();
    if (isLoading) return fallback;
    const flag = flags.find((f) => f.key === key);
    return flag ? flag.enabled : fallback;
}
