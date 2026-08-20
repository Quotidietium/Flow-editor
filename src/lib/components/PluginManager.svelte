<script lang="ts">
  import { Button } from '$/components/ui/button';
  import { TID } from '$/constants';
  import { notify } from '$/util/notify';
  import { openTextFile } from '$/util/fileIO';
  import {
    disablePlugin,
    enablePlugin,
    installPlugin,
    listInstalled,
    pluginFrontends,
    uninstallPlugin
  } from '$/plugins/registry.svelte';
  import type { InstalledPlugin } from '$/plugins/types';
  import AddIcon from '~icons/material-symbols/extension-rounded';
  import TrashIcon from '~icons/material-symbols/delete-outline-rounded';

  let {
    open = $bindable(false),
    onFrontendSelect
  }: {
    open?: boolean;
    onFrontendSelect?: (frontend: { id: string; url: string }) => void;
  } = $props();

  let installing = $state(false);
  let plugins = $state<InstalledPlugin[]>([]);

  $effect(() => {
    if (open) {
      plugins = listInstalled();
    }
  });

  const refresh = () => {
    plugins = listInstalled();
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
      refresh();
    }
  };

  const frontends = $derived(pluginFrontends());
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    data-testid={TID.pluginManager}
    role="dialog"
    tabindex="-1"
    aria-label="插件管理"
    onkeydown={(e) => e.stopPropagation()}>
    <div
      class="max-h-[80vh] w-full max-w-lg overflow-auto rounded-lg border bg-background p-4 shadow-lg">
      <div class="mb-3 flex items-center justify-between">
        <h2 class="text-sm font-semibold">插件管理</h2>
        <Button size="sm" variant="ghost" onclick={() => (open = false)}>关闭</Button>
      </div>

      <div class="mb-3 flex items-center gap-2">
        <Button
          size="sm"
          disabled={installing}
          data-testid={TID.pluginInstall}
          onclick={() => void onInstall()}>
          <AddIcon />
          从本地安装（.mjs）
        </Button>
        <span class="text-xs text-muted-foreground"> 插件 API 文档见 note/plugin-api.md </span>
      </div>

      {#if plugins.length === 0}
        <div class="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
          尚未安装插件。插件是用户从本地安装的 ES 模块（default export 清单 + 钩子），
          可处理输入/导出/主题/前端替换，并可通过 MCP 桥接入 AI。
        </div>
      {:else}
        <div class="flex flex-col gap-2">
          {#each plugins as plugin (plugin.manifest.id)}
            <div class="rounded border p-2" data-testid="plugin-card-{plugin.manifest.id}">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate text-xs font-medium">
                    {plugin.manifest.name}
                    <span class="ml-1 text-muted-foreground">v{plugin.manifest.version}</span>
                  </div>
                  <div class="truncate text-[11px] text-muted-foreground">
                    {plugin.manifest.id}
                    {#if plugin.manifest.permissions?.length}
                      · 权限：{plugin.manifest.permissions.join(', ')}
                    {/if}
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  {#if plugin.enabled}
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="plugin-disable-{plugin.manifest.id}"
                      onclick={() => {
                        disablePlugin(plugin.manifest.id);
                        refresh();
                      }}>
                      停用
                    </Button>
                  {:else}
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="plugin-enable-{plugin.manifest.id}"
                      onclick={() => {
                        void enablePlugin(plugin.manifest.id).then(refresh);
                      }}>
                      启用
                    </Button>
                  {/if}
                  <Button
                    size="sm"
                    variant="ghost"
                    title="卸载"
                    onclick={() => {
                      uninstallPlugin(plugin.manifest.id);
                      refresh();
                    }}>
                    <TrashIcon />
                  </Button>
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
    </div>
  </div>
{/if}
