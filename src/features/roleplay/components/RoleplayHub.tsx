import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PhoneCall } from 'lucide-react';
import { useBrand } from '../../../contexts/BrandContext';
import { api } from '../../../lib/api';
import { QUALIFICATION_CRITERIA, OBJECTIONS_DATA } from '../../chatbook/components/chatbook-hub/playbookData';
import { CallSetup } from './roleplay-hub/CallSetup';
import { ActiveCallView } from './roleplay-hub/ActiveCallView';
import { CallAnalysisReport } from './roleplay-hub/CallAnalysisReport';
import type { CallAnalysisResult, CallMessage } from './roleplay-hub/types';

export function RoleplayHub() {
    const { activeBrand, brandInfo } = useBrand();

    const [selectedPersona, setSelectedPersona] = useState('gestor_frota');
    const [difficulty, setDifficulty] = useState<'facil' | 'medio' | 'dificil'>('medio');
    const [callActive, setCallActive] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [messages, setMessages] = useState<CallMessage[]>([]);
    const [inputMessage, setInputMessage] = useState('');
    const [isThinking, setIsThinking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [callDuration, setCallDuration] = useState(0);
    const [botSpeaking, setBotSpeaking] = useState(false);
    const [analysisResult, setAnalysisResult] = useState<CallAnalysisResult | null>(null);
    const [turnEvaluations, setTurnEvaluations] = useState<Array<{
        clarity: number;
        objectionHandling: number;
        total: number;
        feedback: string;
    }>>([]);

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
        let interval: ReturnType<typeof setInterval> | undefined;
        if (callActive && !isFinished) {
            interval = setInterval(() => setCallDuration(p => p + 1), 1000);
        }
        return () => clearInterval(interval);
    }, [callActive, isFinished]);

    const formatDuration = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

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
            recognitionRef.current.onerror = () => setIsListening(false);
            recognitionRef.current.onend = () => setIsListening(false);
        }
    }, []);

    const toggleListening = () => {
        if (!recognitionRef.current) {
            alert('Reconhecimento de voz não suportado neste navegador. Tente pelo Chrome desktop.');
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
            const voices = window.speechSynthesis.getVoices();
            const ptVoices = voices.filter(v => v.lang.includes('pt-BR') || v.lang.includes('pt_BR'));
            const bestVoice =
                ptVoices.find(v => v.name.toLowerCase().includes('google')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('premium')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('online')) ||
                ptVoices.find(v => v.name.toLowerCase().includes('microsoft')) ||
                ptVoices[0];
            if (bestVoice) utterance.voice = bestVoice;
            utterance.rate = 1.1;
            utterance.pitch = 1.05;
            utterance.onstart = () => setBotSpeaking(true);
            utterance.onend = () => setBotSpeaking(false);
            window.speechSynthesis.speak(utterance);
        }
    };

    const startCall = () => {
        setCallActive(true);
        setIsFinished(false);
        setAnalysisResult(null);
        setTurnEvaluations([]);
        setCallDuration(0);

        const initialGreeting = activeBrand === 'totaltrac'
            ? 'Alô? Aqui é da frota. Recebi seu contato sobre soluções de rastreamento e telemetria. O que exatamente a TotalTrac oferece que é diferente do mercado?'
            : 'Alô? Recebi seu contato sobre a plataforma AtlasGR. Nossa operação já trabalha com Gerenciamento de Risco. Por que deveríamos conversar?';

        setMessages([{
            id: '1',
            sender: 'bot',
            text: initialGreeting,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }]);
        speakText(initialGreeting);
    };

    const handleSendMessage = async () => {
        if (!inputMessage.trim() || isThinking) return;

        const userMsg: CallMessage = {
            id: Date.now().toString(),
            sender: 'user',
            text: inputMessage.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
                result: { reply: string; feedback: string; clarity: number; objectionHandling: number; total: number };
            }>('/api/intelligence/studio', {
                kind: 'roleplay',
                brand: { name: brandInfo.name, description: brandInfo.description },
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
                sender: 'bot' as const,
                text: response.result.reply,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };
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

    const finishCall = () => {
        setCallActive(false);
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

        setAnalysisResult({
            score: average('total'),
            feedback: turnEvaluations.at(-1)?.feedback
                || 'Fale ao menos uma resposta na ligação para receber uma avaliação pedagógica.',
            strengths: [
                `Clareza média estimada: ${average('clarity')}%`,
                `Tratamento de objeções estimado: ${average('objectionHandling')}%`,
                `${turnEvaluations.length} resposta(s) analisada(s) pelo motor Groq`,
            ],
            improvements: turnEvaluations.length
                ? turnEvaluations.slice(-3).map((item) => item.feedback)
                : ['Continue a ligação para gerar dicas baseadas nas suas respostas reais.'],
        });
    };

    return (
        <div className="flex-1 overflow-y-auto bg-transparent p-4 md:p-8 flex flex-col items-center relative overflow-hidden transition-colors duration-1000">
            <div className="fixed top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-orange-400/10 blur-[120px] pointer-events-none" />
            <div className="fixed bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-400/10 blur-[120px] pointer-events-none" />

            <div className="w-full max-w-4xl space-y-12 pb-24 relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-surface/70 backdrop-blur-2xl rounded-[3rem] p-8 md:p-12 border border-line shadow-[0_20px_40px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center gap-5 relative overflow-hidden"
                >
                    <div className="absolute inset-0 bg-gradient-to-b from-surface/50 to-transparent pointer-events-none" />
                    <div className="relative z-10 flex flex-col items-center gap-5">
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-sm ${brandInfo.badgeBg} border-current/20`}>
                            {brandInfo.badgeText}
                        </span>
                        <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-ink tracking-tight flex items-center gap-3">
                            <PhoneCall className={activeBrand === 'totaltrac' ? 'text-sky-500' : 'text-atlas-orange'} size={40} /> Roleplay
                        </h1>
                        <p className="text-ink-2 text-base md:text-lg font-medium max-w-xl">
                            Simule uma ligação real de vendas por voz para {brandInfo.name} e receba uma nota + dicas de melhoria ao final.
                        </p>
                    </div>
                </motion.div>

                {!callActive && !isFinished && (
                    <CallSetup
                        activeBrand={activeBrand}
                        currentPersonas={currentPersonas}
                        selectedPersona={selectedPersona}
                        setSelectedPersona={setSelectedPersona}
                        difficulty={difficulty}
                        setDifficulty={setDifficulty}
                        onStart={startCall}
                    />
                )}

                {callActive && (
                    <ActiveCallView
                        activeBrand={activeBrand}
                        currentPersonas={currentPersonas}
                        selectedPersona={selectedPersona}
                        messages={messages}
                        isThinking={isThinking}
                        isListening={isListening}
                        inputMessage={inputMessage}
                        toggleListening={toggleListening}
                        onSendMessage={handleSendMessage}
                        callDuration={formatDuration(callDuration)}
                        botSpeaking={botSpeaking}
                        onEndCall={finishCall}
                    />
                )}

                {isFinished && analysisResult && (
                    <CallAnalysisReport analysisResult={analysisResult} onRestart={startCall} />
                )}
            </div>
        </div>
    );
}
