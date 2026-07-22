import type { SVGProps } from 'react';

/**
 * Biblioteca de ícones exclusiva AtlasGR.
 * Grid 24x24, traço 1.75, cantos arredondados — ecoando o corte angular
 * (paralelogramo + triângulo) do logo em pequenos acentos geométricos.
 * Uso: <IconHome className="w-5 h-5" />
 */
export type AtlasIconProps = SVGProps<SVGSVGElement>;

function base(props: AtlasIconProps) {
  return {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export function IconHome(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 11.5 11.2 4.2a1.1 1.1 0 0 1 1.6 0L20 11.5" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h3.2v-4.6a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1V20H17a1 1 0 0 0 1-1V9.8" />
    </svg>
  );
}

export function IconBuilding(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 20V6.4a1 1 0 0 1 .58-.9l5-2.3a1 1 0 0 1 1.42.9V20" />
      <path d="M12 9.5 18.5 12a1 1 0 0 1 .5.87V20" />
      <path d="M3 20h18" />
      <path d="M8 8.5h0M8 12h0M8 15.5h0" strokeWidth={2.4} />
    </svg>
  );
}

export function IconContacts(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.7-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <path d="M16.2 5.2A3 3 0 0 1 16.2 11" />
      <path d="M15 14.6c2.4.3 4 1.8 4.5 4.4" />
    </svg>
  );
}

export function IconPipeline(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="12.5" width="4.4" height="7.5" rx="1.2" />
      <rect x="9.8" y="7.5" width="4.4" height="12.5" rx="1.2" />
      <rect x="16.1" y="4" width="4.4" height="16" rx="1.2" />
    </svg>
  );
}

export function IconActivity(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M7 13l2.2-4 2.3 6.5L13.6 11l1.8 2.8H17" />
    </svg>
  );
}

export function IconRadar(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" strokeOpacity={0.55} />
      <path d="M12 12 17 7.2" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSparkle(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5c.5 3.2 1.4 4.9 2.9 6.4 1.5 1.5 3.2 2.4 6.4 2.9-3.2.5-4.9 1.4-6.4 2.9-1.5 1.5-2.4 3.2-2.9 6.4-.5-3.2-1.4-4.9-2.9-6.4C7.6 14.1 5.9 13.2 2.7 12.7c3.2-.5 4.9-1.4 6.4-2.9 1.5-1.5 2.4-3.2 2.9-6.3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBrain(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9.5 4.3a2.6 2.6 0 0 1 3.9 1.6 2.6 2.6 0 0 1 3.6 3.4A2.9 2.9 0 0 1 16 14.4v1.3a3.3 3.3 0 0 1-6.6 0v-1a2.9 2.9 0 0 1-2.7-4.6 2.6 2.6 0 0 1 2.8-5.8Z" />
      <path d="M12 8v8.6M9.3 10h1.6M13 9.6h1.6M9.6 13.2h1.4M13 13.5h1.4" strokeWidth={1.4} />
    </svg>
  );
}

export function IconSearch(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10.8" cy="10.8" r="6.8" />
      <path d="M20 20 15.6 15.6" />
    </svg>
  );
}

export function IconBell(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 10.5a6 6 0 0 1 12 0c0 4 1.2 5.4 1.8 6.1a.7.7 0 0 1-.5 1.2H4.7a.7.7 0 0 1-.5-1.2c.6-.7 1.8-2.1 1.8-6.1Z" />
      <path d="M9.6 19.8a2.4 2.4 0 0 0 4.8 0" />
    </svg>
  );
}

export function IconChevronsLeft(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 5 8 12l6.5 7" />
      <path d="M19 5l-6.5 7 6.5 7" strokeOpacity={0.55} />
    </svg>
  );
}

export function IconArrowRight(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12h14.5" />
      <path d="M13.5 6l6 6-6 6" />
    </svg>
  );
}

export function IconCheck(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12.8 9.3 17.5 19.5 6.5" />
    </svg>
  );
}

export function IconTarget(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBolt(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13 3 5.5 13.2a.7.7 0 0 0 .56 1.1H11l-1 6.7 7.9-10.6a.7.7 0 0 0-.56-1.1H13Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconLogout(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.5 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h4.5" />
      <path d="M15.5 16 20 12l-4.5-4" />
      <path d="M20 12H9.5" />
    </svg>
  );
}

export function IconUser(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5 19.4c.8-3.6 3.2-5.4 7-5.4s6.2 1.8 7 5.4" />
    </svg>
  );
}

export function IconClock(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3.2 2" />
    </svg>
  );
}

export function IconMenu(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6.5h16M4 12h16M4 17.5h11" />
    </svg>
  );
}

export function IconGrid(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.6" />
      <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.6" />
      <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.6" />
      <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.6" />
    </svg>
  );
}

export function IconTrendUp(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 16.5 9.5 11l3.5 3.5L20 7" />
      <path d="M14.5 7H20v5.5" />
    </svg>
  );
}
