import { describe, expect, it } from 'vitest';
import { parse } from '../mermaid';
import {
  COORD_KINDS,
  detectDiagramKind,
  generateCode,
  KIND_SPECS,
  layoutGraph,
  parseCode
} from './model';

// Same round-trip contract as model.multikind.test.ts: the first regeneration
// may normalize formatting (indentation, dropped no-op lines, merged lines),
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

const assertParses = async (code: string): Promise<void> => {
  await expect(parse(code), code.slice(0, 60)).resolves.toBeTruthy();
};

// @zenuml/core touches localStorage at module scope; this Windows vitest
// environment has no localStorage (same pre-existing limitation that fails
// the persist/state suites locally — CI Linux has it). The mermaid validity
// check for zenuml is therefore conditional; the round-trip itself is not.
const localStorageAvailable = (() => {
  try {
    window.localStorage.getItem('x');
    return true;
  } catch {
    return false;
  }
})();

const roundTripKind = async (kind: string, code: string): Promise<string> => {
  const parsed = parseCode(code);
  expect(parsed.ok, kind).toBe(true);
  if (!parsed.ok) {
    throw new Error('unreachable');
  }
  expect(parsed.result.graph.kind, kind).toBe(kind);
  const generated = roundTrip(code);
  if (kind !== 'zenuml' || localStorageAvailable) {
    await assertParses(generated);
  }
  return generated;
};

// Fixtures follow the official @mermaid-js/examples shapes.
const FIXTURES: Record<string, string> = {
  architecture: `architecture-beta
    group api(cloud)[API]
    service db(database)[Database] in api
    service disk1(disk)[Storage] in api
    service server(server)[Server] in api
    db:L -- R:server
    disk1:T -- B:server
`,
  block: `block-beta
  columns 3
  user(("User")):3
  ui["Web UI"] api["API Server"] db[("Database")]
  user --> ui
  ui --> api
  api --> db
`,
  c4: `C4Context
    title System Context diagram
    Person(customerA, "Customer A", "A customer of the bank.")
    System(SystemAA, "Internet Banking System", "Allows customers to view accounts.")
    Rel(customerA, SystemAA, "Uses")
    Rel_Back(SystemAA, customerA, "Answers")
`,
  cynefin: `cynefin-beta
  title Incident Response
  complex
    "Investigate root cause"
  complicated
    "Analyze performance data"
  complex --> complicated : "Pattern identified"
`,
  eventmodeling: `eventmodeling
tf 01 ui ShopUI
tf 02 cmd AddItemToCart
tf 03 evt ItemAdded
tf 04 rmo CartView ->> 03
`,
  gantt: `gantt
    title Product Launch Plan
    dateFormat YYYY-MM-DD
    section Planning
        Market research      :done, research, 2024-03-01, 10d
        Define requirements  :reqs, after research, 7d
    section Build
        Design prototype     :proto, 2024-03-15, 14d
`,
  git: `gitGraph
    commit id: "a3f82c1"
    branch develop
    checkout develop
    commit id: "b7e41d9"
    commit id: "c9d52e4"
    checkout main
    merge develop id: "d4e8f3a" tag: "v1.0"
`,
  ishikawa: `ishikawa-beta
    Blurry Photo
    Process
        Out of focus
        Shutter speed too slow
    User
        Shaky hands
`,
  journey: `journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me, Cat
    section Go home
      Sit down: 5: Me
`,
  kanban: `kanban
todo[Todo]
  docs[Create documentation]@{ priority: 'Low' }
inProgress[In progress]
  renderer[Improve renderer]@{ assigned: 'knsv' }
`,
  packet: `packet-beta
    0-15: "Source Port"
    16-31: "Destination Port"
    32-63: "Sequence Number"
`,
  pie: `pie title Pets adopted by volunteers
    "Dogs" : 386
    "Cats" : 85
`,
  quadrant: `quadrantChart
    title Reach and engagement
    x-axis Low Reach --> High Reach
    y-axis Low Engagement --> High Engagement
    quadrant-1 We should expand
    Campaign A: [0.3, 0.6]
    Campaign B: [0.45, 0.23]
`,
  radar: `radar-beta
  axis m["Math"], s["Science"], e["English"]
  curve a["Alice"]{85, 90, 80}
  curve b["Bob"]{70, 75, 85}
  max 100
  min 0
`,
  railroad: `railroad-ebnf-beta
    title Expression Grammar
    expression = term ( "+" term | "-" term )* ;
    term = factor ( "*" factor | "/" factor )* ;
`,
  requirement: `requirementDiagram
    requirement rider_safety {
        id: 1
        text: Riders must be able to stop safely.
    }
    element brake {
    }
    rider_safety - contains -> brake
`,
  sankey: `sankey-beta
Salary,Budget,3000
Freelance work,Budget,1200
Budget,Rent,1300
Budget,Savings,1700
`,
  swimlane: `swimlane-beta
Alpha
  task1
  task2
Beta
  task3
`,
  timeline: `timeline
    title History of Social Media
    2002 : LinkedIn
    2004 : Facebook
         : Google
    2005 : YouTube
`,
  treemap: `treemap-beta
"Monthly Budget"
    "Housing"
        "Rent": 1400
        "Utilities": 220
    "Food"
        "Groceries": 480
`,
  treeview: `treeView-beta
my-project/
    src/
        App.tsx
    README.md
`,
  venn: `venn-beta
    set Desirable
    set Feasible
    set Viable
    union Desirable,Feasible["Worth prototyping"]
    union Desirable,Feasible,Viable["Sweet spot"]
`,
  wardley: `wardley-beta
title Tea Shop
anchor Business [0.95, 0.63]
component Cup of Tea [0.79, 0.61]
component Kettle [0.43, 0.35]
Business -> Cup of Tea
Cup of Tea -> Kettle
evolve Kettle 0.62
`,
  xychart: `xychart-beta
    title "Sales Revenue"
    x-axis [jan, feb, mar]
    y-axis "Revenue" 4000 --> 11000
    bar [5000, 6000, 7500]
    line [5000, 5500, 7000]
`,
  zenuml: `zenuml
title: demo
participant Alice
actor Bob
Alice->Bob: hello
Bob-->Alice: fine
`
};

