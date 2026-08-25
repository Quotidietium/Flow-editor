import { expect, test } from './test';

test.describe('/view 只读页', () => {
  test('有缩放工具与「在编辑器中打开」回链', async ({ page, editPage }) => {
    // 拿到当前图的 /view 链接（fixture 已加载默认图）
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    const editUrl = page.url();
    const viewUrl = editUrl.replace('/edit', '/view');
    await page.goto(viewUrl);

    // 图表渲染
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    // 缩放工具：读数存在，放大后读数上升
    const readout = page.getByTestId('zoom-level');
    await expect(readout).toBeVisible();
    const before = Number.parseInt((await readout.textContent()) ?? '0', 10);
    await page.getByRole('button', { name: '放大' }).click();
    await expect
      .poll(async () => Number.parseInt((await readout.textContent()) ?? '0', 10))
      .toBeGreaterThan(before);

    // 回链指向 /edit#pako 且可回到编辑器
    const link = page.getByTestId('view-edit-link');
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', /\/edit#pako:/);
    await link.click();
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 });
    await editPage.checkTextInView('圣诞节');
  });

  test('下载 SVG：干净图形（剥掉平移/缩放包装）', async ({ page }) => {
    await page.goto('/edit');
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    const viewUrl = page.url().replace('/edit', '/view');
    await page.goto(viewUrl);
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    // 先缩放一下：现场带着 pan-zoom 变换，验证下载件不受其影响
    await page.getByRole('button', { name: '放大' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('view-download-svg').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^mermaid-diagram-.*\.svg$/);

    const path = await download.path();
    const content = await import('node:fs/promises').then((fs) => fs.readFile(path, 'utf8'));
    expect(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(content).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
    // pan-zoom 的 matrix 变换被剥掉（下载件呈现完整图形而非屏幕视角）
    expect(content).not.toContain('matrix(');
    await expect(page.getByText('已下载 SVG')).toBeVisible();
  });

  test('下载 PNG：干净图形光栅化（IHDR 尺寸可读、长边 1080）', async ({ page }) => {
    await page.goto('/edit');
    await page.waitForFunction(
      () => (window as unknown as { __FLOW_EDITOR_API__?: unknown }).__FLOW_EDITOR_API__
    );
    const viewUrl = page.url().replace('/edit', '/view');
    await page.goto(viewUrl);
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    // 缩放现场不影响下载件
    await page.getByRole('button', { name: '放大' }).click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('view-download-png').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^mermaid-diagram-.*\.png$/);
    await expect(page.getByText('已下载 PNG')).toBeVisible();

    // PNG 魔数 + IHDR 大端尺寸（bytes 16-24）：长边恰为 1080
    const path = await download.path();
    const bytes = await import('node:fs/promises').then((fs) => fs.readFile(path));
    expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    expect(Math.max(width, height)).toBe(1080);
    expect(Math.min(width, height)).toBeGreaterThan(0);
  });

  test('复制链接：观看者再分享免手选地址栏', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/edit');
    // 等 #pako 落地址栏再换 /view——hash 经 250ms 去抖写入，waitForFunction
    // 只证明桥就绪不证明 hash 已写（裸 /view 进页 = 默认图）。
    await page.waitForURL(/#pako:/);
    const viewUrl = page.url().replace('/edit', '/view');
    await page.goto(viewUrl);
    await expect(page.locator('#container')).toContainText('圣诞节', { timeout: 15_000 });

    await page.getByTestId('view-copy-link').click();
    await expect(page.getByText('已复制链接')).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('/view#pako:');
  });
});
