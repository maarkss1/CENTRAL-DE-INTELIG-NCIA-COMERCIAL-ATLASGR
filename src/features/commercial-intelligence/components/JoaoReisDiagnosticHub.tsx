import type React from 'react';
import { useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  BarChart3,
  Inbox,
  ClipboardCheck,
  UserPlus,
  Users,
  CheckCircle,
  AlertTriangle,
  X,
  Sparkles,
  CheckSquare,
  Square,
  RotateCcw,
  BookOpen,
  ShieldCheck,
  Target,
  FileText,
  Zap,
  Bot,
  Flame,
  Send,
  Printer,
  Copy,
  Check,
} from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';

// Dataset extraído do Diagnóstico SDR — João Reis (BDR ID 392, AtlasGR)
const DIAGNOSTIC_DATA = {
  funilJul: [
    { status: 'JUNK', nome: 'Desqualificado', eventos: 20, leadsUnicos: 20 },
    { status: 'UC_B5Q2RS', nome: 'Reunião Agendada', eventos: 16, leadsUnicos: 16 },
    { status: 'CONVERTED', nome: 'Convertido', eventos: 11, leadsUnicos: 11 },
    { status: 'UC_IX9SZ8', nome: 'Em Cadência', eventos: 28, leadsUnicos: 26 },
    { status: 'NEW', nome: 'Lead inbound', eventos: 81, leadsUnicos: 79 },
  ],
  funilAgo: [
    { status: 'NEW', nome: 'Lead inbound', eventos: 131, leadsUnicos: 131 },
    { status: 'UC_IX9SZ8', nome: 'Em Cadência', eventos: 195, leadsUnicos: 194 },
    { status: 'JUNK', nome: 'Desqualificado', eventos: 109, leadsUnicos: 109 },
    { status: 'UC_68OHNT', nome: 'Reunião Realizada', eventos: 6, leadsUnicos: 6 },
    { status: 'CONVERTED', nome: 'Convertido', eventos: 17, leadsUnicos: 17 },
    { status: 'UC_B5Q2RS', nome: 'Reunião Agendada', eventos: 15, leadsUnicos: 15 },
    { status: 'UC_YJSF5N', nome: 'No-Show', eventos: 1, leadsUnicos: 1 },
  ],
  metJul: {
    leadsNovos: 79,
    leadsTrabalhados: 64,
    emCadencia: 26,
    reuniaoAgendada: 16,
    reuniaoRealizada: 0,
    noShow: 0,
    convertido: 11,
    desqualificado: 20,
    taxaContato: 81,
    taxaAgendamento: 25,
    taxaComparecimento: 0,
    taxaReuniaoParaConvertido: 68.8,
    taxaDesqualificacao: 25.3,
    atividadesTotais: 213,
    atividadesPorLeadTrabalhado: 3.3,
    dealsGerados: 10,
    dealsGanhos: 1,
    dealsPerdidos: 1,
    dealsAbertos: 8,
    pipelineValor: 9521.7,
    ganhoValor: 180,
    taxaVitoriaDeal: 50,
  },
  metAgo: {
    leadsNovos: 131,
    leadsTrabalhados: 179,
    emCadencia: 194,
    reuniaoAgendada: 15,
    reuniaoRealizada: 6,
    noShow: 1,
    convertido: 17,
    desqualificado: 109,
    taxaContato: 136.6,
    taxaAgendamento: 8.4,
    taxaComparecimento: 40,
    taxaReuniaoParaConvertido: 113.3,
    taxaDesqualificacao: 83.2,
    atividadesTotais: 530,
    atividadesPorLeadTrabalhado: 3,
    dealsGerados: 15,
    dealsGanhos: 5,
    dealsPerdidos: 2,
    dealsAbertos: 8,
    pipelineValor: 4388.3,
    ganhoValor: 363.2,
    taxaVitoriaDeal: 71.4,
  },
  slaJul: {
    leadsDoMes: 82,
    comPrimeiroContato: 65,
    semContato: 17,
    mediaHoras: 386.2,
    medianaHoras: 426.0,
  },
  slaAgo: {
    leadsDoMes: 97,
    comPrimeiroContato: 81,
    semContato: 16,
    mediaHoras: 125.9,
    medianaHoras: 84.7,
  },
  diasUteisJul: 23,
  diasUteisAgo: 21,
  dealsJulResumo: {
    total: 10,
    ganhos: 1,
    perdidos: 1,
    abertos: 8,
    pipelineValor: 9521.7,
    ganhoValor: 180,
  },
  dealsAgoResumo: {
    total: 15,
    ganhos: 5,
    perdidos: 2,
    abertos: 8,
    pipelineValor: 4388.3,
    ganhoValor: 363.2,
  },
  canalJul: {
    'Contatar cliente (genérico)': 184,
    Ligação: 4,
    'Outro/Tarefa': 8,
    WhatsApp: 2,
    'E-mail': 15,
  },
  canalAgo: {
    WhatsApp: 9,
    'Contatar cliente (genérico)': 472,
    LinkedIn: 4,
    'E-mail': 31,
    Ligação: 2,
    'Outro/Tarefa': 12,
  },
  dealsJulDetalhe: [
    {
      id: '25300',
      titulo: 'Transac | Transportadora | João Reis',
      empresa: 'Transac Transporte Rodoviario LTDA',
      stage: 'NEW',
      valor: 3949.8,
    },
    {
      id: '25450',
      titulo: 'Dori Edson | e-book | João Reis',
      empresa: 'Nobelkraft Embalagens de Papelão',
      stage: 'LOSE',
      valor: 119.5,
    },
    {
      id: '25470',
      titulo: 'ACP Bioenergia | Profile RH | João Reis',
      empresa: 'ACP Bioenergia LTDA',
      stage: 'UC_R1YAOS',
      valor: 0,
    },
    {
      id: '25532',
      titulo: 'Transcarlos | Transportadora | João Reis',
      empresa: 'TransCarlos Transportes Ltda',
      stage: 'NEW',
      valor: 1224.9,
    },
    {
      id: '25548',
      titulo: 'CCM | Profile RH | João Reis',
      empresa: 'CCM Tecnologia',
      stage: 'NEW',
      valor: 191.2,
    },
    {
      id: '25708',
      titulo: 'Mendes Mundin Serviços | Profile RH | João Reis',
      empresa: 'Mendes Mundin Serviços',
      stage: 'NEW',
      valor: 358.5,
    },
    {
      id: '25722',
      titulo: 'Usina Pitangueiras | RH | João Reis ',
      empresa: 'Pitangueiras Açúcar e Álcool LTDA',
      stage: 'NEW',
      valor: 3450,
    },
    {
      id: '25764',
      titulo: 'Cerealista Malanski | Profile | João Reis',
      empresa: 'Cerealista Malanski Ltda',
      stage: 'WON',
      valor: 180,
    },
    {
      id: '25770',
      titulo: 'Tupi Rio Transportes | Profile | João Reis',
      empresa: 'Cimento Tupi',
      stage: 'NEW',
      valor: 47.8,
    },
    {
      id: '25790',
      titulo: '[PILOTO PROFILE] | Alfa | João Reis',
      empresa: 'Alfa Transportes LTDA',
      stage: 'UC_A0VPC5',
      valor: 0,
    },
  ],
  dealsAgoDetalhe: [
    {
      id: '25808',
      titulo: 'Grupo RH | Profile RH | João Reis',
      empresa: 'Grupo RH Serviços',
      stage: 'NEW',
      valor: 1175,
    },
    {
      id: '25810',
      titulo: 'Pessegueiro | GR + Profile | João Reis',
      empresa: 'Pessegueiro Transportes de Cargas Ltda',
      stage: 'WON',
      valor: 136.9,
    },
    {
      id: '25828',
      titulo: 'Solfarma | Reunião 07/07/2026 | João Reis',
      empresa: 'SOLFARMA COMÉRCIO DE PRODUTOS FARMACÊUTICOS',
      stage: 'LOSE',
      valor: 392.8,
    },
    {
      id: '25830',
      titulo: 'Rodomac | Reunião 22/07/2026 | João Reis',
      empresa: 'Rodomac Transportes',
      stage: 'LOSE',
      valor: 0,
    },
    {
      id: '25846',
      titulo: 'Vulk Seguros | Seguradora | João Reis',
      empresa: 'Vulk Seguros',
      stage: 'NEW',
      valor: 119.5,
    },
    {
      id: '25848',
      titulo: 'AKB | Profile + Torre | João Reis',
      empresa: 'AKB Transportes Ltda',
      stage: 'WON',
      valor: 58.8,
    },
    {
      id: '25854',
      titulo: 'Vlog Transportes | Profile | Marcelo',
      empresa: 'Vlog Transporte',
      stage: 'UC_A0VPC5',
      valor: 0,
    },
    {
      id: '25864',
      titulo: 'H B Correia Transportes | Profile | João Reis',
      empresa: 'H B Correia Transportes Logística',
      stage: 'WON',
      valor: 47.8,
    },
    {
      id: '25892',
      titulo: 'B. Tobace | e-book | João Reis',
      empresa: 'B. Tobace Instalações Elétricas',
      stage: 'UC_A0VPC5',
      valor: 0,
    },
    {
      id: '25896',
      titulo: 'RPSV Transportes ',
      empresa: 'R.P.S.V. Transportes LTDA',
      stage: 'WON',
      valor: 71.9,
    },
    {
      id: '25986',
      titulo: 'Palmares | RH | João Reis',
      empresa: 'Agricultura Pecuária Palmares',
      stage: 'NEW',
      valor: 47.8,
    },
    {
      id: '25994',
      titulo: 'Vivian | Profile | João Reis',
      empresa: 'Transportes Ap Itu LTDA',
      stage: 'WON',
      valor: 47.8,
    },
    {
      id: '26004',
      titulo: 'Jefferson | Corretora | João Reis',
      empresa: 'Superseg Corretora de Seguros',
      stage: 'UC_A0VPC5',
      valor: 0,
    },
    {
      id: '26016',
      titulo: 'Usina Colorado | RH | João Reis',
      empresa: 'Usina Colorado',
      stage: 'NEW',
      valor: 1990,
    },
    {
      id: '26146',
      titulo: 'Usina Santa Adélia | RH | João Reis',
      empresa: 'Usina Santa Adélia S/A',
      stage: 'NEW',
      valor: 300,
    },
  ],
  reuniaoVerificacao: {
    confirmadas: [
      {
        empresa: 'AKB Transportes (Kátia)',
        data: '2026-08-04',
        duracaoMin: 27,
        resumo:
          'Ligação completa sobre gerenciamento de risco e monitoramento veicular — apresentou a plataforma ao vivo, explicou exigências da seguradora e alinhou envio de proposta por escrito.',
      },
      {
        empresa: 'Lei de Cargas (Henrique)',
        data: '2026-08-05',
        duracaoMin: 21,
        resumo:
          'Ligação completa sobre cadastro de motoristas e veículos — identificou os dois decisores (Henrique e a esposa) e travou prazo de retorno até sexta-feira.',
      },
    ],
    semConversaReal: [
      {
        empresa: 'AKB Transportes (Kátia) — retorno',
        data: '2026-08-11',
        quem: 'João Reis (convidado)',
      },
      {
        empresa: 'Hospital Guararapes',
        data: '2026-07-22',
        quem: 'João Reis (convidado, junto com colegas)',
      },
      {
        empresa: 'Verzani & Sandrini',
        data: '2026-07-15',
        quem: 'Barbara Lopes / Matheus Hernandes',
      },
      {
        empresa: 'Turner & Townsend',
        data: '2026-07-10',
        quem: 'Barbara Lopes / Matheus Hernandes',
      },
      {
        empresa: 'Usina Pitangueiras',
        data: '2026-07-16',
        quem: 'Barbara Lopes / Matheus Hernandes',
      },
      {
        empresa: 'Generall Segurança e Serviços',
        data: '2026-07-08',
        quem: 'Barbara Lopes / Matheus Hernandes',
      },
    ],
  },
  emCadencia: {
    resumo: {
      total: 130,
      semAtividade: 8,
      parado30d: 55,
      parado15d: 35,
      toqueUnico: 2,
      ok: 30,
      comReuniaoNoHistorico: 6,
      totalAtividadesSoma: 561,
      mediaAtividadesPorLead: 4.3,
      mediaGapGeral: 5.2,
    },
    topLeads: [
      {
        id: '18672',
        nome: 'CDGN Logística | Embarcador (Gás)',
        diasParado: 182,
        atividades: 7,
        gap: '3.3d',
        status: '30+ dias parado',
      },
      {
        id: '18676',
        nome: 'Copacol | Cooperativa agroindustrial',
        diasParado: 182,
        atividades: 6,
        gap: '3.9d',
        status: '30+ dias parado',
      },
      {
        id: '18680',
        nome: 'RodoViva Transportes',
        diasParado: 182,
        atividades: 3,
        gap: '9.5d',
        status: '30+ dias parado',
      },
      {
        id: '18682',
        nome: 'Sanfe Transporte e Logistica Ltda',
        diasParado: 182,
        atividades: 4,
        gap: '6.3d',
        status: '30+ dias parado',
      },
      {
        id: '19872',
        nome: 'Actual Serviços Terceirizados',
        diasParado: 82,
        atividades: 1,
        gap: '—',
        status: '30+ dias parado',
      },
      {
        id: '19762',
        nome: 'Pratika Serviços Terceirizados',
        diasParado: 81,
        atividades: 6,
        gap: '2.0d',
        status: '30+ dias parado',
      },
      {
        id: '19880',
        nome: 'Elite Serviços',
        diasParado: 80,
        atividades: 4,
        gap: '1.4d',
        status: '30+ dias parado',
      },
      {
        id: '19866',
        nome: 'BRASIL SERVIÇOS GERAIS',
        diasParado: 68,
        atividades: 2,
        gap: '14d',
        status: '30+ dias parado',
      },
      {
        id: '19992',
        nome: 'Diana Bioenergia',
        diasParado: 68,
        atividades: 4,
        gap: '1.0d',
        status: '30+ dias parado',
      },
      {
        id: '19864',
        nome: 'PETERSA BRASIL SERVIÇOS',
        diasParado: 66,
        atividades: 5,
        gap: '4.3d',
        status: '30+ dias parado',
      },
      {
        id: '20272',
        nome: 'Ayrton Luis',
        diasParado: 36,
        atividades: 0,
        gap: '—',
        status: 'Sem atividade',
      },
      {
        id: '20284',
        nome: 'Ana Albacete',
        diasParado: 35,
        atividades: 0,
        gap: '—',
        status: 'Sem atividade',
      },
      {
        id: '20580',
        nome: 'Maria Lucia',
        diasParado: 6,
        atividades: 0,
        gap: '—',
        status: 'Sem atividade',
      },
      {
        id: '20586',
        nome: 'angelita braga',
        diasParado: 4,
        atividades: 0,
        gap: '—',
        status: 'Sem atividade',
      },
      {
        id: '20588',
        nome: 'Lidiane',
        diasParado: 4,
        atividades: 0,
        gap: '—',
        status: 'Sem atividade',
      },
      {
        id: '20590',
        nome: 'Patrícia de Souza Marques',
        diasParado: 4,
        atividades: 0,
        gap: '—',
        status: 'Sem atividade',
      },
    ],
  },
};