describe('all extra kinds round-trip and generate valid mermaid', () => {
  for (const [kind, code] of Object.entries(FIXTURES)) {
    it(`${kind}: fixed point + valid output`, async () => {
      await roundTripKind(kind, code);
    });
  }
});

describe('detectDiagramKind for extra kinds', () => {
  it('maps every fixture header to its kind (frontmatter included)', () => {
    for (const [kind, code] of Object.entries(FIXTURES)) {
      expect(detectDiagramKind(code), kind).toBe(kind);
    }
    expect(detectDiagramKind(`---\nconfig:\n  kanban:\n    a: b\n---\nkanban\n`)).toBe('kanban');
  });

  it('recognizes header variants', () => {
    expect(detectDiagramKind('gitGraph\n commit')).toBe('git');
    expect(detectDiagramKind('C4Container\n Container(c, "C")')).toBe('c4');
    expect(detectDiagramKind('ishikawa\n Root')).toBe('ishikawa');
    expect(detectDiagramKind('packet\n 0-7: "A"')).toBe('packet');
    expect(detectDiagramKind('treemap\n"a": 1')).toBe('treemap');
    expect(detectDiagramKind('railroad-peg-beta\n a <- b ;')).toBe('railroad');
    expect(detectDiagramKind('railroad-beta\n a = terminal("x") ;')).toBe('railroad');
  });

  it('still rejects the info debug diagram and garbage', () => {
    expect(detectDiagramKind('info')).toBeUndefined();
    expect(detectDiagramKind('random text\nmore')).toBeUndefined();
  });
});

