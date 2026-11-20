import worldDataJson from '../../../data/world.json';
import mirparaJson from '../../../data/districts/mirpara.json';
import fulgateJson from '../../../data/districts/fulgate.json';
import dhanbaghJson from '../../../data/districts/dhanbagh.json';
import mohakhalJson from '../../../data/districts/mohakhal.json';
import gulbariJson from '../../../data/districts/gulbari.json';
import puranparaJson from '../../../data/districts/puranpara.json';
import motinagarJson from '../../../data/districts/motinagar.json';
import type { DistrictData, WorldData } from '../../sim/schemas';

/**
 * False until `public/assets/map/dhaka.webp` exists; MapScreen shows a
 * prototype vector label while false.
 */
export const HAS_DHAKA_MAP_ASSET = false;

const SYNC_DISTRICTS: DistrictData[] = [
  mirparaJson as unknown as DistrictData,
  fulgateJson as unknown as DistrictData,
  dhanbaghJson as unknown as DistrictData,
  mohakhalJson as unknown as DistrictData,
  gulbariJson as unknown as DistrictData,
  puranparaJson as unknown as DistrictData,
  motinagarJson as unknown as DistrictData,
];

/** Returns the Dhaka 7-district world definition. */
export function getDefaultWorldData(): WorldData {
  return worldDataJson as unknown as WorldData;
}

/** Returns all 7 playable districts synchronously for immediate UI startup. */
export function getDefaultDistrictsSync(): DistrictData[] {
  return SYNC_DISTRICTS;
}

/**
 * Async district accessor boundary so P8.1 dynamic `import()` of non-Mirpara
 * district JSONs can replace synchronous bundling without changing MapScreen.
 */
export async function loadAllDistricts(): Promise<DistrictData[]> {
  return SYNC_DISTRICTS;
}