// Estrutura do Plano Diário para João Reis
interface DailyTask {
  id: string;
  timeBlock: string;
  title: string;
  description: string;
  tool: string;
  targetCount?: string;
  completed: boolean;
}

const DEFAULT_DAILY_PLAN: DailyTask[] = [
  {
    id: 'task-1',
    timeBlock: '08:30 - 09:30',
    title: 'Bloco 1: Higiene de SLA & Reação Rápida',
    description:
      'Verificar Leads novos que entraram no Bitrix em < 24h e realizar o 1º contato imediato. Atacar prioritariamente os 8 leads sem nenhuma atividade.',
    tool: 'Bitrix24 (Filtro Leads Novos sem atividade) + Agenda de Prospecção',
    targetCount: '15 a 20 toques rápidos',
    completed: false,
  },
  {
    id: 'task-2',
    timeBlock: '09:30 - 11:30',
    title: 'Bloco 2: Prospecção em Lote (Sprint de Toques)',
    description:
      'Disparar cadência no WhatsApp, E-mail e LinkedIn. REGRA OBRIGATÓRIA: Nunca salvar como "Contatar cliente" genérico — indicar sempre o canal real (ex: "WhatsApp - Proposta enviados").',
    tool: 'Bitrix24 / Ferramenta de Cadência + WhatsApp Web',
    targetCount: '40 a 50 atividades com canal discriminado',
    completed: false,
  },
  {
    id: 'task-3',
    timeBlock: '11:30 - 12:00',
    title: 'Bloco 3: Cadência & Follow-up de Reuniões',
    description:
      'Verificar reuniões do dia ou do dia anterior. Carimbar no CRM o status real: "Reunião Realizada" ou "No-Show" antes de qualquer outra ação.',
    tool: 'Bitrix24 (Estágio Reunião Agendada)',
    targetCount: '100% das reuniões carimbadas no dia',
    completed: false,
  },
  {
    id: 'task-4',
    timeBlock: '14:00 - 16:00',
    title: 'Bloco 4: Limpeza de Estoque (Aging Cut)',
    description:
      'Atacar a fila de 130 leads parados em "Em Cadência" (especialmente os 55 parados há > 30 dias). Decidir: aplicar cadência de 6-8 toques ou mover para Desqualificado (JUNK).',
    tool: 'Bitrix24 (Filtro Em Cadência > 15 dias)',
    targetCount: 'Revisar e movimentar 25 a 30 leads parados',
    completed: false,
  },
  {
    id: 'task-5',
    timeBlock: '16:00 - 17:30',
    title: 'Bloco 5: Calls de Qualificação & Fechamento',
    description:
      'Conduzir chamadas agendadas. Foco: Qualificar perfil nas primeiras falas (evitar 20min de demo em lead de 1 veículo) e sair da call SEMPRE com data travada ("Quando você consegue me dar o retorno?").',
    tool: 'Google Meet / Softphone Bitrix24',
    targetCount: '2 a 4 reuniões/calls qualificadoras',
    completed: false,
  },
  {
    id: 'task-6',
    timeBlock: '17:30 - 18:00',
    title: 'Bloco 6: Encerramento & Batimento de Meta',
    description:
      'Conferir o volume total de atividades lançadas no dia (Meta: 60-100/dia), atualizar compromissos de amanhã e registrar o diário de prospecção.',
    tool: 'Painel Central AtlasGR + CRM Bitrix24',
    targetCount: 'Meta mínima de 60 atividades batida',
    completed: false,
  },
];

