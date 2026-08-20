/**
 * Pure interaction helpers for the visual editor canvas: alignment guides,
 * align/distribute math, clipboard id re-minting and undo snapshots. No DOM —
 * everything here is unit-tested; VisualEditor.svelte only wires gestures.
 */

import type { VEdge, VGraph, VNode } from './model';
import { NODE_H, NODE_W, nodeSize } from './model';

/** Edge of a node's outer box in the given axis. */
export type AlignMode = 'bottom' | 'centerX' | 'centerY' | 'left' | 'right' | 'top';
export type DistributeAxis = 'x' | 'y';

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
  x: number;
  y: number;
}

const boxOf = (node: VNode): Box => {
  const size = nodeSize(node);
  return {
    bottom: node.y + size.h,
    left: node.x,
    right: node.x + size.w,
    top: node.y,
    x: node.x,
    y: node.y
  };
};

export interface GuideLine {
  axis: 'x' | 'y';
  at: number;
}

export interface GuideResult {
  /** Snapped position for the moving node (falls back to the raw position). */
  snapped: { x: number; y: number };
  /** Visible guide lines for the renderer. */
  guides: GuideLine[];
}

/**
 * Dynamic alignment guides (draw.io / Visio dynamic grid style): while a node
 * is dragged, its left/right/center-x (top/bottom/center-y) is compared
 * against every other node's; matches within `tolerance` snap the node and
 * emit a full-height/width guide line.
 */
export const alignmentGuides = (
  moving: VNode,
  others: VNode[],
  raw: { x: number; y: number },
  tolerance = 6
): GuideResult => {
  const size = nodeSize(moving);
  const movingXs = [raw.x, raw.x + size.w / 2, raw.x + size.w];
  const movingYs = [raw.y, raw.y + size.h / 2, raw.y + size.h];
  let bestX: { delta: number; at: number } | undefined;
  let bestY: { delta: number; at: number } | undefined;
  for (const other of others) {
    const box = boxOf(other);
    for (const at of [box.left, box.left + (box.right - box.left) / 2, box.right]) {
      for (let i = 0; i < 3; i++) {
        const delta = (movingXs[i] as number) - at;
        if (Math.abs(delta) <= tolerance) {
          if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) {
            bestX = { at, delta };
          }
        }
      }
    }
    for (const at of [box.top, box.top + (box.bottom - box.top) / 2, box.bottom]) {
      for (let i = 0; i < 3; i++) {
        const delta = (movingYs[i] as number) - at;
        if (Math.abs(delta) <= tolerance) {
          if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
            bestY = { at, delta };
          }
        }
      }
    }
  }
  const guides: GuideLine[] = [];
  let x = raw.x;
  let y = raw.y;
  if (bestX) {
    // Shift the node so the matched feature (left/center/right) lands on the
    // guide; delta is measured against the raw candidate position.
    x = raw.x - bestX.delta;
    guides.push({ axis: 'x', at: bestX.at });
  }
  if (bestY) {
    y = raw.y - bestY.delta;
    guides.push({ axis: 'y', at: bestY.at });
  }
  return { snapped: { x, y }, guides };
};

/** Position overrides for aligning several nodes along one edge/center. */
export const alignSelection = (
  nodes: VNode[],
  mode: AlignMode
): Record<string, { x?: number; y?: number }> => {
  if (nodes.length < 2) {
    return {};
  }
  const boxes = nodes.map(boxOf);
  const target =
    mode === 'left'
      ? Math.min(...boxes.map((b) => b.left))
      : mode === 'right'
        ? Math.max(...boxes.map((b) => b.right))
        : mode === 'top'
          ? Math.min(...boxes.map((b) => b.top))
          : mode === 'bottom'
            ? Math.max(...boxes.map((b) => b.bottom))
            : mode === 'centerX'
              ? (Math.min(...boxes.map((b) => b.left)) + Math.max(...boxes.map((b) => b.right))) / 2
              : (Math.min(...boxes.map((b) => b.top)) + Math.max(...boxes.map((b) => b.bottom))) /
                2;
  const out: Record<string, { x?: number; y?: number }> = {};
  nodes.forEach((node, i) => {
    const box = boxes[i] as Box;
    if (mode === 'left' || mode === 'right' || mode === 'centerX') {
      const width = box.right - box.left;
      const x = mode === 'left' ? target : mode === 'right' ? target - width : target - width / 2;
      out[node.id] = { x: Math.round(x) };
    } else {
      const height = box.bottom - box.top;
      const y = mode === 'top' ? target : mode === 'bottom' ? target - height : target - height / 2;
      out[node.id] = { y: Math.round(y) };
    }
  });
  return out;
};

