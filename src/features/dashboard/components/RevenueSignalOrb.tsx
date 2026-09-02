import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import type * as THREE from 'three';
import { Activity, Handshake, Target } from 'lucide-react';
import { useBrandAccent } from '../../../hooks/useBrandAccent';

interface RevenueSignalOrbProps {
  conversionRate: number;
  pendingActivities: number;
  closedThisMonth: number;
}

function SignalScene({
  conversionRate,
  pendingActivities,
  closedThisMonth,
  isAtlas,
  animate,
}: RevenueSignalOrbProps & { isAtlas: boolean; animate: boolean }) {
  const group = useRef<THREE.Group>(null);
  const brand = isAtlas ? '#ff5618' : '#008fce';
  const secondary = isAtlas ? '#ffc500' : '#374898';
  const conversion = Math.max(0, Math.min(conversionRate, 100));
  const pendingIntensity = Math.min(Math.max(pendingActivities, 0), 120) / 120;
  const closedIntensity = Math.min(Math.max(closedThisMonth, 0), 30) / 30;

  useFrame((_state, delta) => {
    if (!animate || !group.current) return;
    group.current.rotation.y += delta * (0.09 + pendingIntensity * 0.08);
    group.current.rotation.x = Math.sin(group.current.rotation.y * 0.65) * 0.08;
  });

  return (
    <group ref={group}>
      <Float speed={animate ? 1.25 : 0} rotationIntensity={0.12} floatIntensity={0.18}>
        <mesh scale={0.76 + conversion / 260}>
          <icosahedronGeometry args={[1, 4]} />
          <meshStandardMaterial
            color={brand}
            emissive={brand}
            emissiveIntensity={0.24}
            metalness={0.55}
            roughness={0.25}
          />
        </mesh>

        <mesh rotation={[Math.PI / 2, 0.15, 0]} scale={1 + pendingIntensity * 0.12}>
          <torusGeometry args={[1.42, 0.035, 12, 96]} />
          <meshStandardMaterial color={secondary} emissive={secondary} emissiveIntensity={0.35} />
        </mesh>

        <mesh rotation={[0.55, 0.4, Math.PI / 3]} scale={0.92 + closedIntensity * 0.16}>
          <torusGeometry args={[1.72, 0.022, 10, 96]} />
          <meshStandardMaterial color="#ffffff" transparent opacity={0.55} />
        </mesh>

        <mesh position={[1.68, 0.18, 0.1]} scale={0.12 + closedIntensity * 0.05}>
          <sphereGeometry args={[1, 24, 24]} />
          <meshStandardMaterial color={secondary} emissive={secondary} emissiveIntensity={0.5} />
        </mesh>
      </Float>
    </group>
  );
}

export function RevenueSignalOrb({
  conversionRate,
  pendingActivities,
  closedThisMonth,
}: RevenueSignalOrbProps) {
  const { isAtlas } = useBrandAccent();
  const reduceMotion = Boolean(useReducedMotion());
  const sectionRef = useRef<HTMLElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(true);
  const [isTabVisible, setIsTabVisible] = useState(
    () => typeof document === 'undefined' || !document.hidden,
  );

  // Pausa o loop de render do Canvas (frameloop 'demand') sempre que o orb sai da viewport ou a
  // aba/app fica em segundo plano — sem isto, o r3f renderiza a 60fps indefinidamente enquanto o
  // componente estiver montado, mesmo rolado para fora de vista ou com o app minimizado no
  // Android (Capacitor). Observer intencionalmente NÃO desconecta após a primeira interseção
  // (diferente de DeferredRevenueSignalOrb, que só adia o carregamento inicial).
  useEffect(() => {
    const node = sectionRef.current;
    if (!node || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => setIsIntersecting(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.05 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => setIsTabVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const shouldAnimate = !reduceMotion && isIntersecting && isTabVisible;

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[20rem] overflow-hidden rounded-[1.6rem] border border-line bg-surface/94 shadow-[0_28px_70px_-42px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.07)]"
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 opacity-60 ${
          isAtlas
            ? 'bg-[radial-gradient(circle_at_50%_42%,rgba(255,86,24,0.18),transparent_48%)]'
            : 'bg-[radial-gradient(circle_at_50%_42%,rgba(0,143,206,0.18),transparent_48%)]'
        }`}
      />

      <div className="absolute inset-x-5 top-5 z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-brand-active dark:text-brand-2">
            Signal Core 3D
          </p>
          <h3 className="mt-1 text-base font-black text-ink">Pressão comercial agora</h3>
          <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-ink-2">
            Volume e movimento respondem às métricas reais abaixo. Os valores escritos continuam
            sendo a fonte exata.
          </p>
        </div>
        <span className="rounded-full border border-line bg-surface-2/80 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-ink-2">
          {shouldAnimate ? 'ao vivo' : 'estático'}
        </span>
      </div>

      <div className="h-[15rem] pt-16" aria-hidden="true">
        <Canvas
          dpr={[1, 1.5]}
          frameloop={shouldAnimate ? 'always' : 'demand'}
          camera={{ position: [0, 0, 5.2], fov: 42 }}
        >
          <ambientLight intensity={0.72} />
          <pointLight
            position={[3, 3, 4]}
            intensity={3.2}
            color={isAtlas ? '#ffb18f' : '#7dd3fc'}
          />
          <pointLight
            position={[-3, -2, 2]}
            intensity={1.8}
            color={isAtlas ? '#ffc500' : '#374898'}
          />
          <SignalScene
            conversionRate={conversionRate}
            pendingActivities={pendingActivities}
            closedThisMonth={closedThisMonth}
            isAtlas={isAtlas}
            animate={shouldAnimate}
          />
        </Canvas>
      </div>

      <div className="relative z-10 grid grid-cols-3 border-t border-line bg-surface/72 backdrop-blur-md">
        <div className="px-3 py-3 text-center">
          <Handshake className="mx-auto mb-1 h-3.5 w-3.5 text-brand" aria-hidden="true" />
          <p className="text-sm font-black text-ink [font-variant-numeric:tabular-nums]">
            {conversionRate.toFixed(1)}%
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-ink-2">Conversão</p>
        </div>
        <div className="border-x border-line px-3 py-3 text-center">
          <Activity className="mx-auto mb-1 h-3.5 w-3.5 text-warning" aria-hidden="true" />
          <p className="text-sm font-black text-ink [font-variant-numeric:tabular-nums]">
            {pendingActivities.toLocaleString('pt-BR')}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-ink-2">Pendentes</p>
        </div>
        <div className="px-3 py-3 text-center">
          <Target className="mx-auto mb-1 h-3.5 w-3.5 text-success" aria-hidden="true" />
          <p className="text-sm font-black text-ink [font-variant-numeric:tabular-nums]">
            {closedThisMonth.toLocaleString('pt-BR')}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-wide text-ink-2">Fechados</p>
        </div>
      </div>
    </section>
  );
}
