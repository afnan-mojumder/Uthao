import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import {
  rotateOverlaySignal,
  unsupportedSignal,
  loadingSignal,
  contextLostSignal,
  pausedSignal,
  hudSignal,
  isMapOpenSignal,
  isPhoneOpenSignal,
  isJournalOpenSignal,
  isStoryModalOpenSignal,
  isShowcaseModalOpenSignal,
  activeCrimeEncounterSignal,
  activePoliceCaseSignal,
  activeAccidentSignal,
  daySummarySignal,
  conductSignal,
} from './store';
import { RotateOverlay } from './overlays/RotateOverlay';
import { Unsupported } from './overlays/Unsupported';
import { Loading } from './overlays/Loading';
import { RidingHud } from './hud/RidingHud';
import { DistrictMap } from './map/DistrictMap';
import { UthaoPhone } from './phone/UthaoPhone';
import { DangerAlert } from './encounters/DangerAlert';
import { PoliceEncounterModal } from './encounters/PoliceEncounterModal';
import { AccidentModal } from './encounters/AccidentModal';
import { ConsequenceJournal } from './journal/ConsequenceJournal';
import { DaySummaryModal } from './menus/DaySummaryModal';
import { StoryRelationshipsModal } from './story/StoryRelationshipsModal';
import { ComponentShowcaseModal } from './showcase/ComponentShowcaseModal';
import { VirtualTouchControls } from './touch/VirtualTouchControls';
import { PoliceEncounterSystem } from '../sim/darkChoices/PoliceEncounterSystem';
import { CrimeEncounterSystem } from '../sim/darkChoices/CrimeEncounterSystem';
import { AccidentManager } from '../sim/darkChoices/AccidentManager';

const policeSystem = new PoliceEncounterSystem();
const crimeSystem = new CrimeEncounterSystem();
const accidentManager = new AccidentManager();

