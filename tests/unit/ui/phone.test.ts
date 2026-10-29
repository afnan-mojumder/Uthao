import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  phoneSignal,
  setRequestDispatchers,
  onAcceptRequestCallback,
  onDeclineRequestCallback,
} from '../../../src/ui/store';
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
    expect(t('phone.title')).toBe('উধাও রাইডার');
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
});
