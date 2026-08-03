import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center justify-center p-12 text-center glass-card rounded-3xl border border-line my-6 bg-surface backdrop-blur-xl"
    >
      <div className="w-16 h-16 rounded-2xl bg-atlas-orange/10 flex items-center justify-center text-atlas-orange mb-4 shadow-lg shadow-atlas-orange/10 border border-atlas-orange/20">
        {icon || <Sparkles className="w-8 h-8 animate-pulse text-atlas-orange" />}
      </div>
      <h3 className="text-xl font-bold text-ink mb-2">{title}</h3>
      <p className="text-ink-2 max-w-md mb-6 text-sm leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="default" className="shadow-lg shadow-atlas-orange/20 cursor-pointer">
          {actionLabel}
        </Button>
      )}
    </motion.div>
  );
}
