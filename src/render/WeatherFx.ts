import * as THREE from 'three';
import type { WeatherKind, RoadSegment, RoadNode } from '../core/types';
import { TimeOfDay, type SunSkyState, type HeadlightSpec } from '../sim/world/TimeOfDay';
import { getRoadWidth, kerbEndTrim } from './roadMesh';

const SHADOW_FRUSTUM_HALF = 55;
const MAX_POOL_LIGHTS = 4;
const STREETLIGHT_RADIUS_SQ = 70 * 70;
const STREETLIGHT_HEAD_HEIGHT = 5.05;
const STREETLIGHT_ARM_OFFSET = 1.2;

export interface WeatherFxOptions {
  dirLight?: THREE.DirectionalLight;
  hemiLight?: THREE.HemisphereLight;
  drawDistance?: number;
  rainCount?: number;
  maxPointLights?: number;
  wind?: { x: number; z: number };
}

function wrapOffset(delta: number, boxSize: number): number {
  const half = boxSize * 0.5;
  let d = (delta + half) % boxSize;
  if (d < 0) d += boxSize;
  return d - half;
}

const _lumColor = new THREE.Color();

/** Luminance of an ambient light: intensity times the colour's perceived brightness. */
function ambientLuminance(colorHex: number, intensity: number): number {
  _lumColor.setHex(colorHex);
  return intensity * (0.2126 * _lumColor.r + 0.7152 * _lumColor.g + 0.0722 * _lumColor.b);
}

export class WeatherFx {
  readonly scene: THREE.Scene;
  readonly dirLight?: THREE.DirectionalLight;
  readonly hemiLight?: THREE.HemisphereLight;
  readonly drawDistance: number;

  readonly rainGroup: THREE.Group;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.LineBasicMaterial;
  private rainLines: THREE.LineSegments;
  private splashGeometry: THREE.BufferGeometry;
  private splashMaterial: THREE.LineBasicMaterial;
  private splashLines: THREE.LineSegments;
  private ambientFloorLum: number | undefined;
  /** Drop heads in world space: x, y, z per drop. */
  private rainPositions: Float32Array;
  /** Two vertices per drop (top and bottom of the streak), drawn as line segments. */
  private rainLineVerts: Float32Array;
  private rainInitialized = false;
  private readonly rainCount: number;
  private readonly rainBoxSize = 50;
  private readonly splashCount: number;
  /** Per splash: wx, wz, age, maxAge. */
  private splashData: Float32Array;
  /** 4 vertices (2 line segments) per splash. */
  private splashVerts: Float32Array;
  private readonly windX: number;
  private readonly windZ: number;

  readonly headlight: THREE.SpotLight;
  readonly headlightTarget: THREE.Object3D;

  readonly streetlightsGroup: THREE.Group;
  private streetlightMaterials: THREE.MeshBasicMaterial[] = [];
  private lampHeadGeo: THREE.BufferGeometry;
  private lampHeadMat: THREE.MeshBasicMaterial;
  private lampInstancedMesh?: THREE.InstancedMesh;
  private lampPositions = new Float32Array(0);
  private lampCount = 0;
  private readonly pointLightPool: THREE.PointLight[] = [];
  private maxPointLights: number;
  private readonly _nearestIndices = new Int32Array(MAX_POOL_LIGHTS);
  private readonly _nearestDistSq = new Float64Array(MAX_POOL_LIGHTS);
  private readonly _unlitLampColor = new THREE.Color(0x475569);
  private readonly _litLampColor = new THREE.Color(0xfef08a);

  readonly waterGroup: THREE.Group;
  private waterMaterial: THREE.MeshStandardMaterial;
  private activeFloodedIds: string[] = [];

