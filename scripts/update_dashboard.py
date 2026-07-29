import re
import os

filepath = r"c:\GitHub\PROSPECTOR-ATLASGR\src\features\dashboard\components\SinglePageDashboard.tsx"
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add "Exportar Bitrix24" next to Save button in Topbars
bitrix_btn = r"""
                <button
                  onClick={() => { SoundFX.playSuccess(); }}
                  className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition-all flex items-center gap-2 shadow-lg cursor-pointer bg-white/10 text-gray-200 hover:bg-white/20 border border-white/10 hover:border-white/30`}
                >
                  <Database className="w-4 h-4" /> Exportar para Bitrix24
                </button>
"""

# We have 3 save buttons (home, company_tools, tool_active)
# We will inject the export button after the save button in company_tools and tool_active.

content = re.sub(
    r'(<Save className="w-4 h-4" /> \{isSaved \? \'Salvo!\' : \'Salvar Preferências\'\}\s*</button>)',
    r'\1' + '\n' + bitrix_btn,
    content
)

content = re.sub(
    r'(<Save className="w-4 h-4" /> \{isSaved \? \'Dados Salvos!\' : \'Salvar Dados\'\}\s*</button>)',
    r'\1' + '\n' + bitrix_btn,
    content
)

# 2. Fix gradients (remove purple and cross-brand colors)
content = content.replace(
    'from-atlas-orange/20 via-purple-500/20 to-totaltrack-blue/20',
    "${activeBrand === 'atlasgr' ? 'from-atlas-orange/20 to-orange-400/20' : 'from-totaltrack-blue/20 to-sky-400/20'}"
)
content = content.replace(
    'from-atlas-orange via-purple-500 to-totaltrack-blue',
    "${activeBrand === 'atlasgr' ? 'from-atlas-orange to-orange-400' : 'from-totaltrack-blue to-sky-400'}"
)

# 3. Rename ToolCards and Add Tooltips
# We will intercept the AppleToolCard definition to add tooltips and sound on hover, and reduce padding.

apple_card_def = """// Componente Reutilizável de Card de Ferramenta
function AppleToolCard({ title, desc, icon, badge, onClick, highlight, visible, brand }: { title: string; desc: string; icon: React.ReactNode; badge: string; onClick: () => void; highlight?: boolean; visible: boolean; brand: string }) {
  if (!visible) return null;

  const isAtlas = brand === 'atlasgr';

  const gradientBgClass = isAtlas
    ? 'bg-white text-slate-900 shadow-[0_15px_40px_rgba(255,86,24,0.12)] hover:shadow-[0_25px_60px_rgba(255,86,24,0.35)] border-[#FF5618]/15'
    : 'bg-white text-slate-900 shadow-[0_15px_40px_rgba(0,136,204,0.12)] hover:shadow-[0_25px_60px_rgba(0,136,204,0.35)] border-[#0088CC]/15';

  const iconBgClass = isAtlas
    ? 'bg-[#FF5618]/10 border border-[#FF5618]/25 text-[#FF5618] [&_svg]:text-[#FF5618]'
    : 'bg-[#0088CC]/10 border border-[#0088CC]/25 text-[#0088CC] [&_svg]:text-[#0088CC]';

  const badgeClass = isAtlas
    ? 'bg-[#FF5618]/15 text-[#FF5618] border border-[#FF5618]/30'
    : 'bg-[#0088CC]/15 text-[#0088CC] border border-[#0088CC]/30';

  const bottomLinkClass = isAtlas
    ? 'text-[#FF5618] group-hover:text-orange-600'
    : 'text-[#0088CC] group-hover:text-blue-600';

  const borderClass = highlight 
    ? (isAtlas ? 'border-2 border-[#FF5618]/40' : 'border-2 border-[#0088CC]/40')
    : 'border';

  return (
    <div className="relative group">
      {/* Tooltip Dinâmico */}
      <div className={`absolute -top-12 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 shadow-xl whitespace-nowrap ${isAtlas ? 'bg-atlas-orange' : 'bg-totaltrack-blue'}`}>
        🚀 Experimente: {title.split(':')[0]}!
        <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 ${isAtlas ? 'bg-atlas-orange' : 'bg-totaltrack-blue'}`} />
      </div>

      <motion.div
        whileHover={{ scale: 1.03, y: -4 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClick}
        onHoverStart={() => SoundFX.playHover()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
        className={`p-6 md:p-8 rounded-[2rem] transition-all duration-500 cursor-pointer flex flex-col justify-between h-full min-h-[280px] group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4 focus-visible:ring-offset-slate-900 ${isAtlas ? 'focus-visible:ring-atlas-orange/30' : 'focus-visible:ring-totaltrack-blue/30'} ${gradientBgClass} ${borderClass}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-2xl shadow-sm shrink-0 [&_svg]:w-7 [&_svg]:h-7 ${iconBgClass}`}>
            {icon}
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full ${badgeClass}`}>
            {badge}
          </span>
        </div>

        <div className="flex-1 mb-4">
          <h3 className="text-lg md:text-xl font-black tracking-tight text-slate-900 leading-tight mb-2">{title}</h3>
          <p className="text-xs text-slate-500 leading-relaxed font-semibold">{desc}</p>
        </div>

        <div className={`pt-4 border-t border-slate-100 flex items-center justify-between text-xs font-black transition-colors mt-auto ${bottomLinkClass}`}>
          <span className="flex items-center gap-2">Explorar Módulo <Sparkles className="w-3 h-3 animate-pulse" /></span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-2 transition-transform duration-300" />
        </div>
      </motion.div>
    </div>
  );
}"""

