import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { useTheme } from '../../../contexts/ThemeContext';

export function SelectionScreen() {
  const { theme } = useTheme();
  const handleSelect = (brand: 'atlasgr' | 'totaltrac') => {
    localStorage.setItem('selectedBrand', brand);
    window.location.href = '/app';
  };

  return (
    <main className="min-h-screen bg-bg text-ink flex flex-col items-center justify-center relative overflow-hidden font-sans p-6 transition-colors">
      {/* Background Ambience */}
      <motion.div
        animate={{ scale: [1, 1.1, 1], rotate: [0, 45, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-atlas-orange/5 via-transparent to-totaltrac-navy/5 pointer-events-none"
      />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-atlas-orange/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-totaltrack-blue/20 rounded-full blur-[120px] pointer-events-none"></div>

      <div className="w-full max-w-5xl relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-ink/5 border border-ink/10 mb-6">
            <Sparkles className="w-4 h-4 text-atlas-orange" />
            <span className="text-xs font-semibold tracking-widest text-ink-2 uppercase">
              Selecione o seu ambiente
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tight text-ink mb-4">
            Qual plataforma você deseja acessar?
          </h1>
          <p className="text-ink-2 max-w-xl mx-auto">
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
            <div className="relative h-full glass-panel p-10 rounded-[2.5rem] flex flex-col items-center text-center overflow-hidden transition-all duration-500 group-hover:border-atlas-orange/50">
              <div className="w-48 h-24 mb-6 flex items-center justify-center transform group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                <Logo
                  variant={theme === 'dark' ? 'white' : 'default'}
                  className="w-full h-full drop-shadow-2xl"
                />
              </div>

              <p className="text-sm text-ink-2 mb-8 leading-relaxed max-w-[250px] flex-grow">
                Acelere a aquisição de clientes B2B com enriquecimento em tempo real e inteligência
                artificial avançada.
              </p>

              <div className="mt-auto px-6 py-3 rounded-full bg-ink/5 border border-ink/10 text-sm font-semibold text-ink group-hover:bg-atlas-orange group-hover:border-atlas-orange group-hover:text-white transition-all duration-300">
                Acessar AtlasGR
              </div>
            </div>
          </motion.div>

          {/* Total Trac Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            whileHover={{ scale: 1.03, y: -10 }}
            className="group relative cursor-pointer"
            onClick={() => handleSelect('totaltrac')}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-totaltrac-navy to-totaltrack-blue rounded-[2.5rem] blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500"></div>
            <div className="relative h-full glass-panel p-10 rounded-[2.5rem] flex flex-col items-center text-center overflow-hidden transition-all duration-500 group-hover:border-totaltrack-blue/50">
              <div className="w-48 h-24 mb-6 flex items-center justify-center transform group-hover:scale-110 group-hover:-rotate-6 transition-all duration-500">
                <TotalTrackLogo className="w-full h-full drop-shadow-2xl" />
              </div>

              <p className="text-sm text-ink-2 mb-8 leading-relaxed max-w-[250px] flex-grow">
                Gestão completa de frotas e ativos com precisão. O ecossistema logístico otimizado.
              </p>

              <div className="mt-auto px-6 py-3 rounded-full bg-ink/5 border border-ink/10 text-sm font-semibold text-ink group-hover:bg-totaltrack-blue group-hover:border-totaltrack-blue group-hover:text-white transition-all duration-300">
                Acessar Total Trac
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Assinatura — sem animação em loop (Constituição §6: pulso duplo + glow animado não
          comunicavam estado nenhum) e sem peso visual maior que os CTAs acima, mesmo tratamento
          já usado em WelcomeScreen.tsx (Piloto 001) pra manter as duas telas de pré-seleção
          consistentes. */}
      <p className="relative z-20 mt-12 pb-6 text-center text-xs font-medium tracking-wide text-ink-2">
        🚀 Criado pelo coordenador comercial Marcelo do Nascimento
      </p>
    </main>
  );
}
