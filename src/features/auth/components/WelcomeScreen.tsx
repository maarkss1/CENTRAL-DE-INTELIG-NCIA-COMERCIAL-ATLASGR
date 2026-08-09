import { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, MessageCircle, Phone, Volume2, VolumeX } from 'lucide-react';
import { clientLogger } from '../../../lib/clientLogger';
import { Logo } from '../../../components/Logo';
import { TotalTrackLogo } from '../../../components/TotalTrackLogo';
import { useTheme } from '../../../contexts/ThemeContext';
import { staggerContainer, staggerItem } from '../../../lib/motion';

// Marcas de redes sociais não existem no lucide-react (biblioteca de ícones genéricos do
// projeto) — seguindo a mesma convenção de Logo.tsx/TotalTrackLogo.tsx, ícones de marca de
// terceiros vivem como SVG inline em vez de puxar uma segunda lib de ícones para 4 glifos.
function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M15 21v-7.5h2.5l.4-3H15V8.6c0-.87.24-1.46 1.49-1.46H18V4.4A20.6 20.6 0 0 0 15.98 4.3c-2.19 0-3.68 1.34-3.68 3.79v2.42H9.8v3h2.5V21Z" />
    </svg>
  );
}

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function LinkedinGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8" cy="8.7" r="1.15" />
      <rect x="7.1" y="10.8" width="1.8" height="6.5" />
      <path d="M11.4 10.8h1.75v1.05c.5-.78 1.35-1.25 2.35-1.25 1.9 0 2.9 1.28 2.9 3.42v3.68h-1.8v-3.28c0-1.1-.4-1.83-1.4-1.83-1 0-1.6.72-1.6 1.83v3.28h-1.8Z" />
    </svg>
  );
}

function YoutubeGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="6" width="18" height="12" rx="4" />
      <path d="M10.3 9.4v5.2l4.7-2.6Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

const SOCIAL_LINKS = [
  { href: 'https://www.facebook.com/atlasgroficial', label: 'Facebook', Icon: FacebookGlyph },
  { href: 'https://www.instagram.com/atlasgroficial/', label: 'Instagram', Icon: InstagramGlyph },
  { href: 'https://www.linkedin.com/company/atlasgroficial', label: 'LinkedIn', Icon: LinkedinGlyph },
  { href: 'https://www.youtube.com/@atlasgroficial', label: 'YouTube', Icon: YoutubeGlyph },
] as const;

export function WelcomeScreen() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [isMuted, setIsMuted] = useState(true);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current && !isMuted) {
      audioRef.current.play().catch(() => {
        // Autoplay bloqueado pelo navegador — apenas registramos, sem interromper a UI.
        clientLogger.info('Autoplay blocked');
      });
    } else if (audioRef.current && isMuted) {
      audioRef.current.pause();
    }
  }, [isMuted]);

  const toggleMute = () => setIsMuted((prev) => !prev);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-bg font-sans text-ink transition-colors">
      <audio
        ref={audioRef}
        loop
        src="https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=ambient-piano-and-strings-10711.mp3"
      />

      {/* Ambiente de fundo — um glow por marca, sutil e com rotação lenta (mesmo padrão já usado
          em LoginScreen), não duas faixas largas de gradiente competindo pela atenção. Tamanho
          reduzido em telas estreitas: em ~390px de largura um blob de 420px tingia a tela toda e
          derrubava o contraste do texto por baixo dele (achado real do axe-core em mobile). */}
      <motion.div
        aria-hidden="true"
        animate={{ rotate: [0, 90, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
        className="pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full bg-atlas-orange/6 blur-[90px] sm:-left-32 sm:-top-32 sm:h-[420px] sm:w-[420px] sm:blur-[110px]"
      />
      <motion.div
        aria-hidden="true"
        animate={{ rotate: [0, -90, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
        className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-totaltrack-blue/6 blur-[90px] sm:-bottom-32 sm:-right-32 sm:h-[420px] sm:w-[420px] sm:blur-[110px]"
      />

      <button
        type="button"
        onClick={toggleMute}
        className="absolute right-6 top-6 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-line bg-ink/5 text-ink-2 backdrop-blur-md transition-colors hover:bg-ink/10 hover:text-ink"
        aria-label={isMuted ? 'Ativar som ambiente' : 'Silenciar som ambiente'}
        aria-pressed={!isMuted}
      >
        {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
      </button>

      <motion.div
        variants={staggerContainer(0.12)}
        initial="hidden"
        animate="show"
        className="relative z-10 flex w-full max-w-3xl flex-col items-center px-6 text-center"
      >
        <motion.p variants={staggerItem} className="mb-8 text-xs font-bold uppercase tracking-[0.3em] text-ink-2">
          AtlasGR <span className="text-ink-2/40">•</span> Total Trac
        </motion.p>

        <motion.div variants={staggerItem} className="mb-10 flex items-center gap-6">
          <div className="flex h-16 w-40 items-center justify-center">
            <Logo variant={theme === 'dark' ? 'white' : 'default'} className="h-full w-full" />
          </div>
          <div className="h-10 w-px bg-line" />
          <div className="flex h-16 w-40 items-center justify-center">
            <TotalTrackLogo className="h-full w-full" />
          </div>
        </motion.div>

        <motion.h1 variants={staggerItem} className="max-w-2xl text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">
          A sua nova inteligência comercial.
        </motion.h1>
        <motion.p variants={staggerItem} className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-2 md:text-lg">
          Onde dados se transformam em receita e os leads B2B mais qualificados encontram o seu negócio de forma automatizada.
        </motion.p>

        <motion.div variants={staggerItem} className="mt-10">
          <button
            type="button"
            onClick={() => {
              if (audioRef.current) audioRef.current.play().catch(() => {});
              navigate('/select-brand');
            }}
            className="group inline-flex items-center gap-2.5 rounded-full bg-ink px-8 py-4 text-sm font-bold text-bg transition-transform hover:scale-[1.03] active:scale-95"
          >
            Continuar
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </button>
        </motion.div>

        <motion.p variants={staggerItem} className="mt-14 text-xs font-medium tracking-wide text-ink-2">
          Desenvolvido pelo Coordenador Comercial Marcelo do Nascimento
        </motion.p>
      </motion.div>

      <div className="absolute bottom-6 z-10 flex w-full flex-col items-center gap-4 px-8 text-sm text-ink-2 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <a
            href="https://api.whatsapp.com/send?phone=5516981818458"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 transition-colors hover:text-ink"
          >
            <MessageCircle size={16} aria-hidden="true" />
            <span>Suporte: (16) 98181-8458</span>
          </a>
          <a href="tel:1621323790" className="flex items-center gap-2 transition-colors hover:text-ink">
            <Phone size={16} aria-hidden="true" />
            <span>Comercial: (16) 2132-3790</span>
          </a>
        </div>
        <ul className="flex gap-4">
          {SOCIAL_LINKS.map(({ href, label, Icon }) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noreferrer" aria-label={label} className="block transition-colors hover:text-ink">
                <Icon className="h-[18px] w-[18px]" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
