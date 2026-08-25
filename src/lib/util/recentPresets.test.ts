import { beforeEach, describe, expect, it } from 'vitest';
import { clearRecentPresets, loadRecentPresets, pushRecentPreset } from './recentPresets';

describe('recentPresets（示例图表最近使用）', () => {
  beforeEach(() => {
    clearRecentPresets();
  });

  it('starts empty and records newest first', () => {
    expect(loadRecentPresets()).toEqual([]);
    pushRecentPreset('Flowchart');
    pushRecentPreset('Sequence');
    expect(loadRecentPresets()).toEqual(['Sequence', 'Flowchart']);
  });

  it('dedupes by moving the reused key to the front', () => {
    pushRecentPreset('Flowchart');
    pushRecentPreset('Sequence');
    pushRecentPreset('Flowchart');
    expect(loadRecentPresets()).toEqual(['Flowchart', 'Sequence']);
  });

  it('caps at 6 entries', () => {
    for (const key of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      pushRecentPreset(key);
    }
    const recent = loadRecentPresets();
    expect(recent).toHaveLength(6);
    expect(recent[0]).toBe('h');
    expect(recent).not.toContain('a');
  });

  it('drops invalid entries from hand-edited storage', () => {
    localStorage.setItem('presetRecent', JSON.stringify(['ok', 1, null, '', 'fine', {}]));
    expect(loadRecentPresets()).toEqual(['ok', 'fine']);
  });

  it('returns empty for broken or non-array storage', () => {
    localStorage.setItem('presetRecent', '{ nope');
    expect(loadRecentPresets()).toEqual([]);
    localStorage.setItem('presetRecent', '{"a":1}');
    expect(loadRecentPresets()).toEqual([]);
  });
});
