import type { JSX } from 'preact';
import { ModalPanel, SecondaryButton } from '../components';
import {
  IconGamepad,
  IconMap,
  IconPause,
  IconPhone,
  IconScroll,
  IconSettings,
  IconShield,
  IconWrench,
} from '../components/icons';
import { loadBindings } from '../../input/bindings';
import type { InputBindings, KeyboardBindings } from '../../input/types';
import { t } from '../i18n';
import { settingsSignal, Z_LAYER } from '../store';

export interface UiSheetProps {
  isOpen?: boolean;
  controls?: InputBindings;
  tiltControls?: boolean;
  onOpenMap: () => void;
  onOpenPhone: () => void;
  onOpenGarage: () => void;
  onOpenJournal: () => void;
  onOpenKarma: () => void;
  onOpenPause: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
  zIndex?: number;
}

const DRIVING_ACTIONS: Array<keyof KeyboardBindings> = [
  'throttle',
  'brake',
  'steerLeft',
  'steerRight',
  'horn',
  'camera',
];

const PANEL_ACTIONS: Array<keyof KeyboardBindings> = [
  'uiSheet',
  'map',
  'phone',
  'garage',
  'journal',
  'karma',
  'pause',
  'mute',
];

/** Formats an input key code list into compact human-readable keycaps. */
export function formatKeyCodes(codes: readonly string[] | undefined): string {
  if (!codes || codes.length === 0) return t('sheet.unbound');
  return codes
    .map((code) => {
      if (code.startsWith('Key')) return code.slice(3);
      if (code.startsWith('Digit')) return code.slice(5);
      if (code === 'Space') return 'Space';
      if (code === 'Escape') return 'Esc';
      if (code === 'ArrowUp') return '↑';
      if (code === 'ArrowDown') return '↓';
      if (code === 'ArrowLeft') return '←';
      if (code === 'ArrowRight') return '→';
      return code;
    })
    .join(' / ');
}

/** Unified U-key sheet linking all city panels and displaying live keybindings. */
export function UiSheet({
  isOpen = true,
  controls,
  tiltControls,
  onOpenMap,
  onOpenPhone,
  onOpenGarage,
  onOpenJournal,
  onOpenKarma,
  onOpenPause,
  onOpenSettings,
  onClose,
  zIndex = Z_LAYER.PANEL,
}: UiSheetProps) {
  if (!isOpen) return null;

  const activeControls = controls ?? settingsSignal.value.controls ?? loadBindings();
  const kb = activeControls.keyboard;
  const tiltEnabled = tiltControls ?? settingsSignal.value.tiltControls;

  const quickLinks: Array<{
    id: string;
    label: string;
    shortcut?: string;
    icon: JSX.Element;
    onClick: () => void;
  }> = [
    {
      id: 'map',
      label: t('sheet.link.map'),
      shortcut: formatKeyCodes(kb.map),
      icon: <IconMap size={18} color="#38BDF8" />,
      onClick: onOpenMap,
    },
    {
      id: 'phone',
      label: t('sheet.link.phone'),
      shortcut: formatKeyCodes(kb.phone),
      icon: <IconPhone size={18} color="#4ADE80" />,
      onClick: onOpenPhone,
    },
    {
      id: 'garage',
      label: t('sheet.link.garage'),
      shortcut: formatKeyCodes(kb.garage),
      icon: <IconWrench size={18} color="#F59E0B" />,
      onClick: onOpenGarage,
    },
    {
      id: 'journal',
      label: t('sheet.link.journal'),
      shortcut: formatKeyCodes(kb.journal),
      icon: <IconScroll size={18} color="#A78BFA" />,
      onClick: onOpenJournal,
    },
    {
      id: 'karma',
      label: t('sheet.link.karma'),
      shortcut: formatKeyCodes(kb.karma),
      icon: <IconShield size={18} color="#FB7185" />,
      onClick: onOpenKarma,
    },
    {
      id: 'pause',
      label: t('sheet.link.pause'),
      shortcut: formatKeyCodes(kb.pause),
      icon: <IconPause size={18} color="#CBD5E1" />,
      onClick: onOpenPause,
    },
    {
      id: 'settings',
      label: t('sheet.link.settings'),
      icon: <IconSettings size={18} color="#94A3B8" />,
      onClick: onOpenSettings,
    },
  ];

  const renderControlGroup = (title: string, actions: Array<keyof KeyboardBindings>) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div
        style={{
          fontSize: '12px',
          fontWeight: 700,
          color: 'var(--uthao-text-muted, #94A3B8)',
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
          gap: '6px',
        }}
      >
        {actions.map((action) => (
          <div
            key={action}
            data-testid={`sheet-control-${action}`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 10px',
              borderRadius: '8px',
              backgroundColor: 'rgba(30, 41, 59, 0.58)',
              border: '1px solid rgba(148, 163, 184, 0.14)',
              fontSize: '12px',
            }}
          >
            <span style={{ color: '#E2E8F0' }}>
              {t(`settings.controls.action.${action}`)}
            </span>
            <kbd
              style={{
                padding: '2px 7px',
                borderRadius: '6px',
                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                color: '#FCD34D',
                fontWeight: 700,
                fontSize: '11px',
                whiteSpace: 'nowrap',
              }}
            >
              {formatKeyCodes(kb[action])}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <ModalPanel
      testId="ui-sheet"
      title={t('sheet.title')}
      subtitle={t('sheet.subtitle')}
      onClose={onClose}
      closeLabel={t('btn_close')}
      zIndex={zIndex}
      maxWidth="min(640px, 94vw)"
      panelStyle={{ maxHeight: '90dvh', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Navigation Quick Links */}
        <section data-testid="sheet-nav-grid">
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--uthao-text-muted, #94A3B8)',
              marginBottom: '8px',
            }}
          >
            {t('sheet.links_title')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))',
              gap: '8px',
            }}
          >
            {quickLinks.map((link) => (
              <SecondaryButton
                key={link.id}
                testId={`sheet-link-${link.id}`}
                onClick={link.onClick}
                style={{
                  justifyContent: 'space-between',
                  padding: '10px 12px',
                  fontSize: '13px',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  {link.icon}
                  <span>{link.label}</span>
                </span>
                {link.shortcut && (
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '1px 6px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(15, 23, 42, 0.75)',
                      color: '#CBD5E1',
                    }}
                  >
                    {link.shortcut}
                  </span>
                )}
              </SecondaryButton>
            ))}
          </div>
        </section>

        {/* Live Controls Reference */}
        <section data-testid="sheet-controls-section" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--uthao-text-muted, #94A3B8)',
              }}
            >
              <IconGamepad size={15} />
              <span>{t('sheet.controls_title')}</span>
            </div>
            <span
              data-testid="sheet-tilt-status"
              style={{ fontSize: '12px', color: tiltEnabled ? '#4ADE80' : '#94A3B8', fontWeight: 600 }}
            >
              {t('sheet.tilt_label')}: {tiltEnabled ? t('sheet.tilt_on') : t('sheet.tilt_off')}
            </span>
          </div>

          {renderControlGroup(t('sheet.controls_driving'), DRIVING_ACTIONS)}
          {renderControlGroup(t('sheet.controls_panels'), PANEL_ACTIONS)}
        </section>
      </div>
    </ModalPanel>
  );
}
