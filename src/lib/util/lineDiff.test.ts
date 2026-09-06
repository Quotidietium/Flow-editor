import { describe, expect, it } from 'vitest';
import { collapseContext, diffLines, diffToText } from './lineDiff';

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

  it('annotates 1-based old/new line numbers（循环 144）', () => {
    const rows = diffLines('a\nold\nb', 'a\nnew1\nnew2\nb');
    expect(rows[0]).toMatchObject({ type: 'same', oldLine: 1, newLine: 1 });
    expect(rows[1]).toMatchObject({ type: 'del', oldLine: 2 });
    expect(rows[1]?.newLine).toBeUndefined();
    expect(rows[2]).toMatchObject({ type: 'add', newLine: 2 });
    expect(rows[2]?.oldLine).toBeUndefined();
    expect(rows[3]).toMatchObject({ type: 'add', newLine: 3 });
    expect(rows[4]).toMatchObject({ type: 'same', oldLine: 3, newLine: 4 });
  });

  it('numbers the cap-fallback path too', () => {
    const rows = diffLines('old', `${'x\n'.repeat(2100)}`);
    expect(rows[0]?.oldLine).toBe(1);
    expect(rows[1]?.newLine).toBe(1);
    expect(rows[2100]?.newLine).toBe(2100);
  });

  it('falls back to whole-block replace over the line cap', () => {
    const big = Array.from({ length: 2100 }, (_, i) => `L${i}`).join('\n');
    const rows = diffLines('old', big);
    expect(textsOf(rows, 'del')).toEqual(['old']);
    expect(textsOf(rows, 'add')).toHaveLength(2100);
  });
});

describe('diffToText（循环 139：差异行复制）', () => {
  it('renders only changed lines with unified prefixes', () => {
    const text = diffToText(diffLines('a\nold\nb', 'a\nnew\nb'));
    expect(text).toBe('- old\n+ new');
  });

  it('keeps diff order and skips context rows', () => {
    const text = diffToText(diffLines('x\nA', 'x\nB\nC'));
    expect(text).toBe('- A\n+ B\n+ C');
  });

  it('returns an empty string for identical inputs', () => {
    expect(diffToText(diffLines('a\nb', 'a\nb'))).toBe('');
  });
});

describe('collapseContext（循环 147：上下文折叠）', () => {
  it('folds long unchanged gaps between diffs, keeping context rows', () => {
    // 头尾相同 + 中间大段相同：del/add 在中部两侧，中段被折叠
    const sameMid = Array.from({ length: 20 }, (_, i) => `same${i}`).join('\n');
    const rows = diffLines(
      `head\nold1\nold2\n${sameMid}\ntail`,
      `head\nnew1\nnew2\n${sameMid}\ntail`
    );
    const blocks = collapseContext(rows);
    expect(blocks.some((b) => b.kind === 'fold')).toBe(true);
    const folds = blocks.filter((b) => b.kind === 'fold');
    expect(folds.reduce((sum, b) => sum + b.foldedCount, 0)).toBeGreaterThan(0);
    // 上下文行保留：首块含 head 行
    expect(blocks[0].kind).toBe('rows');
    expect(blocks[0].rows[0]?.text).toBe('head');
    // 差异行仍在（未被折叠吞掉）
    expect(blocks.flatMap((b) => b.rows).some((r) => r.text === 'old1')).toBe(true);
    expect(blocks.flatMap((b) => b.rows).some((r) => r.text === 'new1')).toBe(true);
  });

  it('does not fold small gaps (kept rows are contiguous)', () => {
    const rows = diffLines('a\nb\nc', 'a\nX\nb\nc');
    const blocks = collapseContext(rows);
    expect(blocks.some((b) => b.kind === 'fold')).toBe(false);
  });

  it('keeps small fold blocks as plain rows (too fine to fold)', () => {
    // 差异在两端，中间 7 行相同：7 > context*2=6，中间 1 行会被折叠判定
    // 但折叠块仅 1 行（< FOLD_MIN）→ 直接显示
    const mid = Array.from({ length: 7 }, (_, i) => `s${i}`).join('\n');
    const rows = diffLines(`head\n${mid}\ntail`, 'head\nNEW\ntail');
    const blocks = collapseContext(rows);
    expect(blocks.some((b) => b.kind === 'fold')).toBe(false);
  });

  it('returns a single block for fully-kept rows', () => {
    const rows = diffLines('a\nb', 'a\nb');
    const blocks = collapseContext(rows);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('rows');
  });

  it('keeps head and tail rows when nothing differs (no lone fold divider)', () => {
    const same = Array.from({ length: 10 }, (_, i) => `v${i}`).join('\n');
    const blocks = collapseContext(diffLines(same, same));
    // 头 3 行 + 折叠 4 行 + 尾 3 行：全 same 也不会只剩一条折叠条
    expect(blocks[0].kind).toBe('rows');
    expect(blocks[0].rows).toHaveLength(3);
    expect(blocks.some((b) => b.kind === 'fold')).toBe(true);
    expect(blocks.at(-1)?.kind).toBe('rows');
    expect(blocks.at(-1)?.rows.at(-1)?.text).toBe('v9');
  });

  it('fold blocks carry the folded rows (for click-to-expand rendering)', () => {
    const sameMid = Array.from({ length: 20 }, (_, i) => `same${i}`).join('\n');
    const rows = diffLines(`head\nold1\n${sameMid}\ntail`, `head\nnew1\n${sameMid}\ntail`);
    const fold = collapseContext(rows).find((b) => b.kind === 'fold');
    expect(fold).toBeDefined();
    expect(fold?.rows).toHaveLength(fold?.foldedCount ?? -1);
    expect(fold?.rows.every((r) => r.type === 'same')).toBe(true);
  });
});
