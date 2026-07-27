import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Spark {
  id: number;
  x: number;
  y: number;
}

export const ClickSpark: React.FC = () => {
  const [sparks, setSparks] = useState<Spark[]>([]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const newSpark = { id: Date.now(), x: e.clientX, y: e.clientY };
      setSparks((prev) => [...prev, newSpark]);
      
      setTimeout(() => {
        setSparks((prev) => prev.filter((s) => s.id !== newSpark.id));
      }, 1000);
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      <AnimatePresence>
        {sparks.map((spark) => (
          <React.Fragment key={spark.id}>
            {/* Core burst */}
            <motion.div
              initial={{ opacity: 1, scale: 0 }}
              animate={{ opacity: 0, scale: 2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="absolute h-12 w-12 rounded-full border border-sky-400 bg-sky-400/20 shadow-[0_0_20px_rgba(56,189,248,0.5)]"
              style={{ left: spark.x - 24, top: spark.y - 24 }}
            />
            {/* Ring expansion */}
            <motion.div
              initial={{ opacity: 0.8, scale: 0, borderWidth: '4px' }}
              animate={{ opacity: 0, scale: 4, borderWidth: '0px' }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="absolute h-16 w-16 rounded-full border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]"
              style={{ left: spark.x - 32, top: spark.y - 32 }}
            />
          </React.Fragment>
        ))}
      </AnimatePresence>
    </div>
  );
};
