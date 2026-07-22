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

export function IconPhone(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6.3 4h2.4l1.3 3.6-1.7 1.5a11.5 11.5 0 0 0 5.1 5.1l1.5-1.7L18.4 14v2.4a1.4 1.4 0 0 1-1.5 1.4A14.5 14.5 0 0 1 5 6.1 1.4 1.4 0 0 1 6.3 4Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconDocument(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M7 3.5h7l4 4V19a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <path d="M14 3.5V8h4" />
      <path d="M8.5 12.5h7M8.5 15.8h5" />
    </svg>
  );
}

export function IconHandshake(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11.5 7 8l3.2 2.6a1.4 1.4 0 0 0 1.9-.1l.4-.4a1.4 1.4 0 0 1 2 .1L17 12.6" />
      <path d="M3 11.5v3.3L7.2 19a1.6 1.6 0 0 0 2.2 0l.4-.4" />
      <path d="M21 11.5 17 8l-2.3 1.9" />
      <path d="M21 11.5v3.3L16.8 19a1.6 1.6 0 0 1-2.2 0l-2.8-2.7" />
    </svg>
  );
}

export function IconTrophy(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 4h8v5.5a4 4 0 0 1-8 0Z" strokeLinejoin="round" />
      <path d="M8 5.5H5.5a1 1 0 0 0-1 1V8a3 3 0 0 0 3 3M16 5.5h2.5a1 1 0 0 1 1 1V8a3 3 0 0 1-3 3" />
      <path d="M12 13.5V17M9 20h6M9.5 17h5l.7 3h-6.4Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClose(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconFlame(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5c2 2.3 1 3.8.5 5-1 2.4-3 2.7-3 5A2.5 2.5 0 0 0 12 16a2 2 0 0 0 2-2.3c1.2.9 1.8 2 1.8 3.3A3.8 3.8 0 0 1 12 20.5a5.3 5.3 0 0 1-5.3-5.3c0-3.2 2-4.5 3.3-6.7.9-1.5 1.3-3 2-5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSnowflake(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
      <path d="M9 4.8 12 6l3-1.2M9 19.2 12 18l3 1.2M5 10.8 4 14l3.2 1M19 10.8l1 3.2-3.2 1M5 13.2 4 10l3.2-1M19 13.2l1-3.2-3.2-1" />
    </svg>
  );
}

export function IconDownload(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5v11M8 11l4 4 4-4" />
      <path d="M4.5 16.5V19a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-2.5" />
    </svg>
  );
}

export function IconPlus(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconEdit(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20h4.2L18.4 9.8a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8Z" strokeLinejoin="round" />
      <path d="M12.5 6.5 17.5 11.5" />
    </svg>
  );
}

export function IconTrash(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 7h14M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
      <path d="M6.5 7 7.3 19a1.4 1.4 0 0 0 1.4 1.3h6.6a1.4 1.4 0 0 0 1.4-1.3L17.5 7" />
      <path d="M10.3 11v6M13.7 11v6" />
    </svg>
  );
}

export function IconMail(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4.5 7 12 12.5 19.5 7" />
    </svg>
  );
}

export function IconMapPin(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 21s7-6.4 7-11.5A7 7 0 0 0 5 9.5C5 14.6 12 21 12 21Z" strokeLinejoin="round" />
      <circle cx="12" cy="9.5" r="2.3" />
    </svg>
  );
}

export function IconSpinner(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" strokeOpacity={1} />
    </svg>
  );
}

export function IconArrowLeft(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M19.5 12H5" />
      <path d="M10.5 6 4.5 12l6 6" />
    </svg>
  );
}

export function IconGlobe(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.3 3.3 8.5s-1.1 6.2-3.3 8.5c-2.2-2.3-3.3-5.3-3.3-8.5s1.1-6.2 3.3-8.5Z" />
    </svg>
  );
}

export function IconLinkedin(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <path d="M8 10.5V17M8 7.3v.1" strokeWidth={2.2} />
      <path d="M11.5 17v-4a2.2 2.2 0 0 1 4.4 0v4M11.5 10.5V17" />
    </svg>
  );
}

export function IconInstagram(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M16.8 7.2h0" strokeWidth={2.6} />
    </svg>
  );
}

export function IconTwitterX(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 5l14 14M19 5 5 19" />
    </svg>
  );
}

export function IconFacebook(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 21v-7.5H17l.5-3.3h-3V8.1c0-1 .3-1.7 1.7-1.7H17.7V3.5A22 22 0 0 0 15.5 3.4c-2.4 0-4 1.5-4 4.1v2.7H8.9v3.3h2.6V21" strokeLinejoin="round" />
    </svg>
  );
}

export function IconStar(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.7l2.5 5.2 5.6.8-4 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4-4 5.6-.8Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconTag(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M11.6 3.5H6a1 1 0 0 0-1 1v5.6a1 1 0 0 0 .3.7l9 9a1 1 0 0 0 1.4 0l5.6-5.6a1 1 0 0 0 0-1.4l-9-9a1 1 0 0 0-.7-.3Z" strokeLinejoin="round" />
      <path d="M8.2 8.2h0" strokeWidth={2.4} />
    </svg>
  );
}

