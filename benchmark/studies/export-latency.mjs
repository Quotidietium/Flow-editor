// Study: PNG export latency (click -> download event)
//
// The export path used to sleep a fixed 1000ms waiting for the panZoom-off
// re-render. This study measures the real click-to-download latency against
// a running dev server, before and after replacing the sleep with an
// event-driven wait.
//
// Run (dev server must be up on :3000):
//   node benchmark/studies/export-latency.mjs

import { chromium } from '@playwright/test';

const RUNS = 5;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });

// Warm-up: the first /edit visit triggers Vite's optimize-deps full reload.
await page.goto('http://localhost:3000/edit');
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(1200);
await page.goto('http://localhost:3000/edit');
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(800);

// The Actions card starts collapsed (like the e2e fixture expands it).
await page.getByText('Actions', { exact: true }).click();
await page.getByTestId('download-PNG').waitFor({ state: 'visible' });

const samples = [];
for (let i = 0; i < RUNS; i++) {
  const start = performance.now();
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.getByTestId('download-PNG').click();
  await downloadPromise;
  samples.push(performance.now() - start);
  await page.waitForTimeout(400); // let the panZoom restore settle
}

console.log('| run | click -> download (ms) |');
console.log('|-----|-------------------------|');
samples.forEach((ms, i) => console.log(`| ${i + 1} | ${ms.toFixed(0)} |`));
console.log(`\nmedian: ${median(samples).toFixed(0)} ms (n=${RUNS})`);

await browser.close();
