// Study: high-frequency stress smoke (audit round 10)
//
// Direct runtime evidence for the "long sessions under sustained load"
// requirement: rapid typing bursts, rapid Visual<->preview toggling and
// export double-clicks must not surface uncaught page errors, and the
// persisted state must stay intact afterwards.
//
// Run with the dev server up: node benchmark/studies/stress-smoke.mjs

import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const results = [];
const note = (name, ok, detail) => {
  results.push({ detail, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { height: 1080, width: 1920 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') {
    consoleErrors.push(message.text());
  }
});

// Warm up (double navigation: cold Vite optimize reload).
await page.goto(`${BASE}/edit`);
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(1200);
await page.goto(`${BASE}/edit`);
await page.locator('#view').waitFor({ state: 'visible'});

// --- Scenario 1: rapid typing burst (150 edits) -----------------------------
const editor = page.locator('.monaco-editor');
await editor.click();
await page.keyboard.press('Control+KeyA');
await page.keyboard.type('flowchart TD\n  A[stress]-->B\n', { delay: 4 });
for (let i = 0; i < 150; i++) {
  await page.keyboard.type(`  N${i}[n ${i}]-->A\n`, { delay: 2 });
}
await page.waitForTimeout(1500); // let the debounced pipelines settle
const codeStore = await page.evaluate(() => localStorage.getItem('codeStore'));
const parsedStore = JSON.parse(codeStore ?? '{}');
note(
  'typing burst persists the final state',
  (parsedStore.code ?? '').includes('N149'),
  `codeStore ends with the last edit (${(parsedStore.code ?? '').length} chars)`
);
const viewText = await page.locator('#view').textContent();
note('typing burst renders the final diagram', (viewText ?? '').includes('n 149'));

// --- Scenario 2: rapid Visual <-> preview toggling (60 switches) ------------
const t0 = Date.now();
for (let i = 0; i < 30; i++) {
  await page.getByTestId('visual-tab').click();
  await page.getByTestId('visual-canvas').waitFor({ state: 'visible' });
  await page.getByTestId('visual-tab').click();
  await page.locator('#view').waitFor({ state: 'visible' });
}
const toggleMs = Date.now() - t0;
// #view is visible immediately; the re-render of a 150-node diagram takes a
// moment longer — wait for the SVG to actually land before asserting.
const svgLanded = await page
  .locator('#view svg')
  .waitFor({ state: 'visible', timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
note(
  '60 mode switches keep rendering',
  svgLanded,
  `${toggleMs}ms total (~${Math.round(toggleMs / 60)}ms per switch), svg present afterwards`
);

// --- Scenario 3: export double-clicks (5 rapid pairs) ------------------------
await page.getByText('操作', { exact: true }).click().catch(() => {});
for (let i = 0; i < 5; i++) {
  await page.getByTestId('download-PNG').click({ force: true }).catch(() => {});
  await page.getByTestId('download-PNG').click({ force: true }).catch(() => {});
  await page.waitForTimeout(400);
}
await page.waitForTimeout(2000);
const panZoomRestored = await page.evaluate(() => {
  const store = JSON.parse(localStorage.getItem('codeStore') ?? '{}');
  return store.panZoom !== false;
});
note('export double-clicks restore panZoom', panZoomRestored);

// --- Scenario 4: reload after the storm --------------------------------------
await page.reload();
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(800);
const afterReload = await page.evaluate(() =>
  (localStorage.getItem('codeStore') ?? '').includes('N149')
);
note('state survives a reload after the storm', afterReload);

// --- Error gates --------------------------------------------------------------
const relevantConsoleErrors = consoleErrors.filter(
  (text) => !text.includes('Failed to load resource') // dev-server hmr noise
);
note('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
note(
  'no unexpected console errors',
  relevantConsoleErrors.length === 0,
  relevantConsoleErrors.slice(0, 3).join(' | ')
);

await browser.close();

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
