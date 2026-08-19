/**
 * Visual editor model: pure data structures and transforms shared by the
 * VisualEditor component and its tests. No DOM access here.
 *
 * The visual editor models a Mermaid `flowchart` as positioned nodes plus
 * edges; `generateCode` emits Mermaid source from the model (synced into the
 * app via the `updateCode` gateway) and `parseFlowchart` imports existing
 * flowchart code back into the model (positions are re-laid-out, since
 * Mermaid source does not carry them).
 */

export type VShape = 'rect' | 'round' | 'stadium' | 'diamond';
export type VLinkType = 'arrow' | 'line' | 'dashed';

export interface VNode {
  id: string;
  label: string;
  shape: VShape;
  x: number;
  y: number;
}

export interface VEdge {
  id: string;
  source: string;
  target: string;
  type: VLinkType;
  label?: string;
}

export interface VGraph {
  direction: 'TD' | 'LR';
  nodes: VNode[];
  edges: VEdge[];
}

export const NODE_W = 140;
export const NODE_H = 44;
const GAP_X = 60;
const GAP_Y = 50;
const MARGIN = 40;

export const SHAPE_ORDER: VShape[] = ['rect', 'round', 'stadium', 'diamond'];
export const LINK_ORDER: VLinkType[] = ['arrow', 'line', 'dashed'];

export const nextNodeId = (nodes: VNode[]): string => {
  for (let i = nodes.length + 1; ; i++) {
    const id = `N${i}`;
    if (!nodes.some((node) => node.id === id)) {
      return id;
    }
  }
};

export const nextEdgeId = (edges: VEdge[]): string => {
  for (let i = edges.length + 1; ; i++) {
    const id = `E${i}`;
    if (!edges.some((edge) => edge.id === id)) {
      return id;
    }
  }
};

/**
 * Labels cannot contain quotes or line breaks (they would break the quoted
 * syntax); other specials are fine because the label is rendered quoted when
 * needed. See {@link renderNodeLabel}.
 */
export const sanitizeLabel = (label: string): string =>
  label
    .replaceAll('"', '')
    .replaceAll('`', '')
    .replaceAll(/[\r\n]+/g, ' ')
    .trim();

const needsQuotes = (label: string): boolean => /[[\](){}|;"']/.test(label) || label.trim() === '';

const renderNodeLabel = (label: string): string => {
  const clean = sanitizeLabel(label);
  return needsQuotes(clean) ? `"${clean}"` : clean;
};

const renderShape = (shape: VShape, label: string): string => {
  switch (shape) {
    case 'diamond': {
      return `{${label}}`;
    }
    case 'round': {
      return `(${label})`;
    }
    case 'stadium': {
      return `([${label}])`;
    }
    default: {
      return `[${label}]`;
    }
  }
};

const renderEdge = (edge: VEdge): string => {
  const { source, target, type } = edge;
  const label = edge.label ? sanitizeLabel(edge.label) : '';
  switch (type) {
    case 'dashed': {
      return label ? `${source} -. ${label} .-> ${target}` : `${source} -.-> ${target}`;
    }
    case 'line': {
      return label ? `${source} ---|${label}| ${target}` : `${source} --- ${target}`;
    }
    default: {
      return label ? `${source} -->|${label}| ${target}` : `${source} --> ${target}`;
    }
  }
};

/** Emit Mermaid flowchart source for the graph. Deterministic output order. */
export const generateCode = (graph: VGraph): string => {
  const lines = [`flowchart ${graph.direction}`];
  for (const node of graph.nodes) {
    const label = renderNodeLabel(node.label || node.id);
    lines.push(`    ${node.id}${renderShape(node.shape, label)}`);
  }
  for (const edge of graph.edges) {
    lines.push(`    ${renderEdge(edge)}`);
  }
  return `${lines.join('\n')}\n`;
};

// ---------------------------------------------------------------------------
// Parsing (best-effort import of existing flowchart code)
// ---------------------------------------------------------------------------

interface Token {
  id?: string;
  kind: 'edge' | 'edgeLabel' | 'node';
  label?: string;
  shape?: VShape;
  text: string;
}

// Order matters: longer tokens must be tried first ('-.->' before '-.').
const EDGE_TOKENS = ['-.->', '-->', '->', '==>', '==', '---', '--', '-.', '-'];

const edgeTypeOf = (token: string): VLinkType => {
  if (token.startsWith('-.')) {
    return 'dashed';
  }
  return token === '---' || token === '--' || token === '-' ? 'line' : 'arrow';
};

// Rewrite the documented textual link forms into the |label| form so the
// scanner only has to understand one labeled syntax per link type.
export const normalizeLabeledLinks = (line: string): string =>
  line
    .replace(/-\.\s*([^.|]+?)\s*\.->/g, '-.->|$1|')
    .replace(/--\s+([^.|-][^-]*?)\s+-->/g, '-->|$1|')
    .replace(/--\s+([^.|-][^-]*?)\s+---/g, '---|$1|')
    .replace(/==\s*([^=]+?)\s*==>/g, '==>|$1|');

// Sticky (`y`): anchored at lastIndex, so scanning can try a node token at
// the current offset without slicing a copy of the remaining line.
const NODE_RE =
  /([A-Za-z0-9_]+)\s*(?:\(\[([^\]]*)\]\)|\[\[([^\]]*)\]\]|\[([^\]]*)\]|\(([^()]*)\)|\{([^}]*)\})?/y;

