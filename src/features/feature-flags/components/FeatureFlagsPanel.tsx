import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useFeatureFlags } from '../../../hooks/useFeatureFlags';
import { featureFlagsApi, type ResolvedFeatureFlag } from '../featureFlags.api';
import { toast } from '../../../lib/toast';

/** Switch acessível mínimo (role="switch") — não há um primitivo Switch em src/components/ui/
 *  hoje; introduzir um componente genérico novo só para este único uso seria antecipar reuso que
 *  ainda não existe (ver design-system/SKILL.md sobre não duplicar/inflar o sistema de tokens à
 *  toa). Se um segundo caller aparecer, promover para src/components/ui/Switch.tsx faz sentido. */
function FlagSwitch({ checked, disabled, onChange, label }: { checked: boolean; disabled?: boolean; onChange: () => void; label: string }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={onChange}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${checked ? 'bg-brand' : 'bg-surface border border-line'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`}
                aria-hidden="true"
            />
        </button>
    );
}

/**
 * Painel de administração de Feature Flags (item 7 da governança de 12 requisitos — Loja de
 * Apps / Feature Flags). Só liga/desliga o override da PRÓPRIA organização do ADMIN logado —
 * nunca o default global do catálogo (ver featureFlags.service.ts sobre por que essa distinção
 * existe). Renderizado dentro de Settings.tsx, condicionado a `isAdmin`.
 */
export function FeatureFlagsPanel() {
    const { flags, isLoading, refetch } = useFeatureFlags();
    const [pendingKey, setPendingKey] = useState<string | null>(null);

    const handleToggle = async (flag: ResolvedFeatureFlag) => {
        setPendingKey(flag.key);
        try {
            await featureFlagsApi.setOverride(flag.key, !flag.enabled);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Não foi possível alterar o flag.');
        } finally {
            setPendingKey(null);
        }
    };

    const handleResetToDefault = async (flag: ResolvedFeatureFlag) => {
        setPendingKey(flag.key);
        try {
            await featureFlagsApi.clearOverride(flag.key);
            refetch();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Não foi possível restaurar o padrão.');
        } finally {
            setPendingKey(null);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Feature Flags</CardTitle>
                <CardDescription>
                    Liga/desliga funcionalidades só para esta organização, sem precisar de deploy.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {isLoading && (
                    <div className="space-y-2" role="status" aria-label="Carregando feature flags">
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                )}

                {!isLoading && flags.length === 0 && (
                    <p className="text-sm text-ink-2 p-4 text-center">Nenhum feature flag cadastrado ainda.</p>
                )}

                {!isLoading && flags.map((flag) => (
                    <div
                        key={flag.key}
                        className="flex items-center justify-between gap-4 p-4 rounded-card border border-line bg-surface-2"
                    >
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-ink font-mono">{flag.key}</p>
                                {flag.isOverridden && (
                                    <span className="text-[10px] font-bold uppercase tracking-wide text-brand bg-brand/10 px-1.5 py-0.5 rounded">
                                        Personalizado
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-ink-2 mt-0.5">{flag.description}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {flag.isOverridden && (
                                <button
                                    type="button"
                                    onClick={() => handleResetToDefault(flag)}
                                    disabled={pendingKey === flag.key}
                                    aria-label={`Restaurar padrão global de ${flag.key}`}
                                    title="Restaurar padrão global"
                                    className="p-1.5 rounded-md text-ink-2 hover:text-ink hover:bg-surface transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 cursor-pointer"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                            )}
                            <FlagSwitch
                                checked={flag.enabled}
                                disabled={pendingKey === flag.key}
                                onChange={() => handleToggle(flag)}
                                label={`Alternar ${flag.key}`}
                            />
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
