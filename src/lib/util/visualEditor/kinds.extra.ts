/**
 * Extra diagram kinds for the visual editor: parse/generate for every
 * remaining Mermaid diagram family (27 kinds on top of the six in model.ts).
 * Type-only imports from model.ts keep this module cycle-free at runtime.
 *
 * Modeling conventions shared by these kinds:
 * - `VNode.role` carries the per-kind node type keyword (`Person` for C4,
 *   `section` for journey, `axis` for radar, …) — new nodes get it from the
 *   kind's nodeTypes palette.
 * - `VNode.roleData` is a single string payload whose meaning is defined per
 *   kind: branch name for git commits, `[x, y]` coordinates for quadrant /
 *   wardley points, span for block columns. `VEdge.role` / `VEdge.roleData`
 *   carry the relation keyword (requirement) and port spec (architecture).
 * - Grouped-list kinds (journey, timeline, kanban, gantt, cynefin) keep their
 *   group→item structure in plain edges so the layered canvas layout works;
 *   generation is pure — orphan items are emitted under a virtual last group
 *   without mutating the graph.
 * - Coordinate kinds (quadrant, wardley) are position-driven WYSIWYG: parse
 *   turns `[x, y]` into a canvas position, generation reads the position back
 *   out — the Mermaid code itself is the position memory, so the component
 *   skips the remembered-position overlay for them.
 */

import type { DiagramKind, ParsedFlowchart, VGraph, VLinkType, VNode, VShape } from './model';

// ---------------------------------------------------------------------------
// Shared helpers (self-contained to avoid a runtime import cycle with model.ts)
// ---------------------------------------------------------------------------

interface Builder {
  edgeId: () => string;
  graph: VGraph;
  nodeOf: (id: string, label?: string, shape?: VShape) => VNode;
  skipped: number;
}

const MAX_LINE_LENGTH = 10_000;

const newBuilder = (kind: DiagramKind, direction: 'TD' | 'LR' = 'TD'): Builder => {
  const graph: VGraph = { direction, kind, edges: [], nodes: [] };
  const nodesById = new Map<string, VNode>();
  let edgeSeq = 0;
  return {
    edgeId: () => `E${++edgeSeq}`,
    graph,
    nodeOf(id, label, shape) {
      const existing = nodesById.get(id);
      if (existing) {
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
    skipped: 0
  };
};

/** Strips characters that would break the host syntax (quotes, newlines). */
const plainLabel = (label: string): string =>
  label
    .replaceAll('"', '')
    .replaceAll(`'`, '')
    .replaceAll(/[\r\n]+/g, ' ')
    .trim();

/** Identifier-safe text for kinds whose names are unquoted tokens. */
const identLabel = (label: string): string =>
  label.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'N1';

/** CSV-cell-safe text for sankey (commas are separators there). */
const csvLabel = (label: string): string => plainLabel(label).replaceAll(',', '');

const quoted = (label: string): string => `"${plainLabel(label)}"`;

const bodyLines = (code: string): string[] =>
  code
    .split('\n')
    .map((raw) => raw.trim())
    .filter((line) => line !== '' && !line.startsWith('%%'));

/** Coordinate canvas shared by quadrant / wardley (position ↔ [0..1] mapping). */
export const COORD_MARGIN = 80;
export const COORD_AREA_W = 1840;
export const COORD_AREA_H = 1240;

const parseCoords = (raw: string | undefined): { x: number; y: number } | undefined => {
  const m = /^\[([^\]]*)\]$/.exec(raw ?? '');
  if (!m) {
    return undefined;
  }
  const parts = (m[1] as string).split(',');
  const x = Number.parseFloat((parts[0] ?? '').trim());
  const y = Number.parseFloat((parts[1] ?? '').trim());
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y };
  }
  return undefined;
};

const round2 = (v: number): number => Math.round(v * 100) / 100;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Position of a coordinate node → normalized [0..1] pair for generation. */
const coordsOfNode = (node: VNode): { x: number; y: number } => ({
  x: clamp01(round2((node.x - COORD_MARGIN) / COORD_AREA_W)),
  y: clamp01(round2((node.y - COORD_MARGIN) / COORD_AREA_H))
});

const nodeById = (graph: VGraph, id: string): VNode | undefined =>
  graph.nodes.find((n) => n.id === id);

/**
 * Pure group→item view for grouped-list kinds: group nodes in node order,
 * their item ids in edge order, orphan items attached to a virtual last group.
 * Never mutates the graph (it runs inside derived computations).
 */
const groupedEmit = (
  graph: VGraph,
  groupRole: string,
  fallbackLabel: string
): {
  groups: { id: string | undefined; label: string }[];
  itemsOf: (id: string | undefined) => string[];
} => {
  const groupNodes = graph.nodes.filter((n) => n.role === groupRole);
  const ids = new Set(groupNodes.map((n) => n.id));
  const items = new Map<string, string[]>();
  const grouped = new Set<string>();
  for (const edge of graph.edges) {
    // Edges between two group nodes are authored transitions (cynefin), not
    // group membership.
    if (
      ids.has(edge.source) &&
      !ids.has(edge.target) &&
      edge.source !== edge.target &&
      !grouped.has(edge.target)
    ) {
      items.set(edge.source, [...(items.get(edge.source) ?? []), edge.target]);
      grouped.add(edge.target);
    }
  }
  const orphans = graph.nodes.filter((n) => !ids.has(n.id) && !grouped.has(n.id)).map((n) => n.id);
  const groups: { id: string | undefined; label: string }[] = groupNodes.map((n) => ({
    id: n.id,
    label: n.label || n.id
  }));
  if (groups.length === 0) {
    if (orphans.length > 0) {
      groups.push({ id: undefined, label: fallbackLabel });
    }
  } else {
    const last = groups[groups.length - 1] as { id: string };
    items.set(last.id, [...(items.get(last.id) ?? []), ...orphans]);
  }
  return {
    groups,
    itemsOf: (id) => (id === undefined ? [] : (items.get(id) ?? []))
  };
};

// ---------------------------------------------------------------------------
// Grouped-list kinds: pie, journey, timeline, kanban, gantt, cynefin
// ---------------------------------------------------------------------------

const generatePie = (graph: VGraph): string => {
  const header = graph.title ? `pie title ${plainLabel(graph.title)}` : 'pie';
  const lines = [header];
  for (const node of graph.nodes) {
    lines.push(`    ${quoted(node.label || node.id)}: ${node.detail?.trim() || '1'}`);
  }
  return `${lines.join('\n')}\n`;
};

