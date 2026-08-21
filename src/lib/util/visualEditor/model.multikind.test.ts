import { describe, expect, it } from 'vitest';
import { parse } from '../mermaid';
import {
  applyPositions,
  detectDiagramKind,
  ER_CARDINALITIES,
  generateCode,
  KIND_SPECS,
  layoutGraph,
  nodeSize,
  NODE_H,
  parseCode,
  sanitizePositions,
  type VGraph
} from './model';

// Round-trip contract shared by every kind: the first regeneration may
// normalize formatting (e.g. sequence gains explicit participant lines),
// but after that generate∘parse must be a fixed point.
const roundTrip = (code: string): string => {
  const first = parseCode(code);
  expect(first.ok, `parse failed: ${code}`).toBe(true);
  if (!first.ok) {
    throw new Error('unreachable');
  }
  const once = generateCode(first.result.graph);
  const second = parseCode(once);
  expect(second.ok, `re-parse failed: ${once}`).toBe(true);
  if (!second.ok) {
    throw new Error('unreachable');
  }
  const twice = generateCode(second.result.graph);
  expect(twice, 'not a fixed point').toBe(once);
  return once;
};

// Every generated artifact must stay valid Mermaid — this is the contract
// that makes visual editing of these kinds usable at all. parse() lazy-loads
// diagram modules, so these tests carry an explicit 20s timeout: under a
// fully parallel vitest run a starved worker can exceed the 5s default.
const assertParses = async (code: string): Promise<void> => {
  await expect(parse(code)).resolves.toBeTruthy();
};

describe('detectDiagramKind', () => {
  it('detects every supported kind and rejects the rest', () => {
    expect(detectDiagramKind('flowchart TD\n  A-->B')).toBe('flowchart');
    expect(detectDiagramKind('graph LR\n  A-->B')).toBe('flowchart');
    expect(detectDiagramKind('sequenceDiagram\n  A->>B: hi')).toBe('sequence');
    expect(detectDiagramKind('classDiagram\n  A --> B')).toBe('class');
    expect(detectDiagramKind('stateDiagram-v2\n  [*] --> S')).toBe('state');
    expect(detectDiagramKind('stateDiagram\n  [*] --> S')).toBe('state');
    expect(detectDiagramKind('erDiagram\n  A ||--o{ B : r')).toBe('er');
    expect(detectDiagramKind('mindmap\n  root((r))')).toBe('mindmap');
    expect(detectDiagramKind('gantt\n  title x')).toBe('gantt');
    expect(detectDiagramKind('pie\n  "a": 1')).toBe('pie');
    expect(detectDiagramKind('%% comment only\ngantt')).toBe('gantt');
    expect(detectDiagramKind('')).toBeUndefined();
  });
});

describe('sequence', () => {
  const code = `sequenceDiagram
    participant Alice
    actor Bob
    Alice->>Bob: Hello
    Bob-->>Alice: Hi
    Bob--)Alice: ping
`;

  it('parses participants, actors and message arrows', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    expect(graph.kind).toBe('sequence');
    expect(graph.nodes.map((n) => [n.id, n.shape])).toEqual([
      ['Alice', 'rect'],
      ['Bob', 'round']
    ]);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges[0]).toMatchObject({
      label: 'Hello',
      source: 'Alice',
      target: 'Bob',
      type: 'msgSolidFilled'
    });
    expect(graph.edges[2]?.type).toBe('msgDashedOpen');
  });

  it('round-trips and generates valid mermaid', async () => {
    const generated = roundTrip(code);
    expect(generated).toContain('participant Alice');
    expect(generated).toContain('actor Bob');
    expect(generated).toContain('Alice->>Bob: Hello');
    await assertParses(generated);
  }, 20_000);

  it('keeps message order as edges are appended', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const graph = parsed.result.graph;
    graph.edges.push({
      id: 'E9',
      label: 'again',
      source: 'Alice',
      target: 'Bob',
      type: 'msgSolidFilled'
    });
    const generated = generateCode(graph);
    const lines = generated.trim().split('\n');
    expect(lines.at(-1)).toBe('    Alice->>Bob: again');
  });

  it('lays participants out in a single row', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const laid = layoutGraph(parsed.result.graph);
    expect(new Set(laid.nodes.map((n) => n.y))).toEqual(new Set([laid.nodes[0]?.y]));
    expect(laid.nodes[0]?.x).toBeLessThan((laid.nodes[1] ?? laid.nodes[0]).x);
  });
});

