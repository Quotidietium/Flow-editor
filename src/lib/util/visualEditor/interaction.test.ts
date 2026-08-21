import { describe, expect, it } from 'vitest';
import type { VEdge, VNode } from './model';
import { NODE_H, nodeSize } from './model';
import {
  alignSelection,
  alignmentGuides,
  autoConnect,
  distributeSelection,
  nodesInRect,
  remintIds,
  snapshotGraph
} from './interaction';

const node = (id: string, x: number, y: number, detail?: string): VNode => ({
  detail,
  id,
  label: id,
  shape: 'rect',
  x,
  y
});

describe('alignmentGuides', () => {
  it('snaps the moving node edge to a matching other within tolerance', () => {
    const moving = node('A', 0, 0);
    const other = node('B', 96, 0); // left edge at 96, moving raw left at 100
    const result = alignmentGuides(moving, [other], { x: 100, y: 0 });
    expect(result.snapped.x).toBe(96);
    expect(result.guides).toContainEqual({ axis: 'x', at: 96 });
    expect(result.guides).not.toContainEqual({ axis: 'x', at: 100 });
  });

  it('snaps center-to-center vertically', () => {
    const moving = node('A', 0, 0);
    const other = node('B', 0, 200);
    // nearest feature pair wins: moving top 203 vs other top 200 (delta 3)
    const result = alignmentGuides(moving, [other], { x: 0, y: 203 });
    expect(result.snapped.y).toBe(200);
    expect(result.guides).toContainEqual({ axis: 'y', at: 200 });
  });

  it('keeps the raw position when nothing is close', () => {
    const moving = node('A', 0, 0);
    const other = node('B', 900, 900);
    const result = alignmentGuides(moving, [other], { x: 100, y: 100 });
    expect(result.snapped).toEqual({ x: 100, y: 100 });
    expect(result.guides).toEqual([]);
  });
});

describe('alignSelection', () => {
  const a = node('A', 0, 0);
  const b = node('B', 500, 300);

  it('aligns left edges', () => {
    expect(alignSelection([a, b], 'left')).toEqual({ A: { x: 0 }, B: { x: 0 } });
  });

  it('aligns right edges', () => {
    expect(alignSelection([a, b], 'right')).toEqual({ A: { x: 500 }, B: { x: 500 } });
  });

  it('aligns top edges', () => {
    expect(alignSelection([a, b], 'top')).toEqual({ A: { y: 0 }, B: { y: 0 } });
  });

  it('aligns centers', () => {
    const moves = alignSelection([a, b], 'centerX');
    expect(moves).toEqual({ A: { x: 250 }, B: { x: 250 } });
    const movesY = alignSelection([a, b], 'centerY');
    expect(movesY).toEqual({ A: { y: 150 }, B: { y: 150 } });
  });

  it('returns nothing for fewer than two nodes', () => {
    expect(alignSelection([a], 'left')).toEqual({});
  });

  it('accounts for detail-expanded heights', () => {
    const tall = node('T', 0, 0, 'a\nb\nc');
    const short = node('S', 400, 10);
    const moves = alignSelection([tall, short], 'top');
    expect(nodeSize(tall).h).toBe(NODE_H + 3 * 13);
    expect(moves.S?.y).toBe(0);
  });
});

describe('distributeSelection', () => {
  it('equalizes gaps while keeping the end anchors', () => {
    const a = node('A', 0, 0);
    const b = node('B', 300, 0);
    const c = node('C', 1000, 0);
    const moves = distributeSelection([a, b, c], 'x');
    // total width 3*NODE_W=420, span 0..1000+140=1140, gap=(1140-420)/2=360
    expect(moves).toEqual({ A: { x: 0 }, B: { x: 500 }, C: { x: 1000 } });
  });

  it('needs three nodes', () => {
    expect(distributeSelection([node('A', 0, 0), node('B', 10, 10)], 'x')).toEqual({});
  });
});

describe('nodesInRect', () => {
  const a = node('A', 0, 0);
  const b = node('B', 1000, 1000);

  it('fully-enclosed semantics by default (draw.io)', () => {
    const rect = { height: 500, width: 500, x: 0, y: 0 };
    expect(nodesInRect([a, b], rect).map((n) => n.id)).toEqual(['A']);
  });

  it('intersecting with alt', () => {
    const rect = { height: 100, width: 100, x: 50, y: 30 };
    expect(nodesInRect([a, b], rect, true).map((n) => n.id)).toEqual(['A']);
    expect(nodesInRect([a, b], rect, false)).toEqual([]);
  });
});

describe('remintIds', () => {
  it('re-mints node ids and re-points edges', () => {
    const a = node('N1', 0, 0);
    const b = node('N2', 100, 0);
    const edge: VEdge = { id: 'E1', source: 'N1', target: 'N2', type: 'arrow' };
    const { edges, nodes } = remintIds(
      { edges: [edge], nodes: [a, b] },
      [node('N1', 1, 1), node('N2', 2, 2)],
      []
    );
    expect(nodes.map((n) => n.id)).toEqual(['N1_1', 'N2_2']);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ id: 'E1', source: 'N1_1', target: 'N2_2' });
  });

  it('drops edges whose endpoints were not copied', () => {
    const { edges } = remintIds(
      {
        edges: [{ id: 'E1', source: 'N1', target: 'X', type: 'arrow' }],
        nodes: [node('N1', 0, 0)]
      },
      [],
      []
    );
    expect(edges).toEqual([]);
  });
});

describe('snapshotGraph', () => {
  it('deep-copies the graph (later mutations do not leak into the snapshot)', () => {
    const g = {
      direction: 'TD' as const,
      edges: [{ id: 'E1', source: 'A', target: 'B', type: 'arrow' as const }],
      kind: 'flowchart' as const,
      nodes: [node('A', 0, 0), node('B', 10, 10)]
    };
    const snap = snapshotGraph(g);
    const firstNode = g.nodes[0];
    if (firstNode) {
      firstNode.x = 999;
    }
    g.edges.length = 0;
    expect(snap.nodes[0]?.x).toBe(0);
    expect(snap.edges).toHaveLength(1);
  });
});

describe('autoConnect', () => {
  const a = node('A', 100, 100);
  const edge = (source: string, target: string): VEdge => ({
    id: `E-${source}-${target}`,
    source,
    target,
    type: 'arrow'
  });

  it('connects the nearest unconnected node in the direction', () => {
    const near = node('Near', 420, 110);
    const far = node('Far', 900, 100);
    const result = autoConnect([a, near, far], [], a, 'right');
    expect(result.existingId).toBe('Near');
  });

  it('ignores already-connected nodes', () => {
    const near = node('Near', 420, 110);
    const result = autoConnect([a, near], [edge('A', 'Near')], a, 'right');
    expect(result.existingId).toBeUndefined();
    expect(result.spawn.x).toBeGreaterThan(a.x);
  });

  it('spawns below for the down direction', () => {
    const result = autoConnect([a], [], a, 'down');
    expect(result.spawn.y).toBeGreaterThan(a.y);
  });
});
