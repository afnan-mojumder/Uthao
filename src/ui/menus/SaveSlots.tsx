import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { t } from '../i18n';
import { SaveSystem } from '../../sim/save/SaveSystem';
import type { SaveSlot, SaveV1 } from '../../sim/save/migrations';

export interface SaveSlotsProps {
  isOpen: boolean;
  mode: 'save' | 'load';
  onClose: () => void;
  onSelectSlot: (slot: SaveSlot) => void;
  onDeleteSlot?: (slot: SaveSlot) => void;
  saveSystem?: SaveSystem;
  slotsData?: Record<SaveSlot, SaveV1 | null>;
}

export const saveSlotsRefreshSignal = signal<number>(0);

export function SaveSlots({
  isOpen,
  mode,
  onClose,
  onSelectSlot,
  onDeleteSlot,
  saveSystem,
  slotsData: propSlotsData,
}: SaveSlotsProps): JSX.Element | null {
  if (!isOpen) return null;

  // Track signal to allow triggering re-renders on deletion/refresh
  void saveSlotsRefreshSignal.value;

  const activeSystem = saveSystem ?? new SaveSystem();
  const slotsData: Record<SaveSlot, SaveV1 | null> = propSlotsData ?? activeSystem.listSlots();
  const hasCorrupt = (['auto', 'slot1', 'slot2', 'slot3'] as SaveSlot[]).some((s) =>
    activeSystem.hasCorruptBackup(s)
  );

  const slotKeys: Array<{ id: SaveSlot; label: string; isAuto: boolean }> = [
    { id: 'auto', label: 'অটো-সেভ (Auto-Save)', isAuto: true },
    { id: 'slot1', label: 'স্লট ১ (Slot 1)', isAuto: false },
    { id: 'slot2', label: 'স্লট ২ (Slot 2)', isAuto: false },
    { id: 'slot3', label: 'স্লট ৩ (Slot 3)', isAuto: false },
  ];

  const handleDelete = (e: MouseEvent, slot: SaveSlot) => {
    e.stopPropagation();
    activeSystem.deleteSave(slot);
    onDeleteSlot?.(slot);
    saveSlotsRefreshSignal.value++;
  };

  return (
    <div
      data-testid="save-slots-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: "'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif",
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.98), rgba(15, 23, 42, 0.99))',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#f59e0b' }}>
              {mode === 'save'
                ? t('save.title_save') || '💾 গেম সেভ করুন (Save Game)'
                : t('save.title_load') || '📂 গেম লোড করুন (Load Game)'}
            </h2>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              {mode === 'save'
                ? 'একটি খালি বা পুরাতন স্লট নির্বাচন করুন'
                : 'পূর্বে সংরক্ষিত ড্রাইভের অগ্রগতি চালিয়ে যান'}
            </div>
          </div>
          <button
            data-testid="btn-close-save-slots"
            onClick={onClose}
            style={{
              background: '#334155',
              border: 'none',
              color: '#f8fafc',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            ✕ {t('btn_close') || 'বন্ধ'}
          </button>
        </div>

        {/* Warning Banners */}
        {activeSystem.isMemoryOnly && (
          <div
            data-testid="memory-warning-banner"
            style={{
              margin: '16px 20px 0 20px',
              padding: '12px 16px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '12px',
              color: '#fca5a5',
              fontSize: '0.85rem',
              lineHeight: 1.4,
            }}
          >
            ⚠️ <strong>মেমোরি স্টোরেজ (Memory Fallback):</strong> লোকালস্টোরেজ সীমাবদ্ধ বা প্রাইভেট
            মোড হওয়ায় ব্রাউজার ট্যাব বন্ধ করলে সেভ ফাইল মুছে যেতে পারে।
          </div>
        )}

        {hasCorrupt && (
          <div
            data-testid="corrupt-backup-banner"
            style={{
              margin: '12px 20px 0 20px',
              padding: '12px 16px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '12px',
              color: '#fcd34d',
              fontSize: '0.85rem',
              lineHeight: 1.4,
            }}
          >
            ⚠️ <strong>ত্রুটিযুক্ত সেভ ফাইল:</strong> একটি ক্ষতিগ্রস্ত সেভ ফাইল চিহ্নিত হয়েছে এবং ব্যাকআপ
            হিসেবে `.corrupt` কি-তে স্থানান্তর করা হয়েছে।
          </div>
        )}

        {/* Slots List */}
        <div
          style={{
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            overflowY: 'auto',
          }}
        >
          {slotKeys.map(({ id, label, isAuto }) => {
            const data: SaveV1 | null = slotsData[id];
            const hasData = Boolean(data);

            return (
              <div
                key={id}
                data-testid={`save-slot-${id}`}
                onClick={() => {
                  if (mode === 'save' || hasData) {
                    onSelectSlot(id);
                  }
                }}
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  border: hasData
                    ? '1px solid rgba(56, 189, 248, 0.35)'
                    : '1px dashed rgba(255, 255, 255, 0.15)',
                  background: hasData
                    ? 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))'
                    : 'rgba(15, 23, 42, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: mode === 'save' || hasData ? 'pointer' : 'default',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: isAuto ? '#38bdf8' : '#f8fafc' }}>
                      {label}
                    </span>
                    {isAuto && (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          background: 'rgba(56, 189, 248, 0.2)',
                          color: '#38bdf8',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        স্বয়ংক্রিয়
                      </span>
                    )}
                  </div>

                  {hasData && data ? (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', gap: '12px' }}>
                      <span>দিন {data.clock.day}</span>
                      <span>·</span>
                      <span>অধ্যায় {data.story.currentChapter}</span>
                      <span>·</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>৳{data.economy.cash}</span>
                      <span>·</span>
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>★ {data.reputation.rating.toFixed(2)}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontStyle: 'italic' }}>
                      [খালি স্লট — কোনো ডাটা সংরক্ষিত নেই]
                    </div>
                  )}

                  {hasData && data && (
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {new Date(data.timestamp).toLocaleString('bn-BD', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {mode === 'save' && (
                    <button
                      data-testid={`btn-action-save-${id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSlot(id);
                      }}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: hasData ? '#f59e0b' : '#10b981',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                      }}
                    >
                      {hasData ? 'ওভাররাইট' : 'সেভ'}
                    </button>
                  )}

                  {mode === 'load' && hasData && (
                    <button
                      data-testid={`btn-action-load-${id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectSlot(id);
                      }}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                        color: '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                      }}
                    >
                      লোড
                    </button>
                  )}

                  {hasData && !isAuto && (
                    <button
                      data-testid={`btn-delete-${id}`}
                      onClick={(e) => handleDelete(e as unknown as MouseEvent, id)}
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1px solid #475569',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                      title="স্লট মুছুন"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
