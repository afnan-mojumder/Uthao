import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  phoneSignal,
  choiceSignal,
  deliveryNoticeSignal,
  bindEventBusToStore,
  tickPhoneOffers,
  setRequestDispatchers,
  onAcceptRequestCallback,
  onDeclineRequestCallback,
  exitToTitle,
} from '../../../src/ui/store';
import { Phone } from '../../../src/ui/phone/Phone';
import { RequestCard } from '../../../src/ui/phone/RequestCard';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { t, setLanguage } from '../../../src/ui/i18n';
import type { RideRequest } from '../../../src/core/types';

describe('T2.4 Phone Store & Logic', () => {
  beforeEach(() => {
    phoneSignal.value = {
      open: false,
      unreadCount: 0,
      incomingRequest: null,
      timeoutRemaining: 15,
      tripHistory: [],
      navigationTurn: null,
    };
    setLanguage('bn');
  });

  const mockReq: RideRequest = {
    requestId: 'req_001',
    passengerId: 'p_commuter_01',
    pickupNodeId: 'node_farmgate',
    destinationNodeId: 'node_dhanmondi',
    initialFare: 120,
    estimatedDistance: 3.5,
    estimatedDuration: 14,
    requestedArrivalTime: null,
    bookingType: 'app',
    status: 'WaitingForPickup',
    surge: 1.2,
  };

  it('updates phone state on incoming request and open toggle', () => {
    expect(phoneSignal.value.open).toBe(false);
    expect(phoneSignal.value.incomingRequest).toBeNull();

    phoneSignal.value = {
      ...phoneSignal.value,
      incomingRequest: mockReq,
      unreadCount: 1,
      timeoutRemaining: 15,
    };

    expect(phoneSignal.value.incomingRequest?.requestId).toBe('req_001');
    expect(phoneSignal.value.unreadCount).toBe(1);

    // Toggle open
    phoneSignal.value = {
      ...phoneSignal.value,
      open: true,
      unreadCount: 0,
    };
    expect(phoneSignal.value.open).toBe(true);
    expect(phoneSignal.value.unreadCount).toBe(0);
  });

  it('dispatches accept and decline callbacks correctly', () => {
    const mockAccept = vi.fn();
    const mockDecline = vi.fn();

    setRequestDispatchers(mockAccept, mockDecline);

    onAcceptRequestCallback?.('req_001');
    expect(mockAccept).toHaveBeenCalledWith('req_001');

    onDeclineRequestCallback?.('req_001');
    expect(mockDecline).toHaveBeenCalledWith('req_001');
  });

  it('manages trip history in phone state', () => {
    const historyItem = {
      requestId: 'req_done_1',
      passengerName: 'Nabila',
      fare: 150,
      net: 110,
      rating: 5,
      timestamp: '10:30 AM',
    };

    phoneSignal.value = {
      ...phoneSignal.value,
      tripHistory: [historyItem],
    };

    expect(phoneSignal.value.tripHistory.length).toBe(1);
    expect(phoneSignal.value.tripHistory[0]?.passengerName).toBe('Nabila');
    expect(phoneSignal.value.tripHistory[0]?.net).toBe(110);
  });

  it('provides bilingual phone UI translation keys', () => {
    setLanguage('bn');
    expect(t('phone.title')).toBe('উঠাও রাইডার');
    expect(t('phone.accept')).toBe('রাইড গ্রহণ করুন');
    expect(t('phone.decline')).toBe('প্রত্যাখ্যান');

    setLanguage('en');
    expect(t('phone.title')).toBe('Uthao Rider');
    expect(t('phone.accept')).toBe('Accept Ride');
    expect(t('phone.decline')).toBe('Decline');
    expect(t('phone.tabs.contacts')).toBe('Contacts');
    expect(t('phone.contacts.zero_commission')).toBe('0% Commission');
  });

  it('manages contacts and direct booking in phone state', () => {
    phoneSignal.value = {
      ...phoneSignal.value,
      relationships: {
        char_nabila: 25,
        char_mintu: 35,
      },
    };

    expect(phoneSignal.value.relationships?.['char_nabila']).toBe(25);
    expect(phoneSignal.value.relationships?.['char_mintu']).toBe(35);
  });

  it('P4.1 caps phone offer queue at max 3 and ticks timeoutRemaining live until expiry', () => {
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);

    for (let i = 1; i <= 4; i++) {
      bus.emit('ride/requested', {
        request: { ...mockReq, requestId: `req_q_${i}` },
      });
    }

    expect(phoneSignal.value.requestQueue?.map((r) => r.requestId)).toEqual([
      'req_q_2',
      'req_q_3',
      'req_q_4',
    ]);
    expect(phoneSignal.value.incomingRequest?.requestId).toBe('req_q_2');
    expect(phoneSignal.value.timeoutRemaining).toBe(15);

    // Tick 5 seconds -> timeoutRemaining drops to 10
    tickPhoneOffers(5);
    expect(phoneSignal.value.timeoutRemaining).toBeCloseTo(10, 4);

    // Tick 10.5 seconds -> req_q_2 expires, req_q_3 promotes (or all queued offers expire if all aged out)
    tickPhoneOffers(10.5);
    expect(phoneSignal.value.incomingRequest).toBeNull();
    expect(phoneSignal.value.requestQueue).toEqual([]);

    unbind();
  });

  it('P4.1 hides queued offers during active trips and discards cancelled heldRequests', () => {
    choiceSignal.value = { active: false, prompt: '', options: [] };
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);

    // 1. Two offers queued: accept req_act_1 -> Negotiating -> EnRouteToPickup
    bus.emit('ride/requested', { request: { ...mockReq, requestId: 'req_act_1' } });
    bus.emit('ride/requested', { request: { ...mockReq, requestId: 'req_act_2' } });
    expect(phoneSignal.value.incomingRequest?.requestId).toBe('req_act_1');

    bus.emit('trip/state', { requestId: 'req_act_1', from: 'RequestAvailable', to: 'Negotiating' });
    expect(phoneSignal.value.incomingRequest).toBeNull();
    expect(phoneSignal.value.requestQueue?.some((r) => r.requestId === 'req_act_1')).toBe(false);

    // Ticking offers while negotiating / en route must NOT re-expose req_act_2 on screen
    tickPhoneOffers(3);
    expect(phoneSignal.value.incomingRequest).toBeNull();
    expect(phoneSignal.value.unreadCount).toBe(0);

    bus.emit('trip/state', { requestId: 'req_act_1', from: 'Accepted', to: 'EnRouteToPickup' });
    tickPhoneOffers(3);
    expect(phoneSignal.value.incomingRequest).toBeNull();
    expect(phoneSignal.value.unreadCount).toBe(0);

    // Returning to RequestAvailable re-surfaces unexpired req_act_2
    bus.emit('trip/state', { requestId: null, from: 'Completed', to: 'RequestAvailable' });
    expect(phoneSignal.value.incomingRequest?.requestId).toBe('req_act_2');

    // Clear queue cleanly before checking heldRequest cancellation
    tickPhoneOffers(10);
    expect(phoneSignal.value.incomingRequest).toBeNull();

    // 2. Request held under open ChoiceCard is discarded if ride/cancelled fires before card closes
    choiceSignal.value = { active: true, prompt: 'enc.test', options: [{ id: 'a', text: 'opt' }], instanceId: 'enc_1' };
    bus.emit('ride/requested', { request: { ...mockReq, requestId: 'req_held_expired' } });
    bus.emit('ride/cancelled', { requestId: 'req_held_expired', by: 'system', reason: 'expired' });
    choiceSignal.value = { active: false, prompt: '', options: [] };
    expect(phoneSignal.value.incomingRequest).toBeNull();

    unbind();
  });

  it('P4.2 review: renders localized delivery place names and shows feedback on delivery/damaged', () => {
    setLanguage('en');
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);

    bus.emit('delivery/offered', {
      delivery: {
        id: 'deliv_ui_1',
        senderNameKey: 'poi.mirpara.tea_stall',
        pickupPoiId: 'poi_mirpara_tea_stall',
        pickupNodeId: 'res_n2_1',
        dropoffNodeId: 'res_n3_0',
        pickupPlaceKey: 'poi.mirpara.tea_stall',
        dropoffPlaceKey: 'poi.mirpara.bazaar',
        itemType: 'fragile_electronics',
        fragile: true,
        basePayout: 200,
        timeLimitMinutes: 20,
        status: 'offered',
      },
    });
    bus.emit('delivery/accepted', { deliveryId: 'deliv_ui_1' });

    const vnode = Phone({
      isOpen: true,
      onClose: vi.fn(),
      activeTab: 'deliveries',
      availableDeliveries: phoneSignal.value.availableDeliveries,
      activeDeliveries: phoneSignal.value.activeDeliveries,
    });
    const html = JSON.stringify(vnode);
    expect(html).toContain("Mintu's Tea Stall");
    expect(html).toContain('Mirpara Kacha Bazaar');
    expect(html).not.toContain('res_n2_1');
    expect(html).not.toContain('res_n3_0');

    bus.emit('delivery/damaged', { deliveryId: 'deliv_ui_1', reason: 'Parcel damaged in bike bump' });
    expect(deliveryNoticeSignal.value.messageKey).toBe('delivery.damaged');
    expect(deliveryNoticeSignal.value.vars?.penalty).toBe(120);

    exitToTitle();
    expect(deliveryNoticeSignal.value.messageKey).toBeNull();
    unbind();
  });

  it('P6.2: heldRequest cancellation clears unreadCount when queue is empty and RequestCard shows localized places & risk badges', () => {
    setLanguage('en');
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);

    choiceSignal.value = { active: true, prompt: 'enc.test', options: [{ id: 'a', text: 'opt' }], instanceId: 'enc_2' };
    bus.emit('ride/requested', {
      request: {
        ...mockReq,
        requestId: 'req_held_unread',
        pickupPlaceKey: 'poi.mirpara.tea_stall',
        destinationPlaceKey: 'poi.mirpara.bazaar',
      },
    });
    expect(phoneSignal.value.unreadCount).toBe(1);
    bus.emit('ride/cancelled', { requestId: 'req_held_unread', by: 'system', reason: 'expired' });
    expect(phoneSignal.value.unreadCount).toBe(0);
    choiceSignal.value = { active: false, prompt: '', options: [] };
    expect(phoneSignal.value.unreadCount).toBe(0);

    const cardVnode = RequestCard({
      request: {
        ...mockReq,
        pickupPlaceKey: 'poi.mirpara.tea_stall',
        destinationPlaceKey: 'poi.mirpara.bazaar',
        surge: 1.35,
        specialCircumstance: 'rain',
      },
      timeoutRemaining: 10,
      onAccept: vi.fn(),
      onDecline: vi.fn(),
    });
    const html = JSON.stringify(cardVnode);
    expect(html).toContain("Mintu's Tea Stall");
    expect(html).toContain('Mirpara Kacha Bazaar');
    expect(html).not.toContain('node_farmgate');
    expect(html).not.toContain('node_dhanmondi');
    expect(html).toContain('request-timeout-bar');
    expect(html).toContain('request-risk-badges');

    const phoneEarningsVnode = Phone({
      isOpen: true,
      onClose: vi.fn(),
      activeTab: 'earnings',
      phoneBattery: 76,
      earningsSummary: {
        cash: 650,
        savings: 400,
        debt: 0,
        todayRevenue: 300,
        todayExpenses: 50,
        todayNet: 250,
        completedRides: 3,
        rating: 4.9,
      },
    });
    const phoneHtml = JSON.stringify(phoneEarningsVnode);
    expect(phoneHtml).toContain('phone-battery');
    expect(phoneHtml).toContain('phone-earnings-panel');
    expect(phoneHtml).toContain('650');

    unbind();
  });
});
