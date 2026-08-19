// Study: editor sync-effect marker applications per interaction
//
// Counts how often the DesktopEditor effect applies Monaco markers during a
// scripted interaction: one canvas drag (pan/zoom publishes per pointer
// move), tab switches, and broken-code typing (markers must keep updating).
//
// Requires the temporary `globalThis.__markerCalls` instrumentation in
// DesktopEditor.svelte (see note/report/perf/round8). Run with the dev
// server up: node benchmark/studies/editor-sync-calls.mjs

import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });

await page.goto('http://localhost:3000/edit');
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(1200);
await page.goto('http://localhost:3000/edit');
await page.locator('#view').waitFor({ state: 'visible' });
await page.waitForTimeout(800);

const readCalls = () => page.evaluate(() => globalThis.__markerCalls ?? 0);

// 1. Canvas drag: pan events publish state continuously; code unchanged.
const beforeDrag = await readCalls();
const view = await page.locator('#view').boundingBox();
await page.mouse.move(view.x + 400, view.y + 300);
await page.mouse.down();
for (let i = 1; i <= 30; i++) {
  await page.mouse.move(view.x + 400 + i * 8, view.y + 300 + i * 3);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(500);
const afterDrag = await readCalls();

// 2. Tab switches between Code and Config.
for (let i = 0; i < 6; i++) {
  await page
    .getByRole('tab')
    .getByText(i % 2 ? 'Code' : 'Config')
    .click();
  await page.waitForTimeout(150);
}
const afterTabs = await readCalls();

// 3. Typing broken code: markers legitimately change and must be applied.
await page.getByRole('tab').getByText('Code').click();
await page.locator('.monaco-editor').click();
await page.keyboard.press('Control+KeyA');
await page.keyboard.type('flowchart TD\n    A[broken', { delay: 40 });
await page.waitForTimeout(800);
const afterTyping = await readCalls();

console.log('| interaction | marker applications |');
console.log('|-------------|---------------------|');
console.log(`| canvas drag (30 pointer moves) | ${afterDrag - beforeDrag} |`);
console.log(`| 6 tab switches | ${afterTabs - afterDrag} |`);
console.log(`| typing broken code (~20 keys) | ${afterTyping - afterTabs} |`);

await browser.close();