// Pitches por Segmento para IA Coach
const PITCHES_BY_SEGMENT = {
  transportadora: {
    segmento: 'Transportadora de Cargas',
    dor: 'Exigências da seguradora/PGR para cadastro rápido de motoristas e redução de sinistro.',
    pitch: `Olá [Nome], aqui é o João Reis da AtlasGR. Vi que a [Nome da Empresa] atua no transporte rodoviário e sei o quanto a exigência de gerenciamento de risco e cadastro rápido de motoristas impacta a liberação de frota. Nós ajudamos transportadoras a reduzirem o tempo de validação de motoristas e cumprirem 100% da apólice com nossa plataforma. Como vocês gerenciam esse processo hoje?`,
    perguntaChave: 'Quantos veículos ou viagens vocês operam por mês em média?',
  },
  agro: {
    segmento: 'Usina / Agroindústria',
    dor: 'Logística de escoamento de safra e rastreamento em rotas rurais sem sinal.',
    pitch: `Olá [Nome], sou o João Reis da AtlasGR. Estou em contato com grandes grupos sucroalcooleiros e do agronegócio para otimizar o monitoramento do escoamento de safra e controle de terceiros. Vocês hoje têm visibilidade em tempo real do transbordo e da segurança dos veículos que entram na usina?`,
    perguntaChave: 'Vocês trabalham mais com frota própria ou frota dedicada de terceiros?',
  },
  embarcador: {
    segmento: 'Embarcador / Indústria / Varejo',
    dor: 'Falta de visibilidade da carga em trânsito e nível de serviço da transportadora.',
    pitch: `Olá [Nome], João Reis da AtlasGR. Ajudamos embarcadores industriais a terem torre de controle centralizada sobre todas as transportadoras contratadas, reduzindo no-show e atrasos de entrega. Como vocês garantem o nível de serviço do frete hoje?`,
    perguntaChave: 'Quantas transportadoras parceiras hoje atendem as rotas de vocês?',
  },
  terceirizacao: {
    segmento: 'Terceirização & Facilities (Portaria/Segurança)',
    dor: 'Controle de ponto/presença e validação de perfil de atendentes.',
    pitch: `Olá [Nome], aqui é o João Reis da AtlasGR. Trabalhamos com empresas de facilities para gestão e validação de equipes terceirizadas em postos de trabalho. Como vocês fazem o acompanhamento de presença e compliance dos profissionais hoje?`,
    perguntaChave: 'Quantos postos de trabalho ativos a empresa gerencia atualmente?',
  },
};

