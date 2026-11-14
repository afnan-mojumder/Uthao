import type { JSX } from 'preact';
import { TouchActions, isTouchDevice } from './touch/TouchActions';
import { useState, useEffect, useRef } from 'preact/hooks';
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
  onBuyBikeCallback,
  onSwitchBikeCallback,
  onStartNewCareerCallback,
  onContinueCareerCallback,
  hasSaveCallback,
  exitToTitle,
  onStartEndlessCallback,
  onResumeGameCallback,
  onSetWaypointCallback,
  onCallContactCallback,
  tutorialSignal,
  endingSignal,
  onSelectCareerChoiceCallback,
  onRestartCareerCallback,
  onEnterEndlessCallback,
  tripSummarySignal,
  journalSignal,
  mapPlayerPosSignal,
  journalDataSignal,
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
import { SaveSlots } from './menus/SaveSlots';
import {
  saveSlotsSignal,
  impactSignal,
  saveToSlotFromPanel,
  onLoadGameCallback,
} from './store';
import { FirstRideTutorial } from './tutorial/FirstRideTutorial';
import { TripSummary } from './trip/TripSummary';
import { Journal } from './journal/Journal';
import { t } from './i18n';
import { loadBindings } from '../input/bindings';
import { toggleMute } from './store';
import { startGamepadNav, uiModalOpen } from './gamepadNav';

