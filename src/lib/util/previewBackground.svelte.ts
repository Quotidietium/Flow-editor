/**
 * 预览区背景的响应式单例（localStorage 持久化）。
 * View.svelte 依此上背景类；PanZoomToolbar 的循环按钮写回。
 */

import { persisted } from './persist.svelte';
import {
  nextPreviewBackground,
  PREVIEW_BG_KEY,
  sanitizePreviewBackground,
  type PreviewBackground
} from './previewBackground';

const store = persisted<PreviewBackground>(PREVIEW_BG_KEY, 'grid');

export const previewBackground = {
  get current(): PreviewBackground {
    // 读取侧兜底：手改 storage 的非法值不回写、不落盘，只按默认档展示。
    return sanitizePreviewBackground(store.value);
  },
  cycle(): void {
    store.value = nextPreviewBackground(this.current);
  }
};
