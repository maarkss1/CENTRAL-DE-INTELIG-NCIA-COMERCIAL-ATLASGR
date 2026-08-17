import { AlertTriangle } from 'lucide-react';

/**
 * Mostra explicitamente por que uma ferramenta não está trazendo resultado — nunca deixa uma lista
 * vazia falar sozinha (AGENTS.md da pasta Prospecção: "Não ocultar falha de provider").
 */
export function NotConfiguredBanner({ envVar }: { envVar: string }) {
    return (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-warn/30 bg-warn/10 text-amber-600 dark:text-amber-400 text-xs">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <p>
                Esta integração não está configurada neste ambiente. Defina{' '}
                <code className="font-mono bg-surface-2 px-1 py-0.5 rounded">{envVar}</code> e{' '}
                <code className="font-mono bg-surface-2 px-1 py-0.5 rounded">PROSPECTING_PROVIDER_MODE=hybrid</code>{' '}
                para habilitá-la.
            </p>
        </div>
    );
}
