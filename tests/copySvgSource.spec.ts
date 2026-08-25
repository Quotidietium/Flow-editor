import { expect, test } from './test';

test.describe('复制 SVG 源码', () => {
  test('导出菜单一键复制渲染结果到剪贴板', async ({ page, context, editPage }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await editPage.checkTextInView('圣诞节');

    await editPage.openExportMenu();
    await page.getByTestId('copy-svg-source').click();

    await expect(page.getByText('已复制 SVG 源码')).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toContain('<svg');
    expect(clipboard).toContain('圣诞节');
    // 与下载同源的干净 SVG：补了 xlink 命名空间
    expect(clipboard).toContain('xmlns:xlink');
  });
});
