import type { RoadNetwork } from '../sim/road/RoadNetwork';
import type { Route } from '../sim/road/routing';

export interface MinimapOptions {
  size?: number; // Canvas size in pixels (e.g. 160)
  viewRadiusM?: number; // Visible radius in meters (e.g. 120m)
  rotateWithPlayer?: boolean; // True to rotate with heading, false for North-up
}

export interface MinimapMarkers {
  pickup?: { x: number; z: number } | null;
  dropoff?: { x: number; z: number } | null;
}

export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly roadNetwork: RoadNetwork;
  private readonly size: number;
  private readonly viewRadiusM: number;
  private readonly rotateWithPlayer: boolean;

  constructor(roadNetwork: RoadNetwork, options: MinimapOptions = {}) {
    this.roadNetwork = roadNetwork;
    this.size = options.size ?? 160;
    this.viewRadiusM = options.viewRadiusM ?? 120;
    this.rotateWithPlayer = options.rotateWithPlayer ?? true;

    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.size;
      this.canvas.height = this.size;
      this.canvas.id = 'minimap-canvas';
      this.canvas.style.width = `${this.size}px`;
      this.canvas.style.height = `${this.size}px`;
      this.canvas.style.borderRadius = '50%';
      this.canvas.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.6)';
      this.canvas.style.border = '2px solid rgba(56, 189, 248, 0.4)';
      this.ctx = this.canvas.getContext('2d');
    } else {
      // Mock for node/headless test environments
      this.canvas = {
        width: this.size,
        height: this.size,
        id: 'minimap-canvas',
      } as unknown as HTMLCanvasElement;
      this.ctx = null;
    }
  }

  update(
    playerPose: { x: number; z: number; heading: number },
    route?: Route | null,
    markers?: MinimapMarkers
  ): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const size = this.size;
    const center = size / 2;
    const radius = center - 2;
    const scale = radius / this.viewRadiusM;

    ctx.save();
    ctx.clearRect(0, 0, size, size);

    // 1. Clip circular minimap boundary
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.clip();

    // 2. Glassmorphic dark background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(0, 0, size, size);

    // 3. Range rings (concentric)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.5, 0, Math.PI * 2);
    ctx.arc(center, center, radius * 0.9, 0, Math.PI * 2);
    ctx.stroke();

    // Coordinate transformation setup:
    // Move origin to canvas center
    ctx.save();
    ctx.translate(center, center);

    if (this.rotateWithPlayer) {
      // Rotate map opposite to player heading so forward is UP
      ctx.rotate(-playerPose.heading + Math.PI / 2);
    }

    // 4. Draw road network segments within view
    const segments = this.roadNetwork.getAllSegments();
    const nodesMap = this.roadNetwork.getNodesMap();

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      const from = nodesMap.get(seg.startNodeId);
      const to = nodesMap.get(seg.endNodeId);
      if (!from || !to) continue;

      // Fast AABB reject if both points are far from player
      const dx1 = from.x - playerPose.x;
      const dz1 = from.z - playerPose.z;
      const dx2 = to.x - playerPose.x;
      const dz2 = to.z - playerPose.z;

      const maxDist = this.viewRadiusM * 1.5;
      if (
        Math.abs(dx1) > maxDist &&
        Math.abs(dx2) > maxDist &&
        Math.abs(dz1) > maxDist &&
        Math.abs(dz2) > maxDist
      ) {
        continue;
      }

      ctx.beginPath();
      ctx.moveTo(dx1 * scale, dz1 * scale);
      ctx.lineTo(dx2 * scale, dz2 * scale);

      if (seg.roadType === 'main' || seg.roadType === 'flyover') {
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 4;
      } else if (seg.roadType === 'residential' || seg.roadType === 'market') {
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1.5;
      }
      ctx.stroke();
    }

    // 5. Draw active route polyline (neon emerald)
    if (route && route.nodeIds.length > 1) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < route.nodeIds.length; i++) {
        const nodeId = route.nodeIds[i];
        if (!nodeId) continue;
        const node = nodesMap.get(nodeId);
        if (!node) continue;
        const rx = (node.x - playerPose.x) * scale;
        const rz = (node.z - playerPose.z) * scale;
        if (!started) {
          ctx.moveTo(rx, rz);
          started = true;
        } else {
          ctx.lineTo(rx, rz);
        }
      }
      if (started) {
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // 6. Draw Pickup Marker
    if (markers?.pickup) {
      const px = (markers.pickup.x - playerPose.x) * scale;
      const pz = (markers.pickup.z - playerPose.z) * scale;
      ctx.beginPath();
      ctx.arc(px, pz, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4'; // Cyan
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // 7. Draw Dropoff Marker
    if (markers?.dropoff) {
      const dx = (markers.dropoff.x - playerPose.x) * scale;
      const dz = (markers.dropoff.z - playerPose.z) * scale;
      ctx.beginPath();
      ctx.arc(dx, dz, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b'; // Amber
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();

    // 8. Player Arrowhead (fixed at center pointing up if rotateWithPlayer=true)
    ctx.save();
    ctx.translate(center, center);
    if (!this.rotateWithPlayer) {
      ctx.rotate(playerPose.heading - Math.PI / 2);
    }
    ctx.beginPath();
    ctx.moveTo(0, -7); // Top tip
    ctx.lineTo(5, 6); // Bottom right
    ctx.lineTo(0, 3); // Inset notch
    ctx.lineTo(-5, 6); // Bottom left
    ctx.closePath();
    ctx.fillStyle = '#38bdf8'; // Glowing sky-blue
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();

    // 9. North Compass Needle / "N" Indicator
    ctx.save();
    const northAngle = this.rotateWithPlayer ? -playerPose.heading + Math.PI / 2 : 0;
    const nDist = radius - 10;
    const nx = center + Math.cos(northAngle - Math.PI / 2) * nDist;
    const ny = center + Math.sin(northAngle - Math.PI / 2) * nDist;

    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny);
    ctx.restore();

    ctx.restore(); // End clipping
  }
}
