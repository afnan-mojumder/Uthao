import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { TripReceipt } from '../../core/types';
import { ModalPanel, PrimaryButton, TransactionRow } from '../components';
import {
  IconBell,
  IconCheck,
  IconClock,
  IconFlag,
  IconFuel,
  IconMapPin,
  IconMotorcycle,
  IconPhone,
  IconShield,
  IconSkip,
  IconTrophy,
  IconUser,
  IconWrench,
} from '../components/icons';
import { localDigits, t } from '../i18n';
import {
  hudSignal,
  onTutorialAdvanceCallback,
  onTutorialCompleteCallback,
  onTutorialNegotiateCallback,
  onTutorialSkipCallback,
  tutorialSignal,
  Z_LAYER,
  type TutorialStep,
} from '../store';

export interface FirstRideTutorialProps {
  step?: TutorialStep;
  cash?: number;
  fuelL?: number;
  conditionPct?: number;
  rentTarget?: number;
  receipt?: TripReceipt | null;
  ridingTipKey?: string;
  onAdvance?: (nextStep: TutorialStep) => void;
  onNegotiate?: (fare: number) => void;
  onComplete?: () => void;
  onSkip?: () => void;
}

export interface FirstRideTutorialViewProps extends FirstRideTutorialProps {
  selectedOffer: number;
  agreedPrompt: string;
  onSelectOffer: (fare: number) => void;
  onSetAgreedPrompt: (prompt: string) => void;
}

const TUTORIAL_BACKDROP = {
  background: 'rgba(2, 6, 23, 0.42)',
  backdropFilter: 'blur(3px)',
} as const;

const TUTORIAL_STEP_NUM: Partial<Record<TutorialStep, number>> = {
  alarm: 1,
  ma_reminder: 2,
  wallet_check: 3,
  bike_inspection: 4,
  tea_stall: 5,
  open_app: 6,
  negotiation: 7,
  receipt: 8,
};

