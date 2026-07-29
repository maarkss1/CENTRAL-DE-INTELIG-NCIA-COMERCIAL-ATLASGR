import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Sparkles, Sphere, MeshDistortMaterial } from '@react-three/drei';
import { useBrandAccent } from '../../hooks/useBrandAccent';
import * as THREE from 'three';

function OrbCore() {
  const { isAtlas } = useBrandAccent();
  const materialRef = useRef<any>(null);

  const color = isAtlas ? '#FF5618' : '#0088CC';
  const emissive = isAtlas ? '#ff8c61' : '#4dc4ff';

  return (
    <Float speed={2} rotationIntensity={1.5} floatIntensity={2}>
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
          distort={0.3}
          speed={3}
        />
      </Sphere>
      <Sparkles
        count={50}
        scale={3}
        size={4}
        speed={0.4}
        opacity={0.8}
        color={isAtlas ? '#FFB085' : '#85D6FF'}
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
