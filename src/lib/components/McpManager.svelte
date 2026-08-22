<script lang="ts">
  import CopyButton from '$/components/CopyButton.svelte';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { Switch } from '$/components/ui/switch';
  import { BRIDGE_CHANNEL, bridgeTools } from '$/plugins/bridge';
  import {
    isDesktop,
    loadMcpConfig,
    loadMcpStatus,
    MCP_PORT_DEFAULT,
    MCP_PORT_MAX,
    MCP_PORT_MIN,
    saveMcpConfig,
    validateMcpPort,
    type McpConfig,
    type McpStatus
  } from '$/plugins/mcpConfig';
  import { notify } from '$/util/notify';
  import { copyToClipboard } from '$/util/util';
  import { onMount } from 'svelte';
  import CableIcon from '~icons/material-symbols/cable-rounded';
  import LanIcon from '~icons/material-symbols/lan-rounded';

  let config = $state<McpConfig>({ enabled: false, port: MCP_PORT_DEFAULT });
  let portDraft = $state(String(MCP_PORT_DEFAULT));
  // Switch binds directly; port applies on 保存 to avoid re-listening per keystroke.
  let draftEnabled = $state(false);
  let status = $state<McpStatus>({ port: MCP_PORT_DEFAULT, running: false });
  let loading = $state(true);
  let saving = $state(false);
  const desktop = $derived(isDesktop());

  const portError = $derived(
    validateMcpPort(portDraft) === undefined
      ? `端口必须是 ${MCP_PORT_MIN}–${MCP_PORT_MAX} 的整数`
      : ''
  );
  const dirty = $derived(
    config.enabled !== draftEnabled || validateMcpPort(portDraft) !== config.port
  );

  onMount(() => {
    void (async () => {
      config = await loadMcpConfig();
      draftEnabled = config.enabled;
      portDraft = String(config.port);
      status = await loadMcpStatus(config);
      loading = false;
    })();
  });

  const save = async (): Promise<void> => {
    const port = validateMcpPort(portDraft);
    if (port === undefined) {
      notify(`端口无效：${portError}`);
      return;
    }
    saving = true;
    try {
      const next = { enabled: draftEnabled, port };
      const result = await saveMcpConfig(next);
      if (result.ok) {
        config = next;
        status = await loadMcpStatus(next);
        notify(desktop ? 'MCP 服务配置已保存并应用' : 'MCP 服务配置已保存');
      } else {
        notify(`保存失败：${result.error ?? '未知错误'}`);
      }
    } finally {
      saving = false;
    }
  };

  const toggleEnabled = async (enabled: boolean): Promise<void> => {
    draftEnabled = enabled;
    // Auto-save the switch alone (valid port guaranteed by the input guard).
    if (portError === '') {
      await save();
    }
  };

  const bridgeSnippet = `// 任意宿主页面 / 插件前端内：
window.parent.postMessage({
  channel: '${BRIDGE_CHANNEL}',
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'set_code', arguments: { code: 'flowchart TD\\n  A-->B' } }
}, '*');`;

  const httpSnippet = $derived(
    `# MCP JSON-RPC over HTTP（仅 127.0.0.1 回环）
curl -X POST http://127.0.0.1:${validateMcpPort(portDraft) ?? config.port}/ \\
  -H "Content-Type: application/json" \\
  -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":1,\\"method\\":\\"tools/list\\"}"
# 调用工具：
curl -X POST http://127.0.0.1:${validateMcpPort(portDraft) ?? config.port}/ \\
  -H "Content-Type: application/json" \\
  -d "{\\"jsonrpc\\":\\"2.0\\",\\"id\\":2,\\"method\\":\\"tools/call\\",\\"params\\":{\\"name\\":\\"get_code\\",\\"arguments\\":{}}}"`
  );
</script>

