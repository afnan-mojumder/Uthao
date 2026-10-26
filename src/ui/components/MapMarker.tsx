import type { JSX, ComponentChildren } from 'preact';

export interface MapMarkerProps {
  type: 'pickup' | 'dropoff' | 'passenger' | 'shop' | 'fuel' | 'garage' | 'danger' | 'story' | 'airport';
  label?: string;
  selected?: boolean;
  pulsing?: boolean;
  onClick?: () => void;
  className?: string;
  icon?: ComponentChildren;
}

export function MapMarker({
  type,
  label,
  selected = false,
  pulsing = false,
  onClick,
  className = '',
  icon,
}: MapMarkerProps): JSX.Element {
  const configs = {
    pickup: { bg: '#22C55E', symbol: '📍', label: 'Pickup' },
    dropoff: { bg: '#EF4444', symbol: '🎯', label: 'Drop-off' },
    passenger: { bg: '#3B82F6', symbol: '👤', label: 'Passenger' },
    shop: { bg: '#8B5CF6', symbol: '🛍️', label: 'Shop' },
    fuel: { bg: '#F59E0B', symbol: '⛽', label: 'Fuel' },
    garage: { bg: '#06B6D4', symbol: '🔧', label: 'Garage' },
    danger: { bg: '#DC2626', symbol: '⚠️', label: 'Danger Zone' },
    story: { bg: '#EC4899', symbol: '⭐', label: 'Story Mission' },
    airport: { bg: '#64748B', symbol: '✈️', label: 'Airport' },
  }[type];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`relative inline-flex flex-col items-center cursor-pointer group select-none transition-transform duration-200 hover:scale-110 active:scale-95 ${className}`}
    >
      {/* Outer Pulse */}
      {(pulsing || selected) && (
        <span
          className="absolute -inset-1 rounded-full animate-ping opacity-60"
          style={{ backgroundColor: configs.bg }}
        />
      )}

      {/* Marker Pin Head */}
      <div
        className="relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-lg border-2 border-white/90"
        style={{
          backgroundColor: configs.bg,
          boxShadow: `0 4px 12px ${configs.bg}80`,
        }}
      >
        <span>{icon || configs.symbol}</span>
      </div>

      {/* Pin Stem */}
      <div
        className="w-1 h-2 -mt-0.5 rounded-b-sm"
        style={{ backgroundColor: configs.bg }}
      />

      {/* Label Tooltip */}
      {label && (
        <span
          className={`absolute -bottom-6 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap shadow-md pointer-events-none transition-opacity ${
            selected ? 'opacity-100 bg-slate-900 text-white border border-slate-700' : 'opacity-80 group-hover:opacity-100 bg-slate-900/90 text-slate-200'
          }`}
        >
          {label}
        </span>
      )}
    </div>
  );
}
