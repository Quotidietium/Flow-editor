/**
 * 整页前端替换示例（自包含）：frontend.url 使用 data: URL 内嵌一个完整
 * 页面——安装后即可从插件管理器一键打开，页面通过 MCP 桥完全驱动编辑器。
 * 适合作为“用指定网页完全替换前端”的最小模板。
 */
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>内嵌插件前端</title>
    <style>
      body { font-family: system-ui; background: #101014; color: #eee; padding: 2rem; }
      textarea { width: 60%; height: 45%; }
      button { margin: 0 4rem 0.5rem 0; padding: 0.5rem 1.2rem; }
      #out { opacity: 0.75; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h2>内嵌插件前端（data: URL 示例）</h2>
    <p>此页面完全替换了编辑器界面，并通过 MCP 桥驱动编辑器。</p>
    <textarea id="code"></textarea>
    <div>
      <button id="get">读取编辑器代码</button>
      <button id="set">写回编辑器</button>
    </div>
    <pre id="out"></pre>
    <script type="module">
      const CH = 'flow-editor';
      let seq = 0;
      const call = (method, params) =>
        new Promise((resolve) => {
          const id = ++seq;
          const onMsg = (e) => {
            const d = e.data;
            if (d && d.channel === CH && d.id === id) {
              window.removeEventListener('message', onMsg);
              resolve(d.result ?? d.error);
            }
          };
          window.addEventListener('message', onMsg);
          parent.postMessage({ channel: CH, id, jsonrpc: '2.0', method, params }, '*');
        });
      await call('initialize', {});
      document.getElementById('get').onclick = async () => {
        const r = await call('tools/call', { name: 'get_code', arguments: {} });
        document.getElementById('code').value = r?.content?.[0]?.text ?? '';
        document.getElementById('out').textContent = '已读取';
      };
      document.getElementById('set').onclick = async () => {
        const code = document.getElementById('code').value;
        await call('tools/call', { name: 'set_code', arguments: { code } });
        document.getElementById('out').textContent = '已写回编辑器';
      };
      await document.getElementById('get').onclick();
    </script>
  </body>
</html>`;

export default {
  id: 'demo.frontend-embed',
  name: '内嵌前端替换（示例）',
  version: '1.0.0',
  description: 'data: URL 整页替换前端，经 MCP 桥读写编辑器',
  permissions: ['ui:frontend', 'ai:mcp'],
  frontend: {
    url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  }
};
