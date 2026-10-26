import type { DistrictData, Poi } from '../sim/schemas';
import type { RoadNode } from '../core/types';

export interface MapViewerOptions {
  district: DistrictData;
  container?: HTMLElement;
}

export class MapViewer {
  readonly district: DistrictData;
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private scale: number = 1.0;
  private offsetX: number = 0;
  private offsetZ: number = 0;
  private isDragging: boolean = false;
  private dragStartX: number = 0;
  private dragStartY: number = 0;
  private hoveredPoi: Poi | null = null;

  constructor(opts: MapViewerOptions) {
    this.district = opts.district;
    this.container = opts.container ?? document.body;

    // Create container for map viewer
    const wrapper = document.createElement('div');
    wrapper.id = 'map-viewer-wrapper';
    wrapper.style.position = 'fixed';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.width = '100vw';
    wrapper.style.height = '100vh';
    wrapper.style.backgroundColor = '#0f172a';
    wrapper.style.zIndex = '99999';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.overflow = 'hidden';
    wrapper.style.fontFamily = 'system-ui, sans-serif';

    // Header bar
    const header = document.createElement('div');
    header.style.padding = '12px 20px';
    header.style.backgroundColor = '#1e293b';
    header.style.color = '#f8fafc';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '1px solid #334155';

    header.innerHTML = `
      <div style="display:flex; align-items:center; gap: 16px;">
        <span style="font-weight: 700; font-size: 16px; color: #38bdf8;">Uthao Map Viewer</span>
        <span style="background:#334155; padding: 4px 10px; border-radius: 6px; font-size: 13px;">${this.district.name.en} (${this.district.name.bn})</span>
        <span style="font-size: 13px; color: #94a3b8;">Nodes: ${this.district.nodes.length} | Segments: ${this.district.segments.length} | POIs: ${this.district.pois.length} | Lots: ${this.district.lots?.length ?? 0}</span>
      </div>
      <div style="display:flex; gap: 10px; align-items:center;">
        <button id="btn-zoom-in" style="background:#334155; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">+</button>
        <button id="btn-zoom-out" style="background:#334155; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">−</button>
        <button id="btn-reset" style="background:#334155; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer;">Reset View</button>
        <a href="/" style="color:#94a3b8; font-size:13px; text-decoration:none; margin-left: 10px;">Back to Game</a>
      </div>
    `;

    // Canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.style.flex = '1';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.cursor = 'grab';

    // Tooltip overlay
    const tooltip = document.createElement('div');
    tooltip.id = 'map-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.pointerEvents = 'none';
    tooltip.style.padding = '6px 10px';
    tooltip.style.backgroundColor = 'rgba(15, 23, 42, 0.9)';
    tooltip.style.color = '#f8fafc';
    tooltip.style.borderRadius = '6px';
    tooltip.style.fontSize = '12px';
    tooltip.style.border = '1px solid #475569';
    tooltip.style.display = 'none';
    tooltip.style.zIndex = '100000';

    wrapper.appendChild(header);
    wrapper.appendChild(this.canvas);
    wrapper.appendChild(tooltip);
    this.container.appendChild(wrapper);

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to create 2D canvas context for MapViewer');
    }
    this.ctx = context;

