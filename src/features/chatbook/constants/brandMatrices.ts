export interface ObjectionItem {
  id: string;
  brand: 'atlasgr' | 'totaltrac';
  segment: string;
  persona: string;
  objectionTitle: string;
  objectionText: string;
  responseScript: string;
  keyDifferentiator: string;
}

export interface QualificationItem {
  id: string;
  brand: 'atlasgr' | 'totaltrac';
  segment: string;
  persona: string;
  framework: 'SPIN' | 'BANT' | 'MEDDPICC' | 'SNAP' | 'CHALLENGER';
  questionCategory: 'Situação' | 'Problema' | 'Implicação/Custo' | 'Necessidade/ROI';
  questionText: string;
  idealAnswer: string;
}

// ==================== GERADOR PROGRAMÁTICO ROBUTO (100 OBJEÇÕES + 100 QUALIFICAÇÕES) ====================

const ATLAS_SEGMENTS = [
  'SaaS & Tecnologia B2B',
  'Indústria & Manufatura',
  'Consultorias & Serviços Corporativos',
  'Logística & Transportes',
  'Varejo & E-commerce',
  'Fintech & Serviços Financeiros',
  'Educação & EdTech',
  'Saúde & MedTech',
  'Agrotech & Trading',
  'Imobiliário & Construtoras'
];

const ATLAS_PERSONAS = [
  'VP de Vendas / Diretor Comercial',
  'CFO / Diretor Financeiro',
  'CEO / Founder',
  'Head de Sales Ops / Pré-Vendas',
  'Gerente de Marketing / Growth'
];

const TOTALTRAC_SEGMENTS = [
  'Transportadoras & Logística',
  'Frotas Corporativas & Serviços',
  'Transporte Frigorificado & Carga Crítica',
  'Agronegócio & Máquinas Pesadas',
  'Distribuição & Atacado',
  'Locadoras de Veículos',
  'Gerenciadoras de Risco (GR)',
  'Transporte de Passageiros & Fretamento',
  'Construção Civil & Infraestrutura',
  'Entregas Urbanas & Last-Mile'
];

const TOTALTRAC_PERSONAS = [
  'Diretor de Logística & Operações',
  'Gerente de Frota & Manutenção',
  'Gerente de Risco & Segurança (GR)',
  'CFO / Diretor Financeiro',
  'Coordenador de Transportes'
];

// Gerador de 100 Objeções Reais B2B
function generate100Objections(): ObjectionItem[] {
  const list: ObjectionItem[] = [];
  let count = 1;

  // Base AtlasGR (50 Objeções)
  ATLAS_SEGMENTS.forEach((seg, sIdx) => {
    ATLAS_PERSONAS.forEach((per, pIdx) => {
      const objTitles = [
        `Já temos equipe de SDRs pesquisando no LinkedIn (${seg})`,
        `O orçamento comercial está congelado este trimestre`,
        `Como garanto a acurácia dos dados trazidos pela IA?`,
        `Não queremos trocar de sistema CRM atual`,
        `Minha equipe não tem tempo para aprender novas ferramentas`
      ];

      const objTexts = [
        `Minha equipe de vendas já busca leads manualmente no LinkedIn Sales Navigator e no Google.`,
        `Estamos cortando custos de software e não podemos aprovar novos contratos.`,
        `Já compramos listas antes que vieram cheias de e-mails inválidos e telefones errados.`,
        `Temos medo de atrito na migração e perda de dados do nosso histórico.`,
        `Os vendedores reclamam de ter que alimentar mais um sistema no dia a dia.`
      ];

      const scripts = [
        `Entendo perfeitamente. O problema é que 60% do tempo do seu SDR é desperdiçado copiando dados em vez de falar com decisores. Com o AtlasGR, a conta é enriquecida em 3 segundos, triplicando as reuniões agendadas.`,
        `Compreendo a cautela financeira. Porém, o AtlasGR reduz o CAC da ${seg} em 50% ao eliminar horas ociosas, pagando a assinatura já na primeira venda realizada.`,
        `Essa é a maior dor do mercado! O AtlasGR faz uma validação quádrupla em tempo real (Receita Federal + Google Places + Apollo + Verificação SMTP live), garantindo entrega superior a 95%.`,
        `Você não precisa trocar nada! O AtlasGR se conecta via API nativa ao seu CRM (Salesforce, HubSpot, etc), alimentando seu pipeline sem nenhuma migração burocrática.`,
        `O AtlasGR foi desenhado para zero fricção: o vendedor aciona a inteligência em 1 clique direto no navegador sem precisar preencher cadastros manuais.`
      ];

      const idx = (sIdx + pIdx) % 5;
      list.push({
        id: `obj-atlas-${count++}`,
        brand: 'atlasgr',
        segment: seg,
        persona: per,
        objectionTitle: objTitles[idx],
        objectionText: objTexts[idx],
        responseScript: scripts[idx],
        keyDifferentiator: 'Enriquecimento autônomo quádruplo e redução imediata de CAC.'
      });
    });
  });

  // Base TotalTrac (50 Objeções)
  TOTALTRAC_SEGMENTS.forEach((seg, sIdx) => {
    TOTALTRAC_PERSONAS.forEach((per, pIdx) => {
      const objTitles = [
        `Já temos rastreador instalado em toda a frota de ${seg}`,
        `Sombra de sinal e falta de cobertura celular no interior`,
        `O custo por veículo pesa na margem do frete`,
        `Motoristas reclamam do monitoramento de telemetria`,
        `Receio de falha no bloqueador e roubo de carga no RJ/SP`
      ];

      const objTexts = [
        `Nossa frota já possui rastreamento contratado de outra gerenciadora.`,
        `Nossos caminhões trafegam por rotas sem sinal de telefonia onde o rastreador perde a posição.`,
        `A margem da nossa operação logística é apertada para adicionar mais custos mensais por caminhão.`,
        `Os motoristas dizem que a telemetria é invasiva e atrapalha a rotina de viagem.`,
        `Trabalhamos com cargas de alto valor e precisamos de garantia total contra desvio e roubo.`
      ];

      const scripts = [
        `Ter rastreamento básico é essencial. Porém, o TotalTrac entrega telemetria avançada de combustível, corte remoto seguro e alertas que reduzem a manutenção da frota em 22%.`,
        `Por isso utilizamos chips M2M Multi-operadora (Vivo/Claro/TIM) com comutação instantânea e memória interna para 100.000 pontos offline em caso de sombra de sinal.`,
        `A economia média gerada apenas na prevenção de desvio de combustível e mau uso do motor é de R$ 450/mês por veículo, superando em muito o custo do rastreador.`,
        `A telemetria do TotalTrac é focada em direção defensiva e segurança do motorista. Inclusive, nossos clientes usam os dados para premiar os melhores condutores.`,
        `O TotalTrac é homologado pelas principais Gerenciadoras de Risco (GR) e Seguradoras, com botão de pânico silencioso, sensores térmicos e travamento autônomo.`
      ];

      const idx = (sIdx + pIdx) % 5;
      list.push({
        id: `obj-total-${count++}`,
        brand: 'totaltrac',
        segment: seg,
        persona: per,
        objectionTitle: objTitles[idx],
        objectionText: objTexts[idx],
        responseScript: scripts[idx],
        keyDifferentiator: 'Telemetria preditiva de combustível e chip Multi-operadora com memória offline.'
      });
    });
  });

  return list;
}

