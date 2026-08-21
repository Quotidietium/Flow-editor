/**
 * Outline editor model: pure tree operations for the indent-tree kinds
 * (mindmap / treeview / treemap / ishikawa / swimlane). Hierarchy lives in
 * parent→child edges (children in edge order, roots = parentless nodes in
 * node order) — the same structure the existing generators rebuild the
 * indented source from. The outline is the classic outliner metaphor:
 * Enter = sibling, Tab = indent, Shift+Tab = outdent, rows as text inputs.
 * No DOM access — unit-testable.
 */

import { nextEdgeId, nextNodeId } from './model';
import type { VGraph, VNode } from './model';

export interface OutlineRow {
  depth: number;
  id: string;
  node: VNode;
  parentId: string | undefined;
}

/** Child ids of a parent (edge order); roots when parentId is undefined. */
const childIdsOf = (graph: VGraph, parentId: string | undefined): string[] => {
  if (parentId !== undefined) {
    return graph.edges.filter((e) => e.source === parentId).map((e) => e.target);
  }
  const hasParent = new Set(graph.edges.map((e) => e.target));
  return graph.nodes.filter((n) => !hasParent.has(n.id)).map((n) => n.id);
};

/** Flattens the tree depth-first into display rows (iterative — deep trees). */
export const outlineRows = (graph: VGraph): OutlineRow[] => {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const rows: OutlineRow[] = [];
  const visited = new Set<string>();
  const stack: { depth: number; id: string; parentId: string | undefined }[] = [];
  const pushRoots = (): void => {
    const roots = childIdsOf(graph, undefined);
    for (let i = roots.length - 1; i >= 0; i--) {
      stack.push({ depth: 0, id: roots[i] as string, parentId: undefined });
    }
  };
  pushRoots();
  while (stack.length > 0) {
    const { depth, id, parentId } = stack.pop() as {
      depth: number;
      id: string;
      parentId: string | undefined;
    };
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    const node = nodeById.get(id);
    if (!node) {
      continue;
    }
    rows.push({ depth, id, node, parentId });
    const kids = childIdsOf(graph, id).filter((kid) => !visited.has(kid));
    for (let i = kids.length - 1; i >= 0; i--) {
      stack.push({ depth: depth + 1, id: kids[i] as string, parentId: id });
    }
  }
  // Cycle-safe fallback: unreached nodes (cycles hide from root DFS) surface
  // as synthetic roots so nothing is silently uneditable.
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      rows.push({ depth: 0, id: node.id, node, parentId: undefined });
    }
  }
  return rows;
};

const link = (graph: VGraph, source: string, target: string): void => {
  graph.edges.push({ id: nextEdgeId(graph.edges), source, target, type: 'line' });
};

const unlink = (graph: VGraph, target: string): void => {
  graph.edges = graph.edges.filter((e) => e.target !== target);
};

export const addRoot = (graph: VGraph): VNode => {
  const node: VNode = { id: nextNodeId(graph.nodes), label: '', shape: 'rect', x: 0, y: 0 };
  graph.nodes.push(node);
  return node;
};

/** New child appended as the parent's last child. */
export const addChild = (graph: VGraph, parentId: string): VNode => {
  const node = addRoot(graph);
  link(graph, parentId, node.id);
  return node;
};

/** New sibling right after `rowId` (same parent, next position). */
export const addSiblingAfter = (graph: VGraph, row: OutlineRow): VNode => {
  const node = addRoot(graph);
  if (row.parentId === undefined) {
    return node; // pushed last among roots — node order is root order
  }
  const edge = {
    id: nextEdgeId(graph.edges),
    source: row.parentId,
    target: node.id,
    type: 'line' as const
  };
  const after = graph.edges.findIndex((e) => e.source === row.parentId && e.target === row.id);
  if (after === -1) {
    graph.edges.push(edge);
  } else {
    graph.edges.splice(after + 1, 0, edge);
  }
  return node;
};

/** The sibling directly above a row (same parent), used by indent. */
const previousSibling = (graph: VGraph, row: OutlineRow): string | undefined => {
  const siblings = childIdsOf(graph, row.parentId);
  const at = siblings.indexOf(row.id);
  return at > 0 ? siblings[at - 1] : undefined;
};

