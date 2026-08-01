import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { SpaceGame } from './SpaceGame';
import { Card } from '../../../components/ui/Card';
import { Trophy, Play, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const SALES_FACTS = [
    "E-mails curtos (50-125 palavras) têm 50% mais taxa de resposta.",
    "Follow-ups podem aumentar suas conversões em até 22%.",
    "Sexta-feira à tarde é o pior momento para cold calls.",
    "Personalizar o assunto do e-mail aumenta a abertura em 26%.",
    "O 'timing' é responsável por 40% do sucesso em Vendas B2B.",
    "Apenas 2% das vendas ocorrem no primeiro contato."
];

export function GameWidget() {
    const [isPlaying, setIsPlaying] = useState(false);
    const [score, setScore] = useState(0);
    const [currentFact, setCurrentFact] = useState<string | null>(null);

    const handleScore = (points: number) => {
        setScore(s => s + points);
        
        // Mostrar um fato a cada 50 pontos
        if ((score + points) % 50 === 0) {
            const randomFact = SALES_FACTS[Math.floor(Math.random() * SALES_FACTS.length)];
            setCurrentFact(randomFact);
            setTimeout(() => setCurrentFact(null), 4000);
        }
    };

    return (
        <Card className="w-full h-[500px] bg-slate-900 relative overflow-hidden flex flex-col border border-white/10">
            {/* Overlay 2D (UI) */}
            <div className="absolute top-0 left-0 right-0 p-6 flex items-start justify-between z-10 pointer-events-none">
                <div className="bg-black/50 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 flex items-center gap-3">
                    <Trophy className="w-5 h-5 text-atlas-orange" />
                    <span className="text-white font-bold text-xl">{score}</span>
                </div>

                {!isPlaying && (
                    <button 
                        onClick={() => { setIsPlaying(true); setScore(0); }}
                        className="pointer-events-auto bg-atlas-orange hover:bg-orange-600 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-atlas-orange/20 flex items-center gap-2 transition-all active:scale-95"
                    >
                        {score > 0 ? <RotateCcw className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        {score > 0 ? "Jogar Novamente" : "Iniciar Missão"}
                    </button>
                )}
            </div>

            {/* Fatos de Vendas Animados */}
            <AnimatePresence>
                {currentFact && (
                    <motion.div 
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -50, scale: 0.9 }}
                        className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-3/4 max-w-md"
                    >
                        <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-2xl text-center shadow-2xl">
                            <span className="text-xs font-black uppercase tracking-widest text-atlas-orange mb-2 block">Dica AtlasGR</span>
                            <p className="text-white font-medium">{currentFact}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Cena 3D */}
            <div className="flex-1 w-full h-full absolute inset-0 cursor-crosshair">
                <Canvas shadows camera={{ position: [0, 5, 10], fov: 60 }}>
                    <SpaceGame isPlaying={isPlaying} onScore={handleScore} />
                </Canvas>
            </div>
            
            {!isPlaying && (
                <div className="absolute bottom-6 left-6 z-10 text-white/50 text-xs">
                    Mova o mouse para pilotar a nave.
                </div>
            )}
        </Card>
    );
}
