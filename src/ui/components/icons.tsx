import type { CSSProperties, JSX } from 'preact';

export interface IconProps {
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

function baseSvgProps({ size = 18, color = 'currentColor', className, style }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': 'true' as const,
    className,
    style: { flexShrink: 0, display: 'inline-block', verticalAlign: 'middle', ...style },
  };
}

export function IconMotorcycle(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M5.5 17.5h6l3-6h3.5l1.5 6" />
      <path d="M10 11.5h4.5l1.5-3.5h2" />
      <path d="M7.5 11.5l2 3" />
    </svg>
  );
}

export function IconFuel(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M4 20V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v15" />
      <path d="M2 20h15" />
      <path d="M7 7h5v4H7z" />
      <path d="M15 11h2a2 2 0 0 1 2 2v4a1.5 1.5 0 0 0 3 0V9l-2.5-2.5" />
    </svg>
  );
}

export function IconWarning(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconChat(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function IconUser(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

export function IconFullscreen(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

export function IconPlay(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

export function IconFlag(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  );
}

export function IconRoad(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M4 19L8 5" />
      <path d="M20 19L16 5" />
      <line x1="12" y1="6" x2="12" y2="9" />
      <line x1="12" y1="12" x2="12" y2="15" />
      <line x1="12" y1="18" x2="12" y2="20" />
    </svg>
  );
}

export function IconSettings(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function IconScroll(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="14" y2="17" />
    </svg>
  );
}

export function IconClose(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function IconCheck(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function IconStar(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function IconMapPin(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export function IconPhone(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <rect x="6" y="2" width="12" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  );
}

export function IconWrench(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export function IconSave(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

export function IconShield(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function IconClock(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export function IconTurnLeft(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

export function IconTurnRight(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polyline points="15 14 20 9 15 4" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

export function IconTurnUTurn(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <title>↶</title>
      <polyline points="9 14 4 9 9 4" />
      <path d="M4 9h10a5 5 0 0 1 0 10H11" />
    </svg>
  );
}

export function IconTurnStraight(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

export function IconBattery(props: IconProps & { level?: number }): JSX.Element {
  const level = Math.max(0, Math.min(100, props.level ?? 100));
  const fillWidth = Math.max(1, Math.round((level / 100) * 12));
  return (
    <svg {...baseSvgProps(props)}>
      <rect x="2" y="7" width="16" height="10" rx="2" ry="2" />
      <line x1="21" y1="10" x2="21" y2="14" />
      <rect x="4" y="9" width={fillWidth} height="6" rx="1" fill={props.color ?? 'currentColor'} stroke="none" />
    </svg>
  );
}

export function IconShare(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

export function IconPackage(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M16.5 9.4l-9-5.19" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

export function IconPause(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function IconMap(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

export function IconVolume(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

export function IconGamepad(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <line x1="6" y1="12" x2="10" y2="12" />
      <line x1="8" y1="10" x2="8" y2="14" />
      <line x1="15" y1="13" x2="15.01" y2="13" />
      <line x1="18" y1="11" x2="18.01" y2="11" />
      <rect x="2" y="6" width="20" height="12" rx="4" />
    </svg>
  );
}

export function IconLock(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export function IconBell(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconTrophy(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  );
}

export function IconSkip(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <polygon points="5 4 15 12 5 20 5 4" />
      <line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}

export function IconSliders(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <line x1="4" y1="21" x2="4" y2="14" />
      <line x1="4" y1="10" x2="4" y2="3" />
      <line x1="12" y1="21" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12" y2="3" />
      <line x1="20" y1="21" x2="20" y2="16" />
      <line x1="20" y1="12" x2="20" y2="3" />
      <line x1="1" y1="14" x2="7" y2="14" />
      <line x1="9" y1="8" x2="15" y2="8" />
      <line x1="17" y1="16" x2="23" y2="16" />
    </svg>
  );
}

export function IconCamera(props: IconProps): JSX.Element {
  return (
    <svg {...baseSvgProps(props)}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
