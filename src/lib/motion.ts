import { useRef } from 'react';
import {
  useMotionValue,
  useSpring,
  useTransform,
  useReducedMotion,
  type Variants,
} from 'motion/react';

export const EASE_PREMIUM = [0.22, 1, 0.36, 1] as const;
export const EASE_SPRING_SOFT = [0.34, 1.56, 0.64, 1] as const;

export const SPRING_SNAPPY = { type: 'spring', stiffness: 420, damping: 32, mass: 0.7 } as const;
export const SPRING_SOFT = { type: 'spring', stiffness: 260, damping: 24, mass: 0.9 } as const;

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35, ease: EASE_PREMIUM } },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(6px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.45, ease: EASE_PREMIUM },
  },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: SPRING_SOFT },
};

export const staggerContainer = (stagger = 0.06, delayChildren = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(4px)' },
  show: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.4, ease: EASE_PREMIUM },
  },
};

export const pageTransition: Variants = {
  initial: { opacity: 0, y: 18, scale: 0.99, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: { duration: 0.4, ease: EASE_PREMIUM },
  },
  exit: {
    opacity: 0,
    y: -12,
    scale: 0.99,
    filter: 'blur(6px)',
    transition: { duration: 0.25, ease: EASE_PREMIUM },
  },
};

/**
 * Inclinação 3D sutil (Spatial UI) que segue o cursor sobre o elemento.
 * Desativada automaticamente quando o usuário prefere menos movimento.
 */
export function useTilt(intensity = 10) {
  const ref = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), SPRING_SOFT);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), SPRING_SOFT);

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  };

  const onPointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  return {
    ref,
    style: reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 800 },
    onPointerMove,
    onPointerLeave,
  };
}

/**
 * Botão magnético: puxa levemente o conteúdo em direção ao cursor no hover.
 */
export function useMagnetic(strength = 0.35) {
  const ref = useRef<HTMLElement | null>(null);
  const reduceMotion = useReducedMotion();

  const x = useSpring(0, SPRING_SNAPPY);
  const y = useSpring(0, SPRING_SNAPPY);

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (reduceMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) * strength);
    y.set((event.clientY - rect.top - rect.height / 2) * strength);
  };

  const onPointerLeave = () => {
    x.set(0);
    y.set(0);
  };

  return { ref, style: { x, y }, onPointerMove, onPointerLeave };
}
