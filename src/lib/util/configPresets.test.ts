import { MERMAID_LOOKS, MERMAID_THEMES } from '$/constants';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyConfigPreset,
  CONFIG_PRESET_GROUPS,
  defaultConfigJson,
  deleteUserPreset,
  diffConfigLeaves,
  formatConfigJson,
  isConfigSubset,
  loadUserPresets,
  saveUserPreset,
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

describe('isConfigSubset（当前生效判定）', () => {
  it('matches when the preset leaf values are all present', () => {
    expect(isConfigSubset({ look: 'handDrawn', theme: 'default' }, { look: 'handDrawn' })).toBe(
      true
    );
  });

  it('matches nested subsets with extra keys allowed', () => {
    const current = { flowchart: { htmlLabels: false, nodeSpacing: 25, rankSpacing: 35 } };
    expect(isConfigSubset(current, { flowchart: { nodeSpacing: 25, rankSpacing: 35 } })).toBe(true);
  });

  it('rejects mismatched or missing values', () => {
    expect(isConfigSubset({ theme: 'dark' }, { theme: 'forest' })).toBe(false);
    expect(isConfigSubset({}, { look: 'handDrawn' })).toBe(false);
    expect(
      isConfigSubset({ flowchart: { nodeSpacing: 25 } }, { flowchart: { rankSpacing: 35 } })
    ).toBe(false);
  });

  it('compares scalars strictly and never treats non-objects as containers', () => {
    expect(isConfigSubset({ theme: 'dark' }, { theme: 'dark' })).toBe(true);
    expect(isConfigSubset('dark', { theme: 'dark' })).toBe(false);
    expect(isConfigSubset({ a: [1, 2] }, { a: [1, 2] })).toBe(false);
  });
});

describe('user presets (自定义模板)', () => {
  beforeEach(() => {
    localStorage.removeItem('flowUserConfigPresets');
  });

  it('saves and loads back, newest first, label preserved', () => {
    saveUserPreset('我的手绘', { look: 'handDrawn' });
    saveUserPreset('深色大字', { theme: 'dark', themeVariables: { fontSize: '20px' } });
    const presets = loadUserPresets();
    expect(presets).toHaveLength(2);
    expect(presets[0].label).toBe('深色大字');
    expect(presets[1]).toMatchObject({ config: { look: 'handDrawn' }, label: '我的手绘' });
  });

  it('overwrites an existing preset with the same label', () => {
    saveUserPreset('主题', { theme: 'dark' });
    saveUserPreset('主题', { theme: 'forest' });
    const presets = loadUserPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].config).toEqual({ theme: 'forest' });
  });

  it('ignores blank labels and trims long ones', () => {
    saveUserPreset('   ', { theme: 'dark' });
    expect(loadUserPresets()).toHaveLength(0);
    saveUserPreset('x'.repeat(60), { theme: 'dark' });
    expect(loadUserPresets()[0].label).toHaveLength(30);
  });

  it('deletes by id', () => {
    saveUserPreset('a', { theme: 'dark' });
    saveUserPreset('b', { theme: 'forest' });
    const [first] = loadUserPresets();
    const next = deleteUserPreset(first.id);
    expect(next).toHaveLength(1);
    expect(loadUserPresets()[0].label).toBe('a');
  });

  it('drops invalid entries from hand-edited storage', () => {
    localStorage.setItem(
      'flowUserConfigPresets',
      JSON.stringify([
        { config: { theme: 'dark' }, id: 'ok-1', label: '好的' },
        { config: 'not-an-object', id: 'bad-1', label: '坏的' },
        { config: {}, id: '', label: '没id' },
        { config: {}, id: 'bad-2', label: '  ' },
        'garbage'
      ])
    );
    const presets = loadUserPresets();
    expect(presets).toHaveLength(1);
    expect(presets[0].id).toBe('ok-1');
  });

  it('returns empty for broken or non-array storage', () => {
    localStorage.setItem('flowUserConfigPresets', '{ not json');
    expect(loadUserPresets()).toEqual([]);
    localStorage.setItem('flowUserConfigPresets', '{"a":1}');
    expect(loadUserPresets()).toEqual([]);
  });

  it('caps the list at 20 entries', () => {
    for (let index = 0; index < 25; index++) {
      saveUserPreset(`t${index}`, { theme: 'dark' });
    }
    expect(loadUserPresets()).toHaveLength(20);
  });
});

describe('diffConfigLeaves（差异预览）', () => {
  it('标量叶子：旧值/新值/变化标记', () => {
    const entries = diffConfigLeaves({ theme: 'default' }, { theme: 'dark' });
    expect(entries).toEqual([{ changed: true, from: 'default', path: 'theme', to: 'dark' }]);
  });

  it('当前缺少该键时 from 为 undefined（未设置）', () => {
    const entries = diffConfigLeaves({}, { look: 'handDrawn' });
    expect(entries).toEqual([{ changed: true, from: undefined, path: 'look', to: 'handDrawn' }]);
  });

  it('已生效的叶子 changed=false（字符串与数值同判）', () => {
    const entries = diffConfigLeaves(
      { flowchart: { nodeSpacing: 25, rankSpacing: 35 }, theme: 'dark' },
      preset('compact').config
    );
    expect(entries.every((entry) => !entry.changed)).toBe(true);
    const themeEntry = diffConfigLeaves({ theme: 'dark' }, { theme: 'dark' });
    expect(themeEntry[0].changed).toBe(false);
  });

  it('嵌套对象递归出点路径，中间层缺失时叶子 from 全为未设置', () => {
    const entries = diffConfigLeaves({ theme: 'default' }, preset('compact').config);
    expect(entries.map((entry) => entry.path)).toEqual([
      'flowchart.nodeSpacing',
      'flowchart.rankSpacing'
    ]);
    expect(entries.every((entry) => entry.from === undefined && entry.changed)).toBe(true);
    expect(entries[0].to).toBe('25');
  });

  it('数组按整体替换比较（顺序不同即变化），对象值 JSON 序列化展示', () => {
    const same = diffConfigLeaves({ a: [1, 2] }, { a: [1, 2] });
    expect(same[0].changed).toBe(false);
    const reordered = diffConfigLeaves({ a: [2, 1] }, { a: [1, 2] });
    expect(reordered[0]).toEqual({ changed: true, from: '[2,1]', path: 'a', to: '[1,2]' });
  });

  it('超长值截断展示（24 字符 + 省略号）', () => {
    const long = 'x'.repeat(40);
    const entries = diffConfigLeaves({}, { theme: long });
    expect(entries[0].to).toBe(`${'x'.repeat(24)}…`);
  });

  it('字符串值不带引号展示，非字符串 JSON 序列化', () => {
    const entries = diffConfigLeaves({}, { n: 25, s: 'dark' });
    expect(entries.find((entry) => entry.path === 's')?.to).toBe('dark');
    expect(entries.find((entry) => entry.path === 'n')?.to).toBe('25');
  });

  it('保持模板键序（预览行序与菜单语义一致）', () => {
    const entries = diffConfigLeaves({}, preset('print-white').config);
    expect(entries.map((entry) => entry.path)).toEqual(['theme', 'themeVariables.background']);
  });
});
