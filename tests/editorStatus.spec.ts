import { expect, test } from './test';

test.describe('编辑器状态栏', () => {
  test('显示光标行列与总行数，随交互更新', async ({ page, editPage }) => {
    const status = page.getByTestId('editor-status');
    await expect(status).toBeVisible();
    // 默认图 7 行（含尾换行）；初始光标随状态同步落在文档尾
    await expect(status).toContainText(/行 \d+，列 \d+/);
    await expect(status).toContainText('共 7 行');

    // 点到第 2 行：状态行更新
    await page.locator('.monaco-editor .view-lines > div:nth-child(2)').first().click();
    await expect(status).toContainText('行 2，');

    // 末尾追加一行：总行数 7 → 8
    await editPage.typeInEditor('\n  G[新节点]');
    await expect(status).toContainText('共 8 行');

    // 「定位到错误行」联动：制造错误后光标跳转到错误行
    await editPage.clearEditor();
    await editPage.typeInEditor('graph TD\nA --> B -->');
    await editPage.checkError('语法错误');
    await page.getByTestId('error-reveal').click();
    await expect(status).toContainText('行 2，', { timeout: 10_000 });
  });

  test('字符数随编辑更新，配置模式显示配置长度', async ({ page, editPage }) => {
    const count = page.getByTestId('editor-char-count');
    await expect(count).toBeVisible();
    const before = Number.parseInt((await count.textContent()) ?? '0', 10);
    expect(before).toBeGreaterThan(0);

    // 追加内容：字符数增长（不钉精确增量——Monaco 自动闭括号等编辑副作用
    // 会让实际落文与键入串不等长，精确算术属于过度规约）
    await editPage.typeInEditor('\n  G[新节点]');
    await expect
      .poll(async () => Number.parseInt((await count.textContent()) ?? '0', 10))
      .toBeGreaterThan(before);

    // 配置模式改显示配置 JSON 长度
    await editPage.setEditorMode('配置');
    const configLength = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('codeStore') ?? '{}').mermaid ?? '').length
    );
    await expect(count).toHaveText(`${configLength} 字符`);
  });

  test('选区出现时显示已选字符数，取消选区消失', async ({ page, editPage }) => {
    const selection = page.getByTestId('editor-selection');
    await expect(selection).toHaveCount(0);

    // 全选后「已选」必等于同刻「字符数」（全选不变式，与具体文本/尾换行无关）
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  A --> B');
    await page.keyboard.press('Control+KeyA');
    const charCountText = await page.getByTestId('editor-char-count').textContent();
    const total = Number.parseInt(charCountText ?? '0', 10);
    expect(total).toBeGreaterThan(0);
    await expect(selection).toHaveText(`已选 ${total} 字符`);

    // 点击取消选区：提示消失
    await page.locator('.monaco-editor .view-lines > div:nth-child(1)').first().click();
    await expect(selection).toHaveCount(0);
  });
});
