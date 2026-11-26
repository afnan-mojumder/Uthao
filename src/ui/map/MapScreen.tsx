import { useState, useEffect, useRef } from 'preact/hooks';
import { useModalFocusTrap } from '../focusTrap';
import { t, localDigits, getLanguage, getLocaleVersion } from '../i18n';
import { mapLayout } from './mapLayout';
import {
  HAS_DHAKA_MAP_ASSET,
  getDefaultWorldData,
  getDefaultDistrictsSync,
  loadAllDistricts as defaultLoadAllDistricts,
} from './worldAccessor';
import { Z_LAYER } from '../store';
import { RoadNetwork } from '../../sim/road/RoadNetwork';
import type { DistrictId, RoadNode, RoadSegment } from '../../core/types';
import type { DistrictData, Poi, WorldData } from '../../sim/schemas';
import {
  IconClose,
  IconFuel,
  IconMap,
  IconMapPin,
  IconWrench,
  IconStar,
  IconWarning,
} from '../components/icons';

export interface MapRoadEventMarker {
  id: string;
  nodeId: string;
  type: string;
  severity: number;
  x?: number;
  z?: number;
}

export interface MapBounds3D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  spanX: number;
  spanZ: number;
}

export interface MapTransformOptions {
  zoom?: number;
  dpr?: number;
  padX?: number;
  padTop?: number;
  padBottom?: number;
}

export interface MapNodePoint {
  nodeId: string;
  districtId: DistrictId | (string & {});
  x: number;
  z: number;
  isConnector: boolean;
}

export interface MapPoiPoint extends Poi {
  x: number;
  z: number;
}

export interface MapConnectorLink {
  id: string;
  fromNode: string;
  toNode: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
}

export interface MapDistrictSummary {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
}

export interface MapModel {
  districts: MapDistrictSummary[];
  nodes: MapNodePoint[];
  segments: RoadSegment[];
  connectors: MapConnectorLink[];
  pois: MapPoiPoint[];
  bounds: MapBounds3D;
  routePoints: Array<{ nodeId: string; x: number; z: number }>;
  pickupPoint: { nodeId: string; x: number; z: number } | null;
  dropoffPoint: { nodeId: string; x: number; z: number } | null;
  waypointPoint: { nodeId: string; x: number; z: number } | null;
  eventPoints: Array<{ id: string; nodeId: string; type: string; severity: number; x: number; z: number }>;
  storyPoints: Array<{ nodeId: string; x: number; z: number }>;
  nodeMap: Map<string, RoadNode>;
  isWorldScale: boolean;
}

export type MapHitResult =
  | { kind: 'poi'; poi: MapPoiPoint }
  | { kind: 'node'; node: MapNodePoint }
  | { kind: 'none' };

export interface MapLegendItem {
  id: string;
  labelKey: string;
  color: string;
  shape: 'line' | 'dashed' | 'fill' | 'dot' | 'ring' | 'triangle' | 'star' | 'diamond';
}

export const MAP_LEGEND_ITEMS: MapLegendItem[] = [
  { id: 'road', labelKey: 'map.legend_road', color: '#94A3B8', shape: 'line' },
  { id: 'connector', labelKey: 'map.legend_connector', color: '#F59E0B', shape: 'dashed' },
  { id: 'river', labelKey: 'map.legend_river', color: '#38BDF8', shape: 'fill' },
  { id: 'greenery', labelKey: 'map.legend_greenery', color: '#22C55E', shape: 'fill' },
  { id: 'route', labelKey: 'map.legend_route', color: '#22D3EE', shape: 'line' },
  { id: 'player', labelKey: 'map.legend_player', color: '#22D3EE', shape: 'dot' },
  { id: 'pickup', labelKey: 'map.legend_pickup', color: '#22C55E', shape: 'ring' },
  { id: 'dropoff', labelKey: 'map.legend_dropoff', color: '#3B82F6', shape: 'ring' },
  { id: 'event', labelKey: 'map.legend_event', color: '#EF4444', shape: 'triangle' },
  { id: 'story', labelKey: 'map.legend_story', color: '#A855F7', shape: 'star' },
  { id: 'fuel', labelKey: 'map.poi_fuel', color: '#F59E0B', shape: 'diamond' },
  { id: 'garage', labelKey: 'map.poi_garage', color: '#10B981', shape: 'diamond' },
  { id: 'tea', labelKey: 'map.poi_tea', color: '#FB7185', shape: 'dot' },
  { id: 'waypoint', labelKey: 'map.legend_waypoint', color: '#FBBF24', shape: 'star' },
];

