import { useState, type FormEvent } from 'react';
import { Bug } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { useBrand } from '../../contexts/BrandContext';
import { useFeatureFlag } from '../../hooks/useFeatureFlags';
import { bugReportApi, type BugReportSeverity } from '../../features/bug-reports/bugReport.api';
import { toast } from '../../lib/toast';

const SEVERITY_OPTIONS: Array<{ value: BugReportSeverity; label: string }> = [
    { value: 'LOW', label: 'Baixa — incômodo visual, não trava o trabalho' },
    { value: 'MEDIUM', label: 'Média — atrapalha, mas dá pra contornar' },
    { value: 'HIGH', label: 'Alta — travou uma tarefa' },
    { value: 'CRITICAL', label: 'Crítica — perdi dados ou não consigo usar o sistema' },
];

/**
 * Botão flutuante global (item 8 da governança de 12 requisitos — Módulo de Reportar
 * Problemas). Captura contexto técnico automaticamente (URL, user agent, viewport, últimos logs
 * — ver bugReport.api.ts#buildContext) para reduzir o quanto o usuário precisa descrever à mão.
 *
 * Sem indicador pulsante/contínuo de propósito, ao contrário de AtlasChatbotTrigger: aquele ping
 * comunica "o copiloto está disponível agora" (um estado real que muda); este botão não tem
 * estado equivalente para comunicar, então uma animação contínua aqui seria só decorativa (ver
 * CLAUDE.md, seção 8 — motion sem propósito).
 */
export function BugReportButton() {
    const [isOpen, setIsOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<BugReportSeverity>('MEDIUM');
    const { activeBrand } = useBrand();

    const isVisible = useFeatureFlag('bug_report_module', true);

    if (!isVisible) return null;

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setSeverity('MEDIUM');
    };

    const handleClose = () => {
        if (isSubmitting) return;
        setIsOpen(false);
        resetForm();
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !description.trim()) return;

        setIsSubmitting(true);
        try {
            await bugReportApi.create({ title, description, severity, brand: activeBrand });
            toast.success('Relato enviado. Obrigado por avisar!');
            setIsOpen(false);
            resetForm();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Não foi possível enviar o relato.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            {/* Empilhado ACIMA do AtlasChatbotTrigger (bottom-6 right-6), não no canto oposto:
                este app tem telas de conteúdo full-bleed (o Kanban do CRM ocupa a largura/altura
                inteiras da área de conteúdo, drag-and-drop incluído) — um botão flutuante novo
                num canto ainda não ocupado por nenhum widget arrisca sobrepor uma área de
                interação real (foi exatamente o que quebrou tests/e2e/crm-kanban.spec.ts quando
                este botão estava em bottom-6 left-6). A faixa vertical à direita (chatbot + voz)
                já convive com o board sem esse problema. */}
            <div className="fixed bottom-24 right-6 z-[900]">
                <button
                    onClick={() => setIsOpen(true)}
                    aria-label="Reportar um problema"
                    className="group relative flex items-center justify-center w-12 h-12 rounded-2xl bg-surface text-ink-2 hover:text-ink hover:scale-110 active:scale-95 transition-all duration-300 border border-line shadow-card cursor-pointer"
                >
                    <Bug className="w-5 h-5" />
                    <div className="absolute right-14 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-surface text-ink text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-xl border border-line">
                        Reportar problema
                    </div>
                </button>
            </div>

            {/* Montado só quando aberto — mesmo padrão de FloatingChatbook em AtlasChatbotTrigger.tsx.
                Diferente daquele caso, este botão é global (MainLayout, toda tela do app): o
                <dialog> do Dialog compartilhado ficaria sempre no DOM mesmo fechado se renderizado
                incondicionalmente, o que apareceu na varredura axe-core de Configurações (só ela
                não tinha nenhum outro <Dialog> montado antes) como violação de contraste/nome
                acessível do botão de fechar — evitado não montando a árvore do dialog fechado. */}
            {isOpen && (
                <Dialog
                    isOpen={isOpen}
                    onClose={handleClose}
                    title="Reportar um problema"
                    preventClose={isSubmitting}
                    footer={
                        <>
                            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                                Cancelar
                            </Button>
                            <Button type="submit" form="bug-report-form" disabled={isSubmitting}>
                                {isSubmitting ? 'Enviando…' : 'Enviar relato'}
                            </Button>
                        </>
                    }
                >
                    <form id="bug-report-form" onSubmit={handleSubmit} className="space-y-4">
                        <p className="text-xs text-ink-2">
                            URL, navegador e os últimos avisos técnicos desta aba são anexados automaticamente —
                            você só precisa descrever o que aconteceu.
                        </p>

                        <div>
                            <label htmlFor="bug-report-title" className="block text-sm font-bold text-ink mb-1.5">
                                Título
                            </label>
                            <input
                                id="bug-report-title"
                                type="text"
                                required
                                maxLength={200}
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ex.: Botão de salvar não responde na tela de Leads"
                                className="w-full rounded-card border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            />
                        </div>

                        <div>
                            <label htmlFor="bug-report-description" className="block text-sm font-bold text-ink mb-1.5">
                                O que aconteceu?
                            </label>
                            <textarea
                                id="bug-report-description"
                                required
                                maxLength={5000}
                                rows={4}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="O que você esperava que acontecesse, e o que aconteceu de fato"
                                className="w-full rounded-card border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand resize-none"
                            />
                        </div>

                        <div>
                            <label htmlFor="bug-report-severity" className="block text-sm font-bold text-ink mb-1.5">
                                Gravidade
                            </label>
                            <select
                                id="bug-report-severity"
                                value={severity}
                                onChange={(e) => setSeverity(e.target.value as BugReportSeverity)}
                                className="w-full rounded-card border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                            >
                                {SEVERITY_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                            </select>
                        </div>
                    </form>
                </Dialog>
            )}
        </>
    );
}
