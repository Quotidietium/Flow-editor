/**
 * Visual editor model: pure data structures and transforms shared by the
 * VisualEditor component and its tests. No DOM access here.
 *
 * The visual editor models node-edge Mermaid diagrams as positioned nodes
 * plus edges. `generateCode` emits Mermaid source from the model (synced into
 * the app via the `updateCode` gateway) and the per-kind `parse*` functions
 * import existing code back into the model (positions are re-laid-out, since
 * Mermaid source does not carry them). Supported kinds are declared in
 * {@link KIND_SPECS}; other diagram families (gantt, pie, …) are not
 * node-edge shaped and are rejected by {@link parseCode}.
 */

export type DiagramKind = 'class' | 'er' | 'flowchart' | 'mindmap' | 'sequence' | 'state';

export type VShape = 'rect' | 'round' | 'stadium' | 'diamond';

// Shared link-type tokens; each kind maps the tokens it uses to its own
// syntax (see KIND_SPECS and the per-kind generators).
export type VLinkType =
  | 'aggregation'
  | 'arrow'
  | 'composition'
  | 'dashed'
  | 'dashedArrow'
  | 'dashedLine'
  | 'inheritance'
  | 'line'
  | 'msgDashedFilled'
  | 'msgDashedOpen'
  | 'msgSolidFilled'
  | 'msgSolidOpen'
  | 'realization';

export interface VNode {
  id: string;
  label: string;
  shape: VShape;
  x: number;
  y: number;
  /** Body lines below the title (class members, ER attributes, state descriptions). */
  detail?: string;
  /** stateDiagram pseudo nodes: `[*]` start / end dots. */
  special?: 'end' | 'start';
}

export interface VEdge {
  id: string;
  source: string;
  target: string;
  type: VLinkType;
  label?: string;
  /** Cardinality annotations: quoted for class (`1`, `many`), crow's-foot tokens for ER (`||`, `o{`). */
  cardL?: string;
  cardR?: string;
}

export interface VGraph {
  direction: 'TD' | 'LR';
  /** Diagram family this graph renders/generates as; defaults to 'flowchart'. */
  kind?: DiagramKind;
  nodes: VNode[];
  edges: VEdge[];
}

export interface LinkSpec {
  name: string;
  type: VLinkType;
}

export interface KindSpec {
  /** Whether nodes support the detail (multi-line body) editor. */
  detail: boolean;
  /** Whether the TD/LR direction toggle applies. */
  direction: boolean;
  /** Chinese display name of the diagram kind. */
  label: string;
  /** Link palette cycled by the 线型 button; single/no entry hides it. */
  links: LinkSpec[];
  /** Label of the add-node toolbar button. */
  newNode: string;
  /** Shape palette cycled by the 形状 button; single/no entry hides it. */
  shapes: VShape[];
  /** Whether start/end pseudo nodes exist (stateDiagram `[*]`). */
  startEnd: boolean;
}

// Per-kind capability table; drives both the toolbar and the generators.
export const KIND_SPECS: Record<DiagramKind, KindSpec> = {
  class: {
    detail: true,
    direction: true,
    label: '类图',
    links: [
      { name: '关联', type: 'line' },
      { name: '箭头关联', type: 'arrow' },
      { name: '虚线关联', type: 'dashedLine' },
      { name: '依赖', type: 'dashedArrow' },
      { name: '继承', type: 'inheritance' },
      { name: '实现', type: 'realization' },
      { name: '组合', type: 'composition' },
      { name: '聚合', type: 'aggregation' }
    ],
    newNode: '类',
    shapes: [],
    startEnd: false
  },
  er: {
    detail: true,
    direction: false,
    label: 'ER 图',
    links: [
      { name: '实线', type: 'line' },
      { name: '虚线', type: 'dashedLine' }
    ],
    newNode: '实体',
    shapes: [],
    startEnd: false
  },
  flowchart: {
    detail: false,
    direction: true,
    label: '流程图',
    links: [
      { name: '箭头', type: 'arrow' },
      { name: '直线', type: 'line' },
      { name: '虚线', type: 'dashed' }
    ],
    newNode: '节点',
    shapes: ['rect', 'round', 'stadium', 'diamond'],
    startEnd: false
  },
  mindmap: {
    detail: false,
    direction: false,
    label: '思维导图',
    links: [],
    newNode: '节点',
    shapes: ['rect', 'round', 'stadium', 'diamond'],
    startEnd: false
  },
  sequence: {
    detail: false,
    direction: false,
    label: '时序图',
    links: [
      { name: '实线箭头', type: 'msgSolidFilled' },
      { name: '实线开箭头', type: 'msgSolidOpen' },
      { name: '虚线箭头', type: 'msgDashedFilled' },
      { name: '虚线开箭头', type: 'msgDashedOpen' }
    ],
    newNode: '参与者',
    shapes: ['rect', 'round'],
    startEnd: false
  },
  state: {
    detail: true,
    direction: true,
    label: '状态图',
    links: [{ name: '转换', type: 'arrow' }],
    newNode: '状态',
    shapes: [],
    startEnd: true
  }
};

