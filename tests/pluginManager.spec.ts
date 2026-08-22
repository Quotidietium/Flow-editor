import { expect, test } from './test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The dialog lives above a 1920-wide workspace; keep the desktop viewport.
test.use({ viewport: { height: 1080, width: 1920 } });

const EXAMPLES = join(process.cwd(), 'plugins', 'examples');

const openManager = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('plugin-manager-open').click();
  const manager = page.getByTestId('plugin-manager');
  await expect(manager).toBeVisible();
  return manager;
};

const installExample = async (
  page: import('@playwright/test').Page,
  fileName: string,
  cardId: string
) => {
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('plugin-install').click();
  const chooser = await chooserPromise;
  await chooser.setFiles(join(EXAMPLES, fileName));
  await expect(page.getByTestId(`plugin-card-${cardId}`)).toBeVisible({ timeout: 10_000 });
};

test('template library installs a working theme plugin', async ({ editPage, page }) => {
  void editPage;
  const manager = await openManager(page);

  await page.getByTestId('plugin-tab-templates').click();
  // All six templates listed with their action buttons.
  await expect(manager.locator('[data-testid^="template-card-"]')).toHaveCount(6);

  const before = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
  );
  await page.getByTestId('template-install-template.theme-ocean').click();
  await expect(page.getByTestId('template-install-template.theme-ocean')).toHaveText('已安装', {
    timeout: 10_000
  });

  // The installed theme applies immediately.
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()
      )
    )
    .toBe('210 80% 45%');
  expect(before).not.toBe('210 80% 45%');

  // …and the plugin shows up in the installed list.
  await page.getByTestId('plugin-tab-plugins').click();
  await expect(page.getByTestId('plugin-card-template.theme-ocean')).toBeVisible();
});

test('detail view shows manifest, permissions, hooks and source', async ({ editPage, page }) => {
  void editPage;
  await openManager(page);
  await installExample(page, 'mc-exporter.mjs', 'demo.mc-exporter');

  await page.getByTestId('plugin-info-demo.mc-exporter').click();
  const detail = page.getByTestId('plugin-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('MC 函数导出（示例）');
  await expect(detail).toContainText('demo.mc-exporter');
  await expect(detail).toContainText('v1.0.0');
  // Localized permission + hook summary.
  await expect(detail).toContainText('导出格式');
  await expect(detail).toContainText('MC 函数（.mcfunction）');
  // Storage namespace + source preview.
  await expect(detail).toContainText('flow-plugin:demo.mc-exporter');
  await expect(page.getByTestId('plugin-detail-source')).toContainText('tellraw');

  await page.getByTestId('plugin-detail-back').click();
  await expect(page.getByTestId('plugin-card-demo.mc-exporter')).toBeVisible();
});

test('exports a plugin back to a .mjs file', async ({ editPage, page }) => {
  void editPage;
  await openManager(page);
  await installExample(page, 'mc-exporter.mjs', 'demo.mc-exporter');

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('plugin-download-demo.mc-exporter').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('demo.mc-exporter.mjs');
  const text = readFileSync((await download.path()) as string, 'utf-8');
  expect(text).toContain("id: 'demo.mc-exporter'");
  expect(text).toContain('tellraw');
});

test('uninstall asks for confirmation and removes the plugin', async ({ editPage, page }) => {
  void editPage;
  const manager = await openManager(page);
  await installExample(page, 'input-cleaner.mjs', 'demo.input-cleaner');

  const uninstall = page.getByTestId('plugin-uninstall-demo.input-cleaner');
  await uninstall.click();
  // Two-step confirm: first click arms, second removes.
  await expect(uninstall).toHaveText('确认卸载？');
  await uninstall.click();
  await expect(page.getByTestId('plugin-card-demo.input-cleaner')).toHaveCount(0);
  await expect(manager.getByText('尚未安装插件')).toBeVisible();
});

test('MCP tab lists bridge tools and manages the HTTP service config', async ({
  editPage,
  page
}) => {
  void editPage;
  await openManager(page);
  await page.getByTestId('plugin-tab-mcp').click();

  // Bridge card: toolset listed, always-on badge.
  const tools = page.getByTestId('mcp-tool-list');
  await expect(tools).toContainText('get_code');
  await expect(tools).toContainText('set_code');
  await expect(tools).toContainText('render_svg');

  // Web build: HTTP server config persists but stays stopped.
  await expect(page.getByTestId('mcp-desktop-hint')).toBeVisible();
  await expect(page.getByTestId('mcp-http-status')).toHaveText('已停止');
  const port = page.getByTestId('mcp-port');
  await expect(port).toHaveValue('38528');

  // Invalid port: inline error + disabled save.
  await port.fill('80');
  await expect(page.getByTestId('mcp-save')).toBeDisabled();
  // Valid port: saves and sticks (localStorage).
  await port.fill('38529');
  await page.getByTestId('mcp-save').click();
  await expect(page.getByTestId('mcp-save')).toBeDisabled(); // clean again after save
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem('flowMcpConfig') ?? '{}')
  );
  expect(stored).toMatchObject({ enabled: false, port: 38_529 });
});
