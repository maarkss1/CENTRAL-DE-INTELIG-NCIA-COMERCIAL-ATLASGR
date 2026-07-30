import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Globe, Target, Volume2, VolumeX, ArrowRight, Sparkles } from 'lucide-react';

export function WelcomeScreen() {
  const navigate = useNavigate();
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && !isMuted) {
      audioRef.current.play().catch(() => {
        // Autoplay policy prevented it, we just swallow the error
        console.log('Autoplay blocked');
      });
    } else if (audioRef.current && isMuted) {
      audioRef.current.pause();
    }
  }, [isMuted]);

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  return (
    <div className="min-h-screen bg-[#030305] text-white flex flex-col items-center justify-center relative overflow-hidden font-sans">
      {/* Background Music */}
      <audio 
        ref={audioRef}
        loop 
        src="https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-and-strings-10711.mp3" 
      />

      {/* Animated Background Elements */}
      <motion.div
        animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-atlas-orange/15 rounded-full blur-[150px] pointer-events-none"
      />
      <motion.div
        animate={{ scale: [1, 1.3, 1], rotate: [0, -90, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        className="absolute bottom-[-20%] right-[-10%] w-[700px] h-[700px] bg-indigo-500/10 rounded-full blur-[150px] pointer-events-none"
      />
      
      {/* Sound Toggle */}
      <button 
        onClick={toggleMute}
        className="absolute top-6 right-6 z-50 p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors backdrop-blur-md"
      >
        {isMuted ? <VolumeX size={20} className="text-gray-400" /> : <Volume2 size={20} className="text-atlas-orange" />}
      </button>

      <div className="w-full max-w-4xl px-6 relative z-10 flex flex-col items-center text-center">
        
        {/* Logos Container */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="flex items-center gap-6 mb-12"
        >
          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-gradient-to-br from-atlas-orange via-amber-500 to-indigo-600 rounded-[2rem] flex items-center justify-center shadow-xl shadow-atlas-orange/20 mb-3 border border-white/10 backdrop-blur-xl">
              <Globe className="w-10 h-10 text-white" />
            </div>
            <span className="font-black text-xl tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              AtlasGR
            </span>
          </div>

          <div className="h-12 w-px bg-white/20 mx-4"></div>

          <div className="flex flex-col items-center">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-sky-400 rounded-[2rem] flex items-center justify-center shadow-xl shadow-blue-500/20 mb-3 border border-white/10 backdrop-blur-xl">
              <Target className="w-10 h-10 text-white" />
            </div>
            <span className="font-black text-xl tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
              Total Track
            </span>
          </div>
        </motion.div>

        {/* Impactful Message */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mb-14 relative"
        >
          <div className="absolute -inset-1 bg-gradient-to-r from-atlas-orange via-indigo-500 to-blue-500 rounded-3xl blur-2xl opacity-20"></div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight relative z-10">
            A sua mais nova <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-atlas-orange to-amber-400">
              inteligência artificial
            </span>.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Onde dados se transformam em receita e os melhores leads B2B qualificados encontram o seu negócio de forma automatizada.
          </p>
        </motion.div>

        {/* Start Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <button
            onClick={() => {
              if (audioRef.current) audioRef.current.play().catch(() => {});
              navigate('/select-brand');
            }}
            className="group relative inline-flex items-center justify-center gap-3 px-10 py-5 bg-white text-slate-900 rounded-full font-black text-lg overflow-hidden transition-transform hover:scale-105 active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-atlas-orange via-amber-400 to-atlas-orange opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            <span className="relative z-10 group-hover:text-white transition-colors duration-300 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Clique em Iniciar
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
        </motion.div>

      </div>
    </div>
  );
}
