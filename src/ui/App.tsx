import type { JSX } from 'preact';
import './tokens.css';
import { TouchActions, isTouchDevice } from './touch/TouchActions';
import { useState, useEffect, useRef } from 'preact/hooks';
import { Hud } from './hud/Hud';
import { IconPhone } from './components/icons';
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
  onDepositSavingsCallback,
  onWithdrawSavingsCallback,
  onRepayDebtCallback,
  onEndShiftEarlyCallback,
  onAcceptDeliveryCallback,
  deliveryNoticeSignal,
  endShiftBlockedKeySignal,
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
  onRecoverBikeCallback,
  sendPhoneQuickChat,
  tutorialSignal,
  endingSignal,
  onSelectCareerChoiceCallback,
  onRestartCareerCallback,
  onEnterEndlessCallback,
  tripSummarySignal,
  journalSignal,
  mapPlayerPosSignal,
  journalDataSignal,
  karmaPanelSignal,
  karmaDataSignal,
  uiSheetSignal,
  mapNetworkSignal,
  mapWorldSignal,
  mapLiveSignal,
  settingsSignal,
  choiceSignal,
  encounterCueSignal,
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
  saveStatusSignal,
  activeSaveSystemSignal,
  impactSignal,
  saveToSlotFromPanel,
  onLoadGameCallback,
} from './store';
import { FirstRideTutorial } from './tutorial/FirstRideTutorial';
import { TripSummary } from './trip/TripSummary';
import { Journal } from './journal/Journal';
import { KarmaPanel } from './karma/KarmaPanel';
import { UiSheet } from './sheet/UiSheet';
import { t } from './i18n';
import { toggleMute } from './store';
import { getActiveControlsBindings, hasSystemOverlay, startGamepadNav, uiModalOpen } from './gamepadNav';

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

    const hasBlockingOverlay = (except?: 'garage' | 'journal' | 'map' | 'uiSheet' | 'karma') =>
      hasSystemOverlay() ||
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
      (except !== 'journal' && journalSignal.value) ||
      (except !== 'karma' && karmaPanelSignal.value) ||
      (except !== 'uiSheet' && uiSheetSignal.value);

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
      const bound = getActiveControlsBindings().keyboard;
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
      if (pressed(bound.karma) && screenSignal.value === 'game') {
        if (karmaPanelSignal.value && !hasBlockingOverlay('karma')) {
          karmaPanelSignal.value = false;
        } else if (!uiModalOpen(showSettingsRef.current)) {
          karmaPanelSignal.value = true;
        }
      }
      if (pressed(bound.uiSheet) && screenSignal.value === 'game') {
        if (uiSheetSignal.value && !hasBlockingOverlay('uiSheet')) {
          uiSheetSignal.value = false;
        } else if (!uiModalOpen(showSettingsRef.current)) {
          uiSheetSignal.value = true;
        }
      }
      if (pressed(bound.mute) && screenSignal.value === 'game' && !uiModalOpen(showSettingsRef.current)) {
        toggleMute();
      }
      if (pressed(bound.pause)) {
        if (hasSystemOverlay()) return;
        // Close the innermost open panel first, then fall through to pause.
        if (showSettingsRef.current) {
          if (settingsCancelRef.current) {
            settingsCancelRef.current();
          } else {
            setShowSettings(false);
          }
        } else if (saveSlotsSignal.value.isOpen) {
          saveSlotsSignal.value = { ...saveSlotsSignal.value, isOpen: false };
        } else if (
          endingSignal.value.active ||
          dayEndSignal.value.active ||
          tripSummarySignal.value !== null ||
          choiceSignal.value.active ||
          negotiationSignal.value.active
        ) {
          return;
        } else if (uiSheetSignal.value) {
          uiSheetSignal.value = false;
        } else if (karmaPanelSignal.value) {
          karmaPanelSignal.value = false;
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
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', checkOrientation);
        window.removeEventListener('orientationchange', checkOrientation);
        window.removeEventListener('keydown', handleKeyDown);
      }
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
      {/* 1. HUD layer: Riding HUD + Paused Indicator */}
      {screenSignal.value !== 'title' && !loadingSignal.value.active && !unsupportedSignal.value && (
        <div style={layerStyle(Z_LAYER.HUD)}>
          <Hud />
        </div>
      )}

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

      {deliveryNoticeSignal.value.messageKey !== null && (
        <div
          data-testid="delivery-notice-banner"
          role="status"
          style={{
            position: 'absolute',
            top: '25%',
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: Z_LAYER.TOAST,
            padding: '8px 16px',
            borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#f8fafc',
            fontWeight: 700,
          }}
        >
          {t(deliveryNoticeSignal.value.messageKey, deliveryNoticeSignal.value.vars)}
        </div>
      )}

      {encounterCueSignal.value.cueKey !== null && (
        <div
          data-testid="encounter-cue-banner"
          role="status"
          style={{
            position: 'absolute',
            top: '32%',
            left: '50%',
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            zIndex: Z_LAYER.TOAST,
            padding: '8px 16px',
            borderRadius: '10px',
            background: 'rgba(127, 29, 29, 0.9)',
            border: '1px solid rgba(248, 113, 113, 0.5)',
            color: '#fef2f2',
            fontWeight: 700,
          }}
        >
          {t(encounterCueSignal.value.cueKey)}
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
            background: 'linear-gradient(135deg, var(--uthao-green, #22C55E) 0%, #059669 100%)',
            border: 'none',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: '9999px',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)',
            pointerEvents: 'auto',
            zIndex: Z_LAYER.TOAST,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <IconPhone size={18} /> Install App
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
            phoneBattery={phoneSignal.value.phoneBattery}
            incomingRequest={phoneSignal.value.incomingRequest}
            requestQueue={phoneSignal.value.requestQueue}
            timeoutRemaining={phoneSignal.value.timeoutRemaining}
            tripHistory={phoneSignal.value.tripHistory}
            navigationTurn={phoneSignal.value.navigationTurn}
            relationships={phoneSignal.value.relationships}
            availableDeliveries={phoneSignal.value.availableDeliveries}
            activeDeliveries={phoneSignal.value.activeDeliveries}
            earningsSummary={phoneSignal.value.earningsSummary}
            activeRide={phoneSignal.value.activeRide}
            quickChatLog={phoneSignal.value.quickChatLog}
            onAcceptRequest={(id) => onAcceptRequestCallback?.(id)}
            onDeclineRequest={(id) => onDeclineRequestCallback?.(id)}
            onAcceptDelivery={(jobId) => onAcceptDeliveryCallback?.(jobId)}
            onCallContact={(charId) => onCallContactCallback?.(charId)}
            onSendQuickChat={(preset) => sendPhoneQuickChat(preset)}
          />
        </div>
      )}

      {journalSignal.value && journalDataSignal.value && (
        <Journal
          snapshot={journalDataSignal.value.snapshot}
          activeMissions={journalDataSignal.value.activeMissions}
          getObjectiveStates={journalDataSignal.value.getObjectiveStates}
          ownedUpgrades={journalDataSignal.value.ownedUpgrades}
          onClose={() => {
            journalSignal.value = false;
          }}
        />
      )}

      {karmaPanelSignal.value && karmaDataSignal.value && (
        <KarmaPanel
          isOpen={true}
          data={karmaDataSignal.value}
          onClose={() => {
            karmaPanelSignal.value = false;
          }}
        />
      )}

      {uiSheetSignal.value && (
        <UiSheet
          isOpen={true}
          controls={settingsSignal.value.controls ?? getActiveControlsBindings()}
          tiltControls={settingsSignal.value.tiltControls}
          onOpenMap={() => {
            uiSheetSignal.value = false;
            screenSignal.value = 'map';
          }}
          onOpenPhone={() => {
            uiSheetSignal.value = false;
            phoneSignal.value = { ...phoneSignal.value, open: true, unreadCount: 0 };
          }}
          onOpenGarage={() => {
            uiSheetSignal.value = false;
            garageSignal.value = { ...garageSignal.value, open: true };
          }}
          onOpenJournal={() => {
            uiSheetSignal.value = false;
            journalSignal.value = true;
          }}
          onOpenKarma={() => {
            uiSheetSignal.value = false;
            karmaPanelSignal.value = true;
          }}
          onOpenPause={() => {
            uiSheetSignal.value = false;
            pausedSignal.value = true;
            screenSignal.value = 'pause';
          }}
          onOpenSettings={() => {
            uiSheetSignal.value = false;
            setShowSettings(true);
          }}
          onClose={() => {
            uiSheetSignal.value = false;
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
            alley={negotiationSignal.value.alley}
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
          routeNodes={mapLiveSignal.value.routeNodes}
          pickupNodeId={mapLiveSignal.value.pickupNodeId}
          dropoffNodeId={mapLiveSignal.value.dropoffNodeId}
          waypointNodeId={mapLiveSignal.value.waypointNodeId}
          roadEvents={mapLiveSignal.value.activeEvents}
          storyNodeIds={mapLiveSignal.value.storyNodeIds}
          roadNetwork={mapNetworkSignal.value ?? undefined}
          worldData={mapWorldSignal.value ?? undefined}
          colorblindRoute={settingsSignal.value.colorblindRoute}
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
            onDepositSavings={(amount) => onDepositSavingsCallback?.(amount)}
            onWithdrawSavings={(amount) => onWithdrawSavingsCallback?.(amount)}
            onRepayDebt={(amount) => onRepayDebtCallback?.(amount)}
          />
        </div>
      )}

      {screenSignal.value === 'title' && !loadingSignal.value.active && !unsupportedSignal.value && (
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
            onOpenGarage={() => {
              screenSignal.value = 'game';
              pausedSignal.value = false;
              garageSignal.value = { ...garageSignal.value, open: true };
            }}
            onOpenJournal={() => {
              screenSignal.value = 'game';
              pausedSignal.value = false;
              journalSignal.value = true;
            }}
            onRecoverBike={() => {
              onRecoverBikeCallback?.();
            }}
            onOpenSettings={() => setShowSettings(true)}
            onOpenSave={() => {
              saveStatusSignal.value = null;
              saveSlotsSignal.value = { isOpen: true, mode: 'save' };
            }}
            onOpenLoad={() => {
              saveStatusSignal.value = null;
              saveSlotsSignal.value = { isOpen: true, mode: 'load' };
            }}
            onEndShiftEarly={() => onEndShiftEarlyCallback?.()}
            endShiftBlockedKey={endShiftBlockedKeySignal.value}
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
          saveSystem={activeSaveSystemSignal.value ?? undefined}
          onClose={() => {
            saveStatusSignal.value = null;
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
            saveStatusSignal.value = null;
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
      {loadingSignal.value.active && <Loading />}

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
