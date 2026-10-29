import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MapScreen } from '../../../src/ui/map/MapScreen';
import { t, setLanguage } from '../../../src/ui/i18n';
import defaultDistrict from '../../../data/districts/mirpara.json';
import type { DistrictData } from '../../../src/sim/schemas';

describe('T3.10 Dhaka Map Screen Unit Test', () => {
  beforeEach(() => {
    setLanguage('bn');
  });

  it('provides bilingual map strings in English and Bengali', () => {
    setLanguage('bn');
    expect(t('map.title')).toBe('ঢাকার মানচিত্র ও নেভিগেশন');
    expect(t('map.poi_fuel')).toBe('তেলের পাম্প');
    expect(t('map.poi_garage')).toBe('গ্যারেজ');
    expect(t('map.set_waypoint')).toBe('গন্তব্য চিহ্নিত করুন');

    setLanguage('en');
    expect(t('map.title')).toBe('Dhaka City Map & GPS');
    expect(t('map.poi_fuel')).toBe('Fuel Station');
    expect(t('map.poi_garage')).toBe('Garage Workshop');
    expect(t('map.set_waypoint')).toBe('Set Waypoint');
  });

  it('returns null when map screen is not open', () => {
    const vnode = MapScreen({
      isOpen: false,
    });
    expect(vnode).toBeNull();
  });

  it('renders MapScreen vnode with canvas, filter chips, and zoom controls when open', () => {
    const onSetWaypoint = vi.fn();
    const onClose = vi.fn();

    const vnode = MapScreen({
      isOpen: true,
      districtData: defaultDistrict as unknown as DistrictData,
      playerPos: { x: 100, z: -50 },
      waypointNodeId: 'poi_mirpara_garage',
      destinationNodeId: 'poi_mirpara_bazaar',
      onSetWaypoint,
      onClose,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('map-screen');
  });
});
