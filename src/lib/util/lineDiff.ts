/**
 * 行级 LCS 对比（历史「与当前对比」用，无依赖实现）。
 * 常规图表代码量级（数千行内）DP 可控；超限降级为整段替换
 * （旧文全删、新文全增），不伪报逐行差异。
 */

export interface DiffRow {
  text: string;
  type: 'add' | 'del' | 'same';
  /** 旧文件 1-based 行号（add 行无——旧文不存在该行） */
  oldLine?: number;
  /** 新文件 1-based 行号（del 行无——新文不存在该行） */
  newLine?: number;
}

// 2000×2000 = 4M 格，一次性对话框渲染可接受的上限
const MAX_LINES = 2000;

export const diffLines = (before: string, after: string): DiffRow[] => {
  // 空串视为零行（split 会给出一行空行，语义上「空 → 有内容」应是纯新增）
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text, index): DiffRow => ({ type: 'del', text, oldLine: index + 1 })),
      ...b.map((text, index): DiffRow => ({ type: 'add', text, newLine: index + 1 }))
    ];
  }
  const m = a.length;
  const n = b.length;
  // lcs[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  // 回溯：按原行序输出 same/add/del
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      rows.push({ type: 'same', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: 'del', text: a[i], oldLine: i + 1 });
      i += 1;
    } else {
      rows.push({ type: 'add', text: b[j], newLine: j + 1 });
      j += 1;
    }
  }
  while (i < m) {
    rows.push({ type: 'del', text: a[i], oldLine: i + 1 });
    i += 1;
  }
  while (j < n) {
    rows.push({ type: 'add', text: b[j], newLine: j + 1 });
    j += 1;
  }
  return rows;
};

// 差异行转 unified 风格纯文本（`- 旧行` / `+ 新行`，不含上下文）——
// 便于直接贴进 issue / 聊天说明「改了什么」。
export const diffToText = (rows: DiffRow[]): string =>
  rows
    .filter((row) => row.type !== 'same')
    .map((row) => `${row.type === 'add' ? '+' : '-'} ${row.text}`)
    .join('\n');

// ===== 上下文折叠（循环 147）=====

/** 折叠分隔块：连续的未变行被收拢为一条「已折叠 N 行」。 */
export interface DiffDisplayBlock {
  kind: 'rows' | 'fold';
  /** rows 块为待渲染行；fold 块为被收拢的行（供点击展开后渲染） */
  rows: DiffRow[];
  /** fold 块被收拢的行数 */
  foldedCount: number;
  /** 稳定 key（rows 的起始下标） */
  key: number;
}

// 未变行保留为上下文的数量（折叠段每侧各留 N 行）；折叠块少于
// FOLD_MIN 行时直接显示（太碎的折叠反而干扰）。
const FOLD_CONTEXT = 3;
const FOLD_MIN = 4;

/**
 * GitHub 式上下文折叠：非差异行两侧各保留 context 行上下文，其余
 * 连续未变行收拢为 fold 块（点击可在 UI 展开）。diff 不足时原样返回
 * 单一块。key 用行起始下标，稳定可作 each key 与展开标记。
 */
export const collapseContext = (rows: DiffRow[], context = FOLD_CONTEXT): DiffDisplayBlock[] => {
  const keep = new Array<boolean>(rows.length).fill(false);
  // 头尾各留 context 行：两版本完全一致（全 same）时不至于只剩一条
  // 折叠条；截断到 MAX_DIFF_ROWS 的切片同样保有收尾。
  for (let k = 0; k < Math.min(context, rows.length); k += 1) {
    keep[k] = true;
    keep[rows.length - 1 - k] = true;
  }
  rows.forEach((row, i) => {
    if (row.type === 'same') {
      return;
    }
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k += 1) {
      keep[k] = true;
    }
  });

  const blocks: DiffDisplayBlock[] = [];
  let i = 0;
  while (i < rows.length) {
    if (!keep[i]) {
      // 连续未折叠区间 → fold 块
      const start = i;
      while (i < rows.length && !keep[i]) {
        i += 1;
      }
      if (i - start >= FOLD_MIN) {
        blocks.push({
          kind: 'fold',
          rows: rows.slice(start, i),
          foldedCount: i - start,
          key: start
        });
      } else {
        blocks.push({ kind: 'rows', rows: rows.slice(start, i), foldedCount: 0, key: start });
      }
      continue;
    }
    const start = i;
    while (i < rows.length && keep[i]) {
      i += 1;
    }
    blocks.push({ kind: 'rows', rows: rows.slice(start, i), foldedCount: 0, key: start });
  }
  return blocks;
};