    this.initEvents(wrapper, tooltip);
    this.fitToScreen();
    this.render();
  }

  private initEvents(wrapper: HTMLElement, tooltip: HTMLElement): void {
    const handleResize = () => {
      this.canvas.width = this.canvas.clientWidth * (window.devicePixelRatio || 1);
      this.canvas.height = this.canvas.clientHeight * (window.devicePixelRatio || 1);
      this.render();
    };
    window.addEventListener('resize', handleResize);
    setTimeout(handleResize, 10);

    // Zoom buttons
    wrapper.querySelector('#btn-zoom-in')?.addEventListener('click', () => {
      this.scale *= 1.25;
      this.render();
    });
    wrapper.querySelector('#btn-zoom-out')?.addEventListener('click', () => {
      this.scale /= 1.25;
      this.render();
    });
    wrapper.querySelector('#btn-reset')?.addEventListener('click', () => {
      this.fitToScreen();
      this.render();
    });

    // Mouse drag
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'grab';
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        this.offsetX += dx * (window.devicePixelRatio || 1);
        this.offsetZ += dy * (window.devicePixelRatio || 1);
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.render();
      } else {
        // Hover detection
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
        const mouseY = (e.clientY - rect.top) * (window.devicePixelRatio || 1);
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldZ = (mouseY - this.offsetZ) / this.scale;

        this.hoveredPoi = null;
        for (const poi of this.district.pois) {
          const node = this.district.nodes.find((n) => n.nodeId === poi.nodeId);
          if (node) {
            const dist = Math.hypot(node.x - worldX, node.z - worldZ);
            if (dist < 15 / this.scale) {
              this.hoveredPoi = poi;
              break;
            }
          }
        }

        if (this.hoveredPoi) {
          tooltip.style.display = 'block';
          tooltip.style.left = `${e.clientX + 12}px`;
          tooltip.style.top = `${e.clientY + 12}px`;
          tooltip.innerHTML = `<strong>${this.hoveredPoi.nameKey}</strong><br>Type: ${this.hoveredPoi.kind}<br>Node: ${this.hoveredPoi.nodeId}`;
        } else {
          tooltip.style.display = 'none';
        }
      }
    });

    // Mouse wheel zoom
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = (e.clientX - rect.left) * (window.devicePixelRatio || 1);
      const mouseY = (e.clientY - rect.top) * (window.devicePixelRatio || 1);

      this.offsetX = mouseX - (mouseX - this.offsetX) * zoomFactor;
      this.offsetZ = mouseY - (mouseY - this.offsetZ) * zoomFactor;
      this.scale *= zoomFactor;
      this.render();
    });
  }

  fitToScreen(): void {
    if (this.district.nodes.length === 0) return;
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const n of this.district.nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.z < minZ) minZ = n.z;
      if (n.z > maxZ) maxZ = n.z;
    }

    const margin = 80 * (window.devicePixelRatio || 1);
    const w = maxX - minX || 600;
    const h = maxZ - minZ || 600;

    const availableW = this.canvas.width - margin * 2;
    const availableH = this.canvas.height - margin * 2;

    this.scale = Math.min(availableW / w, availableH / h) * 0.9;
    this.offsetX = (this.canvas.width - w * this.scale) / 2 - minX * this.scale;
    this.offsetZ = (this.canvas.height - h * this.scale) / 2 - minZ * this.scale;
  }

  render(): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const nodeMap = new Map<string, RoadNode>(
      this.district.nodes.map((n) => [n.nodeId, n])
    );

    // 1. Draw Building Lots (background footprints)
    if (this.district.lots) {
      for (const lot of this.district.lots) {
        const cx = lot.x * this.scale + this.offsetX;
        const cy = lot.z * this.scale + this.offsetZ;
        const w = lot.width * this.scale;
        const d = lot.depth * this.scale;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(lot.facingHeading);

        let fill = 'rgba(71, 85, 105, 0.3)';
        if (lot.zone === 'market') fill = 'rgba(245, 158, 11, 0.25)';
        else if (lot.zone === 'commercial') fill = 'rgba(56, 189, 248, 0.25)';

        ctx.fillStyle = fill;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
        ctx.lineWidth = 1;
        ctx.fillRect(-w / 2, -d / 2, w, d);
        ctx.strokeRect(-w / 2, -d / 2, w, d);
        ctx.restore();
      }
    }

    // 2. Draw Road Segments
    for (const seg of this.district.segments) {
      const start = nodeMap.get(seg.startNodeId);
      const end = nodeMap.get(seg.endNodeId);
      if (!start || !end) continue;

      const x1 = start.x * this.scale + this.offsetX;
      const y1 = start.z * this.scale + this.offsetZ;
      const x2 = end.x * this.scale + this.offsetX;
      const y2 = end.z * this.scale + this.offsetZ;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);

      let strokeColor = '#64748b'; // default main
      let lineWidth = Math.max(3, seg.width * this.scale * 0.4);

      if (seg.divided) {
        strokeColor = '#f97316'; // orange divided arterial
        lineWidth = Math.max(5, seg.width * this.scale * 0.5);
      } else if (seg.tags.includes('market')) {
        strokeColor = '#eab308'; // yellow/amber market
        lineWidth = Math.max(4, seg.width * this.scale * 0.45);
      } else if (seg.roadType === 'alley') {
        strokeColor = seg.motorcycleAccessible ? '#a855f7' : '#ef4444'; // purple or red
        lineWidth = Math.max(2, seg.width * this.scale * 0.3);
        if (!seg.motorcycleAccessible) {
          ctx.setLineDash([4, 4]);
        }
      } else if (seg.floodSensitivity > 0.6) {
        strokeColor = '#06b6d4'; // cyan flood sensitive
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // One-way arrow
      if (seg.oneWay) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.save();
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        ctx.moveTo(4, 0);
        ctx.lineTo(-4, -3);
        ctx.lineTo(-4, 3);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      ctx.restore();
    }

    // 3. Draw Nodes
    for (const node of this.district.nodes) {
      const cx = node.x * this.scale + this.offsetX;
      const cy = node.z * this.scale + this.offsetZ;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(3, 4 * this.scale * 0.2), 0, Math.PI * 2);

      if (node.kind === 'uturn' || node.tags?.includes('uturn')) {
        ctx.fillStyle = '#f59e0b'; // amber U-turn
      } else if (node.tags?.includes('crossing')) {
        ctx.fillStyle = '#38bdf8'; // blue crossing
      } else {
        ctx.fillStyle = '#94a3b8';
      }
      ctx.fill();
      ctx.restore();
    }

    // 4. Draw POIs
    for (const poi of this.district.pois) {
      const node = nodeMap.get(poi.nodeId);
      if (!node) continue;

      const cx = node.x * this.scale + this.offsetX;
      const cy = node.z * this.scale + this.offsetZ;

      ctx.save();
      ctx.beginPath();
      const r = Math.max(7, 8 * this.scale * 0.25);
      ctx.arc(cx, cy - 4, r, 0, Math.PI * 2);

      let color = '#38bdf8';
      let icon = '•';
      switch (poi.kind) {
        case 'home':
          color = '#22c55e';
          icon = 'H';
          break;
        case 'teaStall':
          color = '#10b981';
          icon = 'T';
          break;
        case 'fuel':
          color = '#f97316';
          icon = 'F';
          break;
        case 'garage':
          color = '#eab308';
          icon = 'G';
          break;
        case 'school':
          color = '#3b82f6';
          icon = 'S';
          break;
        case 'pharmacy':
          color = '#14b8a6';
          icon = '+';
          break;
        case 'officeGate':
          color = '#6366f1';
          icon = 'C';
          break;
        case 'crossing':
          color = '#ec4899';
          icon = 'X';
          break;
        case 'market':
          color = '#f43f5e';
          icon = 'M';
          break;
        case 'busStop':
          color = '#eab308';
          icon = 'B';
          break;
        case 'hospital':
          color = '#ef4444';
          icon = '+';
          break;
        case 'apartment':
          color = '#8b5cf6';
          icon = 'A';
          break;
      }

      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Icon letter
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, cx, cy - 4);
      ctx.restore();
    }
  }
}

export function initMapViewer(opts: MapViewerOptions): MapViewer {
  return new MapViewer(opts);
}
