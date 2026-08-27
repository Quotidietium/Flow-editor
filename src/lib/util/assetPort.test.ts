import { beforeEach, describe, expect, it } from 'vitest';
import { clearAssets, exportAssets, importAssets, parseAssetBundle } from './assetPort';
import { loadUserPresets } from './configPresets';
import { loadUserSamples } from './userSamples';
import { loadUserSnippets } from './userSnippets';

beforeEach(() => {
  localStorage.clear();
});

describe('assetPort（个人资产移植）', () => {
  it('导出收集三类资产（空态 bundle 结构完整）', () => {
    const bundle = exportAssets();
    expect(bundle.version).toBe(1);
    expect(bundle.userConfigPresets).toEqual([]);
    expect(bundle.userSamples).toEqual([]);
    expect(bundle.userSnippets).toEqual([]);
  });

  it('导出→清空→导入往返：三类资产全量恢复', () => {
    localStorage.setItem(
      'flowUserConfigPresets',
      JSON.stringify([{ config: { theme: 'forest' }, id: 'p1', label: '森林' }])
    );
    localStorage.setItem(
      'flowUserSamples',
      JSON.stringify([{ code: 'flowchart TD\n  A --> B', id: 's1', label: '示例一' }])
    );
    localStorage.setItem(
      'flowUserSnippets',
      JSON.stringify([{ code: 'A[标签]', id: 'n1', label: '片段一' }])
    );
    const bundle = exportAssets();

    clearAssets();
    expect(loadUserPresets()).toEqual([]);
    expect(loadUserSamples()).toEqual([]);
    expect(loadUserSnippets()).toEqual([]);

    const result = importAssets(bundle);
    expect(result).toEqual({ configPresets: 1, samples: 1, snippets: 1 });
    expect(loadUserPresets()[0].label).toBe('森林');
    expect(loadUserSamples()[0].code).toContain('A --> B');
    expect(loadUserSnippets()[0].label).toBe('片段一');
  });

  it('parseAssetBundle：合法 JSON 通过，损坏/缺字段/错版本拒绝', () => {
    const good = JSON.stringify(exportAssets());
    expect(parseAssetBundle(good)).toBeDefined();
    expect(parseAssetBundle('{ broken')).toBeUndefined();
    expect(parseAssetBundle('[]')).toBeUndefined();
    expect(parseAssetBundle('{"version":2}')).toBeUndefined();
    expect(
      parseAssetBundle('{"version":1,"userConfigPresets":"x","userSamples":[],"userSnippets":[]}')
    ).toBeUndefined();
    expect(
      parseAssetBundle('{"version":1,"userConfigPresets":[{}],"userSamples":[],"userSnippets":[]}')
    ).toBeDefined();
  });

  it('导入非法条目静默跳过（合法条目照常合入）', () => {
    const bundle = {
      userConfigPresets: [
        { config: { theme: 'dark' }, id: 'ok', label: '好的' },
        { config: 42, id: 'bad', label: '坏配置' },
        { id: 'bad2', label: '没配置' }
      ],
      userSamples: [
        { code: 'A', id: 'ok', label: '好示例' },
        { code: 7, id: 'bad', label: '坏代码' }
      ],
      userSnippets: [{ code: 'B', id: 'ok', label: '好片段' }],
      version: 1 as const
    } as unknown as Parameters<typeof importAssets>[0];
    const result = importAssets(bundle);
    expect(result).toEqual({ configPresets: 1, samples: 1, snippets: 1 });
    expect(loadUserPresets()).toHaveLength(1);
    expect(loadUserSamples()).toHaveLength(1);
  });
});