// ER crow's-foot cardinality presets cycled by the 基数 button.
export const ER_CARDINALITIES: { cardL: string; cardR: string; name: string }[] = [
  { cardL: '||', cardR: '||', name: '一对一' },
  { cardL: '||', cardR: 'o{', name: '一对多' },
  { cardL: '||', cardR: 'o|', name: '一对零或一' },
  { cardL: '}o', cardR: 'o{', name: '多对多' }
];

export const NODE_W = 140;
export const NODE_H = 44;
export const DETAIL_LINE_H = 13;
export const SPECIAL_SIZE = 28;
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

/** Emit Mermaid source for the graph, per its diagram kind. Deterministic order. */
export const generateCode = (graph: VGraph): string => {
  switch (graph.kind ?? 'flowchart') {
    case 'class': {
      return generateClass(graph);
    }
    case 'er': {
      return generateEr(graph);
    }
    case 'mindmap': {
      return generateMindmap(graph);
    }
    case 'sequence': {
      return generateSequence(graph);
    }
    case 'state': {
      return generateState(graph);
    }
    default: {
      return generateFlowchart(graph);
    }
  }
};

const generateFlowchart = (graph: VGraph): string => {
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

const classRelation = (edge: VEdge): string => {
  const syntaxTable: Partial<Record<VLinkType, string>> = {
    aggregation: 'o--',
    arrow: '-->',
    composition: '*--',
    dashedArrow: '..>',
    dashedLine: '..',
    inheritance: '--|>',
    line: '--',
    realization: '..|>'
  };
  const syntax = syntaxTable[edge.type] ?? '--';
  // Cardinalities are quoted so bare tokens like `*`/`o` stay unambiguous
  // relation operators (mermaid's own examples use quoted cardinalities).
  const cardL = edge.cardL ? ` "${edge.cardL}"` : '';
  const cardR = edge.cardR ? ` "${edge.cardR}"` : '';
  const label = edge.label ? ` : ${sanitizeLabel(edge.label)}` : '';
  return `${edge.source}${cardL} ${syntax}${cardR} ${edge.target}${label}`;
};

const generateClass = (graph: VGraph): string => {
  const lines = ['classDiagram'];
  if (graph.direction === 'LR') {
    lines.push('    direction LR');
  }
  for (const node of graph.nodes) {
    const label = node.label || node.id;
    if (node.detail || label !== node.id) {
      lines.push(`    class ${node.id}[${JSON.stringify(label)}] {`);
      for (const line of node.detail ? node.detail.split('\n') : []) {
        lines.push(`        ${line.trim()}`);
      }
      lines.push('    }');
    }
  }
  for (const edge of graph.edges) {
    lines.push(`    ${classRelation(edge)}`);
  }
  return `${lines.join('\n')}\n`;
};

const erCardinality = (edge: VEdge): string => {
  const line = edge.type === 'dashedLine' ? '..' : '--';
  return `${edge.cardL ?? '||'}${line}${edge.cardR ?? 'o{'}`;
};

const generateEr = (graph: VGraph): string => {
  const lines = ['erDiagram'];
  for (const node of graph.nodes) {
    if (!node.detail) {
      continue; // entities without attributes are declared by their relations
    }
    lines.push(`    ${node.id} {`);
    for (const line of node.detail.split('\n')) {
      lines.push(`        ${line.trim()}`);
    }
    lines.push('    }');
  }
  for (const edge of graph.edges) {
    const label = edge.label ? ` : ${sanitizeLabel(edge.label)}` : '';
    lines.push(`    ${edge.source} ${erCardinality(edge)} ${edge.target}${label}`);
  }
  return `${lines.join('\n')}\n`;
};

const mindmapShape = (shape: VShape, label: string): string => {
  switch (shape) {
    case 'diamond': {
      return `{{${label}}}`;
    }
    case 'rect': {
      return `[${label}]`;
    }
    case 'stadium': {
      return `((${label}))`;
    }
    default: {
      return `(${label})`;
    }
  }
};

const generateMindmap = (graph: VGraph): string => {
  // Rebuild the tree from parent->child edges; children keep edge order so
  // the output is stable across regenerations. Unreached nodes append at
  // the root level. Emission is an explicit-stack DFS: a hand-crafted file
  // with one indent level per line makes the tree as deep as the input, and
  // recursion would overflow the stack long before that becomes slow.
  const children = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.source !== edge.target && !parentOf.has(edge.target)) {
      children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
      parentOf.set(edge.target, edge.source);
    }
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const visited = new Set<string>();
  const lines = ['mindmap'];
  const emitFrom = (startId: string): void => {
    const stack: { depth: number; id: string }[] = [{ depth: 0, id: startId }];
    while (stack.length > 0) {
      const { depth, id } = stack.pop() as { depth: number; id: string };
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      const node = nodeById.get(id);
      if (node) {
        lines.push(
          `${'    '.repeat(depth)}${mindmapShape(node.shape, sanitizeLabel(node.label || node.id))}`
        );
      }
      const kids = children.get(id) ?? [];
      for (let i = kids.length - 1; i >= 0; i--) {
        if (!visited.has(kids[i] as string)) {
          stack.push({ depth: depth + 1, id: kids[i] as string });
        }
      }
    }
  };
  const roots = graph.nodes.filter((node) => !parentOf.has(node.id)).map((node) => node.id);
  for (const root of roots) {
    emitFrom(root);
  }
  for (const node of graph.nodes) {
    emitFrom(node.id);
  }
  return `${lines.join('\n')}\n`;
};

