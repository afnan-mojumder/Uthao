import type { JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import {
  rotateOverlaySignal,
  unsupportedSignal,
  loadingSignal,
  contextLostSignal,
  pausedSignal,
  installPromptSignal,
  promptPwaInstall,
  phoneSignal,
  negotiationSignal,
  hudSignal,
  onAcceptRequestCallback,
  onDeclineRequestCallback,
  onNegotiationActionCallback,
  dayEndSignal,
  onSleepCallback,
  onDelayRentCallback,
  onAskAdvanceCallback,
  garageSignal,
  screenSignal,
  onRepairCallback,
  onBuyUpgradeCallback,
  onStartNewCareerCallback,
  onContinueCareerCallback,
  onStartEndlessCallback,
  onResumeGameCallback,
  onSetWaypointCallback,
  onCallContactCallback,
  tutorialSignal,
  endingSignal,
  onSelectCareerChoiceCallback,
  onRestartCareerCallback,
  onEnterEndlessCallback,
} from './store';
import { RotateOverlay } from './overlays/RotateOverlay';
import { Unsupported } from './overlays/Unsupported';
import { Loading } from './overlays/Loading';
import { ChoiceCard } from './choice/ChoiceCard';
import { Phone } from './phone/Phone';
import { NegotiationPanel } from './negotiation/NegotiationPanel';
import { DayEnd } from './menus/DayEnd';
import { Ending } from './menus/Ending';
import { Garage } from './garage/Garage';
import { MainMenu } from './menus/MainMenu';
import { Settings } from './menus/Settings';
import { Pause } from './menus/Pause';
import { MapScreen } from './map/MapScreen';
import { FirstRideTutorial } from './tutorial/FirstRideTutorial';
import { t } from './i18n';

export function App(): JSX.Element {
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      // Show rotate overlay if screen height > screen width and width < 900 (mobile/tablet portrait)
      const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
      rotateOverlaySignal.value = isPortrait;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        phoneSignal.value = {
          ...phoneSignal.value,
          open: !phoneSignal.value.open,
        };
      }
      if (e.key === 'g' || e.key === 'G') {
        garageSignal.value = {
          ...garageSignal.value,
          open: !garageSignal.value.open,
        };
      }
      if (e.key === 'm' || e.key === 'M') {
        if (screenSignal.value === 'map') {
          screenSignal.value = 'game';
        } else if (screenSignal.value === 'game') {
          screenSignal.value = 'map';
        }
      }
      if (e.key === 'Escape') {
        if (showSettings) {
          setShowSettings(false);
        } else if (screenSignal.value === 'map') {
          screenSignal.value = 'game';
        } else if (screenSignal.value === 'pause') {
          screenSignal.value = 'game';
          pausedSignal.value = false;
          onResumeGameCallback?.();
        } else if (screenSignal.value === 'game') {
          screenSignal.value = 'pause';
          pausedSignal.value = true;
        }
      }
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <div
      id="uthao-app-root"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Unsupported WebGL Overlay */}
      {unsupportedSignal.value && <Unsupported message={unsupportedSignal.value} />}

      {/* Rotate Device Screen (Portrait prevention) */}
      {rotateOverlaySignal.value && <RotateOverlay />}

      {/* Loading Overlay */}
      {loadingSignal.value && <Loading />}

      {/* WebGL Context Lost Overlay */}
      {contextLostSignal.value && (
        <div
          data-testid="context-lost-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9997,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#f8fafc',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <div
            style={{
              padding: '24px 32px',
              borderRadius: '16px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              textAlign: 'center',
            }}
          >
            <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
              {t('ui.context_lost')}
            </p>
          </div>
        </div>
      )}

      {/* Paused Indicator */}
      {pausedSignal.value && (
        <div
          data-testid="pause-indicator"
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.8)',
            backdropFilter: 'blur(8px)',
            padding: '8px 20px',
            borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#f8fafc',
            fontSize: '0.9rem',
            fontWeight: 600,
            pointerEvents: 'auto',
          }}
        >
          {t('ui.paused')}
        </div>
      )}

      {/* Choice Card Overlay for Encounters */}
      <ChoiceCard />

      {/* T3.8 Opening Sequence First Ride Tutorial */}
      {tutorialSignal.value.active && <FirstRideTutorial />}

      {/* T2.4 Uthao Phone & RequestCard */}
      <Phone
        isOpen={phoneSignal.value.open}
        onClose={() => {
          phoneSignal.value = { ...phoneSignal.value, open: false };
        }}
        incomingRequest={phoneSignal.value.incomingRequest}
        timeoutRemaining={phoneSignal.value.timeoutRemaining}
        tripHistory={phoneSignal.value.tripHistory}
        navigationTurn={phoneSignal.value.navigationTurn}
        relationships={phoneSignal.value.relationships}
        onAcceptRequest={(id) => onAcceptRequestCallback?.(id)}
        onDeclineRequest={(id) => onDeclineRequestCallback?.(id)}
        onCallContact={(charId) => onCallContactCallback?.(charId)}
      />

      {/* T2.4 Negotiation Panel (Opens when stopped at pickup) */}
      {negotiationSignal.value.active && negotiationSignal.value.session && (
        <NegotiationPanel
          active={negotiationSignal.value.active}
          bikeSpeed={hudSignal.value.speedKmh / 3.6}
          session={negotiationSignal.value.session}
          lastResult={negotiationSignal.value.lastResult}
          onAction={(action) => onNegotiationActionCallback?.(action)}
          onClose={() => {
            negotiationSignal.value = { ...negotiationSignal.value, active: false };
          }}
        />
      )}

      {/* T4.1 Day End Screen */}
      {dayEndSignal.value.active && (
        <DayEnd
          summary={dayEndSignal.value.summary}
          onSleep={() => onSleepCallback?.()}
          onDelayRent={() => onDelayRentCallback?.()}
          onAskAdvance={(from, amount) => onAskAdvanceCallback?.(from, amount)}
        />
      )}

      {/* T5.5 Ending Screen */}
      {endingSignal.value.active && endingSignal.value.result && (
        <Ending
          result={endingSignal.value.result}
          choices={endingSignal.value.choices}
          onSelectChoice={(choice) => onSelectCareerChoiceCallback?.(choice)}
          onRestartCareer={() => {
            endingSignal.value = { ...endingSignal.value, active: false };
            onRestartCareerCallback?.();
          }}
          onEnterEndless={() => {
            endingSignal.value = { ...endingSignal.value, active: false };
            onEnterEndlessCallback?.();
          }}
          onMainMenu={() => {
            endingSignal.value = { ...endingSignal.value, active: false };
            screenSignal.value = 'title';
          }}
          onClose={() => {
            endingSignal.value = { ...endingSignal.value, active: false };
          }}
        />
      )}

      {/* T4.4 Garage Screen */}
      {(garageSignal.value.open || screenSignal.value === 'garage') && (
        <Garage
          isOpen={true}
          atKamalBhai={garageSignal.value.atKamalBhai}
          kamalRelationship={garageSignal.value.kamalRelationship}
          cash={garageSignal.value.cash}
          engineCondition={garageSignal.value.engineCondition}
          tiresCondition={garageSignal.value.tiresCondition}
          brakesCondition={garageSignal.value.brakesCondition}
          kmSinceOilChange={garageSignal.value.kmSinceOilChange}
          ownedUpgrades={garageSignal.value.ownedUpgrades}
          installedCosmetics={garageSignal.value.installedCosmetics}
          onRepair={(item) => onRepairCallback?.(item)}
          onBuyUpgrade={(upgradeId) => onBuyUpgradeCallback?.(upgradeId)}
          onClose={() => {
            garageSignal.value = { ...garageSignal.value, open: false };
            if (screenSignal.value === 'garage') {
              screenSignal.value = 'game';
            }
          }}
        />
      )}

      {/* T3.10 Main Menu */}
      {screenSignal.value === 'title' && (
        <MainMenu
          onNewCareer={() => {
            screenSignal.value = 'game';
            onStartNewCareerCallback?.();
          }}
          onContinue={() => {
            screenSignal.value = 'game';
            onContinueCareerCallback?.();
          }}
          onEndless={() => {
            screenSignal.value = 'game';
            onStartEndlessCallback?.();
          }}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {/* T3.10 Pause Screen */}
      {screenSignal.value === 'pause' && (
        <Pause
          isOpen={true}
          onResume={() => {
            screenSignal.value = 'game';
            pausedSignal.value = false;
            onResumeGameCallback?.();
          }}
          onOpenMap={() => {
            screenSignal.value = 'map';
          }}
          onOpenSettings={() => setShowSettings(true)}
          onExitToMainMenu={() => {
            screenSignal.value = 'title';
            pausedSignal.value = false;
          }}
        />
      )}

      {/* T3.10 Dhaka Map Screen */}
      {screenSignal.value === 'map' && (
        <MapScreen
          isOpen={true}
          onSetWaypoint={(nodeId) => onSetWaypointCallback?.(nodeId)}
          onClose={() => {
            screenSignal.value = 'game';
          }}
        />
      )}

      {/* T3.10 Settings Modal */}
      {showSettings && (
        <Settings
          isOpen={true}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* PWA Install Button for Android / Chrome */}
      {installPromptSignal.value && (
        <button
          data-testid="pwa-install-btn"
          onClick={() => void promptPwaInstall()}
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            border: 'none',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '9999px',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
            pointerEvents: 'auto',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>📲</span> Install App
        </button>
      )}
    </div>
  );
}
