import { useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Text, Float } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import * as THREE from 'three';

// Dicas de ouro voltadas para o cenário B2B (Logística e Risco)
const GOLDEN_TIPS = [
  "Use o método SPIN: Foque nas implicações financeiras de não ter telemetria avançada na frota.",
  "Dica SNAP: O decisor está ocupado. Seja simples, inestimável, alinhado e priorize o que é urgente.",
  "Challenger Sale: Não pergunte apenas qual é o problema. Mostre um problema logístico que ele nem sabia que tinha.",
  "Gerenciamento de Risco: Mostre como a apólice de seguro cai quando a transportadora usa tecnologias homologadas.",
  "Cold Call B2B: Nunca pergunte 'estou ligando em boa hora?'. Assuma o controle e entregue valor em 30 segundos.",
  "Gatilho de Prova Social: Cite concorrentes diretos ou empresas da mesma região que já reduziram sinistros com a Atlas.",
  "Follow-up: A maioria das vendas corporativas ocorre entre o 5º e 12º contato. Não desista no primeiro 'não'.",
  "O C-Level não compra 'tecnologia'. Ele compra 'redução de custos', 'lucro' e 'mitigação de riscos'. Fale a língua dele."
];

// O Objeto 3D interativo (Cubo / Caixa de Carga)
function CargoBox({ onClick }: { onClick: () => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.2;
      meshRef.current.rotation.y += delta * 0.5;

      if (clicked) {
        meshRef.current.scale.lerp(new THREE.Vector3(1.5, 1.5, 1.5), 0.1);
      } else if (hovered) {
        meshRef.current.scale.lerp(new THREE.Vector3(1.2, 1.2, 1.2), 0.1);
      } else {
        meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
      }
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleClick = (e: any) => {
    e.stopPropagation();
    setClicked(true);
    onClick();
    setTimeout(() => setClicked(false), 300);
  };

  return (
    <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
      <mesh
        ref={meshRef}
        onClick={handleClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial
          color={hovered ? '#FF8008' : '#FF5618'}
          wireframe={!hovered}
          emissive={hovered ? '#FF5618' : '#000000'}
          emissiveIntensity={hovered ? 0.5 : 0}
        />
        {hovered && (
          <Text
            position={[0, 0, 1.1]}
            fontSize={0.3}
            color="white"
            anchorX="center"
            anchorY="middle"
          >
            Clique p/ Desbloquear
          </Text>
        )}
      </mesh>
    </Float>
  );
}

export function Atlas3DGame() {
  const [tip, setTip] = useState<string | null>(null);

  const handleBoxClick = () => {
    const randomTip = GOLDEN_TIPS[Math.floor(Math.random() * GOLDEN_TIPS.length)];
    setTip(randomTip);
  };

  return (
    <div className="relative w-full h-[500px] rounded-[3rem] overflow-hidden bg-gradient-to-br from-[#030305] to-[#111118] border border-white/10 shadow-2xl">
      {/* HUD 2D Overlay */}
      <div className="absolute top-6 left-6 z-10">
        <h2 className="text-white font-black text-xl flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-atlas-yellow" />
          Atlas Cargo Puzzle 3D
        </h2>
        <p className="text-gray-400 text-xs font-semibold mt-1 max-w-xs">
          Interaja com a carga hiperdimensional para desbloquear dicas avançadas de vendas B2B.
        </p>
      </div>

      {/* Canvas 3D (React Three Fiber) */}
      <Canvas camera={{ position: [0, 0, 6], fov: 50 }} className="cursor-crosshair">
        <ambientLight intensity={0.5} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
        <pointLight position={[-10, -10, -10]} intensity={0.5} />
        
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <CargoBox onClick={handleBoxClick} />
        
        <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={1} />
      </Canvas>

      {/* Modal/Overlay da Dica de Ouro (Framer Motion) */}
      <AnimatePresence>
        {tip && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-md z-20"
          >
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-6 rounded-3xl shadow-[0_20px_50px_rgba(255,86,24,0.3)] relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-atlas-orange/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <button 
                onClick={() => setTip(null)}
                className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-atlas-orange/20 flex items-center justify-center border border-atlas-orange/50">
                  <span className="text-atlas-orange font-black">!</span>
                </div>
                <h3 className="text-white font-bold text-sm tracking-widest uppercase">Dica de Ouro Desbloqueada</h3>
              </div>
              
              <p className="text-gray-200 text-sm font-medium leading-relaxed">
                {tip}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
