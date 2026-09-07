import { TID } from '$/constants';
import type { Page } from '@playwright/test';
import { expect, test } from './test';

// 原子粘贴替换编辑器内容（逐字符键入会与 Monaco 状态同步竞态丢键，
// 与 visualEditor.spec.ts 同款做法）。
const replaceConfig = async (page: Page, text: string): Promise<void> => {
  const editor = page.locator('.monaco-editor');
  await editor.click();
  await page.evaluate((c) => navigator.clipboard.writeText(c), text);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Control+V');
};

const openPresetMenu = async (page: Page) => {
  await page.getByTestId(TID.configPresetMenu).click();
};

test.describe('配置模板', () => {
  test('模板按钮只在配置模式出现', async ({ page, editPage }) => {
    // 代码模式：无模板按钮
    await expect(page.getByTestId(TID.configPresetMenu)).toHaveCount(0);
    await editPage.setEditorMode('配置');
    await expect(page.getByTestId(TID.configPresetMenu)).toBeVisible();
    await editPage.setEditorMode('代码');
    await expect(page.getByTestId(TID.configPresetMenu)).toHaveCount(0);
  });

  test('一键合并模板且图表照常渲染', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"look": "handDrawn"');
    // 深合并保留既有键
    await expect(editor).toContainText('"theme": "default"');
    await editPage.setEditorMode('代码');
    await editPage.checkTextInView('圣诞节');
  });

  test('两个模板叠加深合并', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    await openPresetMenu(page);
    await page.getByTestId('config-preset-presentation').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"look": "handDrawn"');
    await expect(editor).toContainText('"fontSize": "20px"');
    // 主题键切换为覆盖语义
    await openPresetMenu(page);
    await page.getByTestId('config-preset-theme-forest').click();
    await expect(editor).toContainText('"theme": "forest"');
    await expect(editor).toContainText('"look": "handDrawn"');
  });

  test('JSON 损坏时不写入并提示，重置可恢复', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await replaceConfig(page, '{ broken');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    await expect(
      page.getByText('当前配置 JSON 无法解析，模板未应用', { exact: false })
    ).toBeVisible();
    // 内容保持原样，未被破坏
    await expect(page.locator('.monaco-editor')).toContainText('broken');
    await openPresetMenu(page);
    // 循环 103：菜单重置加确认——取消不动手头内容，确认才覆盖
    page.once('dialog', (dialog) => void dialog.dismiss());
    await page.getByTestId('config-preset-reset').click();
    await expect(page.locator('.monaco-editor')).toContainText('broken');
    await openPresetMenu(page);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('config-preset-reset').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"theme": "default"');
    await expect(editor).not.toContainText('broken');
  });

  test('菜单对当前生效模板打勾并随应用切换', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    // 默认配置 theme:default → 默认主题打勾，深色无勾
    await openPresetMenu(page);
    await expect(page.getByTestId('config-preset-active-theme-default')).toBeVisible();
    await expect(page.getByTestId('config-preset-active-theme-dark')).toHaveCount(0);

    // 应用深色主题 → 勾选切换
    await page.getByTestId('config-preset-theme-dark').click();
    await openPresetMenu(page);
    await expect(page.getByTestId('config-preset-active-theme-dark')).toBeVisible();
    await expect(page.getByTestId('config-preset-active-theme-default')).toHaveCount(0);

    // 再叠手绘 → 两个都打勾（子集语义：各自叶子都在配置里）
    await page.getByTestId('config-preset-hand-drawn').click();
    await openPresetMenu(page);
    await expect(page.getByTestId('config-preset-active-theme-dark')).toBeVisible();
    await expect(page.getByTestId('config-preset-active-hand-drawn')).toBeVisible();
  });

  test('格式化 JSON 一键整理缩进', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await replaceConfig(page, '{"theme":"forest","look":"handDrawn"}');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-format').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).toContainText('"theme": "forest"');
    await expect(page.getByText('已格式化配置 JSON')).toBeVisible();
  });

  test('保存当前配置为我的模板，应用与删除', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    // 造一份自定义配置
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    await openPresetMenu(page);
    await page.getByTestId('config-preset-theme-forest').click();

    // 保存为我的模板
    await openPresetMenu(page);
    await page.getByTestId('config-preset-save').click();
    await page.getByTestId('config-preset-save-name').fill('森林手绘');
    await page.getByTestId('config-preset-save-name').press('Enter');
    await expect(page.getByText('已保存模板「森林手绘」')).toBeVisible();

    // 重置后从我的模板恢复两键合一
    await openPresetMenu(page);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('config-preset-reset').click();
    const editor = page.locator('.monaco-editor');
    await expect(editor).not.toContainText('handDrawn');
    await openPresetMenu(page);
    await page.getByText('森林手绘', { exact: true }).click();
    await expect(editor).toContainText('"look": "handDrawn"');
    await expect(editor).toContainText('"theme": "forest"');

    // 删除我的模板
    const stored = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserConfigPresets') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await openPresetMenu(page);
    await page.getByTestId(`config-preset-delete-${stored}`).click();
    await expect(page.getByText('已删除模板「森林手绘」')).toBeVisible();
    await expect(page.getByText('森林手绘', { exact: true })).toHaveCount(0);
  });

  test('悬停模板预览将修改的叶子键（旧值 → 新值）', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await openPresetMenu(page);
    const diff = page.getByTestId('config-preset-diff');
    // 未悬停时的引导文案
    await expect(diff).toContainText('选中模板可预览将修改的配置项');

    // 悬停深色主题：theme 由 default → dark
    await page.getByTestId('config-preset-theme-dark').hover();
    await expect(diff).toContainText('「深色主题」将修改');
    await expect(diff).toContainText('theme: default → dark');

    // 悬停已生效模板：明确告知无变化
    await page.getByTestId('config-preset-theme-default').hover();
    await expect(diff).toContainText('已全部生效，应用后无变化');

    // 多叶子模板只列实际变化项（theme 叶子未变 → 不出现）
    await page.getByTestId('config-preset-print-white').hover();
    await expect(diff).toContainText('themeVariables.background: （未设置） → #ffffff');
    await expect(diff).not.toContainText('theme: default → default');

    // 预览不干扰应用本身
    await page.getByTestId('config-preset-theme-dark').click();
    await expect(page.locator('.monaco-editor')).toContainText('"theme": "dark"');
  });

  test('搜索过滤与 ↑/↓ 导航：差异预览跟随高亮，Enter 应用高亮项（循环 168）', async ({
    page,
    editPage
  }) => {
    await editPage.setEditorMode('配置');
    await openPresetMenu(page);
    const search = page.getByTestId('config-preset-search');
    await expect(search).toBeFocused();

    // 键入即筛：「深色」只剩深色/Neo 深色，其它模板与动作行隐去
    await search.fill('深色');
    await expect(page.getByTestId('config-preset-theme-dark')).toBeVisible();
    await expect(page.getByTestId('config-preset-theme-neo-dark')).toBeVisible();
    await expect(page.getByTestId('config-preset-hand-drawn')).toHaveCount(0);
    await expect(page.getByTestId('config-preset-format')).toHaveCount(0);

    // 高亮钉首匹配，差异预览跟随（theme: default → dark）
    await expect(page.getByTestId('config-preset-theme-dark')).toHaveAttribute(
      'data-active',
      'true'
    );
    const diff = page.getByTestId('config-preset-diff');
    await expect(diff).toContainText('「深色主题」将修改');
    await expect(diff).toContainText('theme: default → dark');

    // ↓ 挪到 Neo 深色，预览跟随切换；Enter 应用高亮项并关菜单
    await search.press('ArrowDown');
    await expect(page.getByTestId('config-preset-theme-neo-dark')).toHaveAttribute(
      'data-active',
      'true'
    );
    await expect(diff).toContainText('「Neo 深色」将修改');
    await search.press('Enter');
    await expect(page.locator('.monaco-editor')).toContainText('"theme": "neo-dark"');
    await expect(search).toHaveCount(0);

    // 无匹配空态 → Esc 清词恢复全量（不关菜单）
    await openPresetMenu(page);
    await search.fill('不存在的东西');
    await expect(page.getByTestId('config-preset-search-empty')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('config-preset-search-empty')).toHaveCount(0);
    await expect(page.getByTestId('config-preset-hand-drawn')).toBeVisible();
    // 空词再 Esc 收菜单——避免悬浮层开着时点编辑器被关闭焦点回跳干扰
    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);

    // 动作行也进导航：过滤「格式化」→ Enter 直接格式化压缩 JSON
    await replaceConfig(page, '{"theme":"dark"}');
    await openPresetMenu(page);
    await search.fill('格式化');
    await expect(page.getByTestId('config-preset-format')).toHaveAttribute('data-active', 'true');
    await search.press('Enter');
    await expect(page.getByText('已格式化配置 JSON')).toBeVisible();
    // 格式化后冒号带空格（压缩态为 "theme":"dark"），与同规格格式化用例同口径
    await expect(page.locator('.monaco-editor')).toContainText('"theme": "dark"');
  });

  test('我的模板行内重命名（配置体保留，循环 119）', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    // 造一份可辨识的模板
    await openPresetMenu(page);
    await page.getByTestId('config-preset-hand-drawn').click();
    await openPresetMenu(page);
    await page.getByTestId('config-preset-save').click();
    await page.getByTestId('config-preset-save-name').fill('模板旧名');
    await page.getByTestId('config-preset-save-name').press('Enter');
    await expect(page.getByText('已保存模板「模板旧名」')).toBeVisible();

    // 行内重命名钮（条目本体点击即应用并关菜单，双击会被首击吃掉）
    const stored = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserConfigPresets') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await openPresetMenu(page);
    page.once('dialog', (dialog) => void dialog.accept('模板新名'));
    await page.getByTestId(`config-preset-rename-${stored}`).click();
    await expect(page.getByText('已重命名为「模板新名」')).toBeVisible();

    // 配置体保留：重置后应用新名模板仍带 handDrawn
    await page.locator('[data-testid^="config-preset-user-"]').click(); // 先应用（重置前菜单自动关）
    await openPresetMenu(page);
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByTestId('config-preset-reset').click();
    await expect(page.locator('.monaco-editor')).not.toContainText('handDrawn');
    await openPresetMenu(page);
    await page.getByText('模板新名', { exact: true }).click();
    await expect(page.locator('.monaco-editor')).toContainText('handDrawn');

    // 清理（重命名换了新 id——重读 storage）
    const storedAfter = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('flowUserConfigPresets') ?? '[]') as {
        id: string;
      }[];
      return list[0]?.id;
    });
    await openPresetMenu(page);
    await page.getByTestId(`config-preset-delete-${storedAfter}`).click();
  });

  test('JSON 损坏时保存我的模板被拒绝', async ({ page, editPage }) => {
    await editPage.setEditorMode('配置');
    await replaceConfig(page, '{ broken');
    await openPresetMenu(page);
    await page.getByTestId('config-preset-save').click();
    await page.getByTestId('config-preset-save-name').fill('坏模板');
    await page.getByTestId('config-preset-save-confirm').click();
    await expect(page.getByText('当前配置 JSON 无法解析，未保存')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('flowUserConfigPresets'));
    expect(stored ?? '[]').toBe('[]');
  });
});

test.describe('配置模板（移动端）', () => {
  test.use({ viewport: { height: 844, width: 390 } });

  test('打开菜单不聚焦搜索框（不弹虚拟键盘，循环 167）', async ({ page }) => {
    // editPage 夹具按桌面布局展开示例卡片，移动端不适用——手动导航
    await page.goto('/edit');
    // 移动端滑动布局：先切到「编辑」半屏（默认停在「预览」），等滑屏动画结束
    await page.locator('#editorMode').click();
    await page.waitForTimeout(400);
    await page.getByRole('tab').getByText('配置').click();
    await page.getByTestId(TID.configPresetMenu).click();
    const search = page.getByTestId('config-preset-search');
    // 搜索框在场但未被自动聚焦——聚焦会弹起虚拟键盘把菜单顶出屏
    await expect(search).toBeVisible();
    await expect(search).not.toBeFocused();
    // 点按模板照常应用
    await page.getByTestId('config-preset-theme-dark').click();
    await expect(page.locator('.cm-content')).toContainText('"theme": "dark"');
  });
});
