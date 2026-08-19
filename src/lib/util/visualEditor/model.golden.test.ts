import { describe, expect, it } from 'vitest';
import { generateCode, layoutGraph, normalizeLabeledLinks, parseFlowchart } from './model';

// Golden fixtures: the exact structures parseFlowchart/layoutGraph produce
// for tricky syntax. They pin behavior for the scanner optimizations —
// any change in token recognition, id sequencing, shape mapping or layout
// must keep these byte-identical.
const goldenParse = (code: string) => {
  const parsed = parseFlowchart(code);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) {
    // Strip volatile nothing — ids are deterministic; deep-compare as-is.
    return parsed.result;
  }
};

describe('parseFlowchart golden fixtures', () => {
  it('parses shapes, bare ids and labeled edges', () => {
    expect(
      goldenParse(`flowchart TD
    A[Alpha] -->|Get money| B
    B(Go shopping) --> C{Decide}
    C -->|One| D([Laptop])
    E ---> F
`)
    ).toEqual({
      graph: {
        direction: 'TD',
        edges: [
          { id: 'E1', label: 'Get money', source: 'A', target: 'B', type: 'arrow' },
          { id: 'E2', label: undefined, source: 'B', target: 'C', type: 'arrow' },
          { id: 'E3', label: 'One', source: 'C', target: 'D', type: 'arrow' },
          // '--->' tokenizes as '---' (line) — pre-existing approximation.
          { id: 'E4', label: undefined, source: 'E', target: 'F', type: 'line' }
        ],
        nodes: [
          { id: 'A', label: 'Alpha', shape: 'rect', x: 0, y: 0 },
          // The later bracket occurrence refines the bare node in place.
          { id: 'B', label: 'Go shopping', shape: 'round', x: 0, y: 0 },
          { id: 'C', label: 'Decide', shape: 'diamond', x: 0, y: 0 },
          { id: 'D', label: 'Laptop', shape: 'stadium', x: 0, y: 0 },
          { id: 'E', label: 'E', shape: 'rect', x: 0, y: 0 },
          { id: 'F', label: 'F', shape: 'rect', x: 0, y: 0 }
        ]
      },
      skipped: 0
    });
  });

  it('parses chained statements, textual links, semicolons and link types', () => {
    expect(
      goldenParse(`graph LR
    A --> B --> C
    A -- text --> B
    B -. dashed .-> C
    B --- C
    C ==> D; D --> E
`)
    ).toEqual({
      graph: {
        direction: 'LR',
        edges: [
          { id: 'E1', label: undefined, source: 'A', target: 'B', type: 'arrow' },
          { id: 'E2', label: undefined, source: 'B', target: 'C', type: 'arrow' },
          { id: 'E3', label: 'text', source: 'A', target: 'B', type: 'arrow' },
          { id: 'E4', label: 'dashed', source: 'B', target: 'C', type: 'dashed' },
          { id: 'E5', label: undefined, source: 'B', target: 'C', type: 'line' },
          { id: 'E6', label: undefined, source: 'C', target: 'D', type: 'arrow' },
          { id: 'E7', label: undefined, source: 'D', target: 'E', type: 'arrow' }
        ],
        nodes: [
          { id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 },
          { id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 },
          { id: 'C', label: 'C', shape: 'rect', x: 0, y: 0 },
          { id: 'D', label: 'D', shape: 'rect', x: 0, y: 0 },
          { id: 'E', label: 'E', shape: 'rect', x: 0, y: 0 }
        ]
      },
      skipped: 0
    });
  });

  it('skips comments and subgraph blocks with a count, keeps quoted labels', () => {
    expect(
      goldenParse(`flowchart TD
    %% a comment line
    A["quoted (label)"] --> B[dot.label]
    subgraph inner
      X --> Y
    end
    B --> Z
`)
    ).toEqual({
      graph: {
        direction: 'TD',
        edges: [
          { id: 'E1', label: undefined, source: 'A', target: 'B', type: 'arrow' },
          { id: 'E2', label: undefined, source: 'B', target: 'Z', type: 'arrow' }
        ],
        nodes: [
          { id: 'A', label: 'quoted (label)', shape: 'rect', x: 0, y: 0 },
          { id: 'B', label: 'dot.label', shape: 'rect', x: 0, y: 0 },
          { id: 'Z', label: 'Z', shape: 'rect', x: 0, y: 0 }
        ]
      },
      skipped: 3
    });
  });

  it('produces deterministic layered layout positions', () => {
    const parsed = parseFlowchart('flowchart TD\n    A --> B --> C\n    A --> D\n');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(layoutGraph(parsed.result.graph)).toMatchInlineSnapshot(`
        {
          "direction": "TD",
          "edges": [
            {
              "id": "E1",
              "label": undefined,
              "source": "A",
              "target": "B",
              "type": "arrow",
            },
            {
              "id": "E2",
              "label": undefined,
              "source": "B",
              "target": "C",
              "type": "arrow",
            },
            {
              "id": "E3",
              "label": undefined,
              "source": "A",
              "target": "D",
              "type": "arrow",
            },
          ],
          "nodes": [
            {
              "id": "A",
              "label": "A",
              "shape": "rect",
              "x": 40,
              "y": 40,
            },
            {
              "id": "B",
              "label": "B",
              "shape": "rect",
              "x": 40,
              "y": 134,
            },
            {
              "id": "C",
              "label": "C",
              "shape": "rect",
              "x": 40,
              "y": 228,
            },
            {
              "id": "D",
              "label": "D",
              "shape": "rect",
              "x": 240,
              "y": 134,
            },
          ],
        }
      `);
    }
  });

  it('round-trips a graph with quotes and specials through generateCode', () => {
    const code = `flowchart TD
    A["label (with) specials"] -->|edge "quoted"| B
    B([stadium]) -.-> C{diamond}
`;
    const parsed = parseFlowchart(code);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const once = generateCode(parsed.result.graph);
      const twice = parseFlowchart(once);
      expect(twice.ok).toBe(true);
      if (twice.ok) {
        expect(generateCode(twice.result.graph)).toBe(once);
      }
    }
  });
});

