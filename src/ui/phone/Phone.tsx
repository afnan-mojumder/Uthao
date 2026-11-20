import type { JSX } from 'preact';
import type { DeliveryJob, RideRequest } from '../../core/types';
import { TransactionRow } from '../components';
import {
  IconBattery,
  IconChat,
  IconClose,
  IconPackage,
  IconPhone,
  IconStar,
  IconTurnRight,
  IconUser,
} from '../components/icons';
import { localDigits, t } from '../i18n';
import {
  phoneTabSignal,
  sendPhoneQuickChat,
  type PhoneActiveRideSummary,
  type PhoneEarningsSummary,
  type PhoneQuickChatMsg,
  type QuickChatPreset,
} from '../store';
import { Contacts } from './Contacts';
import { RequestCard } from './RequestCard';

export interface TripHistoryItem {
  requestId: string;
  passengerName: string;
  passengerNameKey?: string;
  fare: number;
  net: number;
  rating?: number;
  timestamp: string;
}

export type PhoneTab = 'requests' | 'history' | 'earnings' | 'contacts' | 'deliveries';

export interface PhoneProps {
  isOpen: boolean;
  onClose: () => void;
  phoneBattery?: number;
  incomingRequest?: RideRequest | null;
  requestQueue?: RideRequest[];
  timeoutRemaining?: number;
  tripHistory?: TripHistoryItem[];
  navigationTurn?: { direction: string; text: string } | null;
  relationships?: Record<string, number>;
  availableDeliveries?: DeliveryJob[];
  activeDeliveries?: DeliveryJob[];
  earningsSummary?: PhoneEarningsSummary;
  activeRide?: PhoneActiveRideSummary | null;
  quickChatLog?: PhoneQuickChatMsg[];
  activeTab?: PhoneTab;
  onSelectTab?: (tab: PhoneTab) => void;
  onAcceptRequest?: (requestId: string) => void;
  onDeclineRequest?: (requestId: string) => void;
  onAcceptDelivery?: (jobId: string) => void;
  onCallContact?: (characterId: string) => void;
  onSendQuickChat?: (preset: QuickChatPreset) => void;
}

const QUICK_CHAT_PRESETS: QuickChatPreset[] = ['on_way', 'arriving', 'main_road', 'traffic'];

