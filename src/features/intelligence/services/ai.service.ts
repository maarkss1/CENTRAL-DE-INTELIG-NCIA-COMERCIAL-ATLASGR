import { getAiModel, logAiUsage, withRetry } from '../../../lib/ai/gateway.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { compileLeadGraph } from '../graphs/leadQualification.js';
import { prisma } from '../../../lib/prisma.js';
import { redactSensitiveData, minimizePii, rehydratePii, type PiiToken } from './guardrails.service.js';

export type ContentTool =
    | 'script_call'
    | 'script_whatsapp'
    | 'script_email'
    | 'prompt'
    | 'objections'
    | 'followup'
    | 'profile'
    | 'risk'
    | 'linkedin_invite'
    | 'voicemail'
    | 'roi_pitch'
    | 'competitor_battlecard'
    | 'cadence_sequence';

/**
 * Material de referência extraído literalmente do Playbook de Pré-Vendas Atlas e do Playbook
 * Comercial - AtlasGR (pasta Desktop/DOCUMENTOS IMPORTANTES ATLASGR). Embutido nos prompts para
 * que os scripts gerados sigam a estrutura e o tom já validados pelo time comercial da Atlas, em
 * vez da IA inventar uma abordagem genérica do zero a cada chamada.
 */
const ATLAS_CALL_STRUCTURE_REFERENCE = `
ESTRUTURA REAL DE COLD CALL DA ATLAS (adapte ao lead, não copie literalmente):
1) ABERTURA: confirmar que é a pessoa certa antes de qualquer pitch — "Aqui é [SDR] da Atlas. Rapidinho: falo com quem responde por operação e tratativa de ocorrências/risco no transporte aí?". Se não for, pedir o responsável com educação, sem soar como spam.
2) CONTEXTO (1-2 frases): citar o cenário provável do lead (expansão operacional / pressão de risco recente / troca de liderança) — "Tenho falado com transportadoras em [cenário] e normalmente o que aparece é [dor típica]".
3) MINI-PITCH (sem monólogo): "A Atlas entra como torre/GR operacional pra fazer gestão por exceção — não só alerta, orquestra a tratativa com SLA e gera evidência. Antes: isso é um problema real aí ou já está redondo?"
4) PERGUNTAS DE DOR (escolha 2-3, do amplo pro específico): "Hoje, quando sai do trilho, vocês descobrem cedo ou tarde demais?" / "O que mais acontece: atraso crítico, desvio de rota, sinistro?" / "Por que olhar isso agora — o que mudou nos últimos meses?"
5) CONEXÃO DE IMPACTO (sem dramatizar): traduzir a dor em consequência concreta (SLA estourando, retrabalho, atrito com seguradora).
6) CTA consultivo, só se qualificou: "Pelo que você descreveu, parece que tem fit. Prefere amanhã 10h ou 16h?"
Regra de ouro: sempre oferecer 2 horários + alternativa por WhatsApp/LinkedIn.
`.trim();

