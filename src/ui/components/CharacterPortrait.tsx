import type { JSX } from 'preact';

export interface CharacterPortraitProps {
  name: string;
  role?: string;
  avatarUrl?: string;
  rating?: number;
  ridesCount?: number;
  mood?: 'happy' | 'neutral' | 'angry' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showMoodBadge?: boolean;
  className?: string;
}

export function CharacterPortrait({
  name,
  role,
  avatarUrl,
  rating,
  ridesCount,
  mood = 'neutral',
  size = 'md',
  showMoodBadge = true,
  className = '',
}: CharacterPortraitProps): JSX.Element {
  const sizeMap = {
    sm: { container: 'w-8 h-8', text: 'text-xs', badge: 'w-2.5 h-2.5 -bottom-0.5 -right-0.5 text-[8px]' },
    md: { container: 'w-11 h-11', text: 'text-sm', badge: 'w-4 h-4 -bottom-1 -right-1 text-[10px]' },
    lg: { container: 'w-14 h-14', text: 'text-base', badge: 'w-5 h-5 -bottom-1 -right-1 text-xs' },
    xl: { container: 'w-20 h-20', text: 'text-xl', badge: 'w-6 h-6 -bottom-1.5 -right-1.5 text-sm' },
  }[size];

  const moodDetails = {
    happy: { bg: 'bg-emerald-500', icon: '😊', border: 'border-emerald-400' },
    neutral: { bg: 'bg-amber-500', icon: '😐', border: 'border-amber-400' },
    angry: { bg: 'bg-rose-500', icon: '😠', border: 'border-rose-400' },
    danger: { bg: 'bg-red-600', icon: '⚠️', border: 'border-red-500' },
  }[mood];

  // Derive initials from name
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Avatar Circle */}
      <div className={`relative flex-shrink-0 ${sizeMap.container} rounded-full`}>
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover rounded-full border-2 border-slate-700/80 shadow-md"
          />
        ) : (
          <div
            className={`w-full h-full rounded-full flex items-center justify-center font-bold text-slate-200 border-2 border-slate-700/80 shadow-md ${sizeMap.text}`}
            style={{
              background: 'linear-gradient(135deg, #1E293B 0%, #334155 100%)',
            }}
          >
            {initials}
          </div>
        )}

        {/* Mood indicator badge */}
        {showMoodBadge && (
          <div
            className={`absolute ${sizeMap.badge} rounded-full flex items-center justify-center border-2 border-slate-900 shadow-lg ${moodDetails.bg}`}
            title={`Mood: ${mood}`}
          >
            <span className="leading-none">{moodDetails.icon}</span>
          </div>
        )}
      </div>

      {/* Text Info */}
      {(role || rating !== undefined || ridesCount !== undefined) && (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-bold text-slate-100 text-sm truncate">
            <span>{name}</span>
            {rating !== undefined && (
              <span className="flex items-center text-xs font-semibold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-600/30">
                ★ {rating.toFixed(1)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            {role && <span>{role}</span>}
            {ridesCount !== undefined && (
              <span>({ridesCount} rides)</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
