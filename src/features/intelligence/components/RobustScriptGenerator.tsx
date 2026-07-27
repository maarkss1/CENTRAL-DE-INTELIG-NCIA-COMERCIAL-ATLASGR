import { useState } from 'react';
import { Code2, Terminal, TerminalSquare, Copy, Sparkles, CheckCircle2, Globe, Braces, Layers, ChevronDown, Check, Download, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    const [language, setLanguage] = useState(LANGUAGES[0].id);
    const [purpose, setPurpose] = useState(PURPOSES[0].id);
    const [framework, setFramework] = useState(FRAMEWORKS[0].id);
    const [complexity, setComplexity] = useState(COMPLEXITIES[2].id);
    const [customContext, setCustomContext] = useState('');
    const [generating, setGenerating] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const [activeDropdown, setActiveDropdown] = useState<'language' | 'purpose' | 'framework' | 'complexity' | null>(null);

    const selectedLangObj = LANGUAGES.find(l => l.id === language) || LANGUAGES[0];
    const selectedPurposeObj = PURPOSES.find(p => p.id === purpose) || PURPOSES[0];
    const selectedFrameworkObj = FRAMEWORKS.find(f => f.id === framework) || FRAMEWORKS[0];
    const selectedComplexityObj = COMPLEXITIES.find(c => c.id === complexity) || COMPLEXITIES[2];

    const handleGenerate = () => {
        setGenerating(true);

        setTimeout(() => {
            let code = '';
            const purposeTitle = selectedPurposeObj.title;

            if (language === 'prompt') {
                code = `[SYSTEM PROMPT - ENGENHARIA DE ALTO NÍVEL]
Você é um Especialista de IA Nível Sênior atuando no vetor: ${purposeTitle}.

# OBJETIVO PRINCIPAL
Executar de forma precisa, sem desvios, a tarefa de ${purposeTitle}.
Abordagem recomendada: ${selectedFrameworkObj.label}.
Nível de resiliência esperado: ${selectedComplexityObj.label}.

# REGRAS E TRAVAS DE SEGURANÇA (GUARDRAILS)
1. CADEIA DE RACIOCÍNIO (Chain of Thought): Sempre analise os dados de entrada passo a passo antes de emitir a resposta final.
2. FORMATAÇÃO ESTRUTURADA: Responda OBRIGATORIAMENTE em JSON válido no schema especificado.
3. PRECISÃO: Nunca invente fatos ou métricas não declaradas nos dados de entrada.
4. TRATAMENTO DE EXCEÇÃO: Caso o input seja ambíguo ou incompleto, retorne no campo "status" o valor "REQUIRES_CLARIFICATION".

${customContext ? `# INSTRUÇÕES COMPLEMENTARES DO USUÁRIO\n${customContext}\n` : ''}
# FORMATO DE SAÍDA (SCHEMA JSON)
{
  "status": "SUCCESS | ERROR | REQUIRES_CLARIFICATION",
  "execucao": {
    "etapas_processadas": ["passo 1", "passo 2"],
    "resultado_principal": {},
    "confianca_score": 0.98
  },
  "logs_diagnostico": "Observações operacionais para auditoria"
}`;
            } else if (language === 'python') {
                code = `#!/usr/bin/env python3
"""
=============================================================================
PROSPECTOR ATLAS - SCRIPT ROBUSTO EM PYTHON 3.11+
Vetor: ${purposeTitle}
Framework: ${selectedFrameworkObj.label}
Complexidade: ${selectedComplexityObj.label}
=============================================================================
"""

import os
import sys
import json
import logging
import time
from typing import Dict, Any, Optional

# Configuração de Logging Estruturado para Produção
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("execution_audit.log", encoding="utf-8")
    ]
)
logger = logging.getLogger("${purpose.replace(/_/g, '.')}")

class RobustRunner:
    """Motor resiliente para execução de ${purposeTitle}."""

    def __init__(self, max_retries: int = 3, timeout_sec: int = 30):
        self.max_retries = max_retries
        self.timeout_sec = timeout_sec
        self.api_key = os.getenv("ATLAS_API_KEY", "DEFAULT_SANDBOX_KEY")
        logger.info(f"Runner inicializado para: {purposeTitle}")

    def execute_with_retry(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Executa a rotina com retries exponenciais e tratamento de erro."""
        attempt = 0
        while attempt < self.max_retries:
            attempt += 1
            try:
                logger.info(f"Tentativa {attempt}/{self.max_retries} processando dados...")
                
                # TODO: Substitua pelo seu código de negócio principal
                if not payload:
                    raise ValueError("Payload de entrada vazio.")
                
                # Simulação de processamento robusto
                result = {
                    "status": "COMPLETED",
                    "purpose": "${purposeTitle}",
                    "records_processed": len(payload.get("items", [1])),
                    "timestamp": time.time()
                }
                
                logger.info("Processamento concluído com sucesso!")
                return result

            except Exception as exc:
                logger.warning(f"Falha na tentativa {attempt}: {exc}")
                if attempt >= self.max_retries:
                    logger.error("Número máximo de tentativas atingido. Abortando.")
                    raise RuntimeError(f"Falha na execução de ${purposeTitle}: {exc}")
                sleep_time = 2 ** attempt
                logger.info(f"Aguardando {sleep_time}s antes de tentar novamente...")
                time.sleep(sleep_time)

if __name__ == "__main__":
    logger.info("Iniciando execução do script...")
    runner = RobustRunner(max_retries=3)
    data_input = {"items": ["lead_01", "lead_02"], "context": "${customContext || 'padrao'}"}
    
    try:
        output = runner.execute_with_retry(data_input)
        print(json.dumps(output, indent=2, ensure_ascii=False))
    except Exception as e:
        logger.critical(f"Erro fatal não tratado: {e}")
        sys.exit(1)
`;
            } else if (language === 'powershell') {
                code = `<#
.SYNOPSIS
    Script PowerShell 7+ Robusto para: ${purposeTitle}
.DESCRIPTION
    Desenvolvido para execução em ambientes corporativos de alto desempenho.
    Framework: ${selectedFrameworkObj.label} | Rigor: ${selectedComplexityObj.label}
.PARAMETER InputData
    Objeto de entrada para o processamento.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [hashtable]$InputData = @{ Purpose = "${purposeTitle}" },

    [Parameter(Mandatory=$false)]
    [string]$LogFilePath = "C:\\Logs\\atlas_automation.log"
)

$ErrorActionPreference = "Stop"

function Write-AuditLog {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logLine = "[$timestamp] [$Level] $Message"
    Write-Host $logLine -ForegroundColor $(switch ($Level) { "ERROR" { "Red" } "WARN" { "Yellow" } default { "Cyan" } })
}

function Invoke-RobustTask {
    Write-AuditLog "Iniciando tarefa: ${purposeTitle}..." "INFO"
    
    try {
        # Validação de Pré-requisitos
        if ($null -eq $InputData) {
            throw "Objeto InputData não pode ser nulo."
        }

        # Simulação de Execução
        $result = [PSCustomObject]@{
            Status            = "SUCCESS"
            Purpose           = "${purposeTitle}"
            ExecutedBy        = $env:USERNAME
            MachineName       = $env:COMPUTERNAME
            Timestamp         = (Get-Date).ToString("o")
            CustomInstruction = "${customContext || 'Nenhuma'}"
        }

        Write-AuditLog "Operação concluída com sucesso!" "INFO"
        return $result | ConvertTo-Json -Depth 5

    } catch {
        Write-AuditLog "FALHA CRÍTICA: $_" "ERROR"
        throw $_
    }
}

# Ponto de Entrada
Invoke-RobustTask
`;
            } else if (language === 'typescript') {
                code = `/**
 * =============================================================================
 * PROSPECTOR ATLAS - TYPESCRIPT PRODUCTION MODULE
 * Vetor: ${purposeTitle}
 * Framework: ${selectedFrameworkObj.label}
 * =============================================================================
 */

export interface ExecutionPayload {
    purpose: string;
    items?: string[];
    metadata?: Record<string, unknown>;
}

export interface ExecutionResponse {
    success: boolean;
    data?: unknown;
    error?: string;
    timestamp: string;
}

export class RobustTaskRunner {
    private readonly purpose: string = "${purposeTitle}";

    constructor(private readonly apiKey: string = process.env.ATLAS_API_KEY || "") {}

    public async execute(payload: ExecutionPayload): Promise<ExecutionResponse> {
        console.log(\`[\${new Date().toISOString()}] [INFO] Iniciando rotina: \${this.purpose}\`);

        try {
            if (!payload || !payload.purpose) {
                throw new Error("Payload inválido ou propósito não definido.");
            }

            // Simulação de processamento async resiliente
            const responseData = {
                status: "PROCESSED",
                vector: this.purpose,
                itemCount: payload.items?.length || 0,
                contextNote: "${customContext || 'Standard'}"
            };

            return {
                success: true,
                data: responseData,
                timestamp: new Date().toISOString()
            };
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(\`[\${new Date().toISOString()}] [ERROR] Falha: \${errorMessage}\`);
            return {
                success: false,
                error: errorMessage,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Exemplo de Execução
(async () => {
    const runner = new RobustTaskRunner();
    const result = await runner.execute({ purpose: "${purposeTitle}", items: ["lead_a", "lead_b"] });
    console.log(JSON.stringify(result, null, 2));
})();
`;
            } else {
                code = `#!/usr/bin/env bash
# =============================================================================
# PROSPECTOR ATLAS - BASH AUTOMATION SCRIPT
# Vetor: ${purposeTitle}
# Nível: ${selectedComplexityObj.label}
# =============================================================================

set -euo pipefail
IFS=$'\\n\\t'

# Cores para Saída
RED='\\035[0;31m'
GREEN='\\035[0;32m'
NC='\\035[0m' # No Color

log_info() {
    echo -e "\${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] [INFO] $1\${NC}"
}

log_error() {
    echo -e "\${RED}[$(date +'%Y-%m-%d %H:%M:%S')] [ERROR] $1\${NC}" >&2
}

cleanup() {
    log_info "Limpando arquivos temporários..."
}
trap cleanup EXIT

log_info "Iniciando script de automação para: ${purposeTitle}"

# Execução Principal
if command -v curl &> /dev/null; then
    log_info "curl encontrado no sistema. Pronto para requisições HTTP."
else
    log_error "curl não foi encontrado. Instale o pacote antes de prosseguir."
    exit 1
fi

log_info "Automação finalizada com êxito!"
`;
            }

            setResult(code);
            setGenerating(false);
            setCopied(false);
        }, 1200);
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
                className="bg-[#090D16] rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden border border-white/10"
            >
                {/* Background effects */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-sky-500/10 rounded-full blur-[100px] pointer-events-none -mt-40 -mr-40"></div>
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none -mb-40 -ml-40"></div>

                <div className="relative z-10 flex flex-col items-center text-center mb-10">
                    <motion.div 
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.2 }}
                        className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-sky-500 to-cyan-500 border border-white/20 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(14,165,233,0.3)]"
                    >
                        <TerminalSquare size={40} className="text-white" />
                    </motion.div>
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-4 backdrop-blur-md">
                        <Code2 size={14} />
                        <span className="text-[10px] font-black uppercase tracking-widest">Developer Studio & Prompt Lab</span>
                    </div>
                    <h3 className="text-4xl font-black text-white mb-4 tracking-tight">
                        Nexus <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-cyan-400">Gerador de Prompts e Scripts Robustos</span>
                    </h3>
                    <p className="text-sm text-slate-400 max-w-2xl leading-relaxed">
                        Compile artefatos prontos para produção em Python, PowerShell, TypeScript e System Prompts blindados com retries, logs e tratamento de erros.
                    </p>
                </div>

                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-6">
                    
                    {/* Linguagem */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md relative">
                        <label className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-sky-400">
                            <Braces size={14} /> Stack Tecnológico / Linguagem
                        </label>
                        <button 
                            onClick={() => setActiveDropdown(activeDropdown === 'language' ? null : 'language')}
                            className="w-full bg-transparent text-white text-lg focus:outline-none border-b border-white/10 pb-2 flex items-center justify-between text-left hover:border-sky-400/50 transition-colors"
                        >
                            <span className="truncate">{selectedLangObj.label}</span> <ChevronDown size={16} className="text-slate-500 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'language' && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-[#121A2F] border border-white/10 shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {LANGUAGES.map(l => (
                                        <div 
                                            key={l.id} onClick={() => { setLanguage(l.id); setActiveDropdown(null); }}
                                            className="px-5 py-3 text-sm font-medium text-slate-300 hover:bg-sky-900/30 hover:text-white cursor-pointer flex justify-between items-center"
                                        >
                                            {l.label} {language === l.id && <Check size={16} className="text-sky-400" />}
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Propósito */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md relative">
                        <label className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-cyan-400">
                            <Globe size={14} /> Vetor de Propósito / Funcionalidade
                        </label>
                        <button 
                            onClick={() => setActiveDropdown(activeDropdown === 'purpose' ? null : 'purpose')}
                            className="w-full bg-transparent text-white text-lg focus:outline-none border-b border-white/10 pb-2 flex items-center justify-between text-left hover:border-cyan-400/50 transition-colors"
                        >
                            <span className="truncate">{selectedPurposeObj.title}</span> <ChevronDown size={16} className="text-slate-500 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'purpose' && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-[#121A2F] border border-white/10 shadow-2xl rounded-2xl z-50 overflow-hidden max-h-60 overflow-y-auto"
                                >
                                    {PURPOSES.map(p => (
                                        <div 
                                            key={p.id} onClick={() => { setPurpose(p.id); setActiveDropdown(null); }}
                                            className="px-5 py-3 text-sm font-medium text-slate-300 hover:bg-cyan-900/30 hover:text-white cursor-pointer flex flex-col gap-0.5 border-b border-white/5 last:border-none"
                                        >
                                            <div className="flex justify-between items-center font-bold text-white">
                                                {p.title} {purpose === p.id && <Check size={16} className="text-cyan-400" />}
                                            </div>
                                            <span className="text-xs text-slate-400">{p.desc}</span>
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Framework */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md relative">
                        <label className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-indigo-400">
                            <Layers size={14} /> Abordagem & Framework
                        </label>
                        <button 
                            onClick={() => setActiveDropdown(activeDropdown === 'framework' ? null : 'framework')}
                            className="w-full bg-transparent text-white text-sm focus:outline-none border-b border-white/10 pb-2 flex items-center justify-between text-left hover:border-indigo-400/50 transition-colors"
                        >
                            <span className="truncate">{selectedFrameworkObj.label}</span> <ChevronDown size={16} className="text-slate-500 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'framework' && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-[#121A2F] border border-white/10 shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {FRAMEWORKS.map(f => (
                                        <div 
                                            key={f.id} onClick={() => { setFramework(f.id); setActiveDropdown(null); }}
                                            className="px-5 py-3 text-sm font-medium text-slate-300 hover:bg-indigo-900/30 hover:text-white cursor-pointer flex justify-between items-center"
                                        >
                                            {f.label} {framework === f.id && <Check size={16} className="text-indigo-400" />}
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Complexidade */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md relative">
                        <label className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-rose-400">
                            <ShieldCheck size={14} /> Nível de Resiliência & Complexidade
                        </label>
                        <button 
                            onClick={() => setActiveDropdown(activeDropdown === 'complexity' ? null : 'complexity')}
                            className="w-full bg-transparent text-white text-sm focus:outline-none border-b border-white/10 pb-2 flex items-center justify-between text-left hover:border-rose-400/50 transition-colors"
                        >
                            <span className="truncate">{selectedComplexityObj.label}</span> <ChevronDown size={16} className="text-slate-500 shrink-0" />
                        </button>
                        <AnimatePresence>
                            {activeDropdown === 'complexity' && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                    className="absolute left-0 right-0 top-full mt-2 bg-[#121A2F] border border-white/10 shadow-2xl rounded-2xl z-50 overflow-hidden"
                                >
                                    {COMPLEXITIES.map(c => (
                                        <div 
                                            key={c.id} onClick={() => { setComplexity(c.id); setActiveDropdown(null); }}
                                            className="px-5 py-3 text-sm font-medium text-slate-300 hover:bg-rose-900/30 hover:text-white cursor-pointer flex justify-between items-center"
                                        >
                                            {c.label} {complexity === c.id && <Check size={16} className="text-rose-400" />}
                                        </div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Instruções Adicionais */}
                <div className="relative z-10 max-w-5xl mx-auto mb-8 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                    <label className="block text-[10px] tracking-widest font-black uppercase mb-2 text-slate-400">
                        Contexto ou Regras Personalizadas (Opcional)
                    </label>
                    <input
                        type="text"
                        placeholder="Ex: Utilizar token Bearer no header, salvar logs no diretório C:\Logs, etc..."
                        value={customContext}
                        onChange={(e) => setCustomContext(e.target.value)}
                        className="w-full bg-transparent text-white text-sm placeholder-slate-600 focus:outline-none border-b border-white/10 focus:border-sky-400 transition-colors pb-2"
                    />
                </div>

                <div className="relative z-10 flex justify-center">
                    <button 
                        onClick={handleGenerate}
                        disabled={generating}
                        className="group relative flex items-center justify-center gap-3 bg-gradient-to-r from-sky-500 to-cyan-500 text-white px-12 py-4 rounded-full font-black text-sm uppercase tracking-widest hover:from-sky-400 hover:to-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden shadow-[0_0_40px_rgba(14,165,233,0.3)] hover:shadow-[0_0_60px_rgba(14,165,233,0.5)]"
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
                                <TerminalSquare size={16} className="text-cyan-400" />
                                {selectedLangObj.label} OUTPUT
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
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-sky-600/30 text-sky-300 hover:bg-sky-600/50 border border-sky-500/40 transition-all"
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