/** Equal-gap distribution along an axis (keeps the end anchors fixed). */
export const distributeSelection = (
  nodes: VNode[],
  axis: DistributeAxis
): Record<string, { x?: number; y?: number }> => {
  if (nodes.length < 3) {
    return {};
  }
  const boxes = nodes.map(boxOf);
  const sorted = [...nodes].sort((a, b) => {
    const ba = boxes[nodes.indexOf(a)] as Box;
    const bb = boxes[nodes.indexOf(b)] as Box;
    return axis === 'x' ? ba.left - bb.left : ba.top - bb.top;
  });
  const first = boxes[nodes.indexOf(sorted[0] as VNode)] as Box;
  const last = boxes[nodes.indexOf(sorted.at(-1) as VNode)] as Box;
  const sizeOf = (box: Box): number => (axis === 'x' ? box.right - box.left : box.bottom - box.top);
  const startEdge = axis === 'x' ? first.left : first.top;
  const endEdge = axis === 'x' ? last.right : last.bottom;
  const totalSize = boxes.reduce((sum, box) => sum + sizeOf(box), 0);
  const gap = (endEdge - startEdge - totalSize) / (nodes.length - 1);
  const out: Record<string, { x?: number; y?: number }> = {};
  let cursor = startEdge;
  for (const node of sorted) {
    const box = boxes[nodes.indexOf(node)] as Box;
    if (axis === 'x') {
      out[node.id] = { x: Math.round(cursor) };
      cursor += sizeOf(box) + gap;
    } else {
      out[node.id] = { y: Math.round(cursor) };
      cursor += sizeOf(box) + gap;
    }
  }
  return out;
};

export interface ClipboardPayload {
  edges: VEdge[];
  nodes: VNode[];
}

/**
 * Re-mint node/edge ids for a paste: node ids keep their source suffix where
 * possible (N1 → N1_1), edges are re-pointed at the new ids and re-numbered.
 */
export const remintIds = (
  payload: ClipboardPayload,
  existingNodes: VNode[],
  existingEdges: VEdge[]
): { edges: VEdge[]; nodes: VNode[] } => {
  const taken = new Set(existingNodes.map((n) => n.id));
  const idMap = new Map<string, string>();
  const nodes = payload.nodes.map((node, i) => {
    let id = `${node.id}_${i + 1}`;
    while (taken.has(id)) {
      id = `${id}_1`;
    }
    taken.add(id);
    idMap.set(node.id, id);
    return { ...node, id };
  });
  const takenEdges = new Set(existingEdges.map((e) => e.id));
  const edges: VEdge[] = [];
  for (const edge of payload.edges) {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);
    if (!source || !target) {
      continue; // edge to an un-copied node
    }
    let id = `E${edges.length + 1}`;
    while (takenEdges.has(id)) {
      id = `${id}_1`;
    }
    takenEdges.add(id);
    edges.push({ ...edge, id, source, target });
  }
  return { edges, nodes };
};

/**
 * Rubber-band hit test (draw.io default): nodes must be fully enclosed,
 * unless `intersect` relaxes it to touching.
 */
export const nodesInRect = (
  nodes: VNode[],
  rect: { height: number; width: number; x: number; y: number },
  intersect = false
): VNode[] =>
  nodes.filter((node) => {
    const box = boxOf(node);
    const inside = box.left >= rect.x && box.right <= rect.x + rect.width;
    const insideY = box.top >= rect.y && box.bottom <= rect.y + rect.height;
    if (!intersect) {
      return inside && insideY;
    }
    return (
      box.left <= rect.x + rect.width &&
      box.right >= rect.x &&
      box.top <= rect.y + rect.height &&
      box.bottom >= rect.y
    );
  });

