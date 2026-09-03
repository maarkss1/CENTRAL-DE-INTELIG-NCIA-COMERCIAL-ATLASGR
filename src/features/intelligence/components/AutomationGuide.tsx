import { useState } from 'react';
import {
  Workflow,
  Link,
  Zap,
  GitCommit,
  ChevronDown,
  Check,
  Copy,
  Download,
  Layers,
  Bot,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBrandAccent } from '../../../hooks/useBrandAccent';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';

const TRIGGERS = [
  {
    id: 'webhook',
    title: 'Webhook Customizado (HTTP POST)',
    desc: 'Recebe payloads JSON em tempo real de qualquer app.',
  },
  {
    id: 'gmail',
    title: 'Gmail / Outlook (Novo E-mail Recebido)',
    desc: 'Disparado quando um e-mail chega na caixa de entrada.',
  },
  {
    id: 'forms',
    title: 'Formulários (Typeform / Tally / Google Forms)',
    desc: 'Disparado no envio de uma nova resposta de formulário.',
  },
  {
    id: 'sheets',
    title: 'Google Sheets / Airtable (Nova Linha)',
    desc: 'Disparado quando um novo registro é adicionado.',
  },
  {
    id: 'bitrix_event',
    title: 'Bitrix24 / CRM Event (Mudança de Estágio)',
    desc: 'Disparado quando um lead entra em um novo funil.',
  },
  {
    id: 'cron',
    title: 'Schedule / Cron (Tempo Programado)',
    desc: 'Executa a cada X minutos, horas ou em um horário fixo.',
  },
];

const ACTIONS = [
  {
    id: 'bitrix_deal',
    title: 'Bitrix24 CRM (Criar/Atualizar Deal ou Lead)',
    desc: 'Insere os dados limpos e qualificados no pipeline de vendas.',
  },
  {
    id: 'hubspot',
    title: 'HubSpot (Criar Contato & Empresa)',
    desc: 'Registra novo contato com propriedade de origem.',
  },
  {
    id: 'slack',
    title: 'Slack / Discord (Notificar Canal de Vendas)',
    desc: 'Envia card de alerta com botão de acesso ao lead.',
  },
  {
    id: 'db_upsert',
    title: 'Banco de Dados (PostgreSQL / MySQL / Redis)',
    desc: 'Executa query SQL para gravação auditável.',
  },
  {
    id: 'email_send',
    title: 'Envio de E-mail Automático (SMTP / SendGrid)',
    desc: 'Envia resposta instantânea personalizada.',
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp Business API (Disparo de Mensagem)',
    desc: 'Inicia conversa no WhatsApp com o lead.',
  },
];

const TOOLS = [
  {
    id: 'n8n',
    title: 'n8n (Workflow Self-Hosted / Cloud)',
    desc: 'Gratuito, open-source e sem limites de operações.',
  },
  {
    id: 'make',
    title: 'Make / Integromat',
    desc: 'Interface visual altamente flexível para integração SaaS.',
  },
  { id: 'zapier', title: 'Zapier', desc: 'Conexão simples em 2 cliques com milhares de apps.' },
  {
    id: 'python_script',
    title: 'Script Python Custom (Nativo)',
    desc: 'Automação via código executado em servidor ou Docker.',
  },
  {
    id: 'powershell_cron',
    title: 'PowerShell Scheduled Task',
    desc: 'Automação nativa de infraestrutura Windows/Linux.',
  },
];

const AI_LAYERS = [
  { id: 'none', title: 'Sem Filtro de IA (Mapeamento Direto de Campos)' },
  { id: 'icp_qualifier', title: 'Filtro ICP com LLM (Qualificação de Lead)' },
  { id: 'sentiment', title: 'Análise de Sentimento & URGÊNCIA' },
  { id: 'enrichment', title: 'Resumo & Enriquecimento Automático via Web Scraping' },
];

