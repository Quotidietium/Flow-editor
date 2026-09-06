<script lang="ts">
  import McpManager from '$/components/McpManager.svelte';
  import { Button, buttonVariants } from '$/components/ui/button';
  import * as Dialog from '$/components/ui/dialog';
  import { Switch } from '$/components/ui/switch';
  import { TID } from '$/constants';
  import { notify } from '$/util/notify';
  import { downloadTextFile, openTextFile } from '$/util/fileIO';
  import {
    disablePlugin,
    enablePlugin,
    exportPluginSource,
    getPluginRuntime,
    installPlugin,
    listInstalled,
    pluginFrontends,
    uninstallPlugin
  } from '$/plugins/registry.svelte';
  import { PLUGIN_TEMPLATES } from '$/plugins/templates';
  import type { FlowPlugin, InstalledPlugin, PluginPermission } from '$/plugins/types';
  import dayjs from 'dayjs';
  import AddIcon from '~icons/material-symbols/extension-rounded';
  import BackIcon from '~icons/material-symbols/arrow-back-rounded';
  import DownloadIcon from '~icons/material-symbols/download-rounded';
  import InfoIcon from '~icons/material-symbols/info-outline-rounded';
  import TrashIcon from '~icons/material-symbols/delete-outline-rounded';

  let {
    open = $bindable(false),
    onFrontendSelect
  }: {
    open?: boolean;
    onFrontendSelect?: (frontend: { id: string; url: string }) => void;
  } = $props();

  type TabId = 'mcp' | 'plugins' | 'templates';

  const TABS: { id: TabId; label: string }[] = [
    { id: 'plugins', label: '已安装' },
    { id: 'templates', label: '模板库' },
    { id: 'mcp', label: 'MCP 服务' }
  ];

  const PERMISSION_META: Record<PluginPermission, { description: string; label: string }> = {
    'ai:mcp': { description: '经 MCP 桥向 AI 代理开放编辑器工具', label: 'AI 桥接' },
    'export:format': { description: '在导出菜单追加自定义格式', label: '导出格式' },
    'import:file': { description: '按扩展名接管「打开」的文件', label: '文件导入' },
    'input:transform': { description: '改写进入编辑器的代码（文件/桥接/URL）', label: '输入转换' },
    'ui:frontend': { description: '以 iframe 整页替换编辑器界面', label: '整页前端' },
    'ui:theme': { description: '注入 CSS 变量与自定义样式', label: '主题样式' }
  };

  const HOOK_LABELS: Record<string, string> = {
    activate: '生命周期 activate',
    deactivate: '生命周期 deactivate',
    export: '导出格式',
    frontend: '整页前端',
    import: '文件导入',
    inputTransform: '输入转换',
    theme: '主题样式'
  };

  let tab = $state<TabId>('plugins');
  let detailId = $state<string | undefined>(undefined);
  let confirmingUninstall = $state<string | undefined>(undefined);
  let installing = $state(false);
  // Bumped after every registry mutation so runtime info re-reads.
  let runtimeVersion = $state(0);
  let confirmTimer: ReturnType<typeof setTimeout> | undefined;

  const plugins = $derived(listInstalled());
  const frontends = $derived(pluginFrontends());
  const detailPlugin = $derived(plugins.find((p) => p.manifest.id === detailId));
  const installedIds = $derived(new Set(plugins.map((p) => p.manifest.id)));

  const runtimeOf = (id: string) => {
    void runtimeVersion;
    return getPluginRuntime(id);
  };

  $effect(() => {
    if (open) {
      tab = 'plugins';
      detailId = undefined;
      confirmingUninstall = undefined;
    }
  });

  const bump = () => {
    runtimeVersion += 1;
  };

  const onInstall = async (): Promise<void> => {
    const file = await openTextFile('.mjs,.js');
    if (!file) {
      return;
    }
    installing = true;
    try {
      const result = await installPlugin(file.text);
      if (result.ok) {
        notify(`插件安装成功：${file.name}`);
      } else {
        notify(`插件安装失败：${result.error ?? '未知错误'}`);
      }
    } finally {
      installing = false;
      bump();
    }
  };

  const setEnabled = async (plugin: InstalledPlugin, enabled: boolean): Promise<void> => {
    const id = plugin.manifest.id;
    if (enabled) {
      await enablePlugin(id);
    } else {
      disablePlugin(id);
    }
    bump();
  };

  const onUninstall = (id: string): void => {
    if (confirmingUninstall !== id) {
      confirmingUninstall = id;
      clearTimeout(confirmTimer);
      confirmTimer = setTimeout(() => (confirmingUninstall = undefined), 3000);
      return;
    }
    clearTimeout(confirmTimer);
    confirmingUninstall = undefined;
    uninstallPlugin(id);
    if (detailId === id) {
      detailId = undefined;
    }
    bump();
    notify(`插件已卸载：${id}`);
  };

  const onExport = (id: string): void => {
    const file = exportPluginSource(id);
    if (!file) {
      notify('该插件没有可导出的源码（运行时注册）');
      return;
    }
    downloadTextFile(file.filename, file.text, 'text/javascript');
    notify(`已导出 ${file.filename}`);
  };

  const installTemplate = async (templateId: string): Promise<void> => {
    const template = PLUGIN_TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return;
    }
    const result = await installPlugin(template.source);
    if (result.ok) {
      notify(`模板已安装：${template.name}`);
    } else {
      notify(`安装失败：${result.error ?? '未知错误'}`);
    }
    bump();
  };

  const formatSize = (source: string): string => {
    const bytes = new Blob([source]).size;
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatInstalledAt = (value: string): string => {
    const time = Number(value);
    return Number.isFinite(time) && time > 0 ? dayjs(time).format('YYYY-MM-DD HH:mm') : '未知';
  };

  const hookDetails = (id: string): { detail: string; key: keyof FlowPlugin; label: string }[] =>
    runtimeOf(id).hooks.map((key) => ({
      detail: runtimeOf(id).summaries[key] ?? '',
      key,
      label: HOOK_LABELS[key] ?? key
    }));
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
    data-testid={TID.pluginManager}
    onkeydown={(e) => {
      // Escape 必须冒泡给 bits-ui 的图层栈——就地拦截会让对话框 Esc
      // 关不掉（循环 155 探针实证）。其余键照常拦截，防穿透到应用级
      // 窗口快捷键（Ctrl+O 等故意无输入框守卫的全局键）。
      if (e.key !== 'Escape') {
        e.stopPropagation();
      }
    }}>
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-xl">
        <AddIcon class="size-5" /> 插件管理
      </Dialog.Title>
      <Dialog.Description>
        安装、配置与诊断插件。插件从本地安装（.mjs），源码只保存在本机；连续 3
        次运行出错的插件会被自动停用。
      </Dialog.Description>
    </Dialog.Header>

    <!-- 标签页切换 -->
    <div class="mb-4 flex gap-1 rounded-lg border bg-muted/40 p-1" role="tablist">
      {#each TABS as item (item.id)}
        <button
          role="tab"
          aria-selected={tab === item.id}
          class={[
            'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
            tab === item.id
              ? 'bg-background font-medium shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          ]}
          data-testid="plugin-tab-{item.id}"
          onclick={() => {
            tab = item.id;
            detailId = undefined;
          }}>
          {item.label}
          {#if item.id === 'plugins' && plugins.length > 0}
            <span class="ml-1 text-xs text-muted-foreground">{plugins.length}</span>
          {/if}
        </button>
      {/each}
    </div>

    {#if tab === 'plugins'}
      {#if detailPlugin}
        {@const runtime = runtimeOf(detailPlugin.manifest.id)}
        <!-- ============ 详情视图 ============ -->
        <div class="flex flex-col gap-4" data-testid="plugin-detail">
          <div class="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              data-testid="plugin-detail-back"
              onclick={() => (detailId = undefined)}>
              <BackIcon /> 返回列表
            </Button>
            <div class="flex items-center gap-2 text-sm">
              {detailPlugin.enabled ? '已启用' : '已停用'}
              <Switch
                checked={detailPlugin.enabled}
                onCheckedChange={(v) => void setEnabled(detailPlugin, v)}
                data-testid={detailPlugin.enabled
                  ? `plugin-disable-${detailPlugin.manifest.id}`
                  : `plugin-enable-${detailPlugin.manifest.id}`} />
            </div>
          </div>

          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-base font-semibold">{detailPlugin.manifest.name}</h3>
              <span class="rounded-full bg-muted px-2 py-0.5 text-[11px]"
                >v{detailPlugin.manifest.version}</span>
              {#if runtime.errors > 0}
                <span
                  class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                  连续出错 ×{runtime.errors}
                </span>
              {/if}
            </div>
            {#if detailPlugin.manifest.description}
              <p class="mt-1 text-sm text-muted-foreground">{detailPlugin.manifest.description}</p>
            {/if}
          </div>

          <dl class="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 text-xs sm:grid-cols-3">
            <div>
              <dt class="text-muted-foreground">插件 ID</dt>
              <dd class="mt-0.5 font-mono break-all">{detailPlugin.manifest.id}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">安装时间</dt>
              <dd class="mt-0.5">{formatInstalledAt(detailPlugin.installedAt)}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">源码大小</dt>
              <dd class="mt-0.5">
                {detailPlugin.source ? formatSize(detailPlugin.source) : '不可用（运行时注册）'}
              </dd>
            </div>
            <div>
              <dt class="text-muted-foreground">模块状态</dt>
              <dd class="mt-0.5">{runtime.loaded ? '已加载' : '未加载'}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">存储命名空间</dt>
              <dd class="mt-0.5 font-mono break-all">flow-plugin:{detailPlugin.manifest.id}:*</dd>
            </div>
          </dl>

          <section>
            <h4 class="mb-1.5 text-xs font-medium">声明权限</h4>
            {#if detailPlugin.manifest.permissions?.length}
              <ul class="flex flex-col gap-1">
                {#each detailPlugin.manifest.permissions as permission (permission)}
                  <li class="flex items-baseline gap-2 text-xs">
                    <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium">
                      {PERMISSION_META[permission]?.label ?? permission}
                    </span>
                    <span class="text-muted-foreground">
                      {PERMISSION_META[permission]?.description ?? ''}
                    </span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-xs text-muted-foreground">
                未声明权限（插件仍可通过 activate 主动行动）。
              </p>
            {/if}
          </section>

          <section>
            <h4 class="mb-1.5 text-xs font-medium">实现的钩子</h4>
            {#if runtime.hooks.length > 0}
              <ul class="flex flex-col gap-1">
                {#each hookDetails(detailPlugin.manifest.id) as hook (hook.key)}
                  <li class="flex items-baseline gap-2 text-xs">
                    <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 font-medium"
                      >{hook.label}</span>
                    {#if hook.detail}
                      <span class="truncate font-mono text-muted-foreground" title={hook.detail}
                        >{hook.detail}</span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-xs text-muted-foreground">模块未加载或无钩子。</p>
            {/if}
          </section>

          {#if detailPlugin.source}
            <section>
              <h4 class="mb-1.5 text-xs font-medium">源码预览</h4>
              <pre
                class="max-h-56 overflow-auto rounded-lg border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed"
                data-testid="plugin-detail-source">{detailPlugin.source}</pre>
            </section>
          {/if}

          <div class="flex flex-wrap items-center gap-2 border-t pt-3">
            {#each frontends.filter((f) => f.id === detailPlugin.manifest.id) as frontend (frontend.id)}
              <Button size="sm" variant="outline" onclick={() => onFrontendSelect?.(frontend)}>
                打开 {frontend.name}
              </Button>
            {/each}
            <Button
              size="sm"
              variant="outline"
              disabled={!detailPlugin.source}
              data-testid="plugin-download-{detailPlugin.manifest.id}"
              onclick={() => onExport(detailPlugin.manifest.id)}>
              <DownloadIcon /> 导出 .mjs
            </Button>
            {#if !detailPlugin.builtin}
              <Button
                size="sm"
                variant={confirmingUninstall === detailPlugin.manifest.id
                  ? 'destructive'
                  : 'outline'}
                data-testid="plugin-uninstall-{detailPlugin.manifest.id}"
                onclick={() => onUninstall(detailPlugin.manifest.id)}>
                <TrashIcon />
                {confirmingUninstall === detailPlugin.manifest.id ? '确认卸载？' : '卸载'}
              </Button>
            {:else}
              <span class="self-center text-[11px] text-muted-foreground"
                >内置插件（仅可停用）</span>
            {/if}
          </div>
        </div>
      {:else}
        <!-- ============ 列表视图 ============ -->
        <div class="mb-3 flex items-center gap-2">
          <Button
            size="sm"
            disabled={installing}
            data-testid={TID.pluginInstall}
            onclick={() => void onInstall()}>
            <AddIcon />
            从本地安装（.mjs）
          </Button>
          <span class="text-xs text-muted-foreground">
            没有插件源码？到「模板库」一键安装起点模板。
          </span>
        </div>

        {#if plugins.length === 0}
          <div class="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
            尚未安装插件。插件是用户从本地安装的 ES 模块（default export 清单 + 钩子），
            可处理输入/导出/主题/前端替换，并可通过 MCP 桥接入 AI。
          </div>
        {:else}
          <div class="flex flex-col gap-2">
            {#each plugins as plugin (plugin.manifest.id)}
              {@const runtime = runtimeOf(plugin.manifest.id)}
              <div class="rounded-lg border p-3" data-testid="plugin-card-{plugin.manifest.id}">
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <span class="truncate text-sm font-medium">{plugin.manifest.name}</span>
                      <span class="text-[11px] text-muted-foreground"
                        >v{plugin.manifest.version}</span>
                      {#if plugin.builtin}
                        <span
                          class="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
                          >内置</span>
                      {/if}
                      {#if plugin.enabled}
                        <span
                          class="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                          >已启用</span>
                      {:else}
                        <span
                          class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                          >已停用</span>
                      {/if}
                      {#if runtime.errors > 0}
                        <span
                          class="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                          >出错 ×{runtime.errors}</span>
                      {/if}
                    </div>
                    <div class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                      {plugin.manifest.id}
                    </div>
                    {#if plugin.manifest.description}
                      <div class="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {plugin.manifest.description}
                      </div>
                    {/if}
                    {#if plugin.manifest.permissions?.length}
                      <div class="mt-1.5 flex flex-wrap gap-1">
                        {#each plugin.manifest.permissions as permission (permission)}
                          <span class="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                            {PERMISSION_META[permission]?.label ?? permission}
                          </span>
                        {/each}
                      </div>
                    {/if}
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1.5">
                    <Switch
                      checked={plugin.enabled}
                      title={plugin.enabled ? '停用' : '启用'}
                      onCheckedChange={(v) => void setEnabled(plugin, v)}
                      data-testid={plugin.enabled
                        ? `plugin-disable-${plugin.manifest.id}`
                        : `plugin-enable-${plugin.manifest.id}`} />
                    <div class="flex items-center gap-0.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        class="size-7 p-0"
                        title="详情"
                        data-testid="plugin-info-{plugin.manifest.id}"
                        onclick={() => (detailId = plugin.manifest.id)}>
                        <InfoIcon />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        class="size-7 p-0"
                        title="导出 .mjs"
                        disabled={!plugin.source}
                        data-testid="plugin-download-{plugin.manifest.id}"
                        onclick={() => onExport(plugin.manifest.id)}>
                        <DownloadIcon />
                      </Button>
                      {#if !plugin.builtin}
                        <Button
                          size="sm"
                          variant={confirmingUninstall === plugin.manifest.id
                            ? 'destructive'
                            : 'ghost'}
                          class={confirmingUninstall === plugin.manifest.id
                            ? 'h-7 px-2 text-xs'
                            : 'size-7 p-0'}
                          title="卸载"
                          data-testid="plugin-uninstall-{plugin.manifest.id}"
                          onclick={() => onUninstall(plugin.manifest.id)}>
                          {#if confirmingUninstall === plugin.manifest.id}
                            确认卸载？
                          {:else}
                            <TrashIcon />
                          {/if}
                        </Button>
                      {/if}
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}

        {#if frontends.length > 0}
          <div class="mt-3 border-t pt-3">
            <div class="mb-1 text-xs font-medium">插件前端（整页替换）</div>
            {#each frontends as frontend (frontend.id)}
              <Button
                size="sm"
                variant="outline"
                class="mr-2"
                onclick={() => onFrontendSelect?.(frontend)}>
                打开 {frontend.name}
              </Button>
            {/each}
          </div>
        {/if}
      {/if}
    {:else if tab === 'templates'}
      <!-- ============ 模板库 ============ -->
      <p class="mb-3 text-xs text-muted-foreground">
        每个模板都是完整可运行的插件源码，注释详尽——直接安装体验，或下载后改成你自己的插件。
      </p>
      <div class="flex flex-col gap-2">
        {#each PLUGIN_TEMPLATES as template (template.id)}
          <div class="rounded-lg border p-3" data-testid="template-card-{template.id}">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="text-sm font-medium">{template.name}</span>
                  {#each template.permissions as permission (permission)}
                    <span class="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      {PERMISSION_META[permission]?.label ?? permission}
                    </span>
                  {/each}
                </div>
                <p class="mt-1 text-xs text-muted-foreground">{template.description}</p>
              </div>
              <div class="flex shrink-0 items-center gap-1.5">
                {#if installedIds.has(template.id)}
                  <span
                    class="rounded-full bg-muted px-2 py-1 text-[11px] text-muted-foreground"
                    data-testid="template-install-{template.id}">
                    已安装
                  </span>
                {:else}
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="template-install-{template.id}"
                    onclick={() => void installTemplate(template.id)}>
                    安装
                  </Button>
                {/if}
                <Button
                  size="sm"
                  variant="ghost"
                  title="下载 .mjs"
                  data-testid="template-download-{template.id}"
                  onclick={() =>
                    downloadTextFile(`${template.id}.mjs`, template.source, 'text/javascript')}>
                  <DownloadIcon />
                </Button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- ============ MCP 服务 ============ -->
      <McpManager />
    {/if}

    <div class="mt-4 flex justify-end border-t pt-3">
      <Dialog.Close class={buttonVariants({ size: 'sm', variant: 'outline' })}>关闭</Dialog.Close>
    </div>
  </Dialog.Content>
</Dialog.Root>
