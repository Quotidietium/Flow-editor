/**
 * SVG 文档光栅化为 PNG dataURL（/view 只读页下载用；浏览器环境，e2e 覆盖）。
 * 与编辑器导出同走「干净 SVG → Image → canvas」通道，但自给自足：
 * 不依赖 panZoom 现场、尺寸按内容 viewBox 等比缩放到长边上限。
 */

import { toBase64 } from 'js-base64';

const RASTER_TIMEOUT_MS = 10_000;

export const rasterizeSvgMarkup = async (
  markup: string,
  longSide: number
): Promise<{ dataUrl: string; height: number; width: number }> => {
  const svg = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
  const viewBox = svg
    .getAttribute('viewBox')
    ?.split(/\s+/)
    .map((part) => Number(part));
  const contentWidth = viewBox?.[2] && viewBox[2] > 0 ? viewBox[2] : longSide;
  const contentHeight = viewBox?.[3] && viewBox[3] > 0 ? viewBox[3] : longSide;
  // 等比缩放：长边到位，短边取整保底 1px（零/负内容尺寸已在上方兜底）
  const scale = longSide / Math.max(contentWidth, contentHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(contentWidth * scale));
  canvas.height = Math.max(1, Math.round(contentHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('canvas 2d context unavailable');
  }
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('svg rasterize timeout')), RASTER_TIMEOUT_MS);
    image.addEventListener('load', () => {
      clearTimeout(timer);
      resolve();
    });
    image.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('svg rasterize failed'));
    });
    image.src = `data:image/svg+xml;base64,${toBase64(markup)}`;
  });
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return { dataUrl: canvas.toDataURL('image/png'), height: canvas.height, width: canvas.width };
};