const sequenceArrow = (type: VLinkType): string => {
  switch (type) {
    case 'msgDashedFilled': {
      return '-->>';
    }
    case 'msgDashedOpen': {
      return '--)';
    }
    case 'msgSolidOpen': {
      return '->';
    }
    default: {
      return '->>';
    }
  }
};

const generateSequence = (graph: VGraph): string => {
  const lines = ['sequenceDiagram'];
  for (const node of graph.nodes) {
    const keyword = node.shape === 'round' ? 'actor' : 'participant';
    const label = node.label || node.id;
    lines.push(
      label === node.id ? `    ${keyword} ${node.id}` : `    ${keyword} ${node.id} as ${label}`
    );
  }
  for (const edge of graph.edges) {
    const label = edge.label ? `: ${sanitizeLabel(edge.label)}` : '';
    lines.push(`    ${edge.source}${sequenceArrow(edge.type)}${edge.target}${label}`);
  }
  return `${lines.join('\n')}\n`;
};

const generateState = (graph: VGraph): string => {
  const lines = ['stateDiagram-v2'];
  if (graph.direction === 'LR') {
    lines.push('    direction LR');
  }
  const start = graph.nodes.find((node) => node.special === 'start');
  const end = graph.nodes.find((node) => node.special === 'end');
  const startId = start?.id;
  const endId = end?.id;
  // `[*] --> X` transitions are emitted right after the header so the start
  // dot leads the diagram, mirroring conventional state diagrams.
  if (startId) {
    for (const edge of graph.edges.filter((edge) => edge.source === startId)) {
      lines.push(`    [*] --> ${edge.target}`);
    }
  }
  for (const node of graph.nodes) {
    if (node.special) {
      continue;
    }
    const label = node.label || node.id;
    if (label !== node.id) {
      lines.push(`    state "${label.replaceAll('"', '')}" as ${node.id}`);
    }
    for (const line of node.detail ? node.detail.split('\n') : []) {
      lines.push(`    ${node.id} : ${line.trim()}`);
    }
  }
  for (const edge of graph.edges) {
    if (startId && edge.source === startId) {
      continue; // already emitted above
    }
    if (endId && edge.target === endId) {
      lines.push(`    ${edge.source} --> [*]`);
      continue;
    }
    // Links back into the start dot or out of the end dot have no `[*]`
    // syntax; the canvas blocks creating them, generation skips leftovers.
    if ((startId && edge.target === startId) || (endId && edge.source === endId)) {
      continue;
    }
    const label = edge.label ? ` : ${sanitizeLabel(edge.label)}` : '';
    lines.push(`    ${edge.source} --> ${edge.target}${label}`);
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

  const graph: VGraph = { direction, kind: 'flowchart', edges: [], nodes: [] };
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

/** Outer box of a node: detail lines extend the height, special dots are small. */
export const nodeSize = (node: VNode): { h: number; w: number } => {
  if (node.special) {
    return { h: SPECIAL_SIZE, w: SPECIAL_SIZE };
  }
  const lines = node.detail ? node.detail.split('\n').length : 0;
  return { h: NODE_H + lines * DETAIL_LINE_H, w: NODE_W };
};

/** Layered layout (Kahn layering along the flow direction; cycles appended). */
export const layoutGraph = (graph: VGraph): VGraph => {
  const positions = new Map<string, { x: number; y: number }>();

  if ((graph.kind ?? 'flowchart') === 'sequence') {
    // Participants form one row; messages are temporal, not spatial.
    graph.nodes.forEach((node, slot) => {
      positions.set(node.id, { x: MARGIN + slot * (NODE_W + GAP_X), y: MARGIN });
    });
    return withPositions(graph, positions);
  }

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

  // Detail blocks make nodes taller; use the tallest node as the layer stride.
  const stride = Math.max(NODE_H, ...graph.nodes.map((node) => nodeSize(node).h)) + GAP_Y;
  for (const [d, layerIds] of layers) {
    layerIds.forEach((id, slot) => {
      const along = MARGIN + slot * (NODE_W + GAP_X);
      const across = MARGIN + d * stride;
      positions.set(
        id,
        graph.direction === 'TD' ? { x: along, y: across } : { x: across, y: along }
      );
    });
  }

  return withPositions(graph, positions);
};

const withPositions = (graph: VGraph, positions: Map<string, { x: number; y: number }>) => ({
  ...graph,
  nodes: graph.nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) ?? { x: MARGIN, y: MARGIN })
  }))
});

