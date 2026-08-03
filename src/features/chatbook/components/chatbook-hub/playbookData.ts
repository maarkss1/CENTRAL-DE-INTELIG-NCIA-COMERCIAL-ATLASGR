export interface QualificationCriteria {
    category: string;
    atlas: string;
    totaltrac: string;
    spinQuestionAtlas: string;
    spinQuestionTotaltrac: string;
}

export interface ObjectionItem {
    id: string;
    title: string;
    description: string;
    bestResponseAtlas: string;
    bestResponseTotaltrac: string;
    technique: string;
}

export const QUALIFICATION_CRITERIA: QualificationCriteria[] = [
    {
        category: 'Need (Necessidade)',
        atlas: 'Alta sinistralidade, perda de cobertura de seguro de carga, falhas recorrentes no monitoramento de rotas de alto risco.',
        totaltrac: 'Excesso de gastos com combustível, falta de telemetria real (leitura CAN), descontrole de jornada de motoristas e vulnerabilidade a jammers.',
        spinQuestionAtlas: 'Qual a sua taxa média de sinistros e como você audita se as regras da GR estão sendo cumpridas em tempo real?',
        spinQuestionTotaltrac: 'Sua telemetria atual lê os dados reais da central CAN do veículo ou trabalha apenas com estimativas de GPS?'
    },
    {
        category: 'Authority (Autoridade)',
        atlas: 'Diretor de Logística, Head de Gerenciamento de Risco (GR), Gerente de Compliance / Seguros, CEO/Dono.',
        totaltrac: 'Gestor de Frotas, Diretor de Operações, Gerente de Risco, RH / Departamento Pessoal (para Jornada).',
        spinQuestionAtlas: 'Quem além de você aprova novos fornecedores de tecnologia em gerenciamento de risco e apólices de transporte?',
        spinQuestionTotaltrac: 'Além da gestão de frota, quem na diretoria acompanha os custos com combustível e passivos trabalhistas de motoristas?'
    },
    {
        category: 'Budget (Orçamento)',
        atlas: 'Orçamento dedicado de GR, tecnologia da informação, seguro de carga e prevenção de perdas.',
        totaltrac: 'Orçamento de frota, manutenção preventiva, combustível e sistemas de rastreamento/telemetria.',
        spinQuestionAtlas: 'Quanto sua operação perdeu no último ano com sinistros ou retenção de sinistros por falta de auditoria?',
        spinQuestionTotaltrac: 'Se conseguirmos reduzir 10% do consumo de combustível com telemetria CAN, qual o impacto no seu orçamento anual?'
    },
    {
        category: 'Timeline (Prazo)',
        atlas: 'Renovação iminente de apólice de seguro de carga ou ocorrência recente de sinistro em rota estratégica.',
        totaltrac: 'Renovação de contrato de rastreamento antigo, expansão de frota ou fiscalização/passivo trabalhista recente.',
        spinQuestionAtlas: 'Para quando está prevista a renovação da sua apólice de seguro ou revisão de regras de GR?',
        spinQuestionTotaltrac: 'Qual a urgência para implementar o controle automático de jornada e videotelemetria nos novos veículos?'
    }
];

export const OBJECTIONS_DATA: ObjectionItem[] = [
    {
        id: '1',
        title: 'Já tenho fornecedor de rastreamento / GR',
        description: 'O cliente alega satisfação com a solução contratada atualmente.',
        bestResponseAtlas: 'Excelente! A AtlasGR não visa substituir sua GR atual, mas atuar como uma camada de Inteligência Artificial Autônoma que audita em tempo real o cumprimento das regras e reduz falhas humanas.',
        bestResponseTotaltrac: 'Entendo perfeitamente! Grande parte dos nossos clientes também usava rastreadores comuns. O diferencial do Total Telemetria CAN é que lemos direto os dados reais da central do veículo, e nossas Iscas RF continuam funcionando mesmo quando ladrões usam jammer.',
        technique: 'Acknowledge & Elevate (Validar e Elevar o Nível)'
    },
    {
        id: '2',
        title: 'Acho o valor muito alto / Fora do Orçamento',
        description: 'Resistência ao preço inicial do investimento.',
        bestResponseAtlas: 'Entendo a preocupação com custos. No entanto, o custo de um único sinistro sem cobertura por descumprimento de regra de GR supera em anos o investimento na plataforma AtlasGR.',
        bestResponseTotaltrac: 'Compreendo. Porém, com o Total Jornada e o Total Telemetria CAN, a economia direta em combustível e a eliminação de horas extras indevidas cobrem integralmente a mensalidade no primeiro trimestre.',
        technique: 'ROI vs Cost Framing (Enquadramento por Retorno)'
    },
    {
        id: '3',
        title: 'Resistência de motoristas (Videotelemetria / Jornada)',
        description: 'Receio da equipe sobre monitoramento contínuo e controle de horas.',
        bestResponseAtlas: 'Nossa inteligência foca na automação de processos de risco, garantindo transparência e segurança para todos os envolvidos na cadeia.',
        bestResponseTotaltrac: 'Essa é uma dúvida comum! O Total Safe com Videotelemetria IA protege o próprio motorista contra acusações injustas e previne acidentes por fadiga. É uma ferramenta de proteção da vida.',
        technique: 'Safety First (Proteção & Parceria)'
    },
    {
        id: '4',
        title: 'Minha seguradora não exige esses adicionais',
        description: 'Visão de conformidade mínima apenas para cumprir apólice.',
        bestResponseAtlas: 'Cumprir a apólice é a obrigação mínima. A AtlasGR garante que, no momento crítico do sinistro, você tenha 100% de conformidade comprovável para receber a indenização sem contestação.',
        bestResponseTotaltrac: 'A exigência da seguradora é o básico. Nossos equipamentos invisíveis (Total Imobilizador e Isca RF) garantem a recuperação real do veículo e da carga, evitando o prejuízo da franquia e o aumento da apólice no ano seguinte.',
        technique: 'Total Asset Protection (Proteção Ativa do Patrimônio)'
    }
];