const shapeOf = (match: RegExpExecArray): VShape | undefined => {
  if (match[2] !== undefined) return 'stadium';
  if (match[3] !== undefined) return 'rect'; // [[subroutine]] — approximated
  if (match[4] !== undefined) return 'rect';
  if (match[5] !== undefined) return 'round';
  if (match[6] !== undefined) return 'diamond';
  return undefined;
};

const labelOf = (match: RegExpExecArray): string | undefined => {
  const raw = match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6];
  return raw === undefined ? undefined : raw.replaceAll('"', '').trim() || undefined;
};

const scan = (input: string): Token[] => {
  const tokens: Token[] = [];
  const line = normalizeLabeledLinks(input);
  let i = 0;
  while (i < line.length) {
    const c = line[i] as string;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // `%%` starts a comment until end of line.
    if (c === '%' && line[i + 1] === '%') {
      break;
    }
    if (c === '|') {
      const end = line.indexOf('|', i + 1);
      if (end === -1) {
        break;
      }
      tokens.push({ kind: 'edgeLabel', text: line.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    // Every edge token starts with '-' or '='; skip the token list otherwise.
    if (c === '-' || c === '=') {
      const edge = EDGE_TOKENS.find((token) => line.startsWith(token, i));
      if (edge) {
        tokens.push({ kind: 'edge', text: edge });
        i += edge.length;
        continue;
      }
    }
    NODE_RE.lastIndex = i;
    const match = NODE_RE.exec(line);
    if (match && match[1]) {
      tokens.push({
        id: match[1],
        kind: 'node',
        label: labelOf(match),
        shape: shapeOf(match),
        text: match[0] as string
      });
      i += (match[0] as string).length;
      continue;
    }
    i++; // Unknown character (quotes, punctuation): skip and resync.
  }
  return tokens;
};

const SKIP_LINE_RE =
  /^(subgraph|end|click|style|classDef|class|linkStyle|linkstyle|direction|title|accTitle|accDescr|init)\b/;

export interface ParseResult {
  graph: VGraph;
  /** Number of lines skipped as unsupported (subgraph blocks, style directives…). */
  skipped: number;
}

export type ParsedFlowchart = { ok: true; result: ParseResult } | { ok: false };

/**
 * Parse Mermaid flowchart source into a visual graph. Only plain flowcharts
 * are supported (no subgraphs, no `&` forks); unsupported lines are skipped
 * and counted. Returns `{ ok: false }` when no `flowchart`/`graph` header is
 * found so callers can decide to start empty instead.
 */
export const parseFlowchart = (code: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*(?:flowchart|graph)\s+(TD|TB|BT|LR|RL)\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const rawDirection = (header[1] as string).toUpperCase();
  const direction: 'TD' | 'LR' = rawDirection === 'LR' || rawDirection === 'RL' ? 'LR' : 'TD';

  const graph: VGraph = { direction, edges: [], nodes: [] };
  const nodesById = new Map<string, VNode>();
  const shapedIds = new Set<string>();
  let skipped = 0;
  let inSubgraph = false;
  // Edges only ever get appended during a parse, so a plain sequence
  // produces exactly the ids nextEdgeId would — without its O(edges)
  // scan per edge.
  let edgeSeq = 0;

  const nodeOf = (id: string, label?: string, shape?: VShape): VNode => {
    const existing = nodesById.get(id);
    if (existing) {
      // A later occurrence with a bracket refines a previously bare node.
      if (shape && !shapedIds.has(id)) {
        existing.shape = shape;
        shapedIds.add(id);
      }
      if (label && existing.label === existing.id) {
        existing.label = label;
      }
      return existing;
    }
    const node: VNode = { id, label: label ?? id, shape: shape ?? 'rect', x: 0, y: 0 };
    nodesById.set(id, node);
    if (shape) {
      shapedIds.add(id);
    }
    graph.nodes.push(node);
    return node;
  };

  for (const rawLine of code.slice(header.index).split('\n').slice(1)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) {
      continue;
    }
    if (/^subgraph\b/.test(line)) {
      inSubgraph = true;
      skipped++;
      continue;
    }
    if (inSubgraph) {
      skipped++;
      if (/^end\b/.test(line)) {
        inSubgraph = false;
      }
      continue;
    }
    if (SKIP_LINE_RE.test(line)) {
      skipped++;
      continue;
    }
    for (const statement of line.split(';')) {
      interpretStatement(statement, graph, nodeOf, () => `E${++edgeSeq}`);
    }
  }
  return { ok: true, result: { graph, skipped } };
};

const interpretStatement = (
  statement: string,
  graph: VGraph,
  nodeOf: (id: string, label?: string, shape?: VShape) => VNode,
  newEdgeId: () => string
): void => {
  const tokens = scan(statement);
  let lastNode: VNode | undefined;
  let pendingType: VLinkType | undefined;
  let pendingLabel: string | undefined;

  for (const token of tokens) {
    switch (token.kind) {
      case 'node': {
        const node = nodeOf(token.id as string, token.label, token.shape);
        if (lastNode && pendingType && node.id !== lastNode.id) {
          graph.edges.push({
            id: newEdgeId(),
            label: pendingLabel || undefined,
            source: lastNode.id,
            target: node.id,
            type: pendingType
          });
        }
        lastNode = node;
        pendingLabel = undefined;
        pendingType = undefined;
        break;
      }
      case 'edge': {
        pendingType = edgeTypeOf(token.text);
        break;
      }
      case 'edgeLabel': {
        pendingLabel = (pendingLabel ? `${pendingLabel}|` : '') + token.text;
        break;
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Layout & geometry
// ---------------------------------------------------------------------------

/** Layered layout (Kahn layering along the flow direction; cycles appended). */
export const layoutGraph = (graph: VGraph): VGraph => {
  const ids = new Set(graph.nodes.map((node) => node.id));
  const indegree = new Map<string, number>(graph.nodes.map((node) => [node.id, 0] as const));
  const children = new Map<string, string[]>(graph.nodes.map((node) => [node.id, []] as const));
  for (const edge of graph.edges) {
    if (ids.has(edge.source) && ids.has(edge.target) && edge.source !== edge.target) {
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
      children.get(edge.source)?.push(edge.target);
    }
  }

  const depth = new Map<string, number>();
  let queue = graph.nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  queue.forEach((id) => depth.set(id, 0));
  while (queue.length > 0) {
    const next: string[] = [];
    for (const id of queue) {
      const d = (depth.get(id) ?? 0) + 1;
      for (const child of children.get(id) ?? []) {
        indegree.set(child, (indegree.get(child) ?? 0) - 1);
        if ((indegree.get(child) ?? 0) === 0 && !depth.has(child)) {
          depth.set(child, d);
          next.push(child);
        }
      }
    }
    queue = next;
  }
  // Nodes stuck in cycles: append below everything laid out so far.
  let cycleDepth = Math.max(0, ...[...depth.values()]) + 1;
  for (const node of graph.nodes) {
    if (!depth.has(node.id)) {
      depth.set(node.id, cycleDepth++);
    }
  }

  const layers = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const d = depth.get(node.id) ?? 0;
    const layer = layers.get(d);
    if (layer) {
      layer.push(node.id);
    } else {
      layers.set(d, [node.id]);
    }
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, layerIds] of layers) {
    layerIds.forEach((id, slot) => {
      const along = MARGIN + slot * (NODE_W + GAP_X);
      const across = MARGIN + d * (NODE_H + GAP_Y);
      positions.set(
        id,
        graph.direction === 'TD' ? { x: along, y: across } : { x: across, y: along }
      );
    });
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      ...(positions.get(node.id) ?? { x: MARGIN, y: MARGIN })
    }))
  };
};

export const nodeCenter = (node: VNode): { x: number; y: number } => ({
  x: node.x + NODE_W / 2,
  y: node.y + NODE_H / 2
});

/**
 * Border-to-border anchor points for the straight connector between two
 * nodes. The parameter is clamped at the midpoint between the two centers so
 * overlapping nodes still get sane anchors.
 */
export const edgeAnchor = (
  source: VNode,
  target: VNode
): { x1: number; x2: number; y1: number; y2: number } => {
  const a = nodeCenter(source);
  const b = nodeCenter(target);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // s such that a + (dx,dy)*s exits the node's box: min over the two axes.
  const exitParam = (dxF: number, dyF: number): number => {
    const tx = dxF === 0 ? Number.POSITIVE_INFINITY : NODE_W / 2 / Math.abs(dxF);
    const ty = dyF === 0 ? Number.POSITIVE_INFINITY : NODE_H / 2 / Math.abs(dyF);
    return Math.min(tx, ty, 0.5);
  };
  const s1 = exitParam(dx, dy);
  const s2 = exitParam(-dx, -dy);
  return {
    x1: a.x + dx * s1,
    x2: b.x - dx * s2,
    y1: a.y + dy * s1,
    y2: b.y - dy * s2
  };
};