  private readonly _skyTopColor = new THREE.Color(0x2563eb);
  private readonly _skyHorizonColor = new THREE.Color(0xc7e8fb);
  private readonly _stormTopColor = new THREE.Color(0x334155);
  private readonly _stormNightColor = new THREE.Color(0x0f172a);
  private readonly _overcastTopColor = new THREE.Color(0x64748b);
  private readonly _overcastNightColor = new THREE.Color(0x162033);
  private readonly _sunSkyScratch: SunSkyState = {
    sunColor: 0,
    sunIntensity: 0,
    sunPosition: [0, 0, 0],
    skyColor: 0,
    skyTopColor: 0,
    skyHorizonColor: 0,
    fogColor: 0,
    ambientColor: 0,
    groundColor: 0,
    ambientIntensity: 0,
  };
  private readonly _headlightScratch: HeadlightSpec = {
    angle: 0,
    distance: 0,
    intensity: 0,
    penumbra: 0,
    color: 0,
  };

  constructor(scene: THREE.Scene, opts: WeatherFxOptions = {}) {
    this.scene = scene;
    this.dirLight = opts.dirLight;
    this.hemiLight = opts.hemiLight;
    this.drawDistance = opts.drawDistance ?? 250;
    this.rainCount = opts.rainCount ?? 800;
    this.splashCount = Math.max(40, Math.floor(this.rainCount * 0.25));
    this.maxPointLights = Math.max(0, Math.min(MAX_POOL_LIGHTS, opts.maxPointLights ?? MAX_POOL_LIGHTS));
    this.windX = opts.wind?.x ?? 0;
    this.windZ = opts.wind?.z ?? 0;

    // 1. Rain particle system (world-space wrapped LineSegments + ground splashes)
    this.rainGroup = new THREE.Group();
    this.rainPositions = new Float32Array(this.rainCount * 3);
    this.rainLineVerts = new Float32Array(this.rainCount * 6);

    for (let i = 0; i < this.rainCount; i++) {
      this.rainPositions[i * 3 + 0] = (Math.random() - 0.5) * this.rainBoxSize;
      this.rainPositions[i * 3 + 1] = Math.random() * 25;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * this.rainBoxSize;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainLineVerts, 3)
    );

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xbae6fd,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    this.rainLines = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rainLines.frustumCulled = false;
    this.rainGroup.add(this.rainLines);

