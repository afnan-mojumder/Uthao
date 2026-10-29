import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../i18n';

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
  let showCredits = propShowCredits ?? false;
  let setShowCredits = (v: boolean) => {
    showCredits = v;
  };
  try {
    const [c, sc] = useState(propShowCredits ?? false);
    showCredits = c;
    setShowCredits = sc;
  } catch {
    // Vitest node environment
  }

  return (
    <div
      data-testid="main-menu"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(ellipse at 50% 30%, rgba(30, 41, 59, 0.94) 0%, rgba(15, 23, 42, 0.98) 75%, #020617 100%)',
        backdropFilter: 'blur(20px)',
        fontFamily: "'Hind Siliguri', 'Segoe UI', system-ui, sans-serif",
        color: '#f8fafc',
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
          background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(56, 189, 248, 0.08) 50%, transparent 80%)',
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
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '6px 16px',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            color: '#34d399',
            fontWeight: 700,
            marginBottom: '12px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}
        >
          <span>🏍️</span> {t('menu.subtitle')}
        </div>

        <h1
          data-testid="main-menu-title"
          style={{
            margin: '0 0 8px 0',
            fontSize: 'clamp(3rem, 7vw, 5rem)',
            fontWeight: 900,
            letterSpacing: '3px',
            background: 'linear-gradient(135deg, #f8fafc 0%, #38bdf8 50%, #10b981 100%)',
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
          Dhaka Low-Poly Motorcycle Simulation · Traffic · Street Life · Economy
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
            <span>▶️</span> {t('menu.continue')}
          </button>
        )}

        <button
          data-testid="menu-btn-new-career"
          onClick={onNewCareer}
          style={{
            padding: '16px',
            borderRadius: '14px',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(5, 150, 105, 0.2))',
            color: '#34d399',
            fontSize: '1.05rem',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'all 0.2s ease',
            boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)',
          }}
        >
          <span>🏁</span> {t('menu.new_career')}
        </button>

        <button
          data-testid="menu-btn-endless"
          onClick={onEndless}
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
          <span>🛣️</span> {t('menu.endless')}
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
          <span>⚙️</span> {t('menu.settings')}
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
          <span>📜</span> {t('menu.credits')}
        </button>
      </div>

      {/* Credits Modal */}
      {showCredits && (
        <div
          data-testid="credits-modal"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(15, 23, 42, 0.92)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '540px',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#38bdf8' }}>{t('menu.credits_title')}</h2>
              <button
                data-testid="credits-close-btn"
                onClick={() => setShowCredits(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.4rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.9rem', color: '#cbd5e1', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <strong style={{ color: '#f8fafc' }}>Development Team:</strong>
                <p style={{ margin: '4px 0 0 0' }}>Afnan Mojumder (Sim, Physics, Traffic, Districts) & Tafsirul Shuvo (Input, UI, Audio, Content, Releases)</p>
              </div>

              <div>
                <strong style={{ color: '#f8fafc' }}>Creative & Technical Partner:</strong>
                <p style={{ margin: '4px 0 0 0' }}>Google DeepMind Advanced Agentic Coding Team (Antigravity Project)</p>
              </div>

              <div>
                <strong style={{ color: '#f8fafc' }}>Public Domain Assets (CC0-1.0):</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  <li>Kenney (City Kit Roads, Commercial, Suburban, Car Kit, UI Audio, Impact Sounds)</li>
                  <li>OpenGameArt CC0 (Dhaka City Ambience, Monsoon Rain Audio, Horns)</li>
                  <li>Authentic Dhaka Procedural Models (CNGs, Rickshaws, Buses, Tea Stalls, Kamal Bhai Garage)</li>
                </ul>
              </div>

              <div>
                <strong style={{ color: '#f8fafc' }}>Open Font License (OFL-1.1):</strong>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  <li>Hind Siliguri (SIL Open Font License 1.1, Google Fonts / Lipi Design & Ekushey)</li>
                </ul>
              </div>

              <div>
                <strong style={{ color: '#f8fafc' }}>Open Source Engine & Physics:</strong>
                <p style={{ margin: '4px 0 0 0' }}>Three.js (MIT), Rapier Physics / @dimforge/rapier3d-compat (Apache-2.0), Preact (MIT), Vite</p>
              </div>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '12px', fontSize: '0.8rem', color: '#64748b' }}>
                Dedicated to the resilient riders and bustling streets of Dhaka, Bangladesh.
              </div>
            </div>

            <button
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
