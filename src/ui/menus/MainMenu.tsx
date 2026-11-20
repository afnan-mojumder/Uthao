import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { ModalFocusGuard } from '../focusTrap';
import { t } from '../i18n';
import {
  installPromptSignal,
  isIosSafariInstallTipVisible,
  promptPwaInstall,
  Z_LAYER,
} from '../store';
import {
  IconClose,
  IconFlag,
  IconMotorcycle,
  IconPhone,
  IconPlay,
  IconRoad,
  IconScroll,
  IconSettings,
} from '../components/icons';

export interface MainMenuProps {
  hasSave?: boolean;
  showCredits?: boolean;
  onNewCareer?: () => void;
  onContinue?: () => void;
  onEndless?: () => void;
  onOpenSettings?: () => void;
}

export function MainMenu({
  hasSave = false,
  showCredits: propShowCredits,
  onNewCareer,
  onContinue,
  onEndless,
  onOpenSettings,
}: MainMenuProps): JSX.Element {
  const [showCredits, setShowCredits] = useState(propShowCredits ?? false);
  const [confirmNewCareer, setConfirmNewCareer] = useState(false);

  return (
    <div
      data-testid="main-menu"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_LAYER.MODAL,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        // 'safe' keeps overflowing content reachable on short landscape phones (audit: Credits clipped).
        justifyContent: 'safe center',
        overflowY: 'auto',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(30, 41, 59, 0.94) 0%, rgba(15, 23, 42, 0.98) 75%, #020617 100%)',
        backdropFilter: 'blur(20px)',
        fontFamily: "var(--font-sans, 'Hind Siliguri', 'Segoe UI', system-ui, sans-serif)",
        color: 'var(--text-primary, #F8FAFC)',
        padding: '24px',
        userSelect: 'none',
        pointerEvents: 'auto',
      }}
    >
      {/* Dhaka neon skyline glow decoration */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '20%',
          width: '60%',
          height: '40%',
          background: 'radial-gradient(circle, rgba(34, 197, 94, 0.16) 0%, rgba(56, 189, 248, 0.08) 50%, transparent 80%)',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      {/* Main Title Container */}
      <div
        style={{
          textAlign: 'center',
          marginBottom: '40px',
          zIndex: 1,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            background: 'var(--uthao-green-dim, rgba(34, 197, 94, 0.14))',
            border: '1px solid var(--uthao-green-border, rgba(34, 197, 94, 0.35))',
            padding: '6px 16px',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            color: 'var(--uthao-green, #22C55E)',
            fontWeight: 700,
            marginBottom: '12px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          <IconMotorcycle size={18} color="var(--uthao-green, #22C55E)" /> {t('menu.subtitle')}
        </div>

        <h1
          data-testid="main-menu-title"
          style={{
            margin: '0 0 8px 0',
            fontSize: 'clamp(3rem, 7vw, 5rem)',
            fontWeight: 900,
            letterSpacing: '3px',
            background: 'linear-gradient(135deg, #f8fafc 0%, var(--info-sky, #38BDF8) 50%, var(--uthao-green, #22C55E) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            textShadow: '0 10px 30px rgba(56, 189, 248, 0.3)',
          }}
        >
          {t('menu.title')}
        </h1>

        <p
          style={{
            margin: 0,
            fontSize: '1rem',
            color: '#94a3b8',
            maxWidth: '460px',
            lineHeight: 1.5,
          }}
        >
          {t('menu.tagline')}
        </p>
      </div>

      {/* Navigation Buttons Card */}
      <div
        style={{
          width: '100%',
          maxWidth: '360px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 1,
        }}
      >
        {hasSave && (
          <button
            data-testid="menu-btn-continue"
            onClick={onContinue}
            style={{
              padding: '16px',
              borderRadius: '14px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(14, 165, 233, 0.15))',
              color: '#38bdf8',
              fontSize: '1.05rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              transition: 'all 0.2s ease',
              boxShadow: '0 4px 15px rgba(56, 189, 248, 0.15)',
            }}
          >
            <IconPlay size={18} color="var(--info-sky, #38BDF8)" /> {t('menu.continue')}
          </button>
        )}

        {confirmNewCareer && (
          <div
            data-testid="menu-new-career-confirm"
            role="alertdialog"
            aria-labelledby="menu-new-career-confirm-text"
            style={{
              padding: '14px',
              borderRadius: '14px',
              border: '1px solid var(--danger-red-border, rgba(239, 68, 68, 0.5))',
              background: 'rgba(69, 10, 10, 0.85)',
              color: '#fecaca',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <p id="menu-new-career-confirm-text" style={{ margin: 0, fontWeight: 600 }}>
              {t('menu.new_career_confirm')}
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                data-testid="menu-new-career-confirm-yes"
                onClick={() => {
                  setConfirmNewCareer(false);
                  onNewCareer?.();
                }}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--danger-red, #EF4444)',
                  background: 'rgba(239, 68, 68, 0.25)',
                  color: '#fecaca',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {t('menu.new_career_confirm_yes')}
              </button>
              <button
                data-testid="menu-new-career-confirm-no"
                onClick={() => setConfirmNewCareer(false)}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                  background: 'rgba(30, 41, 59, 0.85)',
                  color: '#f8fafc',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                {t('menu.new_career_confirm_no')}
              </button>
            </div>
          </div>
        )}

        <button
          data-testid="menu-btn-new-career"
          onClick={() => {
            // A career already on disk is replaced by a new one, so ask first.
            if (hasSave) setConfirmNewCareer(true);
            else onNewCareer?.();
          }}
          style={{
            padding: '14px 16px',
            borderRadius: '14px',
            border: '1px solid var(--uthao-green-border, rgba(34, 197, 94, 0.45))',
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.28), rgba(22, 163, 74, 0.18))',
            color: 'var(--uthao-green, #22C55E)',
            fontSize: '1.05rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 15px rgba(34, 197, 94, 0.2)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            <IconFlag size={18} color="var(--uthao-green, #22C55E)" />
            <span>{t('menu.new_career')}</span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: '9999px',
                background: 'rgba(34, 197, 94, 0.22)',
                border: '1px solid rgba(34, 197, 94, 0.45)',
              }}
            >
              {t('menu.career_badge')}
            </span>
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#cbd5e1' }}>
            {t('menu.career_desc')}
          </span>
        </button>

        <button
          data-testid="menu-btn-endless"
          onClick={onEndless}
          style={{
            padding: '13px 16px',
            borderRadius: '14px',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            background: 'rgba(30, 41, 59, 0.78)',
            color: '#f8fafc',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            transition: 'all 0.2s ease',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', color: '#38bdf8' }}>
            <IconRoad size={18} color="#38bdf8" />
            <span>{t('menu.quick_ride')}</span>
          </span>
          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8' }}>
            {t('menu.quick_ride_desc')}
          </span>
        </button>

        <button
          data-testid="menu-btn-settings"
          onClick={onOpenSettings}
          style={{
            padding: '14px',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(30, 41, 59, 0.7)',
            color: '#f8fafc',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.2s ease',
          }}
        >
          <IconSettings size={18} /> {t('menu.settings')}
        </button>

        <button
          data-testid="menu-btn-credits"
          onClick={() => setShowCredits(true)}
          style={{
            padding: '12px',
            borderRadius: '14px',
            border: 'none',
            background: 'transparent',
            color: '#94a3b8',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <IconScroll size={16} /> {t('menu.credits')}
        </button>

        {installPromptSignal.value && (
          <button
            type="button"
            data-testid="pwa-install-btn"
            onClick={() => void promptPwaInstall()}
            style={{
              padding: '12px 16px',
              borderRadius: '14px',
              border: '1px solid var(--uthao-green-border, rgba(34, 197, 94, 0.45))',
              background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.22), rgba(5, 150, 105, 0.16))',
              color: 'var(--uthao-green, #22C55E)',
              fontSize: '0.92rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <IconPhone size={17} /> {t('ui.install_app')}
          </button>
        )}

        {!installPromptSignal.value && isIosSafariInstallTipVisible() && (
          <div
            data-testid="ios-install-tip"
            style={{
              padding: '10px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              background: 'rgba(15, 23, 42, 0.72)',
              color: '#cbd5e1',
              fontSize: '0.78rem',
              lineHeight: 1.45,
              textAlign: 'center',
            }}
          >
            {t('ui.ios_install_tip')}
          </div>
        )}
      </div>

      {/* Credits Modal */}
      {showCredits && (
        <div
          data-testid="credits-modal"
          onKeyDown={(e) => {
            // Escape closes the credits, like the Close button.
            if (e.key === 'Escape') setShowCredits(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: Z_LAYER.MODAL,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('menu.credits_title')}
            tabIndex={-1}
            style={{
              width: '100%',
              maxWidth: '540px',
              maxHeight: '90dvh',
              overflowY: 'auto',
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
          >
            <ModalFocusGuard />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#38bdf8' }}>{t('menu.credits_title')}</h2>
              <button
                type="button"
                data-testid="credits-close-btn"
                aria-label={t('menu.close')}
                onClick={() => setShowCredits(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px',
                }}
              >
                <IconClose size={20} />
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <strong style={{ color: '#f8fafc' }}>{t('menu.credits_dev_heading')}</strong>
                <p style={{ margin: '4px 0 0 0' }}>{t('menu.credits_dev_names')}</p>
              </div>

              <div>
                <strong style={{ color: '#f8fafc' }}>{t('menu.credits_art_heading')}</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  <li>{t('menu.credits_art_geometry')}</li>
                  <li>{t('menu.credits_art_audio')}</li>
                </ul>
              </div>

              <div>
                <strong style={{ color: '#f8fafc' }}>{t('menu.credits_font_heading')}</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  <li>{t('menu.credits_font_item')}</li>
                </ul>
              </div>

              <div>
                <strong style={{ color: '#f8fafc' }}>{t('menu.credits_engine_heading')}</strong>
                <p style={{ margin: '4px 0 0 0' }}>{t('menu.credits_engine_items')}</p>
              </div>

              <div data-testid="credits-privacy-section">
                <strong style={{ color: '#f8fafc' }}>{t('menu.credits_privacy_heading')}</strong>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.84rem', color: '#cbd5e1' }}>
                  {t('menu.credits_privacy_body')}
                </p>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                {t('menu.credits_dedication')}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowCredits(false)}
              style={{
                width: '100%',
                marginTop: '20px',
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(56, 189, 248, 0.2)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: '#38bdf8',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('menu.close')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
