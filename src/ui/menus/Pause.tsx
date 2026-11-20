import type { JSX } from 'preact';
import { ModalPanel } from '../components';
import {
  IconClock,
  IconClose,
  IconMap,
  IconMotorcycle,
  IconPause,
  IconPlay,
  IconSave,
  IconScroll,
  IconSettings,
  IconWrench,
} from '../components/icons';
import { t } from '../i18n';

export interface PauseProps {
  isOpen: boolean;
  onResume?: () => void;
  onOpenMap?: () => void;
  onOpenGarage?: () => void;
  onOpenJournal?: () => void;
  onRecoverBike?: () => void;
  onOpenSettings?: () => void;
  onOpenSave?: () => void;
  onOpenLoad?: () => void;
  onEndShiftEarly?: () => void;
  endShiftBlockedKey?: string | null;
  onExitToMainMenu?: () => void;
}

export function Pause({
  isOpen,
  onResume,
  onOpenMap,
  onOpenGarage,
  onOpenJournal,
  onRecoverBike,
  onOpenSettings,
  onOpenSave,
  onOpenLoad,
  onEndShiftEarly,
  endShiftBlockedKey,
  onExitToMainMenu,
}: PauseProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <ModalPanel
      data-testid="pause-menu"
      ariaLabelledBy="pause-dialog-title"
      maxWidth="420px"
      zIndex={9997}
      backdropStyle={{
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(16px)',
        padding: '14px',
      }}
      panelStyle={{
        alignItems: 'center',
        background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.1)',
        padding: '24px 20px',
        gap: '18px',
      }}
      contentStyle={{ width: '100%', alignItems: 'center', gap: '18px' }}
    >
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px auto',
              color: '#38bdf8',
            }}
          >
            <IconPause size={22} />
          </div>
          <h2
            id="pause-dialog-title"
            data-testid="pause-title"
            style={{
              margin: '0 0 4px 0',
              fontSize: '1.45rem',
              fontWeight: 800,
              letterSpacing: '0.5px',
            }}
          >
            {t('pause.title')}
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            {t('pause.subtitle')}
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            type="button"
            data-testid="pause-btn-resume"
            onClick={onResume}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '0.98rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            }}
          >
            <IconPlay size={16} />
            <span>{t('pause.resume')}</span>
          </button>

          <button
            type="button"
            data-testid="pause-btn-map"
            onClick={onOpenMap}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <IconMap size={16} />
            <span>{t('pause.map')}</span>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%' }}>
            <button
              type="button"
              data-testid="pause-btn-garage"
              onClick={onOpenGarage}
              style={{
                padding: '11px',
                borderRadius: '12px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                background: 'rgba(30, 41, 59, 0.65)',
                color: '#e2e8f0',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <IconWrench size={15} />
              <span>{t('pause.garage')}</span>
            </button>

            <button
              type="button"
              data-testid="pause-btn-journal"
              onClick={onOpenJournal}
              style={{
                padding: '11px',
                borderRadius: '12px',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                background: 'rgba(30, 41, 59, 0.65)',
                color: '#e2e8f0',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <IconScroll size={15} />
              <span>{t('pause.journal')}</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="pause-btn-recover-bike"
            onClick={onRecoverBike}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              background: 'rgba(245, 158, 11, 0.14)',
              color: '#fbbf24',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <IconMotorcycle size={16} />
            <span>{t('pause.recover_bike')}</span>
          </button>

          <button
            type="button"
            data-testid="pause-btn-save"
            onClick={onOpenSave}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#f59e0b',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <IconSave size={16} />
            <span>{t('pause.save')}</span>
          </button>

          <button
            type="button"
            data-testid="pause-btn-load"
            onClick={onOpenLoad}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <IconSave size={16} />
            <span>{t('pause.load')}</span>
          </button>

          <button
            type="button"
            data-testid="pause-btn-settings"
            onClick={onOpenSettings}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(30, 41, 59, 0.6)',
              color: '#cbd5e1',
              fontSize: '0.92rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <IconSettings size={16} />
            <span>{t('pause.settings')}</span>
          </button>

          {onEndShiftEarly && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
              <button
                type="button"
                data-testid="pause-btn-end-shift"
                disabled={Boolean(endShiftBlockedKey)}
                onClick={onEndShiftEarly}
                style={{
                  width: '100%',
                  padding: '11px',
                  borderRadius: '12px',
                  border: endShiftBlockedKey
                    ? '1px solid rgba(148, 163, 184, 0.2)'
                    : '1px solid rgba(16, 185, 129, 0.3)',
                  background: endShiftBlockedKey
                    ? 'rgba(30, 41, 59, 0.45)'
                    : 'rgba(16, 185, 129, 0.12)',
                  color: endShiftBlockedKey ? '#64748b' : '#34d399',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  cursor: endShiftBlockedKey ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <IconClock size={16} />
                <span>{t('pause.end_shift')}</span>
              </button>
              {endShiftBlockedKey && (
                <div
                  data-testid="pause-end-shift-notice"
                  style={{
                    fontSize: '0.75rem',
                    color: '#fbbf24',
                    textAlign: 'center',
                    padding: '2px 4px',
                  }}
                >
                  {t(endShiftBlockedKey)}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            data-testid="pause-btn-exit"
            onClick={onExitToMainMenu}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '12px',
              border: 'none',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <IconClose size={15} />
            <span>{t('pause.main_menu')}</span>
          </button>
        </div>
    </ModalPanel>
  );
}
