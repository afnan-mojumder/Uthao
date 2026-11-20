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
