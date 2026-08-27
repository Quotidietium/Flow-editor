/**
 * 代码速览：压缩空白后限长展示（title 悬停用）。
 * 历史条目（循环 56）与我的示例按钮（循环 96）共用。
 */
export const codePreview = (code: string, max = 120): string => {
  const flat = code.replaceAll(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};
