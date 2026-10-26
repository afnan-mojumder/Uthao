import * as THREE from 'three';

export type TimeOfDay = 'day' | 'evening' | 'night';
export type WeatherType = 'clear' | 'rain';

export class EnvironmentController {
  private scene: THREE.Scene;
  private hemiLight: THREE.HemisphereLight;
  private dirLight: THREE.DirectionalLight;
  private rainParticles?: THREE.Points;
  private isRaining: boolean = false;

  constructor(
    scene: THREE.Scene,
    hemiLight: THREE.HemisphereLight,
    dirLight: THREE.DirectionalLight
  ) {
    this.scene = scene;
    this.hemiLight = hemiLight;
    this.dirLight = dirLight;
    this.initRain();
  }

  private initRain(): void {
    const particleCount = 1500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 120;
      positions[i + 1] = Math.random() * 40;
      positions[i + 2] = (Math.random() - 0.5) * 120;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.15,
      transparent: true,
      opacity: 0.6,
    });

    this.rainParticles = new THREE.Points(geometry, material);
    this.rainParticles.visible = false;
    this.scene.add(this.rainParticles);
  }

  setTimeOfDay(time: TimeOfDay): void {
    if (time === 'day') {
      this.scene.background = new THREE.Color(0x87ceeb); // Dhaka daytime blue sky
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x87ceeb);
      }
      this.hemiLight.color.setHex(0xffffff);
      this.hemiLight.groundColor.setHex(0x444444);
      this.hemiLight.intensity = 0.85;

      this.dirLight.color.setHex(0xfffaed);
      this.dirLight.intensity = 1.2;
      this.dirLight.position.set(50, 80, 50);
    } else if (time === 'evening') {
      this.scene.background = new THREE.Color(0xfb923c); // Golden hour dusk
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0xfb923c);
      }
      this.hemiLight.color.setHex(0xfed7aa);
      this.hemiLight.groundColor.setHex(0x334155);
      this.hemiLight.intensity = 0.6;

      this.dirLight.color.setHex(0xf97316);
      this.dirLight.intensity = 1.0;
      this.dirLight.position.set(30, 40, 50);
    } else {
      // Night
      this.scene.background = new THREE.Color(0x090f1d); // Deep night sky
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x090f1d);
      }
      this.hemiLight.color.setHex(0x1e293b);
      this.hemiLight.groundColor.setHex(0x020617);
      this.hemiLight.intensity = 0.25;

      this.dirLight.color.setHex(0x38bdf8);
      this.dirLight.intensity = 0.35;
      this.dirLight.position.set(20, 50, 20);
    }
  }

  setWeather(weather: WeatherType): void {
    this.isRaining = weather === 'rain';
    if (this.rainParticles) {
      this.rainParticles.visible = this.isRaining;
    }
  }

  update(dt: number, playerPos: { x: number; z: number }): void {
    if (!this.isRaining || !this.rainParticles || !this.rainParticles.geometry?.attributes?.position) return;

    // Follow player position so rain covers the camera field
    this.rainParticles.position.set(playerPos.x, 0, playerPos.z);

    const pos = this.rainParticles.geometry.attributes.position as THREE.BufferAttribute;
    const array = pos.array as Float32Array;

    for (let i = 1; i < array.length; i += 3) {
      array[i] = (array[i] ?? 0) - dt * 35.0; // Fall downward
      if ((array[i] ?? 0) < 0) {
        array[i] = 40.0;
      }
    }
    pos.needsUpdate = true;
  }
}
