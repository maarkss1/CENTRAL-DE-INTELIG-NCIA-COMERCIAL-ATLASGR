import { useState } from 'react';
import { Sparkles, Plus, Save, Check, Bot } from 'lucide-react';

export function AiToolBuilder() {
  const [toolName, setToolName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [category, setCategory] = useState('Outbound SDR');
  const [createdTools, setCreatedTools] = useState([
    { id: '1', name: 'Gerador de Cadência Frio SMTP', category: 'Cold Outreach', prompt: 'Gere 3 e-mails frios para decisor de logística.' },
    { id: '2', name: 'Analisador de LTV & Risk Score', category: 'Analytics', prompt: 'Calcule o risco de churn com base no porte da frota.' }
  ]);
  const [saved, setSaved] = useState(false);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!toolName || !systemPrompt) return;
    const newTool = {
      id: Date.now().toString(),
      name: toolName,
      category,
      prompt: systemPrompt
    };
    setCreatedTools([newTool, ...createdTools]);
    setToolName('');
    setSystemPrompt('');
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="bg-surface/95 backdrop-blur-3xl p-8 rounded-[3rem] border border-line/90 shadow-2xl space-y-6 text-ink">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-orange-100 text-atlas-orange border border-orange-200">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Estúdio de Criação de Novas Ferramentas de IA</h2>
            <p className="text-xs text-ink-2 font-medium">Crie e publique seus próprios geradores e copilotos comerciais customizados</p>
          </div>
        </div>
        <span className="px-3 py-1 bg-orange-50 text-atlas-orange text-xs font-black rounded-full border border-orange-200">
          AI Engine Studio 2026
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulário de Criação */}
        <form onSubmit={handleCreate} className="lg:col-span-7 space-y-4 bg-surface-2/80 p-6 rounded-3xl border border-line">
          <h3 className="font-extrabold text-sm text-ink-2 flex items-center gap-2">
            <Plus className="w-4 h-4 text-atlas-orange" /> Configurar Nova Ferramenta Customizada
          </h3>

          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase mb-1">Nome da Ferramenta IA</label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="Ex: Gerador de Proposta Comercial para Frotas de Carga"
              className="w-full bg-surface border border-line rounded-2xl px-4 py-3 text-xs text-ink font-semibold focus:ring-2 focus:ring-atlas-orange focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase mb-1">Categoria de Aplicação</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface border border-line rounded-2xl px-4 py-3 text-xs text-ink font-semibold focus:ring-2 focus:ring-atlas-orange focus:outline-none"
            >
              <option value="Outbound SDR">Outbound SDR & Cadência</option>
              <option value="Qualificação B2B">Qualificação B2B & MEDDPICC</option>
              <option value="Proposta & Fechamento">Proposta & Fechamento</option>
              <option value="Gestão de Risco">Gestão de Risco & Telemetria</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-ink-2 uppercase mb-1">Instruções de Prompt do Sistema (AI Engine)</label>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Digite o comportamento e instruções para o modelo de inteligência artificial..."
              className="w-full bg-surface border border-line rounded-2xl p-4 text-xs text-ink font-medium focus:ring-2 focus:ring-atlas-orange focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-atlas-orange to-amber-500 text-white font-extrabold py-3.5 rounded-2xl text-xs shadow-lg shadow-atlas-orange/30 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {saved ? <Check className="w-4 h-4 animate-bounce" /> : <Save className="w-4 h-4" />}
            <span>{saved ? 'Ferramenta de IA Criada com Sucesso!' : 'Salvar & Publicar Ferramenta'}</span>
          </button>
        </form>

        {/* Lista de Ferramentas Criadas */}
        <div className="lg:col-span-5 space-y-4">
          <h3 className="font-extrabold text-sm text-ink-2 flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-600" /> Ferramentas Customizadas Publicadas ({createdTools.length})
          </h3>

          <div className="space-y-3">
            {createdTools.map((t) => (
              <div key={t.id} className="p-4 rounded-2xl bg-surface border border-line shadow-sm space-y-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-ink">{t.name}</h4>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-surface-2 text-ink-2 font-bold border border-line">
                    {t.category}
                  </span>
                </div>
                <p className="text-[11px] text-ink-2 line-clamp-2">{t.prompt}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
