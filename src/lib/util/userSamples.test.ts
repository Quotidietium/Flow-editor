import { beforeEach, describe, expect, it } from 'vitest';
import { deleteUserSample, loadUserSamples, saveUserSample } from './userSamples';

beforeEach(() => {
  localStorage.clear();
});

describe('user samples (我的示例)', () => {
  it('保存/读取往返，最新在前', () => {
    saveUserSample('周报流程', 'flowchart TD\n  A --> B');
    saveUserSample('评审时序', 'sequenceDiagram\n  A->>B: 好');
    const samples = loadUserSamples();
    expect(samples.map((sample) => sample.label)).toEqual(['评审时序', '周报流程']);
    expect(samples[1].code).toBe('flowchart TD\n  A --> B');
  });

  it('同名覆盖（不出现重复标签）', () => {
    saveUserSample('模板', 'flowchart TD\n  A --> B');
    saveUserSample('模板', 'flowchart LR\n  C --> D');
    const samples = loadUserSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0].code).toContain('LR');
  });

  it('空名/空白代码/超长代码不落盘；代码保留原始空白', () => {
    expect(saveUserSample('   ', 'A --> B')).toEqual([]);
    expect(saveUserSample('空白', '  \n ')).toEqual([]);
    expect(saveUserSample('超长', 'x'.repeat(10 * 1024 + 1))).toEqual([]);
    saveUserSample('缩进', '  A --> B\n');
    expect(loadUserSamples()[0].code).toBe('  A --> B\n');
  });

  it('标签超长按 30 字截断', () => {
    saveUserSample('x'.repeat(40), 'A');
    expect(loadUserSamples()[0].label).toHaveLength(30);
  });

  it('删除指定 id', () => {
    saveUserSample('一', 'A');
    const [keep] = saveUserSample('二', 'B');
    const next = deleteUserSample(keep.id);
    expect(next.map((sample) => sample.label)).toEqual(['一']);
    expect(loadUserSamples()).toHaveLength(1);
  });

  it('手改 storage 的非法条目静默丢弃', () => {
    localStorage.setItem(
      'flowUserSamples',
      JSON.stringify([
        { code: 'A --> B', id: 'ok-1', label: '好的' },
        { code: 42, id: 'bad-1', label: '坏代码' },
        { code: '  ', id: 'bad-2', label: '空白码' },
        { code: 'x'.repeat(11 * 1024), id: 'bad-3', label: '超长' },
        { code: 'A', id: '', label: '没id' },
        { code: 'A', id: 'bad-4', label: ' ' },
        'garbage'
      ])
    );
    const samples = loadUserSamples();
    expect(samples).toHaveLength(1);
    expect(samples[0].id).toBe('ok-1');
  });

  it('损坏或非数组 storage 返回空', () => {
    localStorage.setItem('flowUserSamples', '{ not json');
    expect(loadUserSamples()).toEqual([]);
    localStorage.setItem('flowUserSamples', '{"a":1}');
    expect(loadUserSamples()).toEqual([]);
  });

  it('数量上限 20 条', () => {
    for (const index of Array.from({ length: 25 }, (_, index) => index)) {
      saveUserSample(`s${index}`, 'A');
    }
    expect(loadUserSamples()).toHaveLength(20);
  });
});