const parsePie = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*pie\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('pie');
  let seq = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    const slice = /^"?([^":]*)"?\s*:\s*(.+)$/.exec(line);
    if (slice) {
      const node = b.nodeOf(`S${++seq}`, (slice[1] as string).trim() || `切片${seq}`);
      node.detail = (slice[2] as string).trim();
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ------------------------------- journey -----------------------------------

const generateJourney = (graph: VGraph): string => {
  const lines = ['journey'];
  if (graph.title) {
    lines.push(`    title ${plainLabel(graph.title)}`);
  }
  const { groups, itemsOf } = groupedEmit(graph, 'section', '新分组');
  const labelOf = (id: string): string =>
    plainLabel(nodeById(graph, id)?.label || id).replaceAll(':', ' ');
  for (const group of groups) {
    lines.push(`    section ${plainLabel(group.label)}`);
    for (const itemId of itemsOf(group.id)) {
      const node = nodeById(graph, itemId);
      const detail = node?.detail?.trim() || '5';
      lines.push(`        ${labelOf(itemId)}: ${detail}`);
    }
  }
  return `${lines.join('\n')}\n`;
};

const parseJourney = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*journey\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('journey');
  let section: VNode | undefined;
  let seq = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    const sectionLine = /^section\s+(.*)$/.exec(line);
    if (sectionLine) {
      section = b.nodeOf(`G${++seq}`, (sectionLine[1] as string).trim() || `分组${seq}`);
      section.role = 'section';
      continue;
    }
    const task = /^([^:]+):\s*(\d+(?:\.\d+)?)(?:\s*:\s*(.*))?$/.exec(line);
    if (task) {
      const taskNode = b.nodeOf(`T${++seq}`, (task[1] as string).trim() || `任务${seq}`);
      taskNode.role = 'task';
      taskNode.detail = task[3]
        ? `${task[2] as string}: ${(task[3] as string).trim()}`
        : (task[2] as string);
      if (section) {
        b.graph.edges.push({
          id: b.edgeId(),
          source: section.id,
          target: taskNode.id,
          type: 'line'
        });
      }
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ------------------------------- timeline ----------------------------------

const generateTimeline = (graph: VGraph): string => {
  const lines = ['timeline'];
  if (graph.title) {
    lines.push(`    title ${plainLabel(graph.title)}`);
  }
  const { groups, itemsOf } = groupedEmit(graph, 'period', '时期');
  const labelOf = (id: string): string =>
    plainLabel(nodeById(graph, id)?.label || id).replaceAll(':', ' ');
  for (const group of groups) {
    const events = itemsOf(group.id).map(labelOf).join(' : ');
    lines.push(`    ${plainLabel(group.label)}${events ? ` : ${events}` : ''}`);
  }
  return `${lines.join('\n')}\n`;
};

const parseTimeline = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*timeline\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('timeline');
  let period: VNode | undefined;
  let seq = 0;
  const addEvent = (text: string): void => {
    const node = b.nodeOf(`E${++seq}`, text.trim() || `事件${seq}`);
    node.role = 'event';
    if (period) {
      b.graph.edges.push({
        id: b.edgeId(),
        source: period.id,
        target: node.id,
        type: 'line'
      });
    }
  };
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    const parts = line.split(':').map((p) => p.trim());
    if (parts.length >= 2) {
      if ((parts[0] as string) !== '') {
        period = b.nodeOf(`P${++seq}`, parts[0] as string);
        period.role = 'period';
      }
      for (const event of parts.slice(1)) {
        if (event !== '') {
          addEvent(event);
        }
      }
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// -------------------------------- kanban -----------------------------------

const generateKanban = (graph: VGraph): string => {
  const lines = ['kanban'];
  const { groups, itemsOf } = groupedEmit(graph, 'column', '新列表');
  for (const group of groups) {
    // Columns must sit at the left margin — the parser tells them apart from
    // tickets purely by indentation.
    lines.push(`${group.id ?? 'group'}[${plainLabel(group.label)}]`);
    for (const itemId of itemsOf(group.id)) {
      const node = nodeById(graph, itemId);
      const tail = node?.detail?.trim() ?? '';
      lines.push(`  ${itemId}[${plainLabel(node?.label || itemId)}]${tail}`);
    }
  }
  return `${lines.join('\n')}\n`;
};

const parseKanban = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*kanban\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('kanban');
  let column: VNode | undefined;
  for (const raw of code.slice(header.index + header[0].length).split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('%%')) {
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const m = /^([A-Za-z0-9_-]+)\[([^\]]*)\](@\{[^}]*\})?$/.exec(line);
    if (!m) {
      b.skipped++;
      continue;
    }
    // Columns sit at the left margin, tickets are indented under them.
    const isColumn = /^\S/.test(raw);
    if (isColumn) {
      const node = b.nodeOf(m[1] as string, (m[2] as string).trim() || (m[1] as string));
      node.role = 'column';
      column = node;
      continue;
    }
    const node = b.nodeOf(m[1] as string, (m[2] as string).trim() || (m[1] as string));
    node.role = 'ticket';
    node.detail = m[3]?.trim() || undefined;
    if (column) {
      b.graph.edges.push({
        id: b.edgeId(),
        source: column.id,
        target: node.id,
        type: 'line'
      });
    } else {
      b.skipped++;
    }
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// --------------------------------- gantt -----------------------------------

const generateGantt = (graph: VGraph): string => {
  const lines = ['gantt'];
  if (graph.title) {
    lines.push(`    title ${plainLabel(graph.title)}`);
  }
  const dateFormat = graph.meta?.dateFormat?.trim();
  if (dateFormat) {
    lines.push(`    dateFormat ${dateFormat.replaceAll(/[\r\n]/g, ' ')}`);
  }
  const { groups, itemsOf } = groupedEmit(graph, 'section', '新阶段');
  for (const group of groups) {
    lines.push(`    section ${plainLabel(group.label).replaceAll(':', ' ')}`);
    for (const itemId of itemsOf(group.id)) {
      const node = nodeById(graph, itemId);
      const name = plainLabel(node?.label || itemId).replaceAll(':', ' ');
      const tail = node?.detail?.trim().replaceAll(/[\r\n]+/g, ', ');
      lines.push(`        ${name} :${tail || '2024-01-01, 1d'}`);
    }
  }
  return `${lines.join('\n')}\n`;
};

const parseGantt = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*gantt\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('gantt');
  let section: VNode | undefined;
  let seq = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    const dateFormat = /^dateFormat\s+(\S+)$/.exec(line);
    if (dateFormat) {
      b.graph.meta = { ...b.graph.meta, dateFormat: dateFormat[1] as string };
      continue;
    }
    const sectionLine = /^section\s+(.*)$/.exec(line);
    if (sectionLine) {
      section = b.nodeOf(`G${++seq}`, (sectionLine[1] as string).trim() || `阶段${seq}`);
      section.role = 'section';
      continue;
    }
    const task = /^([^:]+?)\s*:\s*(.+)$/.exec(line);
    if (task) {
      const node = b.nodeOf(`T${++seq}`, (task[1] as string).trim() || `任务${seq}`);
      node.role = 'task';
      node.detail = (task[2] as string).trim();
      if (section) {
        b.graph.edges.push({
          id: b.edgeId(),
          source: section.id,
          target: node.id,
          type: 'line'
        });
      }
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// -------------------------------- cynefin ----------------------------------

const CYNEFIN_DOMAINS = ['complex', 'complicated', 'clear', 'chaotic', 'confusion'] as const;

const generateCynefin = (graph: VGraph): string => {
  const lines = ['cynefin-beta'];
  if (graph.title) {
    lines.push(`  title ${plainLabel(graph.title)}`);
  }
  const { groups, itemsOf } = groupedEmit(graph, 'domain', 'complex');
  // The domain keyword lives in roleData (fixed vocabulary); label is display.
  const domainOf = (id: string): string => {
    const node = nodeById(graph, id);
    const raw = node?.roleData || node?.label || id;
    return CYNEFIN_DOMAINS.includes(raw as (typeof CYNEFIN_DOMAINS)[number]) ? raw : 'complex';
  };
  for (const group of groups) {
    lines.push(`  ${domainOf(group.id as string)}`);
    for (const itemId of itemsOf(group.id)) {
      lines.push(`    ${quoted(nodeById(graph, itemId)?.label || itemId)}`);
    }
  }
  for (const edge of graph.edges) {
    const source = nodeById(graph, edge.source);
    const target = nodeById(graph, edge.target);
    // Only domain→domain transitions are authored edges; domain→item edges
    // are the structural group membership re-emitted above.
    if (source?.role === 'domain' && target?.role === 'domain') {
      const label = edge.label ? ` : ${quoted(edge.label)}` : '';
      lines.push(`  ${domainOf(edge.source)} --> ${domainOf(edge.target)}${label}`);
    }
  }
  return `${lines.join('\n')}\n`;
};

const parseCynefin = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*cynefin-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('cynefin');
  let domain: VNode | undefined;
  let seq = 0;
  const domainAlternation = CYNEFIN_DOMAINS.join('|');
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    const domainLine = new RegExp(`^(${domainAlternation})$`).exec(line);
    if (domainLine) {
      const name = domainLine[1] as string;
      domain = b.nodeOf(`D_${name}`, name);
      domain.role = 'domain';
      domain.roleData = name;
      continue;
    }
    const item = /^"([^"]*)"$/.exec(line);
    if (item && domain) {
      const node = b.nodeOf(`I${++seq}`, (item[1] as string).trim() || `条目${seq}`);
      node.role = 'item';
      b.graph.edges.push({
        id: b.edgeId(),
        source: domain.id,
        target: node.id,
        type: 'line'
      });
      continue;
    }
    const transition = new RegExp(
      `^(${domainAlternation})\\s*-->\\s*(${domainAlternation})(?:\\s*:\\s*"?([^"]*?)"?)?$`
    ).exec(line);
    if (transition) {
      const source = b.nodeOf(`D_${transition[1] as string}`, transition[1] as string);
      source.role = 'domain';
      source.roleData = transition[1] as string;
      const target = b.nodeOf(`D_${transition[2] as string}`, transition[2] as string);
      target.role = 'domain';
      target.roleData = transition[2] as string;
      b.graph.edges.push({
        id: b.edgeId(),
        label: transition[3]?.trim() || undefined,
        source: source.id,
        target: target.id,
        type: 'arrow'
      });
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ---------------------------------------------------------------------------
// Axis / series kinds: radar, xychart, packet, venn, eventmodeling
// ---------------------------------------------------------------------------

const generateRadar = (graph: VGraph): string => {
  const lines = ['radar-beta'];
  for (const node of graph.nodes) {
    if (node.role === 'axis') {
      const token = node.roleData || node.id;
      const label = plainLabel(node.label || token);
      lines.push(`  axis ${identLabel(token)}[${quoted(label === token ? token : label)}]`);
    }
  }
  for (const node of graph.nodes) {
    if (node.role === 'curve') {
      const token = node.roleData || node.id;
      const label = plainLabel(node.label || token);
      const name = label === token ? '' : `[${quoted(label)}]`;
      const values = node.detail?.trim().replaceAll(/[\r\n]+/g, ', ') || '0';
      lines.push(`  curve ${identLabel(token)}${name}{${values}}`);
    }
  }
  const meta = graph.meta ?? {};
  if (meta.max) {
    lines.push(`  max ${meta.max}`);
  }
  if (meta.min) {
    lines.push(`  min ${meta.min}`);
  }
  return `${lines.join('\n')}\n`;
};

const parseRadar = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*radar-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('radar');
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const axis = /^axis\s+(.+)$/.exec(line);
    if (axis) {
      for (const entry of (axis[1] as string).split(',')) {
        const m = /^([A-Za-z0-9_-]+)\["?([^"\]]*)"?\]$/.exec(entry.trim());
        if (m) {
          // Axis and curve tokens live in separate mermaid namespaces (the
          // official examples reuse ids across both); prefix internally.
          const node = b.nodeOf(
            `AX_${m[1] as string}`,
            (m[2] as string).trim() || (m[1] as string)
          );
          node.role = 'axis';
          node.roleData = m[1] as string;
        }
      }
      continue;
    }
    const curve = /^curve\s+([A-Za-z0-9_-]+)(?:\["?([^"\]]*)"?\])?\{([^}]*)\}$/.exec(line);
    if (curve) {
      const node = b.nodeOf(
        `CV_${curve[1] as string}`,
        (curve[2] ?? '').trim() || (curve[1] as string)
      );
      node.role = 'curve';
      node.roleData = curve[1] as string;
      node.detail = (curve[3] as string).trim();
      continue;
    }
    const max = /^max\s+(\S+)$/.exec(line);
    if (max) {
      b.graph.meta = { ...b.graph.meta, max: max[1] as string };
      continue;
    }
    const min = /^min\s+(\S+)$/.exec(line);
    if (min) {
      b.graph.meta = { ...b.graph.meta, min: min[1] as string };
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const generateXychart = (graph: VGraph): string => {
  const lines = ['xychart-beta'];
  if (graph.title) {
    lines.push(`    title ${quoted(graph.title)}`);
  }
  for (const node of graph.nodes) {
    if (node.role === 'xaxis') {
      const label = node.label && node.label !== node.id ? `${quoted(node.label)} ` : '';
      lines.push(`    x-axis ${label}[${node.detail?.trim() || 'a'}]`);
    }
  }
  for (const node of graph.nodes) {
    if (node.role === 'yaxis') {
      const label = node.label && node.label !== node.id ? `${quoted(node.label)} ` : '';
      lines.push(`    y-axis ${label}${node.detail?.trim() || '0 --> 1'}`);
    }
  }
  for (const node of graph.nodes) {
    if (node.role === 'bar' || node.role === 'line') {
      lines.push(`    ${node.role} [${node.detail?.trim() || '0'}]`);
    }
  }
  return `${lines.join('\n')}\n`;
};

const parseXychart = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*xychart-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('xychart');
  let seq = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const title = /^title\s+"?([^"]*?)"?$/.exec(line);
    if (title) {
      b.graph.title = (title[1] as string).trim();
      continue;
    }
    const xaxis = /^x-axis\s+(?:"([^"]*)"\s+)?\[([^\]]*)\]$/.exec(line);
    if (xaxis) {
      const node = b.nodeOf(`X${++seq}`, (xaxis[1] ?? '').trim() || '横轴');
      node.role = 'xaxis';
      node.detail = (xaxis[2] as string).trim();
      continue;
    }
    const yaxis = /^y-axis\s+(?:"([^"]*)"\s+)?(.+)$/.exec(line);
    if (yaxis && !/\[[^\]]*\]/.test(yaxis[2] ?? '')) {
      const node = b.nodeOf(`Y${++seq}`, (yaxis[1] ?? '').trim() || '纵轴');
      node.role = 'yaxis';
      node.detail = (yaxis[2] as string).trim();
      continue;
    }
    const series = /^(bar|line)\s+\[([^\]]*)\]$/.exec(line);
    if (series) {
      const node = b.nodeOf(
        `${(series[1] as string) === 'bar' ? 'B' : 'L'}${++seq}`,
        series[1] === 'bar' ? '柱状' : '折线'
      );
      node.role = series[1] as string;
      node.detail = (series[2] as string).trim();
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const nextRange = (detail: string | undefined): string => {
  const m = /^(\d+)-(\d+)$/.exec(detail?.trim() ?? '');
  if (m) {
    const start = Number.parseInt(m[2] as string, 10) + 1;
    return `${start}-${start + 7}`;
  }
  return '0-7';
};

const generatePacket = (graph: VGraph): string => {
  const lines = ['packet-beta'];
  for (const node of graph.nodes) {
    const range = node.detail?.trim() || nextRange(undefined);
    lines.push(`    ${range}: ${quoted(node.label || node.id)}`);
  }
  return `${lines.join('\n')}\n`;
};

const parsePacket = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*packet(?:-beta)?\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('packet');
  let seq = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const field = /^(\d+(?:-\d+)?)\s*:\s*"?([^"]*?)"?$/.exec(line);
    if (field) {
      const node = b.nodeOf(`F${++seq}`, (field[2] as string).trim() || `字段${seq}`);
      node.detail = field[1] as string;
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const generateVenn = (graph: VGraph): string => {
  const lines = ['venn-beta'];
  if (graph.title) {
    lines.push(`    title ${quoted(graph.title)}`);
  }
  for (const node of graph.nodes) {
    if (node.role === 'set') {
      lines.push(`    set ${plainLabel(node.label || node.id)}`);
    }
  }
  for (const node of graph.nodes) {
    if (node.role === 'union') {
      const members = node.roleData?.trim() || plainLabel(node.label || node.id);
      lines.push(
        `    union ${members.replaceAll(/[[\]"]/g, '')}[${quoted(node.label || node.id)}]`
      );
    }
  }
  return `${lines.join('\n')}\n`;
};

const parseVenn = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*venn-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('venn');
  let seq = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const title = /^title\s+"?([^"]*?)"?$/.exec(line);
    if (title) {
      b.graph.title = (title[1] as string).trim();
      continue;
    }
    const set = /^set\s+(.+)$/.exec(line);
    if (set) {
      const node = b.nodeOf(`S${++seq}`, (set[1] as string).trim() || `集合${seq}`);
      node.role = 'set';
      continue;
    }
    const union = /^union\s+([^[{]+)(?:\["?([^"\]]*)"?\])?$/.exec(line);
    if (union) {
      const node = b.nodeOf(`U${++seq}`, (union[2] ?? '').trim() || `交集${seq}`);
      node.role = 'union';
      node.roleData = (union[1] as string).trim();
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const EM_ROLES = ['ui', 'cmd', 'evt', 'rmo'] as const;

const generateEventmodeling = (graph: VGraph): string => {
  const lines = ['eventmodeling'];
  for (const node of graph.nodes) {
    const role = (EM_ROLES as readonly string[]).includes(node.role ?? '') ? node.role : 'ui';
    const label = identLabel(node.label || node.id);
    const link = role === 'rmo' && node.roleData ? ` ->> ${identLabel(node.roleData)}` : '';
    lines.push(`tf ${identLabel(node.id)} ${role} ${label}${link}`);
  }
  return `${lines.join('\n')}\n`;
};

const parseEventmodeling = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*eventmodeling\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('eventmodeling');
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const m = /^tf\s+(\S+)\s+(ui|cmd|evt|rmo)\s+(\S+)(?:\s+->>\s+(\S+))?$/.exec(line);
    if (m) {
      const node = b.nodeOf(m[1] as string, m[3] as string);
      node.role = m[2] as string;
      if (m[4]) {
        node.roleData = m[4] as string;
        b.graph.edges.push({
          id: b.edgeId(),
          source: node.id,
          target: m[4] as string,
          type: 'arrow'
        });
      }
      continue;
    }
    b.skipped++;
  }
  // rmo links may point forward; mint placeholder nodes for unknown targets so
  // the edge (and generation `->> id`) keeps a real node to attach to.
  for (const edge of [...b.graph.edges]) {
    if (!nodeById(b.graph, edge.target)) {
      b.nodeOf(edge.target, edge.target).role = 'evt';
    }
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ---------------------------------------------------------------------------
// Tree kinds: treeView, treemap, ishikawa, swimlane
// ---------------------------------------------------------------------------

interface TreeEntry {
  label: string;
  value?: string;
  indent: number;
}

const treeEntries = (
  code: string,
  from: number,
  transform: (text: string) => { label: string; value?: string }
): { entries: TreeEntry[]; skipped: number } => {
  const entries: TreeEntry[] = [];
  let skipped = 0;
  for (const raw of code.slice(from).split('\n')) {
    const line = raw.replace(/\t/g, '  ').trimEnd();
    const text = line.trim();
    if (!text || text.startsWith('%%')) {
      continue;
    }
    if (line.length > MAX_LINE_LENGTH) {
      skipped++;
      continue;
    }
    const indent = line.length - text.length;
    const { label, value } = transform(text);
    entries.push({ indent, label, value });
  }
  return { entries, skipped };
};

const mintTree = (b: Builder, entries: TreeEntry[], prefix: string): void => {
  const stack: { indent: number; node: VNode }[] = [];
  let seq = 0;
  for (const entry of entries) {
    const node: VNode = {
      id: `${prefix}${++seq}`,
      label: entry.label,
      shape: 'rect',
      x: 0,
      y: 0
    };
    if (entry.value !== undefined) {
      node.detail = entry.value;
    }
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
};

/** Rebuild a tree from parent→child edges and emit one indented line per node. */
const emitTree = (graph: VGraph, lineOf: (node: VNode) => string): string[] => {
  const children = new Map<string, string[]>();
  const parentOf = new Map<string, string>();
  for (const edge of graph.edges) {
    if (edge.source !== edge.target && !parentOf.has(edge.target)) {
      children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
      parentOf.set(edge.target, edge.source);
    }
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node] as const));
  const lines: string[] = [];
  const visited = new Set<string>();
  const emitFrom = (startId: string): void => {
    const stack: { depth: number; id: string }[] = [{ depth: 0, id: startId }];
    while (stack.length > 0) {
      const { depth, id } = stack.pop() as { depth: number; id: string };
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      const node = byId.get(id);
      if (node) {
        lines.push(`${'    '.repeat(depth)}${lineOf(node)}`);
      }
      const kids = children.get(id) ?? [];
      for (let i = kids.length - 1; i >= 0; i--) {
        if (!visited.has(kids[i] as string)) {
          stack.push({ depth: depth + 1, id: kids[i] as string });
        }
      }
    }
  };
  for (const node of graph.nodes) {
    if (!parentOf.has(node.id)) {
      emitFrom(node.id);
    }
  }
  for (const node of graph.nodes) {
    emitFrom(node.id);
  }
  return lines;
};

const generateTreeview = (graph: VGraph): string => {
  const lines = ['treeView-beta'];
  lines.push(...emitTree(graph, (node) => plainLabel(node.label || node.id)));
  return `${lines.join('\n')}\n`;
};

const parseTreeview = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*treeView-beta\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('treeview');
  const { entries, skipped } = treeEntries(code, header.index + header[0].length, (text) => ({
    label: text.replace(/^-\s+/, '')
  }));
  b.skipped += skipped;
  mintTree(b, entries, 'M');
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const generateTreemap = (graph: VGraph): string => {
  const lines = ['treemap-beta'];
  lines.push(
    ...emitTree(graph, (node) =>
      node.detail !== undefined
        ? `${quoted(node.label || node.id)}: ${node.detail.trim() || '1'}`
        : quoted(node.label || node.id)
    )
  );
  return `${lines.join('\n')}\n`;
};

const parseTreemap = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*treemap(?:-beta)?\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('treemap');
  const { entries, skipped } = treeEntries(code, header.index + header[0].length, (text) => {
    const m = /^"?([^":]*)"?\s*:\s*(\d+(?:\.\d+)?)$/.exec(text);
    if (m) {
      return { label: (m[1] as string).trim(), value: m[2] as string };
    }
    return { label: text.replaceAll('"', '').trim() };
  });
  b.skipped += skipped;
  mintTree(b, entries, 'M');
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const generateIshikawa = (graph: VGraph): string => {
  const lines = ['ishikawa-beta'];
  lines.push(...emitTree(graph, (node) => plainLabel(node.label || node.id)));
  return `${lines.join('\n')}\n`;
};

