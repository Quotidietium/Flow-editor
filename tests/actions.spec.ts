import { expect, test } from './test';

// The actions card (save/open/export rows) must be in view; the project's
// 1280x720 override hides the lower rows.
test.use({ viewport: { height: 1080, width: 1920 } });

test.describe('Check actions', () => {
  test('should download png and svg', async ({ editPage }) => {
    test.slow();
    const firstPngSize = await editPage.checkAndDownloadPNG(20_000);
    const firstSvgSize = await editPage.downloadSVG(10_000);

    // Verify downloaded file is different for different diagrams
    await editPage.toggleSampleDiagrams();
    await editPage.loadSampleDiagram('实体关系图');

    const secondPngSize = await editPage.checkAndDownloadPNG(20_000);
    const secondSvgSize = await editPage.downloadSVG(10_000);

    // Verify files are actually different
    expect(firstPngSize).not.toBe(secondPngSize);
    expect(firstSvgSize).not.toBe(secondSvgSize);
  });
});

import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('saves the source locally and exports every text format', async ({ editPage, page }) => {
  test.slow();
  await editPage.ensureActionsOpen();
  const mmdPromise = page.waitForEvent('download');
  await page.getByTestId('save-mmd').click();
  const mmd = await mmdPromise;
  expect(mmd.suggestedFilename()).toMatch(/\.mmd$/);
  const mmdPath = await mmd.path();
  expect(readFileSync(mmdPath as string, 'utf-8')).toContain('flowchart TD');

  await editPage.openExportMenu();
  const menu = page.getByTestId('export-menu-list');
  await expect(menu).toBeVisible();

  const svgPromise = page.waitForEvent('download');
  await page.getByTestId('download-SVG').click();
  const svg = await svgPromise;
  expect(svg.suggestedFilename()).toMatch(/\.svg$/);

  await editPage.openExportMenu();
  const mdPromise = page.waitForEvent('download');
  await menu.getByRole('button', { name: /Markdown/ }).click();
  const md = await mdPromise;
  expect(md.suggestedFilename()).toMatch(/\.md$/);
  expect(readFileSync((await md.path()) as string, 'utf-8')).toContain('```mermaid');

  await editPage.openExportMenu();
  const jsonPromise = page.waitForEvent('download');
  await menu.getByRole('button', { name: /状态文件/ }).click();
  const json = await jsonPromise;
  expect(json.suggestedFilename()).toMatch(/\.json$/);
  const stateFile = JSON.parse(readFileSync((await json.path()) as string, 'utf-8'));
  expect(stateFile.code).toContain('flowchart TD');
  expect(stateFile.version).toBe(1);
});

test('exports raster and PDF formats', async ({ editPage, page }) => {
  // Three panZoom round-trips (webp/jpeg/pdf) under parallel load can exceed
  // the 90s a bare test.slow() grants on this host.
  test.setTimeout(180_000);
  await editPage.openExportMenu();
  const webpPromise = page.waitForEvent('download');
  await page.getByTestId('download-webp').click();
  const webp = await webpPromise;
  expect(webp.suggestedFilename()).toMatch(/\.webp$/);
  expect(readFileSync((await webp.path()) as string).length).toBeGreaterThan(2000);

  await editPage.openExportMenu();
  const jpegPromise = page.waitForEvent('download');
  await page.getByTestId('download-jpeg').click();
  const jpeg = await jpegPromise;
  expect(jpeg.suggestedFilename()).toMatch(/\.jpg$/);

  await editPage.openExportMenu();
  const pdfPromise = page.waitForEvent('download');
  await page.getByTestId('download-pdf').click();
  const pdf = await pdfPromise;
  expect(pdf.suggestedFilename()).toMatch(/\.pdf$/);
  const pdfBytes = readFileSync((await pdf.path()) as string);
  expect(pdfBytes.length).toBeGreaterThan(1000);
  expect(pdfBytes.subarray(0, 4).toString()).toBe('%PDF');
});

test('opens a local .mmd file into the editor', async ({ editPage, page }) => {
  await editPage.ensureActionsOpen();
  const sample = 'pie\n  "Dogs" : 386\n  "Cats" : 85\n';
  const tmp = join(tmpdir(), `flow-e2e-${Date.now()}.mmd`);
  writeFileSync(tmp, sample, 'utf-8');

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('open-file').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(tmp);
  await expect(page.locator('.monaco-editor')).toContainText('Dogs');
  await expect(page.locator('#container')).toContainText('Dogs');
});
