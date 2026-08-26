/**
 * 编辑器字号偏好的响应式单例（localStorage 持久化）。
 * 此前归编辑页私有——桌面端 FontSizeMenu 可调、移动端 390px 头部空间不足
 * 被隐藏后移动端完全不可调。单例化后编辑页与主菜单字号行共享同一偏好。
 */

import { persisted } from './persist.svelte';

const FONT_SIZE_KEY = 'editorFontSize';
export const EDITOR_FONT_SIZE_MIN = 12;
export const EDITOR_FONT_SIZE_MAX = 20;

const clamp = (value: number): number =>
  Math.min(EDITOR_FONT_SIZE_MAX, Math.max(EDITOR_FONT_SIZE_MIN, value));

const store = persisted<number>(FONT_SIZE_KEY, 14);

export const editorFontSize = {
  get current(): number {
    // 读取侧兜底：手改 storage 的非法值只按夹取后展示，不回写。
    const value = store.value;
    return Number.isFinite(value) ? clamp(value) : 14;
  },
  set current(next: number) {
    store.value = clamp(next);
  },
  step(delta: number): void {
    this.current = this.current + delta;
  }
};
