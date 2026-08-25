import { describe, expect, it } from 'vitest';

import {
  addCard,
  addColumn,
  boardColumns,
  duplicateCard,
  moveCard,
  moveColumn,
  removeCard,
  removeColumn
} from './board';
import { generateCode } from './model';
import type { VGraph } from './model';

const kanbanGraph = (): VGraph => ({
  direction: 'TD',
  edges: [
    { id: 'E1', source: 'C1', target: 'T1', type: 'line' },
    { id: 'E2', source: 'C1', target: 'T2', type: 'line' },
    { id: 'E3', source: 'C2', target: 'T3', type: 'line' }
  ],
  kind: 'kanban',
  nodes: [
    { id: 'C1', label: '待办', role: 'column', shape: 'rect', x: 0, y: 0 },
    { id: 'C2', label: '完成', role: 'column', shape: 'rect', x: 0, y: 0 },
    { id: 'T1', label: '甲', role: 'ticket', shape: 'rect', x: 0, y: 0 },
    { id: 'T2', label: '乙', role: 'ticket', shape: 'rect', x: 0, y: 0 },
    { id: 'T3', label: '丙', role: 'ticket', shape: 'rect', x: 0, y: 0 }
  ]
});

describe('boardColumns', () => {
  it('groups items under their columns in edge order', () => {
    const columns = boardColumns(kanbanGraph(), 'column', '新列表');
    expect(columns.map((c) => c.label)).toEqual(['待办', '完成']);
    expect(columns[0]?.items.map((n) => n.label)).toEqual(['甲', '乙']);
    expect(columns[1]?.items.map((n) => n.label)).toEqual(['丙']);
  });

  it('attaches orphan items to the last column (generation semantics)', () => {
    const graph = kanbanGraph();
    graph.edges = graph.edges.filter((e) => e.id !== 'E3');
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns[1]?.items.map((n) => n.label)).toEqual(['丙']);
  });

  it('returns a virtual column when no group exists', () => {
    const graph = kanbanGraph();
    graph.nodes = graph.nodes.filter((n) => n.role !== 'column');
    graph.edges = [];
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns).toHaveLength(1);
    expect(columns[0]?.virtual).toBe(true);
    expect(columns[0]?.items).toHaveLength(3);
  });

  it('ignores group→group transition edges (cynefin)', () => {
    const graph = kanbanGraph();
    graph.edges.push({ id: 'E9', source: 'C1', target: 'C2', type: 'arrow' });
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns[1]?.items.map((n) => n.label)).toEqual(['丙']);
  });
});

describe('column operations', () => {
  it('addColumn appends a group node', () => {
    const graph = kanbanGraph();
    addColumn(graph, { label: '进行中', role: 'column' });
    expect(generateCode(graph)).toContain('进行中');
  });

  it('removeColumn orphans its cards, which regenerate under the last group', () => {
    const graph = kanbanGraph();
    removeColumn(graph, 'C1');
    const code = generateCode(graph);
    expect(code).not.toContain('待办');
    expect(code).toContain('甲');
  });

  it('moveColumn swaps column order in the generated code', () => {
    const graph = kanbanGraph();
    moveColumn(graph, 'column', 'C2', -1);
    const code = generateCode(graph);
    expect(code.indexOf('完成')).toBeLessThan(code.indexOf('待办'));
  });
});

describe('card operations', () => {
  it('addCard appends a member under the column', () => {
    const graph = kanbanGraph();
    addCard(graph, { columnId: 'C2', itemRole: 'ticket', label: '丁' });
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns[1]?.items.map((n) => n.label)).toEqual(['丙', '丁']);
  });

  it('removeCard deletes the card and its membership edge', () => {
    const graph = kanbanGraph();
    removeCard(graph, 'T1');
    expect(generateCode(graph)).not.toContain('甲');
  });

  it('moveCard rewires membership across columns', () => {
    const graph = kanbanGraph();
    moveCard(graph, { cardId: 'T1', groupRole: 'column', toColumnId: 'C2' });
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns[0]?.items.map((n) => n.label)).toEqual(['乙']);
    expect(columns[1]?.items.map((n) => n.label)).toEqual(['丙', '甲']);
  });

  it('moveCard reorders within a column via beforeCardId', () => {
    const graph = kanbanGraph();
    moveCard(graph, { beforeCardId: 'T1', cardId: 'T2', groupRole: 'column', toColumnId: 'C1' });
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns[0]?.items.map((n) => n.label)).toEqual(['乙', '甲']);
  });

  it('moveCard keeps exactly one membership edge per card', () => {
    const graph = kanbanGraph();
    moveCard(graph, { cardId: 'T1', groupRole: 'column', toColumnId: 'C2' });
    moveCard(graph, { cardId: 'T1', groupRole: 'column', toColumnId: 'C1' });
    const membership = graph.edges.filter((e) => e.target === 'T1');
    expect(membership).toHaveLength(1);
    expect(membership[0]?.source).toBe('C1');
  });

  it('duplicateCard clones the card and its membership edge, copy right after', () => {
    const graph = kanbanGraph();
    const copy = duplicateCard(graph, { cardId: 'T1', groupRole: 'column' });
    expect(copy).toBeDefined();
    expect(copy?.id).not.toBe('T1');
    expect(copy?.label).toBe('甲');
    // 边序即卡序：拷贝紧跟原卡，仍属同一列
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns[0]?.items.map((n) => n.label)).toEqual(['甲', '甲', '乙']);
    // 各持一条成员边（first-group-edge-wins 不破）
    expect(graph.edges.filter((e) => e.target === copy?.id)).toHaveLength(1);
  });

  it('duplicateCard copies detail and keeps orphans orphan (node order adjacent)', () => {
    const graph = kanbanGraph();
    // T3 变孤儿（无成员边）并带详情
    graph.edges = graph.edges.filter((e) => e.id !== 'E3');
    const t3 = graph.nodes.find((n) => n.id === 'T3');
    if (t3) {
      t3.detail = '3d';
    }
    const copy = duplicateCard(graph, { cardId: 'T3', groupRole: 'column' });
    expect(copy?.detail).toBe('3d');
    expect(graph.edges.filter((e) => e.target === copy?.id)).toHaveLength(0);
    const nodeIds = graph.nodes.map((n) => n.id);
    expect(nodeIds.indexOf(copy?.id ?? '')).toBe(nodeIds.indexOf('T3') + 1);
    // 孤儿折进最后一列：拷贝与原卡相邻出现
    const columns = boardColumns(graph, 'column', '新列表');
    expect(columns[1]?.items.map((n) => n.label)).toEqual(['丙', '丙']);
  });

  it('duplicateCard on a missing id is a no-op', () => {
    const graph = kanbanGraph();
    const before = graph.nodes.length;
    expect(duplicateCard(graph, { cardId: 'ZZ', groupRole: 'column' })).toBeUndefined();
    expect(graph.nodes).toHaveLength(before);
  });

  it('round-trips through generation and parsing', () => {
    const graph = kanbanGraph();
    moveCard(graph, { beforeCardId: 'T3', cardId: 'T1', groupRole: 'column', toColumnId: 'C2' });
    const code = generateCode(graph);
    expect(code.indexOf('丙')).toBeGreaterThan(-1);
    expect(code).toContain('甲');
  });
});
