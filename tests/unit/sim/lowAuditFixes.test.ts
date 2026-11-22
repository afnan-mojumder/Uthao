import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { evaluateTransaction, type ObjectiveState } from '../../../src/sim/mission/objectives';
import { SaveSystem, type StorageAdapter } from '../../../src/sim/save/SaveSystem';
import { initDebugApi } from '../../../src/debug/debugApi';
import { WorldEventRenderer } from '../../../src/render/worldEvents';
import { WorldPassengerActor } from '../../../src/render/passengerActor';
import { EncounterStageRenderer } from '../../../src/render/encounterStage';
import { AudioManager, AUDIO_SAMPLE_IDS } from '../../../src/audio/AudioManager';
import { createBalanceDistrict } from '../../../src/sim/bot/strategies';
import { ensureLocaleLoaded, localDigits, setLanguage, t } from '../../../src/ui/i18n';
import type { DistrictData, EncounterDef } from '../../../src/sim/schemas';
import testloopJson from '../../../data/districts/testloop.json';
import worldJson from '../../../data/world.json';

describe('Low-Severity Audit Polish Fixes (L1 - L12)', () => {
  beforeEach(() => {
    setLanguage('bn');
  });

  it('L1: enc_bus_block clears tempBusBlockEventId on sidewalk and removes real stalled_vehicle on honk later', () => {
    const road = RoadNetwork.fromDistricts([testloopJson as unknown as DistrictData]);
    const busBlockDef: EncounterDef = {
      id: 'enc_bus_block',
      category: 'route',
      trigger: {},
      weight: 1,
      cooldownMin: 0,
      oncePerDay: false,
      lineKey: 'enc.bus',
      choices: [
        { id: 'sidewalk', labelKey: 'sidewalk', effects: [] },
        { id: 'honk', labelKey: 'honk', effects: [] },
      ],
    };
    const gm = new GameManager({
      seed: 1,
      mode: 'endless',
      data: { encounters: [busBlockDef] },
    });
    const session = new GameSession({ gm, road, autoRequests: false });

    // Start enc_bus_block without existing stalled_vehicle -> creates tempBusBlockEventId
    const seg = road.getSegments()[0]!;
    session.bike.x = 50;
    session.bike.z = 0;
    (session as unknown as { lastStepSegment: typeof seg }).lastStepSegment = seg;
    const inst1 = gm.eventDirector.forceStart('enc_bus_block', gm.bus)!;
    expect(gm.roadEvents.getEventById('evt_enc_bus_block')).toBeDefined();

    // Choose 'sidewalk' -> tempBusBlockEventId must be cleared
    gm.dispatch({ type: 'chooseEncounterOption', instanceId: inst1.id, choiceId: 'sidewalk' });
    gm.roadEvents.removeEvent('evt_enc_bus_block'); // simulate 15m expiry

    // Now add a real stalled_vehicle event on that segment and resolve enc_bus_block with 'honk'
    gm.roadEvents.addEvent({
      id: 'real_stall_1',
      kind: 'stalled_vehicle',
      segmentId: seg.segmentId,
      closesSegment: false,
      speedCapKmh: 8,
      congestionMultiplier: 2.5,
      startMinute: gm.clock.minutes,
      durationMinutes: 15,
      title: { bn: 'x', en: 'x' },
    });
    session.step({ throttle: 0, brake: 0, steer: 0 }, 1 / 60);
    const inst2 = gm.eventDirector.forceStart('enc_bus_block', gm.bus)!;
    gm.dispatch({ type: 'chooseEncounterOption', instanceId: inst2.id, choiceId: 'honk' });
    expect(gm.roadEvents.getEventById('real_stall_1')).toBeUndefined();
  });

  it('L2: buy objective matches bike_purchase and checks target/targetId', () => {
    const mkState = (): ObjectiveState => ({
      id: 'obj_buy',
      progress: 0,
      target: 1,
      completed: false,
    });
    const bikeObj = {
      id: 'obj_buy',
      type: 'buy' as const,
      target: 'bike' as const,
      targetId: 'used125',
      descKey: 'buy bike',
    };

    // Unrelated upgrade must NOT complete bike objective
    const s1 = mkState();
    expect(
      evaluateTransaction(bikeObj, s1, {
        kind: 'upgrade',
        amount: -500,
        txId: 'tx_upgrade_upgrade_phone_mount_1_10_1',
      })
    ).toBe(false);

    // Wrong bike must NOT complete targetId='used125'
    const s2 = mkState();
    expect(
      evaluateTransaction(bikeObj, s2, {
        kind: 'bike_purchase',
        amount: -50000,
        txId: 'tx_bike_new150_1_10_2',
      })
    ).toBe(false);

    // Matching bike_purchase completes objective
    const s3 = mkState();
    expect(
      evaluateTransaction(bikeObj, s3, {
        kind: 'bike_purchase',
        amount: -30000,
        txId: 'tx_bike_used125_1_10_3',
      })
    ).toBe(true);
    expect(s3.completed).toBe(true);
  });

  it('L3: GameManager.resetCareerState clears paused, ticks, accumulator, and waypointNodeId', () => {
    const gm = new GameManager({ seed: 3, mode: 'career', data: {} });
    gm.paused = true;
    gm.ticks = 500;
    gm.accumulator = 0.012;
    gm.waypointNodeId = 'N3';

    gm.resetCareerState(42);
    expect(gm.paused).toBe(false);
    expect(gm.ticks).toBe(0);
    expect(gm.accumulator).toBe(0);
    expect(gm.waypointNodeId).toBeNull();
  });

  it('L4: SaveSystem recovers isMemoryOnly after transient failure and hasAnySave rejects corrupt-only slots', () => {
    const store = new Map<string, string>();
    let failWrites = true;
    const adapter: StorageAdapter = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        if (failWrites) throw new Error('QuotaExceededError');
        store.set(k, v);
      },
      removeItem: (k) => {
        store.delete(k);
      },
      isMemoryOnly: false,
    };
    const saves = new SaveSystem(adapter);
    const gm = new GameManager({ seed: 4, mode: 'career', data: {} });

    const r1 = saves.save(gm, 'slot1');
    expect(r1.success).toBe(false);
    expect(saves.isMemoryOnly).toBe(true);

    // Once storage recovers, saving the same slot clears the overlay and resets isMemoryOnly
    failWrites = false;
    const r2 = saves.save(gm, 'slot1');
    expect(r2.success).toBe(true);
    expect(saves.isMemoryOnly).toBe(false);

    // Corrupt-only storage must make hasAnySave() return false without throwing
    store.clear();
    store.set(saves.getSlotKey('auto'), '{corrupt-json');
    expect(saves.hasSave('auto')).toBe(true);
    expect(saves.hasAnySave()).toBe(false);
  });

  it('L5: DebugApi setSeed, teleport, and setTime work and guard invalid inputs', () => {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const fakeWindow: Record<string, unknown> = {};
    (globalThis as { window?: unknown }).window = fakeWindow;
    try {
      const gm = new GameManager({ seed: 10, mode: 'career', data: {} });
      const onTeleport = vi.fn();
      initDebugApi(gm, { onTeleport });
      const dbg = (fakeWindow as { __uthao: NonNullable<typeof window.__uthao> }).__uthao;

      dbg.setSeed(99);
      expect(gm.seed).toBe(99);

      dbg.teleport('N3');
      expect(gm.waypointNodeId).toBe('N3');
      expect(onTeleport).toHaveBeenCalledWith('N3');

      const beforeMin = gm.clock.minutes;
      dbg.setTime('invalid:time');
      expect(Number.isFinite(gm.clock.minutes)).toBe(true);
      expect(gm.clock.minutes).toBe(beforeMin);

      dbg.setTime('-1:00');
      expect(gm.clock.minutes).toBe(1380);
    } finally {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  });

  it('L6: WorldEventRenderer attaches stalled_vehicle lights to bus, adds diversion pole, and grounds waterlogging pole', () => {
    const wer = new WorldEventRenderer();
    const road = RoadNetwork.fromDistricts([testloopJson as unknown as DistrictData]);
    const segId = road.getSegments()[0]!.segmentId;

    wer.sync(
      [
        {
          id: 'e_stall',
          kind: 'stalled_vehicle',
          segmentId: segId,
          active: true,
          closesSegment: false,
          startMinute: 0,
          durationMinutes: 10,
          remainingMinutes: 10,
        },
        {
          id: 'e_div',
          kind: 'diversion',
          segmentId: segId,
          active: true,
          closesSegment: true,
          startMinute: 0,
          durationMinutes: 10,
          remainingMinutes: 10,
        },
        {
          id: 'e_water',
          kind: 'waterlogging',
          segmentId: segId,
          active: true,
          closesSegment: false,
          startMinute: 0,
          durationMinutes: 10,
          remainingMinutes: 10,
        },
      ],
      road
    );

    const stallGroup = wer.getEventGroup('e_stall')!;
    const busGroup = stallGroup.children.find((c) => c instanceof THREE.Group)!;
    // Two hazard bulbs attached to rotated bus group
    expect(busGroup.children.some((c) => Math.abs(c.position.z - 3.92) < 0.05)).toBe(true);

    const divGroup = wer.getEventGroup('e_div')!;
    const divSignPole = divGroup.children.find(
      (c) => Math.abs(c.position.x + 1.7) < 0.01 && Math.abs(c.position.y - 0.9) < 0.01
    );
    expect(divSignPole).toBeDefined();

    const waterGroup = wer.getEventGroup('e_water')!;
    const waterPole = waterGroup.children.find(
      (c) => Math.abs(c.position.x + 2.2) < 0.01 && Math.abs(c.position.y - 0.9) < 0.01
    );
    expect(waterPole).toBeDefined();
    wer.dispose();
  });

  it('L7: WorldPassengerActor and EncounterStageRenderer use positive rotation.z on +X waving arms', () => {
    const actor = new WorldPassengerActor();
    actor.update({ worldX: 0, worldZ: 0, facingRad: 0, mode: 'waitingAtPickup', waving: true }, 0);
    const rightArm = (actor as unknown as { rightArm: THREE.Mesh }).rightArm;
    expect(rightArm.rotation.z).toBeGreaterThan(0);
    actor.dispose();

    const stage = new EncounterStageRenderer();
    stage.update(
      { kind: 'policeCheckpoint', worldX: 0, worldY: 0, worldZ: 0, facingRad: 0, urgent: false },
      0
    );
    const officerArm = (stage as unknown as { officerRightArm: THREE.Mesh }).officerRightArm;
    expect(officerArm.rotation.z).toBeGreaterThan(0);
    stage.update({ kind: 'alleyAmbush', worldX: 0, worldY: 0, worldZ: 0, facingRad: 0, urgent: true }, 0);
    const ambushArm = (stage as unknown as { ambushCenterArm: THREE.Mesh }).ambushCenterArm;
    expect(ambushArm.rotation.z).toBeGreaterThan(0);
    stage.dispose();
  });

  it('L8: AudioManager.handleVisibilityChange resumes interrupted AudioContext and re-attaches unlock listeners on failure', async () => {
    const prevWindow = (globalThis as { window?: unknown }).window;
    (globalThis as { window?: unknown }).window = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    let state: string = 'interrupted';
    const resume = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const fakeCtx = {
      get state() {
        return state;
      },
      resume,
      suspend: vi.fn().mockResolvedValue(undefined),
      destination: {},
      createGain: () => ({ gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn() }, connect: vi.fn() }),
    } as unknown as AudioContext;

    const am = new AudioManager(() => fakeCtx);
    try {
      am.unlock();
      resume.mockClear();
      const attachSpy = vi.spyOn(
        am as unknown as { setupUnlockListeners: () => void },
        'setupUnlockListeners'
      );
      am.handleVisibilityChange(false);
      expect(resume).toHaveBeenCalledTimes(1);
      await new Promise((r) => setTimeout(r, 10));
      expect(attachSpy).toHaveBeenCalledTimes(1);
    } finally {
      state = 'closed';
      am.dispose();
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  });

  it('L9: Inline ChoiceCard uses dedicated choiceInlineSlideDown keyframes without -50% Y jump', () => {
    const css = fs.readFileSync(path.resolve(process.cwd(), 'src/ui/tokens.css'), 'utf8');
    const card = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/choice/ChoiceCard.tsx'),
      'utf8'
    );
    expect(css).toContain('@keyframes choiceInlineSlideDown');
    expect(css).toContain('transform: translate(-50%, 0)');
    expect(card).toContain('choiceInlineSlideDown');
  });

  it('L10: localDigits supports explicit lang override and NegotiationPanel strips dangling currency colon', () => {
    setLanguage('bn');
    expect(localDigits(120)).toBe('১২০');
    expect(localDigits(120, 'en')).toBe('120');

    const panelSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/negotiation/NegotiationPanel.tsx'),
      'utf8'
    );
    expect(panelSrc).toContain(".replace(/:\\s*৳\\s*$/, '')");
    expect(panelSrc).toContain('subtitleVars');
  });

  it('L11: assets.manifest.json audio entries cover all AUDIO_SAMPLE_IDS with valid SHA-256 hashes', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'assets.manifest.json'), 'utf8')
    ) as { audio: Array<{ url: string; sha256: string }> };

    for (const id of AUDIO_SAMPLE_IDS) {
      const entry = manifest.audio.find((a) => a.url === `/assets/audio/${id}.webm`);
      expect(entry, `Missing audio manifest entry for ${id}.webm`).toBeDefined();
      const diskPath = path.resolve(process.cwd(), 'public', entry!.url.replace(/^\//, ''));
      const actualSha = crypto
        .createHash('sha256')
        .update(fs.readFileSync(diskPath))
        .digest('hex');
      expect(entry!.sha256).toBe(actualSha);
    }
  });

  it('L12: createBalanceDistrict garage POI nameKey resolves in both bn and en', async () => {
    await ensureLocaleLoaded('en');
    const dist = createBalanceDistrict();
    const garage = dist.pois.find((p) => p.kind === 'garage')!;
    expect(garage.nameKey).toBe('poi.mirpara.garage');
    setLanguage('bn');
    expect(t(garage.nameKey)).not.toBe(garage.nameKey);
    setLanguage('en');
    expect(t(garage.nameKey)).not.toBe(garage.nameKey);
    void worldJson;
  });
});