const parseIshikawa = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*ishikawa(?:-beta)?\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('ishikawa');
  const { entries, skipped } = treeEntries(code, header.index + header[0].length, (text) => ({
    label: text.replaceAll('"', '').trim()
  }));
  b.skipped += skipped;
  mintTree(b, entries, 'M');
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const generateSwimlane = (graph: VGraph): string => {
  const lines = ['swimlane-beta'];
  lines.push(...emitTree(graph, (node) => plainLabel(node.label || node.id)));
  return `${lines.join('\n')}\n`;
};

const parseSwimlane = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*swimlane-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('swimlane');
  const { entries, skipped } = treeEntries(code, header.index + header[0].length, (text) => {
    const m = /^(\S+)\[([^\]]*)\]$/.exec(text);
    if (m) {
      return { label: (m[2] as string).trim() || (m[1] as string) };
    }
    return { label: text };
  });
  b.skipped += skipped;
  mintTree(b, entries, 'M');
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ---------------------------------------------------------------------------
// Node-edge kinds: sankey, requirement, block, c4, architecture, git, zenuml
// ---------------------------------------------------------------------------

const generateSankey = (graph: VGraph): string => {
  const lines = ['sankey-beta'];
  for (const edge of graph.edges) {
    const source = nodeById(graph, edge.source);
    const target = nodeById(graph, edge.target);
    if (!source || !target || source.id === target.id) {
      continue;
    }
    const value = edge.label?.trim() || '1';
    lines.push(
      `${csvLabel(source.label || source.id)},${csvLabel(target.label || target.id)},${value.replaceAll(/[\r\n,]/g, '')}`
    );
  }
  return `${lines.join('\n')}\n`;
};

