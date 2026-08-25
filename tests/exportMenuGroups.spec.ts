import { expect, test } from './test';

test.describe('导出菜单分组', () => {
  test('图像/文档与数据/插件导出三组标题与排布', async ({ page, editPage }) => {
    await editPage.openExportMenu();
    const menu = page.getByTestId('export-menu-list');

    await expect(menu).toContainText('图像');
    await expect(menu).toContainText('文档与数据');
    // 内置 MC 设计器默认安装 → 插件导出组存在
    await expect(menu).toContainText('插件导出');

    // 排布顺序：PNG（图像）→ Markdown（文档与数据）→ 插件项
    const pngBox = await page.getByTestId('download-PNG').boundingBox();
    const mdBox = await menu.getByText('Markdown（代码块）').boundingBox();
    const pluginBox = await page.getByTestId('plugin-export-mc-plugin').boundingBox();
    if (!pngBox || !mdBox || !pluginBox) {
      throw new Error('bounding box unavailable');
    }
    expect(pngBox.y).toBeLessThan(mdBox.y);
    expect(mdBox.y).toBeLessThan(pluginBox.y);
  });
});
