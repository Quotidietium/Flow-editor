import { describe, expect, it } from 'vitest';

import { generateCode, parseCode } from './model';
import { addRow, moveRow, removeRow, SHEET_CONFIG, sheetRows } from './sheet';
import type { DiagramKind, VGraph } from './model';

const parse = (code: string): VGraph => {
  const result = parseCode(code);
  if (!result.ok) {
    throw new Error('parse failed');
  }
  return result.result.graph;
};

describe('sheet config coverage', () => {
  it('every sheet kind parses its official sample into listed rows', () => {
    const samples: [DiagramKind, string][] = [
      ['pie', 'pie title Pets\n  "Dogs" : 386\n  "Cats" : 85'],
      ['packet', 'packet-beta\n  0-15: "Source Port"\n  16-31: "Destination Port"'],
      ['radar', 'radar-beta\n  axis a["Art"], b["Blog"]\n  curve c["Alice"]{1, 2}\n  max 5'],
      ['xychart', 'xychart-beta\n  x-axis [a, b]\n  y-axis 0 --> 10\n  bar [1, 2]'],
      ['venn', 'venn-beta\n  set A\n  set B\n  union A & B["Both"]'],
      ['eventmodeling', 'eventmodeling\n  tf S1 ui Screen\n  tf C1 cmd DoIt'],
      ['railroad', 'railroad-ebnf-beta\n  expr = term "+" term ;']
    ];
    for (const [kind, code] of samples) {
      const graph = parse(code);
      const sections = SHEET_CONFIG[kind] ?? [];
      expect(sections.length, kind).toBeGreaterThan(0);
      const listed = sections.flatMap((s) => sheetRows(graph, s));
      expect(listed.length, kind).toBe(graph.nodes.length);
    }
  });
});

describe('sheet row operations', () => {
  it('addRow + field edit regenerate valid pie code', () => {
    const graph = parse('pie\n  "Dogs" : 386');
    const section = (SHEET_CONFIG.pie ?? [])[0];
    if (!section) {
      throw new Error('missing pie section');
    }
    const row = addRow(graph, section);
    row.label = 'Birds';
    row.detail = '12';
    expect(generateCode(graph)).toContain('"Birds": 12');
  });

  it('moveRow reorders pie slices in the generated code', () => {
    const graph = parse('pie\n  "A" : 1\n  "B" : 2');
    const section = (SHEET_CONFIG.pie ?? [])[0];
    if (!section) {
      throw new Error('missing pie section');
    }
    const rows = sheetRows(graph, section);
    moveRow(graph, section, (rows[1] ?? {}).id as string, -1);
    const code = generateCode(graph);
    expect(code.indexOf('"B"')).toBeLessThan(code.indexOf('"A"'));
  });

  it('removeRow drops the slice', () => {
    const graph = parse('pie\n  "A" : 1\n  "B" : 2');
    removeRow(graph, 'S1');
    expect(generateCode(graph)).not.toContain('"A"');
  });

  it('radar sections keep axes and curves apart', () => {
    const graph = parse('radar-beta\n  axis a["Art"], b["Blog"]\n  curve c["Alice"]{1, 2}');
    const sections = SHEET_CONFIG.radar ?? [];
    expect(sheetRows(graph, sections[0] as (typeof sections)[number])).toHaveLength(2);
    expect(sheetRows(graph, sections[1] as (typeof sections)[number])).toHaveLength(1);
  });

  it('xychart series role switch regenerates bar ↔ line', () => {
    const graph = parse('xychart-beta\n  x-axis [a, b]\n  y-axis 0 --> 10\n  bar [1, 2]');
    const sections = SHEET_CONFIG.xychart ?? [];
    const series = sheetRows(graph, sections[2] as (typeof sections)[number]);
    const row = series[0];
    if (!row) {
      throw new Error('missing series row');
    }
    row.role = 'line';
    expect(generateCode(graph)).toContain('line [1, 2]');
  });

  it('railroad operator select round-trips', () => {
    const graph = parse('railroad-ebnf-beta\n  expr = term "+" term ;');
    const section = (SHEET_CONFIG.railroad ?? [])[0];
    const row = section ? sheetRows(graph, section)[0] : undefined;
    if (!row) {
      throw new Error('missing railroad row');
    }
    expect(row.roleData).toBe('=');
    row.roleData = '<-';
    expect(generateCode(graph)).toContain('expr <- term "+" term ;');
  });
});