export function App(): JSX.Element {
  useEffect(() => {
    const checkOrientation = () => {
      if (typeof window === 'undefined') return;
      const isPortrait = window.innerHeight > window.innerWidth && window.innerWidth < 900;
      rotateOverlaySignal.value = isPortrait;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        isMapOpenSignal.value = !isMapOpenSignal.value;
      } else if (e.key === 'Tab') {
        e.preventDefault();
        isPhoneOpenSignal.value = !isPhoneOpenSignal.value;
      } else if (e.key === 'j' || e.key === 'J') {
        isJournalOpenSignal.value = !isJournalOpenSignal.value;
      } else if (e.key === 's' || e.key === 'S') {
        isStoryModalOpenSignal.value = !isStoryModalOpenSignal.value;
      } else if (e.key === 'u' || e.key === 'U') {
        isShowcaseModalOpenSignal.value = !isShowcaseModalOpenSignal.value;
      } else if (e.key === 'Escape') {
        if (isMapOpenSignal.value) isMapOpenSignal.value = false;
        else if (isPhoneOpenSignal.value) isPhoneOpenSignal.value = false;
        else if (isJournalOpenSignal.value) isJournalOpenSignal.value = false;
        else if (isStoryModalOpenSignal.value) isStoryModalOpenSignal.value = false;
        else if (isShowcaseModalOpenSignal.value) isShowcaseModalOpenSignal.value = false;
        else pausedSignal.value = !pausedSignal.value;
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

  const conduct = conductSignal.value;

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
      {/* 1. Riding HUD Panel (Low-Poly Dhaka Street HUD) */}
      <RidingHud
        speedKmh={hudSignal.value.speedKmh}
        fuelPct={hudSignal.value.fuelPct}
        todaysNet={hudSignal.value.todaysNet}
        currentDistrict={hudSignal.value.currentDistrict}
        timeString={hudSignal.value.timeString}
        passenger={hudSignal.value.passenger}
        navigation={hudSignal.value.navigation ?? {
          instruction: 'Free Roam · Looking for ride requests',
          distanceText: '0 km',
          etaText: 'Active',
        }}
        onToggleMap={() => {
          isMapOpenSignal.value = !isMapOpenSignal.value;
        }}
        onToggleCamera={() => {
          if (typeof window !== 'undefined') {
            const win = window as unknown as { __uthao?: Record<string, () => void> };
            win.__uthao?.toggleCamera?.();
          }
        }}
        onOpenMenu={() => {
          isJournalOpenSignal.value = !isJournalOpenSignal.value;
        }}
        onOpenPhone={() => {
          isPhoneOpenSignal.value = true;
        }}
      />

      {/* Mobile & Touch On-Screen Controls */}
      <VirtualTouchControls
        onHorn={() => {
          if (typeof window !== 'undefined') {
            const win = window as unknown as { __uthao?: Record<string, () => void> };
            win.__uthao?.soundHorn?.();
          }
        }}
      />

      {/* 2. District Map Pause Menu (Dhaka Map) */}
      {isMapOpenSignal.value && (
        <DistrictMap
          onClose={() => {
            isMapOpenSignal.value = false;
          }}
          onSetGps={(_poiId, name) => {
            hudSignal.value = {
              ...hudSignal.value,
              objectiveText: `Navigate to ${name}`,
            };
          }}
        />
      )}

      {/* 3. Uthao Phone & Ride Negotiation Modal */}
      {isPhoneOpenSignal.value && (
        <UthaoPhone
          onAccept={(fare, isOffApp) => {
            isPhoneOpenSignal.value = false;
            if (isOffApp) {
              conduct.executeDarkAction('off_app_ride', 1, 720, 'p_nabila', Math.round(fare * 0.2));
            }
            hudSignal.value = {
              ...hudSignal.value,
              todaysNet: hudSignal.value.todaysNet + fare,
              objectiveText: `Drop off Nabila at Dhanmondi 27 (Fare: ৳${fare})`,
            };
          }}
          onDecline={() => {
            isPhoneOpenSignal.value = false;
          }}
        />
      )}

      {/* 4. Danger Alert / Alley Robbery Encounter Modal */}
      {activeCrimeEncounterSignal.value && (
        <DangerAlert
          encounter={activeCrimeEncounterSignal.value}
          onSelectOption={(responseId) => {
            if (activeCrimeEncounterSignal.value) {
              crimeSystem.resolveEncounter(
                activeCrimeEncounterSignal.value.encounterId,
                responseId,
                conduct,
                1,
                800
              );
              activeCrimeEncounterSignal.value = null;
            }
          }}
        />
      )}

      {/* 5. Traffic Police & Bribery Encounter Modal */}
      {activePoliceCaseSignal.value && (
        <PoliceEncounterModal
          policeCase={activePoliceCaseSignal.value}
          onPayFine={() => {
            if (activePoliceCaseSignal.value) {
              policeSystem.payOfficialFine(activePoliceCaseSignal.value.caseId, conduct, 1, 700);
              activePoliceCaseSignal.value = null;
            }
          }}
          onAttemptBribe={(amount) => {
            if (activePoliceCaseSignal.value) {
              const res = policeSystem.attemptBribe(activePoliceCaseSignal.value.caseId, amount, conduct, 1, 700);
              if (res.outcome === 'accepted') {
                activePoliceCaseSignal.value = null;
              }
            }
          }}
          onContest={() => {
            if (activePoliceCaseSignal.value) {
              const res = policeSystem.contestCase(activePoliceCaseSignal.value.caseId, conduct);
              if (res.dismissed) {
                activePoliceCaseSignal.value = null;
              }
            }
          }}
          onAcceptWarning={() => {
            if (activePoliceCaseSignal.value) {
              policeSystem.acceptWarning(activePoliceCaseSignal.value.caseId, conduct);
              activePoliceCaseSignal.value = null;
            }
          }}
          onFlee={() => {
            if (activePoliceCaseSignal.value) {
              policeSystem.fleeCheckpoint(activePoliceCaseSignal.value.caseId, conduct, 1, 700);
              activePoliceCaseSignal.value = null;
            }
          }}
        />
      )}

      {/* 6. Accident Response Modal */}
      {activeAccidentSignal.value && (
        <AccidentModal
          accident={activeAccidentSignal.value}
          onCheckVictims={() => {
            if (activeAccidentSignal.value) {
              accidentManager.respondToAccident(activeAccidentSignal.value.accidentId, 'checked_victims', conduct, 1, 750);
              activeAccidentSignal.value = null;
            }
          }}
          onCallEmergency={() => {
            if (activeAccidentSignal.value) {
              accidentManager.respondToAccident(activeAccidentSignal.value.accidentId, 'emergency_services', conduct, 1, 750);
              activeAccidentSignal.value = null;
            }
          }}
          onSettleCash={() => {
            if (activeAccidentSignal.value) {
              accidentManager.respondToAccident(activeAccidentSignal.value.accidentId, 'settled_cash', conduct, 1, 750);
              activeAccidentSignal.value = null;
            }
          }}
          onFleeHitAndRun={() => {
            if (activeAccidentSignal.value) {
              accidentManager.respondToAccident(activeAccidentSignal.value.accidentId, 'evaded_fled', conduct, 1, 750);
              activeAccidentSignal.value = null;
            }
          }}
        />
      )}

      {/* 7. Consequence & Integrity Dossier Journal */}
      {isJournalOpenSignal.value && (
        <ConsequenceJournal
          conduct={conduct.getConduct()}
          onClose={() => {
            isJournalOpenSignal.value = false;
          }}
        />
      )}

      {/* 8. Day Summary Accounting Screen */}
      {daySummarySignal.value && (
        <DaySummaryModal
          accounting={daySummarySignal.value}
          onSleepNextDay={() => {
            daySummarySignal.value = null;
          }}
        />
      )}

      {/* 9. Story & Relationships Screen */}
      <StoryRelationshipsModal
        isOpen={isStoryModalOpenSignal.value}
        onClose={() => {
          isStoryModalOpenSignal.value = false;
        }}
      />

      {/* 10-14. Component Library & Reference Sheet Showcase Modal */}
      <ComponentShowcaseModal
        isOpen={isShowcaseModalOpenSignal.value}
        onClose={() => {
          isShowcaseModalOpenSignal.value = false;
        }}
      />

      {/* Quick Launch Floating Ribbon (Top-Right) */}
      <div
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          display: 'flex',
          gap: '8px',
          zIndex: 9000,
          pointerEvents: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => {
            isShowcaseModalOpenSignal.value = !isShowcaseModalOpenSignal.value;
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-emerald-500/50 text-emerald-400 font-bold text-xs shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          title="Toggle Component Reference Sheet [U]"
        >
          <span>🎨</span>
          <span>UI Sheet [U]</span>
        </button>

        <button
          type="button"
          onClick={() => {
            isStoryModalOpenSignal.value = !isStoryModalOpenSignal.value;
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-pink-500/50 text-pink-400 font-bold text-xs shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          title="Toggle Story & Relationships [S]"
        >
          <span>👥</span>
          <span>Story [S]</span>
        </button>

        <button
          type="button"
          onClick={() => {
            isJournalOpenSignal.value = !isJournalOpenSignal.value;
          }}
          className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-sky-500/50 text-sky-400 font-bold text-xs shadow-lg backdrop-blur-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
          title="Toggle Consequence Journal [J]"
        >
          <span>⚖️</span>
          <span>Karma [J]</span>
        </button>
      </div>

      {/* System Overlays */}
      {unsupportedSignal.value && <Unsupported message={unsupportedSignal.value} />}
      {rotateOverlaySignal.value && <RotateOverlay />}
      {loadingSignal.value && <Loading />}

      {/* Context Lost Overlay */}
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
              গ্রাফিক্স বিচ্ছিন্ন হয়েছে। পুনরায় চালু হচ্ছে...
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
          বিরতি (Paused)
        </div>
      )}
    </div>
  );
}