/**
 * Overlay remembered canvas positions (by node id) on top of an auto layout.
 * Mermaid source carries no coordinates, so re-entering the visual editor
 * would otherwise re-layout everything — nodes the user just placed would
 * visibly jump. Cached ids keep their positions; new ids keep whatever the
 * auto layout gave them. This is what makes the canvas WYSIWYG across mode
 * switches (and, when the caller persists the map, across reloads).
 */
export const applyPositions = (
  graph: VGraph,
  positions: Record<string, { x: number; y: number }>
): VGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => {
    const remembered = positions[node.id];
    return remembered ? { ...node, x: remembered.x, y: remembered.y } : node;
  })
});

/**
 * Validate an untrusted persisted position map (localStorage can hold
 * anything — hand-edited, corrupted or written by an older format) down to
 * finite-number entries only. A bad entry would leak NaN into node
 * coordinates and from there into every geometry calculation and SVG
 * attribute on the canvas.
 */
export const sanitizePositions = (raw: unknown): Record<string, { x: number; y: number }> => {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }
  const clean: Record<string, { x: number; y: number }> = {};
  for (const [id, value] of Object.entries(raw)) {
    if (typeof value !== 'object' || value === null) {
      continue;
    }
    const { x, y } = value as { x?: unknown; y?: unknown };
    if (
      typeof x === 'number' &&
      typeof y === 'number' &&
      Number.isFinite(x) &&
      Number.isFinite(y)
    ) {
      clean[id] = { x, y };
    }
  }
  return clean;
};

