import { describe, expect, it } from 'vitest';
import {
  edgeAnchor,
  generateCode,
  layoutGraph,
  nextNodeId,
  NODE_H,
  NODE_W,
  parseFlowchart,
  sanitizePositions,
  type VGraph,
  type VNode
} from './model';

const graphOf = (overrides: Partial<VGraph> = {}): VGraph => ({
  direction: 'TD',
  edges: [],
  nodes: [],
  ...overrides
});

describe('generateCode', () => {
  it('renders nodes with shapes and plain edges', () => {
    const code = generateCode(
      graphOf({
        edges: [{ id: 'E1', source: 'A', target: 'B', type: 'arrow' }],
        nodes: [
          { id: 'A', label: 'Start', shape: 'round', x: 0, y: 0 },
          { id: 'B', label: 'Is it?', shape: 'diamond', x: 0, y: 0 }
        ]
      })
    );
    expect(code).toBe('flowchart TD\n    A(Start)\n    B{Is it?}\n    A --> B\n');
  });

  it('renders labeled and dashed edges', () => {
    const code = generateCode(
      graphOf({
        edges: [
          { id: 'E1', label: 'yes', source: 'A', target: 'B', type: 'arrow' },
          { id: 'E2', label: 'no', source: 'A', target: 'C', type: 'dashed' },
          { id: 'E3', source: 'B', target: 'C', type: 'line' }
        ],
        nodes: [
          { id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 },
          { id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 },
          { id: 'C', label: 'C', shape: 'rect', x: 0, y: 0 }
        ]
      })
    );
    expect(code).toContain('A -->|yes| B');
    expect(code).toContain('A -. no .-> C');
    expect(code).toContain('B --- C');
  });

  it('quotes labels containing brackets and strips quotes/newlines', () => {
    const code = generateCode({
      direction: 'TD',
      edges: [],
      nodes: [
        { id: 'A', label: 'a (b)\nc', shape: 'rect', x: 0, y: 0 },
        { id: 'B', label: 'say "hi"', shape: 'rect', x: 0, y: 0 }
      ]
    });
    expect(code).toContain('A["a (b) c"]');
    expect(code).toContain('B[say hi]');
  });
});

