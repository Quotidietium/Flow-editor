<script lang="ts">
  import * as Dialog from '$/components/ui/dialog';
  import * as Popover from '$/components/ui/popover';
  import { Button } from '$/components/ui/button';
  import { Switch } from '$/components/ui/switch';
  import { clearAssets, exportAssets, importAssets, parseAssetBundle } from '$/util/assetPort';
  import { downloadTextFile, openTextFile } from '$/util/fileIO';
  import { loadUserPresets } from '$/util/configPresets';
  import { notify } from '$/util/notify';
  import { editorFontSize } from '$/util/editorFontSize.svelte';
  import { loadUserSamples } from '$/util/userSamples';
  import { loadUserSnippets } from '$/util/userSnippets';
  import { urls } from '$/util/state.svelte';
  import { cn } from '$/utils';
  import { mode, setMode } from 'mode-watcher';
  import type { Component, Snippet } from 'svelte';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DuplicateIcon from '~icons/material-symbols/content-copy-outline-rounded';
  import ContrastIcon from '~icons/material-symbols/contrast';
  import FontIcon from '~icons/material-symbols/format-size-rounded';
  import InventoryIcon from '~icons/material-symbols/inventory-2-outline-rounded';
  import KeyboardIcon from '~icons/material-symbols/keyboard-rounded';
  import MenuIcon from '~icons/material-symbols/menu-rounded';

  interface MenuItem {
    label: string;
    icon: Component;
    href: string;
    /** 点击时求值的打开动作（href 为 '#' 时生效）——复制副本必须取
     *  点击时刻的 URL：挂载期捕获的 href 在编辑后是旧图（循环 100
     *  同族过期缺陷）。 */
    onClick?: () => void;
    class?: string;
    isSectionEnd?: boolean;
    renderer: Snippet<[Omit<MenuItem, 'renderer'>]>;
  }

  const menuItems: MenuItem[] = $derived([
    { href: urls.current.new, icon: AddIcon, label: '新建', renderer: menuItem },
    {
      href: '#',
      icon: DuplicateIcon,
      isSectionEnd: true,
      label: '复制副本',
      onClick: () => window.open(window.location.href, '_blank'),
      renderer: menuItem
    },
    {
      href: '#',
      icon: ContrastIcon,
      label: '深色模式',
      renderer: darkModeMenuItem
    },
    {
      href: '#',
      icon: FontIcon,
      label: '编辑器字号',
      renderer: fontSizeMenuItem
    },
    {
      href: '#',
      icon: KeyboardIcon,
      label: '快捷键',
      renderer: shortcutsMenuItem
    },
    {
      href: '#',
      icon: InventoryIcon,
      label: '我的资产备份',
      renderer: assetsMenuItem
    }
  ]);

  // 应用级快捷键（可视化编辑器的 24 项在其工具栏帮助里，此处不重复）
  let helpOpen = $state(false);

  // 个人资产备份：三类「我的××」锁死在单浏览器 localStorage——
  // 导出 JSON 换设备导入。计数在对话框打开时刷新。
  let assetsOpen = $state(false);
  let assetCounts = $state({ configPresets: 0, samples: 0, snippets: 0 });
  const refreshAssetCounts = () => {
    assetCounts = {
      configPresets: loadUserPresets().length,
      samples: loadUserSamples().length,
      snippets: loadUserSnippets().length
    };
  };

  const onExportAssets = () => {
    downloadTextFile('flow-editor-assets.json', JSON.stringify(exportAssets()), 'application/json');
    notify('已导出个人资产');
  };

  const onImportAssets = async () => {
    const file = await openTextFile('.json');
    if (!file) {
      return;
    }
    const bundle = parseAssetBundle(file.text);
    if (!bundle) {
      notify('资产文件无法识别（需本编辑器导出的 JSON）');
      return;
    }
    const result = importAssets(bundle);
    refreshAssetCounts();
    // 通知持有本地 $state 的三处菜单重读 storage——否则导入内容要整页
    // 刷新才可见（e2e 实证）
    window.dispatchEvent(new CustomEvent('flow-assets-changed'));
    notify(`已导入：模板 ${result.configPresets}、示例 ${result.samples}、片段 ${result.snippets}`);
  };

  const onClearAssets = () => {
    if (confirm('确定清空本机的模板/示例/片段？（建议先导出备份）')) {
      clearAssets();
      refreshAssetCounts();
      notify('已清空本机个人资产');
    }
  };
