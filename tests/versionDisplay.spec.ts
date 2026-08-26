import { expect, test } from './test';
import { readFile } from 'node:fs/promises';

// 版本号显示：应用自身版本（报障拿的就是它），Mermaid 引擎版本并入悬停。
// 此前显示的是 mermaid 库版本——用户会拿错版本号反馈。
test.describe('版本号显示', () => {
  test('显示应用版本，title 含引擎版本', async ({ page }) => {
    await page.goto('/edit');
    const badge = page.getByTestId('app-version');
    await expect(badge).toBeVisible();

    const appVersion = JSON.parse(await readFile('package.json', 'utf8')).version as string;
    const mermaidVersion = JSON.parse(await readFile('node_modules/mermaid/package.json', 'utf8'))
      .version as string;
    await expect(badge).toHaveText(`v${appVersion}`);
    await expect(badge).toHaveAttribute(
      'title',
      `Flow 编辑器 v${appVersion} · Mermaid 引擎 v${mermaidVersion}`
    );
  });
});