const ATLAS_OBJECTIONS_REFERENCE = `
MATRIZ REAL DE OBJEÇÕES DA ATLAS (use as 3 mais prováveis para ESTE lead — adapte a linguagem, não invente objeções novas fora desta lista a menos que nenhuma se aplique):
- "Já temos fornecedor/gerenciadora/rastreador" → Implicação: ferramenta sem tratativa é alarme tocando em casa vazia. Pergunta: "Quando acontece um desvio, quem trata, em quanto tempo, com qual SLA? Ou hoje vira WhatsApp e esperança?"
- "Estamos satisfeitos" → Implicação: satisfeito até o dia que vira incidente. Pergunta: "O que teria que acontecer pra revisitarem isso: sinistro, pressão de seguradora, SLA estourando?"
- "Não é prioridade agora" → Implicação: o risco não espera o roadmap. Pergunta: "O que vocês estão priorizando no lugar? Qual o custo de manter como está nos próximos 90 dias?"
- "Manda material" → Implicação: material sem contexto vira PDF enterrado. Pergunta: "Pra não te mandar algo inútil: vocês estão mais no cenário de expansão, pressão de risco ou troca de liderança?"
- "Estamos em contrato/fidelidade" → Implicação: esperar acabar é comprar no desespero. Pergunta: "Quando vence? Dá pra rodar um escopo crítico em paralelo pra medir ganho?"
- "Agora tá corrido" → Implicação: corrido é o estado natural da logística — a pergunta é se é por eficiência ou por incêndio. Pergunta: "Hoje vocês descobrem os problemas cedo ou tarde demais?"
- "Isso é com o [outro cargo]" → Implicação: falar com a pessoa errada vira spam. Pergunta: "Quem é o dono disso quando dá ruim? Qual a melhor forma de eu abordar sem tomar tempo de vocês?"
- "Não queremos mudar processo / já tentamos e deu ruim" → Implicação: não mudar não elimina o problema, só mantém o risco. Pergunta: "O que deu errado na última tentativa: integração, adesão do time, falta de tratativa, ou o fornecedor sumiu?"
- "A gente resolve internamente" → Implicação: interno é ótimo até virar dependência de herói. Pergunta: "Quando a pessoa-chave sai de férias, o processo segura ou vira caos?"
- "Isso parece mais custo do que ganho" → Implicação: você já paga, só não chama de custo. Pergunta: "Quantas ocorrências por semana? Quanto tempo de time isso consome? Qual o impacto em SLA/sinistro?"
- "Nosso TMS/ERP já cobre isso" → Implicação: TMS é o mapa, a Torre é a ambulância e o protocolo. Pergunta: "No TMS vocês conseguem orquestrar tratativa com SLA e evidência quando sai do trilho?"
- "Não temos volume pra isso" → Implicação: volume baixo com alto risco ainda machuca. Pergunta: "Quantas viagens/mês e qual o perfil de risco/valor da carga?"
- "A seguradora que manda, não eu" → Implicação: então você precisa de algo que ajude a cumprir e provar. Pergunta: "Quais exigências mais doem hoje: cadastro, jornada, evidência, tratativa?"
- "Já temos torre de controle" → Implicação: se a torre só observa, é vigilância sem ação. Pergunta: "A torre de vocês executa tratativa com SLA e fecha o loop, ou só reporta?"
- "A Atlas é mais uma" → Implicação: mais uma é a que fala, diferente é a que trata e prova. Pergunta: "Se em 30 dias eu provar redução de exceções e tempo de tratativa, isso muda o jogo?"
`.trim();

const ATLAS_COMPETITORS_REFERENCE = `
MATERIAL INTERNO DE POSICIONAMENTO COMPETITIVO (trate os possíveis gaps como hipóteses a validar, não como fatos públicos):
- RasterGR: forte em atendimento tradicional, fraco em tecnologia integrada — menos foco em orquestração de dados. Gancho: "Muitos clientes relatam dificuldade de consolidar dados em um único lugar. Como vocês conseguem visibilidade integrada hoje?"
- Buonny: marca tradicional com +30 anos e grande base, mas pode ser percebida como tradicional em tecnologia, atendimento em fila, foco forte em GR isolado sem visão operacional consolidada. Gancho: "Muitos clientes dizem que conseguem cadastro e monitoramento, mas falta visão consolidada de performance e compliance numa só solução."
- BRK Tecnologia: portfólio amplo (GR + logística + prevenção) mas complexo de implementar em operações médias, pode soar pouco específico. Gancho: "BRK tem solução ampla, mas clientes relatam dificuldade de extrair BI acionável rápido."
- OpentechGR: forte em gestão de temperatura e torre de controle, mas passou por reestruturação recente e menor penetração de mercado. Gancho: "A torre deles dá insights em tempo real — mas isso já se traduziu em redução efetiva de custo e SLA?"
- Apisul: combina seguro + GR + inteligência logística, mas pode confundir foco por ser abrangente demais, integração com dados mais limitada. Gancho: "Apisul une seguro e GR num pacote — isso é tratamento de risco ou só mitigação de custo? Como vocês medem retorno hoje?"
- Servis: +25 anos de experiência tradicional em rastreamento e prevenção de perdas, mas marca menor, menos tecnologia própria, sem BI/reporting moderno. Gancho: "Servis tem tradição, mas a capacidade de integrar dados operacionais pra decisão ainda é manual?"
Posicionamento da Atlas contra todos eles: orquestração real de dados (não GR isolado), implantação rápida via Atlas Profile como porta de entrada, modelo consultivo orientado a ROI mensurável — não "mais um monitoramento".
`.trim();

