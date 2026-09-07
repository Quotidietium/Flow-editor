import { expect, test } from './test';

test.describe('插入代码片段', () => {
  test('代码模式有插入菜单，配置模式没有', async ({ page, editPage }) => {
    await expect(page.getByTestId('insert-snippet-menu')).toBeVisible();
    await editPage.setEditorMode('配置');
    await expect(page.getByTestId('insert-snippet-menu')).toHaveCount(0);
    // 配置模式是模板按钮（循环1）
    await expect(page.getByTestId('config-preset-menu')).toBeVisible();
    await editPage.setEditorMode('代码');
    await expect(page.getByTestId('insert-snippet-menu')).toBeVisible();
  });

  test('片段插入光标处且不破坏既有内容', async ({ page, editPage }) => {
    // 输入基础代码，光标停在行尾
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  ');

    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('insert-snippet-node').click();

    // 片段落在光标处
    await expect(editPage.editor).toContainText('A[标签]');
    // 既有内容保持
    await expect(editPage.editor).toContainText('flowchart TD');
    // 生成的是合法图：预览渲染出插入的节点
    await editPage.checkTextInView('标签');

    // 继续插入带标签连线骨架
    await editPage.typeInEditor('\n  ', { bottom: false });
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('insert-snippet-edge-label').click();
    await expect(editPage.editor).toContainText('-->|标签|');
  });

  test('子图骨架多行插入', async ({ page, editPage }) => {
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  ');
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('insert-snippet-subgraph').click();
    await expect(editPage.editor).toContainText('subgraph 分组');
    await expect(editPage.editor).toContainText('end');
    await editPage.checkTextInView('分组');
  });

  test('搜索过滤：键入即筛、Enter 插入首个匹配、Esc 清词再按关菜单（循环 165）', async ({
    page,
    editPage
  }) => {
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  ');

    await page.getByTestId('insert-snippet-menu').click();
    const search = page.getByTestId('snippet-search');
    await expect(search).toBeFocused();

    // 键入即筛：只剩子图骨架，其它条目与组名隐去
    await search.fill('subgraph');
    await expect(page.getByTestId('insert-snippet-subgraph')).toBeVisible();
    await expect(page.getByTestId('insert-snippet-node')).toHaveCount(0);
    await expect(page.getByTestId('insert-snippet-loop')).toHaveCount(0);

    // Enter 插入首个匹配并关菜单（键盘闭环）
    await search.press('Enter');
    await expect(editPage.editor).toContainText('subgraph 分组');
    await expect(search).toHaveCount(0);

    // 无匹配空态 → Esc 清词恢复全量（不关菜单）
    await page.getByTestId('insert-snippet-menu').click();
    await search.fill('不存在的东西');
    await expect(page.getByTestId('snippet-search-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('snippet-search-empty')).toHaveCount(0);
    await expect(page.getByTestId('insert-snippet-node')).toBeVisible();

    // 空词时 Esc 照常关菜单；重开关键词归零
    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    await page.getByTestId('insert-snippet-menu').click();
    await expect(page.getByTestId('snippet-search')).toHaveValue('');
  });

  test('键盘导航：↑/↓ 移动高亮、Enter 插入高亮项、循环回绕（循环 166）', async ({
    page,
    editPage
  }) => {
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  ');

    await page.getByTestId('insert-snippet-menu').click();
    const search = page.getByTestId('snippet-search');

    // 键入组名「时序」：5 条时序骨架全留，高亮钉在首个匹配（参与者）
    await search.fill('时序');
    await expect(page.getByTestId('insert-snippet-participant')).toHaveAttribute(
      'data-active',
      'true'
    );

    // ↓↓ 挪到第三项（循环块），Enter 插入高亮项并收菜单
    await search.press('ArrowDown');
    await search.press('ArrowDown');
    await expect(page.getByTestId('insert-snippet-loop')).toHaveAttribute('data-active', 'true');
    await expect(search).toHaveAttribute('aria-activedescendant', 'snippet-opt-2');
    await search.press('Enter');
    await expect(editPage.editor).toContainText('loop 循环描述');
    await expect(search).toHaveCount(0);

    // 循环回绕：首项 ↑ 到末项（时序激活），末项 ↓ 回首项
    await page.getByTestId('insert-snippet-menu').click();
    await search.fill('时序');
    await search.press('ArrowUp');
    await expect(page.getByTestId('insert-snippet-activate')).toHaveAttribute(
      'data-active',
      'true'
    );
    await search.press('ArrowDown');
    await expect(page.getByTestId('insert-snippet-participant')).toHaveAttribute(
      'data-active',
      'true'
    );
  });

  test('我的片段：保存当前代码、光标处插回、删除', async ({ page, editPage }) => {
    // 造一段可辨识的代码
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  Alpha --> Beta');

    // 保存为我的片段
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('user-snippet-save').click();
    await page.getByTestId('user-snippet-save-name').fill('双节点骨架');
    await page.getByTestId('user-snippet-save-name').press('Enter');
    await expect(page.getByText('已保存片段「双节点骨架」')).toBeVisible();

    // 清空文档后从菜单插回（光标处，不弹整图替换）
    await editPage.clearEditor();
    await page.getByTestId('insert-snippet-menu').click();
    const item = page.locator('[data-testid^="user-snippet-snippet-"]');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('双节点骨架');
    // 预览行展示首行压缩文本
    await expect(item).toContainText('flowchart TD');
    await item.click();
    await expect(editPage.editor).toContainText('Alpha --> Beta');
    await editPage.checkTextInView('Alpha');

    // 刷新后仍在（持久化），随后删除
    await page.reload();
    await page.getByTestId('insert-snippet-menu').click();
    const stored = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserSnippets') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await page.getByTestId(`user-snippet-delete-${stored}`).click();
    await expect(page.getByText('已删除片段「双节点骨架」')).toBeVisible();
    await expect(page.locator('[data-testid^="user-snippet-snippet-"]')).toHaveCount(0);
  });

  test('我的片段双击重命名（代码保留，循环 118）', async ({ page, editPage }) => {
    await editPage.clearEditor();
    await editPage.typeInEditor('flowchart TD\n  X --> Y');
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId('user-snippet-save').click();
    await page.getByTestId('user-snippet-save-name').fill('片段旧名');
    await page.getByTestId('user-snippet-save-name').press('Enter');
    await expect(page.getByText('已保存片段「片段旧名」')).toBeVisible();

    // 重开菜单双击重命名
    await page.getByTestId('insert-snippet-menu').click();
    const item = page.locator('[data-testid^="user-snippet-snippet-"]');
    page.once('dialog', (dialog) => void dialog.accept('片段新名'));
    await item.dblclick();
    await expect(page.getByText('已重命名为「片段新名」')).toBeVisible();
    await expect(
      page.locator('[data-testid^="user-snippet-snippet-"]', { hasText: '片段新名' })
    ).toBeVisible();

    // 代码保留：插回仍是保存的内容
    await page.getByTestId('insert-snippet-menu').click();
    await page.locator('[data-testid^="user-snippet-snippet-"]').click();
    await expect(editPage.editor).toContainText('X --> Y');

    // 清理
    const stored = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserSnippets') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await page.getByTestId('insert-snippet-menu').click();
    await page.getByTestId(`user-snippet-delete-${stored}`).click();
  });

  test('内置骨架按图族分组展示（循环 116）', async ({ page }) => {
    await page.goto('/edit');
    await page.getByTestId('insert-snippet-menu').click();
    const menu = page.locator('[data-popover-content]').last();

    // 五组小标题在场且有序
    const groups = menu.locator('.text-\\[10px\\]');
    const labels = await groups.allTextContents();
    expect(labels).toEqual(['流程图', '时序图', '甘特图', '状态图', '类图']);

    // 各组条目归属正确（抽查：时序组含 activate）
    const seqHeader = groups.nth(1);
    await expect(seqHeader.locator('xpath=following-sibling::*[1]')).toHaveAttribute(
      'data-testid',
      'insert-snippet-participant'
    );
  });
});