describe('structural spot checks', () => {
  it('journey keeps section membership as edges and task scores in details', () => {
    const parsed = parseCode(FIXTURES.journey as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    const sections = graph.nodes.filter((n) => n.role === 'section');
    expect(sections).toHaveLength(2);
    const tea = graph.nodes.find((n) => n.label === 'Make tea');
    expect(tea?.detail).toBe('5: Me');
    expect(graph.edges.some((e) => e.source === sections[0]?.id && e.target === tea?.id)).toBe(
      true
    );
  });

  it('kanban columns and tickets keep their source ids and attr tails', () => {
    const parsed = parseCode(FIXTURES.kanban as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    expect(graph.nodes.find((n) => n.id === 'todo')?.role).toBe('column');
    const renderer = graph.nodes.find((n) => n.id === 'renderer');
    expect(renderer?.role).toBe('ticket');
    expect(renderer?.detail).toBe(`@{ assigned: 'knsv' }`);
  });

  it('git replays branches and merges deterministically', () => {
    const generated = roundTrip(FIXTURES.git as string);
    expect(generated).toContain('branch develop');
    expect(generated).toContain('checkout main');
    expect(generated).toContain('merge develop id: "d4e8f3a" tag: "v1.0"');
    expect(generated.indexOf('branch develop')).toBeLessThan(generated.indexOf('merge develop'));
  });

  it('quadrant positions derive from code coordinates both ways', () => {
    const generated = roundTrip(FIXTURES.quadrant as string);
    expect(generated).toContain('Campaign A: [0.3, 0.6]');
    expect(generated).toContain('quadrant-1 We should expand');
    const parsed = parseCode(FIXTURES.quadrant as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const laid = layoutGraph(parsed.result.graph);
    expect(COORD_KINDS.has('quadrant')).toBe(true);
    // 0.3/0.6 map onto the coordinate canvas: x = 80 + 0.3*1840
    const a = laid.nodes.find((n) => n.label === 'Campaign A');
    expect(a?.x).toBeCloseTo(632, 5);
    expect(a?.y).toBeCloseTo(824, 5);
  });

  it('wardley keeps edges, evolve and notes through the round-trip', () => {
    const generated = roundTrip(FIXTURES.wardley as string);
    expect(generated).toContain('Business -> Cup of Tea');
    expect(generated).toContain('evolve Kettle 0.62');
    expect(generated).toContain('[0.95, 0.63]');
  });

  it('radar keeps axis and curve tokens in separate namespaces', () => {
    const parsed = parseCode(FIXTURES.radar as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const { graph } = parsed.result;
    expect(graph.nodes.filter((n) => n.role === 'axis')).toHaveLength(3);
    expect(graph.nodes.filter((n) => n.role === 'curve')).toHaveLength(2);
    const generated = roundTrip(FIXTURES.radar as string);
    expect(generated).toContain('axis m["Math"]');
    expect(generated).toContain('curve a["Alice"]{85, 90, 80}');
  });

  it('block splits multi-declaration lines without losing nodes', () => {
    const parsed = parseCode(FIXTURES.block as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const ids = parsed.result.graph.nodes.map((n) => n.id);
    for (const id of ['user', 'ui', 'api', 'db']) {
      expect(ids, id).toContain(id);
    }
  });

  it('eventmodeling regenerates the ->> read-model link', () => {
    const generated = roundTrip(FIXTURES.eventmodeling as string);
    expect(generated).toContain('tf 04 rmo CartView ->> 03');
  });

  it('timeline merges continuation events under the previous period', () => {
    const generated = roundTrip(FIXTURES.timeline as string);
    expect(generated).toContain('2004 : Facebook : Google');
  });

  it('railroad keeps the peg operator variant', () => {
    const generated = roundTrip('railroad-peg-beta\n    a <- b ;\n');
    expect(generated).toContain('a <- b ;');
  });

  it('frontmatter is preserved verbatim across the round-trip', () => {
    const frontmatter = `---
config:
  kanban:
    ticketBaseUrl: 'https://example.com/#TICKET#'
---`;
    const generated = roundTrip(`${frontmatter}\nkanban\n  todo[T]\n    t1[A]\n`);
    expect(generated.startsWith(`${frontmatter}\n`)).toBe(true);
  });

  it('zenuml participants and message arrows survive normalization', () => {
    const generated = roundTrip(FIXTURES.zenuml as string);
    expect(generated).toContain('participant Alice');
    expect(generated).toContain('actor Bob');
    expect(generated).toContain('Bob-->Alice: fine');
  });
});

describe('edited graphs still generate valid mermaid', () => {
  it('a new orphan journey task lands in a virtual section', async () => {
    const parsed = parseCode(FIXTURES.journey as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const graph = parsed.result.graph;
    graph.nodes.push({ id: 'T99', label: '落单任务', role: 'task', shape: 'rect', x: 0, y: 0 });
    const generated = generateCode(graph);
    await assertParses(generated);
    expect(generated).toContain('落单任务');
  });

  it('git tolerates a deleted merge edge by degrading to a plain commit', async () => {
    const parsed = parseCode(FIXTURES.git as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const graph = parsed.result.graph;
    graph.edges = graph.edges.filter((e) => e.role !== 'mergeFrom');
    const generated = generateCode(graph);
    expect(generated).not.toContain('merge');
    await assertParses(generated);
  });

  it('pie values are editable and default to 1', async () => {
    const parsed = parseCode(FIXTURES.pie as string);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const graph = parsed.result.graph;
    graph.nodes.push({ id: 'S9', label: '新切片', role: undefined, shape: 'rect', x: 0, y: 0 });
    const generated = generateCode(graph);
    expect(generated).toContain('"新切片": 1');
    await assertParses(generated);
  });
});

describe('untrusted-input hardening for extra kinds', () => {
  it('skips pathological single lines in every extra parser', () => {
    const longLine = 'x'.repeat(50_000);
    const headers = [
      ['journey', 'journey\n'],
      ['timeline', 'timeline\n'],
      ['kanban', 'kanban\n'],
      ['gantt', 'gantt\n'],
      ['pie', 'pie\n'],
      ['radar', 'radar-beta\n'],
      ['xychart', 'xychart-beta\n'],
      ['packet', 'packet-beta\n'],
      ['venn', 'venn-beta\n'],
      ['cynefin', 'cynefin-beta\n'],
      ['sankey', 'sankey-beta\n'],
      ['git', 'gitGraph\n'],
      ['c4', 'C4Context\n'],
      ['architecture', 'architecture-beta\n'],
      ['requirement', 'requirementDiagram\n'],
      ['eventmodeling', 'eventmodeling\n'],
      ['ishikawa', 'ishikawa-beta\n'],
      ['quadrant', 'quadrantChart\n'],
      ['wardley', 'wardley-beta\n'],
      ['zenuml', 'zenuml\n']
    ] as const;
    for (const [kind, header] of headers) {
      const parsed = parseCode(`${header}    ${longLine}\n`);
      expect(parsed.ok, kind).toBe(true);
      if (parsed.ok) {
        expect(parsed.result.skipped, kind).toBeGreaterThan(0);
        expect(parsed.result.graph.edges).toHaveLength(0);
      }
    }
  });

  it('quadrant clamps out-of-range coordinates into [0, 1]', () => {
    const parsed = parseCode('quadrantChart\n    P: [17, -4]\n');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const node = parsed.result.graph.nodes[0];
    expect(node?.roleData).toBe('[1, 0]');
    const generated = generateCode(parsed.result.graph);
    expect(generated).toContain('[1, 0]');
  });
});

describe('KIND_SPECS completeness for all kinds', () => {
  it('every known kind has a spec, and unlinked kinds have no link palette', () => {
    const kinds = new Set(Object.keys(KIND_SPECS));
    for (const kind of Object.keys(FIXTURES)) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(Object.keys(KIND_SPECS)).toHaveLength(31);
    for (const [kind, spec] of Object.entries(KIND_SPECS)) {
      if (spec.canLink === false) {
        expect(spec.links.length, kind).toBe(0);
      }
    }
  });

  it('every kind emits its header for an empty graph', () => {
    const headers: Record<string, string> = {
      architecture: 'architecture-beta',
      block: 'block-beta',
      c4: 'C4Context',
      class: 'classDiagram',
      cynefin: 'cynefin-beta',
      er: 'erDiagram',
      eventmodeling: 'eventmodeling',
      flowchart: 'flowchart',
      gantt: 'gantt',
      git: 'gitGraph',
      ishikawa: 'ishikawa-beta',
      journey: 'journey',
      kanban: 'kanban',
      mindmap: 'mindmap',
      packet: 'packet-beta',
      pie: 'pie',
      quadrant: 'quadrantChart',
      radar: 'radar-beta',
      railroad: 'railroad-ebnf-beta',
      requirement: 'requirementDiagram',
      sankey: 'sankey-beta',
      sequence: 'sequenceDiagram',
      state: 'stateDiagram-v2',
      swimlane: 'swimlane-beta',
      timeline: 'timeline',
      treemap: 'treemap-beta',
      treeview: 'treeView-beta',
      venn: 'venn-beta',
      wardley: 'wardley-beta',
      xychart: 'xychart-beta',
      zenuml: 'zenuml'
    };
    for (const [kind, header] of Object.entries(headers)) {
      const out = generateCode({
        direction: 'TD',
        kind: kind as keyof typeof KIND_SPECS,
        edges: [],
        nodes: []
      });
      expect(out.startsWith(header), kind).toBe(true);
    }
  });
});
