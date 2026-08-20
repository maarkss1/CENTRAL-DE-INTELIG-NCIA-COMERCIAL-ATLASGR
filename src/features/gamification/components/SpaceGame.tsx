import { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Stars, Float, Text } from '@react-three/drei';
import * as THREE from 'three';

// Constantes do Jogo
const BOUNDS = 10;
const SPEED = 0.2;

function Player({ position, onCollect: _onCollect }: { position: [number, number, number], onCollect: () => void }) {
  const ref = useRef<THREE.Mesh>(null);
  
  // Movimento Básico (Mover a nave/cubo com WASD ou Setas)
  useFrame((state, _delta) => {
    if (!ref.current) return;
    
    // Simplificando o controle de input (em um cenário real, usaríamos um hook para teclas)
    // Velocidade era usada para controles manuais
    
    // Atualizaríamos a posição baseada nas teclas...
    // Para simplificar, a nave segue o mouse:
    const { x, y } = state.mouse;
    ref.current.position.x = THREE.MathUtils.lerp(ref.current.position.x, (x * BOUNDS) / 2, 0.1);
    ref.current.position.y = THREE.MathUtils.lerp(ref.current.position.y, (y * BOUNDS) / 2, 0.1);
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={ref} position={position} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#3b82f6" emissive="#1d4ed8" emissiveIntensity={0.5} />
      </mesh>
    </Float>
  );
}

function Lead({ position, onHit }: { position: [number, number, number], onHit: (id: string) => void }) {
    const ref = useRef<THREE.Mesh>(null);
    const id = useMemo(() => Number(`0.${crypto.getRandomValues(new Uint32Array(1))[0]}`).toString(), []);

    useFrame((state, delta) => {
        if (!ref.current) return;
        // Move o lead na direção Z em direção ao jogador
        ref.current.position.z += SPEED * 20 * delta;

        // Se passar da câmera, reseta a posição
        if (ref.current.position.z > 5) {
            onHit(id); // Passou direto, falhou em pegar ou pegou
        }
    });

    return (
        <mesh ref={ref} position={position}>
            <sphereGeometry args={[0.4, 16, 16]} />
            <meshStandardMaterial color="#f97316" emissive="#ea580c" emissiveIntensity={0.8} wireframe />
        </mesh>
    );
}

export function SpaceGame({ onScore, isPlaying }: { onScore: (points: number) => void, isPlaying: boolean }) {
  const [leads, setLeads] = useState<{ id: string, pos: [number, number, number] }[]>([]);

  // Lógica de spawn simplificada
  useFrame((_state) => {
    if (!isPlaying) return;
    
    // Spawnar novos leads aleatoriamente
    if (Number(`0.${crypto.getRandomValues(new Uint32Array(1))[0]}`) < 0.02 && leads.length < 5) {
        setLeads(prev => [
            ...prev,
            {
                id: Number(`0.${crypto.getRandomValues(new Uint32Array(1))[0]}`).toString(),
                pos: [(Number(`0.${crypto.getRandomValues(new Uint32Array(1))[0]}`) - 0.5) * BOUNDS, (Number(`0.${crypto.getRandomValues(new Uint32Array(1))[0]}`) - 0.5) * BOUNDS, -20]
            }
        ]);
    }
  });

  const handleHit = (id: string) => {
      setLeads(prev => prev.filter(l => l.id !== id));
      // Aqui faríamos a checagem de colisão real (bounding box). 
      // Por simplicidade, vamos dar ponto se passou por nós (simulando que pegamos).
      onScore(10); 
  };

  return (
    <>
      <color attach="background" args={['#000005']} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      {isPlaying && <Player position={[0, 0, 0]} onCollect={() => {}} />}
      
      {isPlaying && leads.map(lead => (
          <Lead key={lead.id} position={lead.pos} onHit={handleHit} />
      ))}
      
      {!isPlaying && (
          <Float floatIntensity={2} speed={3}>
              <Text position={[0, 1, 0]} fontSize={1} color="#f97316">
                  PROSPECTOR
              </Text>
              <Text position={[0, -0.5, 0]} fontSize={0.5} color="#3b82f6">
                  SPACE
              </Text>
          </Float>
      )}
    </>
  );
}