describe('normalizeLabeledLinks differential (single pass vs sequential)', () => {
  // The four sequential replaces are the current implementation and the
  // reference below pins their exact semantics. A single-alternation-pass
  // rewrite was measured and REJECTED: when a thick-arrow region overlaps
  // a textual dashed link (e.g. soup producing ' ==> ... -. t .-> ... '),
  // sequential order rewrites the dashed form first while a leftmost-first
  // single pass lets the == rule swallow it verbatim - the differential
  // corpus below caught the divergence (see note/report/perf round 10).
  // The previous implementation: four sequential replaces.
  const sequentialReference = (line: string): string =>
    line
      .replace(/-\.\s*([^.|]+?)\s*\.->/g, '-.->|$1|')
      .replace(/--\s+([^.|-][^-]*?)\s+-->/g, '-->|$1|')
      .replace(/--\s+([^.|-][^-]*?)\s+---/g, '---|$1|')
      .replace(/==\s*([^=]+?)\s*==>/g, '==>|$1|');

  const lcg = (seed: number) => () => (seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296);

  it('matches the reference on deterministic random line soup', () => {
    const rand = lcg(20_260_821);
    const fragments = [
      'A[Node]',
      'B{Diamond}',
      'C(Round)',
      ' --> ',
      ' --- ',
      ' ---> ',
      ' -.-> ',
      ' ==> ',
      ' == ',
      ' -- ',
      ' -. ',
      '|label|',
      '-- text -->',
      '-- t ---',
      '-. t .->',
      '== t ==>',
      'text with - hyphen',
      'plain words',
      '"quoted (label)"',
      ';',
      '%%comment'
    ];
    for (let i = 0; i < 2000; i++) {
      const parts: string[] = [];
      const count = (rand() % 4) + 1;
      for (let j = 0; j < count; j++) {
        parts.push(fragments[rand() % fragments.length]);
      }
      const line = parts.join('');
      expect(normalizeLabeledLinks(line), JSON.stringify(line)).toBe(sequentialReference(line));
    }
  });

  it('matches the reference on tricky handcrafted lines', () => {
    const lines = [
      'A -- a --> B --- C',
      'A --- B -- t --> C',
      'A -. d .-> B == t ==> C',
      'A -- long-label --> B',
      'A -->|already| B',
      'A -- multiple -- links -- t2 --> D',
      '== spaced  == > after',
      'A ==a==> B ==b==> C',
      '--- only dashes ---',
      'nothing here',
      'x - y - z',
      '== equal signs only == =='
    ];
    for (const line of lines) {
      expect(normalizeLabeledLinks(line), line).toBe(sequentialReference(line));
    }
  });
});
