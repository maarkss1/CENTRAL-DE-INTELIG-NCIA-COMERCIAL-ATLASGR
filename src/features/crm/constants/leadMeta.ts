import { IconFlame, IconSparkle, IconSnowflake } from '../../../components/icons';

export const TEMPERATURE_META = {
    Quente: { icon: IconFlame, className: 'text-red-600 bg-red-50' },
    Morno: { icon: IconSparkle, className: 'text-amber-600 bg-amber-50' },
    Frio: { icon: IconSnowflake, className: 'text-sky-600 bg-sky-50' },
} as const;