const SYSTEM_PREAMBLE = `Você é uma inteligência artificial analítica, atuando como Arquiteto de Soluções e Estrategista de Vendas B2B Enterprise da Atlas (SaaS de inteligência logística).
Sua missão é gerar saídas precisas, rastreáveis aos dados fornecidos e acionáveis, voltadas para conversão e redução de risco logístico.
DIRETRIZES CRÍTICAS:
1. PRECISÃO IMPLACÁVEL: Zero jargões vazios ("sinergia", "estado da arte"). Fale em dor real: SLA estourando, custo de ociosidade, dependência de WhatsApp, pressão da seguradora.
2. ANÁLISE CIRÚRGICA: Absorva os dados do lead e ataque o ponto mais vulnerável. Se for transportadora, foque em eficiência de frota e repasse. Se for embarcador, foque em visibilidade e auditoria.
3. CONTEXTO É LEI: Ancore a resposta NOS DADOS FORNECIDOS (nome, região, tecnologias). NUNCA alucine fatos (números ou nomes não fornecidos).
4. SAÍDA DIRETA: Responda EXATAMENTE o que foi pedido, em Markdown elegante. SEM introduções ("Aqui está..."). Use tom seguro e consultivo, mas deixe incertezas e lacunas explícitas.`;

const TOTALTRAC_SYSTEM_PREAMBLE = `Você é uma inteligência artificial analítica de alto nível, atuando como Arquiteto de Soluções e Estrategista de Vendas B2B Enterprise da TotalTrac.
A TotalTrac atua com telemetria CAN, videotelemetria com IA, controle de jornada, iscas RF e imobilizadores.
DIRETRIZES CRÍTICAS:
1. PRECISÃO: não invente números, clientes, funcionalidades, compatibilidades ou integrações.
2. CONTEXTO: use os dados fornecidos do lead. Trate toda dor não confirmada como hipótese a validar.
3. FOCO: conecte a conversa a segurança da frota, comportamento de condução, jornada, visibilidade operacional e proteção do ativo somente quando houver aderência.
4. SAÍDA DIRETA: responda exatamente o solicitado, em Markdown claro, com tom consultivo e sem jargões vazios.`;

/** Quando há contexto real do lead, força a IA a efetivamente USAR os dados em vez de ignorá-los. */
const GROUNDING_INSTRUCTION = `\n\nIMPORTANTE: use pelo menos 2 dados concretos do contexto do lead acima (nome da empresa, cidade/região, segmento, tecnologia detectada, ou algo do resumo de enriquecimento) — o texto tem que ficar claramente sobre ESSA empresa, não algo genérico que serviria para qualquer lead.`;

/** Modelo e temperatura por ferramenta: gemini-pro (mais raciocínio) para diagnóstico/estratégia,
 * onde precisão importa mais que velocidade; gemini-flash para scripts/mensagens mais diretos. Temperaturas
 * mais baixas em ferramentas analíticas (menos "criatividade", mais aderência aos dados reais); mais altas
 * em ferramentas de copywriting social, onde variação de tom é desejável. */
const TOOL_CONFIG: Record<ContentTool, { model: 'gemini-pro' | 'gemini-flash'; temperature: number }> = {
    script_call: { model: 'gemini-flash', temperature: 0.7 },
    script_whatsapp: { model: 'gemini-flash', temperature: 0.85 },
    script_email: { model: 'gemini-flash', temperature: 0.65 },
    prompt: { model: 'gemini-pro', temperature: 0.5 },
    objections: { model: 'gemini-pro', temperature: 0.45 },
    followup: { model: 'gemini-flash', temperature: 0.6 },
    profile: { model: 'gemini-pro', temperature: 0.5 },
    risk: { model: 'gemini-pro', temperature: 0.4 },
    linkedin_invite: { model: 'gemini-flash', temperature: 0.8 },
    voicemail: { model: 'gemini-flash', temperature: 0.65 },
    roi_pitch: { model: 'gemini-pro', temperature: 0.4 },
    competitor_battlecard: { model: 'gemini-pro', temperature: 0.4 },
    cadence_sequence: { model: 'gemini-pro', temperature: 0.6 },
};

