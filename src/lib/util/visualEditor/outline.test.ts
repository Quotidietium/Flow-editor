import { describe, expect, it } from 'vitest';

import { generateCode, parseCode } from './model';
import {
  addChild,
  addRoot,
  addSiblingAfter,
  duplicateRow,
  indentRow,
  moveRow,
  outlineRows,
  outdentRow,
  removeRow
} from './outline';
import type { VGraph } from './model';

const parse = (code: string): VGraph => {
  const result = parseCode(code);
  if (!result.ok) {
    throw new Error('parse failed');
  }
  return result.result.graph;
};

const labels = (graph: VGraph): string[] => outlineRows(graph).map((r) => r.node.label);

const MINDMAP = 'mindmap\n  root\n    a\n      a1\n    b\n    c';

describe('outlineRows', () => {
  it('flattens the tree depth-first with depths', () => {
    const rows = outlineRows(parse(MINDMAP));
    expect(rows.map((r) => `${r.depth}:${r.node.label}`)).toEqual([
      '0:root',
      '1:a',
      '2:a1',
      '1:b',
      '1:c'
    ]);
  });

  it('surfaces cycle-stranded nodes as synthetic roots', () => {
    const graph = parse(MINDMAP);
    graph.edges.push({ id: 'E99', source: 'a1', target: 'root', type: 'line' });
    // root now has a parent edge; nothing is parentless. Every node still lists.
    const rows = outlineRows(graph);
    expect(rows).toHaveLength(5);
  });
});

describe('outline editing', () => {
  it('addChild appends under the parent in the generated code', () => {
    const graph = parse(MINDMAP);
    const row = outlineRows(graph).find((r) => r.node.label === 'b');
    if (!row) {
      throw new Error('missing row');
    }
    addChild(graph, row.id).label = 'b1';
    const code = generateCode(graph);
    expect(code.indexOf('(b)')).toBeLessThan(code.indexOf('[b1]'));
    expect(code).toContain('        [b1]');
  });

  it('addSiblingAfter inserts directly after the row', () => {
    const graph = parse(MINDMAP);
    const rows = outlineRows(graph);
    const b = rows.find((r) => r.node.label === 'b');
    if (!b) {
      throw new Error('missing row');
    }
    addSiblingAfter(graph, b).label = 'bb';
    expect(labels(graph)).toEqual(['root', 'a', 'a1', 'b', 'bb', 'c']);
  });

  it('indentRow makes the row the last child of the sibling above', () => {
    const graph = parse(MINDMAP);
    const b = outlineRows(graph).find((r) => r.node.label === 'b');
    if (!b) {
      throw new Error('missing row');
    }
    indentRow(graph, b);
    expect(labels(graph)).toEqual(['root', 'a', 'a1', 'b', 'c']);
    expect(generateCode(graph)).toContain('        (b)');
  });

  it('outdentRow promotes the row after its parent', () => {
    const graph = parse(MINDMAP);
    const a1 = outlineRows(graph).find((r) => r.node.label === 'a1');
    if (!a1) {
      throw new Error('missing row');
    }
    outdentRow(graph, a1);
    expect(labels(graph)).toEqual(['root', 'a', 'a1', 'b', 'c']);
    expect(generateCode(graph)).toContain('    (a1)');
  });

  it('removeRow promotes children into the deleted slot', () => {
    const graph = parse(MINDMAP);
    const a = outlineRows(graph).find((r) => r.node.label === 'a');
    if (!a) {
      throw new Error('missing row');
    }
    removeRow(graph, a);
    expect(labels(graph)).toEqual(['root', 'a1', 'b', 'c']);
    const code = generateCode(graph);
    expect(code).toContain('    (a1)');
    expect(code).not.toContain('(a)\n');
  });

  it('removeRow on a root re-homes children as roots at the same position', () => {
    const graph = parse(MINDMAP);
    const root = outlineRows(graph).find((r) => r.node.label === 'root');
    if (!root) {
      throw new Error('missing row');
    }
    removeRow(graph, root);
    expect(labels(graph)).toEqual(['a', 'a1', 'b', 'c']);
  });

  it('moveRow swaps sibling order in the generated code', () => {
    const graph = parse(MINDMAP);
    const c = outlineRows(graph).find((r) => r.node.label === 'c');
    if (!c) {
      throw new Error('missing row');
    }
    moveRow(graph, c, -1);
    const code = generateCode(graph);
    expect(code.indexOf('(c)')).toBeLessThan(code.indexOf('(b)'));
  });

  it('addRoot appends a top-level row', () => {
    const graph = parse(MINDMAP);
    addRoot(graph).label = 'second';
    expect(labels(graph)).toEqual(['root', 'a', 'a1', 'b', 'c', 'second']);
  });

  it('edits round-trip through generate → parse', () => {
    const graph = parse(MINDMAP);
    const b = outlineRows(graph).find((r) => r.node.label === 'b');
    if (!b) {
      throw new Error('missing row');
    }
    indentRow(graph, b);
    const reparsed = parse(generateCode(graph));
    expect(labels(reparsed)).toEqual(['root', 'a', 'a1', 'b', 'c']);
  });
});

describe('duplicateRow', () => {
  const rowOf = (graph: VGraph, label: string) => {
    const row = outlineRows(graph).find((r) => r.node.label === label);
    if (!row) {
      throw new Error(`row not found: ${label}`);
    }
    return row;
  };

  it('deep-clones the subtree as the original’s next sibling', () => {
    const graph = parse(MINDMAP);
    const rowA = rowOf(graph, 'a');
    const copy = duplicateRow(graph, rowA);
    expect(copy).toBeDefined();
    // a(带子 a1) 整棵克隆为 root 的下一个孩子，原 b/c 顺序不动
    expect(labels(graph)).toEqual(['root', 'a', 'a1', 'a', 'a1', 'b', 'c']);
    // 拷贝是新 id，原行不动
    expect(copy?.id).not.toBe(rowA.id);
    expect(generateCode(graph)).toContain('b');
  });

  it('clones a root as the next root (node order), subtree intact', () => {
    const graph = parse('mindmap\n  r1\n    x\n  r2');
    duplicateRow(graph, rowOf(graph, 'r1'));
    expect(labels(graph)).toEqual(['r1', 'x', 'r1', 'x', 'r2']);
  });

  it('every cloned node gets a distinct fresh id', () => {
    const graph = parse(MINDMAP);
    duplicateRow(graph, rowOf(graph, 'root'));
    const ids = graph.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 5 原 + 5 克隆
    expect(graph.nodes).toHaveLength(10);
    expect(labels(graph)).toEqual(['root', 'a', 'a1', 'b', 'c', 'root', 'a', 'a1', 'b', 'c']);
  });

  it('missing row id is a no-op', () => {
    const graph = parse(MINDMAP);
    const before = graph.nodes.length;
    const ghost = {
      depth: 0,
      id: 'ZZ',
      node: { id: 'ZZ', label: 'ZZ', shape: 'rect' as const, x: 0, y: 0 },
      parentId: undefined
    };
    expect(duplicateRow(graph, ghost)).toBeUndefined();
    expect(graph.nodes).toHaveLength(before);
  });

  it('round-trips: generated code contains both subtrees and stays parseable', () => {
    const graph = parse(MINDMAP);
    duplicateRow(graph, rowOf(graph, 'b'));
    const code = generateCode(graph);
    const reparsed = parse(code);
    expect(labels(reparsed)).toEqual(['root', 'a', 'a1', 'b', 'b', 'c']);
  });
});
