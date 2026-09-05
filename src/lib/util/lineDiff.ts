/**
 * 行级 LCS 对比（历史「与当前对比」用，无依赖实现）。
 * 常规图表代码量级（数千行内）DP 可控；超限降级为整段替换
 * （旧文全删、新文全增），不伪报逐行差异。
 */

export interface DiffRow {
  text: string;
  type: 'add' | 'del' | 'same';
}

// 2000×2000 = 4M 格，一次性对话框渲染可接受的上限
const MAX_LINES = 2000;

export const diffLines = (before: string, after: string): DiffRow[] => {
  // 空串视为零行（split 会给出一行空行，语义上「空 → 有内容」应是纯新增）
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  if (a.length > MAX_LINES || b.length > MAX_LINES) {
    return [
      ...a.map((text): DiffRow => ({ type: 'del', text })),
      ...b.map((text): DiffRow => ({ type: 'add', text }))
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
      rows.push({ type: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      rows.push({ type: 'del', text: a[i] });
      i += 1;
    } else {
      rows.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < m) {
    rows.push({ type: 'del', text: a[i] });
    i += 1;
  }
  while (j < n) {
    rows.push({ type: 'add', text: b[j] });
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