/** Instruções específicas de cada ferramenta — o "molde" de cada tipo de conteúdo gerado. */
const TOOL_PROMPTS: Record<ContentTool, string> = {
    script_call: `Crie um script de Cold Call para o time comercial ligar para este lead agora, seguindo a estrutura real de ligação da Atlas abaixo — adapte cada bloco ao contexto do lead, não copie literalmente:
${ATLAS_CALL_STRUCTURE_REFERENCE}
Formate a resposta nos 6 blocos numerados acima, cada um pronto para ser falado ao telefone (frases curtas, linguagem natural, sem jargão corporativo).`,

    script_whatsapp: `Crie DUAS variações de mensagem de prospecção para WhatsApp (Social Selling), seguindo a régua real da Atlas: curto + contexto + 1 pergunta objetiva, nunca texto longo. Rotule "VARIAÇÃO A (validar fit — primeiro contato)" seguindo o padrão "Oi, [Nome]! Aqui é [SDR] da Atlas. Vi [contexto curto]. Rápido: hoje quando dá exceção (atraso/desvio/ocorrência), vocês tratam com SLA ou ainda cai no WhatsApp?" e "VARIAÇÃO B (mais neutra, sem soar vendas)" perguntando direto quem responde por tratativa de ocorrências/GR na empresa. Nenhuma das duas deve pedir reunião de cara — isso só depois de confirmar fit.`,

    script_email: `Crie um Cold E-mail seguindo a estrutura real da Atlas: DUAS opções de assunto curtas (3-6 palavras, específicas, sem "proposta"/"parceria"/"URGENTE") e UM corpo com 4 partes: 1) conectar com o contexto do lead (cenário: expansão/pressão de risco/troca de liderança), 2) apontar consequência sem dramatizar (SLA estourando, retrabalho, atrito com seguradora quando a tratativa é manual), 3) posicionar a Atlas como gestão por exceção — não "mais um monitoramento", 4) CTA simples de uma pergunta binária sobre como tratam exceção hoje. Máximo 120 palavras no corpo.`,

    prompt: `Crie 4 perguntas de qualificação profundas (estilo BANT/SPIN) para a próxima ligação/reunião com este lead, cada uma seguida de UMA linha explicando o que a resposta revela para o vendedor (ex: orçamento, autoridade, urgência, ou o tamanho real da dor).`,

    objections: `Monte uma matriz com as 3 objeções MAIS PROVÁVEIS para este lead específico, escolhidas a partir da matriz real de objeções da Atlas abaixo — adapte a linguagem ao contexto do lead, mas mantenha a implicação e a pergunta de contorno fiéis ao material:
${ATLAS_OBJECTIONS_REFERENCE}
Formate cada uma como "OBJEÇÃO → IMPLICAÇÃO → PERGUNTA DE CONTORNO".`,

    followup: `Crie um e-mail de follow-up pós-reunião de demonstração para este lead. Reforce em 2-3 bullets apenas os benefícios e combinados explicitamente presentes no contexto. Se o contexto não trouxer detalhes da reunião, use placeholders claros para revisão do vendedor em vez de inventar. Proponha um próximo passo com data a confirmar.`,

    profile: `Crie uma hipótese de abordagem para o decisor usando princípios de comunicação do DiSC, sem diagnosticar nem atribuir um perfil comportamental com base apenas em cargo ou segmento. Indique: (1) sinais que o vendedor deve observar, (2) duas adaptações de tom possíveis condicionadas a esses sinais, (3) perguntas para confirmar preferência de comunicação e (4) um erro comum a evitar.`,

    risk: `Liste os 3 maiores riscos que podem fazer a Atlas perder esta negociação no final do funil, considerando os dados reais do lead abaixo (situação cadastral, porte, região, temperatura). Para cada risco, dê uma ação preventiva concreta a tomar ainda nesta semana.`,

    linkedin_invite: `Crie um convite de conexão no LinkedIn (máximo 300 caracteres, sem saudação genérica tipo "Olá, gostaria de me conectar") e, em seguida, uma mensagem de follow-up para enviar 2 dias depois de aceito o convite, iniciando a conversa comercial sem parecer um script de vendas.`,

    voicemail: `Crie um script de recado de caixa postal (voicemail) para quando o decisor não atender a ligação. Deve durar entre 20-30 segundos falado (aproximadamente 60-80 palavras), dizer quem liga e por quê em uma frase, deixar um motivo específico de retorno (não "gostaria de conversar"), e terminar com telefone/e-mail para retorno.`,

    roi_pitch: `Monte um roteiro para quantificar o impacto financeiro do risco logístico deste lead. Use números somente quando estiverem explicitamente no contexto. Quando faltarem dados, apresente uma fórmula com variáveis nomeadas (por exemplo: ocorrências/mês × custo médio por ocorrência) e as perguntas necessárias para preenchê-la; não forneça benchmarks de memória. Deixe claro o que é dado, cálculo ou lacuna e termine pedindo os números reais do lead.`,

    competitor_battlecard: `O lead mencionou ou usa um concorrente da Atlas (nome informado abaixo, em "Concorrente mencionado"). Use o material interno apenas para formular hipóteses de descoberta: (1) reconheça sem desmerecer o fornecedor atual, (2) transforme qualquer possível gap em pergunta neutra, sem afirmá-lo como fato, (3) conecte a resposta esperada ao posicionamento da Atlas e (4) feche com uma pergunta que permita ao lead confirmar ou refutar a hipótese. Material interno:
${ATLAS_COMPETITORS_REFERENCE}
Se o concorrente informado não estiver na lista, não atribua forças ou fraquezas específicas: investigue orquestração de dados, tratativa, SLA e mensuração de retorno com perguntas abertas.`,

    cadence_sequence: `Crie uma sequência completa de cadência de prospecção outbound de 5 dias (Steps) para este lead, alternando entre E-mail, LinkedIn e Call.
Estrutura exigida:
- Dia 1: E-mail (Abertura focada na dor principal) + Convite de LinkedIn.
- Dia 3: Call (Roteiro curto de 30 seg) + E-mail de Follow-up caso não atenda.
- Dia 5: E-mail de "Break-up" amigável (tentativa final de conexão).
Use o contexto do lead fornecido para personalizar fortemente a dor e a abordagem.`,
};

