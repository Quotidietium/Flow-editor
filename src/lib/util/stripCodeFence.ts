/**
 * 识别「整段恰是一个 Markdown 代码围栏」的粘贴内容——从文档/LLM 对话
 * 复制 mermaid 代码的最高频形态。粘进编辑器连围栏一起算语法必然报错，
 * 粘贴即剥离（文件打开路径的 .md 提取见 fileIO.parseOpenedFile，此处
 * 补齐粘贴侧）。
 *
 * 只剥离裸围栏或标注 mermaid/mmd 的围栏：标注其它语言（如 ```python）
 * 的内容显然不是 mermaid，原样放行交给语法错误横幅。返回 undefined
 * 表示非围栏内容，调用方不动原文。
 */

// 前导 \s* 只吃空白（真实代码内容会阻断匹配，不会误剥「文中围栏」）
const FENCE_RE = /^\s*```[ \t]*(?:mermaid|mmd)?[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```\s*$/;

export const stripCodeFence = (text: string): string | undefined => {
  const match = text.match(FENCE_RE);
  if (!match) {
    return undefined;
  }
  // 剪贴板常带 CRLF：归一为 LF 再进编辑器（mermaid 语法不受影响）
  return (match[1] as string).replace(/\r\n/g, '\n');
};