const PROTOTYPE_GREENERY_ZONES: Array<{ points: Array<[number, number]> }> = [
  { points: [[20, 40], [180, 40], [195, 135], [20, 145]] },
  { points: [[520, 980], [720, 960], [740, 1185], [530, 1200]] },
  { points: [[1540, 680], [1760, 680], [1760, 860], [1560, 850]] },
  { points: [[40, 1590], [210, 1590], [210, 1730], [40, 1730]] },
];

const PROTOTYPE_WATER_POLYGONS: Array<{ points: Array<[number, number]> }> = [
  { points: [[200, 740], [290, 725], [375, 790], [345, 920], [235, 935], [175, 845]] },
  { points: [[1145, 700], [1235, 710], [1265, 875], [1230, 1020], [1160, 985], [1135, 835]] },
];

const PROTOTYPE_RIVER_CHANNEL: Array<[number, number]> = [
  [-20, 1785],
  [210, 1800],
  [520, 1820],
  [840, 1795],
  [1210, 1825],
];

export interface BuildMapModelOptions {
  roadNetwork: RoadNetwork;
  worldData?: WorldData;
  playerPos?: { x: number; z: number };
  routeNodes?: string[];
  pickupNodeId?: string | null;
  dropoffNodeId?: string | null;
  waypointNodeId?: string | null;
  roadEvents?: MapRoadEventMarker[];
  storyNodeIds?: string[];
}

/** Projects a world `(x, z)` coordinate into CSS canvas pixels `(x, y)`. */
export function worldToMap(
  x: number,
  z: number,
  bounds: MapBounds3D,
  width: number,
  height: number,
  opts: MapTransformOptions = {}
): { x: number; y: number } {
  const zoom = opts.zoom ?? 1;
  if (opts.padX !== undefined || opts.padTop !== undefined || opts.padBottom !== undefined) {
    const padX = opts.padX ?? 24;
    const padTop = opts.padTop ?? 72;
    const padBottom = opts.padBottom ?? 36;
    const availW = Math.max(40, width - padX * 2);
    const availH = Math.max(40, height - padTop - padBottom);
    const baseScale = Math.min(availW / bounds.spanX, availH / bounds.spanZ) * zoom;
    const drawnW = bounds.spanX * baseScale;
    const drawnH = bounds.spanZ * baseScale;
    const originX = padX + (availW - drawnW) / 2;
    const originY = padTop + (availH - drawnH) / 2;
    return {
      x: originX + (x - bounds.minX) * baseScale,
      y: originY + (z - bounds.minZ) * baseScale,
    };
  }

  const dpr = opts.dpr ?? 1;
  const { scale, offsetX, offsetZ } = mapLayout(width * dpr, height * dpr, dpr, bounds, zoom);
  return {
    x: (x * scale + offsetX) / dpr,
    y: (z * scale + offsetZ) / dpr,
  };
}