const TOTALTRAC_TOOL_OVERRIDES: Partial<Record<ContentTool, string>> = {
    script_call: `Crie um script de cold call em 6 blocos: (1) confirmação da pessoa responsável por frota/operação,
(2) contexto curto, (3) duas perguntas de diagnóstico, (4) hipótese de impacto, (5) posicionamento da TotalTrac
sem prometer resultado não comprovado e (6) próximo passo simples. Use frases naturais e prontas para falar.`,
    script_whatsapp: `Crie duas mensagens curtas de primeiro contato por WhatsApp. Cada uma deve citar um contexto
real do lead, levantar uma hipótese sobre visibilidade/segurança da frota e terminar com uma única pergunta.
Não peça reunião antes de validar o fit.`,
    script_email: `Crie duas opções de assunto e um cold e-mail de até 120 palavras. Conecte o contexto do lead a
uma hipótese relevante para telemetria, videotelemetria, jornada ou proteção do ativo; apresente a TotalTrac sem
inventar ganhos; termine com uma pergunta objetiva sobre o processo atual.`,
    objections: `Monte as 3 objeções mais prováveis para uma conversa sobre tecnologia de frota. Para cada uma,
responda no formato "OBJEÇÃO → COMO RECONHECER → PERGUNTA DE DIAGNÓSTICO". Não desmereça fornecedores atuais
e não alegue diferenciais que não foram fornecidos.`,
    followup: `Crie um e-mail de follow-up pós-reunião para a TotalTrac. Resuma somente o contexto disponível,
liste até 3 pontos a validar sobre frota/segurança/jornada e proponha um próximo passo com responsável e prazo.`,
    risk: `Liste os 3 riscos comerciais mais prováveis desta negociação para a TotalTrac. Para cada risco,
explique o sinal observado nos dados recebidos e uma ação preventiva concreta. Não trate ausência de dado como fato.`,
    competitor_battlecard: `Crie um contorno consultivo para o concorrente informado: reconheça que a solução
atual pode atender parte da operação, faça perguntas sobre lacunas de telemetria, jornada, evidência em vídeo e
proteção do ativo, e sugira um critério objetivo de comparação. Não invente fatos sobre o concorrente.`,
};

