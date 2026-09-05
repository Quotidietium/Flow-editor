import { describe, expect, it } from 'vitest';
import { diffLines } from './lineDiff';

const types = (rows: ReturnType<typeof diffLines>) => rows.map((r) => r.type).join(',');
const textsOf = (rows: ReturnType<typeof diffLines>, type: 'add' | 'del' | 'same') =>
  rows.filter((r) => r.type === type).map((r) => r.text);

describe('diffLines（循环 127：历史与当前对比）', () => {
  it('identical inputs yield all-same rows', () => {
    const rows = diffLines('a\nb\nc', 'a\nb\nc');
    expect(types(rows)).toBe('same,same,same');
  });

  it('detects pure addition with surrounding context intact', () => {
    const rows = diffLines('a\nb', 'a\nX\nb');
    expect(types(rows)).toBe('same,add,same');
    expect(textsOf(rows, 'add')).toEqual(['X']);
  });

  it('detects pure deletion', () => {
    const rows = diffLines('a\nX\nb', 'a\nb');
    expect(types(rows)).toBe('same,del,same');
    expect(textsOf(rows, 'del')).toEqual(['X']);
  });

  it('treats a middle replacement as del+add between same rows', () => {
    const rows = diffLines('a\nold\nb', 'a\nnew\nb');
    expect(types(rows)).toBe('same,del,add,same');
    expect(textsOf(rows, 'del')).toEqual(['old']);
    expect(textsOf(rows, 'add')).toEqual(['new']);
  });

  it('handles empty inputs', () => {
    expect(types(diffLines('', 'a\nb'))).toBe('add,add');
    expect(types(diffLines('a\nb', ''))).toBe('del,del');
    expect(diffLines('', '')).toEqual([]);
  });

  it('prefers keeping later lines common (LCS ordering)', () => {
    // 两处都能对齐时选最长公共子序列：a、b 都保留
    const rows = diffLines('a\nm\nb', 'a\nx\ny\nb');
    expect(textsOf(rows, 'same')).toEqual(['a', 'b']);
    expect(textsOf(rows, 'del')).toEqual(['m']);
    expect(textsOf(rows, 'add')).toEqual(['x', 'y']);
  });

  it('falls back to whole-block replace over the line cap', () => {
    const big = Array.from({ length: 2100 }, (_, i) => `L${i}`).join('\n');
    const rows = diffLines('old', big);
    expect(textsOf(rows, 'del')).toEqual(['old']);
    expect(textsOf(rows, 'add')).toHaveLength(2100);
  });
});