describe('class', () => {
  const code = `classDiagram
    direction LR
    class Foo["My Foo"] {
        +bar() void
        +count int
    }
    Foo --> Bar : uses
    Bar "1" *-- "many" Baz
    Qux ..|> Foo
`;

  it('parses members, labels, relations and cardinalities', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    expect(graph.kind).toBe('class');
    expect(graph.direction).toBe('LR');
    const foo = graph.nodes.find((n) => n.id === 'Foo');
    expect(foo?.label).toBe('My Foo');
    expect(foo?.detail).toBe('+bar() void\n+count int');
    const composition = graph.edges.find((e) => e.source === 'Bar');
    expect(composition).toMatchObject({
      cardL: '1',
      cardR: 'many',
      target: 'Baz',
      type: 'composition'
    });
    expect(graph.edges.find((e) => e.source === 'Qux')?.type).toBe('realization');
  });

  it('round-trips and generates valid mermaid', async () => {
    const generated = roundTrip(code);
    expect(generated).toContain('class Foo["My Foo"] {');
    expect(generated).toContain('+bar() void');
    expect(generated).toContain('Bar "1" *-- "many" Baz');
    await assertParses(generated);
  }, 20_000);

  it('distinguishes aggregation o-- from a cardinality-free association', () => {
    const parsed = parseCode('classDiagram\n    A o-- B\n    C --> D : x\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.result.graph.edges[0]).toMatchObject({
      source: 'A',
      target: 'B',
      type: 'aggregation'
    });
    expect(parsed.result.graph.edges[1]?.type).toBe('arrow');
  });
});

describe('state', () => {
  const code = `stateDiagram-v2
    direction LR
    [*] --> Idle
    state "Long name" as Busy
    Busy : working hard
    Idle --> Busy : start
    Busy --> Idle : stop
    Busy --> [*]
`;

  it('parses start/end pseudo nodes, labels, descriptions and transitions', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    expect(graph.kind).toBe('state');
    expect(graph.direction).toBe('LR');
    const start = graph.nodes.find((n) => n.special === 'start');
    const end = graph.nodes.find((n) => n.special === 'end');
    expect(start?.id).toBe('__start__');
    expect(end?.id).toBe('__end__');
    expect(graph.nodes.find((n) => n.id === 'Busy')?.label).toBe('Long name');
    expect(graph.nodes.find((n) => n.id === 'Busy')?.detail).toBe('working hard');
    expect(graph.edges.some((e) => e.source === '__start__' && e.target === 'Idle')).toBe(true);
    expect(graph.edges.some((e) => e.source === 'Busy' && e.target === '__end__')).toBe(true);
    expect(
      graph.edges.some((e) => e.source === 'Idle' && e.target === 'Busy' && e.label === 'start')
    ).toBe(true);
  });

  it('round-trips and generates valid mermaid', async () => {
    const generated = roundTrip(code);
    expect(generated).toContain('[*] --> Idle');
    expect(generated).toContain('state "Long name" as Busy');
    expect(generated).toContain('Busy : working hard');
    expect(generated).toContain('Busy --> [*]');
    await assertParses(generated);
  }, 20_000);

  it('skips composite state bodies and notes with a count', () => {
    const parsed = parseCode(`stateDiagram-v2
    [*] --> A
    state B {
        C --> D
    }
    note right of A
        some note
    end note
    A --> B
`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.result.graph.nodes.map((n) => n.id)).not.toContain('C');
    expect(parsed.result.skipped).toBeGreaterThan(0);
    expect(parsed.result.graph.edges.some((e) => e.source === 'A' && e.target === 'B')).toBe(true);
  });
});

