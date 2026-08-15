import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Float, Sparkles, Sphere, MeshDistortMaterial } from '@react-three/drei';
import { useReducedMotion } from 'framer-motion';
import { useBrandAccent } from '../../hooks/useBrandAccent';


function OrbCore() {
  const { isAtlas } = useBrandAccent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const materialRef = useRef<any>(null);
  // O @media (prefers-reduced-motion) global de globals.css só zera animation/transition CSS —
  // não alcança o loop de render do react-three-fiber (useFrame), que é como Float/Sparkles/
  // MeshDistortMaterial animam. Achado nesta rodada (Onda 8): a esfera girava/distorcia
  // continuamente mesmo com a preferência do SO ativa. Zerando as amplitudes de movimento em vez
  // de desmontar o Canvas — mantém a peça visível e só remove o movimento contínuo não-essencial.
  const reduceMotion = useReducedMotion();

  const color = isAtlas ? '#FF5618' : '#008FCE';
  const emissive = isAtlas ? '#ff8c61' : '#93DBF2';

  return (
    <Float speed={reduceMotion ? 0 : 2} rotationIntensity={reduceMotion ? 0 : 1.5} floatIntensity={reduceMotion ? 0 : 2}>
      <Sphere args={[1, 64, 64]} scale={1.2}>
        <MeshDistortMaterial
          ref={materialRef}
          color={color}
          emissive={emissive}
          emissiveIntensity={1}
          clearcoat={1}
          clearcoatRoughness={0.1}
          metalness={0.8}
          roughness={0.2}
          distort={reduceMotion ? 0 : 0.3}
          speed={reduceMotion ? 0 : 3}
        />
      </Sphere>
      <Sparkles
        count={50}
        scale={3}
        size={4}
        speed={reduceMotion ? 0 : 0.4}
        opacity={0.8}
        color={isAtlas ? '#FFB085' : '#93DBF2'}
      />
    </Float>
  );
}

export function AtlasOrb({ size = 150 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size }}>
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1.5} />
        <OrbCore />
      </Canvas>
    </div>
  );
}
