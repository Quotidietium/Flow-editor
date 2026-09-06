import { type Page } from '@playwright/test';
import { expect, test } from './test';

const openHistory = (page: Page) => page.getByRole('button', { name: '历史记录' }).click();

test.describe('历史版本与当前对比（循环 127）', () => {
  test('收藏当前 → 改代码 → 对话框展示行级差异与增删统计', async ({ page, editPage }) => {
    // 收藏默认图为「已保存」条目
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    // 修改代码：整段替换（默认图 → 新图，无公共行）
    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX[新增节点] --> Y\n');
    await editPage.editor.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('新增节点');

    // 对比：该版本（默认图）→ 当前（新图）
    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('圣诞节');
    await expect(dialog).toContainText('新增节点');
    // 默认图 7 行（含收尾空行）全删、新图 3 行全增
    await expect(dialog).toContainText('增 3');
    await expect(dialog).toContainText('删 7');

    // Esc 关闭（bits-ui 原生），面板仍在
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('#historyList li')).toHaveCount(1);
  });

  test('无差异的版本对比显示 0 增 0 删（逐行 same）', async ({ editPage }) => {
    // 全程走 editPage.page（导航在 editPage fixture 的 start() 里，
    // 只解构 page 会跑在 about:blank 上——循环 126 同款教训）
    const page = editPage.page;
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('增 0');
    await expect(dialog).toContainText('删 0');
    await expect(dialog).toContainText('圣诞节');
  });

  test('两版本互比：对话框内把对比对象切到另一历史版本（循环 128）', async ({ page, editPage }) => {
    // 版本 A = 默认图；版本 B = 新图；先后各收藏一条
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX[新增节点] --> Y\n');
    await editPage.editor.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('新增节点');
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(2);

    // 从最新条目（B）打开对比：默认对比「当前编辑器」＝同为 B，零差异
    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('当前编辑器');
    await expect(dialog).toContainText('增 0');

    // 切换对比对象为版本 A（下拉第 3 项：当前编辑器 / B / A——名字是
    // 随机 slug，用位置选）：B → A 方向翻转，增删互换
    await page.getByTestId('history-diff-target').selectOption({ index: 2 });
    await expect(dialog).toContainText('圣诞节');
    await expect(dialog).toContainText('新增节点');
    await expect(dialog).toContainText('增 7');
    await expect(dialog).toContainText('删 3');
  });

  test('历史条目一键复制分享链接（循环 130）', async ({ editPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 全程走 editPage.page（导航在 fixture 的 start() 里——循环 126 教训）
    const page = editPage.page;
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.getByRole('button', { name: '复制该版本的分享链接' }).first().click();
    await expect(page.getByText('已复制该版本的分享链接')).toBeVisible();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('#pako:');
    // 链接就是条目的站内分享 URL（当前页同源、同路径）
    expect(link.startsWith(page.url().split('#')[0])).toBe(true);
  });

  test('对比对话框：一键对调方向 + 对话框内直达恢复左侧版本（循环 132）', async ({
    page,
    editPage
  }) => {
    // 版本 A = 默认图；版本 B = 新图；先后各收藏一条
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX[新增节点] --> Y\n');
    await editPage.editor.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('新增节点');
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(2);

    // 从 B 打开（left=B），切 right 为 A：B → A = 增 7 删 3
    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('history-diff-target').selectOption({ index: 2 });
    await expect(dialog).toContainText('增 7');
    await expect(dialog).toContainText('删 3');

    // 一键对调：方向翻转，增删互换
    await page.getByTestId('history-diff-swap').click();
    await expect(dialog).toContainText('增 3');
    await expect(dialog).toContainText('删 7');

    // 对话框内直达恢复左侧（A = 默认图）：编辑器回默认图、对话框关闭
    await page.getByTestId('history-diff-restore').click();
    await expect(page.getByText('已恢复「')).toBeVisible();
    await expect(dialog).toHaveCount(0);
    await editPage.checkInEditor('圣诞节');
    await editPage.checkTextInView('圣诞节');
    // 历史条目不受影响
    await expect(page.locator('#historyList li')).toHaveCount(2);
  });

  test('对比对话框行内复制左/右版代码（循环 135）', async ({ page, editPage, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 收藏 A = 默认图；当前编辑器改为 B = 新图
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX[新增节点] --> Y\n');
    await editPage.editor.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('新增节点');

    // 打开 A 的对比：left=A、right=当前编辑器（B）
    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();

    // 复制左版 = A 的默认图代码
    await page.getByTestId('history-diff-copy-left').click();
    await expect(page.getByText('已复制左版代码')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('圣诞节');

    // 复制右版 = 当前编辑器的 B 代码
    await page.getByTestId('history-diff-copy-right').click();
    await expect(page.getByText('已复制右版代码')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('新增节点');
  });

  test('复制差异行：unified 风格片段，无差异时禁用（循环 139）', async ({
    page,
    editPage,
    context
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    // 收藏 A = 默认图；当前编辑器改为 B = 新图
    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.evaluate((c) => navigator.clipboard.writeText(c), 'graph TD\nX[新增节点] --> Y\n');
    await editPage.editor.click();
    await page.keyboard.press('Control+KeyA');
    await page.keyboard.press('Control+V');
    await expect(editPage.editor).toContainText('新增节点');

    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();

    // 双行号列（循环 144）：del 行有旧号无新号、add 行有新号无旧号
    const firstOld = page.getByTestId('history-diff-old-line').first();
    await expect(firstOld).toHaveText('1');
    const firstNew = page.getByTestId('history-diff-new-line').first();
    await expect(firstNew).toBeVisible();

    // 差异行键盘可达（循环 146）：聚焦首行按 Enter 复制该行
    const firstRow = page.locator('[data-testid="history-diff-rows"] > div').first();
    await firstRow.focus();
    await page.keyboard.press('Enter');
    // 同用例稍后还有一次单行复制——两个同名 toast 并存，断言取 first
    await expect(page.getByText('已复制该行').first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('flowchart TD');

    // 复制差异：- 旧行 / + 新行（unified 风格）
    await page.getByTestId('history-diff-copy-diff').click();
    await expect(page.getByText('已复制差异行')).toBeVisible();
    const diff = await page.evaluate(() => navigator.clipboard.readText());
    expect(diff).toContain('- flowchart TD');
    expect(diff).toContain('+ graph TD');
    expect(diff).toContain('-     A[圣诞节] -->|拿到压岁钱| B(去购物)');

    // 悬停单行复制（循环 145）：行原样进剪贴板（不带 +/- 前缀）——
    // 复制钮 hover 显形，先悬停所在行再点（选含「新增节点」的 add 行，
    // 末行是空行——粘贴串以换行结尾会产生空行行）
    const targetRow = page
      .locator('[data-testid="history-diff-rows"] > div')
      .filter({ hasText: '新增节点' })
      .first();
    await targetRow.hover();
    await targetRow.getByTestId('history-diff-copy-row').click();
    await expect(page.getByText('已复制该行').first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('新增节点');

    // 无差异版本：按钮禁用
    await page.getByTestId('history-diff-target').selectOption({ index: 1 });
    await expect(dialog).toContainText('增 0');
    await expect(page.getByTestId('history-diff-copy-diff')).toBeDisabled();
  });

  test('长段未变行折叠为分隔条，点击展开；重开对话框复位（循环 147）', async ({
    page,
    editPage
  }) => {
    // 版本 A：graph TD + 14 个节点行（15 行）；版本 B 只改 N0 文本。
    // 差异在第 2 行 → 上下文 3 行外，N4..N10 共 7 行相同被折叠。
    const versionA = [
      'graph TD',
      ...Array.from({ length: 14 }, (_, i) => `  N${i}[节点${i}]`)
    ].join('\n');
    const versionB = versionA.replace('N0[节点0]', 'N0[起点改]');
    const replaceCode = async (code: string) => {
      await page.evaluate((c) => navigator.clipboard.writeText(c), code);
      await editPage.editor.click();
      await page.keyboard.press('Control+KeyA');
      await page.keyboard.press('Control+V');
    };
    await replaceCode(versionA);
    await expect(editPage.editor).toContainText('节点13');

    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await replaceCode(versionB);
    await expect(editPage.editor).toContainText('起点改');

    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('增 1');
    await expect(dialog).toContainText('删 1');

    // 折叠条出现：N4..N10 共 7 行收拢；上下文（节点3）与收尾（节点13）仍在
    const fold = page.getByTestId('history-diff-fold');
    await expect(fold).toHaveCount(1);
    await expect(fold).toContainText('已折叠 7 行');
    await expect(dialog).toContainText('节点3');
    await expect(dialog).toContainText('节点13');
    await expect(dialog).not.toContainText('N4[节点4]');

    // 点击展开：折叠条消失，被收拢的行渲染出来
    await fold.click();
    await expect(page.getByTestId('history-diff-fold')).toHaveCount(0);
    await expect(dialog).toContainText('N4[节点4]');
    await expect(dialog).toContainText('N9[节点9]');

    // 重开对话框：折叠状态复位（展开标记不跨对话框存活）
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: '与当前对比' }).first().click();
    await expect(page.getByTestId('history-diff-fold')).toContainText('已折叠 7 行');
    await expect(dialog).not.toContainText('N4[节点4]');
  });

  test('差异跳转：上一处/下一处循环定位 + 计数（循环 149）', async ({ page, editPage }) => {
    // 版本 A：graph TD + 40 个节点行；版本 B 把 N0..N9 改 X、N30..N39 改 Y
    // → 两簇差异，中间 20 行相同折叠（已折叠 14 行），内容远超视口可滚动。
    const versionA = [
      'graph TD',
      ...Array.from({ length: 40 }, (_, i) => `  N${i}[节点${i}]`)
    ].join('\n');
    const versionB = versionA
      .replaceAll(/ {2}N(\d)\[节点\d\]/g, '  X$1[改$1]')
      .replaceAll(/ {2}N3(\d)\[节点3\d\]/g, '  Y3$1[改3$1]');
    const replaceCode = async (code: string) => {
      await page.evaluate((c) => navigator.clipboard.writeText(c), code);
      await editPage.editor.click();
      await page.keyboard.press('Control+KeyA');
      await page.keyboard.press('Control+V');
    };
    await replaceCode(versionA);
    await expect(editPage.editor).toContainText('节点39');

    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await replaceCode(versionB);
    await expect(editPage.editor).toContainText('改39');

    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    // 两簇差异 + 中段折叠并存
    await expect(page.getByTestId('history-diff-fold')).toContainText('已折叠 14 行');
    const pos = page.getByTestId('history-diff-hunk-pos');
    await expect(pos).toHaveText('0/2');
    const container = page.getByTestId('history-diff-rows');

    // 下一处 → 第一簇（顶部，容器不滚动）
    await page.getByTestId('history-diff-next-hunk').click();
    await expect(pos).toHaveText('1/2');
    expect(await container.evaluate((el) => el.scrollTop)).toBeLessThan(60);

    // 再下一处 → 第二簇（远在下部，容器滚动居中）
    await page.getByTestId('history-diff-next-hunk').click();
    await expect(pos).toHaveText('2/2');
    await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);

    // 循环回第一簇（滚动回顶）
    await page.getByTestId('history-diff-next-hunk').click();
    await expect(pos).toHaveText('1/2');
    await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBeLessThan(60);

    // 上一处从第一簇环绕到末簇
    await page.getByTestId('history-diff-prev-hunk').click();
    await expect(pos).toHaveText('2/2');
    await expect.poll(() => container.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  });

  test('行内字符级高亮：配对 del/add 行的改动中段上底色（循环 150）', async ({
    page,
    editPage
  }) => {
    const replaceCode = async (code: string) => {
      await page.evaluate((c) => navigator.clipboard.writeText(c), code);
      await editPage.editor.click();
      await page.keyboard.press('Control+KeyA');
      await page.keyboard.press('Control+V');
    };
    await replaceCode('graph TD\n  N0[节点0]\n  N1[节点1]');
    await expect(editPage.editor).toContainText('节点0');

    await openHistory(page);
    await page.getByRole('button', { name: '保存当前状态' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await replaceCode('graph TD\n  N0[起点改]\n  N1[节点1]');
    await expect(editPage.editor).toContainText('起点改');

    await page.getByRole('button', { name: '与当前对比' }).first().click();
    const dialog = page.getByTestId('history-diff-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('增 1');
    await expect(dialog).toContainText('删 1');

    // 行内分段：del 行中段「节点0」、add 行中段「起点改」上底色；
    // 公共前缀「  N0[」原样保留在段外
    const changed = page.getByTestId('history-diff-inline-changed');
    await expect(changed).toHaveCount(2);
    await expect(changed.nth(0)).toHaveText('节点0');
    await expect(changed.nth(1)).toHaveText('起点改');
    await expect(dialog).toContainText('N0[');
  });
});
