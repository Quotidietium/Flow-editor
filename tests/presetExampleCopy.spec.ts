import { expect, test } from './test';

// 示例下拉项「复制代码」：借鉴骨架不必整图替换当前文档（只取不替）。
test.describe('示例代码复制', () => {
  test('复制示例代码入剪贴板且当前文档不受影响', async ({ page, context, editPage }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await editPage.toggleSampleDiagrams();
    const gridButton = (name: string) =>
      page.getByRole('button', { exact: true, name }).and(page.locator('[class*="flex-grow"]'));
    await gridButton('流程图').waitFor();

    // 打开任一带下拉类目（动态找首个触发钮，与循环 71 同策略）
    const trigger = page.locator('.flex.min-w-20.flex-grow [aria-label$="示例"]').first();
    await trigger.click();
    const copyButton = page.getByTestId('preset-example-copy').first();
    await expect(copyButton).toBeVisible();
    await copyButton.click();
    await expect(page.getByText(/已复制「.+」的代码/)).toBeVisible();

    // 剪贴板有非空代码（含 mermaid 图声明关键字之一）
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.length).toBeGreaterThan(0);
    expect(
      /flowchart|sequenceDiagram|stateDiagram|erDiagram|classDiagram|journey|gantt/.test(clipboard)
    ).toBe(true);

    // 当前文档不受影响（默认图仍在）
    await editPage.checkTextInView('圣诞节');
  });
});