export function Phone({
  isOpen,
  onClose,
  phoneBattery = 100,
  incomingRequest,
  requestQueue = [],
  timeoutRemaining = 15,
  tripHistory = [],
  navigationTurn,
  relationships = {},
  availableDeliveries = [],
  activeDeliveries = [],
  earningsSummary,
  activeRide = null,
  quickChatLog = [],
  activeTab: propActiveTab,
  onSelectTab,
  onAcceptRequest,
  onDeclineRequest,
  onAcceptDelivery,
  onCallContact,
  onSendQuickChat,
}: PhoneProps): JSX.Element | null {
  const activeTab = propActiveTab ?? phoneTabSignal.value ?? 'requests';

  const handleSelectTab = (tab: PhoneTab) => {
    phoneTabSignal.value = tab;
    onSelectTab?.(tab);
  };

  if (!isOpen) return null;

  const clampedBattery = Math.max(0, Math.min(100, Math.round(phoneBattery)));
  const batteryColor =
    clampedBattery <= 15 ? '#ef4444' : clampedBattery <= 35 ? '#f59e0b' : '#22c55e';

  const handleQuickChat = (preset: QuickChatPreset) => {
    if (onSendQuickChat) {
      onSendQuickChat(preset);
    } else {
      sendPhoneQuickChat(preset);
    }
  };

  return (
    <div
      data-testid="phone-modal"
      role="dialog"
      aria-modal="true"
      aria-label={t('phone.title')}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        background: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        pointerEvents: 'auto',
      }}
    >
      {/* Smartphone Chassis */}
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          height: 'min(640px, 90dvh)',
          maxHeight: '90dvh',
          background: '#090d16',
          borderRadius: '30px',
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
            padding: '10px 18px 8px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            color: '#94a3b8',
            fontSize: '12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontWeight: 700, color: '#f8fafc' }}>{t('phone.title')}</span>
            <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 700 }}>4G</span>
          </div>

          <div
            data-testid="phone-battery"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: batteryColor,
              fontWeight: 700,
              fontSize: '11px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <IconBattery size={15} level={clampedBattery} />
            <span>{localDigits(clampedBattery)}%</span>
          </div>

          <button
            type="button"
            data-testid="phone-close-btn"
            onClick={onClose}
            aria-label={t('menu.close')}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px 6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Close Phone [Tab/Esc]"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Turn-by-Turn Navigation Bar if active */}
        {navigationTurn && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.15)',
              borderBottom: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#f8fafc',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconTurnRight size={17} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: '10px', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 700 }}>
                {t('phone.navigation')}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{navigationTurn.text}</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.8)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            data-testid="phone-tab-requests"
            onClick={() => handleSelectTab('requests')}
            style={{
              flex: '1 0 auto',
              padding: '10px 8px',
              border: 'none',
              borderBottom: activeTab === 'requests' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'requests' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
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
                  padding: '1px 5px',
                  fontWeight: 800,
                }}
              >
                {localDigits(requestQueue.length > 0 ? requestQueue.length : 1)}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="phone-tab-history"
            onClick={() => handleSelectTab('history')}
            style={{
              flex: '1 0 auto',
              padding: '10px 8px',
              border: 'none',
              borderBottom: activeTab === 'history' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'history' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('phone.tabs.history')}
          </button>

          <button
            type="button"
            data-testid="phone-tab-earnings"
            onClick={() => handleSelectTab('earnings')}
            style={{
              flex: '1 0 auto',
              padding: '10px 8px',
              border: 'none',
              borderBottom: activeTab === 'earnings' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'earnings' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('phone.tabs.earnings')}
          </button>

          <button
            type="button"
            data-testid="phone-tab-contacts"
            onClick={() => handleSelectTab('contacts')}
            style={{
              flex: '1 0 auto',
              padding: '10px 8px',
              border: 'none',
              borderBottom: activeTab === 'contacts' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'contacts' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t('phone.tabs.contacts')}
          </button>

          <button
            type="button"
            data-testid="phone-tab-deliveries"
            onClick={() => handleSelectTab('deliveries')}
            style={{
              flex: '1 0 auto',
              padding: '10px 8px',
              border: 'none',
              borderBottom: activeTab === 'deliveries' ? '2px solid #22c55e' : '2px solid transparent',
              background: 'none',
              color: activeTab === 'deliveries' ? '#22c55e' : '#94a3b8',
              fontWeight: 700,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{t('delivery.tab')}</span>
            {availableDeliveries.length > 0 && (
              <span
                style={{
                  background: '#f59e0b',
                  color: '#0f172a',
                  fontSize: '10px',
                  borderRadius: '10px',
                  padding: '1px 5px',
                  fontWeight: 800,
                }}
              >
                {localDigits(availableDeliveries.length)}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content Area */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: activeTab === 'contacts' ? '0px' : '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {activeTab === 'contacts' ? (
            <Contacts
              relationships={relationships}
              onCallContact={onCallContact}
            />
          ) : activeTab === 'earnings' ? (
            <div data-testid="phone-earnings-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                {t('phone.earnings.title')}
              </span>
              <div
                style={{
                  background: 'rgba(30, 41, 59, 0.65)',
                  borderRadius: '14px',
                  padding: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <TransactionRow
                  label={t('phone.earnings.revenue')}
                  amount={earningsSummary?.todayRevenue ?? 0}
                  kind="income"
                />
                <TransactionRow
                  label={t('phone.earnings.expenses')}
                  amount={earningsSummary?.todayExpenses ?? 0}
                  kind="expense"
                />
                <TransactionRow
                  label={t('phone.earnings.net')}
                  amount={earningsSummary?.todayNet ?? 0}
                  kind="total"
                />
                <TransactionRow
                  label={t('phone.earnings.cash')}
                  amount={earningsSummary?.cash ?? 0}
                  kind="neutral"
                />
                <TransactionRow
                  label={t('phone.earnings.savings')}
                  amount={earningsSummary?.savings ?? 0}
                  kind="income"
                />
                {(earningsSummary?.debt ?? 0) > 0 && (
                  <TransactionRow
                    label={t('phone.earnings.debt')}
                    amount={earningsSummary?.debt ?? 0}
                    kind="expense"
                  />
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '6px',
                    fontSize: '0.9rem',
                  }}
                >
                  <span style={{ color: 'var(--text-secondary, #CBD5E1)' }}>
                    {t('phone.earnings.rides')}
                  </span>
                  <span style={{ color: '#f8fafc', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {localDigits(earningsSummary?.completedRides ?? tripHistory.length)}
                  </span>
                </div>
              </div>
            </div>
          ) : activeTab === 'deliveries' ? (
            <div data-testid="phone-deliveries-list" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {activeDeliveries.map((job) => (
                <div
                  key={job.id}
                  data-testid={`delivery-active-${job.id}`}
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    borderRadius: '12px',
                    padding: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, alignItems: 'center' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <IconPackage size={15} />
                      <span>{t(job.senderNameKey)}</span>
                    </span>
                    <span style={{ color: '#22c55e' }}>৳{localDigits(job.basePayout)}</span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {job.status === 'in_transit' ? t('delivery.in_transit') : t('delivery.accepted_status')} • {job.pickupPlaceKey ? t(job.pickupPlaceKey) : t('phone.unknown_stop')} → {job.dropoffPlaceKey ? t(job.dropoffPlaceKey) : t('phone.unknown_stop')}
                  </div>
                </div>
              ))}
              {availableDeliveries.length === 0 && activeDeliveries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 16px', color: '#64748b', fontSize: '13px' }}>
                  {t('delivery.no_jobs')}
                </div>
              ) : (
                availableDeliveries.map((job) => (
                  <div
                    key={job.id}
                    data-testid={`delivery-offer-${job.id}`}
                    style={{
                      background: 'rgba(30, 41, 59, 0.7)',
                      borderRadius: '12px',
                      padding: '12px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <IconPackage size={15} />
                        <span>{t(job.senderNameKey)}</span>
                      </span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {job.pickupPlaceKey ? t(job.pickupPlaceKey) : t('phone.unknown_stop')} → {job.dropoffPlaceKey ? t(job.dropoffPlaceKey) : t('phone.unknown_stop')}
                        {job.fragile ? ` • ${t('delivery.fragile')}` : ''}
                      </span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#22c55e' }}>
                        {t('delivery.payout', { amount: localDigits(job.basePayout) })}
                      </span>
                    </div>
                    <button
                      type="button"
                      data-testid={`accept-delivery-${job.id}`}
                      onClick={() => onAcceptDelivery?.(job.id)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: '#22c55e',
                        border: 'none',
                        color: '#0f172a',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      {t('delivery.accept')}
                    </button>
                  </div>
                ))
              )}
            </div>
          ) : activeTab === 'requests' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
              {incomingRequest ? (
                <RequestCard
                  request={incomingRequest}
                  timeoutRemaining={timeoutRemaining}
                  onAccept={(id) => onAcceptRequest?.(id)}
                  onDecline={(id) => onDeclineRequest?.(id)}
                />
              ) : activeRide ? (
                <div
                  data-testid="phone-active-ride"
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    borderRadius: '14px',
                    padding: '12px',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <IconUser size={15} />
                    <span>{activeRide.passengerNameKey ? t(activeRide.passengerNameKey) : t('hud.passenger.on_bike')}</span>
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {activeRide.pickupPlaceKey ? t(activeRide.pickupPlaceKey) : t('phone.unknown_stop')} → {activeRide.destinationPlaceKey ? t(activeRide.destinationPlaceKey) : t('phone.unknown_stop')}
                  </span>
                </div>
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
                      color: '#22c55e',
                    }}
                  >
                    <IconPhone size={28} />
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc' }}>
                    {t('phone.no_requests')}
                  </span>
                </div>
              )}

              {(activeRide || incomingRequest) && (
                <div
                  data-testid="phone-quick-chat"
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    borderRadius: '14px',
                    padding: '10px 12px',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                    <IconChat size={13} />
                    <span>{t('phone.quick_chat.title')}</span>
                  </div>

                  {quickChatLog.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '110px', overflowY: 'auto' }}>
                      {quickChatLog.map((msg) => (
                        <div
                          key={msg.id}
                          data-testid="phone-quick-chat-msg"
                          style={{
                            alignSelf: msg.sender === 'rider' ? 'flex-end' : 'flex-start',
                            background: msg.sender === 'rider' ? 'rgba(5, 150, 105, 0.3)' : 'rgba(51, 65, 85, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '10px',
                            padding: '5px 9px',
                            fontSize: '11px',
                            color: '#f8fafc',
                            maxWidth: '88%',
                          }}
                        >
                          {t(msg.textKey)}
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {QUICK_CHAT_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        data-testid={`phone-quick-chat-${preset}`}
                        onClick={() => handleQuickChat(preset)}
                        style={{
                          padding: '5px 8px',
                          borderRadius: '9999px',
                          border: '1px solid rgba(56, 189, 248, 0.35)',
                          background: 'rgba(56, 189, 248, 0.12)',
                          color: '#e0f2fe',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {t(`phone.quick_chat.${preset}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
                tripHistory.map((trip) => {
                  const displayName = trip.passengerNameKey
                    ? t(trip.passengerNameKey)
                    : trip.passengerName;
                  return (
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
                          {displayName}
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{localDigits(trip.timestamp)} •</span>
                          {trip.rating ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: '#fbbf24' }}>
                              <IconStar size={11} />
                              <span>{localDigits(trip.rating)}</span>
                            </span>
                          ) : (
                            <span>{t('phone.history.app_ride')}</span>
                          )}
                        </span>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block', fontSize: '14px', fontWeight: 800, color: '#22c55e' }}>
                          +৳{localDigits(trip.net)}
                        </span>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          {t('phone.history.gross', { fare: localDigits(trip.fare) })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