describe('er', () => {
  const code = `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER {
        string id
        int amount
    }
    CUSTOMER }o--o{ TAG : has
`;

  it('parses relations, cardinalities and attribute blocks', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    expect(graph.kind).toBe('er');
    expect(graph.nodes.find((n) => n.id === 'ORDER')?.detail).toBe('string id\nint amount');
    expect(graph.edges[0]).toMatchObject({
      cardL: '||',
      cardR: 'o{',
      label: 'places',
      source: 'CUSTOMER',
      target: 'ORDER',
      type: 'line'
    });
    expect(graph.edges[1]).toMatchObject({ cardL: '}o', cardR: 'o{' });
  });

  it('round-trips and generates valid mermaid', async () => {
    const generated = roundTrip(code);
    expect(generated).toContain('CUSTOMER ||--o{ ORDER : places');
    expect(generated).toContain('ORDER {');
    expect(generated).toContain('string id');
    await assertParses(generated);
  }, 20_000);

  it('emits cardinality presets and drops entities without attributes or edges', async () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const graph = parsed.result.graph;
    const edge = graph.edges[0];
    if (!edge) {
      throw new Error('missing edge');
    }
    edge.cardL = ER_CARDINALITIES[3]?.cardL;
    edge.cardR = ER_CARDINALITIES[3]?.cardR;
    graph.nodes.push({ id: 'LONELY', label: 'LONELY', shape: 'rect', x: 0, y: 0 });
    const generated = generateCode(graph);
    expect(generated).toContain('CUSTOMER }o--o{ ORDER : places');
    expect(generated).not.toContain('LONELY');
    await assertParses(generated);
  }, 20_000);
});

describe('mindmap', () => {
  const code = `mindmap
    root((Deep Root))
        Origins
            Long history
        Effects
            clarity((Clear))
`;

  it('parses the indent tree with shapes', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    expect(graph.kind).toBe('mindmap');
    const root = graph.nodes[0];
    expect(root?.label).toBe('Deep Root');
    expect(root?.shape).toBe('stadium');
    // root -> Origins, root -> Effects, Origins -> Long history, Effects -> Clear
    expect(graph.edges).toHaveLength(4);
    expect(graph.nodes.find((n) => n.label === 'Clear')?.shape).toBe('stadium');
    expect(graph.nodes.find((n) => n.label === 'Origins')?.shape).toBe('round');
  });

  it('round-trips and generates valid mermaid', async () => {
    const generated = roundTrip(code);
    // The id prefix (`root`) is not part of the model — only label + shape.
    expect(generated).toContain('((Deep Root))');
    expect(generated).toContain('    (Origins)');
    expect(generated).toContain('        (Long history)');
    await assertParses(generated);
  }, 20_000);

  it('regenerates the tree from edited edges', () => {
    const parsed = parseCode(code);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const graph = parsed.result.graph;
    // Re-parent 'Clear' under 'Long history': remove old edge, add new one.
    graph.edges = graph.edges.filter((e) => e.target !== 'M5');
    graph.edges.push({ id: 'E9', source: 'M3', target: 'M5', type: 'line' });
    const generated = generateCode(graph);
    const lines = generated.trim().split('\n');
    const historyIdx = lines.findIndex((l) => l.includes('Long history'));
    const clarityIdx = lines.findIndex((l) => l.includes('Clear'));
    expect(clarityIdx).toBe(historyIdx + 1);
    expect(lines[clarityIdx]?.startsWith('            ')).toBe(true);
  });
});

describe('nodeSize with detail', () => {
  it('grows with detail lines and shrinks for special nodes', () => {
    expect(nodeSize({ id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 }).h).toBe(NODE_H);
    expect(nodeSize({ detail: 'a\nb\nc', id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 }).h).toBe(
      NODE_H + 3 * 13
    );
    expect(nodeSize({ id: 'S', label: 's', shape: 'rect', special: 'start', x: 0, y: 0 })).toEqual({
      h: 28,
      w: 28
    });
  });
});

