/**
 * AI 工作流示例：把当前图表导出为「LLM 提示词文件」——包含图表源码、
 * 指令与编辑器 MCP 工具清单，投喂给任意 AI 客户端即可让其按同一协议
 * 生成/修改图表。演示插件如何充当 AI 集成的桥梁（也可在 activate 里
 * 直接 fetch 自定义 AI 端点，再用 ctx.setCode 写回——信任级由安装者把握）。
 *
 * @satisfies {import('../flow-plugin.d.ts').FlowPlugin}
 */
export default {
  id: 'demo.ai-prompt-exporter',
  name: 'AI 提示词导出（示例）',
  version: '1.0.0',
  description: '导出包含图表源码与 MCP 工具说明的 LLM 提示词文件',
  permissions: ['export:format', 'ai:mcp'],
  export: {
    id: 'ai-prompt',
    label: 'AI 提示词（.md）',
    run({ code, config }) {
      const prompt = [
        '# 用 Mermaid 编辑以下图表',
        '',
        '你将获得一个 Mermaid 图表与一组编辑器工具协议（MCP）。',
        '请按用户后续指令修改图表，并仅以 Mermaid 源码作答。',
        '',
        '## 当前图表',
        '',
        '```mermaid',
        code.trimEnd(),
        '```',
        '',
        '## 当前 Mermaid 配置',
        '',
        '```json',
        config,
        '```',
        '',
        '## 编辑器 MCP 工具（channel: flow-editor）',
        '',
        '- initialize / tools/list / tools/call（JSON-RPC 2.0）',
        '- set_code { code }：写回图表（经输入管道与状态校验）',
        '- get_code / get_state / set_state / render_svg / export',
        '',
        '宿主（Electron/Puppeteer 等）将本页 postMessage 桥与 stdio 互转即可接入。'
      ].join('\n');
      return { filename: 'ai-prompt.md', mime: 'text/markdown', text: `${prompt}\n` };
    }
  }
};
