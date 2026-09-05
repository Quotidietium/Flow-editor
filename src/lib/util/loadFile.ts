/**
 * 文件载入编辑器的共享链：「打开」按钮与拖拽放落同走一条路径——
 * 插件导入钩子优先（自定义/二进制格式），内置解析兜底；无论哪条路，
 * 进入的源码都过插件输入转换管道，配置走与分享链接同款的
 * 确认-剥离安全门。
 */

import { runImportHandler, runInputTransforms } from '$/plugins/registry.svelte';
import { notify } from '$/util/notify';
import { sanitizeConfig, updateCode, updateCodeStore } from '$/util/state.svelte';
import { openTextFile, parseOpenedFile } from './fileIO';

export const loadFileIntoEditor = async (file: {
  bytes?: Uint8Array;
  name: string;
  text: string;
}): Promise<boolean> => {
  // 图片类文件（含 .svg 文本）无法逆向为图表——明确拒绝而非把字节/
  // 标记当 mermaid 代码载入报语法错误（循环 137）。
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?)$/i.test(file.name)) {
    notify('图片文件无法导入（支持 .mmd/.md/.json/.zip 或分享链接）');
    return false;
  }
  const handled = await runImportHandler(file.name, file.text, file.bytes);
  const parsed = handled ?? parseOpenedFile(file.name, file.text);
  if (!parsed) {
    notify(`无法识别文件「${file.name}」的内容`);
    return false;
  }
  const code = runInputTransforms(parsed.code, 'file');
  if (parsed.mermaid !== undefined) {
    updateCodeStore({ code, mermaid: sanitizeConfig(parsed.mermaid) });
  } else {
    updateCode(code, { updateDiagram: true });
  }
  notify(`已载入「${file.name}」`);
  return true;
};

// 「打开」按钮与 Ctrl+O 快捷键同走一条路（循环 131 提取共享）。
export const openFileIntoEditor = async (): Promise<void> => {
  const file = await openTextFile('.mmd,.md,.txt,.json,.mermaid,.zip');
  if (!file) {
    return;
  }
  await loadFileIntoEditor(file);
};
