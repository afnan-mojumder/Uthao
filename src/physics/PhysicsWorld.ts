import RAPIER from '@dimforge/rapier3d-compat';

export interface VehicleHandle {
  id: string;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  setPose(x: number, y: number, z: number, yaw: number): void;
}

export class PhysicsWorld {
  readonly raw: RAPIER.World;

  private constructor(raw: RAPIER.World) {
    this.raw = raw;
  }

  static async create(): Promise<PhysicsWorld> {
    await RAPIER.init();
    const gravity = new RAPIER.Vector3(0, -9.81, 0);
    const world = new RAPIER.World(gravity);
    return new PhysicsWorld(world);
  }

  step(): void {
    this.raw.step();
  }

  addStaticBox(
    x: number,
    y: number,
    z: number,
    halfX: number,
    halfY: number,
    halfZ: number,
    yaw: number = 0
  ): RAPIER.Collider {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const halfYaw = yaw / 2;
    bodyDesc.setRotation({
      x: 0,
      y: Math.sin(halfYaw),
      z: 0,
      w: Math.cos(halfYaw),
    });
    const body = this.raw.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ);
    const collider = this.raw.createCollider(colliderDesc, body);
    this.raw.step();
    return collider;
  }

  addStaticPolyline(
    points: { x: number; z: number }[],
    height: number = 0.5
  ): RAPIER.Collider[] {
    const colliders: RAPIER.Collider[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);
      const col = this.addStaticBox(
        midX,
        height / 2,
        midZ,
        0.15,
        height / 2,
        len / 2,
        angle
      );
      colliders.push(col);
    }
    return colliders;
  }

  addKinematicVehicle(
    id: string,
    halfExtents: { x: number; y: number; z: number }
  ): VehicleHandle {
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
    const body = this.raw.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      halfExtents.x,
      halfExtents.y,
      halfExtents.z
    );
    const collider = this.raw.createCollider(colliderDesc, body);
    this.raw.step();

    return {
      id,
      body,
      collider,
      setPose(x: number, y: number, z: number, yaw: number) {
        body.setNextKinematicTranslation({ x, y, z });
        const halfYaw = yaw / 2;
        body.setNextKinematicRotation({
          x: 0,
          y: Math.sin(halfYaw),
          z: 0,
          w: Math.cos(halfYaw),
        });
      },
    };
  }
}