describe('parseFlowchart', () => {
  it('parses the default sample diagram', () => {
    const code = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
`;
    const parsed = parseFlowchart(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { graph } = parsed.result;
    expect(graph.direction).toBe('TD');
    expect(graph.nodes.map((n) => [n.id, n.label, n.shape])).toEqual([
      ['A', 'Christmas', 'rect'],
      ['B', 'Go shopping', 'round'],
      ['C', 'Let me think', 'diamond'],
      ['D', 'Laptop', 'rect']
    ]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[0]).toMatchObject({ label: 'Get money', source: 'A', target: 'B' });
    expect(graph.edges[1]).toMatchObject({ source: 'B', target: 'C', type: 'arrow' });
  });

  it('parses chained edges, textual link labels and dashed links', () => {
    const parsed = parseFlowchart('flowchart LR\n  A -- yes --> B -.-> C -. no .-> D');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { graph } = parsed.result;
    expect(graph.direction).toBe('LR');
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[0]).toMatchObject({ label: 'yes', source: 'A', target: 'B' });
    expect(graph.edges[1]).toMatchObject({ source: 'B', target: 'C', type: 'dashed' });
    expect(graph.edges[2]).toMatchObject({ label: 'no', source: 'C', target: 'D', type: 'dashed' });
  });

  it('normalizes TB to TD and accepts graph keyword', () => {
    const parsed = parseFlowchart('graph TB\n  A --> B');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.graph.direction).toBe('TD');
  });

  it('returns ok:false without a flowchart header', () => {
    expect(parseFlowchart('sequenceDiagram\n  A->>B: hi').ok).toBe(false);
    expect(parseFlowchart('').ok).toBe(false);
  });

  it('skips style/click/subgraph lines and counts them', () => {
    const code = `flowchart TD
  A[Start] --> B[End]
  style A fill:#f9f
  subgraph sg
    B --> C
  end
`;
    const parsed = parseFlowchart(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { graph, skipped } = parsed.result;
    expect(skipped).toBe(4); // style + subgraph + inner line + end
    expect(graph.nodes.map((n) => n.id)).toEqual(['A', 'B']);
    expect(graph.edges).toHaveLength(1);
  });

  it('supports quoted labels with special characters', () => {
    const parsed = parseFlowchart('flowchart TD\n  A["a (b)"]');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.result.graph.nodes[0]?.label).toBe('a (b)');
  });
});

describe('generate → parse roundtrip', () => {
  it('preserves ids, labels, shapes, edges and direction', () => {
    const graph: VGraph = {
      direction: 'LR',
      edges: [
        { id: 'E1', label: '是', source: 'N1', target: 'N2', type: 'arrow' },
        { id: 'E2', source: 'N2', target: 'N3', type: 'dashed' },
        { id: 'E3', label: 'a (b)', source: 'N3', target: 'N1', type: 'line' }
      ],
      nodes: [
        { id: 'N1', label: '开始', shape: 'round', x: 0, y: 0 },
        { id: 'N2', label: '判断?', shape: 'diamond', x: 0, y: 0 },
        { id: 'N3', label: 'cap (x)', shape: 'stadium', x: 0, y: 0 }
      ]
    };
    const parsed = parseFlowchart(generateCode(graph));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = parsed.result.graph;
    expect(back.direction).toBe('LR');
    expect(back.nodes.map((n) => [n.id, n.label, n.shape])).toEqual(
      graph.nodes.map((n) => [n.id, n.label, n.shape])
    );
    expect(back.edges.map((e) => [e.source, e.target, e.type, e.label])).toEqual(
      graph.edges.map((e) => [e.source, e.target, e.type, e.label])
    );
  });

  it('is stable across a second generate pass', () => {
    const graph = graphOf({
      edges: [{ id: 'E1', source: 'A', target: 'B', type: 'arrow' }],
      nodes: [
        { id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 },
        { id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 }
      ]
    });
    const once = generateCode(graph);
    const parsed = parseFlowchart(once);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(generateCode(parsed.result.graph)).toBe(once);
    }
  });
});

describe('layoutGraph', () => {
  const node = (graph: VGraph, id: string): VNode => {
    const found = graph.nodes.find((n) => n.id === id);
    if (!found) {
      throw new Error(`node ${id} not found`);
    }
    return found;
  };

  it('stacks children below parents for TD and beside them for LR', () => {
    const base = {
      edges: [{ id: 'E1', source: 'A', target: 'B', type: 'arrow' as const }],
      nodes: [
        { id: 'A', label: 'A', shape: 'rect' as const, x: 0, y: 0 },
        { id: 'B', label: 'B', shape: 'rect' as const, x: 0, y: 0 }
      ]
    };
    const td = layoutGraph({ ...base, direction: 'TD' });
    expect(node(td, 'B').y).toBeGreaterThan(node(td, 'A').y);
    expect(node(td, 'B').x).toBe(node(td, 'A').x);
    const lr = layoutGraph({ ...base, direction: 'LR' });
    expect(node(lr, 'B').x).toBeGreaterThan(node(lr, 'A').x);
  });

  it('still positions nodes stuck in cycles', () => {
    const laid = layoutGraph({
      direction: 'TD',
      edges: [
        { id: 'E1', source: 'A', target: 'B', type: 'arrow' },
        { id: 'E2', source: 'B', target: 'A', type: 'arrow' }
      ],
      nodes: [
        { id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 },
        { id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 }
      ]
    });
    expect(laid.nodes.every((n) => n.x >= 0 && n.y >= 0)).toBe(true);
  });
});

describe('edgeAnchor', () => {
  it('connects horizontal neighbours border-to-border', () => {
    const a = { id: 'A', label: 'A', shape: 'rect' as const, x: 0, y: 0 };
    const b = { id: 'B', label: 'B', shape: 'rect' as const, x: NODE_W + 100, y: 0 };
    const { x1, x2, y1, y2 } = edgeAnchor(a, b);
    expect(x1).toBeCloseTo(NODE_W); // right border of A
    expect(x2).toBeCloseTo(NODE_W + 100); // left border of B
    expect(y1).toBeCloseTo(NODE_H / 2);
    expect(y2).toBeCloseTo(NODE_H / 2);
  });
});

describe('nextNodeId', () => {
  it('avoids collisions with existing ids', () => {
    expect(nextNodeId([{ id: 'N1', label: 'x', shape: 'rect', x: 0, y: 0 }])).toBe('N2');
    expect(
      nextNodeId([
        { id: 'N1', label: 'x', shape: 'rect', x: 0, y: 0 },
        { id: 'N2', label: 'x', shape: 'rect', x: 0, y: 0 }
      ])
    ).toBe('N3');
  });
});

describe('sanitizePositions bounds (untrusted localStorage)', () => {
  it('rejects inflated coordinates that would poison geometry', () => {
    expect(
      sanitizePositions({
        BIG: { x: 1e300, y: 5 },
        NEG_BIG: { x: 5, y: -1e300 },
        OK: { x: 3000, y: 2000 },
        EDGE: { x: 10_000, y: -10_000 }
      })
    ).toEqual({
      OK: { x: 3000, y: 2000 },
      EDGE: { x: 10_000, y: -10_000 }
    });
  });
});