// Simulador de Objeções
const OBJECTIONS_DATABASE = [
  {
    id: 'obj-1',
    objeção: '“Já temos Gerenciadora de Risco / Rastreador.”',
    diagnostico:
      'O lead acha que o produto substitui o que ele tem, quando na verdade pode integrar ou complementar.',
    respostaRecomendada:
      'Perfeito, [Nome]! Nós não substituímos sua gerenciadora nem exigimos troca de rastreadores. A AtlasGR integra com a sua infraestrutura atual para homologar cadastros mais rápido e automatizar a conformidade com a seguradora. Quantas horas hoje sua equipe leva pra liberar um motorista agregado?',
  },
  {
    id: 'obj-2',
    objeção: '“Pode me mandar a proposta por e-mail pra eu analisar?”',
    diagnostico:
      'Objeção de esquiva clássica. Enviar e-mail sem qualificação tem 90% de chance de virar lead morto.',
    respostaRecomendada:
      'Consigo enviar sim, [Nome]! Mas como temos diferentes planos e módulos (como validação de motorista vs torre de controle), levaria 5 minutos numa breve call pra eu ajustar o valor exato pro seu volume real. Você tem 5 minutos amanhã às 10h ou 14h?',
  },
  {
    id: 'obj-3',
    objeção: '“Somos uma empresa pequena, temos só 2 ou 3 caminhões.”',
    diagnostico: 'Lead pensa que a plataforma é cara ou feita apenas para grandes frotas.',
    respostaRecomendada:
      'Entendo perfeitamente, [Nome]! Inclusive temos uma oferta enxuta desenhada exatamente para frotas de pequeno porte cumprirem a exigência da seguradora sem peso fixo alto. Se eu te mostrar em 10 minutos como fica acessível pro seu tamanho, faz sentido avaliarmos?',
  },
];