// Gerador de 100 Qualificações Reais B2B
function generate100Qualifications(): QualificationItem[] {
  const list: QualificationItem[] = [];
  let count = 1;

  const frameworks: Array<'SPIN' | 'BANT' | 'MEDDPICC' | 'SNAP' | 'CHALLENGER'> = ['SPIN', 'BANT', 'MEDDPICC', 'SNAP', 'CHALLENGER'];
  const categories: Array<'Situação' | 'Problema' | 'Implicação/Custo' | 'Necessidade/ROI'> = ['Situação', 'Problema', 'Implicação/Custo', 'Necessidade/ROI'];

  // Base AtlasGR (50 Qualificações)
  ATLAS_SEGMENTS.forEach((seg, sIdx) => {
    ATLAS_PERSONAS.forEach((per, pIdx) => {
      const questions = [
        `Como a equipe comercial da ${seg} realiza o mapeamento e qualificação de novos leads hoje?`,
        `Qual é o maior gargalo identificado ao abordar decisores no cargo de ${per}?`,
        `Quanto custa para a operação manter um ciclo de vendas longo devido a contatos desqualificados?`,
        `Se fosse possível validar 100% dos e-mails e telefones antes da ligação, quanto a conversão aumentaria?`,
        `Quais critérios de decisão técnicos (ex: integração API) o ${per} exige para aprovação?`
      ];

      const answers = [
        `Buscamos qualificação automatizada em menos de 2 minutos por conta.`,
        `Falta de telefones diretos e e-mails validados dos decisores C-Level.`,
        `O ciclo longo consome cerca de 15h semanais por SDR sem conversão garantida.`,
        `Estimamos um ganho imediato de 40% nas reuniões agendadas.`,
        `Integração nativa com CRM e conformidade total com a LGPD.`
      ];

      const idx = (sIdx + pIdx) % 5;
      list.push({
        id: `qual-atlas-${count++}`,
        brand: 'atlasgr',
        segment: seg,
        persona: per,
        framework: frameworks[idx % frameworks.length],
        questionCategory: categories[idx % categories.length],
        questionText: questions[idx],
        idealAnswer: answers[idx]
      });
    });
  });

  // Base TotalTrac (50 Qualificações)
  TOTALTRAC_SEGMENTS.forEach((seg, sIdx) => {
    TOTALTRAC_PERSONAS.forEach((per, pIdx) => {
      const questions = [
        `Como é feito o controle do consumo de combustível e paradas não autorizadas na frota de ${seg}?`,
        `Qual foi o impacto financeiro de sinistros ou roubos de carga no último ano para o ${per}?`,
        `Quanto a redução de 20% no custo de manutenção por veículo impactaria a margem da empresa?`,
        `Sua operação precisa de homologação imediata de Gerenciadora de Risco (GR) para transitar em rotas críticas?`,
        `Como o ${per} avalia a utilização de chips Multi-operadora com gravação offline para áreas sem sinal?`
      ];

      const answers = [
        `Buscamos telemetria em tempo real com alertas automáticos de desvio.`,
        `Cada sinistro gera um prejuízo médio de R$ 150.000 mais parada de ativo.`,
        `Representa uma economia direta de mais de R$ 50.000/mês na frota.`,
        `Sim, exigimos bloqueio autônomo e sirene homologados por Seguradoras.`,
        `É essencial para garantir 100% de visibilidade nas viagens do interior.`
      ];

      const idx = (sIdx + pIdx) % 5;
      list.push({
        id: `qual-total-${count++}`,
        brand: 'totaltrac',
        segment: seg,
        persona: per,
        framework: frameworks[idx % frameworks.length],
        questionCategory: categories[idx % categories.length],
        questionText: questions[idx],
        idealAnswer: answers[idx]
      });
    });
  });

  return list;
}

export const BRAND_OBJECTIONS: ObjectionItem[] = generate100Objections();
export const BRAND_QUALIFICATIONS: QualificationItem[] = generate100Qualifications();
