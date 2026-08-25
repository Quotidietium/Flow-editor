import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteUserSnippet,
  loadUserSnippets,
  saveUserSnippet,
  type UserSnippet
} from './userSnippets';

beforeEach(() => {
  localStorage.clear();
});

describe('user snippets (我的代码片段)', () => {
  it('保存/读取往返，最新在前', () => {
    saveUserSnippet('骨架', 'subgraph A\nend\n');
    saveUserSnippet('箭头', ' --> ');
    const snippets = loadUserSnippets();
    expect(snippets.map((snippet) => snippet.label)).toEqual(['箭头', '骨架']);
    expect(snippets[1].code).toBe('subgraph A\nend\n');
  });

  it('同名覆盖（不出现重复标签）', () => {
    saveUserSnippet('骨架', 'A --> B');
    saveUserSnippet('骨架', 'C --> D');
    const snippets = loadUserSnippets();
    expect(snippets).toHaveLength(1);
    expect(snippets[0].code).toBe('C --> D');
  });

  it('空名/空白代码/超长代码不落盘；代码保留原始空白', () => {
    expect(saveUserSnippet('   ', 'A --> B')).toEqual([]);
    expect(saveUserSnippet('空白', '  \n  ')).toEqual([]);
    expect(saveUserSnippet('超长', 'x'.repeat(5 * 1024 + 1))).toEqual([]);
    saveUserSnippet('缩进', '  A --> B\n');
    expect(loadUserSnippets()[0].code).toBe('  A --> B\n');
  });

  it('标签超长按 30 字截断', () => {
    saveUserSnippet('x'.repeat(40), 'A');
    expect(loadUserSnippets()[0].label).toHaveLength(30);
  });

  it('删除指定 id', () => {
    saveUserSnippet('一', 'A');
    const [keep] = saveUserSnippet('二', 'B');
    const next = deleteUserSnippet(keep.id);
    expect(next.map((snippet) => snippet.label)).toEqual(['一']);
    expect(loadUserSnippets()).toHaveLength(1);
  });

  it('手改 storage 的非法条目静默丢弃', () => {
    localStorage.setItem(
      'flowUserSnippets',
      JSON.stringify([
        { code: 'A --> B', id: 'ok-1', label: '好的' },
        { code: 42, id: 'bad-1', label: '坏代码' },
        { code: '   ', id: 'bad-2', label: '空白码' },
        { code: 'x'.repeat(6 * 1024), id: 'bad-3', label: '超长' },
        { code: 'A', id: '', label: '没id' },
        { code: 'A', id: 'bad-4', label: '  ' },
        'garbage'
      ])
    );
    const snippets = loadUserSnippets();
    expect(snippets).toHaveLength(1);
    expect(snippets[0].id).toBe('ok-1');
  });

  it('损坏或非数组 storage 返回空', () => {
    localStorage.setItem('flowUserSnippets', '{ not json');
    expect(loadUserSnippets()).toEqual([]);
    localStorage.setItem('flowUserSnippets', '{"a":1}');
    expect(loadUserSnippets()).toEqual([]);
  });

  it('数量上限 20 条', () => {
    for (const index of Array.from({ length: 25 }, (_, index) => index)) {
      saveUserSnippet(`s${index}`, 'A');
    }
    expect(loadUserSnippets()).toHaveLength(20);
  });

  it('保存返回的列表与落盘一致', () => {
    const returned: UserSnippet[] = saveUserSnippet('骨架', 'A --> B');
    expect(returned).toEqual(loadUserSnippets());
  });
});
