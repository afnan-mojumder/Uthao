import fs from 'node:fs';
import path from 'node:path';
import { Rng, hashSeed } from '../src/core/rng';
import type {
  RoadNode,
  RoadSegment,
  DistrictId,
  RoadType,
} from '../src/core/types';
import type { DistrictData, Poi, BuildingLot } from '../src/sim/schemas';

export interface DistrictStyle {
  districtId?: DistrictId;
  name?: { bn: string; en: string };
  origin: { x: number; z: number };
  size: { width: number; height: number };
  blockM: [min: number, max: number];
  arterial: {
    divided: boolean;
    uturnEveryM: number;
  };
  alleyDensity: number;
  marketStreets: number;
  organic: number; // 0 grid -> 1 old-town
  demandZones?: string[];
  riskBase?: number;
}

/**
 * Procedurally generates a complete Dhaka-inspired district.
 * Completely deterministic based on the provided seed.
 */
export function genDistrict(
  style: DistrictStyle,
  seed: number | string = 42
): DistrictData {
  const seedNum = typeof seed === 'number' ? seed : hashSeed(String(seed));
  const rng = new Rng(seedNum);

  const districtId: DistrictId = style.districtId ?? 'mirpara';
  const districtName = style.name ?? {
    bn: 'মিরপাড়া',
    en: 'Mirpara',
  };

  const originX = style.origin.x;
  const originZ = style.origin.z;
  const W = style.size.width;
  const H = style.size.height;

  const nodes: RoadNode[] = [];
  const segments: RoadSegment[] = [];
  const pois: Poi[] = [];
  const lots: BuildingLot[] = [];

  const nodeMap = new Map<string, RoadNode>();
  function addNode(
    id: string,
    x: number,
    z: number,
    kind: RoadNode['kind'] = 'junction',
    tags: string[] = []
  ): RoadNode {
    const roundedX = Math.round(x);
    const roundedZ = Math.round(z);
    const node: RoadNode = {
      nodeId: id,
      x: roundedX,
      z: roundedZ,
      kind,
      tags: tags.length > 0 ? tags : undefined,
    };
    nodeMap.set(id, node);
    nodes.push(node);
    return node;
  }

  let segCounter = 1;
  function addSegment(
    startId: string,
    endId: string,
    opts: Partial<RoadSegment> = {}
  ): RoadSegment {
    const id = `S_${districtId}_${segCounter++}`;
    const seg: RoadSegment = {
      segmentId: id,
      startNodeId: startId,
      endNodeId: endId,
      width: opts.width ?? 8,
      surfaceCondition: opts.surfaceCondition ?? 0.9,
      trafficDensity: opts.trafficDensity ?? 0.3,
      speedLimit: opts.speedLimit ?? 35,
      turnRestrictions: opts.turnRestrictions ?? [],
      motorcycleAccessible: opts.motorcycleAccessible ?? true,
      pedestrianDensity: opts.pedestrianDensity ?? 0.2,
      riskLevel: opts.riskLevel ?? (style.riskBase ?? 0.1),
      oneWay: opts.oneWay ?? false,
      divided: opts.divided ?? false,
      lanes: opts.lanes ?? 2,
      roadType: (opts.roadType as RoadType) ?? 'main',
      floodSensitivity: opts.floodSensitivity ?? 0.2,
      pickupPractical: opts.pickupPractical ?? true,
      district: districtId,
      tags: opts.tags ?? [],
    };
    segments.push(seg);
    return seg;
  }

  // 1. Divided Arterial Avenue across the center of the district
  // Runs West -> East at arterialZ
  const arterialZ = originZ + Math.round(H * 0.5);
  const arterialSteps = [0, 150, 300, 450, 600].filter((x) => x <= W);

  // Northern carriageway (Eastbound) & Southern carriageway (Westbound)
  // Distance between North and South lanes: 10m
  for (let i = 0; i < arterialSteps.length; i++) {
    const x = originX + (arterialSteps[i] ?? 0);
    const isUturn = i === 1 || i === 3 || i === 0 || i === arterialSteps.length - 1;
    const isCrossing = i === 2; // Footbridge crossing in the center

    const nTags: string[] = [];
    const sTags: string[] = [];
    if (isUturn) {
      nTags.push('uturn');
      sTags.push('uturn');
    }
    if (isCrossing) {
      nTags.push('crossing');
      sTags.push('crossing');
    }

    addNode(
      `art_n_${i}`,
      x,
      arterialZ - 5,
      isUturn ? 'uturn' : 'junction',
      nTags
    );
    addNode(
      `art_s_${i}`,
      x,
      arterialZ + 5,
      isUturn ? 'uturn' : 'junction',
      sTags
    );
  }

  // Arterial segments along the corridor
  for (let i = 0; i < arterialSteps.length - 1; i++) {
    // North carriageway: Eastbound
    addSegment(`art_n_${i}`, `art_n_${i + 1}`, {
      width: 12,
      divided: true,
      lanes: 2,
      speedLimit: 50,
      trafficDensity: 0.55,
      surfaceCondition: 0.95,
      roadType: 'main',
      oneWay: true,
      pickupPractical: true,
      tags: ['arterial'],
    });

    // South carriageway: Westbound
    addSegment(`art_s_${i + 1}`, `art_s_${i}`, {
      width: 12,
      divided: true,
      lanes: 2,
      speedLimit: 50,
      trafficDensity: 0.55,
      surfaceCondition: 0.95,
      roadType: 'main',
      oneWay: true,
      pickupPractical: true,
      tags: ['arterial'],
    });
  }

  // Arterial U-turns (every 150-300m <= 400m)
  for (let i = 0; i < arterialSteps.length; i++) {
    // Bidirectional or loop U-turns connecting North and South
    if (i === 1 || i === 3 || i === 0 || i === arterialSteps.length - 1) {
      addSegment(`art_n_${i}`, `art_s_${i}`, {
        width: 8,
        speedLimit: 25,
        roadType: 'main',
        oneWay: false,
        divided: false,
        tags: ['uturn'],
      });
    }
    // Footbridge crossing in the middle
    if (i === 2) {
      addSegment(`art_n_${i}`, `art_s_${i}`, {
        width: 6,
        speedLimit: 20,
        roadType: 'main',
        oneWay: false,
        divided: false,
        pedestrianDensity: 0.7,
        tags: ['crossing', 'footbridge'],
      });
    }
  }

  // 2. North Zone: Residential Lanes, Speed Bumps, and Alleys
  // Grid lines: z = 80, z = 180
  const northZ1 = originZ + 80;
  const northZ2 = originZ + 180;
  const xCols = [0, 150, 300, 450, 600].filter((x) => x <= W);

  for (let col = 0; col < xCols.length; col++) {
    const xBase = originX + (xCols[col] ?? 0);
    const jitterX =
      col > 0 && col < xCols.length - 1
        ? rng.range(-15, 15) * style.organic
        : 0;
    const jitterZ = rng.range(-10, 10) * style.organic;

    addNode(
      `res_n1_${col}`,
      xBase + jitterX,
      northZ1 + jitterZ,
      'junction',
      ['speed_bump']
    );
    addNode(
      `res_n2_${col}`,
      xBase + jitterX,
      northZ2 + jitterZ,
      'junction',
      ['speed_bump']
    );
  }

  // Horizontal residential connections in North
  for (let col = 0; col < xCols.length - 1; col++) {
    // Row 1 (z ~ 80)
    addSegment(`res_n1_${col}`, `res_n1_${col + 1}`, {
      width: 7,
      speedLimit: 30,
      surfaceCondition: col === 0 ? 0.5 : 0.85,
      floodSensitivity: col === 0 ? 0.85 : 0.2, // Flood-sensitive canal segment
      roadType: 'residential',
      tags: ['speed_bump'],
    });

    // Row 2 (z ~ 180)
    addSegment(`res_n2_${col}`, `res_n2_${col + 1}`, {
      width: 7,
      speedLimit: 30,
      roadType: 'residential',
      tags: ['speed_bump'],
    });
  }

  // Vertical connections in North
  for (let col = 0; col < xCols.length; col++) {
    addSegment(`res_n1_${col}`, `res_n2_${col}`, {
      width: 7,
      speedLimit: 30,
      roadType: 'residential',
      tags: ['speed_bump'],
    });
    // Connect to arterial North carriageway
    addSegment(`res_n2_${col}`, `art_n_${col}`, {
      width: 8,
      speedLimit: 35,
      roadType: 'main',
    });
  }

  // 3. South Zone: Market Street, Alleys, and Residential/Commercial
  // Grid lines: z = 420 (Market), z = 520 (Residential)
  const southZ1 = originZ + 420;
  const southZ2 = originZ + 520;

  for (let col = 0; col < xCols.length; col++) {
    const xBase = originX + (xCols[col] ?? 0);
    const jitterX =
      col > 0 && col < xCols.length - 1
        ? rng.range(-15, 15) * style.organic
        : 0;
    const jitterZ = rng.range(-10, 10) * style.organic;

    addNode(`res_s1_${col}`, xBase + jitterX, southZ1 + jitterZ, 'junction');
    addNode(`res_s2_${col}`, xBase + jitterX, southZ2 + jitterZ, 'junction');
  }

  // South Row 1: The vibrant Market Street (Mirpara Kacha Bazaar)
  for (let col = 0; col < xCols.length - 1; col++) {
    addSegment(`res_s1_${col}`, `res_s1_${col + 1}`, {
      width: 9,
      speedLimit: 25,
      surfaceCondition: 0.65,
      trafficDensity: 0.7,
      pedestrianDensity: 0.85,
      roadType: 'residential',
      tags: ['market'],
    });
  }

  // South Row 2: Residential / civic
  for (let col = 0; col < xCols.length - 1; col++) {
    addSegment(`res_s2_${col}`, `res_s2_${col + 1}`, {
      width: 7,
      speedLimit: 30,
      roadType: 'residential',
    });
  }

  // Vertical connections in South
  for (let col = 0; col < xCols.length; col++) {
    // Connect arterial South carriageway to South Row 1
    addSegment(`art_s_${col}`, `res_s1_${col}`, {
      width: 8,
      speedLimit: 35,
      roadType: 'main',
    });
    addSegment(`res_s1_${col}`, `res_s2_${col}`, {
      width: 7,
      speedLimit: 30,
      roadType: 'residential',
    });
  }

  // 4. Narrow Alleys (3+ with some motorcycleAccessible: false)
  // Alley 1 (North-West): winding shortcut between N1 and N2 (motorcycleAccessible: true)
  const alleyNode1 = addNode('alley_nw_mid', originX + 75, northZ1 + 50);
  addSegment('res_n1_0', alleyNode1.nodeId, {
    width: 3.5,
    speedLimit: 20,
    roadType: 'alley',
    motorcycleAccessible: true,
    pickupPractical: true,
    tags: ['alley'],
  });
  addSegment(alleyNode1.nodeId, 'res_n2_1', {
    width: 3.5,
    speedLimit: 20,
    roadType: 'alley',
    motorcycleAccessible: true,
    pickupPractical: true,
    tags: ['alley'],
  });

  // Alley 2 (North-East): narrow gated passage (motorcycleAccessible: false)
  const alleyNode2 = addNode('alley_ne_gate', originX + 375, northZ1 - 30);
  addSegment('res_n1_2', alleyNode2.nodeId, {
    width: 2.5,
    speedLimit: 15,
    roadType: 'alley',
    motorcycleAccessible: false,
    pickupPractical: false,
    tags: ['alley', 'pedestrian_only'],
  });
  addSegment(alleyNode2.nodeId, 'res_n1_3', {
    width: 2.5,
    speedLimit: 15,
    roadType: 'alley',
    motorcycleAccessible: false,
    pickupPractical: false,
    tags: ['alley', 'pedestrian_only'],
  });

  // Alley 3 (South-Center): winding back alley behind bazaar (motorcycleAccessible: true)
  const alleyNode3 = addNode('alley_sc_mid', originX + 225, southZ1 + 50);
  addSegment('res_s1_1', alleyNode3.nodeId, {
    width: 3.5,
    speedLimit: 20,
    roadType: 'alley',
    motorcycleAccessible: true,
    pickupPractical: true,
    tags: ['alley'],
  });
  addSegment(alleyNode3.nodeId, 'res_s2_2', {
    width: 3.5,
    speedLimit: 20,
    roadType: 'alley',
    motorcycleAccessible: true,
    pickupPractical: true,
    tags: ['alley'],
  });

  // Alley 4 (South-East): dead-end gated alley (motorcycleAccessible: false)
  const alleyNode4 = addNode(
    'alley_se_deadend',
    originX + 525,
    southZ2 - 30,
    'deadEnd'
  );
  addSegment('res_s2_3', alleyNode4.nodeId, {
    width: 2.5,
    speedLimit: 15,
    roadType: 'alley',
    motorcycleAccessible: false,
    pickupPractical: false,
    tags: ['alley', 'deadend'],
  });

  // 5. Place POIs (all on pickupPractical nodes)
  // Rafi's home
  pois.push({
    id: `poi_${districtId}_home`,
    kind: 'home',
    nodeId: 'res_n2_0',
    nameKey: 'poi.mirpara.rafi_home',
  });

  // Mintu's tea stall
  pois.push({
    id: `poi_${districtId}_tea_stall`,
    kind: 'teaStall',
    nodeId: 'res_n2_1',
    nameKey: 'poi.mirpara.tea_stall',
  });

  // Mirpara Fuel Station (on arterial)
  pois.push({
    id: `poi_${districtId}_fuel`,
    kind: 'fuel',
    nodeId: 'art_s_1',
    nameKey: 'poi.mirpara.fuel',
  });

  // Kamal bhai's garage
  pois.push({
    id: `poi_${districtId}_garage`,
    kind: 'garage',
    nodeId: 'res_s1_0',
    nameKey: 'poi.mirpara.garage',
  });

  // Mirpara High School
  pois.push({
    id: `poi_${districtId}_school`,
    kind: 'school',
    nodeId: 'res_n1_2',
    nameKey: 'poi.mirpara.school',
  });

  // Mayer Doa Pharmacy
  pois.push({
    id: `poi_${districtId}_pharmacy`,
    kind: 'pharmacy',
    nodeId: 'res_s1_2',
    nameKey: 'poi.mirpara.pharmacy',
  });

  // North Campus Gate (first passenger destination)
  pois.push({
    id: `poi_${districtId}_campus_gate`,
    kind: 'officeGate',
    nodeId: 'res_n1_1',
    nameKey: 'poi.mirpara.campus_gate',
  });

  // Footbridge Crossing
  pois.push({
    id: `poi_${districtId}_footbridge`,
    kind: 'crossing',
    nodeId: 'art_n_2',
    nameKey: 'poi.mirpara.footbridge',
  });

  // Mirpara Kacha Bazaar
  pois.push({
    id: `poi_${districtId}_bazaar`,
    kind: 'market',
    nodeId: 'res_s1_1',
    nameKey: 'poi.mirpara.bazaar',
  });

  // Mirpara Bus Stand
  pois.push({
    id: `poi_${districtId}_bus_stand`,
    kind: 'busStop',
    nodeId: 'art_s_3',
    nameKey: 'poi.mirpara.bus_stand',
  });

  // Community Health Clinic
  pois.push({
    id: `poi_${districtId}_clinic`,
    kind: 'hospital',
    nodeId: 'res_s2_1',
    nameKey: 'poi.mirpara.clinic',
  });

  // Green Tower Apartments
  pois.push({
    id: `poi_${districtId}_green_tower`,
    kind: 'apartment',
    nodeId: 'res_n2_3',
    nameKey: 'poi.mirpara.green_tower',
  });

  // 6. Generate Building Lots along segments
  let lotCounter = 1;
  for (const seg of segments) {
    if (!seg.pickupPractical) continue;
    const startNode = nodeMap.get(seg.startNodeId);
    const endNode = nodeMap.get(seg.endNodeId);
    if (!startNode || !endNode) continue;

    const midX = (startNode.x + endNode.x) / 2;
    const midZ = (startNode.z + endNode.z) / 2;
    const heading = Math.atan2(endNode.x - startNode.x, endNode.z - startNode.z);

    let zone: BuildingLot['zone'] = 'residential';
    if (seg.tags.includes('market')) {
      zone = 'market';
    } else if (seg.tags.includes('arterial') || seg.roadType === 'main') {
      zone = 'commercial';
    }

    lots.push({
      lotId: `lot_${districtId}_${lotCounter++}`,
      x: Math.round(midX + 12 * Math.cos(heading)),
      z: Math.round(midZ - 12 * Math.sin(heading)),
      width: 18,
      depth: 16,
      facingHeading: heading,
      zone,
    });
  }

  return {
    districtId,
    name: districtName,
    nodes,
    segments,
    pois,
    lots,
  };
}

