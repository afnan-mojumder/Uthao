import fs from 'node:fs';
import path from 'node:path';
import { Rng, hashSeed } from '../src/core/rng';
import { clamp } from '../src/core/math';
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
  signalColumns?: number[];
  signalExtraNodes?: string[];
  northRows?: number;
  southRows?: number;
  dividedBoulevardCol?: number;
  arterialYGap?: number;
  lotWidthRange?: [number, number];
  lotDepthRange?: [number, number];
  /** External connector corridors exiting border nodes so lots never overlap cross-district roads. */
  connectorExits?: { fromRawNodeId: string; toX: number; toZ: number; width: number }[];
  /** Optional internal service loops (e.g. Gulbari diplomatic enclave service roads). */
  serviceLoops?: boolean;
}

interface RoadObb {
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
  yaw: number;
}

export function renderRoadWidth(seg: Pick<RoadSegment, 'divided' | 'roadType'>): number {
  if (seg.divided) return 14.0;
  switch (seg.roadType) {
    case 'flyover':
      return 12.0;
    case 'main':
      return 10.0;
    case 'residential':
    case 'service':
      return 8.0;
    case 'market':
      return 6.0;
    case 'alley':
      return 4.0;
    default:
      return 7.0;
  }
}

function obbOverlaps(
  ax: number,
  az: number,
  ahx: number,
  ahz: number,
  ayaw: number,
  bx: number,
  bz: number,
  bhx: number,
  bhz: number,
  byaw: number,
  margin = 0
): boolean {
  const aux = Math.cos(ayaw);
  const auz = -Math.sin(ayaw);
  const avx = Math.sin(ayaw);
  const avz = Math.cos(ayaw);
  const bux = Math.cos(byaw);
  const buz = -Math.sin(byaw);
  const bvx = Math.sin(byaw);
  const bvz = Math.cos(byaw);
  const dx = bx - ax;
  const dz = bz - az;

  const separated = (tx: number, tz: number) => {
    const dist = Math.abs(dx * tx + dz * tz);
    const rA = ahx * Math.abs(aux * tx + auz * tz) + ahz * Math.abs(avx * tx + avz * tz);
    const rB = bhx * Math.abs(bux * tx + buz * tz) + bhz * Math.abs(bvx * tx + bvz * tz);
    return dist >= rA + rB + margin - 1e-4;
  };

  return !(
    separated(aux, auz) ||
    separated(avx, avz) ||
    separated(bux, buz) ||
    separated(bvx, bvz)
  );
}

function lotInsideBounds(
  cx: number,
  cz: number,
  halfX: number,
  halfZ: number,
  yaw: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  const absCos = Math.abs(Math.cos(yaw));
  const absSin = Math.abs(Math.sin(yaw));
  const ex = absCos * halfX + absSin * halfZ;
  const ez = absSin * halfX + absCos * halfZ;
  return cx - ex >= minX && cx + ex <= maxX && cz - ez >= minZ && cz + ez <= maxZ;
}

function buildColumns(
  originX: number,
  W: number,
  edgeMargin: number,
  blockM: [number, number],
  organic: number,
  rng: Rng
): number[] {
  const minB = Math.max(45, blockM[0]);
  const maxB = Math.max(minB, blockM[1]);
  const spanX = W - 2 * edgeMargin;
  const targetB = (minB + maxB) / 2;
  const intervals = clamp(Math.round(spanX / targetB), 3, 8);
  const baseStep = spanX / intervals;

  const cols: number[] = [];
  for (let i = 0; i <= intervals; i++) {
    if (i === 0) {
      cols.push(originX + edgeMargin);
    } else if (i === intervals) {
      cols.push(originX + W - edgeMargin);
    } else {
      const maxShift = Math.min(baseStep * 0.18, 16) * organic;
      const shift = rng.range(-maxShift, maxShift);
      const prev = cols[i - 1]!;
      const raw = originX + edgeMargin + i * baseStep + shift;
      const minAllowed = prev + Math.max(50, minB * 0.75);
      const remaining = intervals - i;
      const maxAllowed = originX + W - edgeMargin - remaining * Math.max(50, minB * 0.75);
      cols.push(Math.round(clamp(raw, minAllowed, maxAllowed)));
    }
  }
  return cols;
}

