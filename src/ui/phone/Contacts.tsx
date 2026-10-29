import type { JSX } from 'preact';
import { CHARACTERS, isContactUnlocked } from '../../sim/passenger/PassengerAI';
import type { CharacterDef } from '../../core/types';
import { t } from '../i18n';
import { contactsSelectedSignal } from '../store';

export interface ContactsProps {
  relationships?: Record<string, number>;
  selectedCharId?: string | null;
  onSelectChar?: (id: string | null) => void;
  onCallContact?: (characterId: string) => void;
}

export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

export function getCharacterIcon(charId: string): string {
  switch (charId) {
    case 'char_ma':
      return '👵';
    case 'char_mintu':
      return '☕';
    case 'char_kamal':
      return '🔧';
    case 'char_nabila':
      return '🎓';
    case 'char_tanvir':
      return '💼';
    case 'char_rahim':
      return '👴';
    case 'char_ferdousi':
      return '👶';
    case 'char_jamil':
      return '🕶️';
    case 'char_morshed':
      return '👮';
    case 'char_bablu':
      return '🧺';
    default:
      return '👤';
  }
}

export function Contacts({
  relationships = {},
  selectedCharId: propSelectedCharId,
  onSelectChar,
  onCallContact,
}: ContactsProps): JSX.Element {
  const currentSelectedCharId = propSelectedCharId ?? contactsSelectedSignal.value;

  const handleSelectChar = (id: string | null) => {
    contactsSelectedSignal.value = id;
    onSelectChar?.(id);
  };

  const getRel = (id: string): number => {
    return relationships[id] ?? CHARACTERS.find((c) => c.id === id)?.initialRelationship ?? 0;
  };

  const unlockedCount = CHARACTERS.filter((c) =>
    isContactUnlocked(c.id, getRel(c.id))
  ).length;

  return (
    <div
      data-testid="contacts-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflowY: 'auto',
        padding: '16px',
        gap: '12px',
        background: '#090d16',
        color: '#f8fafc',
      }}
    >
      {/* Header Info */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
            {t('phone.contacts.title')}
          </h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {unlockedCount} / {CHARACTERS.length} {t('phone.contacts.regular_badge')}
          </span>
        </div>
        <span
          style={{
            fontSize: '11px',
            background: 'rgba(34, 197, 94, 0.15)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            color: '#22c55e',
            padding: '2px 8px',
            borderRadius: '12px',
            fontWeight: 700,
          }}
        >
          {t('phone.contacts.zero_commission')}
        </span>
      </div>

      {/* Contact List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {CHARACTERS.map((char: CharacterDef) => {
          const rel = getRel(char.id);
          const unlocked = isContactUnlocked(char.id, rel);
          const isSelected = currentSelectedCharId === char.id;

          if (!unlocked) {
            return (
              <div
                key={char.id}
                data-testid={`contact-locked-${char.id}`}
                style={{
                  background: 'rgba(30, 41, 59, 0.3)',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  opacity: 0.6,
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: '#1e293b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                  }}
                >
                  🔒
                </div>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8' }}>
                    {t('phone.contacts.locked')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {t('phone.contacts.relationship')}: {rel} / 15
                    </span>
                    <div
                      style={{
                        flex: 1,
                        maxWidth: '80px',
                        height: '4px',
                        background: '#334155',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.min(100, (rel / 15) * 100)}%`,
                          height: '100%',
                          background: '#eab308',
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div
              key={char.id}
              data-testid={`contact-item-${char.id}`}
              onClick={() => handleSelectChar(isSelected ? null : char.id)}
              style={{
                background: isSelected ? 'rgba(30, 41, 59, 0.85)' : 'rgba(15, 23, 42, 0.7)',
                border: isSelected
                  ? '1px solid rgba(56, 189, 248, 0.5)'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                padding: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {/* Row: Avatar + Name/Role + Phone */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'rgba(56, 189, 248, 0.15)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                  }}
                >
                  {getCharacterIcon(char.id)}
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                      {t(char.nameKey)}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#38bdf8',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        fontWeight: 600,
                      }}
                    >
                      {t(char.roleKey)}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{char.phone}</span>
                </div>

                {/* Relationship Tag */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-end',
                    gap: '2px',
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#22c55e' }}>
                    {rel}
                  </span>
                  <span style={{ fontSize: '9px', color: '#64748b', textTransform: 'uppercase' }}>
                    {t('phone.contacts.relationship')}
                  </span>
                </div>
              </div>

              {/* Expanded details when selected */}
              {isSelected && (
                <div
                  style={{
                    paddingTop: '8px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    fontSize: '11px',
                    color: '#cbd5e1',
                  }}
                >
                  {char.bioKey && (
                    <p style={{ margin: 0, fontStyle: 'italic', color: '#94a3b8' }}>
                      "{t(char.bioKey)}"
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: '#64748b' }}>{t('phone.contacts.hours')}:</span>
                    <span style={{ fontWeight: 600 }}>
                      {char.preferredTimes
                        .map((pt) => `${formatTime(pt.startMinute)} - ${formatTime(pt.endMinute)}`)
                        .join(', ')}
                    </span>
                  </div>

                  {char.canRide !== false && onCallContact && (
                    <button
                      type="button"
                      data-testid={`call-contact-${char.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCallContact(char.id);
                      }}
                      style={{
                        marginTop: '6px',
                        padding: '8px',
                        borderRadius: '8px',
                        background: '#22c55e',
                        border: 'none',
                        color: '#0f172a',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <span>📞</span>
                      <span>{t('phone.contacts.call')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
