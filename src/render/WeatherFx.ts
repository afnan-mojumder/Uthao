import * as THREE from 'three';
import type { WeatherKind, RoadSegment, RoadNode } from '../core/types';
import { TimeOfDay } from '../sim/world/TimeOfDay';

export interface WeatherFxOptions {
  dirLight?: THREE.DirectionalLight;
  hemiLight?: THREE.HemisphereLight;
  drawDistance?: number;
}

export class WeatherFx {
  readonly scene: THREE.Scene;
  readonly dirLight?: THREE.DirectionalLight;
  readonly hemiLight?: THREE.HemisphereLight;
  readonly drawDistance: number;

  readonly rainGroup: THREE.Group;
  private rainGeometry: THREE.BufferGeometry;
  private rainMaterial: THREE.PointsMaterial;
  private rainPoints: THREE.Points;
  private rainPositions: Float32Array;
  private readonly rainCount = 1000;
  private readonly rainBoxSize = 50;

  readonly headlight: THREE.SpotLight;
  readonly headlightTarget: THREE.Object3D;

  readonly streetlightsGroup: THREE.Group;
  private streetlightMaterials: THREE.MeshBasicMaterial[] = [];

  readonly waterGroup: THREE.Group;
  private waterMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, opts: WeatherFxOptions = {}) {
    this.scene = scene;
    this.dirLight = opts.dirLight;
    this.hemiLight = opts.hemiLight;
    this.drawDistance = opts.drawDistance ?? 250;

    // 1. Rain particle system (GPU Points)
    this.rainGroup = new THREE.Group();
    this.rainPositions = new Float32Array(this.rainCount * 3);

    for (let i = 0; i < this.rainCount; i++) {
      this.rainPositions[i * 3 + 0] = (Math.random() - 0.5) * this.rainBoxSize;
      this.rainPositions[i * 3 + 1] = Math.random() * 25;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * this.rainBoxSize;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.rainPositions, 3)
    );

    this.rainMaterial = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.25,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    this.rainPoints = new THREE.Points(this.rainGeometry, this.rainMaterial);
    this.rainGroup.add(this.rainPoints);
    this.rainGroup.visible = false;
    this.scene.add(this.rainGroup);

    // 2. Headlight cone (SpotLight)
    this.headlight = new THREE.SpotLight(0xfff3d6, 0, 40, 0.45, 0.5, 1);
    this.headlight.castShadow = false;
    this.headlightTarget = new THREE.Object3D();
    this.headlight.target = this.headlightTarget;

    this.scene.add(this.headlight);
    this.scene.add(this.headlightTarget);

    // 3. Streetlights group
    this.streetlightsGroup = new THREE.Group();
    this.scene.add(this.streetlightsGroup);

    // 4. Water plane overlay for flooded segments
    this.waterGroup = new THREE.Group();
    this.waterMaterial = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      roughness: 0.1,
      metalness: 0.1,
      depthWrite: false,
    });
    this.scene.add(this.waterGroup);
  }

  /**
   * Main per-frame update for weather, lighting, time of day, rain, and headlights.
   */
  update(
    dt: number,
    minute: number,
    weather: WeatherKind,
    bikePos: { x: number; y: number; z: number },
    bikeHeading: number,
    hasLedUpgrade: boolean = false
  ): void {
    // 1. Time of Day Lighting & Sky
    const sunSky = TimeOfDay.getSunSkyState(minute);

    if (this.dirLight) {
      this.dirLight.position.set(...sunSky.sunPosition);
      this.dirLight.color.setHex(sunSky.sunColor);
      let intensity = sunSky.sunIntensity;
      if (weather === 'cloudy') intensity *= 0.65;
      else if (weather === 'lightRain') intensity *= 0.45;
      else if (weather === 'heavyRain') intensity *= 0.25;
      this.dirLight.intensity = intensity;
    }

    if (this.hemiLight) {
      this.hemiLight.color.setHex(sunSky.ambientColor);
      let intensity = sunSky.ambientIntensity;
      if (weather === 'cloudy') intensity *= 0.8;
      else if (weather === 'lightRain') intensity *= 0.65;
      else if (weather === 'heavyRain') intensity *= 0.4;
      this.hemiLight.intensity = intensity;
    }

    // Sky & Fog adjustments
    if (this.scene.background instanceof THREE.Color) {
      if (weather === 'heavyRain') {
        this.scene.background.setHex(0x334155); // Dark stormy slate
      } else if (weather === 'lightRain' || weather === 'cloudy') {
        this.scene.background.setHex(0x64748b); // Overcast gray
      } else {
        this.scene.background.setHex(sunSky.skyColor);
      }
    }

    if (this.scene.fog instanceof THREE.Fog) {
      if (weather === 'heavyRain') {
        this.scene.fog.color.setHex(0x334155);
        this.scene.fog.near = 15;
        this.scene.fog.far = Math.min(80, this.drawDistance);
      } else if (weather === 'lightRain') {
        this.scene.fog.color.setHex(0x64748b);
        this.scene.fog.near = 30;
        this.scene.fog.far = Math.min(130, this.drawDistance);
      } else {
        this.scene.fog.color.setHex(sunSky.fogColor);
        this.scene.fog.near = 50;
        this.scene.fog.far = this.drawDistance;
      }
    }

    // 2. Rain Particle Simulation
    const isRaining = weather === 'lightRain' || weather === 'heavyRain';
    this.rainGroup.visible = isRaining;

    if (isRaining) {
      this.rainGroup.position.set(bikePos.x, 0, bikePos.z);
      const fallSpeed = weather === 'heavyRain' ? 45 : 25;
      this.rainMaterial.opacity = weather === 'heavyRain' ? 0.8 : 0.45;
      this.rainMaterial.size = weather === 'heavyRain' ? 0.3 : 0.2;

      const pos = this.rainPositions;
      for (let i = 0; i < this.rainCount; i++) {
        const yIdx = i * 3 + 1;
        const currentY = pos[yIdx] ?? 0;
        let nextY = currentY - fallSpeed * dt;
        if (nextY < 0) {
          nextY += 25;
          // Scatter slightly on respawn
          pos[i * 3 + 0] = (Math.random() - 0.5) * this.rainBoxSize;
          pos[i * 3 + 2] = (Math.random() - 0.5) * this.rainBoxSize;
        }
        pos[yIdx] = nextY;
      }
      this.rainGeometry.attributes.position!.needsUpdate = true;
    }

    // 3. Headlight cone
    const spec = TimeOfDay.getHeadlightSpec(hasLedUpgrade);
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

    // 4. Streetlights
    const streetlightsOn = TimeOfDay.isStreetlightsActive(minute);
    this.setStreetlightsLit(streetlightsOn);
  }

  setStreetlightsLit(lit: boolean): void {
    const emissiveHex = lit ? 0xfef08a : 0x475569;
    for (const mat of this.streetlightMaterials) {
      mat.color.setHex(emissiveHex);
    }
  }

  /**
   * Spawns or updates water planes for flooded road segments.
   */
  updateFloodedSegments(
    floodedSegments: RoadSegment[],
    nodeMap: Map<string, RoadNode>
  ): void {
    // Clear old water meshes
    while (this.waterGroup.children.length > 0) {
      const child = this.waterGroup.children.pop();
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    }

    for (const seg of floodedSegments) {
      const start = nodeMap.get(seg.startNodeId);
      const end = nodeMap.get(seg.endNodeId);
      if (!start || !end) continue;

      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      const midX = (start.x + end.x) / 2;
      const midZ = (start.z + end.z) / 2;
      const angle = Math.atan2(dx, dz);

      const geo = new THREE.PlaneGeometry(seg.width * 1.1, length);
      const mesh = new THREE.Mesh(geo, this.waterMaterial);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = angle;
      mesh.position.set(midX, 0.04, midZ);
      this.waterGroup.add(mesh);
    }
  }

  dispose(): void {
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.waterMaterial.dispose();
    this.scene.remove(this.rainGroup);
    this.scene.remove(this.headlight);
    this.scene.remove(this.headlightTarget);
    this.scene.remove(this.streetlightsGroup);
    this.scene.remove(this.waterGroup);
  }
}
