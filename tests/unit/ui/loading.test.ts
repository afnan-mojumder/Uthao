import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadingSignal, Z_LAYER } from '../../../src/ui/store';
import { Loading } from '../../../src/ui/overlays/Loading';
import { setLanguage, t } from '../../../src/ui/i18n';

describe('loadingSignal & Loading overlay (P0.3)', () => {
  const initialSnapshot = { ...loadingSignal.value };

  beforeEach(() => {
    setLanguage('en');
    loadingSignal.value = { active: true, stageKey: 'loading.boot', progress: 0 };
  });

  afterEach(() => {
    loadingSignal.value = { ...initialSnapshot };
  });

  it('defaults to inactive in headless Node environment so unit tests stay unblocked', () => {
    expect(initialSnapshot.active).toBe(false);
    expect(initialSnapshot.stageKey).toBe('loading.boot');
    expect(initialSnapshot.progress).toBe(0);
  });

  it('renders stage label, clamped progress bar, and system overlay style', () => {
    loadingSignal.value = { active: true, stageKey: 'loading.physics', progress: 42 };
    const vnode = Loading({});
    expect(vnode.props['data-testid']).toBe('loading-overlay');
    expect(vnode.props.style.zIndex).toBe(Z_LAYER.SYSTEM_OVERLAY);
    expect(vnode.props.style.pointerEvents).toBe('auto');

    const serialized = JSON.stringify(vnode);
    expect(serialized).toContain(t('loading.physics'));
    expect(serialized).toContain('loading-progress');
    expect(serialized).toContain('"aria-valuenow":42');
  });

  it('falls back to ui.loading when stageKey has no translation', () => {
    loadingSignal.value = { active: true, stageKey: 'loading.unknown_stage', progress: 150 };
    const serialized = JSON.stringify(Loading({}));
    expect(serialized).toContain(t('ui.loading'));
    expect(serialized).toContain('"aria-valuenow":100');
  });

  it('renders boot error state and retry button cleanly when error is set', () => {
    loadingSignal.value = {
      active: true,
      stageKey: 'loading.error',
      progress: 25,
      error: 'WASM init failed',
    };
    const serialized = JSON.stringify(Loading({}));
    expect(serialized).toContain(t('loading.error'));
    expect(serialized).toContain('WASM init failed');
    expect(serialized).toContain('loading-retry-btn');
    expect(serialized).toContain(t('ui.restart'));
  });
});