/** Builds a normalized map view-model from `RoadNetwork` and live HUD/trip signals. */
export function buildMapModel(options: BuildMapModelOptions): MapModel {
  const {
    roadNetwork,
    worldData,
    routeNodes = [],
    pickupNodeId = null,
    dropoffNodeId = null,
    waypointNodeId = null,
    roadEvents = [],
    storyNodeIds = [],
  } = options;

  const rawNodes = roadNetwork.getAllNodes();
  const segments = roadNetwork.getAllSegments();
  const rawPois = roadNetwork.getPois();

  const nodeMap = new Map<string, RoadNode>();
  const nodes: MapNodePoint[] = [];
  const districtBounds = new Map<
    string,
    { minX: number; maxX: number; minZ: number; maxZ: number }
  >();

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const n of rawNodes) {
    nodeMap.set(n.nodeId, n);
    const dId = roadNetwork.getNodeDistrict(n.nodeId) ?? 'mirpara';
    nodes.push({
      nodeId: n.nodeId,
      districtId: dId,
      x: n.x,
      z: n.z,
      isConnector: Boolean(n.tags?.includes('connector') || n.tags?.includes('border')),
    });
    if (n.x < minX) minX = n.x;
    if (n.x > maxX) maxX = n.x;
    if (n.z < minZ) minZ = n.z;
    if (n.z > maxZ) maxZ = n.z;

    const db = districtBounds.get(dId);
    if (!db) {
      districtBounds.set(dId, { minX: n.x, maxX: n.x, minZ: n.z, maxZ: n.z });
    } else {
      if (n.x < db.minX) db.minX = n.x;
      if (n.x > db.maxX) db.maxX = n.x;
      if (n.z < db.minZ) db.minZ = n.z;
      if (n.z > db.maxZ) db.maxZ = n.z;
    }
  }

  const pois: MapPoiPoint[] = [];
  for (const p of rawPois) {
    const anchor = nodeMap.get(p.nodeId);
    if (!anchor) continue;
    pois.push({
      ...p,
      x: anchor.x,
      z: anchor.z,
    });
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    maxX = 600;
    minZ = 0;
    maxZ = 600;
  }

  const bounds: MapBounds3D = {
    minX,
    maxX,
    minZ,
    maxZ,
    spanX: maxX - minX || 500,
    spanZ: maxZ - minZ || 500,
  };

  const districts: MapDistrictSummary[] = [];
  if (worldData && worldData.districts.length > 0 && districtBounds.size > 1) {
    for (const d of worldData.districts) {
      const db = districtBounds.get(d.districtId);
      const bMinX = db?.minX ?? d.bounds.minX;
      const bMaxX = db?.maxX ?? d.bounds.maxX;
      const bMinZ = db?.minZ ?? d.bounds.minZ;
      const bMaxZ = db?.maxZ ?? d.bounds.maxZ;
      districts.push({
        id: d.districtId,
        minX: bMinX,
        maxX: bMaxX,
        minZ: bMinZ,
        maxZ: bMaxZ,
        centerX: (bMinX + bMaxX) / 2,
        centerZ: (bMinZ + bMaxZ) / 2,
      });
    }
  } else {
    for (const [id, db] of districtBounds.entries()) {
      districts.push({
        id,
        minX: db.minX,
        maxX: db.maxX,
        minZ: db.minZ,
        maxZ: db.maxZ,
        centerX: (db.minX + db.maxX) / 2,
        centerZ: (db.minZ + db.maxZ) / 2,
      });
    }
  }

  const connectors: MapConnectorLink[] = [];
  const rawConnectors: RoadSegment[] = worldData?.connectors ?? [];
  for (const conn of rawConnectors) {
    const a = nodeMap.get(conn.startNodeId);
    const b = nodeMap.get(conn.endNodeId);
    if (!a || !b) continue;
    connectors.push({
      id: conn.segmentId,
      fromNode: conn.startNodeId,
      toNode: conn.endNodeId,
      fromX: a.x,
      fromZ: a.z,
      toX: b.x,
      toZ: b.z,
    });
  }

  const routePoints = routeNodes
    .map((id) => {
      const n = nodeMap.get(id);
      return n ? { nodeId: id, x: n.x, z: n.z } : null;
    })
    .filter((v): v is { nodeId: string; x: number; z: number } => v !== null);

  const resolveNode = (id: string | null | undefined) => {
    if (!id) return null;
    const n = nodeMap.get(id);
    return n ? { nodeId: id, x: n.x, z: n.z } : null;
  };

  const eventPoints = roadEvents
    .map((ev) => {
      const n = nodeMap.get(ev.nodeId);
      const x = ev.x ?? n?.x;
      const z = ev.z ?? n?.z;
      if (x === undefined || z === undefined) return null;
      return { id: ev.id, nodeId: ev.nodeId, type: ev.type, severity: ev.severity, x, z };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  const storyPoints = storyNodeIds
    .map((id) => resolveNode(id))
    .filter((v): v is NonNullable<typeof v> => v !== null);

  return {
    districts,
    nodes,
    segments,
    connectors,
    pois,
    bounds,
    routePoints,
    pickupPoint: resolveNode(pickupNodeId),
    dropoffPoint: resolveNode(dropoffNodeId),
    waypointPoint: resolveNode(waypointNodeId),
    eventPoints,
    storyPoints,
    nodeMap,
    isWorldScale: districts.length > 1,
  };
}

/**
 * Hit-tests a canvas click in CSS pixels: checks visible POIs within 22px first,
 * then resolves the true Euclidean-closest junction node in the road graph.
 */
export function hitTestMapCanvas(
  clickX: number,
  clickY: number,
  model: MapModel,
  displayedPois: MapPoiPoint[],
  width: number,
  height: number,
  opts: MapTransformOptions = {}
): MapHitResult {
  let closestPoi: MapPoiPoint | null = null;
  let closestPoiDistSq = 22 * 22;

  for (const poi of displayedPois) {
    const pt = worldToMap(poi.x, poi.z, model.bounds, width, height, opts);
    const dx = pt.x - clickX;
    const dy = pt.y - clickY;
    const distSq = dx * dx + dy * dy;
    if (distSq <= closestPoiDistSq) {
      closestPoiDistSq = distSq;
      closestPoi = poi;
    }
  }

  if (closestPoi) {
    return { kind: 'poi', poi: closestPoi };
  }

  let closestNode: MapNodePoint | null = null;
  let closestNodeDistSq = Infinity;

  for (const node of model.nodes) {
    const pt = worldToMap(node.x, node.z, model.bounds, width, height, opts);
    const dx = pt.x - clickX;
    const dy = pt.y - clickY;
    const distSq = dx * dx + dy * dy;
    if (distSq < closestNodeDistSq) {
      closestNodeDistSq = distSq;
      closestNode = node;
    }
  }

  return closestNode ? { kind: 'node', node: closestNode } : { kind: 'none' };
}

export interface MapScreenProps {
  isOpen: boolean;
  playerPos?: { x: number; z: number };
  routeNodes?: string[];
  waypointNodeId?: string | null;
  pickupNodeId?: string | null;
  dropoffNodeId?: string | null;
  destinationNodeId?: string | null;
  roadEvents?: MapRoadEventMarker[];
  storyNodeIds?: string[];
  onSetWaypoint?: (nodeId: string | null) => void;
  onClose?: () => void;
  districtData?: DistrictData;
  roadNetwork?: RoadNetwork;
  worldData?: WorldData;
  districts?: DistrictData[];
  loadAllDistricts?: () => Promise<DistrictData[]>;
  hasMapAsset?: boolean;
  colorblindRoute?: boolean;
}

export function MapScreen({
  isOpen,
  playerPos = { x: 250, z: 250 },
  routeNodes = [],
  waypointNodeId = null,
  pickupNodeId = null,
  dropoffNodeId = null,
  destinationNodeId = null,
  roadEvents = [],
  storyNodeIds = [],
  onSetWaypoint,
  onClose,
  districtData,
  roadNetwork: roadNetworkProp,
  worldData: worldDataProp,
  districts: districtsProp,
  loadAllDistricts: loadAllDistrictsProp,
  hasMapAsset = HAS_DHAKA_MAP_ASSET,
  colorblindRoute = false,
}: MapScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  useModalFocusTrap(overlayRef, isOpen);
  const [selectedPoi, setSelectedPoi] = useState<MapPoiPoint | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(waypointNodeId);
  const [filter, setFilter] = useState<'all' | 'fuel' | 'garage' | 'tea'>('all');
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [viewportTick, setViewportTick] = useState<number>(0);
  const [loadedDistricts, setLoadedDistricts] = useState<DistrictData[] | null>(
    districtsProp ?? null
  );

  useEffect(() => {
    setSelectedNodeId(waypointNodeId);
  }, [waypointNodeId]);

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
      return;
    }
    const handleResize = () => {
      setViewportTick((n) => n + 1);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', handleResize);
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || roadNetworkProp || districtData || districtsProp) return;
    let active = true;
    const loader = loadAllDistrictsProp ?? defaultLoadAllDistricts;
    loader()
      .then((list) => {
        if (active && list.length > 0) {
          setLoadedDistricts(list);
        }
      })
      .catch(() => {
        // Sync fallback remains active
      });
    return () => {
      active = false;
    };
  }, [isOpen, roadNetworkProp, districtData, districtsProp, loadAllDistrictsProp]);

  const effectiveWorldData = worldDataProp ?? getDefaultWorldData();
  const effectiveNetwork = roadNetworkProp
    ? roadNetworkProp
    : districtData
      ? RoadNetwork.fromDistricts([districtData])
      : RoadNetwork.fromWorld(
          effectiveWorldData,
          loadedDistricts ?? districtsProp ?? getDefaultDistrictsSync()
        );

  const effectiveDropoffNodeId = dropoffNodeId ?? destinationNodeId ?? null;

  const model = buildMapModel({
    roadNetwork: effectiveNetwork,
    worldData: districtData ? undefined : effectiveWorldData,
    playerPos,
    routeNodes,
    pickupNodeId,
    dropoffNodeId: effectiveDropoffNodeId,
    waypointNodeId,
    roadEvents,
    storyNodeIds,
  });

  const displayedPois = model.pois.filter((poi) => {
    if (districtFilter && effectiveNetwork.getNodeDistrict(poi.nodeId) !== districtFilter) {
      return false;
    }
    if (filter === 'fuel') return poi.kind === 'fuel';
    if (filter === 'garage') return poi.kind === 'garage';
    if (filter === 'tea') return poi.kind === 'teaStall';
    return true;
  });

  const currentLang = getLanguage();
  const currentLocaleVersion = getLocaleVersion();

  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || 800;
    const height = canvas.clientHeight || 500;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const { scale, offsetX, offsetZ } = mapLayout(
      canvas.width,
      canvas.height,
      dpr,
      model.bounds,
      zoom
    );
    const toScreen = (x: number, z: number) => ({
      x: x * scale + offsetX,
      y: z * scale + offsetZ,
    });

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1 * dpr;
    const gridStep = model.isWorldScale ? 200 : 100;
    for (let x = -200; x <= 2000; x += gridStep) {
      const p1 = toScreen(x, -200);
      const p2 = toScreen(x, 2000);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    for (let z = -200; z <= 2000; z += gridStep) {
      const p1 = toScreen(-200, z);
      const p2 = toScreen(2000, z);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    if (model.isWorldScale) {
      for (const park of PROTOTYPE_GREENERY_ZONES) {
        ctx.beginPath();
        park.points.forEach(([px, pz], idx) => {
          const s = toScreen(px, pz);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(34, 197, 94, 0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.45)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }

      for (const lake of PROTOTYPE_WATER_POLYGONS) {
        ctx.beginPath();
        lake.points.forEach(([px, pz], idx) => {
          const s = toScreen(px, pz);
          if (idx === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.closePath();
        ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1.5 * dpr;
        ctx.stroke();
      }

      ctx.beginPath();
      PROTOTYPE_RIVER_CHANNEL.forEach(([rx, rz], idx) => {
        const s = toScreen(rx, rz);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
      ctx.lineWidth = 14 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      for (const dist of model.districts) {
        const tl = toScreen(dist.minX, dist.minZ);
        const br = toScreen(dist.maxX, dist.maxZ);
        ctx.fillStyle = 'rgba(148, 163, 184, 0.04)';
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(tl.x, tl.y, Math.max(8, br.x - tl.x), Math.max(8, br.y - tl.y));
      }
    }

    for (const conn of model.connectors) {
      const p1 = toScreen(conn.fromX, conn.fromZ);
      const p2 = toScreen(conn.toX, conn.toZ);
      ctx.save();
      ctx.setLineDash([5 * dpr, 4 * dpr]);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    }

    for (const seg of model.segments) {
      const nA = model.nodeMap.get(seg.startNodeId);
      const nB = model.nodeMap.get(seg.endNodeId);
      if (!nA || !nB) continue;

      const p1 = toScreen(nA.x, nA.z);
      const p2 = toScreen(nB.x, nB.z);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      if (seg.divided) {
        ctx.strokeStyle = '#94A3B8';
        ctx.lineWidth = 5 * dpr;
      } else if (seg.roadType === 'main' || seg.roadType === 'flyover') {
        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 4 * dpr;
      } else if (seg.roadType === 'market') {
        ctx.strokeStyle = '#D97706';
        ctx.lineWidth = 2.5 * dpr;
      } else {
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2 * dpr;
      }
      ctx.stroke();
    }

    if (model.routePoints.length >= 2) {
      ctx.beginPath();
      model.routePoints.forEach((pt, idx) => {
        const s = toScreen(pt.x, pt.z);
        if (idx === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.strokeStyle = colorblindRoute ? '#F59E0B' : '#22D3EE';
      ctx.lineWidth = 5 * dpr;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    for (const n of model.nodes) {
      const pt = toScreen(n.x, n.z);
      const isSelected = selectedNodeId === n.nodeId;
      const isWaypoint = waypointNodeId === n.nodeId;

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (isSelected || isWaypoint ? 5.5 : 3) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = isWaypoint
        ? '#FBBF24'
        : isSelected
          ? '#F8FAFC'
          : n.isConnector
            ? '#F59E0B'
            : '#475569';
      ctx.fill();

      if (isWaypoint || isSelected) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 10 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = isWaypoint ? '#FBBF24' : '#38BDF8';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }
    }

    for (const ev of model.eventPoints) {
      const pt = toScreen(ev.x, ev.z);
      const r = 8 * dpr;
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - r);
      ctx.lineTo(pt.x + r * 0.9, pt.y + r * 0.8);
      ctx.lineTo(pt.x - r * 0.9, pt.y + r * 0.8);
      ctx.closePath();
      ctx.fillStyle = '#EF4444';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    for (const sp of model.storyPoints) {
      const pt = toScreen(sp.x, sp.z);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 8 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = '#A855F7';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    if (model.pickupPoint) {
      const pt = toScreen(model.pickupPoint.x, model.pickupPoint.z);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2.5 * dpr;
      ctx.stroke();
    }
    if (model.dropoffPoint) {
      const pt = toScreen(model.dropoffPoint.x, model.dropoffPoint.z);
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 10 * dpr, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#3B82F6';
      ctx.lineWidth = 2.5 * dpr;
      ctx.stroke();
    }

    for (const poi of displayedPois) {
      const pt = toScreen(poi.x, poi.z);
      const isSelected = selectedPoi?.id === poi.id;
      const color =
        poi.kind === 'fuel'
          ? '#F59E0B'
          : poi.kind === 'garage'
            ? '#10B981'
            : '#FB7185';

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (isSelected ? 9.5 : 6.5) * dpr, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2 * dpr;
      ctx.stroke();

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 13 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2 * dpr;
        ctx.stroke();
      }
    }

    if (model.isWorldScale) {
      ctx.font = `700 ${11 * dpr}px sans-serif`;
      ctx.textAlign = 'center';
      for (const dist of model.districts) {
        const label = t(`district.${dist.id}`);
        const center = toScreen(dist.centerX, dist.minZ + 18);
        const textW =
          typeof ctx.measureText === 'function'
            ? ctx.measureText(label).width
            : label.length * 7 * dpr;
        const boxW = textW + 14 * dpr;
        const boxH = 18 * dpr;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
        ctx.fillRect(center.x - boxW / 2, center.y - 13 * dpr, boxW, boxH);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 1 * dpr;
        ctx.strokeRect(center.x - boxW / 2, center.y - 13 * dpr, boxW, boxH);
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText(label, center.x, center.y);
      }
    }

    const playerPt = toScreen(playerPos.x, playerPos.z);
    ctx.beginPath();
    ctx.arc(playerPt.x, playerPt.y, 12 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.25)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(playerPt.x, playerPt.y, 6.5 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#22D3EE';
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke();
  }, [
    isOpen,
    playerPos.x,
    playerPos.z,
    selectedPoi,
    selectedNodeId,
    waypointNodeId,
    pickupNodeId,
    effectiveDropoffNodeId,
    filter,
    zoom,
    viewportTick,
    colorblindRoute,
    displayedPois,
    model,
    currentLang,
    currentLocaleVersion,
  ]);

  if (!isOpen) return null;

  const applyFilter = (next: 'all' | 'fuel' | 'garage' | 'tea') => {
    setFilter(next);
    if (selectedPoi) {
      const stillVisible =
        next === 'all' ||
        (next === 'fuel' && selectedPoi.kind === 'fuel') ||
        (next === 'garage' && selectedPoi.kind === 'garage') ||
        (next === 'tea' && selectedPoi.kind === 'teaStall');
      if (!stillVisible) {
        setSelectedPoi(null);
        if (selectedNodeId === selectedPoi.nodeId) {
          setSelectedNodeId(null);
        }
      }
    }
  };

  const handleCanvasClick = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const width = canvas.clientWidth || rect.width || 800;
    const height = canvas.clientHeight || rect.height || 500;

    const hit = hitTestMapCanvas(clickX, clickY, model, displayedPois, width, height, {
      zoom,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    });

    if (hit.kind === 'poi') {
      setSelectedPoi(hit.poi);
      setSelectedNodeId(hit.poi.nodeId);
    } else if (hit.kind === 'node') {
      setSelectedNodeId(hit.node.nodeId);
      setSelectedPoi(null);
    }
  };

  const selectedNode = selectedNodeId ? model.nodeMap.get(selectedNodeId) ?? null : null;
  const selectedDistrict = selectedNode
    ? effectiveNetwork.getNodeDistrict(selectedNode.nodeId)
    : null;
  const selectedLabel = selectedPoi
    ? t(selectedPoi.nameKey)
    : selectedNodeId
      ? t('map.selected_junction', { id: localDigits(selectedNodeId) })
      : null;

  return (
    <div
      ref={overlayRef}
      data-testid="map-screen"
      role="dialog"
      aria-modal="true"
      aria-label={t('map.title')}
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_LAYER.PANEL,
        backgroundColor: '#0F172A',
        color: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--uthao-font-sans, "Hind Siliguri", sans-serif)',
        pointerEvents: 'auto',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: 'rgba(15, 23, 42, 0.96)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.2)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <IconMap size={22} color="var(--uthao-amber, #F59E0B)" />
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>{t('map.title')}</h2>
          {!hasMapAsset && (
            <span
              data-testid="map-prototype-badge"
              style={{
                padding: '3px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                color: '#7DD3FC',
              }}
            >
              {t('map.prototype_label')}
            </span>
          )}
          <span style={{ fontSize: '12px', color: '#94A3B8' }}>
            {t('map.nodes_count', {
              nodes: localDigits(model.nodes.length),
              districts: localDigits(model.districts.length),
            })}
          </span>
        </div>

        {/* Filter & Zoom Bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="map-filter-all"
            aria-pressed={filter === 'all'}
            onClick={() => applyFilter('all')}
            style={{
              padding: '5px 10px',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              backgroundColor: filter === 'all' ? '#38BDF8' : 'transparent',
              color: filter === 'all' ? '#0F172A' : '#E2E8F0',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            {t('map.filter_all')}
          </button>
          <button
            type="button"
            data-testid="map-filter-fuel"
            aria-pressed={filter === 'fuel'}
            onClick={() => applyFilter('fuel')}
            style={{
              padding: '5px 10px',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              backgroundColor: filter === 'fuel' ? '#F59E0B' : 'transparent',
              color: filter === 'fuel' ? '#0F172A' : '#F59E0B',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <IconFuel size={13} />
            {t('map.poi_fuel')}
          </button>
          <button
            type="button"
            data-testid="map-filter-garage"
            aria-pressed={filter === 'garage'}
            onClick={() => applyFilter('garage')}
            style={{
              padding: '5px 10px',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              backgroundColor: filter === 'garage' ? '#10B981' : 'transparent',
              color: filter === 'garage' ? '#0F172A' : '#10B981',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <IconWrench size={13} />
            {t('map.poi_garage')}
          </button>
          <button
            type="button"
            data-testid="map-filter-tea"
            aria-pressed={filter === 'tea'}
            onClick={() => applyFilter('tea')}
            style={{
              padding: '5px 10px',
              borderRadius: '16px',
              border: '1px solid rgba(148, 163, 184, 0.28)',
              backgroundColor: filter === 'tea' ? '#FB7185' : 'transparent',
              color: filter === 'tea' ? '#0F172A' : '#FB7185',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <IconStar size={13} />
            {t('map.poi_tea')}
          </button>

          <button
            type="button"
            data-testid="map-zoom-in-btn"
            aria-label={t('map.zoom_in')}
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              backgroundColor: 'rgba(30, 41, 59, 0.85)',
              color: '#F8FAFC',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            +
          </button>
          <button
            type="button"
            data-testid="map-zoom-out-btn"
            aria-label={t('map.zoom_out')}
            onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '8px',
              border: '1px solid rgba(148, 163, 184, 0.3)',
              backgroundColor: 'rgba(30, 41, 59, 0.85)',
              color: '#F8FAFC',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            -
          </button>

          <button
            type="button"
            data-testid="map-close-btn"
            aria-label={t('map.close')}
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconClose size={16} />
          </button>
        </div>
      </div>

      {/* Districts Strip */}
      <div
        data-testid="map-districts-bar"
        className="uthao-dark-scroll"
        style={{
          padding: '6px 16px',
          backgroundColor: 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', whiteSpace: 'nowrap' }}>
          {t('map.districts_label')}:
        </span>
        {model.districts.map((dist) => {
          const isActiveDistrict = districtFilter === dist.id || (!districtFilter && selectedDistrict === dist.id);
          return (
            <button
              key={dist.id}
              type="button"
              data-testid={`map-district-badge-${dist.id}`}
              aria-pressed={districtFilter === dist.id}
              onClick={() => setDistrictFilter((prev) => (prev === dist.id ? null : dist.id))}
              style={{
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                backgroundColor: isActiveDistrict
                  ? 'rgba(56, 189, 248, 0.22)'
                  : 'rgba(30, 41, 59, 0.85)',
                border: isActiveDistrict
                  ? '1px solid rgba(56, 189, 248, 0.55)'
                  : '1px solid rgba(148, 163, 184, 0.22)',
                color: isActiveDistrict ? '#7DD3FC' : '#CBD5E1',
              }}
            >
              {t(`district.${dist.id}`)}
            </button>
          );
        })}
      </div>

      {/* Scrollable POI Chips Row (supports keyboard/gamepad focus & quick waypoint) */}
      {displayedPois.length > 0 && (
        <div
          data-testid="map-poi-bar"
          className="uthao-dark-scroll"
          style={{
            padding: '6px 16px',
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {displayedPois.map((poi) => {
            const active = selectedPoi?.id === poi.id;
            const dotColor =
              poi.kind === 'fuel' ? '#F59E0B' : poi.kind === 'garage' ? '#10B981' : '#FB7185';
            return (
              <button
                key={poi.id}
                type="button"
                data-testid={`map-poi-${poi.id}`}
                onClick={() => {
                  setSelectedPoi(poi);
                  setSelectedNodeId(poi.nodeId);
                }}
                style={{
                  padding: '4px 10px',
                  borderRadius: '999px',
                  border: active
                    ? '1px solid rgba(56, 189, 248, 0.7)'
                    : '1px solid rgba(148, 163, 184, 0.25)',
                  backgroundColor: active ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.8)',
                  color: '#F8FAFC',
                  fontSize: '11px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: dotColor,
                  }}
                />
                <span>{t(poi.nameKey)}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Interactive Map Canvas */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <canvas
          id="map-canvas"
          data-testid="map-canvas"
          ref={canvasRef}
          onClick={handleCanvasClick}
          style={{
            width: '100%',
            height: '100%',
            cursor: 'crosshair',
            display: 'block',
          }}
        />

        {/* Map Legend Panel */}
        <div
          data-testid="map-legend-panel"
          className="uthao-dark-scroll"
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            maxWidth: 'min(260px, 42vw)',
            maxHeight: 'calc(100% - 20px)',
            overflowY: 'auto',
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(148, 163, 184, 0.24)',
            borderRadius: '12px',
            padding: '8px 10px',
            fontSize: '11px',
          }}
        >
          <div style={{ fontWeight: 700, color: '#E2E8F0', marginBottom: '6px' }}>
            {t('map.legend')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '4px 8px',
            }}
          >
            {MAP_LEGEND_ITEMS.map((item) => (
              <div
                key={item.id}
                data-testid={`map-legend-item-${item.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  color: '#CBD5E1',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: item.shape === 'line' || item.shape === 'dashed' ? '12px' : '8px',
                    height: item.shape === 'line' || item.shape === 'dashed' ? '3px' : '8px',
                    borderRadius: item.shape === 'fill' ? '2px' : '999px',
                    backgroundColor:
                      item.shape === 'ring' || item.shape === 'dashed'
                        ? 'transparent'
                        : item.color,
                    border:
                      item.shape === 'ring'
                        ? `2px solid ${item.color}`
                        : item.shape === 'dashed'
                          ? `1px dashed ${item.color}`
                          : 'none',
                    flexShrink: 0,
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t(item.labelKey)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Node / POI / Waypoint Card */}
        {selectedNodeId && (
          <div
            data-testid="map-selection-card"
            style={{
              position: 'absolute',
              bottom: '16px',
              right: '16px',
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(148, 163, 184, 0.32)',
              borderRadius: '14px',
              padding: '12px 14px',
              minWidth: '230px',
              maxWidth: 'min(320px, 85vw)',
              boxShadow: '0 10px 28px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              data-testid={selectedPoi ? 'map-poi-card' : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}
            >
              <IconMapPin size={16} color="#FBBF24" />
              <div style={{ fontWeight: 700, fontSize: '14px', color: '#F8FAFC' }}>
                {selectedLabel}
              </div>
            </div>
            {selectedDistrict && (
              <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '8px' }}>
                {t('map.district_tag', { name: t(`district.${selectedDistrict}`) })}
              </div>
            )}
            {roadEvents.some((ev) => ev.nodeId === selectedNodeId) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#FCA5A5',
                  marginBottom: '8px',
                }}
              >
                <IconWarning size={14} />
                <span>{t('map.active_hazard')}</span>
              </div>
            )}
            {storyNodeIds.includes(selectedNodeId) && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '12px',
                  color: '#D8B4FE',
                  marginBottom: '8px',
                }}
              >
                <IconStar size={14} />
                <span>{t('map.active_story')}</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                data-testid="map-set-waypoint-btn"
                onClick={() => {
                  if (waypointNodeId === selectedNodeId) {
                    onSetWaypoint?.(null);
                  } else {
                    onSetWaypoint?.(selectedNodeId);
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: '10px',
                  backgroundColor: waypointNodeId === selectedNodeId ? '#EF4444' : '#38BDF8',
                  color: waypointNodeId === selectedNodeId ? '#FFFFFF' : '#0F172A',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                {waypointNodeId === selectedNodeId
                  ? t('map.clear_waypoint')
                  : t('map.set_waypoint')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
