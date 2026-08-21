import { describe, expect, it } from 'vitest';
import { buildEditState, serializeEmbedState, type EmbedSettings } from './embed';
import { deserializeState } from './serde';
import { findUnsafeConfigPaths } from './sanitize';
import { defaultState } from '../constants';

// Round 21: the embed footer 编辑 link carries an editor-hash State built
// from the embed's own silently-sanitized config (securityLevel forced
// strict). Landing in the editor, that state goes through sanitizeConfig
// again plus the plugin url pipeline — the link must round-trip with a
// config that triggers NO confirmation and preserves the code verbatim.
const settings: EmbedSettings = {
  code: 'flowchart TD\n  E --> Link',
  config: { securityLevel: 'strict', theme: 'forest' },
  controls: true,
  grid: true,
  look: 'classic',
  mode: 'dark',
  pan: { x: 1, y: 2 },
  rough: false,
  theme: 'forest',
  zoom: 1.5
};

describe('embed edit-link round-trip', () => {
  it('serializes to a state the editor loads without any safety prompt', () => {
    const serialized = serializeEmbedState(settings);
    const loaded = deserializeState(serialized);
    expect(loaded.code).toBe(settings.code);
    // The double-gate invariant: embed already forced strict, so the
    // editor-side sanitizeConfig findUnsafeConfigPaths must come back empty.
    const config = JSON.parse(loaded.mermaid) as Record<string, unknown>;
    expect(config.securityLevel).toBe('strict');
    expect(findUnsafeConfigPaths(config)).toHaveLength(0);
  });

  it('carries view state (pan/zoom/grid) into the editor state', () => {
    const state = buildEditState(settings);
    expect(state.pan).toEqual({ x: 1, y: 2 });
    expect(state.zoom).toBe(1.5);
    expect(state.grid).toBe(true);
    expect(state.code).not.toBe(defaultState.code);
  });
});