export const nodeCenter = (node: VNode): { x: number; y: number } => {
  const size = nodeSize(node);
  return { x: node.x + size.w / 2, y: node.y + size.h / 2 };
};

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
  const halfA = { x: nodeSize(source).w / 2, y: nodeSize(source).h / 2 };
  const halfB = { x: nodeSize(target).w / 2, y: nodeSize(target).h / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // s such that a + (dx,dy)*s exits the node's box: min over the two axes.
  const exitParam = (half: { x: number; y: number }, dxF: number, dyF: number): number => {
    const tx = dxF === 0 ? Number.POSITIVE_INFINITY : half.x / Math.abs(dxF);
    const ty = dyF === 0 ? Number.POSITIVE_INFINITY : half.y / Math.abs(dyF);
    return Math.min(tx, ty, 0.5);
  };
  const s1 = exitParam(halfA, dx, dy);
  const s2 = exitParam(halfB, -dx, -dy);
  return {
    x1: a.x + dx * s1,
    x2: b.x - dx * s2,
    y1: a.y + dy * s1,
    y2: b.y - dy * s2
  };
};

// ---------------------------------------------------------------------------
// Multi-kind parsing: detection, dispatch and per-kind importers
// ---------------------------------------------------------------------------

/** Detect the diagram kind from the first non-comment line; undefined when unsupported. */
export const detectDiagramKind = (code: string): DiagramKind | undefined => {
  for (const raw of code.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) {
      continue;
    }
    if (/^(flowchart|graph)\b/i.test(line)) {
      return 'flowchart';
    }
    if (/^sequenceDiagram\b/i.test(line)) {
      return 'sequence';
    }
    if (/^classDiagram\b/i.test(line)) {
      return 'class';
    }
    if (/^stateDiagram\b/i.test(line)) {
      return 'state';
    }
    if (/^erDiagram\b/i.test(line)) {
      return 'er';
    }
    if (/^mindmap\b/i.test(line)) {
      return 'mindmap';
    }
    return undefined;
  }
  return undefined;
};

/** Parse any supported diagram kind; `{ ok: false }` for unsupported families. */
export const parseCode = (code: string): ParsedFlowchart => {
  switch (detectDiagramKind(code)) {
    case 'class': {
      return parseClass(code);
    }
    case 'er': {
      return parseEr(code);
    }
    case 'flowchart': {
      return parseFlowchart(code);
    }
    case 'mindmap': {
      return parseMindmap(code);
    }
    case 'sequence': {
      return parseSequence(code);
    }
    case 'state': {
      return parseState(code);
    }
    default: {
      return { ok: false };
    }
  }
};

// Shared builder bookkeeping for the per-kind importers.
interface GraphBuilder {
  edgeId: () => string;
  graph: VGraph;
  nodeOf: (id: string, label?: string, shape?: VShape) => VNode;
  nodesById: Map<string, VNode>;
  skipped: number;
}

// Line guard: the per-kind regexes are tuned for real diagram statements;
// a hand-crafted megabyte single line makes their lazy quantifiers degrade
// quadratically and freezes the tab. No legitimate line comes close.
const MAX_LINE_LENGTH = 10_000;

const newBuilder = (kind: DiagramKind, direction: 'TD' | 'LR' = 'TD'): GraphBuilder => {
  const graph: VGraph = { direction, kind, edges: [], nodes: [] };
  const nodesById = new Map<string, VNode>();
  let edgeSeq = 0;
  return {
    edgeId: () => `E${++edgeSeq}`,
    graph,
    nodeOf(id, label, shape) {
      const existing = nodesById.get(id);
      if (existing) {
        if (
          shape &&
          existing.shape !== shape &&
          !existing.detail &&
          existing.label === existing.id
        ) {
          existing.shape = shape;
        }
        if (label && existing.label === existing.id) {
          existing.label = label;
        }
        return existing;
      }
      const node: VNode = { id, label: label ?? id, shape: shape ?? 'rect', x: 0, y: 0 };
      nodesById.set(id, node);
      graph.nodes.push(node);
      return node;
    },
    nodesById,
    skipped: 0
  };
};

// --------------------------- sequenceDiagram -------------------------------

const SEQ_ARROW_TYPES: Record<string, VLinkType> = {
  '--)': 'msgDashedOpen',
  '-->>': 'msgDashedFilled',
  '->': 'msgSolidOpen',
  '->>': 'msgSolidFilled'
};

