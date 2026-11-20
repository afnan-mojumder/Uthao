import worldDataJson from '../../../data/world.json';
import mirparaJson from '../../../data/districts/mirpara.json';
import type { DistrictData, WorldData } from '../../sim/schemas';

/**
 * False until `public/assets/map/dhaka.webp` exists; MapScreen shows a
 * prototype vector label while false.
 */
export const HAS_DHAKA_MAP_ASSET = false;

const MIRPARA_DISTRICT = mirparaJson as unknown as DistrictData;

let cachedDistricts: DistrictData[] = [MIRPARA_DISTRICT];
let inflightLoad: Promise<DistrictData[]> | null = null;

/** Returns the Dhaka 7-district world definition. */
export function getDefaultWorldData(): WorldData {
  return worldDataJson as unknown as WorldData;
}

/**
 * Returns all currently-loaded districts synchronously (Mirpara immediately at
 * boot, and all 7 Dhaka districts once `loadAllDistricts()` resolves).
 */
export function getDefaultDistrictsSync(): DistrictData[] {
  return cachedDistricts;
}

/**
 * Dynamically imports the 6 non-Mirpara Dhaka districts (`fulgate`..`motinagar`)
 * so Rollup/Rolldown emits separate district chunks and keeps the initial entry
 * JS shell `<= 400 KB` gzipped.
 */
export async function loadAllDistricts(): Promise<DistrictData[]> {
  if (cachedDistricts.length >= 7) {
    return cachedDistricts;
  }
  if (!inflightLoad) {
    inflightLoad = Promise.all([
      import('../../../data/districts/fulgate.json'),
      import('../../../data/districts/dhanbagh.json'),
      import('../../../data/districts/mohakhal.json'),
      import('../../../data/districts/gulbari.json'),
      import('../../../data/districts/puranpara.json'),
      import('../../../data/districts/motinagar.json'),
    ]).then(([fulgate, dhanbagh, mohakhal, gulbari, puranpara, motinagar]) => {
      cachedDistricts = [
        MIRPARA_DISTRICT,
        (fulgate.default ?? fulgate) as unknown as DistrictData,
        (dhanbagh.default ?? dhanbagh) as unknown as DistrictData,
        (mohakhal.default ?? mohakhal) as unknown as DistrictData,
        (gulbari.default ?? gulbari) as unknown as DistrictData,
        (puranpara.default ?? puranpara) as unknown as DistrictData,
        (motinagar.default ?? motinagar) as unknown as DistrictData,
      ];
      return cachedDistricts;
    });
  }
  return inflightLoad;
}

if (import.meta.env.DEV && typeof process !== 'undefined' && process.versions?.node) {
  void loadAllDistricts();
}
