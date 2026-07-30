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

      {/* Background Ambience - Split Gradients */}
      <div className="absolute inset-0 flex pointer-events-none z-0">
        <div className="w-1/2 h-full bg-gradient-to-r from-atlas-orange/30 via-atlas-orange/10 to-transparent blur-[120px]"></div>
        <div className="w-1/2 h-full bg-gradient-to-l from-blue-500/30 via-blue-900/10 to-transparent blur-[120px]"></div>
      </div>
      
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
            <div className="w-48 h-20 mb-4 flex items-center justify-center">
              <img src="https://www.atlasgr.com.br/wp-content/uploads/2021/03/atlas.svg" alt="AtlasGR" className="w-full h-full object-contain" />
            </div>
            <span className="font-black text-xl tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 hidden">
              AtlasGR
            </span>
          </div>

          <div className="h-12 w-px bg-white/20 mx-4"></div>

          <div className="flex flex-col items-center">
            <div className="w-48 h-20 mb-4 flex items-center justify-center">
              <img src="/totaltrack-logo.png" alt="Total Track" className="w-full h-full object-contain" />
            </div>
            <span className="font-black text-xl tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 hidden">
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
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight tracking-tight relative z-10">
            A sua nova <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-atlas-orange to-amber-400">
              inteligência comercial
            </span>.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-gray-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Onde dados se transformam em receita e os melhores leads B2B qualificados encontram o seu negócio de forma automatizada.
          </p>
          <motion.div 
            animate={{ 
              scale: [1, 1.05, 1],
              boxShadow: [
                "0px 0px 15px rgba(255,86,24,0.6)",
                "0px 0px 25px rgba(0,136,204,0.8)",
                "0px 0px 15px rgba(255,86,24,0.6)"
              ]
            }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="mt-10 mx-auto max-w-fit px-6 py-3 rounded-2xl bg-gradient-to-r from-atlas-orange/20 to-blue-500/20 border border-white/30 backdrop-blur-xl"
          >
            <p className="text-sm md:text-base font-black uppercase tracking-[0.2em] animate-pulse">
              <span className="text-white">🚀 Criado pelo coordenador comercial</span>
              <br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-atlas-yellow via-atlas-orange to-red-500 text-lg md:text-xl drop-shadow-[0_0_10px_rgba(255,86,24,0.8)]">
                ⭐ MARCELO DO NASCIMENTO ⭐
              </span>
            </p>
          </motion.div>
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

      {/* Footer Socials & Contacts */}
      <div className="absolute bottom-6 w-full px-8 flex justify-between items-center z-50 text-gray-400 text-sm">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6">
          <a href="https://api.whatsapp.com/send?phone=5516981818458" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
            <i className="fab fa-whatsapp text-lg"></i> <span> Suporte: (16) 98181-8458</span>
          </a>
          <a href="tel:1621323790" className="flex items-center gap-2 hover:text-white transition-colors">
            <i className="fas fa-phone-alt text-lg"></i> <span>Comercial: (16) 2132-3790</span>
          </a>
        </div>
        <ul className="flex gap-4">
          <li>
            <a href="https://www.facebook.com/atlasgroficial" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              <i className="fab fa-facebook-f text-lg" aria-hidden="true"></i>
            </a>
          </li>
          <li>
            <a href="https://www.instagram.com/atlasgroficial/" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              <i className="fab fa-instagram text-lg" aria-hidden="true"></i>
            </a>
          </li>
          <li>
            <a href="https://www.linkedin.com/company/atlasgroficial" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              <i className="fab fa-linkedin-in text-lg" aria-hidden="true"></i>
            </a>
          </li>
          <li>
            <a href="https://www.youtube.com/@atlasgroficial" target="_blank" rel="noreferrer" className="hover:text-white transition-colors">
              <i className="fab fa-youtube text-lg" aria-hidden="true"></i>
            </a>
          </li>
        </ul>
      </div>

    </div>
  );
}
