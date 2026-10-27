import fs from 'node:fs';
import path from 'node:path';
import { Rng, hashSeed } from '../src/core/rng';
import type {
  RoadNode,
  RoadSegment,
  DistrictId,
  RoadType,
} from '../src/core/types';
import type { DistrictData, Poi, BuildingLot, WorldData } from '../src/sim/schemas';

export interface DistrictStyle {
  districtId?: DistrictId;
  name?: { bn: string; en: string };
  origin: { x: number; z: number };
  size: { width: number; height: number };
  blockM: [min: number, max: number];
  arterial: {
    divided: boolean;
    uturnEveryM: number;
    speedLimit?: number;
    trafficDensity?: number;
    signalJunction?: boolean;
    width?: number;
  };
  alleyDensity: number;
  marketStreets: number;
  organic: number; // 0 grid -> 1 old-town
  demandZones?: string[];
  riskBase?: number;
  pois?: Poi[];
  customNodes?: RoadNode[];
  customSegments?: RoadSegment[];
  roadWidthMod?: number;
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
  const nodePrefix = districtId === 'mirpara' ? '' : `${districtId}_`;
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
    rawId: string,
    x: number,
    z: number,
    kind: RoadNode['kind'] = 'junction',
    tags: string[] = [],
    signal = false
  ): RoadNode {
    const id = `${nodePrefix}${rawId}`;
    const roundedX = Math.round(x);
    const roundedZ = Math.round(z);
    const node: RoadNode = {
      nodeId: id,
      x: roundedX,
      z: roundedZ,
      kind,
      signal: signal ? true : undefined,
      tags: tags.length > 0 ? tags : undefined,
    };
    nodeMap.set(id, node);
    nodes.push(node);
    return node;
  }

  let segCounter = 1;
  function addSegment(
    rawStartId: string,
    rawEndId: string,
    opts: Partial<RoadSegment> = {}
  ): RoadSegment {
    const startId = rawStartId.startsWith(nodePrefix) ? rawStartId : `${nodePrefix}${rawStartId}`;
    const endId = rawEndId.startsWith(nodePrefix) ? rawEndId : `${nodePrefix}${rawEndId}`;
    const id = `S_${districtId}_${segCounter++}`;
    const seg: RoadSegment = {
      segmentId: id,
      startNodeId: startId,
      endNodeId: endId,
      width: (opts.width ?? 8) * (style.roadWidthMod ?? 1.0),
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
    const isCrossing = i === 2; // Footbridge or central junction

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

    const isSignal = style.arterial.signalJunction && i === 2;

    addNode(
      `art_n_${i}`,
      x,
      arterialZ - 5,
      isUturn ? 'uturn' : 'junction',
      nTags,
      isSignal
    );
    addNode(
      `art_s_${i}`,
      x,
      arterialZ + 5,
      isUturn ? 'uturn' : 'junction',
      sTags,
      isSignal
    );
  }

  // Arterial segments along the corridor
  const arterialSpeed = style.arterial.speedLimit ?? 50;
  const arterialDensity = style.arterial.trafficDensity ?? 0.55;
  const arterialWidth = style.arterial.width ?? 12;

  for (let i = 0; i < arterialSteps.length - 1; i++) {
    // North carriageway: Eastbound
    addSegment(`art_n_${i}`, `art_n_${i + 1}`, {
      width: arterialWidth,
      divided: true,
      lanes: 2,
      speedLimit: arterialSpeed,
      trafficDensity: arterialDensity,
      surfaceCondition: 0.95,
      roadType: 'main',
      oneWay: true,
      pickupPractical: true,
      tags: ['arterial'],
    });

    // South carriageway: Westbound
    addSegment(`art_s_${i + 1}`, `art_s_${i}`, {
      width: arterialWidth,
      divided: true,
      lanes: 2,
      speedLimit: arterialSpeed,
      trafficDensity: arterialDensity,
      surfaceCondition: 0.95,
      roadType: 'main',
      oneWay: true,
      pickupPractical: true,
      tags: ['arterial'],
    });
  }

  // Arterial U-turns (every 150m <= 400m)
  for (let i = 0; i < arterialSteps.length; i++) {
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
    if (i === 2) {
      addSegment(`art_n_${i}`, `art_s_${i}`, {
        width: 8,
        speedLimit: 25,
        roadType: 'main',
        oneWay: false,
        divided: false,
        pedestrianDensity: 0.6,
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
    // Row 1
    addSegment(`res_n1_${col}`, `res_n1_${col + 1}`, {
      width: 7,
      speedLimit: 30,
      surfaceCondition: col === 0 ? 0.6 : 0.85,
      floodSensitivity: col === 0 ? 0.85 : 0.2,
      roadType: 'residential',
      tags: ['speed_bump'],
    });

    // Row 2
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

  // South Row 1: Market Street
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

    // South Row 2
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
  if (style.pois && style.pois.length > 0) {
    pois.push(...style.pois);
  } else if (districtId === 'mirpara') {
    pois.push(
      {
        id: `poi_${districtId}_home`,
        kind: 'home',
        nodeId: 'res_n2_0',
        nameKey: 'poi.mirpara.rafi_home',
      },
      {
        id: `poi_${districtId}_tea_stall`,
        kind: 'teaStall',
        nodeId: 'res_n2_1',
        nameKey: 'poi.mirpara.tea_stall',
      },
      {
        id: `poi_${districtId}_fuel`,
        kind: 'fuel',
        nodeId: 'art_s_1',
        nameKey: 'poi.mirpara.fuel',
      },
      {
        id: `poi_${districtId}_garage`,
        kind: 'garage',
        nodeId: 'res_s1_0',
        nameKey: 'poi.mirpara.garage',
      },
      {
        id: `poi_${districtId}_school`,
        kind: 'school',
        nodeId: 'res_n1_2',
        nameKey: 'poi.mirpara.school',
      },
      {
        id: `poi_${districtId}_pharmacy`,
        kind: 'pharmacy',
        nodeId: 'res_s1_2',
        nameKey: 'poi.mirpara.pharmacy',
      },
      {
        id: `poi_${districtId}_campus_gate`,
        kind: 'officeGate',
        nodeId: 'res_n1_1',
        nameKey: 'poi.mirpara.campus_gate',
      },
      {
        id: `poi_${districtId}_footbridge`,
        kind: 'crossing',
        nodeId: 'art_n_2',
        nameKey: 'poi.mirpara.footbridge',
      },
      {
        id: `poi_${districtId}_bazaar`,
        kind: 'market',
        nodeId: 'res_s1_1',
        nameKey: 'poi.mirpara.bazaar',
      },
      {
        id: `poi_${districtId}_bus_stand`,
        kind: 'busStop',
        nodeId: 'art_s_3',
        nameKey: 'poi.mirpara.bus_stand',
      },
      {
        id: `poi_${districtId}_clinic`,
        kind: 'hospital',
        nodeId: 'res_s2_1',
        nameKey: 'poi.mirpara.clinic',
      },
      {
        id: `poi_${districtId}_green_tower`,
        kind: 'apartment',
        nodeId: 'res_n2_3',
        nameKey: 'poi.mirpara.green_tower',
      }
    );
  }

  // 6. Custom extra nodes and segments (e.g. Mohakhal flyover)
  if (style.customNodes) {
    for (const cn of style.customNodes) {
      nodeMap.set(cn.nodeId, cn);
      nodes.push(cn);
    }
  }
  if (style.customSegments) {
    for (const cs of style.customSegments) {
      segments.push(cs);
    }
  }

  // 7. Generate Building Lots along pickupPractical segments
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

/**
 * Fulgate (Farmgate): High-demand pickup hub, signalled junction, buses, footbridges.
 */
export function genFulgate(seed: number | string = 102): DistrictData {
  return genDistrict(
    {
      districtId: 'fulgate',
      name: { bn: 'ফার্মগেট', en: 'Fulgate' },
      origin: { x: 600, z: 0 },
      size: { width: 600, height: 600 },
      blockM: [80, 150],
      arterial: {
        divided: true,
        uturnEveryM: 150,
        speedLimit: 50,
        trafficDensity: 0.8,
        signalJunction: true,
      },
      alleyDensity: 0.25,
      marketStreets: 2,
      organic: 0.2,
      demandZones: ['transit_hub', 'commercial', 'office'],
      riskBase: 0.15,
      pois: [
        {
          id: 'poi_fulgate_junction',
          kind: 'crossing',
          nodeId: 'fulgate_art_n_2',
          nameKey: 'poi.fulgate.junction',
        },
        {
          id: 'poi_fulgate_bus_terminal',
          kind: 'busStop',
          nodeId: 'fulgate_res_n2_1',
          nameKey: 'poi.fulgate.bus_terminal',
        },
        {
          id: 'poi_fulgate_footbridge',
          kind: 'crossing',
          nodeId: 'fulgate_art_n_1',
          nameKey: 'poi.fulgate.footbridge',
        },
        {
          id: 'poi_fulgate_ananda_cinema',
          kind: 'market',
          nodeId: 'fulgate_res_s1_2',
          nameKey: 'poi.fulgate.ananda_cinema',
        },
        {
          id: 'poi_fulgate_tea_stall',
          kind: 'teaStall',
          nodeId: 'fulgate_res_n1_0',
          nameKey: 'poi.fulgate.tea_stall',
        },
        {
          id: 'poi_fulgate_fuel',
          kind: 'fuel',
          nodeId: 'fulgate_art_s_3',
          nameKey: 'poi.fulgate.fuel',
        },
      ],
    },
    seed
  );
}

/**
 * Dhanbagh (Dhanmondi): Universities, hospital, cafes, lake road, mixed passengers.
 */
export function genDhanbagh(seed: number | string = 103): DistrictData {
  return genDistrict(
    {
      districtId: 'dhanbagh',
      name: { bn: 'ধানবাগ', en: 'Dhanbagh' },
      origin: { x: 0, z: 600 },
      size: { width: 600, height: 600 },
      blockM: [100, 180],
      arterial: {
        divided: true,
        uturnEveryM: 150,
        speedLimit: 45,
        trafficDensity: 0.5,
      },
      alleyDensity: 0.2,
      marketStreets: 1,
      organic: 0.25,
      demandZones: ['residential', 'university', 'medical', 'dining'],
      riskBase: 0.08,
      pois: [
        {
          id: 'poi_dhanbagh_hospital',
          kind: 'hospital',
          nodeId: 'dhanbagh_res_n2_1',
          nameKey: 'poi.dhanbagh.hospital',
        },
        {
          id: 'poi_dhanbagh_university',
          kind: 'school',
          nodeId: 'dhanbagh_res_s1_2',
          nameKey: 'poi.dhanbagh.university',
        },
        {
          id: 'poi_dhanbagh_lake_cafe',
          kind: 'teaStall',
          nodeId: 'dhanbagh_res_n1_0',
          nameKey: 'poi.dhanbagh.lake_cafe',
        },
        {
          id: 'poi_dhanbagh_pharmacy',
          kind: 'pharmacy',
          nodeId: 'dhanbagh_res_s2_1',
          nameKey: 'poi.dhanbagh.pharmacy',
        },
        {
          id: 'poi_dhanbagh_school',
          kind: 'school',
          nodeId: 'dhanbagh_res_n2_3',
          nameKey: 'poi.dhanbagh.school',
        },
        {
          id: 'poi_dhanbagh_fuel',
          kind: 'fuel',
          nodeId: 'dhanbagh_art_s_1',
          nameKey: 'poi.dhanbagh.fuel',
        },
      ],
    },
    seed
  );
}

/**
 * Mohakhal (Mohakhali): Intercity terminal, flyover, bottlenecks.
 */
export function genMohakhal(seed: number | string = 104): DistrictData {
  const originX = 600;
  const originZ = 600;

  // Custom flyover nodes and ramps
  const flyNodes: RoadNode[] = [
    {
      nodeId: 'mohakhal_fly_w',
      x: originX + 50,
      z: originZ + 300,
      kind: 'junction',
      tags: ['flyover'],
    },
    {
      nodeId: 'mohakhal_fly_mid',
      x: originX + 300,
      z: originZ + 300,
      kind: 'junction',
      tags: ['flyover'],
    },
    {
      nodeId: 'mohakhal_fly_e',
      x: originX + 550,
      z: originZ + 300,
      kind: 'junction',
      tags: ['flyover'],
    },
  ];

  const flySegments: RoadSegment[] = [
    // Eastbound flyover main spans
    {
      segmentId: 'S_mohakhal_fly_eb1',
      startNodeId: 'mohakhal_fly_w',
      endNodeId: 'mohakhal_fly_mid',
      width: 10,
      surfaceCondition: 0.98,
      trafficDensity: 0.6,
      speedLimit: 60,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover'],
    },
    {
      segmentId: 'S_mohakhal_fly_eb2',
      startNodeId: 'mohakhal_fly_mid',
      endNodeId: 'mohakhal_fly_e',
      width: 10,
      surfaceCondition: 0.98,
      trafficDensity: 0.6,
      speedLimit: 60,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover'],
    },
    // Westbound flyover main spans
    {
      segmentId: 'S_mohakhal_fly_wb1',
      startNodeId: 'mohakhal_fly_e',
      endNodeId: 'mohakhal_fly_mid',
      width: 10,
      surfaceCondition: 0.98,
      trafficDensity: 0.6,
      speedLimit: 60,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover'],
    },
    {
      segmentId: 'S_mohakhal_fly_wb2',
      startNodeId: 'mohakhal_fly_mid',
      endNodeId: 'mohakhal_fly_w',
      width: 10,
      surfaceCondition: 0.98,
      trafficDensity: 0.6,
      speedLimit: 60,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover'],
    },
    // Eastbound on-ramp from ground arterial
    {
      segmentId: 'S_mohakhal_ramp_eb_on',
      startNodeId: 'mohakhal_art_n_0',
      endNodeId: 'mohakhal_fly_w',
      width: 8,
      surfaceCondition: 0.95,
      trafficDensity: 0.5,
      speedLimit: 45,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 1,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover', 'ramp'],
    },
    // Eastbound off-ramp to ground arterial
    {
      segmentId: 'S_mohakhal_ramp_eb_off',
      startNodeId: 'mohakhal_fly_e',
      endNodeId: 'mohakhal_art_n_4',
      width: 8,
      surfaceCondition: 0.95,
      trafficDensity: 0.5,
      speedLimit: 45,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 1,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover', 'ramp'],
    },
    // Westbound on-ramp from ground arterial
    {
      segmentId: 'S_mohakhal_ramp_wb_on',
      startNodeId: 'mohakhal_art_s_4',
      endNodeId: 'mohakhal_fly_e',
      width: 8,
      surfaceCondition: 0.95,
      trafficDensity: 0.5,
      speedLimit: 45,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 1,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover', 'ramp'],
    },
    // Westbound off-ramp to ground arterial
    {
      segmentId: 'S_mohakhal_ramp_wb_off',
      startNodeId: 'mohakhal_fly_w',
      endNodeId: 'mohakhal_art_s_0',
      width: 8,
      surfaceCondition: 0.95,
      trafficDensity: 0.5,
      speedLimit: 45,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 1,
      roadType: 'flyover',
      floodSensitivity: 0.0,
      pickupPractical: false,
      district: 'mohakhal',
      tags: ['flyover', 'ramp'],
    },
  ];

  return genDistrict(
    {
      districtId: 'mohakhal',
      name: { bn: 'মহাখাল', en: 'Mohakhal' },
      origin: { x: originX, z: originZ },
      size: { width: 600, height: 600 },
      blockM: [80, 140],
      arterial: {
        divided: true,
        uturnEveryM: 150,
        speedLimit: 45,
        trafficDensity: 0.85,
      },
      alleyDensity: 0.25,
      marketStreets: 1,
      organic: 0.3,
      demandZones: ['bus_terminal', 'commercial', 'medical'],
      riskBase: 0.12,
      customNodes: flyNodes,
      customSegments: flySegments,
      pois: [
        {
          id: 'poi_mohakhal_intercity_terminal',
          kind: 'busStop',
          nodeId: 'mohakhal_res_n1_2',
          nameKey: 'poi.mohakhal.intercity_terminal',
        },
        {
          id: 'poi_mohakhal_wireless_gate',
          kind: 'crossing',
          nodeId: 'mohakhal_res_s1_1',
          nameKey: 'poi.mohakhal.wireless_gate',
        },
        {
          id: 'poi_mohakhal_icddr',
          kind: 'hospital',
          nodeId: 'mohakhal_res_n2_0',
          nameKey: 'poi.mohakhal.icddr',
        },
        {
          id: 'poi_mohakhal_rail_gate',
          kind: 'crossing',
          nodeId: 'mohakhal_art_n_3',
          nameKey: 'poi.mohakhal.rail_gate',
        },
        {
          id: 'poi_mohakhal_garage',
          kind: 'garage',
          nodeId: 'mohakhal_res_s2_2',
          nameKey: 'poi.mohakhal.garage',
        },
        {
          id: 'poi_mohakhal_fuel',
          kind: 'fuel',
          nodeId: 'mohakhal_art_s_1',
          nameKey: 'poi.mohakhal.fuel',
        },
      ],
    },
    seed
  );
}

/**
 * Gulbari (Gulshan/Banani): Wider roads, office towers, embassies, security gates.
 */
export function genGulbari(seed: number | string = 105): DistrictData {
  return genDistrict(
    {
      districtId: 'gulbari',
      name: { bn: 'গুলবাড়ি', en: 'Gulbari' },
      origin: { x: 1200, z: 600 },
      size: { width: 600, height: 600 },
      blockM: [120, 200],
      arterial: {
        divided: true,
        uturnEveryM: 150,
        speedLimit: 55,
        trafficDensity: 0.45,
        width: 14,
      },
      alleyDensity: 0.1,
      marketStreets: 0,
      organic: 0.05,
      roadWidthMod: 1.25,
      demandZones: ['corporate', 'embassy', 'luxury'],
      riskBase: 0.05,
      pois: [
        {
          id: 'poi_gulbari_circle_one',
          kind: 'crossing',
          nodeId: 'gulbari_art_n_2',
          nameKey: 'poi.gulbari.circle_one',
        },
        {
          id: 'poi_gulbari_office_tower',
          kind: 'officeGate',
          nodeId: 'gulbari_res_n2_1',
          nameKey: 'poi.gulbari.office_tower',
        },
        {
          id: 'poi_gulbari_embassy_gate',
          kind: 'officeGate',
          nodeId: 'gulbari_res_n1_2',
          nameKey: 'poi.gulbari.embassy_gate',
        },
        {
          id: 'poi_gulbari_bistro',
          kind: 'teaStall',
          nodeId: 'gulbari_res_s1_0',
          nameKey: 'poi.gulbari.bistro',
        },
        {
          id: 'poi_gulbari_supermarket',
          kind: 'market',
          nodeId: 'gulbari_res_s2_3',
          nameKey: 'poi.gulbari.supermarket',
        },
        {
          id: 'poi_gulbari_fuel',
          kind: 'fuel',
          nodeId: 'gulbari_art_s_3',
          nameKey: 'poi.gulbari.fuel',
        },
      ],
    },
    seed
  );
}

/**
 * Puran Para (Old Dhaka): Organic narrow lanes, inaccessible alleys, dense markets, difficult turns.
 */
export function genPuranpara(seed: number | string = 106): DistrictData {
  return genDistrict(
    {
      districtId: 'puranpara',
      name: { bn: 'পুরানপাড়া', en: 'Puran Para' },
      origin: { x: 0, z: 1200 },
      size: { width: 600, height: 600 },
      blockM: [60, 100],
      arterial: {
        divided: true,
        uturnEveryM: 150,
        speedLimit: 35,
        trafficDensity: 0.75,
        width: 10,
      },
      alleyDensity: 0.5,
      marketStreets: 3,
      organic: 0.85,
      roadWidthMod: 0.85,
      demandZones: ['heritage', 'spice_market', 'bakery', 'river_ghat'],
      riskBase: 0.22,
      pois: [
        {
          id: 'poi_puranpara_lalbagh_gate',
          kind: 'officeGate',
          nodeId: 'puranpara_res_n1_1',
          nameKey: 'poi.puranpara.lalbagh_gate',
        },
        {
          id: 'poi_puranpara_spicemarket',
          kind: 'market',
          nodeId: 'puranpara_res_s1_2',
          nameKey: 'poi.puranpara.spicemarket',
        },
        {
          id: 'poi_puranpara_bakarkhani',
          kind: 'market',
          nodeId: 'puranpara_res_n2_0',
          nameKey: 'poi.puranpara.bakarkhani',
        },
        {
          id: 'poi_puranpara_ghat',
          kind: 'market',
          nodeId: 'puranpara_res_s2_3',
          nameKey: 'poi.puranpara.ghat',
        },
        {
          id: 'poi_puranpara_morod',
          kind: 'crossing',
          nodeId: 'puranpara_art_n_2',
          nameKey: 'poi.puranpara.morod',
        },
        {
          id: 'poi_puranpara_tea_stall',
          kind: 'teaStall',
          nodeId: 'puranpara_res_s1_0',
          nameKey: 'poi.puranpara.tea_stall',
        },
      ],
    },
    seed
  );
}

/**
 * Motinagar (Motijheel): Commercial demand, offices, crowded crossings, strongest rush hour.
 */
export function genMotinagar(seed: number | string = 107): DistrictData {
  return genDistrict(
    {
      districtId: 'motinagar',
      name: { bn: 'মতিনগর', en: 'Motinagar' },
      origin: { x: 600, z: 1200 },
      size: { width: 600, height: 600 },
      blockM: [90, 160],
      arterial: {
        divided: true,
        uturnEveryM: 150,
        speedLimit: 45,
        trafficDensity: 0.9,
      },
      alleyDensity: 0.2,
      marketStreets: 1,
      organic: 0.15,
      demandZones: ['financial', 'stadium', 'press_club', 'commercial'],
      riskBase: 0.1,
      pois: [
        {
          id: 'poi_motinagar_bank_square',
          kind: 'officeGate',
          nodeId: 'motinagar_res_n2_1',
          nameKey: 'poi.motinagar.bank_square',
        },
        {
          id: 'poi_motinagar_shapla_circle',
          kind: 'crossing',
          nodeId: 'motinagar_art_n_2',
          nameKey: 'poi.motinagar.shapla_circle',
        },
        {
          id: 'poi_motinagar_stock_exchange',
          kind: 'officeGate',
          nodeId: 'motinagar_res_s1_2',
          nameKey: 'poi.motinagar.stock_exchange',
        },
        {
          id: 'poi_motinagar_stadium_gate',
          kind: 'crossing',
          nodeId: 'motinagar_res_n1_3',
          nameKey: 'poi.motinagar.stadium_gate',
        },
        {
          id: 'poi_motinagar_press_club',
          kind: 'officeGate',
          nodeId: 'motinagar_res_s2_0',
          nameKey: 'poi.motinagar.press_club',
        },
        {
          id: 'poi_motinagar_fuel',
          kind: 'fuel',
          nodeId: 'motinagar_art_s_1',
          nameKey: 'poi.motinagar.fuel',
        },
      ],
    },
    seed
  );
}

/**
 * Generates the unified Dhaka world map connecting all 7 contiguous districts.
 */
export function genWorld(): WorldData {
  const connectors: RoadSegment[] = [
    // 1. Mirpara East <-> Fulgate West
    {
      segmentId: 'CONN_mirpara_fulgate_n',
      startNodeId: 'art_n_4',
      endNodeId: 'fulgate_art_n_0',
      width: 12,
      surfaceCondition: 0.95,
      trafficDensity: 0.7,
      speedLimit: 50,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.1,
      riskLevel: 0.1,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.1,
      pickupPractical: true,
      district: 'fulgate',
      tags: ['arterial', 'connector'],
    },
    {
      segmentId: 'CONN_fulgate_mirpara_s',
      startNodeId: 'fulgate_art_s_0',
      endNodeId: 'art_s_4',
      width: 12,
      surfaceCondition: 0.95,
      trafficDensity: 0.7,
      speedLimit: 50,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.1,
      riskLevel: 0.1,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.1,
      pickupPractical: true,
      district: 'mirpara',
      tags: ['arterial', 'connector'],
    },

    // 2. Mirpara South <-> Dhanbagh North
    {
      segmentId: 'CONN_mirpara_dhanbagh_1',
      startNodeId: 'res_s2_1',
      endNodeId: 'dhanbagh_res_n1_1',
      width: 8,
      surfaceCondition: 0.85,
      trafficDensity: 0.5,
      speedLimit: 35,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.3,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'residential',
      floodSensitivity: 0.3,
      pickupPractical: true,
      district: 'dhanbagh',
      tags: ['connector'],
    },
    {
      segmentId: 'CONN_mirpara_dhanbagh_2',
      startNodeId: 'res_s2_2',
      endNodeId: 'dhanbagh_res_n1_2',
      width: 8,
      surfaceCondition: 0.85,
      trafficDensity: 0.5,
      speedLimit: 35,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.3,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'residential',
      floodSensitivity: 0.3,
      pickupPractical: true,
      district: 'dhanbagh',
      tags: ['connector'],
    },

    // 3. Fulgate South <-> Mohakhal North
    {
      segmentId: 'CONN_fulgate_mohakhal_1',
      startNodeId: 'fulgate_res_s2_1',
      endNodeId: 'mohakhal_res_n1_1',
      width: 9,
      surfaceCondition: 0.9,
      trafficDensity: 0.75,
      speedLimit: 40,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.4,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.2,
      pickupPractical: true,
      district: 'mohakhal',
      tags: ['connector'],
    },
    {
      segmentId: 'CONN_fulgate_mohakhal_2',
      startNodeId: 'fulgate_res_s2_2',
      endNodeId: 'mohakhal_res_n1_2',
      width: 9,
      surfaceCondition: 0.9,
      trafficDensity: 0.75,
      speedLimit: 40,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.4,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.2,
      pickupPractical: true,
      district: 'mohakhal',
      tags: ['connector'],
    },

    // 4. Dhanbagh East <-> Mohakhal West
    {
      segmentId: 'CONN_dhanbagh_mohakhal_n',
      startNodeId: 'dhanbagh_art_n_4',
      endNodeId: 'mohakhal_art_n_0',
      width: 12,
      surfaceCondition: 0.95,
      trafficDensity: 0.65,
      speedLimit: 50,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.2,
      riskLevel: 0.1,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.1,
      pickupPractical: true,
      district: 'mohakhal',
      tags: ['arterial', 'connector'],
    },
    {
      segmentId: 'CONN_mohakhal_dhanbagh_s',
      startNodeId: 'mohakhal_art_s_0',
      endNodeId: 'dhanbagh_art_s_4',
      width: 12,
      surfaceCondition: 0.95,
      trafficDensity: 0.65,
      speedLimit: 50,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.2,
      riskLevel: 0.1,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.1,
      pickupPractical: true,
      district: 'dhanbagh',
      tags: ['arterial', 'connector'],
    },

    // 5. Mohakhal East <-> Gulbari West
    {
      segmentId: 'CONN_mohakhal_gulbari_n',
      startNodeId: 'mohakhal_art_n_4',
      endNodeId: 'gulbari_art_n_0',
      width: 14,
      surfaceCondition: 0.98,
      trafficDensity: 0.6,
      speedLimit: 55,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.1,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.05,
      pickupPractical: true,
      district: 'gulbari',
      tags: ['arterial', 'connector'],
    },
    {
      segmentId: 'CONN_gulbari_mohakhal_s',
      startNodeId: 'gulbari_art_s_0',
      endNodeId: 'mohakhal_art_s_4',
      width: 14,
      surfaceCondition: 0.98,
      trafficDensity: 0.6,
      speedLimit: 55,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.1,
      riskLevel: 0.05,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.05,
      pickupPractical: true,
      district: 'mohakhal',
      tags: ['arterial', 'connector'],
    },

    // 6. Dhanbagh South <-> Puranpara North
    {
      segmentId: 'CONN_dhanbagh_puranpara_1',
      startNodeId: 'dhanbagh_res_s2_1',
      endNodeId: 'puranpara_res_n1_1',
      width: 7,
      surfaceCondition: 0.75,
      trafficDensity: 0.65,
      speedLimit: 30,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.5,
      riskLevel: 0.15,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'residential',
      floodSensitivity: 0.4,
      pickupPractical: true,
      district: 'puranpara',
      tags: ['connector'],
    },
    {
      segmentId: 'CONN_dhanbagh_puranpara_2',
      startNodeId: 'dhanbagh_res_s2_2',
      endNodeId: 'puranpara_res_n1_2',
      width: 7,
      surfaceCondition: 0.75,
      trafficDensity: 0.65,
      speedLimit: 30,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.5,
      riskLevel: 0.15,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'residential',
      floodSensitivity: 0.4,
      pickupPractical: true,
      district: 'puranpara',
      tags: ['connector'],
    },

    // 7. Mohakhal South <-> Motinagar North
    {
      segmentId: 'CONN_mohakhal_motinagar_1',
      startNodeId: 'mohakhal_res_s2_1',
      endNodeId: 'motinagar_res_n1_1',
      width: 9,
      surfaceCondition: 0.9,
      trafficDensity: 0.8,
      speedLimit: 40,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.4,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.2,
      pickupPractical: true,
      district: 'motinagar',
      tags: ['connector'],
    },
    {
      segmentId: 'CONN_mohakhal_motinagar_2',
      startNodeId: 'mohakhal_res_s2_2',
      endNodeId: 'motinagar_res_n1_2',
      width: 9,
      surfaceCondition: 0.9,
      trafficDensity: 0.8,
      speedLimit: 40,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.4,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.2,
      pickupPractical: true,
      district: 'motinagar',
      tags: ['connector'],
    },

    // 8. Puranpara East <-> Motinagar West
    {
      segmentId: 'CONN_puranpara_motinagar_n',
      startNodeId: 'puranpara_art_n_4',
      endNodeId: 'motinagar_art_n_0',
      width: 10,
      surfaceCondition: 0.85,
      trafficDensity: 0.7,
      speedLimit: 45,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.3,
      riskLevel: 0.12,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.2,
      pickupPractical: true,
      district: 'motinagar',
      tags: ['arterial', 'connector'],
    },
    {
      segmentId: 'CONN_motinagar_puranpara_s',
      startNodeId: 'motinagar_art_s_0',
      endNodeId: 'puranpara_art_s_4',
      width: 10,
      surfaceCondition: 0.85,
      trafficDensity: 0.7,
      speedLimit: 45,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.3,
      riskLevel: 0.12,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.2,
      pickupPractical: true,
      district: 'puranpara',
      tags: ['arterial', 'connector'],
    },
  ];

  return {
    districts: [
      {
        districtId: 'mirpara',
        name: { bn: 'মিরপাড়া', en: 'Mirpara' },
        file: 'data/districts/mirpara.json',
        bounds: { minX: 0, minZ: 0, maxX: 600, maxZ: 600 },
      },
      {
        districtId: 'fulgate',
        name: { bn: 'ফার্মগেট', en: 'Fulgate' },
        file: 'data/districts/fulgate.json',
        bounds: { minX: 600, minZ: 0, maxX: 1200, maxZ: 600 },
      },
      {
        districtId: 'dhanbagh',
        name: { bn: 'ধানবাগ', en: 'Dhanbagh' },
        file: 'data/districts/dhanbagh.json',
        bounds: { minX: 0, minZ: 600, maxX: 600, maxZ: 1200 },
      },
      {
        districtId: 'mohakhal',
        name: { bn: 'মহাখাল', en: 'Mohakhal' },
        file: 'data/districts/mohakhal.json',
        bounds: { minX: 600, minZ: 600, maxX: 1200, maxZ: 1200 },
      },
      {
        districtId: 'gulbari',
        name: { bn: 'গুলবাড়ি', en: 'Gulbari' },
        file: 'data/districts/gulbari.json',
        bounds: { minX: 1200, minZ: 600, maxX: 1800, maxZ: 1200 },
      },
      {
        districtId: 'puranpara',
        name: { bn: 'পুরানপাড়া', en: 'Puran Para' },
        file: 'data/districts/puranpara.json',
        bounds: { minX: 0, minZ: 1200, maxX: 600, maxZ: 1800 },
      },
      {
        districtId: 'motinagar',
        name: { bn: 'মতিনগর', en: 'Motinagar' },
        file: 'data/districts/motinagar.json',
        bounds: { minX: 600, minZ: 1200, maxX: 1200, maxZ: 1800 },
      },
    ],
    connectors,
    flyovers: [
      {
        flyoverId: 'mohakhal_flyover',
        name: { bn: 'মহাখালী ফ্লাইওভার', en: 'Mohakhali Flyover' },
        district: 'mohakhal',
        segmentIds: [
          'S_mohakhal_fly_eb1',
          'S_mohakhal_fly_eb2',
          'S_mohakhal_fly_wb1',
          'S_mohakhal_fly_wb2',
          'S_mohakhal_ramp_eb_on',
          'S_mohakhal_ramp_eb_off',
          'S_mohakhal_ramp_wb_on',
          'S_mohakhal_ramp_wb_off',
        ],
      },
    ],
  };
}

// Generate all districts and world.json when run directly
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith('gen-district.ts') ||
    process.argv[1].endsWith('gen-district.js'));

if (isMainModule) {
  const districtsDir = path.resolve('data/districts');
  if (!fs.existsSync(districtsDir)) {
    fs.mkdirSync(districtsDir, { recursive: true });
  }

  const allDistricts = [
    { fn: genMirpara, filename: 'mirpara.json' },
    { fn: genFulgate, filename: 'fulgate.json' },
    { fn: genDhanbagh, filename: 'dhanbagh.json' },
    { fn: genMohakhal, filename: 'mohakhal.json' },
    { fn: genGulbari, filename: 'gulbari.json' },
    { fn: genPuranpara, filename: 'puranpara.json' },
    { fn: genMotinagar, filename: 'motinagar.json' },
  ];

  for (const d of allDistricts) {
    const data = d.fn();
    const outPath = path.join(districtsDir, d.filename);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(
      `Generated ${d.filename}: ${data.nodes.length} nodes, ${data.segments.length} segments, ${data.pois.length} POIs, ${data.lots?.length ?? 0} lots`
    );
  }

  const world = genWorld();
  const worldPath = path.resolve('data/world.json');
  fs.writeFileSync(worldPath, JSON.stringify(world, null, 2), 'utf-8');
  console.log(
    `Generated world.json: ${world.districts.length} districts, ${world.connectors?.length ?? 0} connectors, ${world.flyovers?.length ?? 0} flyovers`
  );
}