/** Deep plain copy of the graph for the undo stack ($state.snapshot result). */
export const snapshotGraph = (graph: VGraph): VGraph => JSON.parse(JSON.stringify(graph)) as VGraph;

export type Direction = 'down' | 'left' | 'right' | 'up';

/**
 * Visio AutoConnect: the direction arrow connects to the nearest not-yet-
 * connected node in that direction, or reports where a fresh node should be
 * spawned (draw.io drop-on-arrow semantics).
 */
export const autoConnect = (
  nodes: VNode[],
  edges: VEdge[],
  source: VNode,
  direction: Direction,
  scan = 220
): { existingId?: string; spawn: { x: number; y: number } } => {
  const size = nodeSize(source);
  const center = { x: source.x + size.w / 2, y: source.y + size.h / 2 };
  const spawnOffset = 220;
  const spawn =
    direction === 'left'
      ? { x: source.x - spawnOffset, y: center.y - NODE_H / 2 }
      : direction === 'right'
        ? { x: source.x + size.w + spawnOffset - NODE_W, y: center.y - NODE_H / 2 }
        : direction === 'up'
          ? { x: center.x - NODE_W / 2, y: source.y - spawnOffset }
          : { x: center.x - NODE_W / 2, y: source.y + size.h + spawnOffset - NODE_H };
  const connected = new Set(
    edges
      .filter((e) => e.source === source.id || e.target === source.id)
      .map((e) => (e.source === source.id ? e.target : e.source))
  );
  let best: { dist: number; id: string } | undefined;
  for (const node of nodes) {
    if (node.id === source.id || connected.has(node.id)) {
      continue;
    }
    const other = nodeSize(node);
    const dx = node.x + other.w / 2 - center.x;
    const dy = node.y + other.h / 2 - center.y;
    const inDirection =
      direction === 'left'
        ? dx < -20 && Math.abs(dy) < scan
        : direction === 'right'
          ? dx > 20 && Math.abs(dy) < scan
          : direction === 'up'
            ? dy < -20 && Math.abs(dx) < scan
            : dy > 20 && Math.abs(dx) < scan;
    if (!inDirection) {
      continue;
    }
    const dist = Math.abs(dx) + Math.abs(dy);
    if (!best || dist < best.dist) {
      best = { dist, id: node.id };
    }
  }
  return { existingId: best?.id, spawn };
};

/**
 * Grouped-grid layout for grouped-list kinds: every group node becomes a
 * column header; its items stack below it (kanban-style), columns laid out
 * left to right in group order; orphans form a trailing column.
 */
export const layoutGroupedGrid = (
  graph: VGraph,
  groupRole: string
): Record<string, { x: number; y: number }> => {
  const groups = graph.nodes.filter((n) => n.role === groupRole);
  const groupIds = new Set(groups.map((n) => n.id));
  const itemsOf = new Map<string, string[]>(groups.map((n) => [n.id, [] as string[]]));
  const grouped = new Set<string>();
  for (const edge of graph.edges) {
    if (groupIds.has(edge.source) && !groupIds.has(edge.target) && !grouped.has(edge.target)) {
      itemsOf.get(edge.source)?.push(edge.target);
      grouped.add(edge.target);
    }
  }
  const orphans = graph.nodes.filter((n) => !groupIds.has(n.id) && !grouped.has(n.id));
  const moves: Record<string, { x: number; y: number }> = {};
  const colWidth = NODE_W + 80;
  const rowHeight = NODE_H + 40;
  const columns = groups.length > 0 ? [...groups.map((n) => [n.id] as string[])] : [];
  if (orphans.length > 0) {
    columns.push(orphans.map((n) => n.id));
  }
  columns.forEach((column, colIdx) => {
    let y = 60;
    for (const id of column) {
      moves[id] = { x: 60 + colIdx * colWidth, y };
      y += rowHeight;
    }
    const items = itemsOf.get(column[0] as string) ?? [];
    for (const id of items) {
      moves[id] = { x: 60 + colIdx * colWidth, y };
      y += rowHeight;
    }
  });
  return moves;
};