/** Tab: become the last child of the sibling above. No-op at leftmost. */
export const indentRow = (graph: VGraph, row: OutlineRow): void => {
  const above = previousSibling(graph, row);
  if (!above) {
    return;
  }
  unlink(graph, row.id);
  link(graph, above, row.id);
};

/** Shift+Tab: become the parent's next sibling (roots outdent to nothing). */
export const outdentRow = (graph: VGraph, row: OutlineRow): void => {
  if (row.parentId === undefined) {
    return;
  }
  const parentRow = outlineRows(graph).find((r) => r.id === row.parentId);
  unlink(graph, row.id);
  if (parentRow?.parentId === undefined) {
    return; // becomes a root (no edge)
  }
  const edge = {
    id: nextEdgeId(graph.edges),
    source: parentRow.parentId,
    target: row.id,
    type: 'line' as const
  };
  const after = graph.edges.findIndex(
    (e) => e.source === parentRow.parentId && e.target === parentRow.id
  );
  if (after === -1) {
    graph.edges.push(edge);
  } else {
    graph.edges.splice(after + 1, 0, edge);
  }
};

/** Delete: children promote into the deleted row's slot (outliner behavior). */
export const removeRow = (graph: VGraph, row: OutlineRow): void => {
  const kids = childIdsOf(graph, row.id);
  const parentEdgeIndex = graph.edges.findIndex((e) => e.target === row.id);
  const parentEdge = parentEdgeIndex === -1 ? undefined : graph.edges[parentEdgeIndex];
  graph.edges = graph.edges.filter((e) => e.source !== row.id && e.target !== row.id);
  if (parentEdge) {
    // Mint ids incrementally (nextEdgeId scans the array it is given, so
    // repeated calls against an unchanged array would collide).
    const promoted: VGraph['edges'] = [];
    for (const kid of kids) {
      promoted.push({
        id: nextEdgeId([...graph.edges, ...promoted]),
        source: parentEdge.source,
        target: kid,
        type: 'line' as const
      });
    }
    // Splice at the position the parent edge occupied, order preserved.
    const at = Math.min(parentEdgeIndex, graph.edges.length);
    graph.edges.splice(at, 0, ...promoted);
  } else {
    // Root removal: children become roots, inserted at the node's position.
    const nodeIndex = graph.nodes.findIndex((n) => n.id === row.id);
    const childNodes = kids
      .map((kid) => graph.nodes.find((n) => n.id === kid))
      .filter((n): n is VNode => n !== undefined);
    graph.nodes = graph.nodes.filter((n) => n.id !== row.id && !kids.includes(n.id));
    graph.nodes.splice(Math.min(nodeIndex, graph.nodes.length), 0, ...childNodes);
    return;
  }
  graph.nodes = graph.nodes.filter((n) => n.id !== row.id);
};

/** Moves a row above/below its adjacent sibling (roots swap in node order). */
export const moveRow = (graph: VGraph, row: OutlineRow, direction: -1 | 1): void => {
  const siblings = childIdsOf(graph, row.parentId);
  const at = siblings.indexOf(row.id);
  const other = siblings[at + direction];
  if (at < 0 || other === undefined) {
    return;
  }
  if (row.parentId === undefined) {
    const indexA = graph.nodes.findIndex((n) => n.id === row.id);
    const indexB = graph.nodes.findIndex((n) => n.id === other);
    const a = graph.nodes[indexA] as VNode;
    graph.nodes[indexA] = graph.nodes[indexB] as VNode;
    graph.nodes[indexB] = a;
    return;
  }
  const indexA = graph.edges.findIndex((e) => e.source === row.parentId && e.target === row.id);
  const indexB = graph.edges.findIndex((e) => e.source === row.parentId && e.target === other);
  if (indexA === -1 || indexB === -1) {
    return;
  }
  const a = graph.edges[indexA];
  graph.edges[indexA] = graph.edges[indexB] as NonNullable<typeof a>;
  graph.edges[indexB] = a as NonNullable<typeof a>;
};