content = re.sub(
    r'// Componente Reutilizável de Card de Ferramenta.*?(?=$|export)', 
    apple_card_def + '\n', 
    content, 
    flags=re.DOTALL
)

# 4. Update the AppleToolCard titles and desc to be creative and ambitious
replacements = {
    '"Atlas Radar: Prospecção de Transportadoras"': '"Nexus Prospector: Radar de Transportadoras"',
    '"TotalTrac Radar: Localização de Frotas"': '"Omni Radar: Varredura de Frotas em Massa"',
    '"Atlas CRM: Funil de Vendas Profile & GR"': '"Pipeline Quantum: Máquina de Vendas Profile"',
    '"TotalTrac CRM: Funil de Rastreamento & M2M"': '"Kanban Supremo: Domínio de Rastreamento"',
    '"Atlas Playbook: Abordagem Profile & GR"': '"Matriz Estratégica: Playbook Sniper"',
    '"TotalTrac Playbook: Abordagem de Frota"': '"Doutrina Tática: Engenharia de Fechamento"',
    '"Atlas Tech Stack: Software Logístico & Rastreamento"': '"Raio-X Corporativo: Mapeamento de Ecossistemas"',
    '"TotalTrac Tech Stack: Dispositivos & Concorrência"': '"Arsenal Competitivo: Varredura de Mercado"',
    '"Atlas Decisores: Diretoria de Gerenciamento de Risco"': '"Cúpula Executiva: Conexão C-Level"',
    '"TotalTrac Decisores: Gestão de Frota"': '"Conselho de Titãs: Diretório de Alta Gestão"',
    '"Atlas Torre de Controle: Agenda & Homologações"': '"Comando Central: Orquestração de Negócios"',
    '"TotalTrac Agenda: Testes & Instalações"': '"Sincronia Mestra: Execução Tática"',
    '"Atlas Safety: Simulador de Objeções de Risco"': '"Arena Cognitiva: Mestre das Objeções"',
    '"TotalTrac Simulador: Objeções de Frota"': '"Dojo de Vendas: Quebra-Gelo Invencível"',
    '"Atlas Studio: Copilotos de Gerenciamento de Risco"': '"Forja de Inteligência: Criação de Copilotos"',
    '"TotalTrac Studio: Copilotos de Gestão de Frota"': '"Laboratório IA: Engenharia de Prompts"',
    '"Atlas Academia: Formação em Profile & GR"': '"Universo do Conhecimento: Academia Master"',
    '"TotalTrac Academia: Formação em Telemetria"': '"Trilha da Sabedoria: Imersão em Telemetria"',
    '"Atlas + Bitrix24: Contratos de Gerenciamento de Risco"': '"Sinergia Bitrix24: Automação Total"',
    '"TotalTrac + Bitrix24: Chips & Aparelhos"': '"Sincronização Cósmica: Bitrix24 Integrado"',
    '"Atlas Copilotos: Agentes Autônomos de GR & Profile"': '"Legião Autônoma: Exército de Agentes IA"',
    '"TotalTrac Copilotos: Agentes de Telemetria"': '"Nexus Sintético: Operadores Virtuais"',
    '"Central de Scripts: Integrações de Software Logístico"': '"Manuscritos Digitais: Códigos de Integração"',
    '"Atlas Automação: Fluxos de Ocorrência & GR"': '"Orquestrador Neural: Fluxos de Automação"',
    '"TotalTrac Automação: Fluxos de Frota & M2M"': '"Motor Lógico: Processos Hiper-Automatizados"',
    '"Atlas Outreach: Ligações & E-mails de GR"': '"Impacto Outreach: Engenharia de Abordagem"',
    '"TotalTrac Outreach: Ligações & E-mails de Frota"': '"Máquina de Conexão: Outbound de Precisão"',
    '"Atlas Simulador Cognitivo: Comprador de Risco"': '"Cérebro Biônico: Previsão de Comportamento"',
    '"TotalTrac Simulador Cognitivo: Comprador de Frota"': '"Matriz Psicológica: Leitura de Mentes B2B"',
    '"Memória Atlas: Base de Conhecimento (RAG)"': '"Cofre Neural (RAG): Memória Institucional"',
    '"Memória TotalTrac: Base de Conhecimento (RAG)"': '"Córtex Vetorial: Repositório de Sabedoria"',
    '"Central de Motores de IA: Groq + Llama"': '"Coração do Sistema: Central de Motores Groq"',
    '"Relatórios: Geração & Interpretação por IA"': '"Olho de Agamotto: Visão Executiva IA"'
}

for old, new in replacements.items():
    content = content.replace(old, new)

# Add Sparkles import if not exists
if 'Sparkles' not in content:
    content = content.replace('LucideProps } from', 'LucideProps, Sparkles } from')
    content = content.replace('import {\n  Shield,', 'import {\n  Shield, Sparkles,')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated SinglePageDashboard.tsx")
