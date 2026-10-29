import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  garageSignal,
  setGarageDispatchers,
  setBikeDispatchers,
  onRepairCallback,
  onBuyUpgradeCallback,
  onBuyBikeCallback,
  onSwitchBikeCallback,
} from '../../../src/ui/store';
import { Garage } from '../../../src/ui/garage/Garage';
import { t, setLanguage } from '../../../src/ui/i18n';

describe('T4.4 & T5.6 Garage Screen & UI Store', () => {
  beforeEach(() => {
    garageSignal.value = {
      open: false,
      atKamalBhai: true,
      kamalRelationship: 0,
      currentBikeId: 'old100',
      ownedBikes: ['old100'],
    };
    setLanguage('bn');
  });

  it('updates garageSignal state', () => {
    expect(garageSignal.value.open).toBe(false);
    expect(garageSignal.value.kamalRelationship).toBe(0);

    garageSignal.value = {
      open: true,
      atKamalBhai: true,
      kamalRelationship: 25,
      currentBikeId: 'used125',
      ownedBikes: ['old100', 'used125'],
    };

    expect(garageSignal.value.open).toBe(true);
    expect(garageSignal.value.atKamalBhai).toBe(true);
    expect(garageSignal.value.kamalRelationship).toBe(25);
    expect(garageSignal.value.currentBikeId).toBe('used125');
  });

  it('dispatches garage actions: repair, buyUpgrade, buyBike, switchBike', () => {
    const mockRepair = vi.fn();
    const mockBuyUpgrade = vi.fn();
    const mockBuyBike = vi.fn();
    const mockSwitchBike = vi.fn();

    setGarageDispatchers(mockRepair, mockBuyUpgrade);
    setBikeDispatchers(mockBuyBike, mockSwitchBike);

    onRepairCallback?.('engine');
    expect(mockRepair).toHaveBeenCalledWith('engine');

    onBuyUpgradeCallback?.('upgrade_good_tires');
    expect(mockBuyUpgrade).toHaveBeenCalledWith('upgrade_good_tires');

    onBuyBikeCallback?.('used125', true);
    expect(mockBuyBike).toHaveBeenCalledWith('used125', true);

    onSwitchBikeCallback?.('old100');
    expect(mockSwitchBike).toHaveBeenCalledWith('old100');
  });

  it('provides bilingual Garage strings in English and Bengali', () => {
    setLanguage('bn');
    expect(t('garage.title')).toBe('কমল ভাইয়ের ওয়ার্কশপ');
    expect(t('garage.kamal_discount_badge')).toBe('কমল ভাইয়ের আস্থা: ২০% ডিসকাউন্ট চালু!');
    expect(t('garage.tab_repairs')).toBe('মেরামত ও রক্ষণাবেক্ষণ');
    expect(t('garage.tab_upgrades')).toBe('পারফরম্যান্স আপগ্রেড');
    expect(t('garage.tab_bikes')).toBe('বাইক ও শোরুম');
    expect(t('bike.old100.name')).toBe('রানার দায়াং ১০০সিসি');
    expect(t('bike.used125.name')).toBe('বাজাজ ডিসকভার ১২৫সিসি (ব্যবহৃত)');
    expect(t('bike.new150.name')).toBe('ইয়ামাহা এফজেডএস ১৫০সিসি (নতুন)');

    setLanguage('en');
    expect(t('garage.title')).toBe("Kamal Bhai's Workshop");
    expect(t('garage.kamal_discount_badge')).toBe('Kamal Bhai Trust: 20% Discount Active!');
    expect(t('garage.tab_repairs')).toBe('Repairs & Maintenance');
    expect(t('garage.tab_upgrades')).toBe('Performance Upgrades');
    expect(t('garage.tab_bikes')).toBe('Bikes & Dealership');
    expect(t('bike.old100.name')).toBe('Runner Dayang 100cc');
    expect(t('bike.used125.name')).toBe('Bajaj Discover 125cc (Used)');
    expect(t('bike.new150.name')).toBe('Yamaha FZS 150cc (Brand New)');
  });

  it('returns null when garage is not open', () => {
    const vnode = Garage({
      isOpen: false,
    });
    expect(vnode).toBeNull();
  });

  it('renders Garage vnode tree with condition stats and actions when open', () => {
    const onRepair = vi.fn();
    const onBuyUpgrade = vi.fn();
    const onClose = vi.fn();

    const vnode = Garage({
      isOpen: true,
      atKamalBhai: true,
      kamalRelationship: 25,
      cash: 800,
      engineCondition: 60,
      tiresCondition: 45,
      brakesCondition: 50,
      kmSinceOilChange: 40,
      ownedUpgrades: [],
      onRepair,
      onBuyUpgrade,
      onClose,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('garage-screen');

    // Upgrade tab rendering
    const upgradeVnode = Garage({
      isOpen: true,
      activeTab: 'upgrades',
      ownedUpgrades: ['upgrade_good_tires'],
    });
    expect(upgradeVnode).not.toBeNull();

    // Cosmetics tab rendering
    const cosmeticsVnode = Garage({
      isOpen: true,
      activeTab: 'cosmetics',
    });
    expect(cosmeticsVnode).not.toBeNull();

    // Bikes tab rendering
    const bikesVnode = Garage({
      isOpen: true,
      activeTab: 'bikes',
      currentBikeId: 'old100',
      ownedBikes: ['old100'],
      cash: 25000,
      savings: 5000,
    });
    expect(bikesVnode).not.toBeNull();
  });
});
