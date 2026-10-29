import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  garageSignal,
  setGarageDispatchers,
  onRepairCallback,
  onBuyUpgradeCallback,
} from '../../../src/ui/store';
import { Garage } from '../../../src/ui/garage/Garage';
import { t, setLanguage } from '../../../src/ui/i18n';

describe('T4.4 Garage Screen & UI Store', () => {
  beforeEach(() => {
    garageSignal.value = {
      open: false,
      atKamalBhai: true,
      kamalRelationship: 0,
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
    };

    expect(garageSignal.value.open).toBe(true);
    expect(garageSignal.value.atKamalBhai).toBe(true);
    expect(garageSignal.value.kamalRelationship).toBe(25);
  });

  it('dispatches garage actions: repair and buyUpgrade', () => {
    const mockRepair = vi.fn();
    const mockBuyUpgrade = vi.fn();

    setGarageDispatchers(mockRepair, mockBuyUpgrade);

    onRepairCallback?.('engine');
    expect(mockRepair).toHaveBeenCalledWith('engine');

    onBuyUpgradeCallback?.('upgrade_good_tires');
    expect(mockBuyUpgrade).toHaveBeenCalledWith('upgrade_good_tires');
  });

  it('provides bilingual Garage strings in English and Bengali', () => {
    setLanguage('bn');
    expect(t('garage.title')).toBe('কমল ভাইয়ের ওয়ার্কশপ');
    expect(t('garage.kamal_discount_badge')).toBe('কমল ভাইয়ের আস্থা: ২০% ডিসকাউন্ট চালু!');
    expect(t('garage.tab_repairs')).toBe('মেরামত ও রক্ষণাবেক্ষণ');
    expect(t('garage.tab_upgrades')).toBe('পারফরম্যান্স আপগ্রেড');

    setLanguage('en');
    expect(t('garage.title')).toBe("Kamal Bhai's Workshop");
    expect(t('garage.kamal_discount_badge')).toBe('Kamal Bhai Trust: 20% Discount Active!');
    expect(t('garage.tab_repairs')).toBe('Repairs & Maintenance');
    expect(t('garage.tab_upgrades')).toBe('Performance Upgrades');
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
  });
});