export function AutomationGuide() {
  const accent = useBrandAccent();
  const { brandInfo } = useBrand();
  const [triggerApp, setTriggerApp] = useState(TRIGGERS[0].id);
  const [actionApp, setActionApp] = useState(ACTIONS[0].id);
  const [tool, setTool] = useState(TOOLS[0].id);
  const [aiLayer, setAiLayer] = useState(AI_LAYERS[1].id);
  const [automationGoal, setAutomationGoal] = useState(
    'Enriquecer lead vindo do site, qualificar via IA e criar Deal no Bitrix24',
  );

  const [generating, setGenerating] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<'trigger' | 'action' | 'tool' | 'ai' | null>(
    null,
  );
  const [result, setResult] = useState<{
    blueprint: string;
    n8nJson: string;
    codeScript: string;
  } | null>(null);
  const [activeTabOutput, setActiveTabOutput] = useState<'blueprint' | 'json' | 'code'>(
    'blueprint',
  );
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [resultSource, setResultSource] = useState<'ai' | 'local'>('ai');

  const selectedTriggerObj = TRIGGERS.find((t) => t.id === triggerApp) || TRIGGERS[0];
  const selectedActionObj = ACTIONS.find((a) => a.id === actionApp) || ACTIONS[0];
  const selectedToolObj = TOOLS.find((t) => t.id === tool) || TOOLS[0];
  const selectedAiObj = AI_LAYERS.find((a) => a.id === aiLayer) || AI_LAYERS[1];

  const handleGenerateOffline = () => {
    setGenerating(true);
    setError('');

    {
      const blueprint = `=============================================================================
GUIA E ARQUITETURA DE AUTOMAÇÃO: ${selectedToolObj.title.toUpperCase()}
Objetivo: ${automationGoal}
Gatilho (Origem): ${selectedTriggerObj.title}
Ação (Destino): ${selectedActionObj.title}
Camada de Inteligência: ${selectedAiObj.title}
=============================================================================

PASSO 1: CONFIGURAÇÃO DO GATILHO (TRIGGER)
-----------------------------------------------------------------------------
1. No ${selectedToolObj.title}, crie um novo fluxo de trabalho (Workflow).
2. Adicione o nó inicial do tipo [${selectedTriggerObj.title}].
3. Copie a URL do Webhook/Endpoint gerado e cole no aplicativo de origem.
4. Execute um teste no app de origem enviando uma requisição de exemplo.

PASSO 2: CAMADA DE TRATAMENTO DE DADOS & INTELIGÊNCIA ARTIFICIAL
-----------------------------------------------------------------------------
1. Adicione um nó de Code / Function para validar se os campos obrigatórios (nome, e-mail, telefone/CNPJ) estão presentes.
2. ${selectedAiObj.id !== 'none' ? `Conecte um nó de LLM com a seguinte instrução:\n   "Classifique o lead enviado. Se o score de alinhamento B2B for >= 70, marque status = QUALIFIED. Responda em JSON."` : 'Mapeie diretamente os dados para o formato JSON final.'}

PASSO 3: EXECUÇÃO DA AÇÃO FINAL (DESTINO)
-----------------------------------------------------------------------------
1. Conecte o nó do [${selectedActionObj.title}].
2. Selecione a operação: "Create" ou "Upsert".
3. Faça o mapeamento de campos (Field Mapping):
   - Nome do Lead  <-- {{ $json.body.name }}
   - E-mail        <-- {{ $json.body.email }}
   - Observação IA <-- {{ $json.ai_summary }}
4. Ative o Workflow em modo Produção!`;

      const n8nJson = JSON.stringify(
        {
          name: `Automação: ${selectedTriggerObj.title.split(' ')[0]} ➔ ${selectedActionObj.title.split(' ')[0]}`,
          nodes: [
            {
              parameters: { httpMethod: 'POST', path: 'atlas-webhook-entry' },
              name: 'Webhook Entry',
              type: 'n8n-nodes-base.webhook',
              typeVersion: 1,
              position: [250, 300],
            },
            {
              parameters: {
                model: 'gemini-flash',
                options: { temperature: 0.2 },
                prompt: `Analise este lead para ${automationGoal}: {{ $json.body }}`,
              },
              name: 'LLM Qualifier',
              type: '@n8n/n8n-nodes-langchain.chainLLM',
              typeVersion: 1,
              position: [480, 300],
            },
            {
              parameters: {
                resource: 'deal',
                operation: 'create',
                title: 'Lead {{ $json.body.name }}',
                pipelineId: 'main_pipeline',
              },
              name: selectedActionObj.title.split(' ')[0],
              type: 'n8n-nodes-base.bitrix24',
              typeVersion: 1,
              position: [710, 300],
            },
          ],
          connections: {
            'Webhook Entry': { main: [[{ node: 'LLM Qualifier', type: 'main', index: 0 }]] },
            'LLM Qualifier': {
              main: [[{ node: selectedActionObj.title.split(' ')[0], type: 'main', index: 0 }]],
            },
          },
        },
        null,
        2,
      );

      const codeScript = `import requests
import json
import logging

# Automação Autônoma sem dependência de plataformas pagas
# Origem: ${selectedTriggerObj.title}
# Destino: ${selectedActionObj.title}

logging.basicConfig(level=logging.INFO)

def run_automation_pipeline(event_payload: dict):
    logging.info("Recebido evento de automação...")
    
    # 1. Validação de dados
    email = event_payload.get("email")
    if not email:
        logging.error("E-mail ausente. Ignorando evento.")
        return False
        
    # 2. Camada de Inteligência IA (${selectedAiObj.title})
    logging.info("Enviando dados para a Inteligência Artificial...")
    ai_qualification = {
        "status": "REVIEW_REQUIRED",
        "score": None,
        "summary": "Conecte o motor de IA e valide a resposta antes da ação externa."
    }
    
    # 3. Disparo para o aplicativo de destino (${selectedActionObj.title})
    logging.info("Enviando dados para ${selectedActionObj.title}...")
    destination_payload = {
        "lead_email": email,
        "ai_score": ai_qualification["score"],
        "notes": ai_qualification["summary"]
    }
    
    # PLACEHOLDER: Implemente a chamada HTTP POST para o destino configurado.\r
    # Exemplo: requests.post(destination_url, json=destination_payload, timeout=10)
    print("Mapeamento concluído com sucesso:")
    print(json.dumps(destination_payload, indent=2))
    return True

if __name__ == "__main__":
    sample_event = {"name": "Carlos Silva", "email": "carlos@empresa.com.br", "company": "Silva Logística"}
    run_automation_pipeline(sample_event)
`;

      setResult({ blueprint, n8nJson, codeScript });
      setResultSource('local');
      setGenerating(false);
      setCopied(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const response = await api.post<{
        result: { blueprint: string; n8nJson: string; codeScript: string };
      }>(
        '/api/intelligence/studio',
        {
          kind: 'automation',
          brand: { name: brandInfo.name, description: brandInfo.description },
          inputs: {
            triggerId: selectedTriggerObj.id,
            trigger: selectedTriggerObj.title,
            actionId: selectedActionObj.id,
            action: selectedActionObj.title,
            toolId: selectedToolObj.id,
            tool: selectedToolObj.title,
            aiLayerId: selectedAiObj.id,
            aiLayer: selectedAiObj.title,
            goal: automationGoal,
          },
        },
        { timeoutMs: 90_000 },
      );
      setResult(response.result);
      setResultSource('ai');
      setCopied(false);
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : 'Não foi possível gerar a automação.',
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    let text = '';
    if (activeTabOutput === 'blueprint') text = result.blueprint;
    if (activeTabOutput === 'json') text = result.n8nJson;
    if (activeTabOutput === 'code') text = result.codeScript;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    let content = '';
    let filename = '';
    if (activeTabOutput === 'blueprint') {
      content = result.blueprint;
      filename = 'guia_automacao.txt';
    } else if (activeTabOutput === 'json') {
      content = result.n8nJson;
      filename = 'workflow_n8n.json';
    } else if (activeTabOutput === 'code') {
      content = result.codeScript;
      filename = 'automation_script.py';
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
        {/* Ambient glow */}
        <div
          className={`absolute top-0 right-0 w-[500px] h-[500px] ${accent.blobA} rounded-full blur-[100px] pointer-events-none -mt-40 -mr-40`}
        ></div>
        <div
          className={`absolute bottom-0 left-0 w-[500px] h-[500px] ${accent.blobB} rounded-full blur-[100px] pointer-events-none -mb-40 -ml-40`}
        ></div>

        <div className="relative z-10 flex flex-col items-center text-center mb-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className={`w-20 h-20 rounded-[2rem] bg-gradient-to-br ${accent.gradient} border border-white/20 flex items-center justify-center mb-6 ${accent.glow}`}
          >
            <Workflow size={40} className="text-white" />
          </motion.div>
          <div
            className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full ${accent.bgSofter} border ${accent.borderSoft} ${accent.text} mb-4 backdrop-blur-md`}
          >
            <Zap size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Automation Engine & Workflow Designer
            </span>
          </div>
          <h3 className="text-4xl font-black text-ink mb-4 tracking-tight">
            {accent.brandName}{' '}
            <span className={`text-transparent bg-clip-text bg-gradient-to-r ${accent.gradient}`}>
              Guia e Construtor de Automações
            </span>
          </h3>
          <p className="text-sm text-ink-2 max-w-2xl leading-relaxed">
            Mapeie fluxos de automação entre origens e destinos. Obtenha o blueprint passo a passo,
            schema JSON pronto para n8n/Make e scripts de automação.
          </p>
        </div>

        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-6">
          {/* App Origem */}
          <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
            <p
              className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}
            >
              <Link size={14} /> App de Origem (Gatilho / Trigger)
            </p>
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'trigger' ? null : 'trigger')}
              className={`w-full bg-transparent text-ink text-lg focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors`}
            >
              <span className="truncate">{selectedTriggerObj.title}</span>{' '}
              <ChevronDown size={16} className="text-ink-2 shrink-0" />
            </button>
            <AnimatePresence>
              {activeDropdown === 'trigger' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden max-h-60 overflow-y-auto"
                >
                  {TRIGGERS.map((t) => (
                    <div
                      key={t.id}
                      role="option"
                      aria-selected={triggerApp === t.id}
                      tabIndex={0}
                      onClick={() => {
                        setTriggerApp(t.id);
                        setActiveDropdown(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setTriggerApp(t.id);
                          setActiveDropdown(null);
                        }
                      }}
                      className="px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex flex-col gap-0.5 border-b border-line last:border-none"
                    >
                      <div className="flex justify-between items-center font-bold text-ink">
                        {t.title}{' '}
                        {triggerApp === t.id && <Check size={16} className={accent.text} />}
                      </div>
                      <span className="text-xs text-ink-2">{t.desc}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* App Destino */}
          <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
            <p
              className={`flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 ${accent.text}`}
            >
              <GitCommit size={14} /> App de Destino (Ação / Action)
            </p>
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'action' ? null : 'action')}
              className={`w-full bg-transparent text-ink text-lg focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left ${accent.hoverBorder} transition-colors`}
            >
              <span className="truncate">{selectedActionObj.title}</span>{' '}
              <ChevronDown size={16} className="text-ink-2 shrink-0" />
            </button>
            <AnimatePresence>
              {activeDropdown === 'action' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden max-h-60 overflow-y-auto"
                >
                  {ACTIONS.map((a) => (
                    <div
                      key={a.id}
                      role="option"
                      aria-selected={actionApp === a.id}
                      tabIndex={0}
                      onClick={() => {
                        setActionApp(a.id);
                        setActiveDropdown(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setActionApp(a.id);
                          setActiveDropdown(null);
                        }
                      }}
                      className="px-5 py-3 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer flex flex-col gap-0.5 border-b border-line last:border-none"
                    >
                      <div className="flex justify-between items-center font-bold text-ink">
                        {a.title}{' '}
                        {actionApp === a.id && <Check size={16} className={accent.text} />}
                      </div>
                      <span className="text-xs text-ink-2">{a.desc}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Ferramenta de Orquestração */}
          <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
            <p className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-yellow-400">
              <Layers size={14} /> Ferramenta de Orquestração
            </p>
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'tool' ? null : 'tool')}
              className="w-full bg-transparent text-ink text-sm focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left hover:border-yellow-400/50 transition-colors"
            >
              <span className="truncate">{selectedToolObj.title}</span>{' '}
              <ChevronDown size={16} className="text-ink-2 shrink-0" />
            </button>
            <AnimatePresence>
              {activeDropdown === 'tool' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                >
                  {TOOLS.map((t) => (
                    <div
                      key={t.id}
                      role="option"
                      aria-selected={tool === t.id}
                      tabIndex={0}
                      onClick={() => {
                        setTool(t.id);
                        setActiveDropdown(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setTool(t.id);
                          setActiveDropdown(null);
                        }
                      }}
                      className="px-5 py-3 text-sm font-medium text-ink-2 hover:bg-yellow-900/30 hover:text-white cursor-pointer flex justify-between items-center"
                    >
                      {t.title} {tool === t.id && <Check size={16} className="text-yellow-400" />}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Camada de IA */}
          <div className="bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md relative">
            <p className="flex items-center gap-2 text-[10px] tracking-widest font-black uppercase mb-3 text-rose-400">
              <Bot size={14} /> Camada de Inteligência IA
            </p>
            <button
              onClick={() => setActiveDropdown(activeDropdown === 'ai' ? null : 'ai')}
              className="w-full bg-transparent text-ink text-sm focus:outline-none border-b border-line pb-2 flex items-center justify-between text-left hover:border-rose-400/50 transition-colors"
            >
              <span className="truncate">{selectedAiObj.title}</span>{' '}
              <ChevronDown size={16} className="text-ink-2 shrink-0" />
            </button>
            <AnimatePresence>
              {activeDropdown === 'ai' && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  role="listbox"
                  className="absolute left-0 right-0 top-full mt-2 bg-surface border border-line shadow-2xl rounded-2xl z-50 overflow-hidden"
                >
                  {AI_LAYERS.map((a) => (
                    <div
                      key={a.id}
                      role="option"
                      aria-selected={aiLayer === a.id}
                      tabIndex={0}
                      onClick={() => {
                        setAiLayer(a.id);
                        setActiveDropdown(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setAiLayer(a.id);
                          setActiveDropdown(null);
                        }
                      }}
                      className="px-5 py-3 text-sm font-medium text-ink-2 hover:bg-rose-900/30 hover:text-white cursor-pointer flex justify-between items-center"
                    >
                      {a.title} {aiLayer === a.id && <Check size={16} className="text-rose-400" />}
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Campo Objetivo */}
        <div className="relative z-10 max-w-5xl mx-auto mb-8 bg-surface-2 border border-line rounded-2xl p-6 backdrop-blur-md">
          <p className="block text-[10px] tracking-widest font-black uppercase mb-2 text-ink-2">
            Objetivo Principal da Automação
          </p>
          <input
            type="text"
            placeholder="Ex: Enriquecer lead e criar oportunidade no CRM"
            value={automationGoal}
            onChange={(e) => setAutomationGoal(e.target.value)}
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
                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 border-2 border-white/50 rounded-full border-t-transparent border-l-transparent"
              />
            )}
            {generating ? (
              <GitCommit size={18} className="animate-pulse" />
            ) : (
              <Workflow size={18} className="group-hover:scale-110 transition-transform" />
            )}
            {generating
              ? 'Mapeando Arquitetura de Automação...'
              : 'Gerar Guia & Blueprint de Automação'}
          </button>
        </div>
        {error && (
          <div
            role="alert"
            className="relative z-10 mx-auto mt-5 flex max-w-3xl flex-col gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-start gap-2">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              {error}
            </span>
            <button
              type="button"
              onClick={handleGenerateOffline}
              className="shrink-0 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-white/15"
            >
              Usar blueprint local
            </button>
          </div>
        )}
      </motion.div>

      {/* Resultado da Automação */}
      <AnimatePresence>
        {result && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface border border-line text-ink rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4 border-b border-line pb-4">
              <div
                className={`flex items-center gap-3 ${accent.text} text-xs font-mono uppercase tracking-widest`}
              >
                <Zap size={16} />
                Arquitetura Gerada para {selectedToolObj.title}
                <span
                  className={`rounded-full px-2 py-0.5 text-[9px] font-black ${resultSource === 'ai' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}
                >
                  {resultSource === 'ai' ? 'GERADO POR IA' : 'MODELO LOCAL'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${
                    copied
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'bg-surface-2 text-ink-2 hover:bg-line border border-line'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check size={14} /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copiar
                    </>
                  )}
                </button>
                <button
                  onClick={handleDownload}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider ${accent.bgSoft} ${accent.textSoft} ${accent.hoverBg} border ${accent.borderSoft} transition-all`}
                >
                  <Download size={14} /> Baixar Blueprint
                </button>
              </div>
            </div>

            {/* Abas */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
              <button
                onClick={() => setActiveTabOutput('blueprint')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTabOutput === 'blueprint'
                    ? `${accent.solidBg} text-white shadow-lg`
                    : 'bg-surface-2 text-ink-2 hover:bg-line'
                }`}
              >
                Blueprint Passo a Passo
              </button>
              <button
                onClick={() => setActiveTabOutput('json')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTabOutput === 'json'
                    ? `${accent.solidBg} text-white shadow-lg`
                    : 'bg-surface-2 text-ink-2 hover:bg-line'
                }`}
              >
                Payload Workflow (n8n JSON)
              </button>
              <button
                onClick={() => setActiveTabOutput('code')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTabOutput === 'code'
                    ? 'bg-sky-600 text-white shadow-lg'
                    : 'bg-surface-2 text-ink-2 hover:bg-line'
                }`}
              >
                Script Python Equivalente
              </button>
            </div>

            <div className="bg-[#050811] rounded-2xl border border-white/10 p-6 shadow-inner relative">
              <pre className="text-[13px] md:text-sm text-amber-200 whitespace-pre-wrap font-mono overflow-x-auto custom-scrollbar leading-relaxed max-h-[500px]">
                {activeTabOutput === 'blueprint' && result.blueprint}
                {activeTabOutput === 'json' && result.n8nJson}
                {activeTabOutput === 'code' && result.codeScript}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