export function JoaoReisDiagnosticHub() {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState<
    | 'daily'
    | 'julho'
    | 'agosto'
    | 'comparativo'
    | 'emcadencia'
    | 'diagnostico'
    | 'iacoach'
    | 'pauta1to1'
  >('daily');
  const [dailyTasks, setDailyTasks] = useState<DailyTask[]>(DEFAULT_DAILY_PLAN);
  const [dailyNotes, setDailyNotes] = useState<string>('');
  const [todayActivitiesCount, setTodayActivitiesCount] = useState<number>(28); // Simulação do dia atual
  const [selectedSegment, setSelectedSegment] =
    useState<keyof typeof PITCHES_BY_SEGMENT>('transportadora');
  const [callTranscriptInput, setCallTranscriptInput] = useState<string>('');
  const [callAnalysisResult, setCallAnalysisResult] = useState<{
    score: number;
    talkListenRatio: string;
    qualificationTime: string;
    lockedNextStep: boolean;
    strengths: string[];
    improvements: string[];
  } | null>(null);

  const [channelTag, setChannelTag] = useState<
    '[WhatsApp]' | '[Ligação]' | '[E-mail]' | '[LinkedIn]'
  >('[WhatsApp]');
  const [sprintLeadIndex, setSprintLeadIndex] = useState<number>(0);
  const [modalContent, setModalContent] = useState<{ title: string; body: React.ReactNode } | null>(
    null,
  );
  const [copiedPauta, setCopiedPauta] = useState(false);

  const isJoaoReis =
    currentUser?.email?.toLowerCase().includes('joao.reis') ||
    currentUser?.name?.toLowerCase().includes('joão reis');

  const toggleTask = (id: string) => {
    setDailyTasks((prev) =>
      prev.map((task) => (task.id === id ? { ...task, completed: !task.completed } : task)),
    );
  };

  const resetDailyTasks = () => {
    setDailyTasks(DEFAULT_DAILY_PLAN.map((t) => ({ ...t, completed: false })));
  };

  const completedCount = dailyTasks.filter((t) => t.completed).length;
  const progressPercent = Math.round((completedCount / dailyTasks.length) * 100);

  const formatCurrency = (val: number) =>
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  // Análise de Transcrição simulada por IA
  const analyzeTranscript = () => {
    if (!callTranscriptInput.trim()) return;
    setCallAnalysisResult({
      score: 78,
      talkListenRatio: 'João 58% vs. Cliente 42%',
      qualificationTime: 'Qualificação aos 8 minutos',
      lockedNextStep: true,
      strengths: [
        'Excelente tom amigável e rapport nos primeiros 2 minutos.',
        'Fez a pergunta de fechamento ("Quando você consegue me dar um retorno?") aos 18 min.',
      ],
      improvements: [
        'Reduzir o tempo de apresentação técnica inicial (falou por 7min seguidos).',
        'Perguntar sobre a quantidade de veículos nos primeiros 3 minutos.',
      ],
    });
  };

  // Pace Diário
  const dailyTarget = 60;
  const currentPacePercent = Math.min(100, Math.round((todayActivitiesCount / dailyTarget) * 100));

  // Pauta Markdown de 1:1
  const generatePautaMarkdown = () => {
    return `# Pauta de Acompanhamento 1:1 — João Reis (AtlasGR)
Data: 01/09/2026 | BDR ID: 392

## 1. Resumo Executivo de Desempenho
- **Leads Trabalhados**: 179 em Agosto (vs. 64 em Julho — crescimento de +179.7%)
- **Atividades Lançadas**: 530 em Agosto (Média de 25.2/dia útil vs. 9.3 em Julho)
- **Reuniões Agendadas**: 15 em Agosto (Déficit de taxa: 8.4% vs 25.0% em Julho)
- **Receita Ganha**: R$ 363,20 (+101.8% de crescimento em negócios próprios)
- **Win Rate de Deals**: 71.4% (5 ganhos de 7 fechados)

## 2. Status dos Gargalos Operacionais
- [x] **Estoque Em Cadência**: 130 leads mapeados (55 parados > 30d — plano de corte em andamento).
- [x] **SLA de 1º Contato**: Mediana reduzida de 17.7 dias em Julho para 3.5 dias em Agosto.
- [ ] **Padronização de Registro**: Em transição de "Contatar cliente" genérico para tags reais ([WhatsApp], [Ligação], [E-mail]).
- [ ] **Carimbo no CRM**: Exigência de marcar "Reunião Realizada" ou "No-Show" no próprio dia.

## 3. Qualidade em Calls (Feedback de Transcrições Meet)
- **Pontos Fortes**: Rapport excelente, pesquisa prévia do lead e honestidade comercial.
- **Plano de Ajuste**: Qualificar frota nos primeiros 3 minutos de call e controlar tempo de fala.

## 4. Compromissos para os Próximos 7 Dias
1. Aumentar densidade diária para 60+ toques/dia usando o checklist operacional.
2. Limpar os 8 leads novos sem atividade.
3. Carimbar 100% das reuniões agendadas pós-call.`;
  };

  const copyPautaToClipboard = () => {
    navigator.clipboard.writeText(generatePautaMarkdown());
    setCopiedPauta(true);
    setTimeout(() => setCopiedPauta(false), 2000);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-bg p-4 md:p-8 space-y-6 min-h-screen text-ink">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Banner de Identificação */}
        <div className="p-6 rounded-3xl bg-gradient-to-r from-brand/10 via-brand-2/10 to-gold/10 border border-brand/20 shadow-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-brand mb-1">
              <Sparkles className="w-4 h-4 text-brand" />
              Diagnóstico SDR &amp; Plano Diário Operacional · BDR ID 392
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-ink">João Reis da AtlasGR</h1>
            <p className="text-sm text-ink-2 mt-1">
              Hub completo de performance, automações de prospecção, IA Coach e pauta de 1:1.
            </p>
          </div>
          {isJoaoReis && (
            <div className="px-4 py-2 rounded-2xl bg-brand-active text-white text-xs font-black shadow-md flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Sessão Exclusiva — João Reis
            </div>
          )}
        </div>

        {/* Navegação por Abas */}
        <div className="grid grid-cols-2 md:grid-cols-8 gap-2">
          <button
            onClick={() => setActiveTab('daily')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'daily'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">Plano Diário</p>
              <p className="text-[10px] opacity-80">
                {completedCount}/{dailyTasks.length} ({progressPercent}%)
              </p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('iacoach')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'iacoach'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <Bot className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">IA Coach SDR</p>
              <p className="text-[10px] opacity-80">Pitches &amp; Meet</p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('pauta1to1')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'pauta1to1'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <FileText className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">Pauta de 1:1</p>
              <p className="text-[10px] opacity-80">Exportar p/ Gestor</p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('julho')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'julho'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">Julho 2026</p>
              <p className="text-[10px] opacity-80">213 Atividades</p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('agosto')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'agosto'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">Agosto 2026</p>
              <p className="text-[10px] opacity-80">530 Atividades</p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('comparativo')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'comparativo'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">Comparativo</p>
              <p className="text-[10px] opacity-80">Jul x Ago Δ</p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('emcadencia')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'emcadencia'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <Inbox className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">Em Cadência</p>
              <p className="text-[10px] opacity-80">130 Leads Fila</p>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('diagnostico')}
            className={`p-3.5 rounded-2xl border text-left flex flex-col gap-1.5 transition-all cursor-pointer ${
              activeTab === 'diagnostico'
                ? 'bg-brand-active text-white border-brand shadow-lg scale-[1.02]'
                : 'bg-surface border-line text-ink hover:bg-surface-2'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <div>
              <p className="text-xs font-black leading-tight">Diagnóstico</p>
              <p className="text-[10px] opacity-80">Gargalos &amp; Ação</p>
            </div>
          </button>
        </div>

        {/* Conteúdo por Aba */}
        {activeTab === 'daily' && (
          <div className="space-y-6">
            {/* ITEM 3: Tracker de Pace Diário ao Vivo & Alertas de SLA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Pace Meter */}
              <div className="p-5 rounded-card-lg border border-line bg-surface shadow-card space-y-3 md:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-brand" />
                    <h3 className="text-sm font-black text-ink">
                      Medidor de Pace Diário (Meta 60 toques)
                    </h3>
                  </div>
                  <span className="text-xs font-bold font-mono text-brand">
                    {todayActivitiesCount} / 60 toques
                  </span>
                </div>
                <div className="w-full bg-surface-2 h-4 rounded-full overflow-hidden border border-line">
                  <div
                    className="bg-gradient-to-r from-brand to-brand-2 h-full transition-all duration-500 rounded-full"
                    style={{ width: `${currentPacePercent}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs text-ink-2">
                  <span>
                    Ritmo atual: <b>~3.5 toques/hora</b>
                  </span>
                  <button
                    onClick={() => setTodayActivitiesCount((prev) => prev + 1)}
                    className="px-3 py-1 rounded-xl bg-brand/10 text-brand font-bold text-[11px] hover:bg-brand/20 transition-all cursor-pointer"
                  >
                    + Registrar toque rápido (+1)
                  </button>
                </div>
              </div>

              {/* Alerta de SLA Excedido */}
              <div className="p-5 rounded-card-lg border border-critical/30 bg-critical/5 shadow-card space-y-2">
                <div className="flex items-center gap-2 text-critical">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <h3 className="text-xs font-black uppercase">Alerta de SLA (&lt; 24h)</h3>
                </div>
                <p className="text-xs text-ink-2">
                  <b>16 leads novos de Agosto</b> estão sem contato inicial. Tempo médio de reação a
                  ser corrigido.
                </p>
                <button
                  onClick={() => setActiveTab('emcadencia')}
                  className="w-full py-1.5 rounded-xl bg-critical text-white font-bold text-xs shadow-sm hover:brightness-110 transition-all cursor-pointer"
                >
                  Atacar Leads sem SLA agora
                </button>
              </div>
            </div>

            {/* ITEM 2: Sprint Launcher de Prospecção em 1 Clique & Validador Bitrix24 */}
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-ink flex items-center gap-2">
                    <Zap className="w-4 h-4 text-gold" />
                    Sprint Launcher de Prospecção &amp; Validador de Registros Bitrix24
                  </h3>
                  <p className="text-xs text-ink-2">
                    Selecione a tag de canal real obrigatória antes de registrar sua atividade.
                  </p>
                </div>
                {/* Seleção de Tag de Canal */}
                <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-xl border border-line">
                  {(['[WhatsApp]', '[Ligação]', '[E-mail]', '[LinkedIn]'] as const).map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setChannelTag(tag)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        channelTag === tag
                          ? 'bg-brand-active text-white shadow-sm'
                          : 'text-ink-2 hover:text-ink'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fila do Sprint em 1 Clique */}
              <div className="p-4 rounded-2xl border border-brand/20 bg-soft flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-brand tracking-widest">
                    Fila do Sprint (Lead {sprintLeadIndex + 1} de{' '}
                    {DIAGNOSTIC_DATA.emCadencia.topLeads.length})
                  </span>
                  <h4 className="text-base font-black text-ink">
                    {DIAGNOSTIC_DATA.emCadencia.topLeads[sprintLeadIndex].nome}
                  </h4>
                  <p className="text-xs text-ink-2">
                    Status: {DIAGNOSTIC_DATA.emCadencia.topLeads[sprintLeadIndex].status} · Parado
                    há {DIAGNOSTIC_DATA.emCadencia.topLeads[sprintLeadIndex].diasParado} dias
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setTodayActivitiesCount((p) => p + 1);
                      setSprintLeadIndex(
                        (prev) => (prev + 1) % DIAGNOSTIC_DATA.emCadencia.topLeads.length,
                      );
                    }}
                    className="px-4 py-2.5 rounded-xl bg-brand-active text-white font-bold text-xs shadow-md hover:brightness-105 transition-all cursor-pointer flex items-center gap-2"
                  >
                    <Send className="w-4 h-4" />
                    Salvar toque como {channelTag}
                  </button>
                  <button
                    onClick={() =>
                      setSprintLeadIndex(
                        (prev) => (prev + 1) % DIAGNOSTIC_DATA.emCadencia.topLeads.length,
                      )
                    }
                    className="px-3 py-2.5 rounded-xl border border-line bg-surface text-ink-2 font-bold text-xs hover:bg-surface-2 transition-all cursor-pointer"
                  >
                    Pular Lead
                  </button>
                </div>
              </div>
            </div>

            {/* Checklist do Roteiro Diário */}
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-ink flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-brand" />
                  Roteiro do Dia — Passo a Passo por Bloco de Horário
                </h3>
                <button
                  onClick={resetDailyTasks}
                  className="p-1.5 rounded-lg border border-line bg-surface-2 text-ink-2 hover:text-ink transition-all cursor-pointer text-xs flex items-center gap-1 font-bold"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Resetar
                </button>
              </div>

              <div className="space-y-3">
                {dailyTasks.map((task) => (
                  <button
                    type="button"
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${
                      task.completed
                        ? 'bg-ok/5 border-ok/30 text-ink opacity-85'
                        : 'bg-surface-2/60 border-line hover:border-brand/40'
                    }`}
                  >
                    <span className={`mt-1 shrink-0 ${task.completed ? 'text-ok' : 'text-ink-2'}`}>
                      {task.completed ? (
                        <CheckSquare className="w-6 h-6" />
                      ) : (
                        <Square className="w-6 h-6" />
                      )}
                    </span>

                    <div className="flex-1 space-y-1">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-1">
                        <span className="text-xs font-black text-brand uppercase tracking-wider">
                          {task.timeBlock}
                        </span>
                        {task.targetCount && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                            Alvo: {task.targetCount}
                          </span>
                        )}
                      </div>

                      <h4
                        className={`text-sm font-black ${task.completed ? 'line-through text-ink-2' : 'text-ink'}`}
                      >
                        {task.title}
                      </h4>

                      <p className="text-xs text-ink-2 leading-relaxed">{task.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Bloco de Anotações Diárias */}
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-3">
              <h3 className="text-sm font-black text-ink flex items-center gap-2">
                <FileText className="w-4 h-4 text-brand" />
                Notas &amp; Acompanhamento do Dia — João Reis
              </h3>
              <textarea
                value={dailyNotes}
                onChange={(e) => setDailyNotes(e.target.value)}
                placeholder="Escreva aqui compromissos do dia, objeções marcantes de clientes, retornos prometidos para amanhã..."
                className="w-full h-24 p-3 rounded-xl border border-line bg-surface-2 text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
          </div>
        )}

        {/* ITEM 1: IA Coach SDR & Analisador de Calls do Meet */}
        {activeTab === 'iacoach' && (
          <div className="space-y-6">
            {/* Gerador de Pitch por Segmento */}
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-ink flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-brand" />
                    Gerador de Pitch de 3 Minutos por Segmento
                  </h3>
                  <p className="text-xs text-ink-2">
                    Roteiros sob medida para o João abordar cada perfil de empresa sem perder tempo.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-surface-2 p-1 rounded-xl border border-line">
                  {(Object.keys(PITCHES_BY_SEGMENT) as Array<keyof typeof PITCHES_BY_SEGMENT>).map(
                    (seg) => (
                      <button
                        key={seg}
                        onClick={() => setSelectedSegment(seg)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                          selectedSegment === seg
                            ? 'bg-brand-active text-white shadow-sm'
                            : 'text-ink-2 hover:text-ink'
                        }`}
                      >
                        {seg}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <div className="p-5 rounded-2xl border border-brand/20 bg-soft space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-brand uppercase tracking-wider">
                    {PITCHES_BY_SEGMENT[selectedSegment].segmento}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand/10 text-brand">
                    Foco de Abordagem
                  </span>
                </div>
                <p className="text-xs font-semibold text-ink-2">
                  Dor Principal: {PITCHES_BY_SEGMENT[selectedSegment].dor}
                </p>
                <div className="p-3.5 rounded-xl bg-surface border border-line text-xs font-medium text-ink leading-relaxed">
                  {PITCHES_BY_SEGMENT[selectedSegment].pitch}
                </div>
                <p className="text-xs font-bold text-brand">
                  Pergunta Chave de Qualificação: “
                  {PITCHES_BY_SEGMENT[selectedSegment].perguntaChave}”
                </p>
              </div>
            </div>

            {/* Analisador de Transcrição do Google Meet (IA) */}
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <h3 className="text-sm font-black text-ink flex items-center gap-2">
                <Bot className="w-4 h-4 text-brand" />
                Analisador Inteligente de Chamadas (Google Meet / Ata)
              </h3>
              <p className="text-xs text-ink-2">
                Cole a transcrição ou resumo da reunião com o cliente para a IA avaliar tempo de
                fala, qualificação de frota e fechamento do próximo passo.
              </p>

              <div className="space-y-3">
                <textarea
                  value={callTranscriptInput}
                  onChange={(e) => setCallTranscriptInput(e.target.value)}
                  placeholder="Cole aqui o texto da transcrição ou ata da chamada com o cliente..."
                  className="w-full h-28 p-3 rounded-xl border border-line bg-surface-2 text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand"
                />

                <button
                  onClick={analyzeTranscript}
                  className="px-5 py-2.5 rounded-xl bg-brand-active text-white font-bold text-xs shadow-md hover:brightness-105 transition-all cursor-pointer flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Analisar Qualidade da Call com IA
                </button>
              </div>

              {callAnalysisResult && (
                <div className="p-5 rounded-2xl border border-ok/30 bg-ok/5 space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-ok uppercase">
                      Pontuação da Reunião
                    </span>
                    <span className="text-2xl font-black text-ok">
                      {callAnalysisResult.score} / 100
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-surface border border-line">
                      <p className="text-[10px] font-bold text-ink-2 uppercase">Divisão de Fala</p>
                      <p className="font-bold text-ink">{callAnalysisResult.talkListenRatio}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-surface border border-line">
                      <p className="text-[10px] font-bold text-ink-2 uppercase">
                        Tempo de Qualificação
                      </p>
                      <p className="font-bold text-ink">{callAnalysisResult.qualificationTime}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-surface border border-line">
                      <p className="text-[10px] font-bold text-ink-2 uppercase">
                        Próximo Passo Travado?
                      </p>
                      <p className="font-bold text-ok">
                        {callAnalysisResult.lockedNextStep
                          ? '✓ Sim (Data/Hora alinhadas)'
                          : '✗ Não'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="font-bold text-ok mb-1">Pontos Fortes:</p>
                      <ul className="list-disc pl-4 space-y-1 text-ink-2">
                        {callAnalysisResult.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="font-bold text-gold mb-1">Ajustes para a Próxima Call:</p>
                      <ul className="list-disc pl-4 space-y-1 text-ink-2">
                        {callAnalysisResult.improvements.map((imp, i) => (
                          <li key={i}>{imp}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Simulador de Objeções (Roleplay) */}
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <h3 className="text-sm font-black text-ink flex items-center gap-2">
                <Target className="w-4 h-4 text-brand" />
                Matriz de Quebra de Objeções (Treino do João)
              </h3>

              <div className="space-y-3">
                {OBJECTIONS_DATABASE.map((obj) => (
                  <div
                    key={obj.id}
                    className="p-4 rounded-2xl border border-line bg-surface-2 space-y-2"
                  >
                    <p className="text-xs font-black text-brand">{obj.objeção}</p>
                    <p className="text-xs text-ink-2">
                      <b>Diagnóstico:</b> {obj.diagnostico}
                    </p>
                    <div className="p-3 rounded-xl bg-surface border border-line text-xs text-ink font-medium leading-relaxed">
                      <b>Resposta Recomendada:</b> {obj.respostaRecomendada}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ITEM 4: Gerador de Pauta de 1:1 com o Gestor */}
        {activeTab === 'pauta1to1' && (
          <div className="space-y-6">
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-black text-ink flex items-center gap-2">
                    <FileText className="w-5 h-5 text-brand" />
                    Pauta de Acompanhamento 1:1 — João Reis &amp; Gestor
                  </h3>
                  <p className="text-xs text-ink-2">
                    Relatório executivo formatado pronto para apresentação na reunião individual de
                    alinhamento.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyPautaToClipboard}
                    className="px-4 py-2.5 rounded-xl bg-brand-active text-white font-bold text-xs shadow-md hover:brightness-105 transition-all cursor-pointer flex items-center gap-2"
                  >
                    {copiedPauta ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copiedPauta ? 'Copiado!' : 'Copiar Pauta (Markdown)'}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="px-3 py-2.5 rounded-xl border border-line bg-surface-2 text-ink-2 font-bold text-xs hover:text-ink transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <Printer className="w-4 h-4" /> Imprimir
                  </button>
                </div>
              </div>

              <div className="p-6 rounded-2xl border border-line bg-surface-2 font-mono text-xs text-ink leading-relaxed space-y-4 whitespace-pre-wrap select-all">
                {generatePautaMarkdown()}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'julho' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Leads Novos</span>
                  <UserPlus className="w-4 h-4 text-brand" />
                </div>
                <p className="text-2xl font-black text-brand mt-2">
                  {DIAGNOSTIC_DATA.metJul.leadsNovos}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">79 leads únicos</p>
              </div>

              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Leads Trabalhados</span>
                  <Users className="w-4 h-4 text-brand" />
                </div>
                <p className="text-2xl font-black text-ink mt-2">
                  {DIAGNOSTIC_DATA.metJul.leadsTrabalhados}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">
                  Taxa de contato: {DIAGNOSTIC_DATA.metJul.taxaContato}%
                </p>
              </div>

              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Reuniões Agendadas</span>
                  <Calendar className="w-4 h-4 text-gold" />
                </div>
                <p className="text-2xl font-black text-gold mt-2">
                  {DIAGNOSTIC_DATA.metJul.reuniaoAgendada}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">
                  Agendamento: {DIAGNOSTIC_DATA.metJul.taxaAgendamento}%
                </p>
              </div>

              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Convertidos</span>
                  <CheckCircle className="w-4 h-4 text-ok" />
                </div>
                <p className="text-2xl font-black text-ok mt-2">
                  {DIAGNOSTIC_DATA.metJul.convertido}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">
                  Receita ganha: {formatCurrency(DIAGNOSTIC_DATA.metJul.ganhoValor)}
                </p>
              </div>
            </div>

            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <h3 className="text-sm font-black text-ink">Funil de Leads — Julho de 2026</h3>
              <div className="space-y-2">
                {DIAGNOSTIC_DATA.funilJul.map((item) => (
                  <div key={item.status} className="flex items-center gap-3 text-xs">
                    <span className="w-36 font-semibold truncate">{item.nome}</span>
                    <div className="flex-1 bg-surface-2 h-4 rounded-md overflow-hidden border border-line">
                      <div
                        className={`h-full rounded-md ${
                          item.status === 'CONVERTED'
                            ? 'bg-ok'
                            : item.status === 'JUNK'
                              ? 'bg-critical'
                              : 'bg-brand'
                        }`}
                        style={{ width: `${(item.leadsUnicos / 81) * 100}%` }}
                      />
                    </div>
                    <span className="font-mono font-bold w-10 text-right">{item.leadsUnicos}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agosto' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Leads Novos</span>
                  <UserPlus className="w-4 h-4 text-brand" />
                </div>
                <p className="text-2xl font-black text-brand mt-2">
                  {DIAGNOSTIC_DATA.metAgo.leadsNovos}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">131 leads novos</p>
              </div>

              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Leads Trabalhados</span>
                  <Users className="w-4 h-4 text-brand" />
                </div>
                <p className="text-2xl font-black text-ink mt-2">
                  {DIAGNOSTIC_DATA.metAgo.leadsTrabalhados}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">530 atividades no mês</p>
              </div>

              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Reuniões Agendadas</span>
                  <Calendar className="w-4 h-4 text-gold" />
                </div>
                <p className="text-2xl font-black text-gold mt-2">
                  {DIAGNOSTIC_DATA.metAgo.reuniaoAgendada}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">Realizadas: 6 / No-show: 1</p>
              </div>

              <div className="p-4 rounded-card border border-line bg-surface shadow-card">
                <div className="flex items-center justify-between text-xs text-ink-2 font-bold uppercase">
                  <span>Convertidos</span>
                  <CheckCircle className="w-4 h-4 text-ok" />
                </div>
                <p className="text-2xl font-black text-ok mt-2">
                  {DIAGNOSTIC_DATA.metAgo.convertido}
                </p>
                <p className="text-[10px] text-ink-2 mt-1">
                  Receita: {formatCurrency(DIAGNOSTIC_DATA.metAgo.ganhoValor)} (+101.8%)
                </p>
              </div>
            </div>

            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <h3 className="text-sm font-black text-ink flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-brand" />
                Reuniões Confirmadas por Transcrição (Google Meet)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DIAGNOSTIC_DATA.reuniaoVerificacao.confirmadas.map((c) => (
                  <div
                    key={c.empresa}
                    className="p-4 rounded-2xl border border-ok/30 bg-ok/5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-ok">{c.empresa}</span>
                      <span className="text-[10px] font-bold bg-ok/20 text-ok px-2 py-0.5 rounded-full">
                        {c.data} · ~{c.duracaoMin}min
                      </span>
                    </div>
                    <p className="text-xs text-ink-2">{c.resumo}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comparativo' && (
          <div className="space-y-6">
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <h3 className="text-lg font-black text-ink">
                Comparativo Completo: Julho vs. Agosto
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-2 text-ink-2 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-3">Indicador</th>
                      <th className="p-3 text-right">Julho</th>
                      <th className="p-3 text-right">Agosto</th>
                      <th className="p-3 text-right">Variação (Δ)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line font-medium">
                    <tr>
                      <td className="p-3 font-bold">Leads Novos</td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metJul.leadsNovos}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metAgo.leadsNovos}
                      </td>
                      <td className="p-3 text-right font-bold text-ok">+65.8%</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold">Leads Trabalhados</td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metJul.leadsTrabalhados}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metAgo.leadsTrabalhados}
                      </td>
                      <td className="p-3 text-right font-bold text-ok">+179.7%</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold">Atividades Totais</td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metJul.atividadesTotais}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metAgo.atividadesTotais}
                      </td>
                      <td className="p-3 text-right font-bold text-ok">+148.8%</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold">Reuniões Agendadas</td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metJul.reuniaoAgendada}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metAgo.reuniaoAgendada}
                      </td>
                      <td className="p-3 text-right font-bold text-critical">-6.25%</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold">Taxa de Agendamento</td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metJul.taxaAgendamento}%
                      </td>
                      <td className="p-3 text-right font-mono">
                        {DIAGNOSTIC_DATA.metAgo.taxaAgendamento}%
                      </td>
                      <td className="p-3 text-right font-bold text-critical">-66.4% (Gargalo)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold">Receita Ganha (João)</td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency(DIAGNOSTIC_DATA.metJul.ganhoValor)}
                      </td>
                      <td className="p-3 text-right font-mono">
                        {formatCurrency(DIAGNOSTIC_DATA.metAgo.ganhoValor)}
                      </td>
                      <td className="p-3 text-right font-bold text-ok">+101.8%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'emcadencia' && (
          <div className="space-y-6">
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <h3 className="text-lg font-black text-ink">
                Estoque de Leads em "Em Cadência" (130 Leads)
              </h3>

              <div className="overflow-x-auto border border-line rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-2 text-ink-2 uppercase font-bold text-[10px]">
                    <tr>
                      <th className="p-3">Empresa / Lead</th>
                      <th className="p-3 text-right">Dias Parado</th>
                      <th className="p-3 text-right">Atividades</th>
                      <th className="p-3 text-right">Gap Médio</th>
                      <th className="p-3">Situação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {DIAGNOSTIC_DATA.emCadencia.topLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-surface-2/50">
                        <td className="p-3 font-bold">{lead.nome}</td>
                        <td className="p-3 text-right font-mono">{lead.diasParado}d</td>
                        <td className="p-3 text-right font-mono">{lead.atividades}</td>
                        <td className="p-3 text-right font-mono">{lead.gap}</td>
                        <td className="p-3">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              lead.status.includes('30+') || lead.status.includes('Sem')
                                ? 'bg-critical/20 text-critical'
                                : 'bg-gold/20 text-gold'
                            }`}
                          >
                            {lead.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'diagnostico' && (
          <div className="space-y-6">
            <div className="p-6 rounded-card-lg border border-line bg-surface shadow-card space-y-4">
              <h3 className="text-lg font-black text-ink flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-critical" />
                Gargalos Críticos Identificados no Diagnóstico
              </h3>

              <div className="space-y-3 text-xs text-ink-2">
                <div className="p-4 rounded-2xl border border-critical/30 bg-critical/5 space-y-1">
                  <p className="font-bold text-critical">
                    1. Queda na Taxa de Agendamento (25% → 8.4%)
                  </p>
                  <p>
                    Apesar de o volume de leads trabalhados quase triplicar (64 → 179), a conversão
                    para reunião agendada caiu drasticamente. Déficit estimado de ~30 reuniões por
                    perda de eficiência por lead.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-critical/30 bg-critical/5 space-y-1">
                  <p className="font-bold text-critical">
                    2. 88% das atividades registradas como "Contatar cliente" genérico
                  </p>
                  <p>
                    Em agosto, 472 das 530 atividades não discriminaram se foi ligação, WhatsApp,
                    e-mail ou LinkedIn. Solução: usar as tags de canal no sprint launcher.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Detalhes / Drill-Down */}
        {modalContent && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-surface border border-line rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl relative">
              <button
                type="button"
                onClick={() => setModalContent(null)}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-surface-2 text-ink-2 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-lg font-black text-ink">{modalContent.title}</h3>
              <div className="text-xs text-ink-2 space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                {modalContent.body}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
