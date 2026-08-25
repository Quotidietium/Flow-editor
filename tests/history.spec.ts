import { expect, test, type Page } from '@playwright/test';

const config = '{\n  "theme": "default"\n}';

const entry = (id: string, name: string, type: 'manual' | 'auto', label: string) => ({
  id,
  name,
  type,
  time: Number(id.slice(2)),
  state: {
    code: `flowchart TD\n  A[${label}]`,
    mermaid: config,
    autoSync: true,
    updateDiagram: false
  }
});

const manualHistory = [
  entry('m-2', 'hollow-art', 'manual', 'Halloween'),
  entry('m-1', 'helpful-ocean', 'manual', 'Pumpkin')
];
const autoHistory = [
  entry('a-2', 'barking-dog', 'auto', 'NewYear'),
  entry('a-1', 'needy-mosquito', 'auto', 'Fireworks')
];

const openHistory = (page: Page) => page.getByRole('button', { name: '历史记录' }).click();

test.describe('History', () => {
  test.beforeEach(async ({ page }) => {
    // Freeze time so auto-save snapshots are deterministic.
    await page.addInitScript(() => {
      Object.defineProperty(Date, 'now', { value: () => new Date(2022, 0, 1).getTime() });
    });
    await page.goto('/edit');
  });

  test('loads Saved and Timeline history from localStorage and restores entries', async ({
    page
  }) => {
    await page.evaluate(
      ([manual, auto]) => {
        localStorage.setItem('manualHistoryStore', manual);
        localStorage.setItem('autoHistoryStore', auto);
      },
      [JSON.stringify(manualHistory), JSON.stringify(autoHistory)]
    );
    await page.reload();
    await openHistory(page);

    // Saved tab is active by default.
    await expect(page.locator('#historyList li')).toHaveCount(2);
    await expect(page.locator('#historyList')).toContainText('hollow-art');
    await expect(page.locator('#historyList')).toContainText('helpful-ocean');

    await page.getByRole('button', { name: '恢复此版本' }).first().click();
    await expect(page.locator('#view')).toContainText('Halloween');

    // Switching to the Timeline tab shows the auto entries only.
    await page.getByRole('tab', { name: '时间线' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(2);
    await expect(page.locator('#historyList')).toContainText('barking-dog');
    await expect(page.locator('#historyList')).toContainText('needy-mosquito');
    await expect(page.locator('#historyList')).not.toContainText('hollow-art');

    await page.getByRole('button', { name: '恢复此版本' }).first().click();
    await expect(page.locator('#view')).toContainText('NewYear');
  });

  test('each entry has a copyable link that opens it in a new tab', async ({ page }) => {
    await page.evaluate(
      (manual) => localStorage.setItem('manualHistoryStore', manual),
      JSON.stringify(manualHistory)
    );
    await page.reload();
    await openHistory(page);

    // It is a real link (so it can be copied / opened in a new tab), not a button.
    const link = page.getByRole('link', { name: '在新标签页打开' }).first();
    await expect(link).toHaveAttribute('target', '_blank');
    const href = await link.getAttribute('href');
    expect(href).toContain('/edit#pako:');

    // Following it loads that entry's diagram.
    await page.goto(href ?? '');
    await expect(page.locator('#view')).toContainText('Halloween');
  });

  test('keeps the active tab highlighted when switching modes', async ({ page }) => {
    await openHistory(page);
    const saved = page.getByRole('tab', { name: '已保存' });
    const timeline = page.getByRole('tab', { name: '时间线' });

    await expect(saved).toHaveClass(/border-b-2/);
    await expect(timeline).not.toHaveClass(/border-b-2/);

    await timeline.click();
    await expect(timeline).toHaveClass(/border-b-2/);
    await expect(saved).not.toHaveClass(/border-b-2/);
  });

  test('saves the current state and reports duplicates', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#historyList li')).toHaveCount(0);

    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    // Saving again without changes does not add a duplicate and notifies the user.
    await page.locator('#saveHistory').click();
    await expect(page.getByText('该状态已保存过。')).toBeVisible();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    // Loading a different sample changes the state, so it saves as a new entry.
    await page.getByRole('button', { name: '时序图', exact: true }).click();
    await expect(page.locator('#view')).not.toContainText('圣诞节');
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li')).toHaveCount(2);
  });

  test('auto-saves to the Timeline only, never the Saved list', async ({ page }) => {
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.getByRole('tab', { name: '时间线' }).click();
    // A manual save must not appear under Timeline.
    await expect(page.locator('#historyList')).toContainText('暂无时间线快照。');
  });

  test('deletes a single entry and clears all after confirmation', async ({ page }) => {
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await page.getByRole('button', { name: '时序图', exact: true }).click();
    await expect(page.locator('#view')).not.toContainText('圣诞节');
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li')).toHaveCount(2);

    await page.getByRole('button', { name: '删除此版本' }).first().click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('#clearHistory').click();
    await expect(page.locator('#historyList li')).toHaveCount(0);
    await expect(page.locator('#historyList')).toContainText('暂无已保存状态。');
  });

  test('filters entries by name or diagram content', async ({ page }) => {
    await page.evaluate(
      (manual) => localStorage.setItem('manualHistoryStore', manual),
      JSON.stringify(manualHistory)
    );
    await page.reload();
    await openHistory(page);

    const search = page.getByTestId('history-search');
    await expect(search).toBeVisible();

    // 按名称过滤
    await search.fill('hollow');
    await expect(page.locator('#historyList li')).toHaveCount(1);
    await expect(page.locator('#historyList')).toContainText('hollow-art');

    // 按图表内容过滤（代码里的标签），大小写不敏感
    await search.fill('pumpkin');
    await expect(page.locator('#historyList li')).toHaveCount(1);
    await expect(page.locator('#historyList')).toContainText('helpful-ocean');

    // 无匹配提示
    await search.fill('zzz');
    await expect(page.locator('#historyList li')).toHaveCount(0);
    await expect(page.locator('#historyList')).toContainText('没有匹配「zzz」的条目。');

    // Esc 恢复全量
    await search.press('Escape');
    await expect(page.locator('#historyList li')).toHaveCount(2);

    // 清空按钮同样恢复
    await search.fill('hollow');
    await page.getByRole('button', { name: '清空搜索' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(2);
  });

  test('时间线条目一键收藏到「已保存」', async ({ page }) => {
    await page.evaluate(
      (auto) => localStorage.setItem('autoHistoryStore', auto),
      JSON.stringify(autoHistory)
    );
    await page.reload();
    await openHistory(page);

    await page.getByRole('tab', { name: '时间线' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(2);

    // 收藏第一条（barking-dog / NewYear）
    await page.getByRole('button', { name: '收藏到「已保存」' }).first().click();
    await expect(page.getByText('已收藏到「已保存」。')).toBeVisible();

    // 「已保存」里出现该条目（内容同为 NewYear）
    await page.getByRole('tab', { name: '已保存' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);
    await expect(page.locator('#historyList')).toContainText('barking-dog');

    // 再收藏同一状态：与最新已保存条目去重
    await page.getByRole('tab', { name: '时间线' }).click();
    await page.getByRole('button', { name: '收藏到「已保存」' }).first().click();
    await expect(page.getByText('该状态已在「已保存」中。')).toBeVisible();
    await page.getByRole('tab', { name: '已保存' }).click();
    await expect(page.locator('#historyList li')).toHaveCount(1);
  });

  test('renames a saved entry inline', async ({ page }) => {
    await openHistory(page);
    await page.locator('#saveHistory').click();
    await expect(page.locator('#historyList li')).toHaveCount(1);

    await page.getByRole('button', { name: '重命名' }).first().click();
    const input = page.getByRole('textbox', { name: '重命名条目' });
    await input.fill('my-custom-name');
    await input.press('Enter');

    await expect(page.locator('#historyList')).toContainText('my-custom-name');
    await expect(page.locator('#historyList li')).toHaveCount(1);
  });
});
