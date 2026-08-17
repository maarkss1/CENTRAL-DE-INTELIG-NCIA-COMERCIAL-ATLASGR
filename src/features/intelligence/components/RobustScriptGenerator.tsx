import { useState } from 'react';
import { Code2, Terminal, TerminalSquare, Copy, Sparkles, CheckCircle2, Globe, Braces, Layers, ChevronDown, Check, Download, ShieldCheck, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';

const LANGUAGES = [
    { id: 'prompt', label: 'Prompt de Sistema IA (System Prompt)', ext: 'txt' },
    { id: 'python', label: 'Python 3.11+ (Script Robusto Async)', ext: 'py' },
    { id: 'powershell', label: 'PowerShell 7+ (Windows/Linux Admin)', ext: 'ps1' },
    { id: 'typescript', label: 'Node.js / TypeScript (ESM & TypeSafe)', ext: 'ts' },
    { id: 'bash', label: 'Bash Script (Linux / Docker)', ext: 'sh' }
];

const PURPOSES = [
    { id: 'b2b_agent', title: 'Agente Autônomo B2B', desc: 'Processa leads, qualifica BANT e responde objeções.' },
    { id: 'scraping', title: 'Extração de Dados Web (Scraping)', desc: 'Raspa dados de páginas web, lida com paginação e salva em JSON.' },
    { id: 'api_integration', title: 'Integração de APIs REST & Webhooks', desc: 'Conecta serviços externos com autenticação Bearer e retries.' },
    { id: 'etl_data', title: 'Limpeza & Tratamento de Dados (ETL)', desc: 'Lê CSV/Excel, normaliza CNPJ/e-mails e filtra inconsistências.' },
    { id: 'cron_tasks', title: 'Automação de Filas & Tarefas Cron', desc: 'Executa rotinas periódicas de manutenção e monitoramento.' },
    { id: 'sdr_outreach', title: 'Prospecção Outbound & Disparo SDR', desc: 'Monta cadências e-mail/WhatsApp hiperpersonalizadas.' }
];

const FRAMEWORKS = [
    { id: 'native', label: 'Sem Framework (Puro / Standard Lib Nativa)' },
    { id: 'langchain', label: 'LangChain / LlamaIndex / CrewAI (Para IA)' },
    { id: 'pandas', label: 'Pandas / Polars (Para Análise de Dados)' },
    { id: 'powershell_mod', label: 'PowerShell Custom Modules & Pester' },
    { id: 'fastapi', label: 'FastAPI / Express (Para Servidores)' }
];

const COMPLEXITIES = [
    { id: 'basic', label: 'Básico (Boilerplate minimalista e rápido)' },
    { id: 'medium', label: 'Intermediário (Tratamento de exceções e respostas)' },
    { id: 'production', label: 'Avançado / Produção (Blindagem Total: Retries, Logs, Env Vars, Exception Handling)' }
];

export function RobustScriptGenerator() {
    const accent = useBrandAccent();
    const { brandInfo } = useBrand();
    const [language, setLanguage] = useState(LANGUAGES[0].id);
    const [purpose, setPurpose] = useState(PURPOSES[0].id);
    const [framework, setFramework] = useState(FRAMEWORKS[0].id);
    const [complexity, setComplexity] = useState(COMPLEXITIES[2].id);
    const [customContext, setCustomContext] = useState('');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [resultSource, setResultSource] = useState<'ai' | 'local'>('ai');

    const [activeDropdown, setActiveDropdown] = useState<'language' | 'purpose' | 'framework' | 'complexity' | null>(null);

    const selectedLangObj = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];
    const selectedPurposeObj = PURPOSES.find(p => p.id === purpose) || PURPOSES[0];
    const selectedFrameworkObj = FRAMEWORKS.find(f => f.id === framework) || FRAMEWORKS[0];
    const selectedComplexityObj = COMPLEXITIES.find(c => c.id === complexity) || COMPLEXITIES[2];


    const handleGenerate = async () => {
        setGenerating(true);
        setError('');
        setResult(null);
        try {
            const response = await api.post<{ result: { content: string } }>('/api/intelligence/studio', {
                kind: 'script',
                brand: { name: brandInfo.name, description: brandInfo.description },
                inputs: {
                    language: selectedLangObj.label,
                    purpose: `${selectedPurposeObj.title}: ${selectedPurposeObj.desc}`,
                    framework: selectedFrameworkObj.label,
                    complexity: selectedComplexityObj.label,
                    customContext,
                },
            }, { timeoutMs: 90_000 });
            setResult(response.result.content);
            setResultSource('ai');
            setCopied(false);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar o artefato.');
        } finally {
            setGenerating(false);
        }
    };

    const handleCopy = () => {
        if (result) {
            navigator.clipboard.writeText(result);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleDownload = () => {
        if (!result) return;
        const filename = `script_${purpose}_${language}.${selectedLangObj.ext}`;
        const blob = new Blob([result], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-8">
            <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden border border-line text-ink"
            >
                {/* Background effects */}
                <div className={`absolute top-0 right-0 w-[500px] h-[500px] ${accent.blobA} rounded-full blur-[100px] pointer-events-none -mt-40 -mr-40`}></div>
                <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] ${accent.blobB} rounded-full blur-[100px] pointer-events-none -mb-40 -ml-40`}></div>

                <div className="relative z-10 flex flex-col items-center text-center mb-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className={`w-20 h-20 rounded-[2rem] bg-gradient-to-br ${accent.gradient} border border-white/20 flex items-center justify-center mb-6 ${accent.glow}`}
                    >
                        <TerminalSquare size={40} className="text-white" />
                    </motion.div>
                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${accent.bgSofter} border ${accent.borderSoft} ${accent.text} mb-4 backdrop-blur-md`}>
                        <Code2 size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Developer Studio & Prompt Lab</span>
                    </div>
                    <h3 className="text-4xl font-black text-ink mb-4 tracking-tight">
                        {accent.brandName} <span className={`text-transparent bg-clip-text bg-gradient-to-r ${accent.gradient}`}>Gerador de Prompts e Scripts Robustos</span>
                    </h3>
                    <p className="text-sm text-ink-2 max-w-2xl leading-relaxed">
                        Compile artefatos prontos para produção em Python, PowerShell, TypeScript e System Prompts blindados com retries, logs e tratamento de erros.
                    </p>
                </div>

                {/* Quick Presets */}
                <div className="relative z-10 max-w-5xl mx-auto mb-6 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-[11px] font-bold text-ink-2 uppercase tracking-wider mr-1">Presets Prontos:</span>
                    <button
                        type="button"
                        onClick={() => {
                            setLanguage('python');
                            setPurpose('scraping');
                            setFramework('native');
                            setComplexity('production');
                            setCustomContext('Extração assíncrona de CNPJs, razão social e situação cadastral com rate-limiting e rotação de headers.');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-ink-2 hover:text-ink border border-line transition-all cursor-pointer font-medium"
                    >
                        🐍 Scraping CNPJ Async
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setLanguage('typescript');
                            setPurpose('b2b_agent');
                            setFramework('langchain');
                            setComplexity('production');
                            setCustomContext('Agente SDR autônomo com LangGraph, qualificação BANT e disparos condicionais de e-mail/WhatsApp.');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-ink-2 hover:text-ink border border-line transition-all cursor-pointer font-medium"
                    >
                        🤖 SDR com LangGraph (TS)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setLanguage('powershell');
                            setPurpose('cron_tasks');
                            setFramework('powershell_mod');
                            setComplexity('production');
                            setCustomContext('Auditoria de endpoints de IA, health probe e rotação segura de credenciais com log JSON estruturado.');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-ink-2 hover:text-ink border border-line transition-all cursor-pointer font-medium"
                    >
                        🛡️ Health Probe (PowerShell)
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setLanguage('prompt');
                            setPurpose('sdr_outreach');
                            setFramework('native');
                            setComplexity('production');
                            setCustomContext('System Prompt para qualificação de risco logístico com zero alucinação e contrato JSON rígido de saída.');
                        }}
                        className="text-xs px-3 py-1.5 rounded-xl bg-surface-2 hover:bg-surface text-ink-2 hover:text-ink border border-line transition-all cursor-pointer font-medium"
                    >
                        🎯 System Prompt SDR
                    </button>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-6">
                    
                    {/* Linguagem */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}>
                            <Braces size={14} /> Stack Tecnológico / Linguagem
                        </p>
                        <button
                            type="button"
                            onClick={() => setActiveDropdown(activeDropdown === 'language' ? null : 'language')}
                            className={`w-full bg-transparent text-ink text-lg focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors cursor-pointer`}
                        >
                            <span className="truncate">{selectedLangObj.label}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'language' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {LANGUAGES.map(l => (
                                        <button
                                            type="button"
                                            key={l.id} onClick={() => { setLanguage(l.id); setActiveDropdown(null); }}
                                            className="w-full px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex justify-between items-center text-left"
                                        >
                                            {l.label} {language === l.id && <Check size={16} className={accent.text} />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Propósito */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}>
                            <Globe size={14} /> Vetor de Propósito / Funcionalidade
                        </p>
                        <button
                            type="button"
                            onClick={() => setActiveDropdown(activeDropdown === 'purpose' ? null : 'purpose')}
                            className={`w-full bg-transparent text-ink text-lg focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors cursor-pointer`}
                        >
                            <span className="truncate">{selectedPurposeObj.title}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'purpose' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden max-h-60 overflow-y-auto"
                                >
                                    {PURPOSES.map(p => (
                                        <button
                                            type="button"
                                            key={p.id} onClick={() => { setPurpose(p.id); setActiveDropdown(null); }}
                                            className="w-full px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex flex-col gap-0.5 border-b border-line last:border-none text-left"
                                        >
                                            <div className="flex justify-between items-center font-bold text-ink w-full">
                                                {p.title} {purpose === p.id && <Check size={16} className={accent.text} />}
                                            </div>
                                            <span className="text-xs text-ink-2">{p.desc}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Framework */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}>
                            <Layers size={14} /> Abordagem & Framework
                        </p>
                        <button
                            type="button"
                            onClick={() => setActiveDropdown(activeDropdown === 'framework' ? null : 'framework')}
                            className={`w-full bg-transparent text-ink text-sm focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors cursor-pointer`}
                        >
                            <span className="truncate">{selectedFrameworkObj.label}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'framework' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {FRAMEWORKS.map(f => (
                                        <button
                                            type="button"
                                            key={f.id} onClick={() => { setFramework(f.id); setActiveDropdown(null); }}
                                            className="w-full px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex justify-between items-center text-left"
                                        >
                                            {f.label} {framework === f.id && <Check size={16} className={accent.text} />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Complexidade */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}>
                            <ShieldCheck size={14} /> Nível de Resiliência & Complexidade
                        </p>
                        <button
                            type="button"
                            onClick={() => setActiveDropdown(activeDropdown === 'complexity' ? null : 'complexity')}
                            className={`w-full bg-transparent text-ink text-sm focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors cursor-pointer`}
                        >
                            <span className="truncate">{selectedComplexityObj.label}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'complexity' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {COMPLEXITIES.map(c => (
                                        <button
                                            type="button"
                                            key={c.id} onClick={() => { setComplexity(c.id); setActiveDropdown(null); }}
                                            className="w-full px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex justify-between items-center text-left"
                                        >
                                            {c.label} {complexity === c.id && <Check size={16} className={accent.text} />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Instruções Adicionais */}
                <div className="relative z-10 max-w-5xl mx-auto mb-8 bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md">
                    <p className="block text-[10px] tracking-widest font-black uppercase mb-2 text-ink-2">
                        Contexto ou Regras Personalizadas (Opcional)
                    </p>
                    <input
                        type="text"
                        placeholder="Ex: Utilizar token Bearer no header, salvar logs no diretório C:\Logs, etc..."
                        value={customContext}
                        onChange={(e) => setCustomContext(e.target.value)}
                        className={`w-full bg-transparent text-ink text-sm placeholder-ink-2 focus:outline-none border-b border-line focus:${accent.border} transition-colors pb-2`}
                    />
                </div>

                <div className="relative z-10 flex justify-center">
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className={`group relative flex items-center justify-center gap-3 bg-gradient-to-r ${accent.gradient} text-white px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${accent.glow}`}
                    >
                        {generating && (
                            <motion.div 
                                animate={{ rotate: 360 }} 
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 border-2 border-white/50 rounded-full border-t-transparent border-l-transparent"
                            />
                        )}
                        {generating ? (
                            <Terminal size={18} className="animate-pulse" />
                        ) : (
                            <Sparkles size={18} className="group-hover:scale-110 transition-transform" />
                        )}
                        {generating ? 'Compilando Artefato...' : 'Gerar Prompt / Script Robusto'}
                    </button>
                </div>
                {error && (
                    <div role="alert" className="relative z-10 mx-auto mt-5 flex max-w-3xl flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-start gap-2">
                            <AlertCircle size={18} className="mt-0.5 shrink-0" />
                            {error}
                        </span>
                    </div>
                )}
            </motion.div>

            <AnimatePresence>
                {result && !generating && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#0D1117] border border-[#30363D] rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden group"
                    >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b border-[#30363D] pb-4">
                            <div className="flex items-center gap-3 text-slate-400 text-xs font-mono uppercase tracking-widest">
                                <TerminalSquare size={16} className={accent.text} />
                                {selectedLangObj.label} OUTPUT
                                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${resultSource === 'ai' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                    {resultSource === 'ai' ? 'GERADO POR IA' : 'MODELO LOCAL'}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleCopy}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                                        copied 
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                                        : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
                                    }`}
                                >
                                    {copied ? <><CheckCircle2 size={14} /> Copiado</> : <><Copy size={14} /> Copiar Código</>}
                                </button>
                                <button
                                    onClick={handleDownload}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider ${accent.bgSoft} ${accent.textSoft} ${accent.hoverBg} border ${accent.borderSoft} transition-all`}
                                >
                                    <Download size={14} /> Baixar Script
                                </button>
                            </div>
                        </div>

                        {/* Código style MacOS window */}
                        <div className="bg-[#010409] rounded-2xl border border-[#30363D] p-6 shadow-inner relative">
                            <div className="absolute top-4 left-4 flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                                <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                                <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                            </div>
                            <pre className="text-[13px] md:text-sm text-sky-300 whitespace-pre-wrap font-mono overflow-x-auto custom-scrollbar leading-loose mt-8 max-h-[500px]">
                                {result}
                            </pre>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