export function App(): JSX.Element {
  const [showSettings, setShowSettings] = useState(false);
  // Keyboard and gamepad listeners are attached once, so they read the live
  // value through this ref rather than a stale closure.
  const showSettingsRef = useRef(showSettings);
  showSettingsRef.current = showSettings;
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      // Show rotate overlay if screen height > screen width and width < 900 (mobile/tablet portrait)
      const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
      rotateOverlaySignal.value = isPortrait;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Never take keys from text fields.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Hotkeys follow the bindings config, matched by key code (audit: hotkeys ignored it).
      const bound = loadBindings().keyboard;
      const pressed = (codes: string[]) => codes.includes(e.code);
      if (pressed(bound.phone)) {
        // Tab opens the phone only while driving. In menus and modals, and
        // with the phone already open, Tab moves focus like any other key.
        if (!uiModalOpen(showSettingsRef.current, { ignoreTutorial: true })) {
          e.preventDefault();
          phoneSignal.value = { ...phoneSignal.value, open: true };
        }
        return;
      }
      if (pressed(bound.garage)) {
        garageSignal.value = {
          ...garageSignal.value,
          open: !garageSignal.value.open,
        };
      }
      if (pressed(bound.map)) {
        if (screenSignal.value === 'map') {
          screenSignal.value = 'game';
        } else if (screenSignal.value === 'game') {
          screenSignal.value = 'map';
        }
      }
      if (pressed(bound.journal)) {
        journalSignal.value = !journalSignal.value;
      }
      if (pressed(bound.mute)) toggleMute();
      if (pressed(bound.pause)) {
        // Close the innermost open panel first, then fall through to pause.
        if (showSettingsRef.current) {
          setShowSettings(false);
        } else if (saveSlotsSignal.value.isOpen) {
          saveSlotsSignal.value = { ...saveSlotsSignal.value, isOpen: false };
        } else if (garageSignal.value.open) {
          garageSignal.value = { ...garageSignal.value, open: false };
          if (screenSignal.value === 'garage') screenSignal.value = 'game';
        } else if (journalSignal.value) {
          journalSignal.value = false;
        } else if (phoneSignal.value.open) {
          phoneSignal.value = { ...phoneSignal.value, open: false };
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
    const stopGamepad = startGamepadNav(() => showSettingsRef.current);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
      window.removeEventListener('keydown', handleKeyDown);
      stopGamepad();
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

      {/* T7.4: Trip Summary — Continue is the only way to dismiss it. */}
      {tripSummarySignal.value && (
        <TripSummary
          receipt={tripSummarySignal.value}
          onContinue={() => {
            tripSummarySignal.value = null;
          }}
        />
      )}

      {/* T7.4: Rider Journal, toggled by the 'j' key */}
      {journalSignal.value && journalDataSignal.value && (
        <Journal
          snapshot={journalDataSignal.value.snapshot}
          activeMissions={journalDataSignal.value.activeMissions}
          getObjectiveStates={journalDataSignal.value.getObjectiveStates}
          onClose={() => {
            journalSignal.value = false;
          }}
        />
      )}

      {/* Audit H-4: a wobble or a collision is shown to the rider. */}
      {impactSignal.value.kind !== null && (
        <div
          data-testid="impact-banner"
          role="status"
          style={{
            position: 'absolute',
            top: '18%',
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: 9100,
            padding: '8px 16px',
            borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.85)',
            color: impactSignal.value.kind === 'crash' ? '#fca5a5' : '#fde68a',
            fontWeight: 700,
          }}
        >
          {t(`impact.${impactSignal.value.kind}`)}
        </div>
      )}
      {/* H-17: touch players get pause, map, phone, horn and camera; zones are drawn. */}
      {isTouchDevice() && screenSignal.value === 'game' && <TouchActions />}

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

      {/* T2.4 Negotiation Panel (opens as soon as an offer is accepted, before pickup) */}
      {negotiationSignal.value.active && negotiationSignal.value.session && (
        <NegotiationPanel
          active={negotiationSignal.value.active}
          session={negotiationSignal.value.session}
          lastResult={negotiationSignal.value.lastResult}
          mood={negotiationSignal.value.mood}
          pickup={negotiationSignal.value.pickup}
          destinationKey={negotiationSignal.value.destinationKey}
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
          savings={garageSignal.value.savings}
          currentBikeId={garageSignal.value.currentBikeId}
          ownedBikes={garageSignal.value.ownedBikes}
          engineCondition={garageSignal.value.engineCondition}
          tiresCondition={garageSignal.value.tiresCondition}
          brakesCondition={garageSignal.value.brakesCondition}
          kmSinceOilChange={garageSignal.value.kmSinceOilChange}
          ownedUpgrades={garageSignal.value.ownedUpgrades}
          installedCosmetics={garageSignal.value.installedCosmetics}
          onRepair={(item) => onRepairCallback?.(item)}
          onBuyUpgrade={(upgradeId) => onBuyUpgradeCallback?.(upgradeId)}
          onBuyBike={(bikeId, useTradeIn) => onBuyBikeCallback?.(bikeId, useTradeIn)}
          onSwitchBike={(bikeId) => onSwitchBikeCallback?.(bikeId)}
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
          hasSave={hasSaveCallback?.() ?? false}
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
          onOpenSave={() => {
            saveSlotsSignal.value = { isOpen: true, mode: 'save' };
          }}
          onOpenLoad={() => {
            saveSlotsSignal.value = { isOpen: true, mode: 'load' };
          }}
          onExitToMainMenu={() => exitToTitle()}
        />
      )}

      {/* T3.10 Dhaka Map Screen */}
      {screenSignal.value === 'map' && (
        <MapScreen
          isOpen={true}
          playerPos={mapPlayerPosSignal.value}
          onSetWaypoint={(nodeId) => onSetWaypointCallback?.(nodeId)}
          onClose={() => {
            screenSignal.value = 'game';
          }}
        />
      )}

      {/* T4.9 Save Slots Modal */}
      {saveSlotsSignal.value.isOpen && (
        <SaveSlots
          isOpen={true}
          mode={saveSlotsSignal.value.mode}
          onClose={() => {
            saveSlotsSignal.value = { ...saveSlotsSignal.value, isOpen: false };
          }}
          onSelectSlot={(slot) => {
            if (saveSlotsSignal.value.mode === 'save') {
              // A failed save keeps the panel open so the failure message shows.
              if (!saveToSlotFromPanel(slot)) return;
            } else {
              onLoadGameCallback?.(slot);
              screenSignal.value = 'game';
              pausedSignal.value = false;
            }
            saveSlotsSignal.value = { ...saveSlotsSignal.value, isOpen: false };
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
