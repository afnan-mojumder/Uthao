import type { JSX } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import defaultDistrict from '../../../data/districts/mirpara.json';
import type { DistrictData, Poi } from '../../sim/schemas';
import type { RoadNode } from '../../core/types';
import { t } from '../i18n';

export interface MapScreenProps {
  isOpen: boolean;
  districtData?: DistrictData;
  playerPos?: { x: number; z: number };
  waypointNodeId?: string | null;
  destinationNodeId?: string | null;
  routeNodes?: string[];
  onSetWaypoint?: (nodeId: string | null) => void;
  onClose?: () => void;
}

export function MapScreen({
  isOpen,
  districtData = defaultDistrict as unknown as DistrictData,
  playerPos = { x: 0, z: 0 },
  waypointNodeId = null,
  destinationNodeId = null,
  onSetWaypoint,
  onClose,
}: MapScreenProps): JSX.Element | null {
  if (!isOpen) return null;

  let canvasRef: { current: HTMLCanvasElement | null } = { current: null };
  let selectedPoi: Poi | null = null;
  let setSelectedPoi: (poi: Poi | null) => void = () => {};
  let selectedNodeId: string | null = waypointNodeId;
  let setSelectedNodeId: (id: string | null) => void = () => {};
  let filter: 'all' | 'fuel' | 'garage' | 'tea' = 'all';
  let setFilter: (f: 'all' | 'fuel' | 'garage' | 'tea') => void = () => {};
  let zoom = 1.0;
  let setZoom: (updater: number | ((z: number) => number)) => void = () => {};

  try {
    const hookCanvasRef = useRef<HTMLCanvasElement | null>(null);
    canvasRef = hookCanvasRef;
    const [sp, ssp] = useState<Poi | null>(null);
    selectedPoi = sp;
    setSelectedPoi = ssp;
    const [sn, ssn] = useState<string | null>(waypointNodeId);
    selectedNodeId = sn;
    setSelectedNodeId = ssn;
    const [f, sf] = useState<'all' | 'fuel' | 'garage' | 'tea'>('all');
    filter = f;
    setFilter = sf;
    const [zm, szm] = useState<number>(1.0);
    zoom = zm;
    setZoom = szm;
  } catch {
    // Vitest node environment
  }

  const pois = districtData.pois ?? [];
  const nodes = districtData.nodes ?? [];
  const segments = districtData.segments ?? [];

  // Filtered POIs
  const displayedPois = pois.filter((poi) => {
    if (filter === 'all') return true;
    if (filter === 'fuel') return poi.kind === 'fuel';
    if (filter === 'garage') return poi.kind === 'garage';
    if (filter === 'tea') return poi.kind === 'teaStall';
    return true;
  });

  // Canvas drawing effect
  try {
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

    // Handle high DPI
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    const width = (rect.width || 800) * dpr;
    const height = (rect.height || 600) * dpr;

    canvas.width = width;
    canvas.height = height;

    // Compute bounding box
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.z < minZ) minZ = n.z;
      if (n.z > maxZ) maxZ = n.z;
    }

    const margin = 60 * dpr;
    const spanX = maxX - minX || 500;
    const spanZ = maxZ - minZ || 500;
    const baseScale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanZ) * 0.95;
    const scale = baseScale * zoom;

    const offsetX = (width - spanX * scale) / 2 - minX * scale;
    const offsetZ = (height - spanZ * scale) / 2 - minZ * scale;

    const toScreen = (x: number, z: number) => ({
      x: x * scale + offsetX,
      y: z * scale + offsetZ,
    });

    // 1. Clear background (Dhaka night aesthetic)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    const gridSize = 50 * scale;
    if (gridSize > 15) {
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    const nodeMap = new Map<string, RoadNode>(nodes.map((n) => [n.nodeId, n]));

    // 2. Road Segments
    for (const seg of segments) {
      const start = nodeMap.get(seg.startNodeId);
      const end = nodeMap.get(seg.endNodeId);
      if (!start || !end) continue;

      const p1 = toScreen(start.x, start.z);
      const p2 = toScreen(end.x, end.z);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);

      let stroke = '#475569';
      let w = Math.max(3, seg.width * scale * 0.3);

      if (seg.divided) {
        stroke = '#f97316'; // orange divided arterial
        w = Math.max(5, seg.width * scale * 0.45);
      } else if (seg.tags?.includes('market')) {
        stroke = '#eab308'; // market
        w = Math.max(4, seg.width * scale * 0.4);
      } else if (seg.roadType === 'alley') {
        stroke = seg.motorcycleAccessible ? '#a855f7' : '#ef4444';
        w = Math.max(2, seg.width * scale * 0.25);
      }

      ctx.strokeStyle = stroke;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();
    }

    // 3. POIs
    for (const poi of displayedPois) {
      const poiNode = nodeMap.get(poi.nodeId);
      if (!poiNode) continue;
      const pos = toScreen(poiNode.x, poiNode.z);
      const isSelected = selectedPoi?.id === poi.id;

      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, isSelected ? 12 : 8, 0, Math.PI * 2);

      let poiColor = '#38bdf8';
      let icon = '📍';
      if (poi.kind === 'fuel') {
        poiColor = '#10b981';
        icon = '⛽';
      } else if (poi.kind === 'garage') {
        poiColor = '#f59e0b';
        icon = '🔧';
      } else if (poi.kind === 'teaStall') {
        poiColor = '#ec4899';
        icon = '☕';
      }

      ctx.fillStyle = isSelected ? '#ffffff' : poiColor;
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon label
      ctx.font = `${Math.round(14 * dpr)}px sans-serif`;
      ctx.fillText(icon, pos.x - 7 * dpr, pos.y - 12 * dpr);

      ctx.restore();
    }

    // 4. Waypoint Pin (if set)
    const activeWp = selectedNodeId || waypointNodeId;
    if (activeWp) {
      const wpNode = nodeMap.get(activeWp);
      if (wpNode) {
        const wpPos = toScreen(wpNode.x, wpNode.z);
        ctx.save();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(wpPos.x, wpPos.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.font = `bold ${Math.round(16 * dpr)}px sans-serif`;
        ctx.fillText('🎯', wpPos.x - 8 * dpr, wpPos.y + 6 * dpr);
        ctx.restore();
      }
    }

    // 5. Active Destination Pin (if on ride)
    if (destinationNodeId) {
      const dNode = nodeMap.get(destinationNodeId);
      if (dNode) {
        const dPos = toScreen(dNode.x, dNode.z);
        ctx.save();
        ctx.fillStyle = '#8b5cf6';
        ctx.beginPath();
        ctx.arc(dPos.x, dPos.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.font = `bold ${Math.round(16 * dpr)}px sans-serif`;
        ctx.fillText('🏁', dPos.x - 8 * dpr, dPos.y + 6 * dpr);
        ctx.restore();
      }
    }

    // 6. Player Position
    const pPos = toScreen(playerPos.x, playerPos.z);
    ctx.save();
    // Pulse ring
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(pPos.x, pPos.y, 16, 0, Math.PI * 2);
    ctx.stroke();

    // Center dot
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(pPos.x, pPos.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Icon
    ctx.font = `${Math.round(16 * dpr)}px sans-serif`;
    ctx.fillText('🏍️', pPos.x - 8 * dpr, pPos.y - 12 * dpr);
    ctx.restore();
  }, [districtData, playerPos, waypointNodeId, destinationNodeId, selectedPoi, selectedNodeId, filter, zoom]);
  } catch {
    // Vitest node environment
  }

  // Click on canvas to select POI or node
  const handleCanvasClick = (e: MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Hit test POIs
    let hitPoi: Poi | null = null;
    let minD = 25; // hit radius in pixels

    for (const poi of displayedPois) {
      const n = nodes.find((node) => node.nodeId === poi.nodeId);
      if (!n) continue;
      // Approximate screen distance
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const width = rect.width * dpr;
      const height = rect.height * dpr;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const node of nodes) {
        if (node.x < minX) minX = node.x;
        if (node.x > maxX) maxX = node.x;
        if (node.z < minZ) minZ = node.z;
        if (node.z > maxZ) maxZ = node.z;
      }
      const margin = 60 * dpr;
      const spanX = maxX - minX || 500;
      const spanZ = maxZ - minZ || 500;
      const baseScale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanZ) * 0.95;
      const scale = baseScale * zoom;
      const offsetX = (width - spanX * scale) / 2 - minX * scale;
      const offsetZ = (height - spanZ * scale) / 2 - minZ * scale;

      const sx = (n.x * scale + offsetX) / dpr;
      const sy = (n.z * scale + offsetZ) / dpr;

      const dist = Math.hypot(clickX - sx, clickY - sy);
      if (dist < minD) {
        minD = dist;
        hitPoi = poi;
      }
    }

    if (hitPoi) {
      setSelectedPoi(hitPoi);
      setSelectedNodeId(hitPoi.nodeId);
    } else if (nodes.length > 0) {
      // Hit test closest node
      const firstNode = nodes[0];
      if (firstNode) {
        setSelectedNodeId(firstNode.nodeId);
        setSelectedPoi(null);
      }
    }
  };

  return (
    <div
      data-testid="map-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9996,
        background: '#090d16',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Hind Siliguri', 'Segoe UI', system-ui, sans-serif",
        color: '#f8fafc',
        pointerEvents: 'auto',
        overflow: 'hidden',
      }}
    >
      {/* Top Navigation Bar */}
      <div
        style={{
          padding: '12px 20px',
          background: 'rgba(15, 23, 42, 0.9)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ fontSize: '1.4rem' }}>🗺️</span>
          <div>
            <h2 data-testid="map-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#38bdf8' }}>
              {t('map.title')}
            </h2>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              {districtData.name?.en ?? 'Mirpara'} ({districtData.name?.bn ?? 'মিরপাড়া'})
            </div>
          </div>
        </div>

        {/* Filter Chips */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            data-testid="map-filter-all"
            onClick={() => setFilter('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '9999px',
              border: filter === 'all' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
              background: filter === 'all' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              color: filter === 'all' ? '#38bdf8' : '#94a3b8',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All
          </button>
          <button
            data-testid="map-filter-fuel"
            onClick={() => setFilter('fuel')}
            style={{
              padding: '6px 12px',
              borderRadius: '9999px',
              border: filter === 'fuel' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
              background: filter === 'fuel' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              color: filter === 'fuel' ? '#34d399' : '#94a3b8',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ⛽ {t('map.poi_fuel')}
          </button>
          <button
            data-testid="map-filter-garage"
            onClick={() => setFilter('garage')}
            style={{
              padding: '6px 12px',
              borderRadius: '9999px',
              border: filter === 'garage' ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.1)',
              background: filter === 'garage' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(30, 41, 59, 0.5)',
              color: filter === 'garage' ? '#fbbf24' : '#94a3b8',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔧 {t('map.poi_garage')}
          </button>
        </div>

        {/* Zoom Controls & Close Button */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            data-testid="map-zoom-in-btn"
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#f8fafc',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            +
          </button>
          <button
            data-testid="map-zoom-out-btn"
            onClick={() => setZoom((z) => Math.max(0.6, z - 0.25))}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#f8fafc',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            −
          </button>
          <button
            data-testid="map-close-btn"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              marginLeft: '8px',
            }}
          >
            ✕ {t('map.close')}
          </button>
        </div>
      </div>

      {/* Main Map View Area */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          data-testid="map-canvas"
          onClick={handleCanvasClick}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: 'crosshair',
          }}
        />

        {/* Selected POI / Node Detail Card */}
        {selectedNodeId && (
          <div
            data-testid="map-poi-card"
            style={{
              position: 'absolute',
              bottom: '24px',
              left: '24px',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '16px',
              padding: '16px 20px',
              minWidth: '280px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Selected Location</div>
              <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>
                {selectedPoi?.nameKey ? t(selectedPoi.nameKey) : `Node: ${selectedNodeId}`}
              </strong>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                data-testid="map-set-waypoint-btn"
                onClick={() => {
                  onSetWaypoint?.(selectedNodeId);
                }}
                style={{
                  flex: 1,
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                🎯 {t('map.set_waypoint')}
              </button>
              <button
                data-testid="map-clear-waypoint-btn"
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedPoi(null);
                  onSetWaypoint?.(null);
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  background: 'rgba(30, 41, 59, 0.5)',
                  color: '#94a3b8',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                {t('map.clear_waypoint')}
              </button>
            </div>
          </div>
        )}

        {/* Legend Panel */}
        <div
          data-testid="map-legend-panel"
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '24px',
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            color: '#cbd5e1',
          }}
        >
          <strong style={{ color: '#f8fafc', marginBottom: '2px' }}>{t('map.legend')}</strong>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏍️</span> Player (You)
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#10b981' }}>⛽</span> {t('map.poi_fuel')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#f59e0b' }}>🔧</span> {t('map.poi_garage')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#ec4899' }}>☕</span> {t('map.poi_tea')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#ef4444' }}>🎯</span> Waypoint
          </div>
        </div>
      </div>
    </div>
  );
}
