// Benchmark: renderView diagram placement
//
// Measures renderAndPlaceDiagram end-to-end DOM placement with mermaid's
// render mocked to return a fixed SVG (isolating our placement work:
// innerHTML swap + document-level querySelector + sizing fixups).
// jsdom's document-wide querySelector is a tree walk, which makes the
// scoping improvement visible; browsers optimize #id lookups more, so
// treat browser gains as bounded by these numbers.

import { bench, describe, vi } from 'vitest';

const SVG = `<svg id="graph-bench" xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><g><rect width="800" height="600" fill="#fff"></rect><text x="400" y="300">bench</text></g></svg>`;

vi.mock('../src/lib/util/mermaid', () => ({
  render: vi.fn(async (_config: unknown, _code: string, id: string) => ({
    bindFunctions: undefined,
    diagramType: 'flowchart-v2',
    svg: SVG.replace('graph-bench', id)
  }))
}));

import { renderAndPlaceDiagram } from '../src/lib/util/renderView';

const makeContainer = (id: string): HTMLDivElement => {
  const container = window.document.createElement('div');
  container.id = id;
  window.document.body.append(container);
  return container;
};

// A busy document makes document-level selector costs realistic.
for (let i = 0; i < 400; i++) {
  const decoy = window.document.createElement('div');
  decoy.className = 'decoy';
  decoy.innerHTML = `<span>decoy ${i}</span>`;
  window.document.body.append(decoy);
}

// The app reuses one stable #container across renders; mirror that instead
// of growing the DOM every iteration.
const container = makeContainer('bench-container');

let seq = 0;
describe('renderAndPlaceDiagram (mocked mermaid render)', () => {
  bench(
    'place svg into container',
    async () => {
      await renderAndPlaceDiagram({
        code: 'flowchart TD\n    A --> B',
        config: {},
        container,
        rough: false,
        viewId: `graph-${seq++}`
      });
    },
    { iterations: 200, warmupIterations: 20 }
  );
});