// Lazy source/target quantifiers: with greedy `\S+` the engine prefers a
// longer participant name over a longer arrow token, so `Bob-->>Alice`
// would split as source `Bob-` + arrow `->>`. Lazy groups make the arrow
// match leftmost-longest instead.
const SEQ_MSG_RE = /^(\S*?)\s*(-->>|--\)|->>|->)\s*(\S*?)(?:\s*:\s?(.*))?$/;

const parseSequence = (code: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*sequenceDiagram\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('sequence');

  for (const rawLine of code.slice(header.index + header[0].length).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) {
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const decl = /^(participant|actor)\s+(\S+)(?:\s+as\s+(.*))?$/i.exec(line);
    if (decl) {
      b.nodeOf(
        decl[2] as string,
        (decl[3] as string)?.trim() || (decl[2] as string),
        decl[1].toLowerCase() === 'actor' ? 'round' : 'rect'
      );
      continue;
    }
    const msg = SEQ_MSG_RE.exec(line);
    if (msg) {
      const type = SEQ_ARROW_TYPES[msg[2] as string];
      const sourceId = msg[1] ?? '';
      const targetId = msg[3] ?? '';
      if (type && sourceId && targetId && sourceId !== targetId) {
        const source = b.nodeOf(sourceId);
        const target = b.nodeOf(targetId);
        b.graph.edges.push({
          id: b.edgeId(),
          label: msg[4] ? msg[4].trim() : undefined,
          source: source.id,
          target: target.id,
          type
        });
        continue;
      }
    }
    b.skipped++;
  }
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ----------------------------- classDiagram --------------------------------

const CLASS_REL_RE =
  /^([A-Za-z0-9_]+)\s*(?:"([^"]*)"\s*)?(\.\.\|>|--\||\.\.>|\*--|o--|-->|--|\.\.)\s*(?:"([^"]*)"\s*)?([A-Za-z0-9_]+)\s*(?::\s*(.*))?$/;

const CLASS_REL_TYPES: Record<string, VLinkType> = {
  '*--': 'composition',
  '--': 'line',
  '-->': 'arrow',
  '--|>': 'inheritance',
  '..': 'dashedLine',
  '..>': 'dashedArrow',
  '..|>': 'realization',
  'o--': 'aggregation'
};

const parseClass = (code: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*classDiagram\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('class');
  let inBlockOf: VNode | undefined;

  for (const rawLine of code.slice(header.index + header[0].length).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) {
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (inBlockOf) {
      if (line === '}') {
        inBlockOf = undefined;
      } else {
        inBlockOf.detail = inBlockOf.detail ? `${inBlockOf.detail}\n${line}` : line;
      }
      continue;
    }
    if (/^direction\s+(LR|RL)\b/i.test(line)) {
      b.graph.direction = 'LR';
      continue;
    }
    if (/^direction\s+(TD|TB|BT)\b/i.test(line)) {
      b.graph.direction = 'TD';
      continue;
    }
    const decl = /^class\s+([A-Za-z0-9_]+)(?:\s*\[\s*"([^"]*)"\s*\])?\s*(\{)?$/.exec(line);
    if (decl) {
      const node = b.nodeOf(decl[1] as string, decl[2]?.trim() || (decl[1] as string));
      if (decl[3]) {
        inBlockOf = node;
        node.detail = '';
      }
      continue;
    }
    const rel = CLASS_REL_RE.exec(line);
    if (rel) {
      const type = CLASS_REL_TYPES[rel[3] as string];
      const source = b.nodeOf(rel[1] as string);
      const target = b.nodeOf(rel[5] as string);
      if (type && source.id !== target.id) {
        b.graph.edges.push({
          cardL: rel[2] || undefined,
          cardR: rel[4] || undefined,
          id: b.edgeId(),
          label: rel[6]?.trim() || undefined,
          source: source.id,
          target: target.id,
          type
        });
        continue;
      }
    }
    b.skipped++;
  }
  // Class members round-trip as `class X { }` blocks; an empty block on a
  // parsed node means the source had an empty block — keep detail undefined.
  for (const node of b.graph.nodes) {
    if (node.detail === '') {
      node.detail = undefined;
    }
  }
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ----------------------------- stateDiagram --------------------------------

const STATE_ID = '[A-Za-z][A-Za-z0-9_]*';

const parseState = (code: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*stateDiagram(-v2)?\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('state');
  const specialNode = (kind: 'end' | 'start'): VNode => {
    const id = kind === 'start' ? '__start__' : '__end__';
    const existing = b.nodesById.get(id);
    if (existing) {
      return existing;
    }
    const node: VNode = {
      id,
      label: kind === 'start' ? '起点' : '终点',
      shape: 'rect',
      special: kind,
      x: 0,
      y: 0
    };
    b.nodesById.set(id, node);
    b.graph.nodes.unshift(node);
    return node;
  };

  let inComposite = 0;
  let inNote = false;

  for (const rawLine of code.slice(header.index + header[0].length).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) {
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (inNote) {
      b.skipped++;
      if (/^end\s*note$/i.test(line)) {
        inNote = false;
      }
      continue;
    }
    if (inComposite > 0) {
      b.skipped++;
      for (const ch of line) {
        if (ch === '{') {
          inComposite++;
        }
        if (ch === '}') {
          inComposite--;
        }
      }
      continue;
    }
    if (/^direction\s+(LR|RL)\b/i.test(line)) {
      b.graph.direction = 'LR';
      continue;
    }
    if (/^direction\s+(TD|TB|BT)\b/i.test(line)) {
      b.graph.direction = 'TD';
      continue;
    }
    const startEdge = new RegExp('^\\[\\*\\]\\s*-+>\\s*(' + STATE_ID + ')$').exec(line);
    if (startEdge) {
      const target = b.nodeOf(startEdge[1] as string);
      b.graph.edges.push({
        id: b.edgeId(),
        source: specialNode('start').id,
        target: target.id,
        type: 'arrow'
      });
      continue;
    }
    const endEdge = new RegExp('^(' + STATE_ID + ')\\s*-+>\\s*\\[\\*\\]$').exec(line);
    if (endEdge) {
      const source = b.nodeOf(endEdge[1] as string);
      b.graph.edges.push({
        id: b.edgeId(),
        source: source.id,
        target: specialNode('end').id,
        type: 'arrow'
      });
      continue;
    }
    const named = new RegExp('^state\\s+"([^"]*)"\\s+as\\s+(' + STATE_ID + ')$').exec(line);
    if (named) {
      b.nodeOf(named[2] as string, (named[1] as string).trim());
      continue;
    }
    if (new RegExp('^state\\s+(' + STATE_ID + ')?\\s*\\{').test(line)) {
      // Composite state bodies are not representable; skip the whole block.
      inComposite = 1;
      b.skipped++;
      continue;
    }
    const plainState = new RegExp('^state\\s+(' + STATE_ID + ')$').exec(line);
    if (plainState) {
      b.nodeOf(plainState[1] as string);
      continue;
    }
    if (/^note\b/.test(line)) {
      inNote = true;
      b.skipped++;
      continue;
    }
    const transition = new RegExp(
      '^(' + STATE_ID + ')\\s*(-+>)\\s*(' + STATE_ID + ')\\s*(?::\\s*(.*))?$'
    ).exec(line);
    if (transition) {
      const source = b.nodeOf(transition[1] as string);
      const target = b.nodeOf(transition[3] as string);
      if (source.id !== target.id) {
        b.graph.edges.push({
          id: b.edgeId(),
          label: transition[4]?.trim() || undefined,
          source: source.id,
          target: target.id,
          type: 'arrow'
        });
        continue;
      }
    }
    const description = new RegExp('^(' + STATE_ID + ')\\s*:\\s*(.*)$').exec(line);
    if (description) {
      const node = b.nodeOf(description[1] as string);
      node.detail = node.detail ? node.detail + '\n' + description[2] : (description[2] as string);
      continue;
    }
    b.skipped++;
  }
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ------------------------------- erDiagram ---------------------------------

const ER_REL_RE = /^([A-Za-z0-9_]+)\s+(\S+)\s+([A-Za-z0-9_]+)\s*(?::\s*(.*))?$/;
const ER_CARD_RE = /^([|}o{x0-9]*)(--|\.\.)([|}o{x0-9]*)$/;

const parseEr = (code: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*erDiagram\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('er');
  let inBlockOf: VNode | undefined;

  for (const rawLine of code.slice(header.index + header[0].length).split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('%%')) {
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (inBlockOf) {
      if (line === '}') {
        inBlockOf = undefined;
      } else {
        inBlockOf.detail = inBlockOf.detail ? inBlockOf.detail + '\n' + line : line;
      }
      continue;
    }
    const block = /^([A-Za-z0-9_]+)\s*\{\s*$/.exec(line);
    if (block) {
      const node = b.nodeOf(block[1] as string);
      inBlockOf = node;
      node.detail = '';
      continue;
    }
    const rel = ER_REL_RE.exec(line);
    if (rel) {
      const card = ER_CARD_RE.exec(rel[2] as string);
      if (card) {
        const source = b.nodeOf(rel[1] as string);
        const target = b.nodeOf(rel[3] as string);
        if (source.id !== target.id) {
          b.graph.edges.push({
            cardL: card[1] || undefined,
            cardR: card[3] || undefined,
            id: b.edgeId(),
            label: rel[4]?.trim() || undefined,
            source: source.id,
            target: target.id,
            type: card[2] === '..' ? 'dashedLine' : 'line'
          });
          continue;
        }
      }
    }
    b.skipped++;
  }
  for (const node of b.graph.nodes) {
    if (node.detail === '') {
      node.detail = undefined;
    }
  }
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// -------------------------------- mindmap ----------------------------------

const parseMindmap = (code: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*mindmap\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('mindmap');

  // First pass: collect indent + parsed content per line. Mindmap node lines
  // may carry an id prefix (`root((Deep Root))`); the id is not part of the
  // model (structure comes from the indent tree), only label + shape are.
  const entries: { content: { label: string; shape: VShape }; indent: number }[] = [];
  for (const rawLine of code.slice(header.index + header[0].length).split('\n')) {
    const line = rawLine.replace(/\t/g, ' ').trimEnd();
    if (!line.trim() || line.trim().startsWith('%%')) {
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    // Strip a leading id when directly followed by a shape delimiter.
    const text = line.trim().replace(/^[A-Za-z0-9_-]+(?=[[({])/, '');
    let parsed: { label: string; shape: VShape };
    const stadium = /^\(\((.*)\)\)$/.exec(text);
    const diamond = /^\{\{(.*)\}\}$/.exec(text);
    const round = /^\((.*)\)$/.exec(text);
    const rect = /^\[(.*)\]$/.exec(text);
    if (stadium) {
      parsed = { label: stadium[1]?.trim() ?? text, shape: 'stadium' };
    } else if (diamond) {
      parsed = { label: diamond[1]?.trim() ?? text, shape: 'diamond' };
    } else if (round) {
      parsed = { label: round[1]?.trim() ?? text, shape: 'round' };
    } else if (rect) {
      parsed = { label: rect[1]?.trim() ?? text, shape: 'rect' };
    } else {
      // Bare ids are the mindmap default shape (rounded).
      parsed = { label: line.trim(), shape: 'round' };
    }
    entries.push({ content: parsed, indent });
  }
  if (entries.length === 0) {
    return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
  }

  // Second pass: mint nodes in order and link via the indent stack. The
  // stack pops on outdent (raw indent comparison), so each line's parent is
  // the nearest strictly-shallower predecessor — ragged indents still yield
  // a well-formed tree without depth normalization.
  const stack: { indent: number; node: VNode }[] = [];
  let seq = 0;
  for (const entry of entries) {
    const node: VNode = {
      id: 'M' + ++seq,
      label: entry.content.label,
      shape: entry.content.shape,
      x: 0,
      y: 0
    };
    b.nodesById.set(node.id, node);
    b.graph.nodes.push(node);
    while (
      stack.length > 0 &&
      (stack[stack.length - 1] as { indent: number }).indent >= entry.indent
    ) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) {
      b.graph.edges.push({
        id: b.edgeId(),
        source: parent.node.id,
        target: node.id,
        type: 'line'
      });
    }
    stack.push({ indent: entry.indent, node });
  }
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};
