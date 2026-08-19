import { describe, expect, it } from 'vitest';
import { generateCode, layoutGraph, parseFlowchart } from './model';

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