function distPointToSeg(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq <= 1e-6) return Math.hypot(px - ax, pz - az);
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / lenSq, 0, 1);
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
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
  const edgeMargin = Math.min(14, Math.floor(W * 0.05));

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
    signal = false,
    y?: number
  ): RoadNode {
    const id = rawId.startsWith(nodePrefix) && nodePrefix ? rawId : `${nodePrefix}${rawId}`;
    const node: RoadNode = {
      nodeId: id,
      x: Math.round(x),
      ...(y !== undefined ? { y } : {}),
      z: Math.round(z),
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
    const startId =
      nodePrefix && !rawStartId.startsWith(nodePrefix)
        ? `${nodePrefix}${rawStartId}`
        : rawStartId;
    const endId =
      nodePrefix && !rawEndId.startsWith(nodePrefix)
        ? `${nodePrefix}${rawEndId}`
        : rawEndId;
    const id = `S_${districtId}_${segCounter++}`;
    const seg: RoadSegment = {
      segmentId: id,
      startNodeId: startId,
      endNodeId: endId,
      width: Math.round(((opts.width ?? 8) * (style.roadWidthMod ?? 1.0)) * 10) / 10,
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

  const colsX = buildColumns(originX, W, edgeMargin, style.blockM, style.organic, rng);
  const numCols = colsX.length;
  const midCol = Math.floor(numCols / 2);
  const signalColSet = new Set<number>(
    style.signalColumns ?? (style.arterial.signalJunction ? [midCol] : [])
  );
  const signalExtraSet = new Set<string>(style.signalExtraNodes ?? []);

  // 1. Arterial Corridor across the center of the district
  const arterialZ = originZ + Math.round(H * 0.5);
  const arterialSpeed = style.arterial.speedLimit ?? 50;
  const arterialDensity = style.arterial.trafficDensity ?? 0.55;
  const baseArterialWidth = style.arterial.width ?? 12;
  const scaledArterialWidth = baseArterialWidth * (style.roadWidthMod ?? 1.0);

  if (style.arterial.divided) {
    // Separate divided carriageways art_n / art_s by >= width + 3.0m, with NO central medians on one-way carriageways
    const carriagewaySep = Math.max(
      style.arterialYGap ?? Math.ceil(scaledArterialWidth + 6.0),
      Math.ceil(scaledArterialWidth + 4.0)
    );
    const halfSep = Math.round(carriagewaySep / 2);
    const uturnStep = Math.max(1, Math.round(style.arterial.uturnEveryM / Math.max(80, (W - 2 * edgeMargin) / (numCols - 1))));

    for (let i = 0; i < numCols; i++) {
      const x = colsX[i]!;
      const isEndpoint = i === 0 || i === numCols - 1;
      const isCrossing = i === midCol;
      const isUturn = !isCrossing && (isEndpoint || i === 1 || i === numCols - 2 || i % uturnStep === 0);

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

      const isSignal = signalColSet.has(i);
      const isCrossingSignal = isSignal;
      const sSignal = isSignal && (i === midCol || signalColSet.size > 1);

      addNode(
        `art_n_${i}`,
        x,
        arterialZ - halfSep,
        isUturn ? 'uturn' : 'junction',
        nTags,
        isCrossingSignal
      );
      addNode(
        `art_s_${i}`,
        x,
        arterialZ + halfSep,
        isUturn ? 'uturn' : 'junction',
        sTags,
        sSignal
      );
    }

    for (let i = 0; i < numCols - 1; i++) {
      // North carriageway: Eastbound (oneWay: true, divided: false -> NO central median on 1-way carriageway)
      addSegment(`art_n_${i}`, `art_n_${i + 1}`, {
        width: baseArterialWidth,
        divided: false,
        lanes: 2,
        speedLimit: arterialSpeed,
        trafficDensity: arterialDensity,
        surfaceCondition: 0.95,
        roadType: 'main',
        oneWay: true,
        pickupPractical: true,
        tags: ['arterial', 'arterial_outer_north'],
      });

      // South carriageway: Westbound (oneWay: true, divided: false -> NO central median on 1-way carriageway)
      addSegment(`art_s_${i + 1}`, `art_s_${i}`, {
        width: baseArterialWidth,
        divided: false,
        lanes: 2,
        speedLimit: arterialSpeed,
        trafficDensity: arterialDensity,
        surfaceCondition: 0.95,
        roadType: 'main',
        oneWay: true,
        pickupPractical: true,
        tags: ['arterial', 'arterial_outer_south'],
      });
    }

    // Arterial U-turns & crossings linking art_n and art_s (combine tags if same column)
    for (let i = 0; i < numCols; i++) {
      const isEndpoint = i === 0 || i === numCols - 1;
      const isCrossing = i === midCol;
      const isUturn = !isCrossing && (isEndpoint || i === 1 || i === numCols - 2 || i % uturnStep === 0);
      if (!isUturn && !isCrossing) continue;

      const tags: string[] = [];
      if (isUturn) tags.push('uturn');
      if (isCrossing) tags.push('crossing', 'footbridge');

      addSegment(`art_n_${i}`, `art_s_${i}`, {
        width: 8,
        speedLimit: 25,
        roadType: 'main',
        oneWay: false,
        divided: false,
        motorcycleAccessible: !isCrossing,
        pickupPractical: !isCrossing,
        pedestrianDensity: isCrossing ? 0.6 : 0.2,
        tags,
      });
    }
  } else {
    // Undivided organic main bazaar spine (e.g. Puran Para: NO 8-lane divided clone)
    for (let i = 0; i < numCols; i++) {
      const x = colsX[i]!;
      const isInterior = i > 0 && i < numCols - 1;
      const jitterZ = isInterior ? rng.range(-18, 18) * style.organic : 0;
      const isCrossing = i === midCol;
      const tags = isCrossing ? ['crossing'] : [];
      const isSignal = signalColSet.has(i);
      addNode(`art_${i}`, x, arterialZ + jitterZ, 'junction', tags, isSignal);
    }

    for (let i = 0; i < numCols - 1; i++) {
      addSegment(`art_${i}`, `art_${i + 1}`, {
        width: baseArterialWidth,
        divided: false,
        lanes: 2,
        speedLimit: arterialSpeed,
        trafficDensity: arterialDensity,
        surfaceCondition: 0.78,
        pedestrianDensity: 0.55,
        roadType: 'main',
        oneWay: false,
        pickupPractical: true,
        tags: ['arterial'],
      });
    }
  }

  // 2. North & South Residential / Market Grids driven by blockM & marketStreets
  const avgBlock = (style.blockM[0] + style.blockM[1]) / 2;
  const numNorthRows = style.northRows ?? (avgBlock < 90 ? 3 : 2);
  const numSouthRows = style.southRows ?? (avgBlock < 90 ? 3 : 2);

  const computeRowZs = (count: number, isNorth: boolean): number[] => {
    const zs: number[] = [];
    if (count === 3) {
      const ratios = isNorth ? [0.09, 0.225, 0.36] : [0.64, 0.775, 0.91];
      for (const r of ratios) zs.push(originZ + Math.round(H * r));
    } else {
      const r1 = avgBlock >= 150 ? 0.115 : 0.13;
      const r2 = avgBlock >= 150 ? 0.32 : 0.305;
      const ratios = isNorth ? [r1, r2] : [1 - r2, 1 - r1];
      for (const r of ratios) zs.push(originZ + Math.round(H * r));
    }
    return zs;
  };

  const northZs = computeRowZs(numNorthRows, true);
  const southZs = computeRowZs(numSouthRows, false);

  const divCol =
    style.arterial.divided
      ? (style.dividedBoulevardCol ?? (numCols > 3 ? 1 : undefined))
      : undefined;

  const createGridNodes = (prefix: 'n' | 's', rowZs: number[]) => {
    for (let row = 0; row < rowZs.length; row++) {
      const baseZ = rowZs[row]!;
      const rowNum = row + 1;
      for (let col = 0; col < numCols; col++) {
        const xBase = colsX[col]!;
        const isBorderX = col === 0 || col === numCols - 1;
        const isNorthBorderLink = prefix === 'n' && row === 0;
        const isSouthBorderLink = prefix === 's' && row === rowZs.length - 1;
        const jitterX =
          !isBorderX && !isNorthBorderLink && !isSouthBorderLink
            ? rng.range(-12, 12) * style.organic
            : 0;
        const jitterZ =
          !isNorthBorderLink && !isSouthBorderLink
            ? rng.range(-10, 10) * style.organic
            : 0;
        const rawId = `res_${prefix}${rowNum}_${col}`;
        const fullId = `${nodePrefix}${rawId}`;
        const tags = prefix === 'n' ? ['speed_bump'] : [];
        const sig = signalExtraSet.has(rawId) || signalExtraSet.has(fullId);
        addNode(rawId, xBase + jitterX, baseZ + jitterZ, 'junction', tags, sig);
      }
    }
  };

  createGridNodes('n', northZs);
  createGridNodes('s', southZs);

  // Market street assignments based on style.marketStreets (0..3)
  const isMarketRow = (prefix: 'n' | 's', rowNum: number): boolean => {
    if (style.marketStreets <= 0) return false;
    if (prefix === 's' && rowNum === 1) return true; // 1+ -> South Row 1
    if (style.marketStreets >= 2 && prefix === 'n' && rowNum === numNorthRows) return true; // 2+ -> North Row 2
    if (style.marketStreets >= 3 && prefix === 's' && rowNum === numSouthRows) return true; // 3+ -> South Row last
    return false;
  };

  const addStreetSegments = (prefix: 'n' | 's', rowZs: number[]) => {
    // Horizontal rows
    for (let row = 0; row < rowZs.length; row++) {
      const rowNum = row + 1;
      const market = isMarketRow(prefix, rowNum);
      for (let col = 0; col < numCols - 1; col++) {
        const isFloodProne = prefix === 'n' && rowNum === 1 && col === 0;
        if (market) {
          addSegment(`res_${prefix}${rowNum}_${col}`, `res_${prefix}${rowNum}_${col + 1}`, {
            width: 7,
            speedLimit: 22,
            surfaceCondition: 0.65,
            trafficDensity: 0.72,
            pedestrianDensity: 0.85,
            roadType: 'market',
            tags: ['market'],
          });
        } else {
          addSegment(`res_${prefix}${rowNum}_${col}`, `res_${prefix}${rowNum}_${col + 1}`, {
            width: 8,
            speedLimit: 30,
            surfaceCondition: isFloodProne ? 0.6 : 0.85,
            floodSensitivity: isFloodProne ? 0.85 : 0.2,
            roadType: 'residential',
            tags: prefix === 'n' ? ['speed_bump'] : [],
          });
        }
      }
    }

    // Vertical N-S connections between rows
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < rowZs.length - 1; row++) {
        const rA = row + 1;
        const rB = row + 2;
        const isMarketNs = style.marketStreets >= 3 && col === midCol;
        if (isMarketNs) {
          addSegment(`res_${prefix}${rA}_${col}`, `res_${prefix}${rB}_${col}`, {
            width: 7,
            speedLimit: 22,
            surfaceCondition: 0.68,
            trafficDensity: 0.7,
            pedestrianDensity: 0.8,
            roadType: 'market',
            tags: ['market'],
          });
        } else {
          addSegment(`res_${prefix}${rA}_${col}`, `res_${prefix}${rB}_${col}`, {
            width: 8,
            speedLimit: 30,
            roadType: 'residential',
            tags: prefix === 'n' ? ['speed_bump'] : [],
          });
        }
      }

      // Connect innermost row to arterial corridor
      const innerRow = prefix === 'n' ? rowZs.length : 1;
      const artTarget = style.arterial.divided
        ? prefix === 'n'
          ? `art_n_${col}`
          : `art_s_${col}`
        : `art_${col}`;

      const isTwoWayDividedBoulevard =
        style.arterial.divided && divCol !== undefined && col === divCol && prefix === 'n';

      if (isTwoWayDividedBoulevard) {
        // Two-way divided main boulevard (oneWay: false, divided: true -> real raised median between opposing lanes)
        addSegment(`res_${prefix}${innerRow}_${col}`, artTarget, {
          width: 14 / (style.roadWidthMod ?? 1.0),
          speedLimit: 45,
          trafficDensity: arterialDensity * 0.9,
          lanes: 4,
          oneWay: false,
          divided: true,
          roadType: 'main',
          tags: ['arterial'],
        });
      } else {
        addSegment(
          prefix === 'n' ? `res_${prefix}${innerRow}_${col}` : artTarget,
          prefix === 'n' ? artTarget : `res_${prefix}${innerRow}_${col}`,
          {
            width: 9,
            speedLimit: 35,
            roadType: 'main',
          }
        );
      }
    }
  };

  addStreetSegments('n', northZs);
  addStreetSegments('s', southZs);

  // 3. Procedural Service Loops (when enabled) & Alley Network driven by style.alleyDensity
  // Generate inside block interiors so they never cross existing roads.
  interface BlockBox {
    tl: string;
    tr: string;
    bl: string;
    br: string;
  }
  const blocks: BlockBox[] = [];
  for (let row = 0; row < northZs.length - 1; row++) {
    for (let col = 0; col < numCols - 1; col++) {
      blocks.push({
        tl: `res_n${row + 1}_${col}`,
        tr: `res_n${row + 1}_${col + 1}`,
        bl: `res_n${row + 2}_${col}`,
        br: `res_n${row + 2}_${col + 1}`,
      });
    }
  }
  for (let row = 0; row < southZs.length - 1; row++) {
    for (let col = 0; col < numCols - 1; col++) {
      blocks.push({
        tl: `res_s${row + 1}_${col}`,
        tr: `res_s${row + 1}_${col + 1}`,
        bl: `res_s${row + 2}_${col}`,
        br: `res_s${row + 2}_${col + 1}`,
      });
    }
  }

  const getNode = (rawId: string): RoadNode => {
    const id = nodePrefix && !rawId.startsWith(nodePrefix) ? `${nodePrefix}${rawId}` : rawId;
    return nodeMap.get(id)!;
  };

  const usedBlockIndices = new Set<number>();

  // Optional diplomatic/corporate service access roads inside large blocks (e.g. Gulbari)
  if (style.serviceLoops && blocks.length >= 2) {
    let svcIdx = 1;
    let loopCount = 0;
    for (let b = 0; b < blocks.length && loopCount < 4; b++) {
      const blk = blocks[b]!;
      const nTL = getNode(blk.tl);
      const nTR = getNode(blk.tr);
      const nBL = getNode(blk.bl);
      const nBR = getNode(blk.br);
      if (!nTL || !nTR || !nBL || !nBR) continue;
      const bw = Math.min(nTR.x - nTL.x, nBR.x - nBL.x);
      const bh = Math.min(nBL.z - nTL.z, nBR.z - nTR.z);
      if (bw < 150 || bh < 100) continue;

      const yMid = Math.round((nTL.z + nBL.z) / 2);
      const x1 = Math.round(nTL.x + bw * 0.32);
      const x2 = Math.round(nTL.x + bw * 0.68);
      const s1 = addNode(`svc_${svcIdx++}`, x1, yMid, 'junction', ['service']);
      const s2 = addNode(`svc_${svcIdx++}`, x2, yMid, 'junction', ['service']);
      addSegment(blk.tl, s1.nodeId, {
        width: 7,
        speedLimit: 25,
        roadType: 'service',
        pickupPractical: true,
        tags: ['service'],
      });
      addSegment(s1.nodeId, s2.nodeId, {
        width: 7,
        speedLimit: 25,
        roadType: 'service',
        pickupPractical: true,
        tags: ['service'],
      });
      addSegment(s2.nodeId, blk.tr, {
        width: 7,
        speedLimit: 25,
        roadType: 'service',
        pickupPractical: true,
        tags: ['service'],
      });
      usedBlockIndices.add(b);
      loopCount++;
    }
  }

  const isClearOfSegments = (px: number, pz: number, minDistM: number): boolean => {
    for (const seg of segments) {
      const s = nodeMap.get(seg.startNodeId);
      const e = nodeMap.get(seg.endNodeId);
      if (!s || !e) continue;
      if (distPointToSeg(px, pz, s.x, s.z, e.x, e.z) < minDistM) {
        return false;
      }
    }
    return true;
  };

  // Desired alley chain count scales directly with alleyDensity * block count
  const targetAlleyChains = Math.max(
    2,
    Math.min(blocks.length - usedBlockIndices.size, Math.round(style.alleyDensity * blocks.length * 1.6) + 1)
  );

  // Deterministic order of available blocks via seeded shuffle
  const blockOrder = blocks
    .map((blk, idx) => ({ blk, idx }))
    .filter(({ idx }) => !usedBlockIndices.has(idx))
    .map(({ blk }) => blk);
  for (let i = blockOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const tmp = blockOrder[i]!;
    blockOrder[i] = blockOrder[j]!;
    blockOrder[j] = tmp;
  }

  let accessibleCount = 0;
  let inaccessibleCount = 0;
  let alleyIdx = 1;

  for (let b = 0; b < blockOrder.length && (accessibleCount + inaccessibleCount < targetAlleyChains || inaccessibleCount === 0 || accessibleCount === 0); b++) {
    const blk = blockOrder[b]!;
    const nTL = getNode(blk.tl);
    const nTR = getNode(blk.tr);
    const nBL = getNode(blk.bl);
    const nBR = getNode(blk.br);
    if (!nTL || !nTR || !nBL || !nBR) continue;

    const midX = (nTL.x + nTR.x + nBL.x + nBR.x) / 4;
    const midZ = (nTL.z + nTR.z + nBL.z + nBR.z) / 4;
    const blockW = Math.min(nTR.x - nTL.x, nBR.x - nBL.x);
    const blockH = Math.min(nBL.z - nTL.z, nBR.z - nTR.z);
    if (blockW < 55 || blockH < 55) continue;

    const wantInaccessible =
      inaccessibleCount === 0 ||
      (accessibleCount > 0 && b % 2 === 1 && inaccessibleCount < Math.ceil(targetAlleyChains * 0.45));

    const jitterX = rng.range(-blockW * 0.12, blockW * 0.12) * style.organic;
    const jitterZ = rng.range(-blockH * 0.12, blockH * 0.12) * style.organic;
    const cx = midX + jitterX;
    const cz = midZ + jitterZ;

    if (!isClearOfSegments(cx, cz, 16)) continue;

    if (!wantInaccessible) {
      // Motorcycle-accessible shortcut alley cutting diagonally through the block
      const flip = b % 2 === 0;
      const startCorner = flip ? blk.tl : blk.tr;
      const endCorner = flip ? blk.br : blk.bl;
      const midNode = addNode(`alley_mid_${alleyIdx++}`, cx, cz, 'junction', ['alley']);
      addSegment(startCorner, midNode.nodeId, {
        width: 3.5,
        speedLimit: 20,
        roadType: 'alley',
        motorcycleAccessible: true,
        pickupPractical: true,
        pedestrianDensity: 0.45,
        tags: ['alley'],
      });
      addSegment(midNode.nodeId, endCorner, {
        width: 3.5,
        speedLimit: 20,
        roadType: 'alley',
        motorcycleAccessible: true,
        pickupPractical: true,
        pedestrianDensity: 0.45,
        tags: ['alley'],
      });
      accessibleCount++;
    } else if (b % 3 === 0) {
      // Narrow pedestrian-only dead-end gully inside the block
      const deadNode = addNode(`alley_dead_${alleyIdx++}`, cx, cz, 'deadEnd', ['alley']);
      addSegment(blk.br, deadNode.nodeId, {
        width: 2.5,
        speedLimit: 15,
        roadType: 'alley',
        motorcycleAccessible: false,
        pickupPractical: false,
        pedestrianDensity: 0.65,
        tags: ['alley', 'deadend'],
      });
      inaccessibleCount++;
    } else {
      // Narrow pedestrian-only gated cut-through
      const gateNode = addNode(`alley_gate_${alleyIdx++}`, cx, cz, 'junction', ['alley']);
      addSegment(blk.tl, gateNode.nodeId, {
        width: 2.5,
        speedLimit: 15,
        roadType: 'alley',
        motorcycleAccessible: false,
        pickupPractical: false,
        pedestrianDensity: 0.7,
        tags: ['alley', 'pedestrian_only'],
      });
      addSegment(gateNode.nodeId, blk.tr, {
        width: 2.5,
        speedLimit: 15,
        roadType: 'alley',
        motorcycleAccessible: false,
        pickupPractical: false,
        pedestrianDensity: 0.7,
        tags: ['alley', 'pedestrian_only'],
      });
      inaccessibleCount++;
    }
  }

  // 4. Place POIs (all on pickupPractical segments)
  if (style.pois && style.pois.length > 0) {
    pois.push(...style.pois);
  } else if (districtId === 'mirpara') {
    pois.push(
      { id: 'poi_mirpara_home', kind: 'home', nodeId: 'res_n2_0', nameKey: 'poi.mirpara.rafi_home' },
      { id: 'poi_mirpara_tea_stall', kind: 'teaStall', nodeId: 'res_n2_1', nameKey: 'poi.mirpara.tea_stall' },
      { id: 'poi_mirpara_fuel', kind: 'fuel', nodeId: 'art_s_1', nameKey: 'poi.mirpara.fuel' },
      { id: 'poi_mirpara_garage', kind: 'garage', nodeId: 'res_s1_0', nameKey: 'poi.mirpara.garage' },
      { id: 'poi_mirpara_school', kind: 'school', nodeId: 'res_n1_2', nameKey: 'poi.mirpara.school' },
      { id: 'poi_mirpara_pharmacy', kind: 'pharmacy', nodeId: 'res_s1_2', nameKey: 'poi.mirpara.pharmacy' },
      { id: 'poi_mirpara_campus_gate', kind: 'officeGate', nodeId: 'res_n1_1', nameKey: 'poi.mirpara.campus_gate' },
      { id: 'poi_mirpara_footbridge', kind: 'crossing', nodeId: 'art_n_2', nameKey: 'poi.mirpara.footbridge' },
      { id: 'poi_mirpara_bazaar', kind: 'market', nodeId: 'res_s1_1', nameKey: 'poi.mirpara.bazaar' },
      { id: 'poi_mirpara_bus_stand', kind: 'busStop', nodeId: 'art_s_3', nameKey: 'poi.mirpara.bus_stand' },
      { id: 'poi_mirpara_clinic', kind: 'hospital', nodeId: 'res_s2_1', nameKey: 'poi.mirpara.clinic' },
      { id: 'poi_mirpara_green_tower', kind: 'apartment', nodeId: 'res_n2_3', nameKey: 'poi.mirpara.green_tower' }
    );
  }

  // 5. Custom extra nodes and segments (e.g. Mohakhal flyover)
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

  // 6. Precompute all non-flyover road+sidewalk OBBs for strict overlap-free lot placement
  const roadObbs: RoadObb[] = [];
  const nodeMaxClearance = new Map<string, number>();

  for (const seg of segments) {
    if (seg.roadType === 'flyover') continue;
    const sNode = nodeMap.get(seg.startNodeId);
    const eNode = nodeMap.get(seg.endNodeId);
    if (!sNode || !eNode) continue;

    const dx = eNode.x - sNode.x;
    const dz = eNode.z - sNode.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) continue;

    const roadW = Math.max(seg.width, renderRoadWidth(seg));
    const sidewalkW = seg.roadType === 'alley' ? 0.28 : 1.88;
    const halfLateral = roadW / 2 + sidewalkW;

    roadObbs.push({
      cx: (sNode.x + eNode.x) / 2,
      cz: (sNode.z + eNode.z) / 2,
      halfX: halfLateral,
      halfZ: len / 2,
      yaw: Math.atan2(dx, dz),
    });

    nodeMaxClearance.set(
      seg.startNodeId,
      Math.max(nodeMaxClearance.get(seg.startNodeId) ?? 0, halfLateral)
    );
    nodeMaxClearance.set(
      seg.endNodeId,
      Math.max(nodeMaxClearance.get(seg.endNodeId) ?? 0, halfLateral)
    );
  }

  // Also reserve a virtual median corridor OBB between split art_n / art_s carriageways
  // so no buildings ever get dropped inside the divided arterial median or flyover footprint.
  if (style.arterial.divided) {
    const firstN = getNode('art_n_0');
    const lastN = getNode(`art_n_${numCols - 1}`);
    const firstS = getNode('art_s_0');
    if (firstN && lastN && firstS) {
      const medHalfZ = Math.abs(firstS.z - firstN.z) / 2 + 2;
      roadObbs.push({
        cx: (firstN.x + lastN.x) / 2,
        cz: (firstN.z + firstS.z) / 2,
        halfX: (lastN.x - firstN.x) / 2,
        halfZ: medHalfZ,
        yaw: 0,
      });
    }
  }

  if (style.connectorExits) {
    for (const exit of style.connectorExits) {
      const fromNode = getNode(exit.fromRawNodeId);
      if (!fromNode) continue;
      const dx = exit.toX - fromNode.x;
      const dz = exit.toZ - fromNode.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.1) continue;
      roadObbs.push({
        cx: (fromNode.x + exit.toX) / 2,
        cz: (fromNode.z + exit.toZ) / 2,
        halfX: exit.width / 2 + 1.88,
        halfZ: len / 2,
        yaw: Math.atan2(dx, dz),
      });
    }
  }

  // 7. Generate varied continuous building lots (width: 10-22m, depth: 10-16m) on streets >= 35m
  const [lotWMin, lotWMax] = style.lotWidthRange ?? [11, 20];
  const [lotDMin, lotDMax] = style.lotDepthRange ?? [11, 15];
  const isCivicDistrict =
    style.demandZones?.some((z) => z === 'embassy' || z === 'university' || z === 'medical') ?? false;

  let lotCounter = 1;
  for (const seg of segments) {
    if (seg.roadType === 'flyover') continue;
    if (
      seg.tags.includes('uturn') ||
      seg.tags.includes('crossing') ||
      seg.tags.includes('footbridge')
    ) {
      continue;
    }

    const sNode = nodeMap.get(seg.startNodeId);
    const eNode = nodeMap.get(seg.endNodeId);
    if (!sNode || !eNode) continue;

    const dx = eNode.x - sNode.x;
    const dz = eNode.z - sNode.z;
    const len = Math.hypot(dx, dz);
    if (len < 35) continue;

    const ux = dx / len;
    const uz = dz / len;
    const nx = -uz;
    const nz = ux;

    const roadW = Math.max(seg.width, renderRoadWidth(seg));
    const sidewalkW = seg.roadType === 'alley' ? 0.28 : 1.88;

    const startClear = Math.max(12, (nodeMaxClearance.get(seg.startNodeId) ?? 6) + 2.5);
    const endClear = Math.max(12, (nodeMaxClearance.get(seg.endNodeId) ?? 6) + 2.5);
    if (len - startClear - endClear < 10) continue;

    // On split one-way arterial carriageways, only build on the outer side away from the central median
    const isOuterNorth = seg.tags.includes('arterial_outer_north');
    const isOuterSouth = seg.tags.includes('arterial_outer_south');
    const sides = isOuterNorth || isOuterSouth ? [-1] : [1, -1];

    for (const side of sides) {
      let s = startClear;
      while (s + 10 <= len - endClear) {
        let lotWidth = Math.round(rng.range(lotWMin, lotWMax));
        lotWidth = clamp(lotWidth, 10, 22);
        const remaining = len - endClear - s;
        if (lotWidth > remaining) {
          lotWidth = Math.floor(remaining);
          if (lotWidth < 10) break;
        }
        const lotDepth = clamp(Math.round(rng.range(lotDMin, lotDMax)), 10, 16);

        const along = s + lotWidth / 2;
        const offset = roadW / 2 + sidewalkW + lotDepth / 2 + 1.5;
        const cx = Math.round((sNode.x + ux * along + side * nx * offset) * 10) / 10;
        const cz = Math.round((sNode.z + uz * along + side * nz * offset) * 10) / 10;
        const facingHeading =
          Math.round((side > 0 ? Math.atan2(-nx, -nz) : Math.atan2(nx, nz)) * 10000) / 10000;

        let valid = lotInsideBounds(
          cx,
          cz,
          lotWidth / 2,
          lotDepth / 2,
          facingHeading,
          originX + 1.5,
          originX + W - 1.5,
          originZ + 1.5,
          originZ + H - 1.5
        );

        if (valid) {
          for (let r = 0; r < roadObbs.length; r++) {
            const ro = roadObbs[r]!;
            if (
              obbOverlaps(
                cx,
                cz,
                lotWidth / 2,
                lotDepth / 2,
                facingHeading,
                ro.cx,
                ro.cz,
                ro.halfX,
                ro.halfZ,
                ro.yaw,
                0.25
              )
            ) {
              valid = false;
              break;
            }
          }
        }

        if (valid) {
          for (let l = 0; l < lots.length; l++) {
            const other = lots[l]!;
            if (
              obbOverlaps(
                cx,
                cz,
                lotWidth / 2,
                lotDepth / 2,
                facingHeading,
                other.x,
                other.z,
                other.width / 2,
                other.depth / 2,
                other.facingHeading,
                0.6
              )
            ) {
              valid = false;
              break;
            }
          }
        }

        if (valid) {
          let zone: BuildingLot['zone'] = 'residential';
          if (seg.roadType === 'market' || seg.tags.includes('market')) {
            zone = 'market';
          } else if (seg.tags.includes('arterial') || seg.roadType === 'main') {
            zone = isCivicDistrict && rng.next() < 0.22 ? 'civic' : 'commercial';
          } else if (rng.next() < 0.15) {
            zone = 'commercial';
          }

          lots.push({
            lotId: `lot_${districtId}_${lotCounter++}`,
            x: cx,
            z: cz,
            width: lotWidth,
            depth: lotDepth,
            facingHeading,
            zone,
          });
        }

        s += lotWidth + rng.range(1.5, 3.5);
      }
    }
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
      blockM: [100, 160],
      arterial: {
        divided: true,
        uturnEveryM: 300,
      },
      alleyDensity: 0.3,
      marketStreets: 1,
      organic: 0.35,
      demandZones: ['residential', 'market', 'commercial', 'campus'],
      riskBase: 0.1,
      signalColumns: [2],
      dividedBoulevardCol: 1,
      arterialYGap: 18,
      lotWidthRange: [12, 20],
      lotDepthRange: [11, 15],
      connectorExits: [
        { fromRawNodeId: 'art_n_4', toX: 614, toZ: 291, width: 12 },
        { fromRawNodeId: 'art_s_4', toX: 614, toZ: 309, width: 12 },
        { fromRawNodeId: 'res_s2_1', toX: 157, toZ: 678, width: 8 },
        { fromRawNodeId: 'res_s2_2', toX: 300, toZ: 678, width: 8 },
      ],
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
      name: { bn: 'ফুলগেট', en: 'Fulgate' },
      origin: { x: 600, z: 0 },
      size: { width: 600, height: 600 },
      blockM: [75, 135],
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
      signalColumns: [1, 2],
      signalExtraNodes: ['fulgate_res_n2_2'],
      dividedBoulevardCol: 2,
      arterialYGap: 18,
      lotWidthRange: [12, 21],
      lotDepthRange: [12, 16],
      connectorExits: [
        { fromRawNodeId: 'fulgate_art_n_0', toX: 586, toZ: 291, width: 12 },
        { fromRawNodeId: 'fulgate_art_s_0', toX: 586, toZ: 309, width: 12 },
        { fromRawNodeId: 'fulgate_res_s2_1', toX: 728, toZ: 678, width: 10 },
        { fromRawNodeId: 'fulgate_res_s2_3', toX: 957, toZ: 678, width: 10 },
      ],
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
      marketStreets: 0,
      organic: 0.25,
      demandZones: ['residential', 'university', 'medical', 'dining'],
      riskBase: 0.08,
      signalColumns: [2],
      dividedBoulevardCol: 2,
      arterialYGap: 24,
      lotWidthRange: [13, 21],
      lotDepthRange: [12, 16],
      connectorExits: [
        { fromRawNodeId: 'dhanbagh_res_n1_1', toX: 157, toZ: 522, width: 8 },
        { fromRawNodeId: 'dhanbagh_res_n1_2', toX: 300, toZ: 522, width: 8 },
        { fromRawNodeId: 'dhanbagh_art_n_4', toX: 614, toZ: 888, width: 12 },
        { fromRawNodeId: 'dhanbagh_art_s_4', toX: 614, toZ: 912, width: 12 },
        { fromRawNodeId: 'dhanbagh_res_s2_1', toX: 177, toZ: 1254, width: 8 },
        { fromRawNodeId: 'dhanbagh_res_s2_2', toX: 341, toZ: 1254, width: 8 },
      ],
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
 * Mohakhal (Mohakhali): Intercity terminal, elevated flyover (y = 6.0m), bottlenecks.
 */
export function genMohakhal(seed: number | string = 104): DistrictData {
  const originX = 600;
  const originZ = 600;

  // Elevated Mohakhali Flyover deck (y = 6.0m) centered in the 24m arterial corridor (z = 900)
  // with sloped ramps rising from ground arterial endpoints (y = 0 -> 6.0)
  const flyNodes: RoadNode[] = [
    {
      nodeId: 'mohakhal_fly_w',
      x: originX + 114,
      y: 6.0,
      z: originZ + 300,
      kind: 'junction',
      tags: ['flyover'],
    },
    {
      nodeId: 'mohakhal_fly_mid',
      x: originX + 300,
      y: 6.0,
      z: originZ + 300,
      kind: 'junction',
      tags: ['flyover'],
    },
    {
      nodeId: 'mohakhal_fly_e',
      x: originX + 486,
      y: 6.0,
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
    // Eastbound on-ramp from ground arterial (y = 0 -> 6.0)
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
    // Eastbound off-ramp to ground arterial (y = 6.0 -> 0)
    {
      segmentId: 'S_mohakhal_ramp_eb_off',
      startNodeId: 'mohakhal_fly_e',
      endNodeId: 'mohakhal_art_n_5',
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
    // Westbound on-ramp from ground arterial (y = 0 -> 6.0)
    {
      segmentId: 'S_mohakhal_ramp_wb_on',
      startNodeId: 'mohakhal_art_s_5',
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
    // Westbound off-ramp to ground arterial (y = 6.0 -> 0)
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
      marketStreets: 0,
      organic: 0.3,
      demandZones: ['bus_terminal', 'commercial', 'medical'],
      riskBase: 0.12,
      signalColumns: [2, 3],
      dividedBoulevardCol: 3,
      arterialYGap: 24,
      lotWidthRange: [12, 20],
      lotDepthRange: [11, 15],
      connectorExits: [
        { fromRawNodeId: 'mohakhal_res_n1_1', toX: 714, toZ: 522, width: 10 },
        { fromRawNodeId: 'mohakhal_res_n1_3', toX: 943, toZ: 522, width: 10 },
        { fromRawNodeId: 'mohakhal_art_n_0', toX: 586, toZ: 888, width: 12 },
        { fromRawNodeId: 'mohakhal_art_s_0', toX: 586, toZ: 912, width: 12 },
        { fromRawNodeId: 'mohakhal_art_n_5', toX: 1214, toZ: 888, width: 14 },
        { fromRawNodeId: 'mohakhal_art_s_5', toX: 1214, toZ: 912, width: 14 },
        { fromRawNodeId: 'mohakhal_res_s2_1', toX: 757, toZ: 1278, width: 10 },
        { fromRawNodeId: 'mohakhal_res_s2_3', toX: 900, toZ: 1278, width: 10 },
      ],
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
 * Gulbari (Gulshan/Banani): Wider roads, superblocks, office towers, embassies, security gates.
 */
export function genGulbari(seed: number | string = 105): DistrictData {
  return genDistrict(
    {
      districtId: 'gulbari',
      name: { bn: 'গুলবাড়ি', en: 'Gulbari' },
      origin: { x: 1200, z: 600 },
      size: { width: 600, height: 600 },
      blockM: [130, 210],
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
      signalColumns: [1, 2],
      dividedBoulevardCol: 1,
      arterialYGap: 24,
      lotWidthRange: [16, 22],
      lotDepthRange: [13, 16],
      serviceLoops: true,
      connectorExits: [
        { fromRawNodeId: 'gulbari_art_n_0', toX: 1186, toZ: 888, width: 14 },
        { fromRawNodeId: 'gulbari_art_s_0', toX: 1186, toZ: 912, width: 14 },
      ],
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
 * Puran Para (Old Dhaka): Undivided organic narrow lanes, dense alleys & markets, difficult turns.
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
        divided: false,
        uturnEveryM: 150,
        speedLimit: 35,
        trafficDensity: 0.75,
        width: 9,
      },
      alleyDensity: 0.5,
      marketStreets: 3,
      organic: 0.85,
      roadWidthMod: 0.85,
      demandZones: ['heritage', 'spice_market', 'bakery', 'river_ghat'],
      riskBase: 0.22,
      signalColumns: [3, 5],
      northRows: 3,
      southRows: 3,
      lotWidthRange: [10, 15],
      lotDepthRange: [10, 13],
      connectorExits: [
        { fromRawNodeId: 'puranpara_res_n1_2', toX: 157, toZ: 1122, width: 8 },
        { fromRawNodeId: 'puranpara_res_n1_4', toX: 300, toZ: 1122, width: 8 },
        { fromRawNodeId: 'puranpara_art_7', toX: 614, toZ: 1491, width: 10 },
        { fromRawNodeId: 'puranpara_art_7', toX: 614, toZ: 1509, width: 10 },
      ],
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
          nodeId: 'puranpara_art_3',
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
      blockM: [95, 165],
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
      signalColumns: [2],
      signalExtraNodes: ['motinagar_res_n2_1'],
      dividedBoulevardCol: 2,
      arterialYGap: 18,
      lotWidthRange: [14, 22],
      lotDepthRange: [12, 16],
      connectorExits: [
        { fromRawNodeId: 'motinagar_res_n1_1', toX: 728, toZ: 1122, width: 10 },
        { fromRawNodeId: 'motinagar_res_n1_2', toX: 957, toZ: 1122, width: 10 },
        { fromRawNodeId: 'motinagar_art_n_0', toX: 586, toZ: 1500, width: 10 },
        { fromRawNodeId: 'motinagar_art_s_0', toX: 586, toZ: 1500, width: 10 },
      ],
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
    // 1. Mirpara East <-> Fulgate West (28m bridge)
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
      startNodeId: 'fulgate_res_s2_3',
      endNodeId: 'mohakhal_res_n1_3',
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

    // 4. Dhanbagh East <-> Mohakhal West (28m bridge)
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

    // 5. Mohakhal East <-> Gulbari West (28m bridge)
    {
      segmentId: 'CONN_mohakhal_gulbari_n',
      startNodeId: 'mohakhal_art_n_5',
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
      endNodeId: 'mohakhal_art_s_5',
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
    {
      segmentId: 'CONN_dhanbagh_puranpara_2',
      startNodeId: 'dhanbagh_res_s2_2',
      endNodeId: 'puranpara_res_n1_4',
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
      startNodeId: 'mohakhal_res_s2_3',
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

    // 8. Puranpara East <-> Motinagar West (29m bridge)
    {
      segmentId: 'CONN_puranpara_motinagar_n',
      startNodeId: 'puranpara_art_7',
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
      endNodeId: 'puranpara_art_7',
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
        name: { bn: 'ফুলগেট', en: 'Fulgate' },
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
