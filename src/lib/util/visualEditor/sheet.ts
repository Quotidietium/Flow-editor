/**
 * Sheet editor model: per-kind section/field descriptors plus pure row
 * operations for the record-list kinds (pie, packet, radar, xychart, venn,
 * eventmodeling, railroad). These diagrams are flat lists of typed records —
 * a table rows their natural editing metaphor, not a canvas. All operations
 * mutate the plain VGraph; the existing per-kind generators emit the code.
 */

import { nextNodeId } from './model';
import type { DiagramKind, VGraph, VNode } from './model';

export interface SheetField {
  /** VNode property the input writes to. */
  key: 'detail' | 'label' | 'role' | 'roleData';
  label: string;
  /** Select options; absent = free-text input. */
  options?: { name: string; value: string }[];
  placeholder?: string;
}

export interface SheetSection {
  addLabel: string;
  /** Fields rendered per row (label included only when the kind uses it). */
  fields: SheetField[];
  /** Role assigned to new rows (undefined = keep role unset, e.g. pie). */
  newRole?: string;
  /** Roles of nodes listed in this section. */
  roles: (string | undefined)[];
  title: string;
}

const text = (key: SheetField['key'], label: string, placeholder?: string): SheetField => ({
  key,
  label,
  placeholder
});

export const SHEET_CONFIG: Partial<Record<DiagramKind, SheetSection[]>> = {
  eventmodeling: [
    {
      addLabel: '元素',
      fields: [
        {
          key: 'role',
          label: '类型',
          options: [
            { name: '界面', value: 'ui' },
            { name: '命令', value: 'cmd' },
            { name: '事件', value: 'evt' },
            { name: '读模型', value: 'rmo' }
          ]
        },
        text('label', '名称', '标识符（空格会归一为 -）'),
        text('roleData', '链接目标', '仅读模型：目标事件 id')
      ],
      roles: ['ui', 'cmd', 'evt', 'rmo'],
      title: '事件流元素'
    }
  ],
  packet: [
    {
      addLabel: '字段',
      fields: [text('label', '字段名'), text('detail', '位区间', '0-7')],
      roles: [undefined],
      title: '报文字段'
    }
  ],
  pie: [
    {
      addLabel: '切片',
      fields: [text('label', '切片名'), text('detail', '数值', '1')],
      roles: [undefined],
      title: '饼图切片'
    }
  ],
  radar: [
    {
      addLabel: '维度',
      fields: [text('label', '维度名')],
      newRole: 'axis',
      roles: ['axis'],
      title: '维度（轴）'
    },
    {
      addLabel: '曲线',
      fields: [text('label', '曲线名'), text('detail', '数值', '逗号分隔，与维度一一对应')],
      newRole: 'curve',
      roles: ['curve'],
      title: '曲线'
    }
  ],
  railroad: [
    {
      addLabel: '规则',
      fields: [
        text('label', '规则名'),
        {
          key: 'roleData',
          label: '运算符',
          options: [
            { name: '=（定义）', value: '=' },
            { name: '<-（PEG）', value: '<-' }
          ]
        },
        text('detail', '表达式', '原文逐字节保留')
      ],
      newRole: 'rule',
      roles: ['rule'],
      title: '语法规则'
    }
  ],
  venn: [
    {
      addLabel: '集合',
      fields: [text('label', '集合名')],
      newRole: 'set',
      roles: ['set'],
      title: '集合'
    },
    {
      addLabel: '交集',
      fields: [
        text('label', '交集名'),
        text('roleData', '成员集合', '如 A & B（须为已定义的集合名）')
      ],
      newRole: 'union',
      roles: ['union'],
      title: '交集'
    }
  ],
  xychart: [
    {
      addLabel: '横轴',
      fields: [text('label', '名称'), text('detail', '类目', 'a, b, c')],
      newRole: 'xaxis',
      roles: ['xaxis'],
      title: '横轴'
    },
    {
      addLabel: '纵轴',
      fields: [text('label', '名称'), text('detail', '范围', '0 --> 100')],
      newRole: 'yaxis',
      roles: ['yaxis'],
      title: '纵轴'
    },
    {
      addLabel: '系列',
      fields: [
        {
          key: 'role',
          label: '形式',
          options: [
            { name: '柱状', value: 'bar' },
            { name: '折线', value: 'line' }
          ]
        },
        text('detail', '数值', '逗号分隔，与横轴类目一一对应')
      ],
      newRole: 'bar',
      roles: ['bar', 'line'],
      title: '数据系列'
    }
  ]
};

/** Rows of a section: nodes whose role is listed, in node order. */
export const sheetRows = (graph: VGraph, section: SheetSection): VNode[] =>
  graph.nodes.filter((n) => section.roles.includes(n.role));

export const addRow = (graph: VGraph, section: SheetSection): VNode => {
  const node: VNode = {
    id: nextNodeId(graph.nodes),
    label: '',
    role: section.newRole,
    shape: 'rect',
    x: 0,
    y: 0
  };
  graph.nodes.push(node);
  return node;
};

export const removeRow = (graph: VGraph, rowId: string): void => {
  graph.nodes = graph.nodes.filter((n) => n.id !== rowId);
  graph.edges = graph.edges.filter((e) => e.source !== rowId && e.target !== rowId);
};

/**
 * Duplicates a row right after the original (node order is row order within
 * the section). Full-field clone (label/detail/roleData ride along), fresh id;
 * returns the copy for autofocus. No-op for ids outside the section.
 */
export const duplicateRow = (
  graph: VGraph,
  section: SheetSection,
  rowId: string
): VNode | undefined => {
  if (!sheetRows(graph, section).some((n) => n.id === rowId)) {
    return undefined;
  }
  const at = graph.nodes.findIndex((n) => n.id === rowId);
  const source = graph.nodes[at];
  if (!source) {
    return undefined;
  }
  const copy: VNode = { ...source, id: nextNodeId(graph.nodes) };
  graph.nodes.splice(at + 1, 0, copy);
  return copy;
};

/** Swaps a row with its previous/next sibling within the same section. */
export const moveRow = (
  graph: VGraph,
  section: SheetSection,
  rowId: string,
  direction: -1 | 1
): void => {
  const ids = sheetRows(graph, section).map((n) => n.id);
  const at = ids.indexOf(rowId);
  const swapWith = ids[at + direction];
  if (at < 0 || swapWith === undefined) {
    return;
  }
  const indexA = graph.nodes.findIndex((n) => n.id === rowId);
  const indexB = graph.nodes.findIndex((n) => n.id === swapWith);
  const a = graph.nodes[indexA] as VNode;
  graph.nodes[indexA] = graph.nodes[indexB] as VNode;
  graph.nodes[indexB] = a;
};
