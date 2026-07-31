import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export function SelectionScreen() {

  const handleSelect = (brand: 'atlasgr' | 'totaltrac') => {
    localStorage.setItem('selectedBrand', brand);
    window.location.href = '/app';
  };

  return (
    <div className="min-h-screen bg-[#030305] text-white flex flex-col items-center justify-center relative overflow-hidden font-sans p-6">
      
      {/* Background Ambience */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 45, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-atlas-orange/5 via-transparent to-indigo-500/5 pointer-events-none"
      />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-atlas-orange/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-5xl relative z-10 flex flex-col items-center">
        
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
            <Sparkles className="w-4 h-4 text-atlas-orange" />
            <span className="text-xs font-semibold tracking-widest text-gray-300 uppercase">Selecione o seu ambiente</span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-white mb-4">
            Qual plataforma você deseja acessar?
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto">
            Escolha abaixo qual sistema operacional comercial irá impulsionar as suas vendas hoje.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          
          {/* AtlasGR Card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            whileHover={{ scale: 1.03, y: -10 }}
            className="group relative cursor-pointer"
            onClick={() => handleSelect('atlasgr')}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-atlas-orange to-amber-500 rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500"></div>
            <div className="relative h-full glass-panel p-10 rounded-[2.5rem] border border-white/10 bg-slate-900/60 backdrop-blur-xl flex flex-col items-center text-center overflow-hidden transition-all duration-500 group-hover:border-atlas-orange/50 group-hover:bg-slate-900/80">
              
              <div className="w-48 h-24 mb-6 flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                <img src="/atlas-logo.svg" alt="AtlasGR" className="w-full h-full object-contain drop-shadow-2xl" />
              </div>

              <p className="text-sm text-gray-400 mb-8 leading-relaxed max-w-[250px] flex-grow">
                Acelere a aquisição de clientes B2B com enriquecimento em tempo real e inteligência artificial avançada.
              </p>

              <div className="mt-auto px-6 py-3 rounded-full bg-white/5 border border-white/10 text-sm font-semibold text-white group-hover:bg-atlas-orange group-hover:border-atlas-orange transition-all duration-300">
                Acessar AtlasGR
              </div>
            </div>
          </motion.div>

          {/* Total Track Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            whileHover={{ scale: 1.03, y: -10 }}
            className="group relative cursor-pointer"
            onClick={() => handleSelect('totaltrac')}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500"></div>
            <div className="relative h-full glass-panel p-10 rounded-[2.5rem] border border-white/10 bg-slate-900/60 backdrop-blur-xl flex flex-col items-center text-center overflow-hidden transition-all duration-500 group-hover:border-blue-500/50 group-hover:bg-slate-900/80">
              
              <div className="w-48 h-24 mb-6 flex items-center justify-center transform group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500">
                <img src="/totaltrack-logo.png" alt="Total Track" className="w-full h-full object-contain drop-shadow-2xl" />
              </div>

              <p className="text-sm text-gray-400 mb-8 leading-relaxed max-w-[250px] flex-grow">
                Gestão completa de frotas e ativos com precisão. O ecossistema logístico otimizado.
              </p>

              <div className="mt-auto px-6 py-3 rounded-full bg-white/5 border border-white/10 text-sm font-semibold text-white group-hover:bg-blue-500 group-hover:border-blue-500 transition-all duration-300">
                Acessar Total Track
              </div>
            </div>
          </motion.div>

        </div>
      </div>


      {/* Signature */}
      <div className="relative w-full text-center z-20 pointer-events-none flex justify-center mt-12 pb-6">
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
          className="px-6 py-3 rounded-2xl bg-gradient-to-r from-atlas-orange/20 to-blue-500/20 border border-white/30 backdrop-blur-xl"
        >
          <p className="text-xs md:text-sm font-black uppercase tracking-[0.2em] animate-pulse">
            <span className="text-white">🚀 Criado pelo coordenador comercial</span>
            <br/>
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-atlas-yellow via-atlas-orange to-red-500 text-base md:text-lg drop-shadow-[0_0_10px_rgba(255,86,24,0.8)]">
              ⭐ MARCELO DO NASCIMENTO ⭐
            </span>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
