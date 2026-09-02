import { Card } from '../../../components/ui/Card';
import { SoundFX } from '../../../lib/soundEffects';
import { MetricInfo } from './MetricInfo';

interface KpiTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'critical' | 'neutral';
  metricKey?: string;
  onClick?: () => void;
}

export function KpiTile({
  label,
  value,
  hint,
  tone = 'neutral',
  metricKey,
  onClick,
}: KpiTileProps) {
  const toneClass =
    tone === 'good'
      ? 'text-success-active dark:text-success'
      : tone === 'critical'
        ? 'text-critical'
        : 'text-ink';

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-ink-2">{label}</p>
        {metricKey && <MetricInfo metricKey={metricKey} />}
      </div>
      <p
        className={`mt-1.5 text-2xl font-black tracking-tight [font-variant-numeric:tabular-nums] ${toneClass}`}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{hint}</p>}
    </>
  );

  if (!onClick) {
    return (
      <Card variant="stat" padding="sm" accentBar>
        {body}
      </Card>
    );
  }

  return (
    <Card variant="interactive" padding="sm" accentBar>
      <button
        type="button"
        onClick={() => {
          SoundFX.play('focus');
          onClick();
        }}
        className="w-full cursor-pointer rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {body}
        <span className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-brand-active opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:text-brand-2">
          Abrir detalhe
        </span>
      </button>
    </Card>
  );
}
