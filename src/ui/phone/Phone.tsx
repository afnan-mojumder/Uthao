import type { JSX } from 'preact';
import type { RideRequest } from '../../core/types';
import { RequestCard } from './RequestCard';
import { Contacts } from './Contacts';
import { t } from '../i18n';
import { phoneTabSignal } from '../store';

export interface TripHistoryItem {
  requestId: string;
  passengerName: string;
  fare: number;
  net: number;
  rating?: number;
  timestamp: string;
}

export interface PhoneProps {
  isOpen: boolean;
  onClose: () => void;
  incomingRequest?: RideRequest | null;
  timeoutRemaining?: number;
  tripHistory?: TripHistoryItem[];
  navigationTurn?: { direction: string; text: string } | null;
  relationships?: Record<string, number>;
  activeTab?: 'requests' | 'history' | 'contacts';
  onSelectTab?: (tab: 'requests' | 'history' | 'contacts') => void;
  onAcceptRequest?: (requestId: string) => void;
  onDeclineRequest?: (requestId: string) => void;
  onCallContact?: (characterId: string) => void;
}

export function Phone({
  isOpen,
  onClose,
  incomingRequest,
  timeoutRemaining = 15,
  tripHistory = [],
  navigationTurn,
  relationships = {},
  activeTab: propActiveTab,
  onSelectTab,
  onAcceptRequest,
  onDeclineRequest,
  onCallContact,
}: PhoneProps): JSX.Element | null {
  const activeTab = propActiveTab ?? phoneTabSignal.value ?? 'requests';

  const handleSelectTab = (tab: 'requests' | 'history' | 'contacts') => {
    phoneTabSignal.value = tab;
    onSelectTab?.(tab);
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="phone-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: 'auto',
      }}
    >
      {/* Smartphone Chassis */}
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          height: '620px',
          maxHeight: '90vh',
          background: '#090d16',
          borderRadius: '36px',
          border: '4px solid #1e293b',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), inset 0 0 10px rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top Speaker Bezel & Status Bar */}
        <div
          style={{
            padding: '12px 20px 8px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#94a3b8',
            fontSize: '12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, color: '#f8fafc' }}>Uthao</span>
            <span style={{ fontSize: '10px', color: '#22c55e' }}>● 4G</span>
          </div>

          <div
            style={{
              width: '60px',
              height: '5px',
              background: '#334155',
              borderRadius: '3px',
            }}
          />

          <button
            type="button"
            data-testid="phone-close-btn"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '2px 6px',
            }}
            title="Close Phone [Tab/Esc]"
          >
            ✕
          </button>
        </div>

        {/* Turn-by-Turn Navigation Bar if active */}
        {navigationTurn && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              color: '#f8fafc',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 800,
              }}
            >
              ↱
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>
                {t('phone.navigation')}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{navigationTurn.text}</span>
            </div>
          </div>
        )}

        {/* Tab Navigation: Requests vs History */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.8)',
          }}
        >
          <button
            type="button"
            data-testid="phone-tab-requests"
            onClick={() => handleSelectTab('requests')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              borderBottom: activeTab === 'requests' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'requests' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>{t('phone.tabs.requests')}</span>
            {incomingRequest && (
              <span
                style={{
                  background: '#22c55e',
                  color: '#0f172a',
                  fontSize: '10px',
                  borderRadius: '10px',
                  padding: '1px 6px',
                  fontWeight: 800,
                }}
              >
                1
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="phone-tab-history"
            onClick={() => handleSelectTab('history')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'history' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {t('phone.tabs.history')}
          </button>

          <button
            type="button"
            data-testid="phone-tab-contacts"
            onClick={() => handleSelectTab('contacts')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              borderBottom: activeTab === 'contacts' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'contacts' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {t('phone.tabs.contacts')}
          </button>
        </div>

        {/* Tab Content Area */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: activeTab === 'contacts' ? '0px' : '16px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {activeTab === 'contacts' ? (
            <Contacts
              relationships={relationships}
              onCallContact={onCallContact}
            />
          ) : activeTab === 'requests' ? (
            incomingRequest ? (
              <RequestCard
                request={incomingRequest}
                timeoutRemaining={timeoutRemaining}
                onAccept={(id) => onAcceptRequest?.(id)}
                onDecline={(id) => onDeclineRequest?.(id)}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  color: '#94a3b8',
                  gap: '12px',
                  padding: '24px',
                }}
              >
                <div
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(34, 197, 94, 0.1)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                  }}
                >
                  📡
                </div>
                <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                  {t('phone.no_requests')}
                </span>
              </div>
            )
          ) : (
            /* History Tab */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                {t('phone.trip_history_title')}
              </span>

              {tripHistory.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b', fontSize: '13px' }}>
                  {t('phone.no_history')}
                </div>
              ) : (
                tripHistory.map((trip) => (
                  <div
                    key={trip.requestId}
                    style={{
                      background: 'rgba(30, 41, 59, 0.6)',
                      borderRadius: '12px',
                      padding: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                        {trip.passengerName}
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {trip.timestamp} • {trip.rating ? `★ ${trip.rating}` : 'App Ride'}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', fontSize: '14px', fontWeight: 800, color: '#22c55e' }}>
                        +৳{trip.net}
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b' }}>
                        Gross: ৳{trip.fare}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