<div class="flex flex-col gap-4" data-testid="mcp-manager">
  <!-- postMessage 桥（内置，全平台） -->
  <section class="rounded-lg border p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-medium">
        <CableIcon class="size-4" /> postMessage 桥
      </h3>
      <span
        class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        内置 · 始终开启
      </span>
    </div>
    <p class="mb-2 text-xs text-muted-foreground">
      频道 <code class="rounded bg-muted px-1">{BRIDGE_CHANNEL}</code>，MCP JSON-RPC 2.0
      线格式。插件前端与外部宿主页面（Electron/Puppeteer 等）通过它驱动编辑器。
    </p>
    <div class="mb-2 rounded border bg-muted/40 p-2">
      <div class="mb-1 text-[11px] font-medium text-muted-foreground">可用工具</div>
      <ul class="grid grid-cols-1 gap-1 sm:grid-cols-2" data-testid="mcp-tool-list">
        {#each bridgeTools as tool (tool.name)}
          <li class="text-[11px]">
            <code class="rounded bg-background px-1 font-medium">{tool.name}</code>
            <span class="text-muted-foreground">{tool.description}</span>
          </li>
        {/each}
      </ul>
    </div>
    <div class="relative">
      <pre
        class="max-h-36 overflow-auto rounded border bg-muted/40 p-2 text-[11px] leading-relaxed">{bridgeSnippet}</pre>
      <div class="absolute top-1 right-1">
        <CopyButton label="复制" onclick={() => copyToClipboard(bridgeSnippet)} />
      </div>
    </div>
  </section>

  <!-- HTTP MCP 服务器（桌面版） -->
  <section class="rounded-lg border p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-1.5 text-sm font-medium">
        <LanIcon class="size-4" /> HTTP 服务
        <span class="text-xs font-normal text-muted-foreground">（供 AI 客户端直连）</span>
      </h3>
      {#if status.running}
        <span
          class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
          data-testid="mcp-http-status">
          运行中 · 端口 {status.port}
        </span>
      {:else if status.error}
        <span
          class="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300"
          data-testid="mcp-http-status">
          启动失败：{status.error}
        </span>
      {:else}
        <span
          class="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
          data-testid="mcp-http-status">
          已停止
        </span>
      {/if}
    </div>

    {#if !desktop}
      <p
        class="mb-2 rounded border border-dashed p-2 text-xs text-muted-foreground"
        data-testid="mcp-desktop-hint">
        HTTP 服务由 <strong>Windows 桌面安装版</strong>（installer/ 构建的
        Flow-Editor-Setup）提供；浏览器版请使用上方的 postMessage
        桥。下面的配置会保存在本机，桌面版启动同站点时自动生效。
      </p>
    {/if}

    <div class="mb-2 flex flex-wrap items-center gap-3">
      <label class="flex items-center gap-2 text-sm">
        <Switch
          disabled={loading}
          checked={draftEnabled}
          onCheckedChange={(v) => void toggleEnabled(v)}
          data-testid="mcp-enabled" />
        启用 HTTP 服务
      </label>
      <label class="flex items-center gap-2 text-sm">
        端口
        <Input
          class="w-28"
          disabled={loading}
          bind:value={portDraft}
          inputmode="numeric"
          data-testid="mcp-port" />
      </label>
      <Button
        size="sm"
        disabled={loading || saving || portError !== '' || !dirty}
        data-testid="mcp-save"
        onclick={() => void save()}>
        保存并应用
      </Button>
    </div>
    {#if portError && portDraft !== String(config.port)}
      <p class="mb-2 text-xs text-destructive">{portError}</p>
    {/if}

    <p class="mb-2 text-xs text-muted-foreground">
      服务仅监听 <code class="rounded bg-muted px-1">127.0.0.1</code>，要求
      <code class="rounded bg-muted px-1">Content-Type: application/json</code>，请求体上限
      6MB。接入 Claude Desktop 等 stdio MCP 客户端时，用任一 stdio↔HTTP 转发即可。
    </p>
    <div class="relative">
      <pre
        class="max-h-36 overflow-auto rounded border bg-muted/40 p-2 text-[11px] leading-relaxed"
        data-testid="mcp-http-snippet">{httpSnippet}</pre>
      <div class="absolute top-1 right-1">
        <CopyButton label="复制" onclick={() => copyToClipboard(httpSnippet)} />
      </div>
    </div>
  </section>
</div>
