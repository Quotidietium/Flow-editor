import { describe, expect, it } from 'vitest';
import {
  nextPreviewBackground,
  PREVIEW_BACKGROUNDS,
  PREVIEW_BG_LABELS,
  previewBgClass,
  sanitizePreviewBackground,
  type PreviewBackground
} from './previewBackground';

describe('nextPreviewBackground（四档循环）', () => {
  it('网格点 → 棋盘格 → 纯白 → 纯黑 → 网格点', () => {
    expect(nextPreviewBackground('grid')).toBe('checker');
    expect(nextPreviewBackground('checker')).toBe('white');
    expect(nextPreviewBackground('white')).toBe('black');
    expect(nextPreviewBackground('black')).toBe('grid');
  });

  it('循环覆盖全集且不重复', () => {
    // 从 grid 出发连走 N 步：序列 N+1 长、首尾皆 grid、集合不重不漏覆盖全集
    const sequence = PREVIEW_BACKGROUNDS.reduce<PreviewBackground[]>(
      (acc) => [...acc, nextPreviewBackground(acc[acc.length - 1])],
      ['grid']
    );
    expect(sequence).toHaveLength(PREVIEW_BACKGROUNDS.length + 1);
    expect(new Set(sequence)).toEqual(new Set(PREVIEW_BACKGROUNDS));
    expect(sequence[sequence.length - 1]).toBe('grid');
  });
});

describe('sanitizePreviewBackground（不可信输入防线）', () => {
  it('合法值原样保留', () => {
    for (const bg of PREVIEW_BACKGROUNDS) {
      expect(sanitizePreviewBackground(bg)).toBe(bg);
    }
  });

  it('手改 storage 的非法值回落网格点', () => {
    expect(sanitizePreviewBackground('garbage')).toBe('grid');
    expect(sanitizePreviewBackground(42)).toBe('grid');
    expect(sanitizePreviewBackground(null)).toBe('grid');
    expect(sanitizePreviewBackground(undefined)).toBe('grid');
    expect(sanitizePreviewBackground({ bg: 'white' })).toBe('grid');
  });
});

describe('previewBgClass（背景类名映射）', () => {
  it('grid 档沿用主题网格点类', () => {
    expect(previewBgClass('grid', 'light')).toBe('grid-bg-light');
    expect(previewBgClass('grid', 'dark')).toBe('grid-bg-dark');
    expect(previewBgClass('grid', undefined)).toBe('grid-bg-undefined');
  });

  it('固定底色档与主题无关', () => {
    expect(previewBgClass('checker', 'dark')).toBe('preview-bg-checker');
    expect(previewBgClass('white', 'dark')).toBe('preview-bg-white');
    expect(previewBgClass('black', 'light')).toBe('preview-bg-black');
  });
});

describe('PREVIEW_BG_LABELS', () => {
  it('每一档都有中文标签', () => {
    for (const bg of PREVIEW_BACKGROUNDS) {
      expect(PREVIEW_BG_LABELS[bg].length).toBeGreaterThan(0);
    }
  });
});
