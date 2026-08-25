import { MERMAID_LOOKS, MERMAID_THEMES } from '$/constants';
import { describe, expect, it } from 'vitest';
import {
  applyConfigPreset,
  CONFIG_PRESET_GROUPS,
  defaultConfigJson,
  formatConfigJson,
  type ConfigPreset
} from './configPresets';

const preset = (id: string): ConfigPreset => {
  for (const group of CONFIG_PRESET_GROUPS) {
    const hit = group.items.find((item) => item.id === id);
    if (hit) {
      return hit;
    }
  }
  throw new Error(`preset not found: ${id}`);
};

describe('applyConfigPreset', () => {
  it('merges a preset into the default config', () => {
    const out = applyConfigPreset('{\n  "theme": "default"\n}', preset('hand-drawn'));
    expect(out).toBeDefined();
    const merged = JSON.parse(out ?? '') as Record<string, unknown>;
    // 既有键保留，模板键追加
    expect(merged.theme).toBe('default');
    expect(merged.look).toBe('handDrawn');
  });

  it('overwrites scalar keys with the preset value', () => {
    const out = applyConfigPreset('{"theme":"forest"}', preset('theme-dark'));
    expect(JSON.parse(out ?? '')).toEqual({ theme: 'dark' });
  });

  it('deep-merges nested objects instead of replacing them', () => {
    const current = JSON.stringify({
      flowchart: { htmlLabels: false },
      themeVariables: { fontFamily: 'serif' }
    });
    const out = applyConfigPreset(current, preset('compact'));
    const merged = JSON.parse(out ?? '') as {
      flowchart: Record<string, unknown>;
      themeVariables: Record<string, unknown>;
    };
    expect(merged.flowchart).toEqual({ htmlLabels: false, nodeSpacing: 25, rankSpacing: 35 });
    expect(merged.themeVariables).toEqual({ fontFamily: 'serif' });
  });

  it('replaces arrays wholesale rather than concatenating', () => {
    const adhoc: ConfigPreset = {
      config: { sequence: { actorMargin: 60 } },
      hint: '',
      id: 'adhoc',
      label: 'adhoc'
    };
    const out = applyConfigPreset('{"sequence":{"actorMargin":10}}', adhoc);
    expect(JSON.parse(out ?? '')).toEqual({ sequence: { actorMargin: 60 } });
  });

  it('treats empty or whitespace config as an empty object', () => {
    const out = applyConfigPreset('   ', preset('theme-forest'));
    expect(JSON.parse(out ?? '')).toEqual({ theme: 'forest' });
  });

  it('returns undefined for broken JSON and leaves nothing to guess', () => {
    expect(applyConfigPreset('{ broken', preset('hand-drawn'))).toBeUndefined();
  });

  it('returns undefined when the top level is not an object', () => {
    expect(applyConfigPreset('[1,2]', preset('hand-drawn'))).toBeUndefined();
    expect(applyConfigPreset('"text"', preset('hand-drawn'))).toBeUndefined();
  });

  it('formats the output with two-space indentation', () => {
    const out = applyConfigPreset('{}', preset('presentation'));
    expect(out).toBe('{\n  "themeVariables": {\n    "fontSize": "20px"\n  }\n}');
  });
});

describe('formatConfigJson', () => {
  it('reformats compact JSON', () => {
    expect(formatConfigJson('{"theme":"dark"}')).toBe('{\n  "theme": "dark"\n}');
  });

  it('returns undefined for broken JSON', () => {
    expect(formatConfigJson('{ nope')).toBeUndefined();
  });
});

describe('defaultConfigJson', () => {
  it('matches the factory default shape', () => {
    expect(defaultConfigJson()).toBe('{\n  "theme": "default"\n}');
  });
});

describe('CONFIG_PRESET_GROUPS registry', () => {
  it('has unique ids, non-empty copy, and valid enum values', () => {
    const ids = new Set<string>();
    let count = 0;
    for (const { group, items } of CONFIG_PRESET_GROUPS) {
      expect(group.trim()).not.toBe('');
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        count++;
        expect(ids.has(item.id)).toBe(false);
        ids.add(item.id);
        expect(item.label.trim()).not.toBe('');
        expect(item.hint.trim()).not.toBe('');
        if (typeof item.config.theme === 'string') {
          expect(MERMAID_THEMES).toContain(item.config.theme);
        }
        if (typeof item.config.look === 'string') {
          expect(MERMAID_LOOKS).toContain(item.config.look);
        }
      }
    }
    // 规模护栏：注册表被清空/截断时此断言失败
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it('covers style, theme and layout dimensions', () => {
    const groups = CONFIG_PRESET_GROUPS.map(({ group }) => group);
    expect(groups).toEqual(['风格', '主题', '版式']);
  });
});
