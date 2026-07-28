import { useState, useEffect, useRef } from 'react';
import {
    MessageSquare, Sparkles, Mic, MicOff, Send, RotateCcw,
    CheckCircle2, AlertTriangle, Trophy, Bot, Zap, Phone, PhoneOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';

interface SpeechRecognitionEventLike {
    results: {
        [index: number]: {
            [index: number]: { transcript: string };
        };
    };
}

interface SpeechRecognitionLike {
    continuous: boolean;
    lang: string;
    onresult: ((event: SpeechRecognitionEventLike) => void) | null;
    onerror: (() => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
}

interface SpeechRecognitionConstructorLike {
    new(): SpeechRecognitionLike;
}

// TypeScript declaration for Web Speech API
declare global {
    interface Window {
        webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
        SpeechRecognition?: SpeechRecognitionConstructorLike;
    }
}

// Removed TabType as we only have Roleplay now

interface Message {
    id: string;
    sender: 'bot' | 'user';
    text: string;
    timestamp: string;
}

interface QualificationCriteria {
    category: string;
    atlas: string;
    totaltrac: string;
    spinQuestionAtlas: string;
    spinQuestionTotaltrac: string;
}

interface ObjectionItem {
    id: string;
    title: string;
    description: string;
    bestResponseAtlas: string;
    bestResponseTotaltrac: string;
    technique: string;
}

const QUALIFICATION_CRITERIA: QualificationCriteria[] = [
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

const OBJECTIONS_DATA: ObjectionItem[] = [
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

export function ChatbookHub() {
    const { activeBrand, brandInfo } = useBrand();

    // Roleplay state
    const [selectedPersona, setSelectedPersona] = useState('gestor_frota');
    const [difficulty, setDifficulty] = useState<'facil' | 'medio' | 'dificil'>('medio');
    const [simulationActive, setSimulationActive] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    // Tab navigation state
    const [activeTab, setActiveTab] = useState<'simulador' | 'qualificacao' | 'objecoes'>('simulador');

    // Voice call specific state
    const [simulationMode, setSimulationMode] = useState<'text' | 'voice'>('text');
    const [callDuration, setCallDuration] = useState(0);
    const [botSpeaking, setBotSpeaking] = useState(false);

    // Score & Analysis results
    const [analysisResult, setAnalysisResult] = useState<{
        score: number;
        qualificationsHit: string[];
        objectionsHandled: string[];
        feedback: string;
        strengths: string[];
        improvements: string[];
    } | null>(null);
    const [turnEvaluations, setTurnEvaluations] = useState<Array<{
        clarity: number;
        objectionHandling: number;
        total: number;
        feedback: string;
    }>>([]);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

    const personasAtlas = [
        { id: 'diretor_logistica', label: 'Diretor de Logística & Supply', desc: 'Focado em ROI, eficiência de processos e redução de sinistros.' },
        { id: 'gerente_risco', label: 'Gerente de Risco (GR)', desc: 'Exigente, cético quanto a novas ferramentas, focado em compliance.' },
        { id: 'comprador_pme', label: 'Dono / CEO de Transportadora', desc: 'Pouco tempo, focado em custo-benefício e facilidade de implantação.' }
    ];

    const personasTotaltrack = [
        { id: 'gestor_frota', label: 'Gestor de Frotas (Transportadora)', desc: 'Preocupado com consumo de combustível, manutenção e jammers.' },
        { id: 'diretor_operacoes', label: 'Diretor de Operações Logísticas', desc: 'Busca telemetria CAN real, videotelemetria e controle de jornada.' },
        { id: 'gerente_rh', label: 'Gerente de RH / Passivo Trabalhista', desc: 'Interessado no Total Jornada para cumprir legislação e evitar horas extras.' }
    ];

    const currentPersonas = activeBrand === 'totaltrac' ? personasTotaltrack : personasAtlas;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isThinking]);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (simulationActive && simulationMode === 'voice' && !isFinished) {
            interval = setInterval(() => setCallDuration(p => p + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [simulationActive, simulationMode, isFinished]);

    const formatDuration = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Setup speech recognition
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.lang = 'pt-BR';
            recognitionRef.current.onresult = (event: SpeechRecognitionEventLike) => {
                const transcript = event.results[0][0].transcript;
                setInputMessage(transcript);
                setIsListening(false);
            };
            recognitionRef.current.onerror = () => {
                setIsListening(false);
            };
            recognitionRef.current.onend = () => {
                setIsListening(false);
            };
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert('Reconhecimento de voz não suportado neste navegador. Utilize o campo de texto.');
            return;
        }
        if (isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        } else {
            setIsListening(true);
            recognitionRef.current.start();
        }
    };

    const speakText = (text: string) => {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'pt-BR';
            
            // Try to find a premium, natural, or Google voice for pt-BR
            const voices = window.speechSynthesis.getVoices();
            const ptVoices = voices.filter(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR'));
            
            const bestVoice = 
                ptVoices.find(v => v.name.toLowerCase().includes('google')) || 
                ptVoices.find(v => v.name.toLowerCase().includes('premium')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('online')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('microsoft')) ||
                ptVoices[0];

            if (bestVoice) {
                utterance.voice = bestVoice;
            }

            utterance.rate = 1.1; // Slightly faster sounds less robotic
            utterance.pitch = 1.05; // Slight pitch tweak for a more conversational tone
            
            utterance.onstart = () => setBotSpeaking(true);
            utterance.onend = () => setBotSpeaking(false);
            window.speechSynthesis.speak(utterance);
        }
    };

    const startSimulation = (mode: 'text' | 'voice' = 'text') => {
        setSimulationMode(mode);
        setSimulationActive(true);
        setIsFinished(false);
        setAnalysisResult(null);
        setTurnEvaluations([]);
        setCallDuration(0);

        const initialGreeting = activeBrand === 'totaltrac'
            ? 'Olá! Sou o responsável pela frota da nossa empresa. Recebi seu contato sobre soluções de rastreamento e telemetria. O que exatamente a TotalTrac oferece que é diferente do mercado?'
            : 'Olá! Recebi seu contato sobre a plataforma AtlasGR. Nossa operação já trabalha com Gerenciamento de Risco. Por que deveríamos conversar?';

        setMessages([
            {
                id: '1',
                sender: 'bot',
                text: initialGreeting,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }
        ]);
        speakText(initialGreeting);
    };

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || isThinking) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            sender: 'user',
            text: inputMessage.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const text = inputMessage.trim();
        const nextMessages = [...messages, userMsg];
        setMessages(nextMessages);
        setInputMessage('');
        setIsThinking(true);

        const persona = ['diretor_operacoes', 'diretor_logistica'].includes(selectedPersona)
            ? 'tech_director'
            : ['gestor_frota', 'comprador_pme'].includes(selectedPersona)
                ? 'skeptical_cfo'
                : 'strict_buyer';
        const playbookContext = JSON.stringify({
            difficulty,
            persona: currentPersonas.find((item) => item.id === selectedPersona),
            qualificationCriteria: QUALIFICATION_CRITERIA.map((item) => ({
                category: item.category,
                criteria: activeBrand === 'totaltrac' ? item.totaltrac : item.atlas,
                question: activeBrand === 'totaltrac' ? item.spinQuestionTotaltrac : item.spinQuestionAtlas,
            })),
            objections: OBJECTIONS_DATA.map((item) => ({
                title: item.title,
                technique: item.technique,
                guidance: activeBrand === 'totaltrac' ? item.bestResponseTotaltrac : item.bestResponseAtlas,
            })),
        });

        try {
            const response = await api.post<{
                result: {
                    reply: string;
                    feedback: string;
                    clarity: number;
                    objectionHandling: number;
                    total: number;
                };
            }>('/api/intelligence/studio', {
                kind: 'roleplay',
                brand: {
                    name: brandInfo.name,
                    description: brandInfo.description,
                },
                inputs: {
                    persona,
                    message: text,
                    transcript: nextMessages.map((message) => ({
                        sender: message.sender === 'user' ? 'sdr' : 'buyer',
                        text: message.text,
                    })),
                    playbookContext,
                },
            }, { timeoutMs: 90_000 });

            const botMessage = {
                id: Date.now().toString(),
                sender: 'bot',
                text: response.result.reply,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            } satisfies Message;
            setMessages(prev => [...prev, botMessage]);
            setTurnEvaluations(prev => [...prev, {
                clarity: response.result.clarity,
                objectionHandling: response.result.objectionHandling,
                total: response.result.total,
                feedback: response.result.feedback,
            }]);
            speakText(response.result.reply);
        } catch (error) {
            const reason = error instanceof Error ? error.message : 'Falha inesperada';
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                sender: 'bot',
                text: `Não consegui consultar o comprador simulado agora. ${reason}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }]);
        } finally {
            setIsThinking(false);
        }
    };

    const finishSimulation = () => {
        setSimulationActive(false);
        setIsFinished(true);
        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }

        const average = (field: 'clarity' | 'objectionHandling' | 'total') =>
            turnEvaluations.length
                ? Math.round(turnEvaluations.reduce((sum, item) => sum + item[field], 0) / turnEvaluations.length)
                : 0;
        const score = average('total');
        setAnalysisResult({
            score,
            qualificationsHit: [],
            objectionsHandled: [],
            feedback: turnEvaluations.at(-1)?.feedback
                || 'Envie ao menos uma resposta ao comprador para receber uma avaliação pedagógica.',
            strengths: [
                `Clareza média estimada: ${average('clarity')}%`,
                `Tratamento de objeções estimado: ${average('objectionHandling')}%`,
                `${turnEvaluations.length} resposta(s) analisada(s) pelo motor Groq`,
            ],
            improvements: turnEvaluations.length
                ? turnEvaluations.slice(-3).map((item) => item.feedback)
                : ['Continue a conversa para gerar recomendações baseadas nas suas respostas.'],
        });
    };

    return (
        <div className="flex-1 overflow-y-auto bg-[#fbfbfd] p-4 md:p-8 flex flex-col items-center relative overflow-hidden transition-colors duration-1000">
            {/* Ambient Background Glows */}
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-400/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-6xl space-y-12 pb-24 relative z-10">

                {/* Header Hub & Tabs - Glassmorphism */}
                <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white/70 backdrop-blur-2xl rounded-[3rem] p-8 md:p-12 border border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center gap-8 relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-white/50 to-transparent pointer-events-none" />
                    
                    <div className="relative z-10 flex flex-col items-center gap-5">
                        <div className="flex items-center gap-3">
                            <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${brandInfo.badgeBg} border-current/20`}>
                                {brandInfo.badgeText}
                            </span>
                            <span className="text-gray-400 text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 bg-gray-100 px-3 py-1.5 rounded-full">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Commercial Playbook
                            </span>
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 tracking-tight">
                            Chatbook & <span className={`text-transparent bg-clip-text bg-gradient-to-r ${activeBrand === 'totaltrac' ? 'from-sky-500 to-blue-600' : 'from-orange-500 to-amber-600'}`}>Roleplay Simulator</span>
                        </h1>
                        <p className="text-gray-500 text-base md:text-lg font-medium max-w-2xl">
                            Treinamento gamificado em tempo real, matrizes de qualificação SPIN e contorno estratégico de objeções para {brandInfo.name}.
                        </p>
                    </div>
                </motion.div>

                {/* TAB NAVIGATION */}
                <div className="flex items-center justify-center gap-3 flex-wrap">
                    {([
                        { id: 'simulador', label: '⚡ Roleplay Simulator' },
                        { id: 'qualificacao', label: '🎯 Matriz SPIN / BANT' },
                        { id: 'objecoes', label: '🛡️ Contorno de Objeções' },
                    ] as const).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-wider transition-all ${
                                activeTab === tab.id
                                    ? activeBrand === 'totaltrac'
                                        ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/25'
                                        : 'bg-orange-500 text-white shadow-lg shadow-orange-500/25'
                                    : 'bg-white/80 text-gray-600 border border-gray-200 hover:bg-white hover:shadow-md'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ROLEPLAY SIMULATOR */}
                {activeTab === 'simulador' && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
                        className="space-y-8"
                    >
                        {!simulationActive && !isFinished && (
                            <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-8 md:p-12 border border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.03)] space-y-10">
                                <div className="text-center space-y-3">
                                    <h2 className="text-2xl md:text-3xl font-black text-gray-900 flex items-center justify-center gap-3 tracking-tight">
                                        <Bot className={`w-8 h-8 ${activeBrand === 'totaltrac' ? 'text-sky-500' : 'text-atlas-orange'}`} /> Setup da Simulação
                                    </h2>
                                    <p className="text-gray-500 text-base font-medium max-w-xl mx-auto">
                                        Escolha a persona do comprador e o nível de objeção. A IA simulará a conversa para testar suas habilidades.
                                    </p>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {currentPersonas.map((p) => (
                                        <motion.div
                                            whileHover={{ y: -5, scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            key={p.id}
                                            onClick={() => setSelectedPersona(p.id)}
                                            className={`p-6 md:p-8 rounded-[2rem] border-2 cursor-pointer transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                                                selectedPersona === p.id
                                                    ? activeBrand === 'totaltrac'
                                                        ? 'border-sky-500 bg-sky-50/80 shadow-[0_10px_30px_rgba(2,132,199,0.15)]'
                                                        : 'border-orange-500 bg-orange-50/80 shadow-[0_10px_30px_rgba(249,115,22,0.15)]'
                                                    : 'border-gray-100 hover:border-gray-200 bg-white shadow-sm'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <span className="font-black text-lg text-gray-900 leading-tight pr-4">{p.label}</span>
                                                {selectedPersona === p.id && (
                                                    <CheckCircle2 className={`w-6 h-6 shrink-0 ${activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}`} />
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500 leading-relaxed font-medium">{p.desc}</p>
                                        </motion.div>
                                    ))}
                                </div>

                                <div className="flex flex-col lg:flex-row items-center justify-between gap-6 pt-6 border-t border-gray-100">
                                    <div className="flex flex-col md:flex-row items-center gap-4 w-full lg:w-auto">
                                        <span className="text-xs font-black uppercase tracking-widest text-gray-400">Dificuldade:</span>
                                        <div className="flex bg-gray-100 p-1.5 rounded-[1.25rem] w-full md:w-auto">
                                            {(['facil', 'medio', 'dificil'] as const).map((level) => (
                                                <button
                                                    key={level}
                                                    onClick={() => setDifficulty(level)}
                                                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl text-xs font-black capitalize transition-all ${
                                                        difficulty === level ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                                >
                                                    {level}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
                                        <button
                                            onClick={() => startSimulation('text')}
                                            className={`w-full sm:w-auto px-8 py-4 rounded-[1.75rem] font-black text-white text-sm uppercase tracking-wider shadow-xl shadow-current/20 flex items-center justify-center gap-3 transition-transform hover:scale-105 ${
                                                activeBrand === 'totaltrac'
                                                    ? 'bg-sky-600 hover:bg-sky-700'
                                                    : 'bg-atlas-orange hover:bg-orange-600'
                                            }`}
                                        >
                                            <MessageSquare className="w-5 h-5 fill-current/20" /> Mensagem (Chat)
                                        </button>
                                        
                                        <button
                                            onClick={() => startSimulation('voice')}
                                            className="w-full sm:w-auto px-8 py-4 rounded-[1.75rem] font-black text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 text-sm uppercase tracking-wider shadow-lg flex items-center justify-center gap-3 transition-transform hover:scale-105"
                                        >
                                            <Phone className="w-5 h-5" /> Ligar para Lead (Voz)
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TELA DE SIMULAÇÃO ATIVA */}
                        {simulationActive && (
                            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={`bg-white/80 backdrop-blur-xl rounded-[3rem] border border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col ${simulationMode === 'voice' ? 'h-[600px]' : 'h-[700px]'}`}>
                                
                                {/* MODO TEXTO: CHAT */}
                                {simulationMode === 'text' && (
                                    <>
                                        {/* Topbar do Chat */}
                                        <div className="px-8 py-6 bg-white/60 border-b border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-14 h-14 rounded-[1.5rem] flex items-center justify-center shadow-lg ${activeBrand === 'totaltrac' ? 'bg-sky-100 text-sky-600' : 'bg-orange-100 text-orange-600'}`}>
                                                    <Bot className="w-7 h-7" />
                                                </div>
                                                <div>
                                                    <h3 className="font-black text-lg text-gray-900 tracking-tight">
                                                        {currentPersonas.find(p => p.id === selectedPersona)?.label || 'Lead'}
                                                    </h3>
                                                    <p className="text-sm font-medium text-gray-500 flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                                        Online
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setSimulationActive(false);
                                                    setMessages([]);
                                                    if ((simulationMode as string) === 'voice') {
                                                        if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                                                    }
                                                }}
                                                className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors text-sm uppercase tracking-wider"
                                            >
                                                Encerrar
                                            </button>
                                        </div>

                                        {/* Mensagens */}
                                        <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-6 bg-gray-50/30">
                                            <AnimatePresence>
                                                {messages.map((m) => (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        key={m.id}
                                                        className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                                    >
                                                        <div
                                                            className={`max-w-2xl px-6 py-4 rounded-[2rem] text-base leading-relaxed font-medium ${
                                                                m.sender === 'user'
                                                                    ? activeBrand === 'totaltrac'
                                                                        ? 'bg-sky-600 text-white rounded-br-md shadow-[0_10px_20px_rgba(2,132,199,0.2)]'
                                                                        : 'bg-atlas-orange text-white rounded-br-md shadow-[0_10px_20px_rgba(249,115,22,0.2)]'
                                                                    : 'bg-white text-gray-800 border border-gray-100 rounded-bl-md shadow-sm'
                                                            }`}
                                                        >
                                                            <p>{m.text}</p>
                                                            <span className={`block text-[10px] mt-3 font-black uppercase tracking-wider ${m.sender === 'user' ? 'text-white/60 text-right' : 'text-gray-400'}`}>
                                                                {m.timestamp}
                                                            </span>
                                                        </div>
                                                    </motion.div>
                                                ))}
                                            </AnimatePresence>

                                            {isThinking && (
                                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                                                    <div className="bg-white border border-gray-100 px-6 py-4 rounded-[2rem] rounded-bl-md shadow-sm text-sm font-medium text-gray-500 flex items-center gap-3">
                                                        <div className="flex gap-1">
                                                            <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                            <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                            <span className="w-2 h-2 rounded-full bg-gray-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                        </div>
                                                        Cliente está digitando...
                                                    </div>
                                                </motion.div>
                                            )}
                                            <div ref={messagesEndRef} />
                                        </div>

                                        {/* Input bar */}
                                        <div className="p-6 bg-white/80 backdrop-blur-md border-t border-gray-100 flex items-center gap-4">
                                            <button
                                                onClick={toggleListening}
                                                className={`p-4 rounded-[1.5rem] transition-all shadow-sm ${
                                                    isListening
                                                        ? 'bg-rose-100 text-rose-600 animate-pulse scale-105'
                                                        : 'bg-gray-50 hover:bg-gray-100 text-gray-600'
                                                }`}
                                                title="Falar via Microfone"
                                            >
                                                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                                            </button>

                                            <input
                                                type="text"
                                                value={inputMessage}
                                                onChange={(e) => setInputMessage(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                                placeholder="Digite seu argumento de vendas ou fale no microfone..."
                                                className="flex-1 bg-gray-50 border border-gray-200 rounded-[1.75rem] px-6 py-4 text-base font-medium focus:outline-none focus:border-current focus:ring-4 focus:ring-current/10 transition-all placeholder:text-gray-400"
                                                style={{ color: activeBrand === 'totaltrac' ? '#0284c7' : '#ea580c' }}
                                            />

                                            <button
                                                onClick={handleSendMessage}
                                                disabled={!inputMessage.trim() || isThinking}
                                                className={`p-4 rounded-[1.5rem] text-white transition-all disabled:opacity-50 shadow-lg hover:scale-105 ${
                                                    activeBrand === 'totaltrac' ? 'bg-sky-600 hover:bg-sky-700 shadow-sky-600/25' : 'bg-atlas-orange hover:bg-orange-600 shadow-orange-600/25'
                                                }`}
                                            >
                                                <Send className="w-6 h-6" />
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* MODO VOZ: LIGAÇÃO TELEFÔNICA */}
                                {simulationMode === 'voice' && (
                                    <div className="flex-1 flex flex-col relative bg-[#0b0f19] text-white overflow-hidden">
                                        <div className={`absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${activeBrand === 'totaltrac' ? 'from-sky-500 via-[#0b0f19] to-[#0b0f19]' : 'from-orange-500 via-[#0b0f19] to-[#0b0f19]'}`} />
                                        
                                        <div className="flex-1 flex flex-col items-center justify-center relative z-10 space-y-12">
                                            {/* Caller Info */}
                                            <div className="text-center space-y-2">
                                                <h3 className="text-3xl font-black tracking-tight">{currentPersonas.find(p => p.id === selectedPersona)?.label}</h3>
                                                <p className="text-gray-400 font-medium font-mono text-lg">{formatDuration(callDuration)}</p>
                                            </div>

                                            {/* Avatar Pulsante */}
                                            <div className="relative">
                                                {/* Pulse animations when bot is speaking */}
                                                {botSpeaking && (
                                                    <>
                                                        <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className={`absolute inset-0 rounded-full opacity-30 blur-md ${activeBrand === 'totaltrac' ? 'bg-sky-500' : 'bg-orange-500'}`} />
                                                        <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className={`absolute inset-0 rounded-full opacity-10 blur-xl ${activeBrand === 'totaltrac' ? 'bg-sky-500' : 'bg-orange-500'}`} />
                                                    </>
                                                )}
                                                
                                                <div className="w-32 h-32 rounded-full bg-gray-800 border-4 border-gray-700 flex items-center justify-center relative z-10 shadow-2xl">
                                                    <Bot className={`w-16 h-16 ${botSpeaking ? (activeBrand === 'totaltrac' ? 'text-sky-400' : 'text-orange-400') : 'text-gray-400'}`} />
                                                </div>
                                            </div>

                                            {/* Transcrição (Subtitles) */}
                                            <div className="h-24 px-8 w-full max-w-2xl flex flex-col items-center justify-center text-center">
                                                {isThinking && <p className="text-gray-500 italic">Analisando sua resposta...</p>}
                                                {botSpeaking && (
                                                    <p className={`text-lg font-medium leading-relaxed ${activeBrand === 'totaltrac' ? 'text-sky-100' : 'text-orange-100'}`}>
                                                        {messages.filter(m => m.sender === 'bot').pop()?.text}
                                                    </p>
                                                )}
                                                {isListening && (
                                                    <p className="text-lg font-medium leading-relaxed text-white">
                                                        {inputMessage || "Ouvindo você..."}
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Call Controls */}
                                        <div className="p-8 pb-12 flex items-center justify-center gap-8 relative z-10 bg-gradient-to-t from-black/80 to-transparent">
                                            {/* Microphone Toggle */}
                                            <button
                                                onClick={toggleListening}
                                                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                                                    isListening
                                                        ? 'bg-white text-gray-900 shadow-[0_0_30px_rgba(255,255,255,0.3)]'
                                                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                                                }`}
                                            >
                                                {isListening ? <Mic className="w-8 h-8" /> : <MicOff className="w-8 h-8" />}
                                            </button>

                                            {/* Send Button (Only visible if there is input in voice mode) */}
                                            <AnimatePresence>
                                                {isListening && inputMessage.trim() && (
                                                    <motion.button
                                                        initial={{ scale: 0, opacity: 0 }}
                                                        animate={{ scale: 1, opacity: 1 }}
                                                        exit={{ scale: 0, opacity: 0 }}
                                                        onClick={handleSendMessage}
                                                        className={`w-20 h-20 rounded-full flex items-center justify-center text-white shadow-xl ${activeBrand === 'totaltrac' ? 'bg-sky-600 hover:bg-sky-500' : 'bg-orange-600 hover:bg-orange-500'}`}
                                                    >
                                                        <Send className="w-8 h-8 ml-1" />
                                                    </motion.button>
                                                )}
                                            </AnimatePresence>

                                            {/* End Call */}
                                            <button
                                                onClick={finishSimulation}
                                                className="w-20 h-20 rounded-full flex items-center justify-center bg-rose-600 text-white hover:bg-rose-500 transition-all shadow-[0_0_30px_rgba(225,29,72,0.4)]"
                                            >
                                                <PhoneOff className="w-8 h-8" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {/* RELATÓRIO DE ANÁLISE PÓS-SIMULAÇÃO */}
                        {isFinished && analysisResult && (
                            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/90 backdrop-blur-2xl rounded-[3rem] p-10 border border-white/80 shadow-[0_30px_60px_rgba(0,0,0,0.08)] space-y-10 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/10 rounded-full blur-[80px] pointer-events-none" />
                                
                                <div className="flex flex-col md:flex-row items-center justify-between gap-8 bg-gray-900 text-white p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                                    
                                    <div className="relative z-10 text-center md:text-left flex-1">
                                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-widest mb-4">
                                            <Trophy className="w-4 h-4" /> Relatório pedagógico · Groq IA
                                        </div>
                                        <h2 className="text-4xl lg:text-5xl font-black mb-3 tracking-tight">Análise de Desempenho</h2>
                                        <p className="text-gray-400 text-base md:text-lg font-medium leading-relaxed max-w-2xl">{analysisResult.feedback}</p>
                                    </div>

                                    <div className="relative z-10 flex flex-col items-center bg-white/10 backdrop-blur-xl px-12 py-8 rounded-[2rem] border border-white/20 shrink-0">
                                        <span className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Pontuação estimada</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-br from-amber-300 to-orange-500 tracking-tighter">{analysisResult.score}</span>
                                        </div>
                                        <div className="mt-4 px-4 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-bold uppercase tracking-widest">
                                            Estimativa pedagógica
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 relative z-10">
                                    <div className="bg-emerald-50/50 p-8 rounded-[2rem] border border-emerald-100 space-y-6">
                                        <h3 className="font-black text-xl text-emerald-900 flex items-center gap-3 tracking-tight">
                                            <div className="p-2 bg-emerald-100 rounded-xl"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div> Métricas estimadas pela IA
                                        </h3>
                                        <ul className="space-y-4">
                                            {analysisResult.strengths.map((s, idx) => (
                                                <li key={idx} className="flex items-start gap-3 text-base text-emerald-800 font-medium leading-relaxed">
                                                    <span className="w-2 h-2 mt-2 rounded-full bg-emerald-500 shrink-0" /> {s}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className="bg-rose-50/50 p-8 rounded-[2rem] border border-rose-100 space-y-6">
                                        <h3 className="font-black text-xl text-rose-900 flex items-center gap-3 tracking-tight">
                                            <div className="p-2 bg-rose-100 rounded-xl"><AlertTriangle className="w-6 h-6 text-rose-600" /></div> Oportunidades de Melhoria
                                        </h3>
                                        <ul className="space-y-4">
                                            {analysisResult.improvements.map((imp, idx) => (
                                                <li key={idx} className="flex items-start gap-3 text-base text-rose-800 font-medium leading-relaxed">
                                                    <span className="w-2 h-2 mt-2 rounded-full bg-rose-500 shrink-0" /> {imp}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                <div className="flex justify-center pt-4 gap-4">
                                    <button
                                        onClick={() => startSimulation('text')}
                                        className="px-10 py-5 bg-gray-900 hover:bg-black text-white rounded-[1.75rem] font-black text-sm uppercase tracking-wider flex items-center gap-3 transition-transform hover:scale-105 shadow-xl shadow-gray-900/20"
                                    >
                                        <RotateCcw className="w-5 h-5" /> Nova Simulação (Chat)
                                    </button>
                                    <button
                                        onClick={() => startSimulation('voice')}
                                        className="px-10 py-5 bg-white hover:bg-gray-50 border border-gray-200 text-gray-900 rounded-[1.75rem] font-black text-sm uppercase tracking-wider flex items-center gap-3 transition-transform hover:scale-105 shadow-xl"
                                    >
                                        <Phone className="w-5 h-5" /> Nova Ligação
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {/* ABA 2: MATRIZ DE QUALIFICAÇÃO (SPIN / BANT) */}
                {activeTab === 'qualificacao' && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                        <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-8 md:p-12 border border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.03)]">
                            <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3">
                                Matriz de Qualificação — <span className={activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}>{brandInfo.name}</span>
                            </h2>
                            <p className="text-gray-500 text-base font-medium mb-10 max-w-3xl">
                                Estrutura SPIN Selling e BANT para validar se o Lead possui o perfil ideal e a dor correta para fechamento.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {QUALIFICATION_CRITERIA.map((crit, idx) => (
                                    <motion.div whileHover={{ y: -5 }} key={idx} className="bg-white/60 p-8 rounded-[2rem] border border-white shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-6 flex flex-col justify-between">
                                        <div className="flex items-start justify-between gap-4">
                                            <h3 className="font-black text-xl text-gray-900 tracking-tight">{crit.category}</h3>
                                            <span className={`px-3 py-1.5 text-[10px] font-black rounded-xl uppercase tracking-widest ${activeBrand === 'totaltrac' ? 'bg-sky-100 text-sky-700' : 'bg-orange-100 text-orange-700'}`}>
                                                SPIN / BANT
                                            </span>
                                        </div>

                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Critério para {brandInfo.name}</p>
                                            <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                                {activeBrand === 'totaltrac' ? crit.totaltrac : crit.atlas}
                                            </p>
                                        </div>

                                        <div className={`p-5 rounded-[1.5rem] border ${activeBrand === 'totaltrac' ? 'bg-sky-50/50 border-sky-100' : 'bg-orange-50/50 border-orange-100'}`}>
                                            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5 ${activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}`}>
                                                <Zap className="w-4 h-4" /> Pergunta SPIN Recomendada
                                            </p>
                                            <p className="text-sm text-gray-800 italic font-medium leading-relaxed">
                                                "{activeBrand === 'totaltrac' ? crit.spinQuestionTotaltrac : crit.spinQuestionAtlas}"
                                            </p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* ABA 3: MATRIZ DE OBJEÇÕES */}
                {activeTab === 'objecoes' && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
                        <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-8 md:p-12 border border-white/80 shadow-[0_20px_40px_rgba(0,0,0,0.03)]">
                            <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight mb-3">
                                Contorno de Objeções — <span className={activeBrand === 'totaltrac' ? 'text-sky-600' : 'text-atlas-orange'}>{brandInfo.name}</span>
                            </h2>
                            <p className="text-gray-500 text-base font-medium mb-10 max-w-3xl">
                                Respostas de alta conversão para transformar hesitações e objeções comuns em oportunidades de fechamento.
                            </p>

                            <div className="space-y-6">
                                {OBJECTIONS_DATA.map((obj) => (
                                    <motion.div whileHover={{ scale: 1.01 }} key={obj.id} className="p-8 rounded-[2rem] border border-white bg-white/60 shadow-[0_10px_30px_rgba(0,0,0,0.03)] hover:shadow-lg transition-all duration-300 space-y-5">
                                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-gray-100 pb-5">
                                            <div>
                                                <h3 className="font-black text-xl text-gray-900 tracking-tight">{obj.title}</h3>
                                                <p className="text-sm text-gray-500 font-medium mt-1">{obj.description}</p>
                                            </div>
                                            <span className="px-4 py-2 bg-amber-100/50 text-amber-700 text-[10px] font-black uppercase tracking-widest rounded-xl self-start shrink-0 border border-amber-200">
                                                Técnica: {obj.technique}
                                            </span>
                                        </div>

                                        <div className={`p-5 rounded-[1.5rem] border ${activeBrand === 'totaltrac' ? 'bg-sky-50/50 border-sky-100' : 'bg-orange-50/50 border-orange-100'}`}>
                                            <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${activeBrand === 'totaltrac' ? 'text-sky-400' : 'text-orange-400'}`}>Script Comercial Sugerido</p>
                                            <div className="text-base text-gray-800 leading-relaxed font-medium italic">
                                                "{activeBrand === 'totaltrac' ? obj.bestResponseTotaltrac : obj.bestResponseAtlas}"
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

            </div>
        </div>
    );
}
