<script lang="ts">
  import * as Dialog from '$/components/ui/dialog';
  import * as Popover from '$/components/ui/popover';
  import { Switch } from '$/components/ui/switch';
  import { editorFontSize } from '$/util/editorFontSize.svelte';
  import { urls } from '$/util/state.svelte';
  import { cn } from '$/utils';
  import { mode, setMode } from 'mode-watcher';
  import type { Component, Snippet } from 'svelte';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DuplicateIcon from '~icons/material-symbols/content-copy-outline-rounded';
  import ContrastIcon from '~icons/material-symbols/contrast';
  import FontIcon from '~icons/material-symbols/format-size-rounded';
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
    }
  ]);

  // 应用级快捷键（可视化编辑器的 24 项在其工具栏帮助里，此处不重复）
  let helpOpen = $state(false);
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
      {#each [['Ctrl+S', '收藏当前图到历史「已保存」'], ['Ctrl+滚轮', '预览区缩放（编辑页）'], ['双指捏合', '预览/可视化画布缩放（触屏）'], ['Enter', '输入框提交（含各编辑器表单）'], ['Ctrl+Enter', '多行文本域保存（编辑内容对话框）'], ['Esc', '清空搜索框 / 关闭菜单与对话框'], ['双击', '历史条目名直接重命名'], ['拖入文件', '把 .mmd/.md/.json 拖到窗口直接打开'], ['Ctrl+A/C/X/V/D', '可视化画布 全选/复制/剪切/粘贴/克隆'], ['Ctrl+Z / Ctrl+Shift+Z', '可视化画布 撤销 / 重做']] as [keys, desc] (keys)}
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