describe('applyPositions (WYSIWYG position overlay)', () => {
  const laidOut = (): VGraph => {
    const parsed = parseCode('flowchart TD\n    A --> B\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error('unreachable');
    }
    return layoutGraph(parsed.result.graph);
  };

  it('restores remembered positions by id and keeps auto slots for new ids', () => {
    const graph = laidOut();
    const moved = applyPositions(graph, { A: { x: 500, y: 300 } });
    const a = moved.nodes.find((n) => n.id === 'A');
    const b = moved.nodes.find((n) => n.id === 'B');
    expect(a).toMatchObject({ x: 500, y: 300 });
    // B has no remembered position: keeps its auto-layout slot.
    expect(b).toEqual(graph.nodes.find((n) => n.id === 'B'));
  });

  it('is a no-op for empty or stale position maps', () => {
    const graph = laidOut();
    expect(applyPositions(graph, {})).toEqual(graph);
    // Ids that no longer exist are simply ignored.
    expect(applyPositions(graph, { GONE: { x: 1, y: 1 } })).toEqual(graph);
  });
});

describe('KIND_SPECS completeness', () => {
  it('covers every kind with a localized label and add-node name', () => {
    for (const [kind, spec] of Object.entries(KIND_SPECS)) {
      expect(spec.label, kind).toBeTruthy();
      expect(spec.newNode, kind).toBeTruthy();
      // Kinds without edge syntax (pie, packet, radar, …) hide the palette;
      // linkable kinds may still have only structural edges (journey
      // 分组→任务) with a single implicit link type.
      if (spec.canLink === false) {
        expect(spec.links.length, kind).toBe(0);
      }
    }
  });

  it('every generated round-trip of an edited graph keeps a valid kind', () => {
    const graph: VGraph = {
      direction: 'TD',
      edges: [{ id: 'E1', source: 'A', target: 'B', type: 'msgSolidFilled' }],
      kind: 'sequence',
      nodes: [
        { id: 'A', label: 'A', shape: 'rect', x: 0, y: 0 },
        { id: 'B', label: 'B', shape: 'rect', x: 0, y: 0 }
      ]
    };
    expect(generateCode(graph)).toContain('sequenceDiagram');
  });
});

describe('untrusted-input hardening', () => {
  it('sanitizePositions keeps only finite-number entries', () => {
    expect(sanitizePositions(null)).toEqual({});
    expect(sanitizePositions('junk')).toEqual({});
    expect(sanitizePositions(42)).toEqual({});
    expect(
      sanitizePositions({
        A: { x: 1, y: 2 },
        BAD_INF: { x: 1, y: Number.POSITIVE_INFINITY },
        BAD_NAN: { x: Number.NaN, y: 2 },
        BAD_NULL: null,
        BAD_SHAPE: [1, 2],
        BAD_STR: { x: '1', y: 2 }
      })
    ).toEqual({ A: { x: 1, y: 2 } });
  });

  it('skips pathological single lines instead of stalling the parsers', () => {
    const longLine = '-'.repeat(50_000);
    for (const header of ['sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'erDiagram']) {
      const parsed = parseCode(`${header}\n    ${longLine}\n`);
      expect(parsed.ok, header).toBe(true);
      if (parsed.ok) {
        expect(parsed.result.skipped).toBeGreaterThan(0);
        expect(parsed.result.graph.edges).toHaveLength(0);
      }
    }
  });

  it('generates a pathologically deep mindmap without recursion overflow', () => {
    // 6000 nesting levels: the recursive emitter would blow the stack.
    const lines = ['mindmap'];
    for (let i = 0; i < 6000; i++) {
      lines.push(`${' '.repeat(i + 1)}(N${i})`);
    }
    const parsed = parseCode(lines.join('\n'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(() => generateCode(parsed.result.graph)).not.toThrow();
    expect(parsed.result.graph.nodes).toHaveLength(6000);
  });
});