/**
 * Standard generator for Mirpara vertical slice district.
 */
export function genMirpara(seed: number | string = 101): DistrictData {
  return genDistrict(
    {
      districtId: 'mirpara',
      name: { bn: 'মিরপাড়া', en: 'Mirpara' },
      origin: { x: 0, z: 0 },
      size: { width: 600, height: 600 },
      blockM: [80, 150],
      arterial: {
        divided: true,
        uturnEveryM: 300,
      },
      alleyDensity: 0.3,
      marketStreets: 1,
      organic: 0.35,
      demandZones: ['residential', 'market', 'commercial', 'campus'],
      riskBase: 0.1,
    },
    seed
  );
}

// Generate data/districts/mirpara.json when run directly
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('gen-district.ts') ||
    process.argv[1].endsWith('gen-district.js'));

if (isMainModule) {
  const mirpara = genMirpara();
  const outPath = path.resolve('data/districts/mirpara.json');
  fs.writeFileSync(outPath, JSON.stringify(mirpara, null, 2), 'utf-8');
  console.log(`Generated Mirpara district at ${outPath}`);
  console.log(
    `Nodes: ${mirpara.nodes.length}, Segments: ${mirpara.segments.length}, POIs: ${mirpara.pois.length}, Lots: ${mirpara.lots?.length ?? 0}`
  );
}