</script>

{#snippet menuItem(options: Omit<MenuItem, 'renderer'>)}
  {#if options.onClick}
    <button
      type="button"
      class={cn(
        'flex w-full cursor-pointer items-center justify-start gap-2 border-b-2 p-2 px-3 text-left hover:bg-muted',
        options.isSectionEnd && 'border-border-dark',
        options.class
      )}
      data-testid="menu-duplicate"
      onclick={options.onClick}>
      <options.icon class="size-5" />
      {options.label}
    </button>
  {:else}
    <a
      href={options.href}
      target="_blank"
      class={cn(
        'flex items-center justify-start gap-2 border-b-2 p-2 px-3 hover:bg-muted',
        options.isSectionEnd && 'border-border-dark',
        options.class
      )}>
      <options.icon class="size-5" />
      {options.label}
    </a>
  {/if}
{/snippet}

{#snippet darkModeMenuItem(options: Omit<MenuItem, 'renderer'>)}
  <div
    class={cn(
      'flex cursor-pointer items-center justify-between border-b-2 px-3 py-2 hover:bg-muted',
      options.isSectionEnd && 'border-border-dark',
      options.class
    )}>
    <!-- 行文本自身即切换入口（role=button+键盘全可达——整行 cursor-pointer
         却只有 Switch 可点的「点击假象」消除；Switch 保留为视觉发现路径） -->
    <span
      class="flex items-center gap-2"
      role="button"
      tabindex="0"
      onclick={() => setMode(mode.current === 'dark' ? 'light' : 'dark')}
      onkeydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setMode(mode.current === 'dark' ? 'light' : 'dark');
        }
      }}>
      <ContrastIcon />
      {options.label}
    </span>
    <Switch
      checked={mode.current === 'dark'}
      onCheckedChange={(dark) => setMode(dark ? 'dark' : 'light')} />
  </div>
{/snippet}

