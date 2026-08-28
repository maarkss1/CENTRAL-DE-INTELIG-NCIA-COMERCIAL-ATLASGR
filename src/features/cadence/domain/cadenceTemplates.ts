export interface CadenceJourneyTemplate {
  id: string;
  name: string;
  targetBrand: 'AtlasGR' | 'TotalTrac' | 'Ambas';
  category: 'Outbound' | 'Inbound' | 'Reativação' | 'Fechamento' | 'Nutrição';
  description: string;
  persona: string;
  touches: {
    order: number;
    channel: 'email' | 'whatsapp' | 'voice';
    delayHoursFromPrevious: number;
    maxAttempts?: number;
    templateRef: string;
    stepTitle: string;
  }[];
}

export const CADENCE_JOURNEY_TEMPLATES: CadenceJourneyTemplate[] = [
  {
    id: 'outbound-frota-pesada-can',
    name: 'Outbound B2B Frota Pesada (Telemetria CAN & Diesel - AtlasGR)',
    targetBrand: 'AtlasGR',
    category: 'Outbound',
    persona: 'Diretores de Operações, Gerentes de Logística e Gestores de Frota Pesada',
    description:
      'Cadência focada em transportadoras e frotas de carga pesada, explorando economia real de diesel (8-12%), auditoria de freadas/RPM e telemetria CAN.',
    touches: [
      {
        order: 1,
        channel: 'whatsapp',
        delayHoursFromPrevious: 0,
        stepTitle: 'Diagnóstico Consultivo WhatsApp',
        templateRef:
          'Olá {{contact_name}}! Notei que você gerencia a operação na {{company_name}}. Desenvolvemos uma auditoria de telemetria CAN na AtlasGR que reduz em média 9.4% o consumo de diesel e sinistros em frotas pesadas. Gostaria de ver o benchmark do seu segmento?',
      },
      {
        order: 2,
        channel: 'email',
        delayHoursFromPrevious: 4,
        stepTitle: 'Estudo de Caso & ROI Diesel',
        templateRef:
          'Assunto: Benchmark de Redução de Combustível — {{company_name}} & AtlasGR\n\nOlá {{contact_name}},\n\nComplementando minha mensagem no WhatsApp, estou compartilhando nosso estudo de caso com telemetria direta na rede CAN do caminhão. Conseguimos identificar ponto morto excessivo, banguela eletrônica e frenagens bruscas em tempo real.\n\nPodemos fazer uma call rápida de 15 minutos para avaliar a aderência na sua frota?',
      },
      {
        order: 3,
        channel: 'voice',
        delayHoursFromPrevious: 24,
        stepTitle: 'Ligação de Qualificação SDR',
        templateRef:
          'Ligação do SDR da AtlasGR apresentando diagnósticos de risco e convidando o decisor para uma demonstração com o especialista de engenharia de telemetria.',
      },
      {
        order: 4,
        channel: 'whatsapp',
        delayHoursFromPrevious: 48,
        stepTitle: 'Demonstração em Vídeo & Prova de Conceito',
        templateRef:
          '{{contact_name}}, gravei um vídeo de 1 minuto mostrando como o painel de inteligência da AtlasGR avisa o gestor no momento exato de uma infração de telemetria. Consegue dar uma olhada rápida hoje?',
      },
      {
        order: 5,
        channel: 'email',
        delayHoursFromPrevious: 72,
        stepTitle: 'Link de Agendamento Direto',
        templateRef:
          'Assunto: Próximos passos para teste piloto na {{company_name}}\n\nOlá {{contact_name}},\n\nSei que a rotina operacional é corrida. Caso faça sentido avaliar a implantação de um teste piloto em 3 a 5 veículos da sua frota sem custo de adesão, escolha o melhor horário diretamente na minha agenda:\n\n👉 {{booking_link}}\n\nUm abraço,\nEquipe AtlasGR',
      },
    ],
  },
  {
    id: 'inbound-speed-lead-totaltrac',
    name: 'Inbound Speed Lead (Contato Rápido Antifurto & Rastreamento - TotalTrac)',
    targetBrand: 'TotalTrac',
    category: 'Inbound',
    persona: 'Proprietários de Frotas Leves, Vãs, Utilitários e Compradores de Segurança Veicular',
    description:
      'Sequência de ultra-velocidade para converter leads que solicitaram cotação no site em menos de 5 minutos, garantindo alta taxa de conversão.',
    touches: [
      {
        order: 1,
        channel: 'whatsapp',
        delayHoursFromPrevious: 0,
        stepTitle: 'Boas-vindas Instantâneas WhatsApp',
        templateRef:
          'Olá {{contact_name}}! Recebemos sua solicitação de cotação de rastreamento veicular e antifurto na TotalTrac. Para qual tipo de veículo e cidade você precisa de cobertura imediata?',
      },
      {
        order: 2,
        channel: 'voice',
        delayHoursFromPrevious: 1,
        stepTitle: 'Ligação Rápida de Atendimento',
        templateRef:
          'Ligação automática de atendimento para dimensionar a quantidade de rastreadores, botão de pânico e central 24h com pronta resposta.',
      },
      {
        order: 3,
        channel: 'email',
        delayHoursFromPrevious: 24,
        stepTitle: 'Tabela de Planos & Cobertura Nacional',
        templateRef:
          'Assunto: Cotação de Rastreamento Veicular TotalTrac para {{company_name}}\n\nOlá {{contact_name}},\n\nConforme conversamos, segue anexo nossa proposta comercial com cobertura nacional 4G/GPS, bloqueio remoto e assistência 24h com equipe de pronta resposta armada.\n\nFicou com alguma dúvida sobre a instalação?',
      },
      {
        order: 4,
        channel: 'whatsapp',
        delayHoursFromPrevious: 48,
        stepTitle: 'Validação de Fechamento com Condição Especial',
        templateRef:
          'Oi {{contact_name}}, conseguimos uma condição especial de instalação gratuita para os veículos da {{company_name}} se fecharmos a ativação esta semana. O que acha de finalizarmos o cadastro?',
      },
    ],
  },
  {
    id: 'reativacao-no-show',
    name: 'Reativação de No-Show / Call Perdida (Resgate com Voice + WhatsApp)',
    targetBrand: 'Ambas',
    category: 'Reativação',
    persona: 'Leads que agendaram reunião mas não compareceram',
    description:
      'Fluxo empático e automatizado para recuperar leads que faltaram à call agendada sem parecer invasivo.',
    touches: [
      {
        order: 1,
        channel: 'whatsapp',
        delayHoursFromPrevious: 0,
        stepTitle: 'WhatsApp Empático pós-falta',
        templateRef:
          'Olá {{contact_name}}! Imaginei que imprevistos operacionais urgentes tenham surgido no horário da nossa reunião hoje. Sem problemas! Quer reagendar para amanhã ou prefere que eu ligue no final da tarde?',
      },
      {
        order: 2,
        channel: 'email',
        delayHoursFromPrevious: 24,
        stepTitle: 'Resumo em Vídeo & Remarcação',
        templateRef:
          'Assunto: Reagendamento de demonstração — {{company_name}}\n\nOlá {{contact_name}},\n\nPara adiantar seu tempo, gravei uma visão geral da plataforma (3 minutos). Se quiser escolher um novo horário no seu ritmo, basta acessar meu calendário:\n\n👉 {{booking_link}}',
      },
      {
        order: 3,
        channel: 'voice',
        delayHoursFromPrevious: 48,
        stepTitle: 'Ligação de Checagem do SDR',
        templateRef:
          'Ligação curta e educada para checar se o projeto de monitoramento de frotas continua sendo prioridade para este trimestre.',
      },
    ],
  },
  {
    id: 'aceleracao-pos-proposta',
    name: 'Aceleração Pós-Proposta & Fechamento (Follow-up Decisores & ROI)',
    targetBrand: 'Ambas',
    category: 'Fechamento',
    persona: 'Decisores em fase final de avaliação de proposta comercial',
    description:
      'Cadência focada em encurtar o ciclo de vendas após o envio da proposta, eliminando objeções com o comitê financeiro.',
    touches: [
      {
        order: 1,
        channel: 'whatsapp',
        delayHoursFromPrevious: 24,
        stepTitle: 'Checagem de Recebimento de Proposta',
        templateRef:
          'Olá {{contact_name}}, conseguiu avaliar a proposta comercial que enviamos ontem? Gostaria de esclarecer algum ponto sobre o cronograma de instalação ou modelo de comodato?',
      },
      {
        order: 2,
        channel: 'email',
        delayHoursFromPrevious: 72,
        stepTitle: 'Resumo Executivo para Comitê Financeiro',
        templateRef:
          'Assunto: Resumo Executivo e Payback Estimado — {{company_name}}\n\nOlá {{contact_name}},\n\nPreparei um resumo de 1 página destacando o payback projetado de 3.2 meses para a sua diretoria financeira aprovar o investimento.\n\nPrecisa de mais alguma documentação técnica para o contrato?',
      },
      {
        order: 3,
        channel: 'voice',
        delayHoursFromPrevious: 120,
        stepTitle: 'Call de Alinhamento Contratual (Closer)',
        templateRef:
          'Ligação do Closer para alinhamento dos dados cadastrais, minuta contratual e agendamento dos técnicos de campo.',
      },
    ],
  },
  {
    id: 'nutricao-boas-praticas',
    name: 'Nutrição & Boas Práticas (Educação Continuada de Frotas & Upsell)',
    targetBrand: 'Ambas',
    category: 'Nutrição',
    persona: 'Leads em maturação ou clientes com potencial de ampliação de frota',
    description:
      'Sequência educativa de longo prazo enviando dicas de gestão de frotas, legislação e telemetria avançada.',
    touches: [
      {
        order: 1,
        channel: 'email',
        delayHoursFromPrevious: 0,
        stepTitle: 'Guia de Prevenção de Sinistros',
        templateRef:
          'Assunto: [Guia] 5 práticas para zerar acidentes e roubos de carga na {{company_name}}\n\nOlá {{contact_name}},\n\nSeparamos um guia com as melhores práticas de auditoria de motoristas e cercas eletrônicas que nossos clientes usam para reduzir sinistros em até 70%. Boa leitura!',
      },
      {
        order: 2,
        channel: 'whatsapp',
        delayHoursFromPrevious: 72,
        stepTitle: 'Dica Prática de Telemetria',
        templateRef:
          'Olá {{contact_name}}! Sabia que 60% do desgaste prematuro de pneus e freios ocorre por excesso de velocidade em curvas? Nossos sensores de telemetria alertam a cabine na hora. Quer saber mais?',
      },
      {
        order: 3,
        channel: 'email',
        delayHoursFromPrevious: 168,
        stepTitle: 'Convite para Sessão Executiva',
        templateRef:
          'Assunto: Convite — Novas tecnologias de telemetria CAN 2026\n\nOlá {{contact_name}},\n\nGostaria de convidá-lo para uma sessão executiva de 20 minutos com nosso diretor de produto para apresentar as novidades do nosso módulo de IA comercial e operacional.',
      },
    ],
  },
];
