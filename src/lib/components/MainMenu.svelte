<script lang="ts">
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
  import MenuIcon from '~icons/material-symbols/menu-rounded';

  interface MenuItem {
    label: string;
    icon: Component;
    href: string;
    class?: string;
    isSectionEnd?: boolean;
    renderer: Snippet<[Omit<MenuItem, 'renderer'>]>;
  }

  const menuItems: MenuItem[] = $derived([
    { href: urls.current.new, icon: AddIcon, label: '新建', renderer: menuItem },
    {
      href: window.location.href,
      icon: DuplicateIcon,
      isSectionEnd: true,
      label: '复制副本',
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
    }
  ]);
</script>

{#snippet menuItem(options: Omit<MenuItem, 'renderer'>)}
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