export interface GenerateContentOptions {
    competitor?: string;
    tone?: string;
    objective?: string;
    personaFallback?: string;
    brandId?: 'atlasgr' | 'totaltrac';
    organizationId?: string;
}

/**
 * Discurso por PIC — da "Matriz de Decisão e Convencimento" do Playbook de Pré-Vendas Atlas. O PIC
 * é setado manualmente pelo SDR/AM (nunca inferido), então só entra no contexto quando o lead já
 * tem um PIC confirmado.
 */
const PIC_GUIDANCE: Record<string, string> = {
    PIC1_Expansao: 'PIC 1 (Expansão Operacional): a dor é "a operação cresce e o controle não escala junto" — volume/rotas/terceiros aumentando, monitoramento virou central de repasse. Gatilho: explosão de volume/rotas. Fale de previsibilidade, produtividade do time e sair do "modo incêndio".',
    PIC2_Risco: 'PIC 2 (Pressão de Risco): a dor é sinistro/ocorrência relevante, medo de não-cobertura, exigência de seguradora endurecida. Gatilho: sinistro grande ou auditoria recente. Fale de defensabilidade — evidência, trilha, conformidade — não "monitoramento".',
    PIC3_Transicao: 'PIC 3 (Transição de Liderança): a dor é operação sem dono "de verdade", fornecedores intocáveis, visibilidade executiva ruim. Gatilho: nova liderança com mandato de "arrumar a casa" nos primeiros 90 dias. Fale de governança pronta, resultados visíveis cedo, "no surprises" para a diretoria.',
};

interface LeadContext {
    text: string;
    companyName?: string;
    contactName?: string;
}

/** Monta um bloco de contexto real (Company + Contact + Lead) para personalizar o prompt — sem isso, a IA só produz conteúdo genérico. */
async function buildLeadContext(leadId?: string | null, organizationId?: string): Promise<LeadContext> {
    if (!leadId) return { text: '' };

    const lead = await prisma.lead.findFirst({
        where: {
            id: leadId,
            ...(organizationId ? { organizationId } : {}),
        },
        include: { company: true, contact: true },
    });
    if (!lead) return { text: '' };

    const c = lead.company;
    const p = lead.contact;
    const lines: string[] = [];

    if (c) {
        lines.push(`- Empresa: ${c.tradeName}${c.legalName && c.legalName !== c.tradeName ? ` (razão social: ${c.legalName})` : ''}`);
        if (c.segment) lines.push(`- Segmento: ${c.segment}`);
        if (c.city || c.state) lines.push(`- Localização: ${[c.city, c.state].filter(Boolean).join(', ')}`);
        if (c.size) lines.push(`- Porte: ${c.size}${c.employeeCount ? ` (estimativa de ~${c.employeeCount} funcionários)` : ''}`);
        if (c.situacaoCadastral) lines.push(`- Situação cadastral (Receita Federal): ${c.situacaoCadastral}`);
        if (c.googleRating != null) lines.push(`- Reputação no Google: nota ${c.googleRating} (${c.googleReviewsCount ?? 0} avaliações)`);
        if (c.technologies?.length) lines.push(`- Tecnologias em uso: ${c.technologies.slice(0, 6).join(', ')}`);
        if (c.observations) lines.push(`- Resumo do enriquecimento: ${c.observations}`);
    }
    if (p) {
        lines.push(`- Contato/decisor: ${p.name}${p.role ? `, cargo: ${p.role}` : ''}${p.department ? ` (departamento: ${p.department})` : ''}`);
    }
    if (lead.temperature || lead.score != null) {
        lines.push(`- Temperatura do lead: ${lead.temperature ?? 'não avaliada'}${lead.score != null ? ` (score ${lead.score}/100)` : ''}`);
    }
    if (lead.source) lines.push(`- Origem do lead: ${lead.source}`);
    if (lead.pic && PIC_GUIDANCE[lead.pic]) {
        lines.push(`- ${PIC_GUIDANCE[lead.pic]}`);
    }

    if (lines.length === 0) return { text: '' };

    return {
        text: `\n\n## Contexto real deste lead — use estes dados, não invente outros:\n${lines.join('\n')}`,
        companyName: c?.tradeName,
        contactName: p?.name,
    };
}

