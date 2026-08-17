import { useState } from 'react';
import { Bot, Sparkles, Brain, Cpu, Database, Network, Power, ChevronDown, Check, Terminal, Copy, Download, Sliders, Zap, Code2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';

const PROVIDERS = [
    { id: 'groq', name: 'Groq Cloud (Llama Fast)', models: ['llama3-70b-8192', 'llama3-8b-8192'] },
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'gpt-4-turbo'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku'] },
    { id: 'google', name: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash-exp'] },
    { id: 'deepseek', name: 'DeepSeek AI', models: ['deepseek-r1', 'deepseek-v3', 'deepseek-coder'] },
    { id: 'ollama', name: 'Local Ollama (Self-Hosted)', models: ['llama-3.3-70b', 'qwen-2.5-coder-32b', 'mistral-large-2'] }
];

const ROLES = [
    { id: 'sdr', title: 'SDR / Qualificador de Leads', desc: 'Engaja inbound, qualifica BANT e agenda reuniões.' },
    { id: 'bdr', title: 'BDR / Gerador de Outbound', desc: 'Prospecção ativa cold email, pesquisa de perfil ICP e decisão.' },
    { id: 'credit', title: 'Analista de Risco & Crédito', desc: 'Valida CNPJ, score fiscal, protestos e balanços.' },
    { id: 'cs', title: 'Customer Success (Onboarding)', desc: 'Guia novos clientes, previne churn e monitora uso.' },
    { id: 'support', title: 'Suporte Técnico N2 / Soluções', desc: 'Resolve dúvidas técnicas e integrações de API.' },
    { id: 'executive', title: 'Copiloto Comercial Executivo', desc: 'Prepara battlecards, simula negociações e cria propostas.' }
];

const TEMPERATURES = [
    { value: '0.0', label: '0.0 - Analítico & Estrito (Zero alucinação, dados fiscais/técnicos)' },
    { value: '0.2', label: '0.2 - Conservador & Preciso (E-mails formais e qualificação)' },
    { value: '0.5', label: '0.5 - Equilibrado (Conversação humana fluida e natural)' },
    { value: '0.8', label: '0.8 - Persuasivo & Criativo (Copywriting, pitch de vendas)' },
    { value: '1.0', label: '1.0 - Exploratório / Brainstorm (Ideias de abordagem)' }
];

const MEMORIES = [
    { id: 'pgvector-rag', title: 'pgvector + RAG Vetorial (Recomendado)', desc: 'Acesso instantâneo a playbooks, produtos e histórico do CRM.' },
    { id: 'redis-session', title: 'Redis Memory (Sessão Curta)', desc: 'Mantém o contexto durante a conversa ativa do lead.' },
    { id: 'crm-history', title: 'CRM Full Context Window', desc: 'Injeta últimas 20 interações do lead no prompt.' },
    { id: 'ephemeral', title: 'Sem Memória (Stateless)', desc: 'Respostas isoladas ultrarrápidas sem histórico.' }
];

const TOOLS_LIST = [
    { id: 'scraping', name: 'Web Scraping & Enriquecimento CNPJ' },
    { id: 'python_exec', name: 'Sandbox Python (Execução de Cálculos)' },
    { id: 'powershell_exec', name: 'PowerShell System Admin Runner' },
    { id: 'crm_sync', name: 'Sincronização Bitrix24 / CRM Upsert' },
    { id: 'email_dispatch', name: 'Disparo Automático de E-mails (SMTP)' }
];

export function SuperagentCreator() {
    const accent = useBrandAccent();
    const { brandInfo } = useBrand();
    const [name, setName] = useState('');
    const [provider, setProvider] = useState(PROVIDERS[0].id);
    const [model, setModel] = useState(PROVIDERS[0].models[0]);
    const [role, setRole] = useState(ROLES[0].title);
    const [temperature, setTemperature] = useState(TEMPERATURES[1].value);
    const [memory, setMemory] = useState(MEMORIES[0].id);
    const [selectedTools, setSelectedTools] = useState<string[]>(['scraping', 'crm_sync']);
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<{
        summary: string;
        systemPrompt: string;
        jsonConfig: string;
        pythonScript: string;
        powershellScript: string;
    } | null>(null);
    const [activeTabOutput, setActiveTabOutput] = useState<'prompt' | 'json' | 'python' | 'powershell'>('prompt');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');
    const [resultSource, setResultSource] = useState<'ai' | 'local'>('ai');

    const [activeDropdown, setActiveDropdown] = useState<'provider' | 'model' | 'role' | 'temp' | 'memory' | null>(null);

    const currentProviderObj = PROVIDERS.find(p => p.id === provider) || PROVIDERS[0];

    const handleProviderChange = (provId: string) => {
        setProvider(provId);
        const prov = PROVIDERS.find(p => p.id === provId);
        if (prov) {
            setModel(prov.models[0]);
        }
        setActiveDropdown(null);
    };

    const toggleTool = (toolId: string) => {
        setSelectedTools(prev => 
            prev.includes(toolId) ? prev.filter(t => t !== toolId) : [...prev, toolId]
        );
    };

    const handleCreateOffline = () => {
        setGenerating(true);
        setError('');
        const agentName = name || `${accent.brandName} SDR Alpha`;

        {
            const systemPrompt = `[SYSTEM PROMPT - ${agentName.toUpperCase()}]
Você é o Superagente de IA "${agentName}", atuando estritamente como ${role}.

# DIRETRIZES DE OPERAÇÃO
1. Provedor de LLM: ${currentProviderObj.name} | Modelo: ${model} | Temp: ${temperature}
2. Arquitetura de Memória: ${MEMORIES.find(m => m.id === memory)?.title}
3. Ferramentas Habilitadas: ${selectedTools.join(', ')}

# COMPORTAMENTO ESPERADO
- Comporte-se como um profissional sênior de alto nível.
- Analise cada input do cliente/lead identificando dores, urgência e autoridade (BANT).
- Nunca compartilhe informações confidenciais de outros clientes.
- Caso precise de dados externos, utilize as ferramentas de enriquecimento habilitadas.

# FORMATO DE SAÍDA OBRIGATÓRIO (JSON)
{
  "analise_lead": "Resumo da dor e score de oportunidade",
  "acao_recomendada": "qualificar | agendar_demo | descartar | nutrição",
  "resposta_lead": "Texto da mensagem persuasiva para o lead",
  "dados_crm_update": { "status": "string", "observacao": "string" }
}`;

            const jsonConfig = JSON.stringify({
                agent_id: `agent_${agentName.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString().slice(-4)}`,
                name: agentName,
                role: role,
                llm: {
                    provider: currentProviderObj.id,
                    model: model,
                    temperature: parseFloat(temperature),
                    max_tokens: 4096
                },
                memory: {
                    type: memory,
                    vector_db: "pgvector",
                    similarity_threshold: 0.82
                },
                tools: selectedTools,
                status: "draft",
                requires_review_before_deploy: true,
                created_at: new Date().toISOString()
            }, null, 2);

            const pythonScript = `import os
import json
import logging
from typing import Dict, Any

# Script Autogerado para Provisionamento do Superagente: ${agentName}
# Provedor: ${currentProviderObj.name} (${model})

logging.basicConfig(level=logging.INFO, format="%(asctime)s - [%(levelname)s] - %(message)s")

class ${agentName.replace(/[^a-zA-Z0-9]/g, '')}Agent:
    def __init__(self):
        self.name = "${agentName}"
        self.model = "${model}"
        self.temperature = ${temperature}
        self.tools = ${JSON.stringify(selectedTools)}
        logging.info(f"Superagente '{self.name}' inicializado com sucesso via {currentProviderObj.name}.")

    def process_lead(self, lead_data: Dict[str, Any]) -> Dict[str, Any]:
        logging.info(f"Processando lead: {lead_data.get('company_name', 'Desconhecido')}")
        # Lógica de integração LLM
        return {
            "status": "REVIEW_REQUIRED",
            "agent": self.name,
            "recommended_action": "Review output before any external action"
        }

if __name__ == "__main__":
    agent = ${agentName.replace(/[^a-zA-Z0-9]/g, '')}Agent()
    sample_lead = {"company_name": "Logística Brasil S/A", "cnpj": "12.345.678/0001-90"}
    res = agent.process_lead(sample_lead)
    print(json.dumps(res, indent=2))
`;

            const powershellScript = `<#
.SYNOPSIS
    Script PowerShell de Provisionamento e HealthCheck do Superagente ${agentName}
.DESCRIPTION
    Inicializa o runtime local do agente e valida conectividade com o LLM Engine.
#>

$ErrorActionPreference = "Stop"
$AgentName = "${agentName}"
$Model = "${model}"
$Provider = "${currentProviderObj.name}"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host " PROVISIONANDO SUPERAGENTE: $AgentName " -ForegroundColor Green
Write-Host " Engine: $Provider | Modelo: $Model " -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Cyan

function Test-AgentEngine {
    param([string]$Name)
    Write-Host "[+] Testando canal de comunicação para $Name..." -ForegroundColor Gray
    Start-Sleep -Seconds 1
    return @{
        Status = "DRAFT_VALIDATED"
        RequiresReview = $true
        MemoryEngine = "${memory}"
        ActiveToolsCount = ${selectedTools.length}
    }
}

$status = Test-AgentEngine -Name $AgentName
$status | ConvertTo-Json -Depth 3
`;

            setResult({
                summary: `Modelo local do projeto "${agentName}" gerado; revisão e implantação ainda são necessárias.\nEngine alvo: ${currentProviderObj.name} (${model})\nPapel: ${role}\nTemperatura: ${temperature}\nMemória: ${memory}`,
                systemPrompt,
                jsonConfig,
                pythonScript,
                powershellScript
            });
            setResultSource('local');
            setGenerating(false);
        }
    };

    const handleCreate = async () => {
        setGenerating(true);
        setError('');
        setResult(null);
        const agentName = name.trim() || `${brandInfo.name} SDR Alpha`;
        try {
            const response = await api.post<{
                result: {
                    summary: string;
                    systemPrompt: string;
                    jsonConfig: string;
                    pythonScript: string;
                    powershellScript: string;
                };
            }>('/api/intelligence/studio', {
                kind: 'superagent',
                brand: { name: brandInfo.name, description: brandInfo.description },
                inputs: {
                    name: agentName,
                    provider: currentProviderObj.name,
                    model,
                    role,
                    temperature: Number(temperature),
                    memory: MEMORIES.find(item => item.id === memory)?.title || memory,
                    tools: selectedTools.map(toolId => TOOLS_LIST.find(item => item.id === toolId)?.name || toolId),
                },
            }, { timeoutMs: 90_000 });
            setResult(response.result);
            setResultSource('ai');
            setCopied(false);
        } catch (generationError) {
            setError(generationError instanceof Error ? generationError.message : 'Não foi possível gerar o projeto do agente.');
        } finally {
            setGenerating(false);
        }
    };

    const handleCopyCurrent = () => {
        if (!result) return;
        let textToCopy = '';
        if (activeTabOutput === 'prompt') textToCopy = result.systemPrompt;
        if (activeTabOutput === 'json') textToCopy = result.jsonConfig;
        if (activeTabOutput === 'python') textToCopy = result.pythonScript;
        if (activeTabOutput === 'powershell') textToCopy = result.powershellScript;

        navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadCurrent = () => {
        if (!result) return;
        let content = '';
        let filename = '';
        const safeName = (name || 'superagent').toLowerCase().replace(/\s+/g, '_');

        if (activeTabOutput === 'prompt') {
            content = result.systemPrompt;
            filename = `${safeName}_system_prompt.txt`;
        } else if (activeTabOutput === 'json') {
            content = result.jsonConfig;
            filename = `${safeName}_config.json`;
        } else if (activeTabOutput === 'python') {
            content = result.pythonScript;
            filename = `${safeName}_agent.py`;
        } else if (activeTabOutput === 'powershell') {
            content = result.powershellScript;
            filename = `${safeName}_deploy.ps1`;
        }

        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
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
                {/* Background ambient lighting */}
                <div className={`absolute top-0 right-0 w-[600px] h-[600px] ${accent.blobA} rounded-full blur-[150px] pointer-events-none -mt-40 -mr-40`}></div>
                <div className={`absolute bottom-0 left-0 w-[500px] h-[500px] ${accent.blobB} rounded-full blur-[120px] pointer-events-none -mb-40 -ml-40`}></div>

                <div className="relative z-10 flex flex-col items-center text-center mb-10">
                    <motion.div
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className={`w-20 h-20 rounded-[2rem] bg-gradient-to-br ${accent.gradient} border border-white/20 flex items-center justify-center mb-6 ${accent.glow}`}
                    >
                        <Bot size={40} className="text-white" />
                    </motion.div>
                    <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-2 border border-line ${accent.text} mb-4 backdrop-blur-md`}>
                        <Network size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Multi-Agent AI Engine Builder</span>
                    </div>
                    <h3 className="text-4xl font-black text-ink mb-4 tracking-tight">
                        {accent.brandName} <span className={`text-transparent bg-clip-text bg-gradient-to-r ${accent.gradient}`}>Fábrica de Superagentes</span>
                    </h3>
                    <p className="text-sm text-ink-2 max-w-2xl leading-relaxed">
                        Configure e versione agentes autônomos com motores neurais avançados. Defina provedor, modelo, temperatura, memória RAG e ferramentas executáveis.
                    </p>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-8">
                    
                    {/* Campo 1: Identificação */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md">
                        <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.textSoft}`}>
                            <Bot size={14} /> Nome e Identificação do Agente
                        </p>
                        <input
                            type="text"
                            placeholder="Ex: SDR Alpha Outbound, Insight Bot..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className={`w-full bg-transparent text-ink text-lg placeholder-ink-2 focus:outline-none border-b border-line focus:${accent.border} transition-colors pb-2`}
                        />
                    </div>

                    {/* Campo 2: Papel / Função */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.textSoft}`}>
                            <Brain size={14} /> Papel & Especialidade (Role)
                        </p>
                        <button
                            onClick={() => setActiveDropdown(activeDropdown === 'role' ? null : 'role')}
                            className={`w-full bg-transparent text-ink text-lg focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors`}
                        >
                            <span className="truncate">{role}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'role' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden max-h-64 overflow-y-auto"
                                >
                                    {ROLES.map(r => (
                                        <button
                                            type="button"
                                            key={r.id} onClick={() => { setRole(r.title); setActiveDropdown(null); }}
                                            className="w-full text-left px-5 py-3.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex flex-col border-b border-line last:border-none"
                                        >
                                            <div className="flex justify-between items-center font-bold text-ink w-full">
                                                {r.title} {role === r.title && <Check size={16} className={accent.text} />}
                                            </div>
                                            <span className="text-xs text-ink-2 mt-0.5">{r.desc}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Campo 3: Provedor de IA */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-sky-400">
                            <Cpu size={14} /> Provedor de IA (Engine Provider)
                        </p>
                        <button
                            onClick={() => setActiveDropdown(activeDropdown === 'provider' ? null : 'provider')}
                            className="w-full bg-transparent text-ink text-lg focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left hover:border-sky-400/50 transition-colors"
                        >
                            <span className="truncate">{currentProviderObj.name}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <p className="mt-2 text-[10px] text-ink-2">Alvo do projeto; a implantação exige a credencial desse provedor.</p>
                        <AnimatePresence>
                            {activeDropdown === 'provider' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {PROVIDERS.map(p => (
                                        <button
                                            type="button"
                                            key={p.id} onClick={() => handleProviderChange(p.id)}
                                            className="w-full text-left px-5 py-3 text-sm font-medium text-ink-2 hover:bg-sky-900/30 hover:text-white cursor-pointer flex justify-between items-center"
                                        >
                                            {p.name} {provider === p.id && <Check size={16} className="text-sky-400" />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Campo 4: Modelo Cognitivo */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.textSoft}`}>
                            <Brain size={14} /> Modelo Cognitivo Específico
                        </p>
                        <button
                            onClick={() => setActiveDropdown(activeDropdown === 'model' ? null : 'model')}
                            className={`w-full bg-transparent text-ink text-lg focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors`}
                        >
                            <span className="truncate">{model}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <p className="mt-2 text-[10px] text-ink-2">O Groq configurado gera os artefatos; este modelo será usado pelo agente implantado.</p>
                        <AnimatePresence>
                            {activeDropdown === 'model' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {currentProviderObj.models.map(m => (
                                        <button
                                            type="button"
                                            key={m} onClick={() => { setModel(m); setActiveDropdown(null); }}
                                            className="w-full text-left px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex justify-between items-center"
                                        >
                                            {m} {model === m && <Check size={16} className={accent.text} />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Campo 5: Temperatura / Criatividade */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-amber-400">
                            <Sliders size={14} /> Temperatura / Criatividade do Motor
                        </p>
                        <button
                            onClick={() => setActiveDropdown(activeDropdown === 'temp' ? null : 'temp')}
                            className="w-full bg-transparent text-ink text-sm focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left hover:border-amber-400/50 transition-colors"
                        >
                            <span className="truncate">{TEMPERATURES.find(t => t.value === temperature)?.label}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'temp' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {TEMPERATURES.map(t => (
                                        <button
                                            type="button"
                                            key={t.value} onClick={() => { setTemperature(t.value); setActiveDropdown(null); }}
                                            className="w-full text-left px-5 py-3 text-xs font-medium text-ink-2 hover:bg-amber-900/30 hover:text-white cursor-pointer flex justify-between items-center"
                                        >
                                            {t.label} {temperature === t.value && <Check size={16} className="text-amber-400" />}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Campo 6: Memória / RAG */}
                    <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
                        <p className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-emerald-400">
                            <Database size={14} /> Arquitetura de Memória & RAG
                        </p>
                        <button
                            onClick={() => setActiveDropdown(activeDropdown === 'memory' ? null : 'memory')}
                            className="w-full bg-transparent text-ink text-sm focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left hover:border-emerald-400/50 transition-colors"
                        >
                            <span className="truncate">{MEMORIES.find(m => m.id === memory)?.title}</span> <ChevronDown size={16} className="text-ink-2 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'memory' && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {MEMORIES.map(m => (
                                        <button
                                            type="button"
                                            key={m.id} onClick={() => { setMemory(m.id); setActiveDropdown(null); }}
                                            className="w-full text-left px-5 py-3 text-xs font-medium text-ink-2 hover:bg-emerald-900/30 hover:text-white cursor-pointer flex flex-col gap-0.5"
                                        >
                                            <div className="flex justify-between items-center font-bold text-ink w-full">
                                                {m.title} {memory === m.id && <Check size={16} className="text-emerald-400" />}
                                            </div>
                                            <span className="text-[11px] text-ink-2">{m.desc}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                </div>

                {/* Seleção de Ferramentas / Capabilities */}
                <div className="relative z-10 max-w-5xl mx-auto mb-10 bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md">
                    <p className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-4 ${accent.textSoft}`}>
                        <Zap size={14} /> Ferramentas & Capabilities Habilitadas para o Agente
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {TOOLS_LIST.map(t => {
                            const isSelected = selectedTools.includes(t.id);
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => toggleTool(t.id)}
                                    className={`px-4 py-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                                        isSelected
                                        ? `${accent.selectedBg} text-white`
                                        : 'bg-surface-2 border-line text-ink-2 hover:border-line hover:text-ink'
                                    }`}
                                >
                                    <span>{t.name}</span>
                                    {isSelected && <Check size={14} className="text-white shrink-0" />}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Botão de Geração */}
                <div className="relative z-10 flex justify-center">
                    <button
                        onClick={handleCreate}
                        disabled={generating}
                        className={`group relative flex items-center justify-center gap-3 bg-gradient-to-r ${accent.gradientVia} text-white px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden ${accent.glow}`}
                    >
                        {generating && (
                            <motion.div 
                                animate={{ rotate: 360 }} 
                                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                className="absolute inset-0 border-2 border-white/50 rounded-full border-t-transparent border-l-transparent"
                            />
                        )}
                        {generating ? (
                            <Cpu size={18} className="animate-pulse" />
                        ) : (
                            <Power size={18} className="group-hover:scale-110 transition-transform" />
                        )}
                        {generating ? 'Projetando Superagente...' : 'Gerar Projeto de Superagente'}
                    </button>
                </div>
                {error && (
                    <div role="alert" className="relative z-10 mx-auto mt-5 flex max-w-3xl flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between">
                        <span className="flex items-start gap-2">
                            <AlertCircle size={18} className="mt-0.5 shrink-0" />
                            {error}
                        </span>
                        <button
                            type="button"
                            onClick={handleCreateOffline}
                            className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/15"
                        >
                            Usar modelo local
                        </button>
                    </div>
                )}
            </motion.div>

            {/* Resultado do Provisionamento */}
            <AnimatePresence>
                {result && !generating && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gray-900 border border-white/10 rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden"
                    >
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[80px] pointer-events-none -mt-20 -mr-20"></div>
                        
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 relative z-10 border-b border-white/10 pb-6">
                            <div>
                                <h4 className="font-black text-2xl text-emerald-400 flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.2)]">
                                        <Sparkles size={20} />
                                    </div>
                                    Projeto de Superagente Gerado
                                </h4>
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                    <p className="text-xs text-gray-400 font-mono">{result.summary.split('\n')[0]}</p>
                                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${resultSource === 'ai' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
                                        {resultSource === 'ai' ? 'GERADO POR IA' : 'MODELO LOCAL'}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleCopyCurrent}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                                        copied 
                                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                                        : 'bg-white/10 text-gray-300 hover:bg-white/20 border border-white/10'
                                    }`}
                                >
                                    {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar</>}
                                </button>
                                <button
                                    onClick={handleDownloadCurrent}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider ${accent.bgSoft} ${accent.textSoft} ${accent.hoverBg} border ${accent.borderSoft} transition-all`}
                                >
                                    <Download size={14} /> Baixar Artefato
                                </button>
                            </div>
                        </div>

                        {/* Seletor de Abas de Output */}
                        <div className="flex items-center gap-2 mb-4 relative z-10 overflow-x-auto pb-2">
                            <button
                                onClick={() => setActiveTabOutput('prompt')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTabOutput === 'prompt'
                                    ? `${accent.solidBg} text-white shadow-lg`
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                <Brain size={14} /> System Prompt (IA)
                            </button>
                            <button
                                onClick={() => setActiveTabOutput('json')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTabOutput === 'json'
                                    ? 'bg-slate-600 text-white shadow-lg'
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                <Code2 size={14} /> Manifest (JSON)
                            </button>
                            <button
                                onClick={() => setActiveTabOutput('python')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTabOutput === 'python' 
                                    ? 'bg-sky-600 text-white shadow-lg' 
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                <Terminal size={14} /> Python Deploy Script
                            </button>
                            <button
                                onClick={() => setActiveTabOutput('powershell')}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                                    activeTabOutput === 'powershell' 
                                    ? 'bg-blue-600 text-white shadow-lg' 
                                    : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                <Terminal size={14} /> PowerShell Runtime
                            </button>
                        </div>

                        {/* Display do Código */}
                        <div className="relative z-10 bg-black/80 p-6 rounded-2xl border border-white/10 backdrop-blur-md font-mono text-sm leading-relaxed overflow-x-auto text-emerald-300 custom-scrollbar max-h-96">
                            <pre className="whitespace-pre-wrap">
                                {activeTabOutput === 'prompt' && result.systemPrompt}
                                {activeTabOutput === 'json' && result.jsonConfig}
                                {activeTabOutput === 'python' && result.pythonScript}
                                {activeTabOutput === 'powershell' && result.powershellScript}
                            </pre>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
