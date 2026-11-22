import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MissionManager } from '../../../src/sim/mission/MissionManager';
import worldJson from '../../../data/world.json';
import testloopJson from '../../../data/districts/testloop.json';

describe('Medium Batch 3 Audit Fixes (M24 - M29)', () => {
  it('M24: TouchActions releases held horn/camera feedback on unmount and window blur', () => {
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/touch/TouchActions.tsx'),
      'utf8'
    );
    expect(src).toContain("window.addEventListener('blur', releaseAllHolds)");
    expect(src).toContain("releaseHold('horn')");
    expect(src).toContain("releaseHold('camera')");
  });

  it('M25: gamepadNav dispatches remapped keyboard bindings and MainMenu Credits closes on window Escape', () => {
    const gpSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/gamepadNav.ts'),
      'utf8'
    );
    expect(gpSrc).toContain('kb.phone[0]');
    expect(gpSrc).toContain('kb.map[0]');
    expect(gpSrc).toContain('kb.pause[0]');
    expect(gpSrc).not.toContain("dispatchKey('Tab', 'Tab')");
    expect(gpSrc).not.toContain("dispatchKey('m', 'KeyM')");

    const menuSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/menus/MainMenu.tsx'),
      'utf8'
    );
    expect(menuSrc).toContain("window.addEventListener('keydown', onKeyDown)");
    expect(menuSrc).toContain('setShowCredits(false)');
  });

  it('M26: App hides tutorial riding banner when panels are open and FirstRideTutorial uses Z_LAYER.HUD + 20', () => {
    const appSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/App.tsx'),
      'utf8'
    );
    expect(appSrc).toContain("tutorialSignal.value.step === 'riding'");
    expect(appSrc).toContain('phoneSignal.value.open');

    const tutSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/tutorial/FirstRideTutorial.tsx'),
      'utf8'
    );
    expect(tutSrc).toContain('Z_LAYER.HUD + 20');
    expect(tutSrc).not.toContain('zIndex: 9520');
  });

  it('M27: ShareCard subscribes to getLocaleVersion() and redraws canvas when locale finishes loading', () => {
    const shareSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/share/ShareCard.tsx'),
      'utf8'
    );
    expect(shareSrc).toContain('getLocaleVersion');
    expect(shareSrc).toContain('[summary, ending, lang, localeVersion]');
  });

  it('M28: every chapter unlocked district set is topologically connected in data/world.json', () => {
    const bounds = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();
    for (const d of worldJson.districts) {
      bounds.set(d.districtId, d.bounds);
    }

    // Build district adjacency from world.json connectors (using target district & adjacent bounds)
    const adj = new Map<string, Set<string>>();
    for (const d of worldJson.districts) adj.set(d.districtId, new Set());
    for (const c of worldJson.connectors) {
      // Infer endpoints by node prefix (e.g. mirpara has no prefix; others have "<district>_")
      const prefixOf = (nodeId: string): string => {
        for (const d of worldJson.districts) {
          if (nodeId.startsWith(`${d.districtId}_`)) return d.districtId;
        }
        return 'mirpara';
      };
      const a = prefixOf(c.startNodeId);
      const b = prefixOf(c.endNodeId);
      adj.get(a)?.add(b);
      adj.get(b)?.add(a);
    }

    for (let ch = 1; ch <= 6; ch++) {
      const unlocked = MissionManager.getUnlockedDistrictsForChapter(ch).filter((d) =>
        bounds.has(d)
      );
      const unlockedSet = new Set<string>(unlocked);
      const visited = new Set<string>(['mirpara']);
      const queue = ['mirpara'];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        for (const next of adj.get(cur) ?? []) {
          if (unlockedSet.has(next) && !visited.has(next)) {
            visited.add(next);
            queue.push(next);
          }
        }
      }
      expect(Array.from(visited).sort()).toEqual(Array.from(unlockedSet).sort());
    }
  });

  it('M29: testloop.json has zero orphaned nodes and validate-data.mjs checks for orphaned nodes', () => {
    const connected = new Set<string>();
    for (const seg of testloopJson.segments) {
      connected.add(seg.startNodeId);
      connected.add(seg.endNodeId);
    }
    const orphans = testloopJson.nodes
      .map((n) => n.nodeId)
      .filter((id) => !connected.has(id));
    expect(orphans).toEqual([]);

    const validateSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'scripts/validate-data.mjs'),
      'utf8'
    );
    expect(validateSrc).toContain('orphaned node(s) with no connected segments');
  });
});
