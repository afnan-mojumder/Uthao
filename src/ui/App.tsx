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
  choiceSignal,
  Z_LAYER,
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
  const settingsCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      // Show rotate overlay if screen height > screen width and width < 900 (mobile/tablet portrait)
      const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
      rotateOverlaySignal.value = isPortrait;
    };

    const hasBlockingOverlay = (except?: 'garage' | 'journal' | 'map') =>
      showSettingsRef.current ||
      saveSlotsSignal.value.isOpen ||
      choiceSignal.value.active ||
      negotiationSignal.value.active ||
      dayEndSignal.value.active ||
      endingSignal.value.active ||
      tripSummarySignal.value !== null ||
      tutorialSignal.value.active ||
      phoneSignal.value.open ||
      (except !== 'garage' && garageSignal.value.open) ||
      (except !== 'journal' && journalSignal.value);

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
      if (pressed(bound.garage) && screenSignal.value === 'game') {
        if (garageSignal.value.open && !hasBlockingOverlay('garage')) {
          garageSignal.value = { ...garageSignal.value, open: false };
        } else if (!uiModalOpen(showSettingsRef.current)) {
          garageSignal.value = { ...garageSignal.value, open: true };
        }
      }
      if (pressed(bound.map)) {
        if (screenSignal.value === 'map' && !hasBlockingOverlay('map')) {
          screenSignal.value = 'game';
        } else if (screenSignal.value === 'game' && !uiModalOpen(showSettingsRef.current)) {
          screenSignal.value = 'map';
        }
      }
      if (pressed(bound.journal) && screenSignal.value === 'game') {
        if (journalSignal.value && !hasBlockingOverlay('journal')) {
          journalSignal.value = false;
        } else if (!uiModalOpen(showSettingsRef.current)) {
          journalSignal.value = true;
        }
      }
      if (pressed(bound.mute) && screenSignal.value === 'game' && !uiModalOpen(showSettingsRef.current)) {
        toggleMute();
      }
      if (pressed(bound.pause)) {
        // Close the innermost open panel first, then fall through to pause.
        if (showSettingsRef.current) {
          if (settingsCancelRef.current) {
            settingsCancelRef.current();
          } else {
            setShowSettings(false);
          }
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

  const layerStyle = (zIndex: number) => ({
    position: 'fixed' as const,
    inset: 0,
    pointerEvents: 'none' as const,
    zIndex,
  });

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
      {/* 1. HUD layer: Paused Indicator */}
      {pausedSignal.value && (
        <div
          data-testid="pause-indicator"
          style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: Z_LAYER.HUD,
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

      {/* 2. Touch layer: H-17 touch controls */}
      {isTouchDevice() && screenSignal.value === 'game' && (
        <div style={layerStyle(Z_LAYER.TOUCH)}>
          <TouchActions />
        </div>
      )}

      {/* 3. Toast / Banner layer: impact banner & PWA install */}
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
            zIndex: Z_LAYER.TOAST,
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
            zIndex: Z_LAYER.TOAST,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>📲</span> Install App
        </button>
      )}

      {/* 4. Panel layer */}
      {phoneSignal.value.open && (
        <div style={layerStyle(Z_LAYER.PANEL)}>
          <Phone
            isOpen={true}
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
        </div>
      )}

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

      {negotiationSignal.value.active && negotiationSignal.value.session && (
        <div style={layerStyle(Z_LAYER.PANEL)}>
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
        </div>
      )}

      {(garageSignal.value.open || screenSignal.value === 'garage') && (
        <div style={layerStyle(Z_LAYER.PANEL)}>
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
        </div>
      )}

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

      {/* 5. Modal layer */}
      {tutorialSignal.value.active && (
        <div style={layerStyle(Z_LAYER.MODAL)}>
          <FirstRideTutorial />
        </div>
      )}

      {tripSummarySignal.value && (
        <div style={layerStyle(Z_LAYER.MODAL)}>
          <TripSummary
            receipt={tripSummarySignal.value}
            onContinue={() => {
              tripSummarySignal.value = null;
            }}
          />
        </div>
      )}

      <div style={layerStyle(Z_LAYER.MODAL)}>
        <ChoiceCard />
      </div>

      {dayEndSignal.value.active && (
        <div style={layerStyle(Z_LAYER.MODAL)}>
          <DayEnd
            summary={dayEndSignal.value.summary}
            onSleep={() => onSleepCallback?.()}
            onDelayRent={() => onDelayRentCallback?.()}
            onAskAdvance={(from, amount) => onAskAdvanceCallback?.(from, amount)}
          />
        </div>
      )}

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

      {screenSignal.value === 'pause' && (
        <div style={layerStyle(Z_LAYER.MODAL)}>
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
        </div>
      )}

      {/* 6. Critical Modal layer */}
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
            exitToTitle();
          }}
          onClose={() => {
            endingSignal.value = { ...endingSignal.value, active: false };
          }}
        />
      )}

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

      {showSettings && (
        <Settings
          isOpen={true}
          onCancelRef={settingsCancelRef}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 7. System Overlays (render after all modals) */}
      {loadingSignal.value && <Loading />}

      {contextLostSignal.value && (
        <div
          data-testid="context-lost-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: Z_LAYER.SYSTEM_OVERLAY,
            pointerEvents: 'auto',
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

      {rotateOverlaySignal.value && <RotateOverlay />}

      {unsupportedSignal.value && <Unsupported message={unsupportedSignal.value} />}
    </div>
  );
}