    // Ground splash streaks (child index 1, keeping rainLines at index 0)
    this.splashData = new Float32Array(this.splashCount * 4);
    this.splashVerts = new Float32Array(this.splashCount * 12);
    for (let i = 0; i < this.splashCount; i++) {
      const maxAge = 0.22 + Math.random() * 0.18;
      this.splashData[i * 4 + 0] = (Math.random() - 0.5) * this.rainBoxSize;
      this.splashData[i * 4 + 1] = (Math.random() - 0.5) * this.rainBoxSize;
      this.splashData[i * 4 + 2] = Math.random() * maxAge;
      this.splashData[i * 4 + 3] = maxAge;
    }
    this.splashGeometry = new THREE.BufferGeometry();
    this.splashGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.splashVerts, 3)
    );
    this.splashMaterial = new THREE.LineBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.splashLines = new THREE.LineSegments(this.splashGeometry, this.splashMaterial);
    this.splashLines.frustumCulled = false;
    this.rainGroup.add(this.splashLines);

    this.rainGroup.visible = false;
    this.scene.add(this.rainGroup);

    // 2. Headlight cone (SpotLight)
    this.headlight = new THREE.SpotLight(0xfff3d6, 0, 40, 0.45, 0.5, 1);
    this.headlight.castShadow = false;
    this.headlightTarget = new THREE.Object3D();
    this.headlight.target = this.headlightTarget;

    this.scene.add(this.headlight);
    this.scene.add(this.headlightTarget);

    // 3. Streetlights group (instanced lamp heads + fixed PointLight pool)
    this.streetlightsGroup = new THREE.Group();
    this.streetlightsGroup.name = 'streetlights_group';
    this.lampHeadGeo = new THREE.BoxGeometry(0.36, 0.14, 0.54);
    this.lampHeadMat = new THREE.MeshBasicMaterial({ color: 0x475569 });
    this.streetlightMaterials.push(this.lampHeadMat);

    for (let i = 0; i < MAX_POOL_LIGHTS; i++) {
      const pl = new THREE.PointLight(0xffd27d, 0, 28, 1.6);
      pl.castShadow = false;
      pl.visible = i < this.maxPointLights;
      this.pointLightPool.push(pl);
      this.streetlightsGroup.add(pl);
    }
    this.scene.add(this.streetlightsGroup);

    // 4. Water plane overlay for flooded segments
    this.waterGroup = new THREE.Group();
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x265469,
      transparent: true,
      opacity: 0.65,
      roughness: 0.08,
      metalness: 0.35,
      depthWrite: false,
    });
    this.scene.add(this.waterGroup);
  }

  getSkyTopColor(): THREE.Color {
    return this._skyTopColor;
  }

  getSkyHorizonColor(): THREE.Color {
    return this._skyHorizonColor;
  }

  setMaxPointLights(max: number): void {
    this.maxPointLights = Math.max(0, Math.min(MAX_POOL_LIGHTS, max));
    for (let i = 0; i < this.pointLightPool.length; i++) {
      const pl = this.pointLightPool[i]!;
      const enabled = i < this.maxPointLights;
      pl.visible = enabled;
      if (!enabled) pl.intensity = 0;
    }
  }

  /**
   * Populates instanced glowing streetlamp heads along ground road segments.
   * Uses a single InstancedMesh (1 draw call) matching CityBuilder's lamp placement.
   * `trimSegments` provides the full intersection trim context (e.g. including world connectors)
   * without spawning floating lamp heads on connector segments that lack poles.
   */
  populateStreetlights(
    segments: readonly RoadSegment[],
    nodeMap: ReadonlyMap<string, RoadNode>,
    trimSegments: readonly RoadSegment[] = segments
  ): void {
    if (this.lampInstancedMesh) {
      this.streetlightsGroup.remove(this.lampInstancedMesh);
      this.lampInstancedMesh.dispose();
      this.lampInstancedMesh = undefined;
    }

    const coords: number[] = [];
    const rots: number[] = [];

    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx]!;
      if (seg.roadType === 'flyover' || seg.roadType === 'alley') continue;

      const sNode = nodeMap.get(seg.startNodeId);
      const eNode = nodeMap.get(seg.endNodeId);
      if (!sNode || !eNode) continue;
      if ((sNode.y ?? 0) > 0.5 || (eNode.y ?? 0) > 0.5) continue;

      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const len = Math.hypot(dx, dz);
      if (len < 22) continue;

      const dirX = dx / len;
      const dirZ = dz / len;
      const nx = -dirZ;
      const nz = dirX;
      const roadW = getRoadWidth(seg);

      const rightStart = kerbEndTrim(seg, true, trimSegments, nodeMap, 1);
      const rightEnd = kerbEndTrim(seg, false, trimSegments, nodeMap, 1);
      const rightKerbLen = len - rightStart - rightEnd;

      if (rightKerbLen > 16) {
        const lampStep = 38;
        const numLamps = Math.max(1, Math.floor(rightKerbLen / lampStep));
        const lampLat = roadW / 2 + 0.55;
        for (let i = 0; i < numLamps; i++) {
          const along = rightStart + ((i + 0.5) / numLamps) * rightKerbLen;
          const lx = sNode.x + dirX * along + nx * lampLat;
          const lz = sNode.z + dirZ * along + nz * lampLat;
          const headX = lx - nx * STREETLIGHT_ARM_OFFSET;
          const headZ = lz - nz * STREETLIGHT_ARM_OFFSET;
          coords.push(headX, STREETLIGHT_HEAD_HEIGHT, headZ);
          rots.push(Math.atan2(nx, nz));
        }
      }
    }

    this.lampCount = rots.length;
    this.lampPositions = new Float32Array(coords);

    if (this.lampCount > 0) {
      const mesh = new THREE.InstancedMesh(this.lampHeadGeo, this.lampHeadMat, this.lampCount);
      mesh.name = 'streetlight_heads';
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;

      const dummy = new THREE.Object3D();
      for (let i = 0; i < this.lampCount; i++) {
        dummy.position.set(coords[i * 3]!, coords[i * 3 + 1]!, coords[i * 3 + 2]!);
        dummy.rotation.set(0, rots[i]!, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.lampInstancedMesh = mesh;
      this.streetlightsGroup.add(mesh);
    }
  }

  /** 30% of the midday ambient luminance, computed once. */
  private nightAmbientFloor(): number {
    if (this.ambientFloorLum === undefined) {
      const noon = TimeOfDay.getSunSkyState(12 * 60, this._sunSkyScratch);
      this.ambientFloorLum = 0.3 * ambientLuminance(noon.ambientColor, noon.ambientIntensity);
    }
    return this.ambientFloorLum;
  }

  /**
   * Main per-frame update for weather, lighting, time of day, rain, streetlights, and headlights.
   * Steady-state calls perform zero heap allocations.
   */
  update(
    dt: number,
    minute: number,
    weather: WeatherKind,
    bikePos: { x: number; y: number; z: number },
    bikeHeading: number,
    hasLedUpgrade: boolean = false,
    bikeSpeed: number = 0
  ): void {
    // 1. Time of Day Lighting & Sky
    const sunSky = TimeOfDay.getSunSkyState(minute, this._sunSkyScratch);

    if (this.dirLight) {
      const mapSize = this.dirLight.shadow.mapSize.width || 1024;
      const texelSize = (2 * SHADOW_FRUSTUM_HALF) / mapSize;
      const snapX = Math.round(bikePos.x / texelSize) * texelSize;
      const snapY = Math.round(bikePos.y / texelSize) * texelSize;
      const snapZ = Math.round(bikePos.z / texelSize) * texelSize;

      this.dirLight.target.position.set(snapX, snapY, snapZ);
      this.dirLight.position.set(
        snapX + sunSky.sunPosition[0],
        snapY + sunSky.sunPosition[1],
        snapZ + sunSky.sunPosition[2]
      );
      this.dirLight.color.setHex(sunSky.sunColor);
      let intensity = sunSky.sunIntensity;
      if (weather === 'cloudy') intensity *= 0.65;
      else if (weather === 'lightRain') intensity *= 0.45;
      else if (weather === 'heavyRain') intensity *= 0.25;
      this.dirLight.intensity = intensity;
    }

    if (this.hemiLight) {
      this.hemiLight.color.setHex(sunSky.ambientColor);
      this.hemiLight.groundColor.setHex(sunSky.groundColor);
      let intensity = sunSky.ambientIntensity;
      if (weather === 'cloudy') intensity *= 0.8;
      else if (weather === 'lightRain') intensity *= 0.65;
      else if (weather === 'heavyRain') intensity *= 0.45;
      // Night keeps a readable floor: it never drops below 30% of midday ambient light.
      const floor = this.nightAmbientFloor();
      const lum = ambientLuminance(sunSky.ambientColor, intensity);
      if (lum > 0 && lum < floor) intensity *= floor / lum;
      this.hemiLight.intensity = intensity;
    }

    // Sky Dome Gradient & Fog adjustments (zero alloc)
    const dayFactor = Math.max(0, Math.min(1, (sunSky.ambientIntensity - 0.42) / (1.0 - 0.42)));
    if (weather === 'heavyRain') {
      this._skyTopColor.copy(this._stormNightColor).lerp(this._stormTopColor, dayFactor);
      this._skyHorizonColor.copy(this._skyTopColor);
    } else if (weather === 'lightRain' || weather === 'cloudy') {
      this._skyTopColor.copy(this._overcastNightColor).lerp(this._overcastTopColor, dayFactor);
      this._skyHorizonColor.copy(this._skyTopColor);
    } else {
      this._skyTopColor.setHex(sunSky.skyTopColor);
      this._skyHorizonColor.setHex(sunSky.skyHorizonColor);
    }

    if (this.scene.background instanceof THREE.Color) {
      if (weather === 'heavyRain' || weather === 'lightRain' || weather === 'cloudy') {
        this.scene.background.copy(this._skyTopColor);
      } else {
        this.scene.background.setHex(sunSky.skyColor);
      }
    }

    if (this.scene.fog instanceof THREE.Fog) {
      if (weather === 'heavyRain') {
        this.scene.fog.color.copy(this._skyHorizonColor);
        this.scene.fog.near = 15;
        this.scene.fog.far = Math.min(80, this.drawDistance);
      } else if (weather === 'lightRain') {
        this.scene.fog.color.copy(this._skyHorizonColor);
        this.scene.fog.near = 30;
        this.scene.fog.far = Math.min(130, this.drawDistance);
      } else if (weather === 'cloudy') {
        this.scene.fog.color.copy(this._skyHorizonColor);
        this.scene.fog.near = 45;
        this.scene.fog.far = this.drawDistance;
      } else {
        this.scene.fog.color.setHex(sunSky.fogColor);
        this.scene.fog.near = 50;
        this.scene.fog.far = this.drawDistance;
      }
    }

    // 2. World-space wrapped Rain + Ground Splash simulation
    const isRaining = weather === 'lightRain' || weather === 'heavyRain';
    this.rainGroup.visible = isRaining;

    if (isRaining) {
      this.rainGroup.position.set(0, 0, 0);
      const fallSpeed = weather === 'heavyRain' ? 45 : 25;
      this.rainMaterial.opacity = weather === 'heavyRain' ? 0.8 : 0.45;
      this.splashMaterial.opacity = weather === 'heavyRain' ? 0.6 : 0.35;

      const streakSec = weather === 'heavyRain' ? 0.018 : 0.016;
      const windMul = weather === 'heavyRain' ? 1.0 : 0.5;
      const effWindX = this.windX * windMul;
      const effWindZ = this.windZ * windMul;

      const relVx = effWindX - Math.sin(bikeHeading) * bikeSpeed;
      const relVz = effWindZ - Math.cos(bikeHeading) * bikeSpeed;
      const slantX = relVx * streakSec;
      const slantZ = relVz * streakSec;
      const streakY = fallSpeed * streakSec;

      const groundY = Math.max(0, bikePos.y);
      const halfBox = this.rainBoxSize * 0.5;
      const pos = this.rainPositions;
      const verts = this.rainLineVerts;

      if (!this.rainInitialized) {
        this.rainInitialized = true;
        for (let i = 0; i < this.rainCount; i++) {
          pos[i * 3 + 0] = bikePos.x + (Math.random() - 0.5) * this.rainBoxSize;
          pos[i * 3 + 1] = groundY + Math.random() * 25;
          pos[i * 3 + 2] = bikePos.z + (Math.random() - 0.5) * this.rainBoxSize;
        }
        for (let i = 0; i < this.splashCount; i++) {
          this.splashData[i * 4 + 0] = bikePos.x + (Math.random() - 0.5) * this.rainBoxSize;
          this.splashData[i * 4 + 1] = bikePos.z + (Math.random() - 0.5) * this.rainBoxSize;
        }
      }

      for (let i = 0; i < this.rainCount; i++) {
        const i3 = i * 3;
        let wx = pos[i3 + 0]! + effWindX * dt;
        let wy = pos[i3 + 1]! - fallSpeed * dt;
        let wz = pos[i3 + 2]! + effWindZ * dt;

        let relY = wy - groundY;
        if (relY < 0 || relY >= 25) {
          relY = ((relY % 25) + 25) % 25;
          wx = bikePos.x + (Math.random() - 0.5) * this.rainBoxSize;
          wz = bikePos.z + (Math.random() - 0.5) * this.rainBoxSize;
        } else {
          wx = bikePos.x + wrapOffset(wx - bikePos.x, this.rainBoxSize);
          wz = bikePos.z + wrapOffset(wz - bikePos.z, this.rainBoxSize);
        }
        wy = groundY + relY;

        pos[i3 + 0] = wx;
        pos[i3 + 1] = wy;
        pos[i3 + 2] = wz;

        const v = i * 6;
        verts[v + 0] = wx - slantX;
        verts[v + 1] = wy + streakY;
        verts[v + 2] = wz - slantZ;
        verts[v + 3] = wx;
        verts[v + 4] = wy;
        verts[v + 5] = wz;
      }
      this.rainGeometry.attributes.position!.needsUpdate = true;

      // Ground splash particles
      const splashMaxHeight = weather === 'heavyRain' ? 0.24 : 0.14;
      const splashMaxSpread = weather === 'heavyRain' ? 0.28 : 0.18;
      const sData = this.splashData;
      const sVerts = this.splashVerts;
      const splashY = groundY + 0.02;

      for (let i = 0; i < this.splashCount; i++) {
        const i4 = i * 4;
        const maxAge = sData[i4 + 3]!;
        let age = sData[i4 + 2]! + dt;
        let wx = sData[i4 + 0]!;
        let wz = sData[i4 + 1]!;

        if (age >= maxAge) {
          age %= maxAge;
          wx = bikePos.x + (Math.random() - 0.5) * halfBox * 2;
          wz = bikePos.z + (Math.random() - 0.5) * halfBox * 2;
        } else {
          wx = bikePos.x + wrapOffset(wx - bikePos.x, this.rainBoxSize);
          wz = bikePos.z + wrapOffset(wz - bikePos.z, this.rainBoxSize);
        }
        sData[i4 + 0] = wx;
        sData[i4 + 1] = wz;
        sData[i4 + 2] = age;

        const t = age / maxAge;
        const h = 4 * t * (1 - t) * splashMaxHeight;
        const sp = t * splashMaxSpread;
        const sv = i * 12;

        sVerts[sv + 0] = wx;
        sVerts[sv + 1] = splashY;
        sVerts[sv + 2] = wz;
        sVerts[sv + 3] = wx + sp;
        sVerts[sv + 4] = splashY + h;
        sVerts[sv + 5] = wz + sp * 0.5;

        sVerts[sv + 6] = wx;
        sVerts[sv + 7] = splashY;
        sVerts[sv + 8] = wz;
        sVerts[sv + 9] = wx - sp;
        sVerts[sv + 10] = splashY + h;
        sVerts[sv + 11] = wz - sp * 0.5;
      }
      this.splashGeometry.attributes.position!.needsUpdate = true;
    }

    // 3. Headlight cone
    const spec = TimeOfDay.getHeadlightSpec(hasLedUpgrade, this._headlightScratch);
    const isDark = TimeOfDay.isStreetlightsActive(minute) || weather === 'heavyRain';

    if (isDark) {
      this.headlight.position.set(bikePos.x, bikePos.y + 0.8, bikePos.z);
      const fwdX = Math.sin(bikeHeading);
      const fwdZ = Math.cos(bikeHeading);
      this.headlightTarget.position.set(
        bikePos.x + fwdX * 25,
        bikePos.y + 0.1,
        bikePos.z + fwdZ * 25
      );

      this.headlight.angle = spec.angle;
      this.headlight.distance = spec.distance;
      this.headlight.intensity = spec.intensity;
      this.headlight.penumbra = spec.penumbra;
      this.headlight.color.setHex(spec.color);
      this.headlight.visible = true;
    } else {
      this.headlight.visible = false;
      this.headlight.intensity = 0;
    }

    // 4. Streetlights (dusk emissive fade + pooled nearby warm PointLights)
    const duskGlow = TimeOfDay.getStreetlightIntensity(minute);
    this.setStreetlightsIntensity(duskGlow);
    this.updatePooledStreetlights(bikePos, duskGlow);
  }

  private setStreetlightsIntensity(glow01: number): void {
    const t = Math.max(0, Math.min(1, glow01));
    for (let i = 0; i < this.streetlightMaterials.length; i++) {
      this.streetlightMaterials[i]!.color
        .copy(this._unlitLampColor)
        .lerp(this._litLampColor, t);
    }
  }

  private updatePooledStreetlights(
    bikePos: { x: number; y: number; z: number },
    duskGlow: number
  ): void {
    const cap = Math.min(this.maxPointLights, this.pointLightPool.length);
    if (cap <= 0 || duskGlow <= 0.01 || this.lampCount === 0) {
      for (let i = 0; i < this.pointLightPool.length; i++) {
        this.pointLightPool[i]!.intensity = 0;
      }
      return;
    }

    for (let k = 0; k < cap; k++) {
      this._nearestIndices[k] = -1;
      this._nearestDistSq[k] = STREETLIGHT_RADIUS_SQ;
    }

    for (let i = 0; i < this.lampCount; i++) {
      const lx = this.lampPositions[i * 3 + 0]!;
      const lz = this.lampPositions[i * 3 + 2]!;
      const dx = lx - bikePos.x;
      const dz = lz - bikePos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq >= this._nearestDistSq[cap - 1]!) continue;

      let insertAt = cap - 1;
      while (insertAt > 0 && dSq < this._nearestDistSq[insertAt - 1]!) {
        this._nearestDistSq[insertAt] = this._nearestDistSq[insertAt - 1]!;
        this._nearestIndices[insertAt] = this._nearestIndices[insertAt - 1]!;
        insertAt--;
      }
      this._nearestDistSq[insertAt] = dSq;
      this._nearestIndices[insertAt] = i;
    }

    for (let k = 0; k < this.pointLightPool.length; k++) {
      const pl = this.pointLightPool[k]!;
      if (k >= cap || this._nearestIndices[k]! < 0) {
        pl.intensity = 0;
        continue;
      }
      const idx = this._nearestIndices[k]! * 3;
      const lx = this.lampPositions[idx]!;
      const ly = this.lampPositions[idx + 1]!;
      const lz = this.lampPositions[idx + 2]!;
      pl.position.set(lx, ly - 0.35, lz);
      const distRatio = Math.sqrt(this._nearestDistSq[k]!) / 70;
      pl.intensity = 22 * duskGlow * (0.4 + 0.6 * (1 - Math.min(1, distRatio)));
    }
  }

  setStreetlightsLit(lit: boolean): void {
    this.setStreetlightsIntensity(lit ? 1 : 0);
  }

  /**
   * Spawns or updates water planes for flooded road segments.
   * Skips rebuilding when the flooded segment ID list is unchanged (zero allocations).
   */
  updateFloodedSegments(
    floodedSegments: readonly RoadSegment[],
    nodeMap: ReadonlyMap<string, RoadNode>
  ): void {
    if (floodedSegments.length === this.activeFloodedIds.length) {
      let same = true;
      for (let i = 0; i < floodedSegments.length; i++) {
        if (floodedSegments[i]!.segmentId !== this.activeFloodedIds[i]) {
          same = false;
          break;
        }
      }
      if (same) return;
    }

    // Clear old water meshes cleanly
    for (let i = this.waterGroup.children.length - 1; i >= 0; i--) {
      const child = this.waterGroup.children[i];
      if (child) {
        this.waterGroup.remove(child);
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      }
    }

    this.activeFloodedIds.length = 0;

    for (let i = 0; i < floodedSegments.length; i++) {
      const seg = floodedSegments[i]!;
      this.activeFloodedIds.push(seg.segmentId);
      if (seg.roadType === 'flyover') continue;

      const start = nodeMap.get(seg.startNodeId);
      const end = nodeMap.get(seg.endNodeId);
      if (!start || !end) continue;
      if ((start.y ?? 0) > 0.5 || (end.y ?? 0) > 0.5) continue;

      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.1) continue;
      const midX = (start.x + end.x) / 2;
      const midZ = (start.z + end.z) / 2;
      const midY = ((start.y ?? 0) + (end.y ?? 0)) * 0.5;
      const angle = Math.atan2(dx, dz);

      const geo = new THREE.PlaneGeometry(seg.width * 1.1, length);
      const mesh = new THREE.Mesh(geo, this.waterMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = angle;
      mesh.position.set(midX, midY + 0.04, midZ);
      mesh.receiveShadow = true;
      this.waterGroup.add(mesh);
    }
  }

  dispose(): void {
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.splashGeometry.dispose();
    this.splashMaterial.dispose();
    this.lampHeadGeo.dispose();
    this.lampHeadMat.dispose();
    if (this.lampInstancedMesh) {
      this.lampInstancedMesh.dispose();
    }
    this.waterMaterial.dispose();
    for (let i = this.waterGroup.children.length - 1; i >= 0; i--) {
      const child = this.waterGroup.children[i];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }
    this.scene.remove(this.rainGroup);
    this.scene.remove(this.headlight);
    this.scene.remove(this.headlightTarget);
    this.scene.remove(this.streetlightsGroup);
    this.scene.remove(this.waterGroup);
  }
}
