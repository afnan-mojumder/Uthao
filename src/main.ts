import { GameManager, runFrame } from './sim/GameManager';
import { Renderer } from './render/Renderer';
import { initDebugApi } from './debug/debugApi';
import { SIM_DT } from './config/constants';
import {
  createDefaultBikeSpec,
  createDefaultBikeState,
  stepBike,
  type BikeInput,
} from './physics/bikeModel';
import { RoadNetwork } from './sim/road/RoadNetwork';
import { RideManager } from './sim/ride/RideManager';
import { AutopilotController } from './debug/autopilot';
import { Hud } from './ui/hud/Hud';
import type { RideRequest } from './core/types';
import type { DistrictData } from './sim/schemas';
import testloopData from '../data/districts/testloop.json';

console.log('Uthao booting...');

const roadNetwork = RoadNetwork.fromDistricts([testloopData as DistrictData]);

const gm = new GameManager({
  seed: 42,
  mode: 'career',
  data: { testloop: testloopData },
});

const rideManager = new RideManager({
  roadNetwork,
  bus: gm.bus,
});

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
let renderer: Renderer | undefined;

if (canvas) {
  renderer = Renderer.init(canvas, 'medium');
}

const hud = typeof document !== 'undefined' ? new Hud() : undefined;
const autopilot = new AutopilotController(roadNetwork);

initDebugApi(gm, {
  renderer,
  autopilot,
  rideManager,
});

// Create initial test ride request
const sampleRequest: RideRequest = {
  requestId: 'req_tutorial_01',
  passengerId: 'p_nabila',
  pickupNodeId: 'N1',
  destinationNodeId: 'N2',
  initialFare: 120,
  estimatedDistance: 0.1,
  estimatedDuration: 2,
  requestedArrivalTime: null,
  bookingType: 'app',
  status: 'WaitingForPickup',
  surge: 1.0,
};

rideManager.offer(sampleRequest);
rideManager.accept(sampleRequest.requestId);

// Setup markers for pickup / dropoff
const pNode = roadNetwork.getNode(sampleRequest.pickupNodeId);
const dNode = roadNetwork.getNode(sampleRequest.destinationNodeId);

if (renderer && pNode && dNode) {
  renderer.markers.setPickup(pNode.x, pNode.z, true);
  renderer.markers.setDropoff(dNode.x, dNode.z, false);
}

// Keyboard controls for manual driving
const keys = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.forward = true;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.backward = true;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keys.forward = false;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keys.backward = false;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
  });
}

const bikeSpec = createDefaultBikeSpec();
// Start bike slightly before N1 heading towards it
let bikeState = {
  ...createDefaultBikeState(),
  x: -9,
  z: 0,
  heading: Math.PI / 2, // Facing +X
  speed: 0,
};

const env = {
  wet: false,
  surface: 1.0,
  hasPassenger: false,
  conditionPct: 100,
};

let lastTime = performance.now();

function frame(now: number) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  const steps = runFrame(gm, dt);

  for (let s = 0; s < steps; s++) {
    const activeReq = rideManager.getActiveRequest();

    // Autopilot or player input
    let input: BikeInput;

    if (autopilot.isEnabled()) {
      if (activeReq) {
        if (activeReq.status === 'WaitingForPickup') {
          autopilot.setDestination(bikeState.x, bikeState.z, activeReq.pickupNodeId);
        } else if (activeReq.status === 'OnTrip') {
          autopilot.setDestination(bikeState.x, bikeState.z, activeReq.destinationNodeId);
        }
      }
      input = autopilot.step(bikeState);
    } else {
      input = {
        throttle: keys.forward ? 0.75 : 0,
        brake: keys.backward ? 1.0 : 0,
        steer: (keys.left ? -1.0 : 0) + (keys.right ? 1.0 : 0),
      };
    }

    // Physics step
    env.hasPassenger = activeReq?.status === 'OnTrip';
    bikeState = stepBike(bikeState, input, bikeSpec, env, SIM_DT);

    // Update RideManager
    rideManager.update(
      { x: bikeState.x, z: bikeState.z, speed: bikeState.speed },
      SIM_DT
    );
  }

  const activeReq = rideManager.getActiveRequest();
  if (renderer) {
    if (activeReq) {
      if (activeReq.status === 'WaitingForPickup') {
        if (pNode) renderer.markers.setPickup(pNode.x, pNode.z, true);
        if (dNode) renderer.markers.setDropoff(dNode.x, dNode.z, false);
        renderer.setPassengerVisible(false);
      } else if (activeReq.status === 'OnTrip') {
        if (pNode) renderer.markers.setPickup(pNode.x, pNode.z, false);
        if (dNode) renderer.markers.setDropoff(dNode.x, dNode.z, true);
        renderer.setPassengerVisible(true);
      }
    } else {
      renderer.markers.setPickup(0, 0, false);
      renderer.markers.setDropoff(0, 0, false);
      renderer.setPassengerVisible(false);
    }

    renderer.setBikeState(bikeState);
    const alpha = gm.accumulator / SIM_DT;
    renderer.render(gm.snapshot(), alpha);
  }

  // Update HUD
  if (hud) {
    let objective = 'Free roam';
    let fare: number | undefined;

    if (activeReq) {
      fare = activeReq.initialFare;
      if (activeReq.status === 'WaitingForPickup') {
        objective = `Pick up passenger at ${activeReq.pickupNodeId}`;
      } else if (activeReq.status === 'OnTrip') {
        objective = `Drop off passenger at ${activeReq.destinationNodeId}`;
      }
    } else {
      objective = 'Trip complete! Looking for fares...';
    }

    hud.update({
      speedKmh: bikeState.speed * 3.6,
      objectiveText: objective,
      fare,
    });
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
