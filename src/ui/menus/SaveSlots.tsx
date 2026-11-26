import type { JSX } from 'preact';
import { signal } from '@preact/signals';
import { ModalFocusGuard } from '../focusTrap';
import { getLanguage, localDigits, t } from '../i18n';
import { saveStatusSignal, Z_LAYER } from '../store';
import { SaveSystem } from '../../sim/save/SaveSystem';
import type { SaveSlot, SaveV1, SaveV2 } from '../../sim/save/migrations';

export type SaveSlotPreview = SaveV1 | SaveV2;

export interface SaveSlotsProps {
  isOpen: boolean;
  mode: 'save' | 'load';
  onClose: () => void;
  onSelectSlot: (slot: SaveSlot) => void;
  onDeleteSlot?: (slot: SaveSlot) => void;
  saveSystem?: SaveSystem;
  slotsData?: Record<SaveSlot, SaveSlotPreview | null>;
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
  const slotsData: Record<SaveSlot, SaveSlotPreview | null> =
    propSlotsData ?? activeSystem.listSlots();
  const hasCorrupt = (['auto', 'slot1', 'slot2', 'slot3'] as SaveSlot[]).some((s) =>
    activeSystem.hasCorruptBackup(s)
  );

  const slotKeys: Array<{ id: SaveSlot; label: string; isAuto: boolean }> = [
    { id: 'auto', label: t('save.slot_auto'), isAuto: true },
    { id: 'slot1', label: t('save.slot_num', { num: localDigits(1) }), isAuto: false },
    { id: 'slot2', label: t('save.slot_num', { num: localDigits(2) }), isAuto: false },
    { id: 'slot3', label: t('save.slot_num', { num: localDigits(3) }), isAuto: false },
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-slots-dialog-title"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_LAYER.CRITICAL_MODAL,
        pointerEvents: 'auto',
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
          maxHeight: '90dvh',
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
            <ModalFocusGuard />
            <h2 id="save-slots-dialog-title" style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700, color: '#f59e0b' }}>
              {mode === 'save'
                ? t('save.title_save')
                : t('save.title_load')}
            </h2>
            {saveStatusSignal.value === 'failed' && (
              <div data-testid="save-failed" role="alert" style={{ fontSize: '0.85rem', color: '#f87171', fontWeight: 600 }}>
                {t('save.failed')}
              </div>
            )}
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              {mode === 'save'
                ? t('save.subtitle_save')
                : t('save.subtitle_load')}
            </div>
          </div>
          <button
            type="button"
            data-testid="btn-close-save-slots"
            aria-label={t('btn_close')}
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
            ✕ {t('btn_close')}
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
            ⚠️ {t('save.memory_warning')}
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
            ⚠️ {t('save.corrupt_notice')}
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
            const data: SaveSlotPreview | null = slotsData[id];
            const hasData = Boolean(data);
            const canSelect = mode === 'save' ? !isAuto : hasData;

            return (
              <div
                key={id}
                data-testid={`save-slot-${id}`}
                onClick={() => {
                  if (canSelect) {
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
                  cursor: canSelect ? 'pointer' : 'default',
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
                        {t('save.auto_badge')}
                      </span>
                    )}
                  </div>

                  {hasData && data ? (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'flex', gap: '12px' }}>
                      <span>{t('save.day_label', { day: localDigits(data.clock.day) })}</span>
                      <span>·</span>
                      <span>{t('save.chapter_label', { chapter: localDigits(data.story.currentChapter) })}</span>
                      <span>·</span>
                      <span style={{ color: '#10b981', fontWeight: 600 }}>৳{localDigits(data.economy.cash)}</span>
                      <span>·</span>
                      <span style={{ color: '#fbbf24', fontWeight: 600 }}>★ {localDigits(data.reputation.rating.toFixed(2))}</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>
                      {t('save.empty_slot')}
                    </div>
                  )}

                  {hasData && data && (
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                      {localDigits(
                        new Date(data.timestamp).toLocaleString(
                          getLanguage() === 'bn' ? 'bn-BD' : 'en-US',
                          {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          }
                        )
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {mode === 'save' && (
                    <button
                      type="button"
                      data-testid={`btn-action-save-${id}`}
                      disabled={isAuto}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isAuto) {
                          onSelectSlot(id);
                        }
                      }}
                      style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: isAuto ? '1px solid rgba(148, 163, 184, 0.25)' : 'none',
                        background: isAuto
                          ? 'rgba(51, 65, 85, 0.5)'
                          : hasData
                            ? '#f59e0b'
                            : '#10b981',
                        color: isAuto ? '#94a3b8' : '#ffffff',
                        fontWeight: 700,
                        fontSize: '0.9rem',
                        cursor: isAuto ? 'not-allowed' : 'pointer',
                        opacity: isAuto ? 0.72 : 1,
                      }}
                    >
                      {isAuto
                        ? t('save.auto_protected')
                        : hasData
                          ? t('save.btn_overwrite')
                          : t('save.btn_save')}
                    </button>
                  )}

                  {mode === 'load' && hasData && (
                    <button
                      type="button"
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
                      {t('save.btn_load')}
                    </button>
                  )}

                  {hasData && !isAuto && (
                    <button
                      type="button"
                      data-testid={`btn-delete-${id}`}
                      aria-label={t('save.delete_slot')}
                      onClick={(e) => handleDelete(e, id)}
                      style={{
                        padding: '10px',
                        borderRadius: '10px',
                        border: '1px solid #475569',
                        background: 'rgba(239, 68, 68, 0.1)',
                        color: '#ef4444',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                      }}
                      title={t('save.delete_slot')}
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
