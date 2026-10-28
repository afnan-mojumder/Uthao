import * as THREE from 'three';

export type ParticleType = 'smoke' | 'dust' | 'spark';

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
  type: ParticleType;
}

export class ParticlePool {
  readonly root: THREE.Group;
  private maxParticles: number;
  private particles: Particle[];
  private instancedMesh: THREE.InstancedMesh;
  private dummy: THREE.Object3D;
  private colorSmoke = new THREE.Color(0x94a3b8);
  private colorDust = new THREE.Color(0xd97706);
  private colorSpark = new THREE.Color(0xfacc15);

  constructor(maxParticles = 120) {
    this.maxParticles = maxParticles;
    this.root = new THREE.Group();
    this.dummy = new THREE.Object3D();

    // Low-poly icosahedron for particles (fast, low vertex count)
    const geo = new THREE.IcosahedronGeometry(0.12, 0);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });

    this.instancedMesh = new THREE.InstancedMesh(geo, mat, maxParticles);
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize pool
    this.particles = new Array(maxParticles);
    for (let i = 0; i < maxParticles; i++) {
      this.particles[i] = {
        active: false,
        x: 0,
        y: -100, // hidden
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 1.0,
        scale: 1.0,
        type: 'smoke',
      };
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      this.instancedMesh.setColorAt(i, this.colorSmoke);
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    this.root.add(this.instancedMesh);
  }

  public spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    type: ParticleType = 'smoke',
    maxLife = 0.8
  ): void {
    // Find first inactive particle in pool (O(n) capped at maxParticles = 120)
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]!;
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = vx;
        p.vy = vy;
        p.vz = vz;
        p.life = 0;
        p.maxLife = maxLife;
        p.scale = type === 'spark' ? 0.6 : 0.9;
        p.type = type;

        const color = type === 'spark' ? this.colorSpark : type === 'dust' ? this.colorDust : this.colorSmoke;
        this.instancedMesh.setColorAt(i, color);
        if (this.instancedMesh.instanceColor) {
          this.instancedMesh.instanceColor.needsUpdate = true;
        }
        return;
      }
    }
  }

  public update(dt: number): void {
    let dirty = false;

    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.particles[i]!;
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.dummy.position.set(0, -100, 0);
        this.dummy.scale.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
        dirty = true;
        continue;
      }

      // Physics integration
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      // Buoyancy or gravity
      if (p.type === 'smoke') {
        p.vy += 0.8 * dt; // Smoke rises
        p.scale += 1.2 * dt; // Expands
      } else if (p.type === 'spark') {
        p.vy -= 4.0 * dt; // Gravity
        p.scale = Math.max(0.1, p.scale - 0.8 * dt);
      } else {
        p.scale += 0.4 * dt;
      }

      const lifeProgress = p.life / p.maxLife;
      const currentScale = p.scale * (1.0 - lifeProgress * 0.7);

      this.dummy.position.set(p.x, Math.max(0.05, p.y), p.z);
      this.dummy.scale.set(currentScale, currentScale, currentScale);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      dirty = true;
    }

    if (dirty) {
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
