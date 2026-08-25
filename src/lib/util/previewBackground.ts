/**
 * 预览区背景：网格点（默认）/ 棋盘格（透明检查）/ 纯白 / 纯黑 四档循环。
 * 纯逻辑层（无 DOM 与响应式），单测覆盖；响应式单例见
 * previewBackground.svelte.ts，UI 入口在 PanZoomToolbar。
 */

export const PREVIEW_BACKGROUNDS = ['grid', 'checker', 'white', 'black'] as const;

export type PreviewBackground = (typeof PREVIEW_BACKGROUNDS)[number];

export const PREVIEW_BG_KEY = 'flowPreviewBackground';

export const PREVIEW_BG_LABELS: Record<PreviewBackground, string> = {
  black: '纯黑',
  checker: '棋盘格（透明检查）',
  grid: '网格点',
  white: '纯白'
};

/** 循环顺序固定：网格点 → 棋盘格 → 纯白 → 纯黑 → 网格点。 */
export const nextPreviewBackground = (current: PreviewBackground): PreviewBackground => {
  const index = PREVIEW_BACKGROUNDS.indexOf(current);
  return PREVIEW_BACKGROUNDS[(index + 1) % PREVIEW_BACKGROUNDS.length];
};

/** localStorage 可被手改：白名单外的值回落默认档。 */
export const sanitizePreviewBackground = (value: unknown): PreviewBackground =>
  (PREVIEW_BACKGROUNDS as readonly unknown[]).includes(value)
    ? (value as PreviewBackground)
    : 'grid';

/**
 * #view 元素上的背景类名。grid 档沿用既有的明/暗网格点（跟随主题），
 * 其余档为固定底色（与主题无关——用户正是在检查导出效果）。
 */
export const previewBgClass = (bg: PreviewBackground, modeName: string | undefined): string =>
  bg === 'grid' ? `grid-bg-${modeName}` : `preview-bg-${bg}`;
