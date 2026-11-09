import { describe, it, expect, beforeEach } from 'vitest';
import { toggleMute, settingsSignal, tutorialSignal, screenSignal } from '../../../src/ui/store';
import { uiModalOpen } from '../../../src/ui/gamepadNav';
import { loadBindings, DEFAULT_BINDINGS } from '../../../src/input/bindings';

describe('mute (audit: no mute control)', () => {
  it('toggles the muted setting and back', () => {
    const before = settingsSignal.value.muted;
    toggleMute();
    expect(settingsSignal.value.muted).toBe(!before);
    toggleMute();
    expect(settingsSignal.value.muted).toBe(before);
  });
});

describe('the first-ride tutorial does not block Tab (audit: banner counted as a modal)', () => {
  beforeEach(() => {
    screenSignal.value = 'game';
    tutorialSignal.value = { active: true, step: 'alarm', agreedFare: 100 };
  });

  it('counts as a modal by default', () => {
    expect(uiModalOpen(false)).toBe(true);
  });

  it('is ignored when the caller asks, so the phone can open', () => {
    expect(uiModalOpen(false, { ignoreTutorial: true })).toBe(false);
  });
});

describe('hotkeys follow the bindings config (audit)', () => {
  it('has bindings for garage, journal and mute', () => {
    expect(DEFAULT_BINDINGS.keyboard.garage).toEqual(['KeyG']);
    expect(DEFAULT_BINDINGS.keyboard.journal).toEqual(['KeyJ']);
    expect(DEFAULT_BINDINGS.keyboard.mute).toEqual(['KeyN']);
  });

  it('a saved bindings file from before these keys still gets their defaults', () => {
    const storage = { getItem: () => JSON.stringify({ keyboard: { map: ['KeyP'] } }) } as unknown as Storage;
    const loaded = loadBindings(storage);
    expect(loaded.keyboard.map).toEqual(['KeyP']);
    expect(loaded.keyboard.garage).toEqual(['KeyG']);
  });
});