const parseSankey = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*sankey-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('sankey');
  const idOfName = new Map<string, string>();
  let seq = 0;
  const nodeOfName = (name: string): VNode => {
    const clean = csvLabel(name);
    const known = idOfName.get(clean);
    if (known) {
      return b.graph.nodes.find((n) => n.id === known) as VNode;
    }
    const id = `N${++seq}`;
    idOfName.set(clean, id);
    return b.nodeOf(id, clean);
  };
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const parts = line.split(',');
    if (parts.length < 3) {
      b.skipped++;
      continue;
    }
    const source = nodeOfName((parts[0] as string).trim());
    const target = nodeOfName((parts[1] as string).trim());
    const value = parts.slice(2).join(',').trim();
    if (source.id !== target.id) {
      b.graph.edges.push({
        id: b.edgeId(),
        label: value || '1',
        source: source.id,
        target: target.id,
        type: 'arrow'
      });
    }
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ----------------------------- requirementDiagram ---------------------------

const REQ_BLOCK_RE =
  /^(requirement|functionalRequirement|performanceRequirement|interfaceRequirement|physicalRequirement|designConstraint|element|interface)\s+([A-Za-z0-9_]+)\s*\{$/;
const REQ_REL_RE =
  /^([A-Za-z0-9_]+)\s*-\s*(contains|satisfies|verifies|copies|derives|traces|refines)\s*->\s*([A-Za-z0-9_]+)$/;
const REQ_REL_TYPES: Record<string, VLinkType> = {
  contains: 'line',
  copies: 'dashedArrow',
  derives: 'dashedLine',
  refines: 'dashedArrow',
  satisfies: 'arrow',
  traces: 'dashedLine',
  verifies: 'arrow'
};

const generateRequirement = (graph: VGraph): string => {
  const lines = ['requirementDiagram'];
  for (const node of graph.nodes) {
    const role = node.role === 'element' || node.role === 'interface' ? node.role : 'requirement';
    lines.push(`    ${role} ${identLabel(node.label || node.id)} {`);
    for (const line of node.detail ? node.detail.split('\n') : []) {
      lines.push(`        ${line.trim()}`);
    }
    lines.push('    }');
  }
  for (const edge of graph.edges) {
    const source = nodeById(graph, edge.source);
    const target = nodeById(graph, edge.target);
    if (!source || !target) {
      continue;
    }
    const rel = edge.role && REQ_REL_TYPES[edge.role] ? edge.role : 'contains';
    lines.push(
      `    ${identLabel(source.label || source.id)} - ${rel} -> ${identLabel(target.label || target.id)}`
    );
  }
  return `${lines.join('\n')}\n`;
};

const parseRequirement = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*requirementDiagram\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('requirement');
  let inBlockOf: VNode | undefined;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
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
    const block = REQ_BLOCK_RE.exec(line);
    if (block) {
      const node = b.nodeOf(block[2] as string, block[2] as string);
      node.role = block[1] as string;
      node.detail = '';
      inBlockOf = node;
      continue;
    }
    const rel = REQ_REL_RE.exec(line);
    if (rel) {
      b.graph.edges.push({
        id: b.edgeId(),
        role: rel[2] as string,
        source: b.nodeOf(rel[1] as string).id,
        target: b.nodeOf(rel[3] as string).id,
        type: REQ_REL_TYPES[rel[2] as string] ?? 'arrow'
      });
      continue;
    }
    b.skipped++;
  }
  for (const node of b.graph.nodes) {
    if (node.detail === '') {
      node.detail = undefined;
    }
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// -------------------------------- block-beta -------------------------------

const BLOCK_DECL_RES: { re: RegExp; shape: VShape }[] = [
  { re: /^([A-Za-z0-9_]+)\(\(\s*"?([^"]*?)"?\s*\)\)(?::(\d+))?$/, shape: 'stadium' },
  { re: /^([A-Za-z0-9_]+)\[\(\s*"?([^"]*?)"?\s*\)\](?::(\d+))?$/, shape: 'stadium' },
  { re: /^([A-Za-z0-9_]+)\[\s*"?([^"]*?)"?\s*\](?::(\d+))?$/, shape: 'rect' },
  { re: /^([A-Za-z0-9_]+)\(\s*"?([^"]*?)"?\s*\)(?::(\d+))?$/, shape: 'round' },
  { re: /^([A-Za-z0-9_]+)\{\s*"?([^"]*?)"?\s*\}(?::(\d+))?$/, shape: 'diamond' }
];

const generateBlock = (graph: VGraph): string => {
  const lines = ['block-beta'];
  if (graph.meta?.columns) {
    lines.push(`  columns ${graph.meta.columns.replaceAll(/\D/g, '') || '1'}`);
  }
  for (const node of graph.nodes) {
    const label = node.label && node.label !== node.id ? quoted(node.label) : '';
    const span = node.roleData ? `:${node.roleData.replaceAll(/\D/g, '')}` : '';
    const decl =
      node.shape === 'stadium'
        ? `${node.id}((${label}))`
        : node.shape === 'round'
          ? `${node.id}(${label})`
          : node.shape === 'diamond'
            ? `${node.id}{${label}}`
            : `${node.id}[${label}]`;
    lines.push(`  ${decl}${span}`);
  }
  for (const edge of graph.edges) {
    const arrow = edge.type === 'line' ? '---' : '-->';
    lines.push(`  ${edge.source} ${arrow} ${edge.target}`);
  }
  return `${lines.join('\n')}\n`;
};

/**
 * Block declarations may share a line (`ui["Web UI"] api["API Server"]`), with
 * spaces inside brackets kept as part of the label. Split on top-level
 * (outside any bracket) whitespace only.
 */
const splitBlockLine = (line: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of line) {
    if (ch === '[' || ch === '(' || ch === '{') {
      depth++;
    }
    if (ch === ']' || ch === ')' || ch === '}') {
      depth = Math.max(0, depth - 1);
    }
    if (depth === 0 && /\s/.test(ch)) {
      if (current) {
        parts.push(current);
      }
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
};

const parseBlock = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*block-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('block');
  let inContainer = 0;
  const processFragment = (line: string): void => {
    // Containers are flattened: their contents parse as top-level blocks.
    if (/^block:/i.test(line)) {
      inContainer++;
      b.skipped++;
      return;
    }
    if (inContainer > 0 && /^end\b/.test(line)) {
      inContainer--;
      b.skipped++;
      return;
    }
    const columns = /^columns\s+(\d+)$/.exec(line);
    if (columns) {
      b.graph.meta = { ...b.graph.meta, columns: columns[1] as string };
      return;
    }
    if (/^space\b/.test(line)) {
      b.skipped++;
      return;
    }
    const edge = /^([A-Za-z0-9_]+)\s*(-->|---)\s*([A-Za-z0-9_]+)$/.exec(line);
    if (edge) {
      const source = b.nodeOf(edge[1] as string);
      const target = b.nodeOf(edge[3] as string);
      if (source.id !== target.id) {
        b.graph.edges.push({
          id: b.edgeId(),
          source: source.id,
          target: target.id,
          type: edge[2] === '---' ? 'line' : 'arrow'
        });
      }
      return;
    }
    const bare = /^([A-Za-z0-9_]+)$/.exec(line);
    if (bare) {
      b.nodeOf(bare[1] as string);
      return;
    }
    const decl = BLOCK_DECL_RES.find(({ re }) => re.test(line));
    if (decl) {
      const m = decl.re.exec(line) as RegExpExecArray;
      const node = b.nodeOf(m[1] as string, (m[2] ?? '').trim() || (m[1] as string), decl.shape);
      node.roleData = m[3];
      return;
    }
    b.skipped++;
  };
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    // Whole-line directives (columns/space/edges) first; declaration-only
    // lines may pack several blocks separated by top-level whitespace.
    let handled = false;
    for (const re of [
      /^block:/i,
      /^end\b/,
      /^columns\s+\d+$/,
      /^space\b/,
      /^([A-Za-z0-9_]+)\s*(?:-->|---)\s*([A-Za-z0-9_]+)$/
    ]) {
      if (re.test(line)) {
        processFragment(line);
        handled = true;
        break;
      }
    }
    if (!handled) {
      for (const fragment of splitBlockLine(line)) {
        processFragment(fragment);
      }
    }
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ------------------------------------ C4 -----------------------------------

const C4_NODE_KEYWORDS = new Set([
  'Person',
  'Person_Ext',
  'System',
  'System_Ext',
  'SystemDb',
  'SystemDb_Ext',
  'SystemQueue',
  'SystemQueue_Ext',
  'Container',
  'Container_Ext',
  'ContainerDb',
  'ContainerDb_Ext',
  'ContainerQueue',
  'ContainerQueue_Ext',
  'Component',
  'Component_Ext',
  'ComponentDb',
  'ComponentDb_Ext',
  'ComponentQueue',
  'ComponentQueue_Ext',
  'Deployment_Node',
  'Deployment_Node_Ext',
  'Node',
  'Node_L',
  'Node_R'
]);
const C4_BOUNDARY_RE = /^(?:Enterprise_Boundary|System_Boundary|Boundary|Deployment_Boundary)\s*\(/;
const C4_REL_RE =
  /^(Rel(?:_(?:Back|U|D|L|R))?|BiRel)\(\s*([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*(?:,\s*"([^"]*)")?[^)]*\)\s*;?\s*$/;
const C4_DECL_RE =
  /^([A-Za-z_][A-Za-z0-9_]*)\(\s*([A-Za-z0-9_]+)\s*,\s*"([^"]*)"(?:\s*,\s*"([^"]*)")?\s*\)\s*;?\s*$/;

const C4_REL_LINKTYPES: Record<string, VLinkType> = {
  BiRel: 'line',
  Rel: 'arrow',
  Rel_Back: 'arrow',
  Rel_D: 'dashedArrow',
  Rel_L: 'dashedArrow',
  Rel_R: 'dashedArrow',
  Rel_U: 'dashedArrow'
};

const generateC4 = (graph: VGraph): string => {
  const lines = [graph.meta?.header || 'C4Context'];
  if (graph.title) {
    lines.push(`    title ${plainLabel(graph.title)}`);
  }
  for (const node of graph.nodes) {
    const role = node.role && C4_NODE_KEYWORDS.has(node.role) ? node.role : 'System';
    const label = plainLabel(node.label || node.id);
    const desc = node.detail ? `, ${quoted(node.detail)}` : '';
    lines.push(`    ${role}(${node.id}, ${quoted(label)}${desc})`);
  }
  for (const edge of graph.edges) {
    const role = edge.role && C4_REL_LINKTYPES[edge.role] ? edge.role : 'Rel';
    const label = edge.label !== undefined ? `, ${quoted(edge.label)}` : '';
    lines.push(`    ${role}(${edge.source}, ${edge.target}${label})`);
  }
  return `${lines.join('\n')}\n`;
};

const parseC4 = (code: string, frontmatter?: string): ParsedFlowchart => {
  const headerLine = /^C4Context|C4Container|C4Component|C4Dynamic|C4Deployment/m.exec(code);
  if (!headerLine) {
    return { ok: false };
  }
  const b = newBuilder('c4');
  b.graph.meta = { header: headerLine[0] as string };
  let depth = 0;
  for (const line of bodyLines(code.slice(headerLine.index + headerLine[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    // Boundaries are flattened: their contents parse as top-level nodes.
    if (C4_BOUNDARY_RE.test(line)) {
      depth += line.endsWith('{') ? 1 : 0;
      b.skipped++;
      continue;
    }
    if (/^\}\s*;?\s*$/.test(line) && depth > 0) {
      depth--;
      b.skipped++;
      continue;
    }
    const decl = C4_DECL_RE.exec(line);
    if (decl && C4_NODE_KEYWORDS.has(decl[1] as string)) {
      const node = b.nodeOf(decl[2] as string, (decl[3] ?? '').trim() || (decl[2] as string));
      node.role = decl[1] as string;
      node.detail = decl[4]?.trim() || undefined;
      continue;
    }
    const rel = C4_REL_RE.exec(line);
    if (rel) {
      b.graph.edges.push({
        id: b.edgeId(),
        label: rel[4] ?? '',
        role: rel[1] as string,
        source: b.nodeOf(rel[2] as string).id,
        target: b.nodeOf(rel[3] as string).id,
        type: C4_REL_LINKTYPES[rel[1] as string] ?? 'arrow'
      });
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ------------------------------ architecture -------------------------------

const generateArchitecture = (graph: VGraph): string => {
  const lines = ['architecture-beta'];
  for (const node of graph.nodes) {
    const label = plainLabel(node.label || node.id);
    if (node.role === 'group') {
      lines.push(`    group ${node.id}(${node.id})[${label}]`);
    } else if (node.role === 'junction') {
      lines.push(`    junction ${node.id}`);
    } else {
      const inGroup = graph.edges.find(
        (edge) => edge.role === 'inGroup' && edge.target === node.id
      );
      lines.push(
        `    service ${node.id}(${node.id})[${label}]${inGroup ? ` in ${inGroup.source}` : ''}`
      );
    }
  }
  for (const edge of graph.edges) {
    if (edge.role === 'inGroup') {
      continue;
    }
    // Mermaid requires port markers on both sides of an architecture edge.
    const ports = /^([TLRB])(-->|--|-)([TLRB])$/.exec(edge.roleData ?? '');
    const from = ports?.[1] ?? 'L';
    const arrow = ports?.[2] ?? '-->';
    const to = ports?.[3] ?? 'R';
    lines.push(`    ${edge.source}:${from} ${arrow} ${to}:${edge.target}`);
  }
  return `${lines.join('\n')}\n`;
};

const parseArchitecture = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*architecture-beta\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('architecture');
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const group = /^group\s+([A-Za-z0-9_]+)(?:\(\w+\))?(?:\[([^\]]*)\])?$/.exec(line);
    if (group) {
      const node = b.nodeOf(group[1] as string, (group[2] ?? '').trim() || (group[1] as string));
      node.role = 'group';
      continue;
    }
    const junction = /^junction\s+([A-Za-z0-9_]+)$/.exec(line);
    if (junction) {
      b.nodeOf(junction[1] as string).role = 'junction';
      continue;
    }
    const service =
      /^service\s+([A-Za-z0-9_]+)(?:\(\w+\))?(?:\[([^\]]*)\])?(?:\s+in\s+([A-Za-z0-9_]+))?$/.exec(
        line
      );
    if (service) {
      const node = b.nodeOf(
        service[1] as string,
        (service[2] ?? '').trim() || (service[1] as string)
      );
      node.role = 'service';
      if (service[3]) {
        b.graph.edges.push({
          id: b.edgeId(),
          role: 'inGroup',
          source: b.nodeOf(service[3] as string).id,
          target: node.id,
          type: 'line'
        });
      }
      continue;
    }
    const edge =
      /^([A-Za-z0-9_]+)(?::([TLRB]))?\s*(-->|--)\s*(?::([TLRB]))?:?([A-Za-z0-9_]+)$/.exec(line);
    if (edge) {
      const source = b.nodeOf(edge[1] as string);
      const target = b.nodeOf(edge[5] as string);
      if (source.id !== target.id) {
        b.graph.edges.push({
          id: b.edgeId(),
          roleData: `${edge[2] ?? 'L'}${edge[3]}${edge[4] ?? 'R'}`,
          source: source.id,
          target: target.id,
          type: edge[3] === '--' ? 'line' : 'arrow'
        });
        continue;
      }
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// --------------------------------- gitGraph --------------------------------

const parseGit = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*gitGraph\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('git');
  let current = 'main';
  const lastOnBranch = new Map<string, VNode>();
  let seq = 0;
  const commit = (role: 'commit' | 'merge', attrs: string): VNode => {
    const idAttr = /\bid\s*:\s*"([^"]*)"/.exec(attrs)?.[1];
    const tagAttr = /\btag\s*:\s*"([^"]*)"/.exec(attrs)?.[1];
    const node = b.nodeOf(`C${++seq}`, idAttr ?? '');
    node.role = role;
    node.roleData = current;
    node.detail = tagAttr;
    const parent = lastOnBranch.get(current);
    if (parent && parent.id !== node.id) {
      b.graph.edges.push({
        id: b.edgeId(),
        source: parent.id,
        target: node.id,
        type: 'arrow'
      });
    }
    lastOnBranch.set(current, node);
    return node;
  };
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    const cmd = /^(\w+)\b(.*)$/.exec(line);
    if (!cmd) {
      b.skipped++;
      continue;
    }
    const args = (cmd[2] ?? '').trim();
    switch (cmd[1]) {
      case 'commit': {
        commit('commit', args);
        break;
      }
      case 'branch': {
        const name = /^([A-Za-z0-9_-]+)/.exec(args)?.[1];
        if (name) {
          const head = lastOnBranch.get(current);
          if (!lastOnBranch.has(name) && head) {
            lastOnBranch.set(name, head);
          }
          current = name;
        } else {
          b.skipped++;
        }
        break;
      }
      case 'checkout': {
        const name = /^([A-Za-z0-9_-]+)/.exec(args)?.[1];
        if (name) {
          current = name;
        } else {
          b.skipped++;
        }
        break;
      }
      case 'merge': {
        const name = /^([A-Za-z0-9_-]+)/.exec(args)?.[1];
        if (name) {
          const node = commit('merge', args);
          const fromHead = lastOnBranch.get(name);
          if (fromHead) {
            b.graph.edges.push({
              id: b.edgeId(),
              role: 'mergeFrom',
              roleData: name,
              source: fromHead.id,
              target: node.id,
              type: 'arrow'
            });
          }
        } else {
          b.skipped++;
        }
        break;
      }
      default: {
        b.skipped++;
      }
    }
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const generateGit = (graph: VGraph): string => {
  const lines = ['gitGraph'];
  const declared = new Set(['main']);
  let active = 'main';
  const enterBranch = (branch: string): void => {
    if (branch === active) {
      return;
    }
    if (declared.has(branch)) {
      lines.push(`    checkout ${branch}`);
    } else {
      lines.push(`    branch ${branch}`);
      declared.add(branch);
    }
    active = branch;
  };
  for (const node of graph.nodes) {
    const branch = node.roleData || 'main';
    enterBranch(branch);
    const idAttr = node.label ? ` id: "${plainLabel(node.label)}"` : '';
    const tagAttr = node.detail ? ` tag: "${plainLabel(node.detail)}"` : '';
    if (node.role === 'merge') {
      const from = graph.edges.find(
        (edge) => edge.role === 'mergeFrom' && edge.target === node.id
      )?.roleData;
      if (from && from !== branch && declared.has(from)) {
        lines.push(`    merge ${from}${idAttr}${tagAttr}`);
        continue;
      }
    }
    lines.push(`    commit${idAttr}${tagAttr}`);
  }
  return `${lines.join('\n')}\n`;
};

// ---------------------------------- zenuml ----------------------------------

const ZENUML_MSG_RE = /^(\S+?)\s*(->|-->)\s*(\S+?)(?:\s*:\s*(.*))?$/;
const ZENUML_BLOCK_RE = /^(?:loop|alt|opt|par|else|end|ref|critical|break|seq)\b/;

const generateZenuml = (graph: VGraph): string => {
  const lines = ['zenuml'];
  if (graph.title) {
    lines.push(`title: ${plainLabel(graph.title)}`);
  }
  for (const node of graph.nodes) {
    const keyword = node.shape === 'round' ? 'actor' : 'participant';
    const label = identLabel(node.label || node.id);
    lines.push(label === node.id ? `${keyword} ${node.id}` : `${keyword} ${node.id} as ${label}`);
  }
  for (const edge of graph.edges) {
    const arrow = edge.type === 'msgDashedFilled' ? '-->' : '->';
    const label = edge.label ? `: ${plainLabel(edge.label)}` : '';
    lines.push(`${edge.source}${arrow}${edge.target}${label}`);
  }
  return `${lines.join('\n')}\n`;
};

const parseZenuml = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*zenuml\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('zenuml');
  let braceDepth = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    // Control blocks are flattened: messages inside still parse, the block
    // keywords themselves count as skipped lines.
    const opensBlock = line.endsWith('{');
    if (opensBlock) {
      braceDepth++;
    }
    for (const ch of line) {
      if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
      }
    }
    if (/^title:\s*/.test(line)) {
      b.graph.title = line.replace(/^title:\s*/, '').trim();
      continue;
    }
    const decl = /^(participant|actor)\s+(\S+)$/.exec(line);
    if (decl) {
      b.nodeOf(decl[2] as string, decl[2] as string, decl[1] === 'actor' ? 'round' : 'rect');
      continue;
    }
    if (ZENUML_BLOCK_RE.test(line) || /^create\b/.test(line) || /^return\b/.test(line)) {
      b.skipped++;
      continue;
    }
    const msg = ZENUML_MSG_RE.exec(line);
    if (msg) {
      const source = b.nodeOf(msg[1] as string);
      const target = b.nodeOf(msg[3] as string);
      if (source.id !== target.id) {
        b.graph.edges.push({
          id: b.edgeId(),
          label: msg[4]?.trim() || undefined,
          source: source.id,
          target: target.id,
          type: msg[2] === '-->' ? 'msgDashedFilled' : 'msgSolidFilled'
        });
        continue;
      }
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ---------------------------------------------------------------------------
// Coordinate kinds: quadrantChart, wardley
// ---------------------------------------------------------------------------

const QUADRANT_LABEL_KEYS = ['q1', 'q2', 'q3', 'q4'];

const generateQuadrant = (graph: VGraph): string => {
  const meta = graph.meta ?? {};
  const lines = ['quadrantChart'];
  if (graph.title) {
    lines.push(`    title ${plainLabel(graph.title)}`);
  }
  if (meta.xLow && meta.xHigh) {
    lines.push(`    x-axis ${meta.xLow} --> ${meta.xHigh}`);
  }
  if (meta.yLow && meta.yHigh) {
    lines.push(`    y-axis ${meta.yLow} --> ${meta.yHigh}`);
  }
  for (const key of QUADRANT_LABEL_KEYS) {
    if (meta[key]) {
      lines.push(`    quadrant-${key.slice(1)} ${meta[key]}`);
    }
  }
  for (const node of graph.nodes) {
    const label = plainLabel(node.label || node.id).replaceAll(/[:[\]]/g, ' ');
    const { x, y } = coordsOfNode(node);
    lines.push(`    ${label}: [${x}, ${y}]`);
  }
  return `${lines.join('\n')}\n`;
};

const parseQuadrant = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*quadrantChart\b/.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('quadrant');
  let seq = 0;
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    const xaxis = /^x-axis\s+(.+?)\s+-->\s+(.+)$/.exec(line);
    if (xaxis) {
      b.graph.meta = {
        ...b.graph.meta,
        xHigh: (xaxis[2] as string).trim(),
        xLow: (xaxis[1] as string).trim()
      };
      continue;
    }
    const yaxis = /^y-axis\s+(.+?)\s+-->\s+(.+)$/.exec(line);
    if (yaxis) {
      b.graph.meta = {
        ...b.graph.meta,
        yHigh: (yaxis[2] as string).trim(),
        yLow: (yaxis[1] as string).trim()
      };
      continue;
    }
    const quadrant = /^quadrant-(\d)\s+(.+)$/.exec(line);
    if (quadrant) {
      b.graph.meta = {
        ...b.graph.meta,
        [`q${quadrant[1] as string}`]: (quadrant[2] as string).trim()
      };
      continue;
    }
    const point = /^(.+?)\s*:\s*\[([^\]]*)\]$/.exec(line);
    if (point) {
      const coords = (point[2] as string).split(',');
      const node = b.nodeOf(`P${++seq}`, (point[1] as string).trim() || `点${seq}`);
      const x = Number.parseFloat((coords[0] ?? '').trim());
      const y = Number.parseFloat((coords[1] ?? '').trim());
      const cx = Number.isFinite(x) ? clamp01(x) : 0.5;
      const cy = Number.isFinite(y) ? clamp01(y) : 0.5;
      node.roleData = `[${cx}, ${cy}]`;
      node.x = COORD_MARGIN + cx * COORD_AREA_W;
      node.y = COORD_MARGIN + cy * COORD_AREA_H;
      continue;
    }
    b.skipped++;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const WARDLEY_ROLES = ['anchor', 'component', 'market', 'subcomponent', 'note'] as const;

const generateWardley = (graph: VGraph): string => {
  const lines = ['wardley-beta'];
  if (graph.title) {
    lines.push(`title ${plainLabel(graph.title)}`);
  }
  if (graph.meta?.size) {
    lines.push(`size [${graph.meta.size.replaceAll(/[^\d,]/g, '') || '1100, 800'}]`);
  }
  for (const node of graph.nodes) {
    const label = plainLabel(node.label || node.id).replaceAll(/[[\]]/g, ' ');
    const role = (WARDLEY_ROLES as readonly string[]).includes(node.role ?? '')
      ? node.role
      : 'component';
    const { x, y } = coordsOfNode(node);
    if (role === 'note') {
      lines.push(`note "${label}" [${x}, ${y}]`);
    } else {
      lines.push(`${role} ${label} [${x}, ${y}]`);
    }
  }
  for (const edge of graph.edges) {
    const source = nodeById(graph, edge.source);
    const target = nodeById(graph, edge.target);
    if (!source || !target || source.role === 'note' || target.role === 'note') {
      continue;
    }
    lines.push(
      `${plainLabel(source.label || source.id)} -> ${plainLabel(target.label || target.id)}`
    );
  }
  for (const node of graph.nodes) {
    if (node.role !== 'note' && node.detail && /^\d+(?:\.\d+)?$/.test(node.detail.trim())) {
      lines.push(`evolve ${plainLabel(node.label || node.id)} ${node.detail.trim()}`);
    }
  }
  return `${lines.join('\n')}\n`;
};

const parseWardley = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = /(?:^|\n)\s*wardley-beta\b/i.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('wardley');
  const byName = new Map<string, string>();
  let seq = 0;
  const place = (node: VNode, coordsRaw: string | undefined): void => {
    const coords = parseCoords(coordsRaw);
    const x = coords?.x ?? 0.5;
    const y = coords?.y ?? 0.5;
    node.roleData = `[${x}, ${y}]`;
    node.x = COORD_MARGIN + clamp01(x) * COORD_AREA_W;
    node.y = COORD_MARGIN + clamp01(y) * COORD_AREA_H;
  };
  const evolveOf = new Map<string, string>();
  for (const line of bodyLines(code.slice(header.index + header[0].length))) {
    if (line.length > MAX_LINE_LENGTH) {
      b.skipped++;
      continue;
    }
    if (/^title\s+/.test(line)) {
      b.graph.title = line.replace(/^title\s+/, '').trim();
      continue;
    }
    const size = /^size\s+\[([^\]]*)\]$/.exec(line);
    if (size) {
      b.graph.meta = { ...b.graph.meta, size: (size[1] as string).trim() };
      continue;
    }
    const decl =
      /^(anchor|component|market|subcomponent)\s+(.+?)\s+(\[[^\]]*?\])(?:\s+label\s+\[[^\]]*\])?$/.exec(
        line
      );
    if (decl) {
      const name = (decl[2] as string).trim();
      const node = b.nodeOf(`W${++seq}`, name);
      node.role = decl[1] as string;
      byName.set(name, node.id);
      place(node, decl[3]);
      continue;
    }
    const note = /^note\s+"([^"]*)"\s*(\[[^\]]*?\])$/.exec(line);
    if (note) {
      const node = b.nodeOf(`W${++seq}`, (note[1] as string).trim() || `注${seq}`);
      node.role = 'note';
      place(node, note[2]);
      continue;
    }
    const evolve = /^evolve\s+(.+?)\s+(\d+(?:\.\d+)?)$/.exec(line);
    if (evolve) {
      evolveOf.set((evolve[1] as string).trim(), evolve[2] as string);
      continue;
    }
    const chain = line.split(/\s+->\s+/);
    if (chain.length >= 2 && chain.every((part) => part.trim() !== '')) {
      const ids = chain
        .map((part) => part.trim())
        .map((name) => {
          const known = byName.get(name);
          if (known) {
            return known;
          }
          const node = b.nodeOf(`W${++seq}`, name);
          node.role = 'component';
          place(node, undefined);
          byName.set(name, node.id);
          return node.id;
        });
      for (let i = 0; i + 1 < ids.length; i++) {
        const source = ids[i] as string;
        const target = ids[i + 1] as string;
        if (source !== target) {
          b.graph.edges.push({ id: b.edgeId(), source, target, type: 'arrow' });
        }
      }
      continue;
    }
    b.skipped++;
  }
  for (const [name, value] of evolveOf) {
    const node = byName.get(name);
    if (node) {
      const target = b.graph.nodes.find((n) => n.id === node);
      if (target) {
        target.detail = value;
      }
    }
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

// ---------------------------------------------------------------------------
// Railroad grammar kinds (ebnf / abnf / peg / IR)
// ---------------------------------------------------------------------------

const RAILROAD_HEADER_RE = /(?:^|\n)\s*(railroad-(?:(?:ebnf|abnf|peg|ir)-)?beta)\b/i;

const parseRailroad = (code: string, frontmatter?: string): ParsedFlowchart => {
  const header = RAILROAD_HEADER_RE.exec(code);
  if (!header) {
    return { ok: false };
  }
  const b = newBuilder('railroad');
  b.graph.meta = { header: (header[1] as string).toLowerCase() };
  const body = code.slice(header.index + header[0].length);
  const title = /^\s*title\s+(.+)$/m.exec(body);
  let rest = body;
  if (title) {
    b.graph.title = (title[1] as string).trim();
    rest = body.replace(title[0], '');
  }
  // Rules end with `;` possibly several lines later. Semicolons inside quoted
  // terminals would split early — exotic grammars lose a little fidelity, the
  // fixed-point still holds because the raw rule text is kept verbatim.
  const rules: { expr: string; name: string; op: string }[] = [];
  let start = 0;
  for (let i = 0; i <= rest.length; i++) {
    if (rest[i] === ';' || i === rest.length) {
      const chunk = rest.slice(start, i).trim();
      start = i + 1;
      if (!chunk) {
        continue;
      }
      const m = /^([A-Za-z_][A-Za-z0-9_-]*)\s+(=|<-)\s*([\s\S]+)$/.exec(chunk);
      if (m) {
        rules.push({
          expr: (m[3] as string).replaceAll(/\s+/g, ' ').trim(),
          name: m[1] as string,
          op: m[2] as string
        });
      } else {
        b.skipped++;
      }
    }
  }
  let seq = 0;
  for (const rule of rules) {
    const node = b.nodeOf(`R${++seq}`, rule.name);
    node.role = 'rule';
    node.detail = rule.expr;
    node.roleData = rule.op;
  }
  b.graph.frontmatter = frontmatter;
  return { ok: true, result: { graph: b.graph, skipped: b.skipped } };
};

const generateRailroad = (graph: VGraph): string => {
  const header = graph.meta?.header || 'railroad-ebnf-beta';
  const lines = [header];
  if (graph.title) {
    lines.push(`    title ${plainLabel(graph.title)}`);
  }
  for (const node of graph.nodes) {
    const name = identLabel(node.label || node.id);
    const op = node.roleData === '<-' ? '<-' : '=';
    const expr = node.detail?.trim().replaceAll(/\s+/g, ' ') || 'terminal("x")';
    lines.push(`    ${name} ${op} ${expr} ;`);
  }
  return `${lines.join('\n')}\n`;
};

// ---------------------------------------------------------------------------
// Registries consumed by model.ts
// ---------------------------------------------------------------------------

export const EXTRA_PARSERS: Partial<
  Record<DiagramKind, (code: string, frontmatter?: string) => ParsedFlowchart>
> = {
  architecture: parseArchitecture,
  block: parseBlock,
  c4: parseC4,
  cynefin: parseCynefin,
  eventmodeling: parseEventmodeling,
  gantt: parseGantt,
  git: parseGit,
  ishikawa: parseIshikawa,
  journey: parseJourney,
  kanban: parseKanban,
  packet: parsePacket,
  pie: parsePie,
  quadrant: parseQuadrant,
  radar: parseRadar,
  railroad: parseRailroad,
  requirement: parseRequirement,
  sankey: parseSankey,
  swimlane: parseSwimlane,
  timeline: parseTimeline,
  treemap: parseTreemap,
  treeview: parseTreeview,
  venn: parseVenn,
  wardley: parseWardley,
  xychart: parseXychart,
  zenuml: parseZenuml
};

export const EXTRA_GENERATORS: Partial<Record<DiagramKind, (graph: VGraph) => string>> = {
  architecture: generateArchitecture,
  block: generateBlock,
  c4: generateC4,
  cynefin: generateCynefin,
  eventmodeling: generateEventmodeling,
  gantt: generateGantt,
  git: generateGit,
  ishikawa: generateIshikawa,
  journey: generateJourney,
  kanban: generateKanban,
  packet: generatePacket,
  pie: generatePie,
  quadrant: generateQuadrant,
  radar: generateRadar,
  railroad: generateRailroad,
  requirement: generateRequirement,
  sankey: generateSankey,
  swimlane: generateSwimlane,
  timeline: generateTimeline,
  treemap: generateTreemap,
  treeview: generateTreeview,
  venn: generateVenn,
  wardley: generateWardley,
  xychart: generateXychart,
  zenuml: generateZenuml
};

/** Header → kind detection table (checked against the first code line). */
export const EXTRA_HEADERS: { kind: DiagramKind; re: RegExp }[] = [
  { kind: 'architecture', re: /^architecture-beta\b/ },
  { kind: 'block', re: /^block-beta\b/ },
  { kind: 'c4', re: /^C4(Context|Container|Component|Dynamic|Deployment)\b/ },
  { kind: 'cynefin', re: /^cynefin-beta\b/ },
  { kind: 'eventmodeling', re: /^eventmodeling\b/ },
  { kind: 'gantt', re: /^gantt\b/ },
  { kind: 'git', re: /^gitGraph\b/ },
  { kind: 'ishikawa', re: /^ishikawa(-beta)?\b/i },
  { kind: 'journey', re: /^journey\b/ },
  { kind: 'kanban', re: /^kanban\b/ },
  { kind: 'packet', re: /^packet(-beta)?\b/ },
  { kind: 'pie', re: /^pie\b/ },
  { kind: 'quadrant', re: /^quadrantChart\b/ },
  { kind: 'radar', re: /^radar-beta\b/ },
  { kind: 'railroad', re: /^railroad-(?:(?:ebnf|abnf|peg|ir)-)?beta\b/i },
  { kind: 'requirement', re: /^requirementDiagram\b/i },
  { kind: 'sankey', re: /^sankey-beta\b/ },
  { kind: 'swimlane', re: /^swimlane-beta\b/ },
  { kind: 'timeline', re: /^timeline\b/ },
  { kind: 'treemap', re: /^treemap(-beta)?\b/ },
  { kind: 'treeview', re: /^treeView-beta\b/i },
  { kind: 'venn', re: /^venn-beta\b/ },
  { kind: 'wardley', re: /^wardley-beta\b/i },
  { kind: 'xychart', re: /^xychart-beta\b/ },
  { kind: 'zenuml', re: /^zenuml\b/ }
];

/** Kinds whose node positions are derived from code coordinates (WYSIWYG). */
export const COORD_KINDS: ReadonlySet<string> = new Set(['quadrant', 'wardley']);

/** Split a leading YAML frontmatter block (`---\n…\n---`) off the code. */
export const splitFrontmatter = (code: string): { body: string; frontmatter?: string } => {
  if (!code.startsWith('---')) {
    return { body: code };
  }
  const end = code.indexOf('\n---', 3);
  if (end === -1) {
    return { body: code };
  }
  const after = code.indexOf('\n', end + 1);
  const frontmatter = code.slice(0, after === -1 ? undefined : after).trimEnd();
  return {
    body: code.slice(after === -1 ? code.length : after + 1),
    frontmatter
  };
};

/** Position nodes of coordinate kinds from their `[x, y]` roleData. */
export const layoutCoordinateKind = (graph: VGraph): VGraph => ({
  ...graph,
  nodes: graph.nodes.map((node) => {
    const coords = parseCoords(node.roleData);
    if (!coords) {
      return node;
    }
    return {
      ...node,
      x: COORD_MARGIN + clamp01(coords.x) * COORD_AREA_W,
      y: COORD_MARGIN + clamp01(coords.y) * COORD_AREA_H
    };
  })
});