export class AIService {
    async generateContent(tool: string, leadId?: string | null, extra?: GenerateContentOptions) {
        if (!(tool in TOOL_PROMPTS)) {
            throw new Error('Invalid tool');
        }
        const toolId = tool as ContentTool;

        const isTotalTrac = extra?.brandId === 'totaltrac';
        const basePreamble = isTotalTrac ? TOTALTRAC_SYSTEM_PREAMBLE : SYSTEM_PREAMBLE;
        const userSections: string[] = [];
        if (extra?.tone) userSections.push(`Tom solicitado pelo usuário: ${extra.tone}`);
        if (extra?.objective) userSections.push(`Objetivo informado pelo usuário: ${extra.objective}`);

        const toolPrompt = isTotalTrac
            ? TOTALTRAC_TOOL_OVERRIDES[toolId] || TOOL_PROMPTS[toolId]
            : TOOL_PROMPTS[toolId];
        let systemPrompt = `${basePreamble}\n\n${toolPrompt}`;

        if (toolId === 'competitor_battlecard') {
            if (!extra?.competitor?.trim()) {
                throw new Error('Missing competitor');
            }
            userSections.push(`Concorrente mencionado pelo usuário: ${extra.competitor.trim()}`);
        }

        // Prompt customizado salvo no banco (se existir) tem prioridade sobre o padrão da ferramenta.
        const dbPrompt = await prisma.prompt.findFirst({ where: { category: tool } });
        if (dbPrompt?.variables) {
            systemPrompt += `\n\nInstruções adicionais definidas pelo time: ${JSON.stringify(dbPrompt.variables)}`;
        }

        const context = await buildLeadContext(leadId, extra?.organizationId);
        // Minimiza PII (hoje: nome do contato) antes de enviar o contexto ao provedor de IA
        // externo. O nome real só é restaurado na resposta final (ver `rehydratePii` abaixo),
        // preservando personalização de ferramentas como e-mail/WhatsApp sem expor o dado
        // durante a geração pelo modelo.
        let piiTokens: PiiToken[] = [];
        if (context.text) {
            systemPrompt += GROUNDING_INSTRUCTION;
            const minimized = minimizePii(context.text, [{ token: '[NOME_DO_CONTATO]', value: context.contactName }]);
            userSections.push(minimized.text);
            piiTokens = minimized.applied;
        } else if (extra?.personaFallback) {
            userSections.push(`Contexto manual disponível: persona alvo = ${extra.personaFallback}. Não há lead selecionado; não invente empresa, região, porte ou tecnologia.`);
        } else {
            userSections.push('Nenhum lead foi selecionado para esta solicitação.');
        }
        const userPrompt = userSections.join('\n\n');

        // Configuração editável via AIConfigCenter tem prioridade sobre o padrão hardcoded da ferramenta.
        const customSetting = await prisma.aiEngineSetting.findUnique({ where: { toolKey: toolId } });
        const { model: modelAlias, temperature } = customSetting
            ? { model: customSetting.model, temperature: customSetting.temperature }
            : TOOL_CONFIG[toolId];
        const model = getAiModel(modelAlias, temperature, toolId);
        const startTime = Date.now();
        let response;
        try {
            response = await withRetry(() => model.invoke([
                new SystemMessage(systemPrompt),
                new HumanMessage(userPrompt),
            ]));
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new Error(`Não foi possível gerar o conteúdo agora (ferramenta: ${toolId}). ${detail}`);
        }
        const latencyMs = Date.now() - startTime;

        await logAiUsage({
            model: response.response_metadata.model,
            usage: response.response_metadata.tokenUsage,
            latencyMs,
            promptId: dbPrompt?.id,
        });

        const redacted = redactSensitiveData(response.content).text;
        return piiTokens.length > 0 ? rehydratePii(redacted, piiTokens) : redacted;
    }

    async qualifyLead(leadId: string, companyInfo: string) {
        const graph = compileLeadGraph();
        const finalState = await graph.invoke({ leadId, companyInfo });
        return finalState;
    }
}
export const aiService = new AIService();
