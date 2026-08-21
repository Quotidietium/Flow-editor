/**
 * Board editor model: pure group→item operations for the grouped-list kinds
 * (journey / gantt / timeline / kanban / cynefin). The board renders groups as
 * columns and member items as cards; every operation here mutates the plain
 * VGraph (nodes + structural edges) so the existing per-kind generators emit
 * the resulting code unchanged. No DOM access — unit-testable.
 *
 * Semantics mirror `groupedEmit` in kinds.extra.ts: groups in node order,
 * items in membership-edge order, orphan items attached to a virtual last
 * column. Membership is "first group edge wins" — moveCard therefore rewrites
 * the card's single membership edge instead of adding a second one.
 */

import { nextEdgeId, nextNodeId } from './model';
import type { VGraph, VNode } from './model';

export interface BoardColumn {
  /** Group node id; undefined for the virtual orphan column. */
  id: string | undefined;
  items: VNode[];
  label: string;
  /** True for the virtual column that only holds orphan items. */
  virtual: boolean;
}

/** Pure derived view: group columns with their member item nodes. */
export const boardColumns = (
  graph: VGraph,
  groupRole: string,
  fallbackLabel: string
): BoardColumn[] => {
  const groupNodes = graph.nodes.filter((n) => n.role === groupRole);
  const groupIds = new Set(groupNodes.map((n) => n.id));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n] as const));
  const memberIds = new Map<string, string[]>();
  const grouped = new Set<string>();
  for (const edge of graph.edges) {
    // Group→group edges are authored transitions (cynefin), not membership.
    if (
      groupIds.has(edge.source) &&
      !groupIds.has(edge.target) &&
      edge.source !== edge.target &&
      !grouped.has(edge.target)
    ) {
      memberIds.set(edge.source, [...(memberIds.get(edge.source) ?? []), edge.target]);
      grouped.add(edge.target);
    }
  }
  const columns: BoardColumn[] = groupNodes.map((node) => ({
    id: node.id,
    items: (memberIds.get(node.id) ?? [])
      .map((id) => nodeById.get(id))
      .filter((n): n is VNode => n !== undefined),
    label: node.label || node.id,
    virtual: false
  }));
  const orphans = graph.nodes.filter((n) => !groupIds.has(n.id) && !grouped.has(n.id));
  if (columns.length === 0) {
    if (orphans.length > 0) {
      columns.push({ id: undefined, items: orphans, label: fallbackLabel, virtual: true });
    }
  } else if (orphans.length > 0) {
    // Generation folds orphans into the last group; the board shows them there
    // too so what you see is what the code will say.
    (columns[columns.length - 1] as BoardColumn).items.push(...orphans);
  }
  return columns;
};

/** The single membership edge linking a group to a card, if any. */
const membershipEdge = (graph: VGraph, groupRole: string, cardId: string) => {
  const groupIds = new Set(graph.nodes.filter((n) => n.role === groupRole).map((n) => n.id));
  return graph.edges.find(
    (edge) => edge.target === cardId && groupIds.has(edge.source) && edge.role !== 'mergeFrom'
  );
};

export const addColumn = (
  graph: VGraph,
  options: { label: string; role: string; roleData?: string }
): VNode => {
  const node: VNode = {
    id: nextNodeId(graph.nodes),
    label: options.label,
    role: options.role,
    roleData: options.roleData,
    shape: 'rect',
    x: 0,
    y: 0
  };
  graph.nodes.push(node);
  return node;
};

/** Removes the column node and its membership edges; cards become orphans. */
export const removeColumn = (graph: VGraph, columnId: string): void => {
  graph.nodes = graph.nodes.filter((n) => n.id !== columnId);
  graph.edges = graph.edges.filter((edge) => edge.source !== columnId && edge.target !== columnId);
};

/** Swaps a column with its previous/next sibling column (node order = column order). */
export const moveColumn = (
  graph: VGraph,
  groupRole: string,
  columnId: string,
  direction: -1 | 1
): void => {
  const groupIds = graph.nodes.filter((n) => n.role === groupRole).map((n) => n.id);
  const at = groupIds.indexOf(columnId);
  const swapWith = groupIds[at + direction];
  if (at < 0 || swapWith === undefined) {
    return;
  }
  const indexA = graph.nodes.findIndex((n) => n.id === columnId);
  const indexB = graph.nodes.findIndex((n) => n.id === swapWith);
  const a = graph.nodes[indexA] as VNode;
  graph.nodes[indexA] = graph.nodes[indexB] as VNode;
  graph.nodes[indexB] = a;
};

export const addCard = (
  graph: VGraph,
  options: { columnId?: string; itemRole: string; label: string }
): VNode => {
  const node: VNode = {
    id: nextNodeId(graph.nodes),
    label: options.label,
    role: options.itemRole,
    shape: 'rect',
    x: 0,
    y: 0
  };
  graph.nodes.push(node);
  if (options.columnId !== undefined) {
    graph.edges.push({
      id: nextEdgeId(graph.edges),
      source: options.columnId,
      target: node.id,
      type: 'line'
    });
  }
  return node;
};

/** Removes a card node and every edge touching it. */
export const removeCard = (graph: VGraph, cardId: string): void => {
  graph.nodes = graph.nodes.filter((n) => n.id !== cardId);
  graph.edges = graph.edges.filter((edge) => edge.source !== cardId && edge.target !== cardId);
};

/**
 * Moves a card to a column (undefined = orphan) optionally inserting it before
 * `beforeCardId`. Within-column moves reorder; cross-column moves rewire the
 * single membership edge so the "first group edge wins" rule never sees two.
 */
export const moveCard = (
  graph: VGraph,
  options: {
    beforeCardId?: string;
    cardId: string;
    groupRole: string;
    toColumnId: string | undefined;
  }
): void => {
  const { beforeCardId, cardId, groupRole, toColumnId } = options;
  if (cardId === beforeCardId) {
    return;
  }
  const existing = membershipEdge(graph, groupRole, cardId);
  if (existing) {
    graph.edges = graph.edges.filter((edge) => edge.id !== existing.id);
  }
  if (toColumnId === undefined) {
    return;
  }
  const edge = {
    id: existing?.id ?? nextEdgeId(graph.edges),
    source: toColumnId,
    target: cardId,
    type: 'line' as const
  };
  if (beforeCardId !== undefined) {
    const before = membershipEdge(graph, groupRole, beforeCardId);
    if (before) {
      graph.edges.splice(graph.edges.indexOf(before), 0, edge);
      return;
    }
  }
  graph.edges.push(edge);
};
