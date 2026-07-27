import { useState } from 'react';
import { Sparkles, Copy, Check, Send, Bot, RefreshCw, Target, ShieldCheck, Zap } from 'lucide-react';
import { Button } from './Button';

interface AIEmailGeneratorProps {
  companyName?: string;
  contactName?: string;
  sector?: string;
  role?: string;
  technologies?: string[];
  companySize?: string;
}

export function AIEmailGenerator({
  companyName = 'Empresa Alvo',
  contactName = 'Decisor de Compras',
  sector = 'Tecnologia',
  role = 'Diretor Comercial',
  technologies = ['React', 'AWS', 'Salesforce'],
  companySize = '50-200 Colaboradores (Mid-Market)'
}: AIEmailGeneratorProps) {
  const [tone, setTone] = useState<'consultative' | 'direct' | 'roi_focused' | 'hyper_personalized'>('consultative');
  const [icpFit, setIcpFit] = useState<'High' | 'Medium'>('High');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [icpAnalysis, setIcpAnalysis] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateEmail = async () => {
    setGenerating(true);
    setCopied(false);

    try {
      // Simulação da chamada da IA Gemini LangChain com prompts enriquecidos voltados para Persona e ICP
      await new Promise((resolve) => setTimeout(resolve, 850));

      const techStackStr = technologies.join(', ');

      if (tone === 'consultative') {
        setSubject(`Otimização de eficiência comercial & tech stack na ${companyName}`);
        setIcpAnalysis(`🎯 ICP Match Score: 96% | Persona: ${role} | Stack Detectada: ${techStackStr}`);
        setBody(
          `Olá ${contactName},\n\nNotei a liderança da ${companyName} no setor de ${sector} e identificamos uma sinergia direta com a sua infraestrutura técnica atual (${techStackStr}).\n\nComo ${role}, sabemos que um dos maiores desafios em operações do porte da ${companyName} (${companySize}) é manter a velocidade de qualificação de leads sem inflar o Custo de Aquisição de Clientes (CAC).\n\nCom a plataforma AtlasGR, entregamos uma camada de inteligência autônoma que qualifica e enriquece 100% dos prospects no CRM antes da primeira abordagem.\n\nTeria 10 minutos nesta quinta-feira às 14h para vermos uma simulação baseada em dados reais da ${companyName}?\n\nAtenciosamente,\nEquipe de Inteligência Comercial`
        );
      } else if (tone === 'direct') {
        setSubject(`Aceleração de Vendas B2B para ${companyName}`);
        setIcpAnalysis(`⚡ Abordagem Direta C-Level | Persona: ${role} | Foco: ROI Imediato`);
        setBody(
          `Olá ${contactName},\n\nDireto ao ponto: ajudamos líderes no cargo de ${role} em empresas de ${sector} a reduzirem o ciclo de fechamento em até 45% automatizando a prospecção ativa.\n\nConstatamos que a ${companyName} tem o perfil exato (ICP Ideal) para alavancar nossos conectores neurais integrados com a sua stack (${techStackStr}).\n\nConsegue falar amanhã às 15h por 10 minutos?\n\nAbraços,`
        );
      } else if (tone === 'roi_focused') {
        setSubject(`Redução de CAC e ROI de Vendas na ${companyName}`);
        setIcpAnalysis(`💰 Foco Financeiro & Métrica de Retorno | Persona: ${role} | ICP: ${companySize}`);
        setBody(
          `Olá ${contactName},\n\nEstudos recentes em empresas de ${sector} com mais de ${companySize} demonstram que SDRs perdem até 15 horas semanais com pesquisas manuais de dados.\n\nAplicando a inteligência de prospecção do AtlasGR para ${companyName}, estimamos um retorno de investimento (ROI) de 4.2x no primeiro trimestre ao eliminar o tempo ocioso pré-venda.\n\nPodemos agendar uma rápida apresentação dos números projetados para a ${companyName}?\n\nAtenciosamente,`
        );
      } else {
        setSubject(`Ideia de arquitetura comercial para ${contactName} (${companyName}) 🚀`);
        setIcpAnalysis(`🔥 Hiper-personalização | Persona: ${role} | Contexto Tecnológico`);
        setBody(
          `Olá ${contactName}!\n\nParabéns pelo crescimento acelerado da ${companyName} no segmento de ${sector}.\n\nAnalisamos que sua estrutura utiliza soluções avançadas como ${techStackStr}. Desenvolvemos um módulo de inteligência de vendas com IA que se conecta perfeitamente a esse ecossistema, entregando leads prontos para abordagem.\n\nTopa fazer um teste rápido sem compromisso nesta semana?\n\nUm abraço,`
        );
      }
    } catch {
      setSubject('Erro ao gerar e-mail');
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`Assunto: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card p-5 rounded-2xl border border-white/10 bg-slate-900/60 space-y-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-atlas-orange flex items-center justify-center text-white shadow-md">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-white">Copiloto IA: Gerador de Cold Mail V3</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> ICP Match
              </span>
            </div>
            <p className="text-xs text-gray-400">Personalização profunda baseada na Persona ({role}) e ICP ({companySize})</p>
          </div>
        </div>

        {/* Seleção de Tom */}
        <div className="flex flex-wrap items-center bg-slate-800/90 p-1 rounded-xl border border-white/10 text-[11px] font-semibold">
          <button
            onClick={() => setTone('consultative')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'consultative' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Consultivo
          </button>
          <button
            onClick={() => setTone('direct')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'direct' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Direto
          </button>
          <button
            onClick={() => setTone('roi_focused')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'roi_focused' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Foco ROI
          </button>
          <button
            onClick={() => setTone('hyper_personalized')}
            className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
              tone === 'hyper_personalized' ? 'bg-atlas-orange text-white font-bold shadow-sm' : 'text-gray-400 hover:text-white'
            }`}
          >
            Hiper-personalizado
          </button>
        </div>
      </div>

      {!body ? (
        <div className="text-center p-6 border border-dashed border-white/10 rounded-xl bg-white/5 space-y-3">
          <Sparkles className="w-8 h-8 text-indigo-400 mx-auto animate-pulse" />
          <div>
            <p className="text-xs font-bold text-white mb-1">
              Pronto para gerar cold mail de altíssima conversão
            </p>
            <p className="text-xs text-gray-400 max-w-md mx-auto">
              O motor de IA cruzará a persona <strong className="text-indigo-300">{role}</strong>, os dados do segmento <strong className="text-indigo-300">{sector}</strong> e as ferramentas detectadas (<strong className="text-indigo-300">{technologies.join(', ')}</strong>).
            </p>
          </div>
          <Button onClick={generateEmail} disabled={generating} className="w-full sm:w-auto shadow-lg shadow-atlas-orange/20 cursor-pointer">
            {generating ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Zap className="w-4 h-4 mr-2 text-amber-400" />}
            {generating ? 'Sintetizando E-mail Inteligente...' : 'Sintetizar E-mail com IA'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {icpAnalysis && (
            <div className="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs text-indigo-200 font-semibold flex items-center justify-between">
              <span>{icpAnalysis}</span>
              <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded text-indigo-300 uppercase">Validação Persona OK</span>
            </div>
          )}

          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">
              Assunto Recomendado (AIDA Hook)
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-xs font-bold px-3 py-2 rounded-lg bg-slate-800 text-white border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange"
            />
          </div>

          <div>
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400 block mb-1">
              Corpo da Mensagem (Engenharia de Prompt ICP)
            </label>
            <textarea
              rows={7}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full text-xs px-3 py-2.5 rounded-lg bg-slate-800 text-gray-200 border border-white/10 focus:outline-none focus:ring-1 focus:ring-atlas-orange leading-relaxed font-sans"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={generateEmail} disabled={generating} className="text-xs text-indigo-400">
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${generating ? 'animate-spin' : ''}`} />
              Regerar com Novo Tom
            </Button>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyToClipboard} className="text-xs">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                {copied ? 'Copiado!' : 'Copiar Texto'}
              </Button>
              <a
                href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}
                className="inline-flex items-center justify-center text-xs font-bold px-3.5 py-1.5 rounded-md bg-atlas-orange text-white hover:bg-atlas-orange/90 transition-colors shadow-md"
              >
                <Send className="w-3.5 h-3.5 mr-1.5" /> Enviar
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