function TutorialHeader({
  icon,
  title,
  meta,
  stepNum,
  accentColor,
  onSkip,
}: {
  icon: JSX.Element;
  title: string;
  meta: string;
  stepNum?: number;
  accentColor: string;
  onSkip?: () => void;
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        paddingBottom: '10px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: accentColor, fontWeight: 700 }}>
        {icon}
        <span>{title}</span>
        {stepNum !== undefined && (
          <span
            style={{
              fontSize: '0.72rem',
              padding: '2px 7px',
              borderRadius: '999px',
              background: 'rgba(148, 163, 184, 0.16)',
              color: '#cbd5e1',
              fontWeight: 700,
            }}
          >
            {localDigits(stepNum)}/{localDigits(8)}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{meta}</span>
        <button
          type="button"
          data-testid="tutorial-btn-skip"
          onClick={onSkip}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 10px',
            borderRadius: '8px',
            border: '1px solid rgba(148, 163, 184, 0.35)',
            background: 'rgba(15, 23, 42, 0.65)',
            color: '#cbd5e1',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <IconSkip size={12} />
          <span>{t('tutorial.skip')}</span>
        </button>
      </div>
    </div>
  );
}

export function FirstRideTutorialView(props: FirstRideTutorialViewProps): JSX.Element | null {
  const currentStep = props.step ?? tutorialSignal.value.step;
  const advance = props.onAdvance ?? onTutorialAdvanceCallback ?? undefined;
  const negotiate = props.onNegotiate ?? onTutorialNegotiateCallback ?? undefined;
  const complete = props.onComplete ?? onTutorialCompleteCallback ?? undefined;
  const skip = props.onSkip ?? onTutorialSkipCallback ?? complete;

  if (currentStep === 'idle' || currentStep === 'completed') {
    return null;
  }

  const liveCash = Math.round(props.cash ?? tutorialSignal.value.cash ?? 600);
  const liveFuelL = props.fuelL ?? tutorialSignal.value.fuelL ?? 1.2;
  const liveConditionPct = Math.round(props.conditionPct ?? tutorialSignal.value.conditionPct ?? 80);
  const liveRentTarget = Math.round(props.rentTarget ?? tutorialSignal.value.rentTarget ?? 1200);
  const liveReceipt = props.receipt ?? tutorialSignal.value.receipt ?? null;

  // 1. Alarm Screen
  if (currentStep === 'alarm') {
    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.alarm.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconClock size={18} />}
          title={t('tutorial.alarm.title')}
          meta={`${t('hud.day', { day: localDigits(1) })} • ${localDigits('07:00')}`}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#22c55e"
          onSkip={skip}
        />
        <div style={{ padding: '12px 0', textAlign: 'center' }}>
          <div style={{ fontSize: '3.2rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '2px', marginBottom: '8px' }}>
            {localDigits('07:00')} <span style={{ fontSize: '1.3rem', color: '#f59e0b' }}>{t('tutorial.alarm.am')}</span>
          </div>
          <p style={{ margin: '0 0 22px 0', color: '#cbd5e1', fontSize: '1rem', lineHeight: '1.5' }}>
            {t('tutorial.alarm.desc')}
          </p>
          <PrimaryButton
            type="button"
            data-testid="tutorial-btn-alarm"
            data-autofocus="true"
            onClick={() => advance?.('ma_reminder')}
            style={{ width: '100%' }}
          >
            <IconBell size={18} />
            <span>{t('tutorial.alarm.btn')}</span>
          </PrimaryButton>
        </div>
      </ModalPanel>
    );
  }

  // 2. Ma's Reminder
  if (currentStep === 'ma_reminder') {
    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.ma.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconUser size={18} />}
          title={t('tutorial.ma.title')}
          meta={t('character.ma.name')}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#f59e0b"
          onSkip={skip}
        />
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '14px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 700, marginBottom: '6px' }}>
            {t('character.ma.name')}:
          </div>
          <p style={{ margin: 0, color: '#f1f5f9', fontSize: '1rem', lineHeight: '1.6' }}>
            "{t('tutorial.ma.msg')}"
          </p>
        </div>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
          ৳{localDigits(liveRentTarget)} — {t('hud.day', { day: localDigits(3) })}
        </div>
        <PrimaryButton
          type="button"
          data-testid="tutorial-btn-ma"
          data-autofocus="true"
          onClick={() => advance?.('wallet_check')}
          style={{ width: '100%' }}
        >
          <IconCheck size={18} />
          <span>{t('tutorial.ma.btn')}</span>
        </PrimaryButton>
      </ModalPanel>
    );
  }

  // 3. Wallet Check (live cash & rent target)
  if (currentStep === 'wallet_check') {
    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.wallet.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconShield size={18} />}
          title={t('tutorial.wallet.title')}
          meta={t('dayend.wallet')}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#38bdf8"
          onSkip={skip}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '14px',
              padding: '14px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#7dd3fc', fontWeight: 600, marginBottom: '4px' }}>
              {t('phone.earnings.cash')}
            </div>
            <div data-testid="tutorial-wallet-cash" style={{ fontSize: '1.7rem', fontWeight: 800, color: '#38bdf8' }}>
              ৳{localDigits(liveCash)}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '14px',
              padding: '14px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#fca5a5', fontWeight: 600, marginBottom: '4px' }}>
              {t('tutorial.wallet.rent_due', { day: localDigits(3) })}
            </div>
            <div data-testid="tutorial-wallet-rent" style={{ fontSize: '1.7rem', fontWeight: 800, color: '#ef4444' }}>
              ৳{localDigits(liveRentTarget)}
            </div>
          </div>
        </div>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.5' }}>
          {t('tutorial.wallet.msg')}
        </p>
        <PrimaryButton
          type="button"
          data-testid="tutorial-btn-wallet"
          data-autofocus="true"
          onClick={() => advance?.('bike_inspection')}
          style={{ width: '100%' }}
        >
          <IconMotorcycle size={18} />
          <span>{t('tutorial.wallet.btn')}</span>
        </PrimaryButton>
      </ModalPanel>
    );
  }

  // 4. Motorcycle Inspection (live fuelL & conditionPct)
  if (currentStep === 'bike_inspection') {
    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.bike.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconMotorcycle size={18} />}
          title={t('tutorial.bike.title')}
          meta={`${localDigits(100)}cc`}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#f59e0b"
          onSkip={skip}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
          <div
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '14px',
              padding: '14px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#fcd34d', fontWeight: 600, marginBottom: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <IconFuel size={14} />
              <span>{t('hud.fuel')}</span>
            </div>
            <div data-testid="tutorial-bike-fuel" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>
              {localDigits(liveFuelL.toFixed(1))} L
            </div>
          </div>

          <div
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '14px',
              padding: '14px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: '#86efac', fontWeight: 600, marginBottom: '4px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <IconWrench size={14} />
              <span>{t('hud.condition')}</span>
            </div>
            <div data-testid="tutorial-bike-condition" style={{ fontSize: '1.6rem', fontWeight: 800, color: '#22c55e' }}>
              {localDigits(liveConditionPct)}%
            </div>
          </div>
        </div>
        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.5' }}>
          {t('tutorial.bike.msg')}
        </p>
        <PrimaryButton
          type="button"
          data-testid="tutorial-btn-bike"
          data-autofocus="true"
          onClick={() => advance?.('tea_stall')}
          style={{ width: '100%' }}
        >
          <IconPlayArrow />
          <span>{t('tutorial.bike.btn')}</span>
        </PrimaryButton>
      </ModalPanel>
    );
  }

  // 5. Tea Stall Dialogue (Mintu)
  if (currentStep === 'tea_stall') {
    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.tea_stall.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconUser size={18} />}
          title={t('tutorial.tea_stall.title')}
          meta={t('poi.mirpara.tea_stall')}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#10b981"
          onSkip={skip}
        />
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: '14px',
            padding: '16px',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 700, marginBottom: '6px' }}>
            {t('character.mintu.name')}:
          </div>
          <p style={{ margin: 0, color: '#f1f5f9', fontSize: '1rem', lineHeight: '1.6' }}>
            "{t('tutorial.tea_stall.msg')}"
          </p>
        </div>
        <PrimaryButton
          type="button"
          data-testid="tutorial-btn-tea-stall"
          data-autofocus="true"
          onClick={() => advance?.('open_app')}
          style={{ width: '100%' }}
        >
          <IconPhone size={18} />
          <span>{t('tutorial.tea_stall.btn')}</span>
        </PrimaryButton>
      </ModalPanel>
    );
  }

  // 6. Incoming Ride Request (Nabila)
  if (currentStep === 'open_app') {
    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.nabila.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconBell size={18} />}
          title={t('tutorial.nabila.title')}
          meta={t('menu.title')}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#22c55e"
          onSkip={skip}
        />
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '14px',
            padding: '16px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
                {t('character.nabila.name')}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{t('tutorial.nabila.intro')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#f59e0b' }}>
                ৳{localDigits(80)}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: '0.9rem' }}>
            <span style={{ color: '#22c55e', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <IconMapPin size={14} /> {t('phone.pickup')}:
            </span>
            <span style={{ color: '#e2e8f0' }}>{t('poi.mirpara.clinic')}</span>
            <span style={{ color: '#ef4444', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <IconFlag size={14} /> {t('phone.destination')}:
            </span>
            <span style={{ color: '#e2e8f0' }}>{t('poi.mirpara.campus_gate')}</span>
          </div>
        </div>
        <PrimaryButton
          type="button"
          data-testid="tutorial-btn-open-request"
          data-autofocus="true"
          onClick={() => advance?.('negotiation')}
          style={{ width: '100%' }}
        >
          <span>{t('tutorial.nabila.open_btn')}</span>
        </PrimaryButton>
      </ModalPanel>
    );
  }

  // 7. Negotiation Tutorial
  if (currentStep === 'negotiation') {
    const handlePickFare = (fare: number) => {
      props.onSelectOffer(fare);
      props.onSetAgreedPrompt(t('tutorial.nabila.accepted'));
      negotiate?.(fare);
    };

    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.nego.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconShield size={18} />}
          title={t('tutorial.nego.title')}
          meta={t('tutorial.nego.passenger_label')}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#f59e0b"
          onSkip={skip}
        />
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.08)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '14px',
            padding: '14px',
          }}
        >
          <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 700, marginBottom: '4px' }}>
            {t('tutorial.nego.offer_label')}
          </div>
          <div style={{ fontSize: '1rem', color: '#f8fafc', fontWeight: 600 }}>
            {t('tutorial.nabila.dialogue')}
          </div>
        </div>

        {props.agreedPrompt ? (
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.1)',
              border: '1px solid rgba(34, 197, 94, 0.35)',
              borderRadius: '14px',
              padding: '14px',
            }}
          >
            <div style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: 700, marginBottom: '4px' }}>
              {t('tutorial.nego.agreed_label', { fare: localDigits(props.selectedOffer ?? 0) })}
            </div>
            <div style={{ fontSize: '0.95rem', color: '#f8fafc', fontWeight: 600 }}>
              "{props.agreedPrompt}"
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="button"
              data-testid="tutorial-nego-counter-100"
              data-autofocus="true"
              onClick={() => handlePickFare(100)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontWeight: 800 }}>৳{localDigits(100)}</span> — {t('tutorial.nabila.counter_100')}
            </button>

            <button
              type="button"
              data-testid="tutorial-nego-counter-90"
              onClick={() => handlePickFare(90)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#f59e0b',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontWeight: 800 }}>৳{localDigits(90)}</span> — {t('tutorial.nabila.counter_90')}
            </button>

            <button
              type="button"
              data-testid="tutorial-nego-accept-80"
              onClick={() => handlePickFare(80)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'rgba(148, 163, 184, 0.1)',
                color: '#cbd5e1',
                fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontWeight: 800 }}>৳{localDigits(80)}</span> — {t('tutorial.nabila.accept_80')}
            </button>

            <button
              type="button"
              disabled
              aria-disabled="true"
              data-testid="tutorial-nego-decline-disabled"
              style={{
                padding: '9px 14px',
                borderRadius: '12px',
                border: '1px dashed rgba(148, 163, 184, 0.25)',
                background: 'rgba(15, 23, 42, 0.4)',
                color: '#64748b',
                fontSize: '0.82rem',
                fontWeight: 600,
                textAlign: 'left',
                cursor: 'not-allowed',
                opacity: 0.65,
              }}
            >
              {t('tutorial.nabila.decline_example')}
            </button>
          </div>
        )}

        <PrimaryButton
          type="button"
          data-testid="tutorial-btn-start-ride"
          data-autofocus="true"
          disabled={!props.agreedPrompt}
          onClick={() => advance?.('riding')}
          style={{ width: '100%' }}
        >
          <IconMotorcycle size={18} />
          <span>{t('tutorial.nego.start_ride')}</span>
        </PrimaryButton>
      </ModalPanel>
    );
  }

  // 8. Riding Phase (Floating HUD Banner)
  if (currentStep === 'riding') {
    return (
      <div
        data-testid="tutorial-overlay"
        style={{
          position: 'fixed',
          top: '16px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: Z_LAYER.HUD + 20,
          width: '92%',
          maxWidth: '640px',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(34, 197, 94, 0.4)',
          borderRadius: '16px',
          padding: '12px 16px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(34, 197, 94, 0.15)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
          color: '#f8fafc',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '180px' }}>
          <IconMotorcycle size={22} color="#22c55e" />
          <div>
            <div style={{ fontSize: '0.82rem', color: '#22c55e', fontWeight: 700 }}>
              {t('character.nabila.name')} • ৳{localDigits(props.selectedOffer)}
            </div>
            <div style={{ fontSize: '0.85rem', color: '#e2e8f0' }}>
              {t(props.ridingTipKey ?? 'tutorial.riding.tip')}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            data-testid="tutorial-btn-skip"
            onClick={skip}
            style={{
              padding: '8px 10px',
              borderRadius: '10px',
              border: '1px solid rgba(148, 163, 184, 0.35)',
              background: 'rgba(15, 23, 42, 0.65)',
              color: '#cbd5e1',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('tutorial.skip')}
          </button>
          <PrimaryButton
            type="button"
            data-testid="tutorial-btn-arrive-destination"
            onClick={() => advance?.('receipt')}
            style={{ padding: '8px 14px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
          >
            <IconFlag size={14} />
            <span>{t('poi.mirpara.campus_gate')}</span>
          </PrimaryButton>
        </div>
      </div>
    );
  }

  // 9. Receipt Explained Phase (with live fuel cost)
  if (currentStep === 'receipt') {
    const gross = Math.round(liveReceipt?.fare ?? props.selectedOffer);
    const commission = Math.round(liveReceipt?.commission ?? gross * 0.15);
    const fuelCost = Math.round(liveReceipt?.fuelCost ?? 14);
    const net = Math.round(liveReceipt?.net ?? gross - commission - fuelCost);

    return (
      <ModalPanel testId="tutorial-overlay" ariaLabel={t('tutorial.receipt.title')} maxWidth="540px" zIndex={9520} backdropStyle={TUTORIAL_BACKDROP}>
        <TutorialHeader
          icon={<IconTrophy size={18} />}
          title={t('tutorial.receipt.title')}
          meta={t('trip.summary.title')}
          stepNum={TUTORIAL_STEP_NUM[currentStep]}
          accentColor="#22c55e"
          onSkip={skip}
        />
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <TransactionRow label={t('tutorial.receipt.gross')} amount={gross} kind="income" />
          <TransactionRow label={t('tutorial.receipt.commission')} amount={commission} kind="expense" />
          <TransactionRow
            testId="tutorial-receipt-fuel"
            label={t('tutorial.receipt.fuel')}
            amount={fuelCost}
            kind="expense"
          />
          <TransactionRow label={t('tutorial.receipt.net')} amount={net} kind="total" />
        </div>

        <p style={{ margin: 0, color: '#cbd5e1', fontSize: '0.92rem', lineHeight: '1.5' }}>
          {t('tutorial.receipt.desc')}
        </p>

        <PrimaryButton
          type="button"
          data-testid="tutorial-btn-finish-receipt"
          data-autofocus="true"
          onClick={() => complete?.()}
          style={{ width: '100%' }}
        >
          <IconCheck size={18} />
          <span>{t('tutorial.receipt.btn')}</span>
        </PrimaryButton>
      </ModalPanel>
    );
  }

  return null;
}

function IconPlayArrow(): JSX.Element {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="6 3 20 12 6 21 6 3" />
    </svg>
  );
}

export function FirstRideTutorial(props: FirstRideTutorialProps): JSX.Element | null {
  const [selectedOffer, setSelectedOffer] = useState<number>(
    () => tutorialSignal.value.agreedFare ?? 100
  );
  const [agreedPrompt, setAgreedPrompt] = useState<string>('');
  const paxStatus = hudSignal.value.passengerStatus?.status;
  const ridingTipKey =
    props.ridingTipKey ??
    (paxStatus === 'Accepted' || paxStatus === 'RiderEnRoute'
      ? 'tutorial.riding.pickup_tip'
      : paxStatus === 'AtPickup' || paxStatus === 'OnTrip'
        ? 'tutorial.riding.dropoff_tip'
        : 'tutorial.riding.tip');

  return (
    <FirstRideTutorialView
      {...props}
      ridingTipKey={ridingTipKey}
      selectedOffer={selectedOffer}
      agreedPrompt={agreedPrompt}
      onSelectOffer={setSelectedOffer}
      onSetAgreedPrompt={setAgreedPrompt}
    />
  );
}