{#snippet fontSizeMenuItem(options: Omit<MenuItem, 'renderer'>)}
  <!-- 移动端 390px 头部字号菜单被空间妥协隐藏后，移动端唯一调节入口
       （偏好单例化，桌面 FontSizeMenu 与本行共享同一值） -->
  <div class={cn('flex items-center justify-between px-3 py-2 hover:bg-muted', options.class)}>
    <span class="flex items-center gap-2">
      <FontIcon />
      编辑器字号
    </span>
    <span class="flex items-center gap-1 tabular-nums">
      <button
        class="rounded border px-1.5 hover:bg-background"
        data-testid="menu-font-dec"
        aria-label="减小字号"
        onclick={() => editorFontSize.step(-2)}>
        −
      </button>
      <span class="w-7 text-center" data-testid="menu-font-size">{editorFontSize.current}</span>
      <button
        class="rounded border px-1.5 hover:bg-background"
        data-testid="menu-font-inc"
        aria-label="增大字号"
        onclick={() => editorFontSize.step(2)}>
        ＋
      </button>
    </span>
  </div>
{/snippet}

{#snippet shortcutsMenuItem(options: Omit<MenuItem, 'renderer'>)}
  <button
    type="button"
    class={cn(
      'flex w-full cursor-pointer items-center gap-2 border-b-2 px-3 py-2 text-left hover:bg-muted',
      options.isSectionEnd && 'border-border-dark',
      options.class
    )}
    data-testid="menu-shortcuts"
    onclick={() => (helpOpen = true)}>
    <KeyboardIcon />
    {options.label}
  </button>
{/snippet}

{#snippet assetsMenuItem(options: Omit<MenuItem, 'renderer'>)}
  <button
    type="button"
    class={cn(
      'flex w-full cursor-pointer items-center gap-2 border-b-2 px-3 py-2 text-left hover:bg-muted',
      options.isSectionEnd && 'border-border-dark',
      options.class
    )}
    data-testid="menu-assets"
    onclick={() => {
      refreshAssetCounts();
      assetsOpen = true;
    }}>
    <InventoryIcon />
    {options.label}
  </button>
{/snippet}

<Popover.Root>
  <Popover.Trigger class="shrink-0">
    <MenuIcon class="size-6" />
  </Popover.Trigger>
  <Popover.Content align="start" class="flex flex-col overflow-hidden border-2 p-0" sideOffset={16}>
    {#each menuItems as { renderer, ...item } (item.label)}
      {@render renderer(item)}
    {/each}
  </Popover.Content>
</Popover.Root>

<Dialog.Root bind:open={helpOpen}>
  <Dialog.Content class="max-w-md" data-testid="app-shortcuts-dialog">
    <Dialog.Header>
      <Dialog.Title>快捷键与操作</Dialog.Title>
      <Dialog.Description>编辑器的常用键盘与鼠标操作</Dialog.Description>
    </Dialog.Header>
    <div class="flex max-h-[60vh] flex-col gap-1 overflow-y-auto pr-1">
      {#each [['Ctrl+S', '收藏当前图到历史「已保存」'], ['Ctrl+E', '切换可视化编辑（代码 ↔ 画布）'], ['Ctrl+滚轮', '预览区缩放（编辑页）'], ['双指捏合', '预览/可视化画布缩放（触屏）'], ['Enter', '输入框提交（含各编辑器表单）'], ['Ctrl+Enter', '多行文本域保存（编辑内容对话框）'], ['Esc', '清空搜索框 / 关闭菜单与对话框'], ['双击', '历史条目名直接重命名'], ['拖入文件', '把 .mmd/.md/.json 拖到窗口直接打开'], ['Ctrl+A/C/X/V/D', '可视化画布 全选/复制/剪切/粘贴/克隆'], ['Ctrl+Z / Ctrl+Shift+Z', '可视化画布 撤销 / 重做']] as [keys, desc] (keys)}
        <div class="flex items-center justify-between gap-4 text-sm">
          <span>{desc}</span>
          <kbd class="rounded border bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap">{keys}</kbd>
        </div>
      {/each}
      <div class="mt-2 text-xs text-muted-foreground">
        可视化编辑器的完整操作（24 项）见其工具栏的「快捷键与操作帮助」按钮。
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={assetsOpen}>
  <Dialog.Content class="max-w-md" data-testid="assets-dialog">
    <Dialog.Header>
      <Dialog.Title>我的资产备份</Dialog.Title>
      <Dialog.Description>
        模板/示例/片段保存在本浏览器——导出 JSON 可带到其他设备或浏览器。
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex flex-col gap-3">
      <div
        class="flex items-center justify-around rounded-md border bg-muted/40 p-3 text-center text-sm">
        <div>
          <div class="text-lg font-semibold tabular-nums">{assetCounts.configPresets}</div>
          <div class="text-xs text-muted-foreground">配置模板</div>
        </div>
        <div>
          <div class="text-lg font-semibold tabular-nums">{assetCounts.samples}</div>
          <div class="text-xs text-muted-foreground">我的示例</div>
        </div>
        <div>
          <div class="text-lg font-semibold tabular-nums">{assetCounts.snippets}</div>
          <div class="text-xs text-muted-foreground">代码片段</div>
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <Button size="sm" data-testid="assets-export" onclick={onExportAssets}>导出到文件</Button>
        <Button
          size="sm"
          variant="outline"
          data-testid="assets-import"
          onclick={() => void onImportAssets()}>
          从文件导入（同名覆盖）
        </Button>
        <Button
          size="sm"
          variant="ghost"
          class="hover:text-destructive"
          data-testid="assets-clear"
          onclick={onClearAssets}>
          清空本机
        </Button>
      </div>
      <div class="text-xs text-muted-foreground">
        导入按「同名覆盖」合并到本机现有资产；清空前建议先导出备份。
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
