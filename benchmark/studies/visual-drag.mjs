// Study: visual canvas drag performance
//
// Loads a generated 300-edge flowchart via a pako share URL, enters Visual
// mode and drags a node with 40 scripted pointer moves. Reports the
// temporary instrumentation counters (generateCode / getBoundingClientRect /
// edgeAnchor calls, see note/report/perf/round9) plus the number of animation
// frames rendered during the drag (higher = smoother).
//
// Run with the dev server up: node benchmark/studies/visual-drag.mjs

import { fromUint8Array } from 'js-base64';
import { deflate } from 'pako';
import { chromium } from '@playwright/test';

const EDGES = 300;

const genCode = (edges) => {
  const words = ['checkout', 'payment', 'inventory', 'notify', 'invoice', 'shipping'];
  const lines = ['flowchart TD'];
  for (let i = 0; i < edges; i++) {
    const to = (i * 3 + 1) % (edges + 1) === i ? i + 1 : (i * 3 + 1) % (edges + 1);
    // All rect nodes so drag coordinates always hit a solid shape.
    lines.push(`    N${i}[Node ${i} ${words[i % words.length]}] -->|edge ${i}| N${to}[T ${to}]`);
  }
  return `${lines.join('\n')}\n`;
};

const state = {
  code: genCode(EDGES),
  grid: true,
  mermaid: '{\n  "theme": "default"\n}',
  panZoom: true,
  rough: false,
  updateDiagram: true
};
const hash = `pako:${fromUint8Array(deflate(new TextEncoder().encode(JSON.stringify(state)), { level: 6 }), true)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { height: 1080, width: 1920 } });

await page.goto(`http://localhost:3000/edit#${hash}`);
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(1500);
await page.goto(`http://localhost:3000/edit#${hash}`);
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(500);

// Enter visual mode and wait for the canvas.
await page.getByTestId('visual-tab').click();
await page.getByTestId('visual-canvas').waitFor({ state: 'visible' });
await page.waitForTimeout(800); // parse + layout of the 300-edge graph

const reset = () =>
  page.evaluate(() => {
    globalThis.__genCalls = 0;
    globalThis.__gbcrCalls = 0;
    globalThis.__anchorCalls = 0;
    globalThis.__frames = 0;
    const loop = () => {
      globalThis.__frames++;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });

const read = () =>
  page.evaluate(() => ({
    anchors: globalThis.__anchorCalls ?? 0,
    frames: globalThis.__frames ?? 0,
    gbcr: globalThis.__gbcrCalls ?? 0,
    gen: globalThis.__genCalls ?? 0
  }));

// Collapse the generated-code panel so the canvas gets the full pane height.
await page.getByRole('button').filter({ hasText: '生成的代码' }).click();
await page.waitForTimeout(200);

// Find the first node fully visible inside the canvas viewport (nodes may
// lay out below the fold; page-coordinate drags must hit the actual shape).
const target = await page.evaluate(() => {
  const svg = document.querySelector('svg[role="application"]');
  const container = svg.closest('[data-testid="visual-canvas"]');
  const cRect = container.getBoundingClientRect();
  for (const g of svg.querySelectorAll('g')) {
    const r = g.getBoundingClientRect();
    if (
      r.width > 100 &&
      r.top > cRect.top + 10 &&
      r.bottom < cRect.bottom - 10 &&
      r.left > cRect.left + 10 &&
      r.right < cRect.right - 10
    ) {
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
  return undefined;
});
if (!target) {
  throw new Error('no visible node to drag');
}
const startX = target.x;
const startY = target.y;

await reset();
await page.mouse.move(startX, startY);
await page.mouse.down();
for (let i = 1; i <= 40; i++) {
  await page.mouse.move(startX + i * 3, startY + i * 2);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(300);
const after = await read();
// The dragged node moved away from its original spot: the point it occupied
// no longer resolves to a node <g>.
const moved = await page.evaluate(
  ([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el?.closest('g') ? 'no' : 'yes';
  },
  [startX, startY]
);

console.log('| metric (40-move node drag, 300-edge graph) | value |');
console.log('|--------------------------------------------|-------|');
console.log(`| generateCode calls | ${after.gen} |`);
console.log(`| edgeAnchor calls | ${after.anchors} |`);
console.log(`| getBoundingClientRect calls | ${after.gbcr} |`);
console.log(`| animation frames during drag | ${after.frames} |`);
console.log(`| dragged node moved (bbox x changed) | ${moved} |`);

await browser.close();
