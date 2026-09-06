/**
 * 预览最近成功渲染的图表内容尺寸（viewBox 宽高，循环 152）。
 * View 在每次成功渲染后写入；渲染失败保留上一帧（画面也还挂着旧图，
 * 导出/预估针对的正是它）。供「导出位图尺寸预估」等 UI 读。
 */

let size = $state<{ height: number; width: number } | undefined>();

export const renderedContentSize = {
  get current(): { height: number; width: number } | undefined {
    return size;
  },
  set(next: { height: number; width: number } | undefined): void {
    size = next;
  }
};