export function IconWrench(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.5 3.8a4.5 4.5 0 0 0-5.7 5.3L4 13.9v3.2h3.2l4.8-4.8a4.5 4.5 0 0 0 5.3-5.7l-3.1 3.1-2.3-.6-.6-2.3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconClipboard(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <rect x="8.5" y="3" width="7" height="3" rx="1" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" />
    </svg>
  );
}

export function IconChevronDown(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 9.5 12 15.5 18 9.5" />
    </svg>
  );
}

export function IconChevronUp(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 14.5 12 8.5 18 14.5" />
    </svg>
  );
}

export function IconSend(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 4 10.5 13.5M20 4 13.5 20l-3-6.5L4 10.5Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconSave(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 4.5h11l3 3V19a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5Z" strokeLinejoin="round" />
      <path d="M8 4.5V9h7V4.5M8 19.5v-6h8v6" />
    </svg>
  );
}

export function IconInfo(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <path d="M12 7.8h0" strokeWidth={2.6} />
    </svg>
  );
}

export function IconMessage(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5.5h16v10.5a1 1 0 0 1-1 1H9l-4 3.5v-3.5H5a1 1 0 0 1-1-1Z" strokeLinejoin="round" />
    </svg>
  );
}

export function IconCalendar(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.4M16 3v3.4" />
    </svg>
  );
}

export function IconChat(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5.5h16v10.5a1 1 0 0 1-1 1H9l-4 3.5v-3.5H5a1 1 0 0 1-1-1Z" strokeLinejoin="round" />
      <path d="M8.3 10.3h0M12 10.3h0M15.7 10.3h0" strokeWidth={2.6} />
    </svg>
  );
}

export function IconDatabase(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <ellipse cx="12" cy="5.8" rx="7.5" ry="2.8" />
      <path d="M4.5 5.8V12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V5.8" />
      <path d="M4.5 12v6.2c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V12" />
    </svg>
  );
}

export function IconCpu(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
      <rect x="10" y="10" width="4" height="4" />
      <path d="M9 3.3V7M15 3.3V7M9 17v3.7M15 17v3.7M3.3 9H7M3.3 15H7M17 9h3.7M17 15h3.7" />
    </svg>
  );
}

export function IconBot(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4.5" y="9" width="15" height="11" rx="3" />
      <path d="M12 5.5V9" />
      <circle cx="12" cy="4.3" r="1.2" fill="currentColor" stroke="none" />
      <path d="M8.5 14v1M15.5 14v1" strokeWidth={2.2} />
      <path d="M9.5 17.3h5" />
      <path d="M2.5 12.5v3M21.5 12.5v3" />
    </svg>
  );
}

export function IconServer(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4.5" width="17" height="6" rx="1.5" />
      <rect x="3.5" y="13.5" width="17" height="6" rx="1.5" />
      <path d="M7 7.5h0M7 16.5h0" strokeWidth={2.6} />
    </svg>
  );
}

export function IconShieldCheck(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.3 19 6v6c0 4.4-3 7.8-7 8.7-4-.9-7-4.3-7-8.7V6Z" strokeLinejoin="round" />
      <path d="M9 12.2l2.1 2.1L15.3 10" />
    </svg>
  );
}

export function IconWarning(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.6 3.9 2.9 18a1.4 1.4 0 0 0 1.2 2.1h15.8a1.4 1.4 0 0 0 1.2-2.1L13.4 3.9a1.4 1.4 0 0 0-2.8 0Z" strokeLinejoin="round" />
      <path d="M12 9.3v4.4" />
      <path d="M12 16.8h0" strokeWidth={2.6} />
    </svg>
  );
}

export function IconLandmark(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 9.5 12 4l8.5 5.5" strokeLinejoin="round" />
      <path d="M4.5 9.5h15V20h-15Z" strokeLinejoin="round" />
      <path d="M8 12.5V17M12 12.5V17M16 12.5V17" />
    </svg>
  );
}

export function IconUserPlus(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="9.5" cy="8.2" r="3.2" />
      <path d="M3.5 19.4c.7-3.3 2.9-5 6-5s5.3 1.7 6 5" />
      <path d="M18 8.5v5M15.5 11h5" />
    </svg>
  );
}

export function IconSliders(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 6.5h9M17 6.5h3M4 12h3M9 17.5h11M7 17.5h0" />
      <circle cx="14" cy="6.5" r="2.2" />
      <circle cx="6" cy="12" r="2.2" />
      <circle cx="7" cy="17.5" r="2.2" />
    </svg>
  );
}

export function IconDollar(props: AtlasIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 6.5v11" />
      <path d="M15 9.3c0-1.1-1.3-1.8-3-1.8s-3 .8-3 2 1.2 1.6 3 2 3 .9 3 2-1.3 2-3 2-3-.7-3-1.8" />
    </svg>
  );
}
