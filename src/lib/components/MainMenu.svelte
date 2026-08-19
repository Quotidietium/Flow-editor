<script lang="ts">
  import * as Popover from '$/components/ui/popover';
  import { Switch } from '$/components/ui/switch';
  import { env } from '$/util/env';
  import { urls } from '$/util/state.svelte';
  import { cn } from '$/utils';
  import { mode, setMode } from 'mode-watcher';
  import type { Component, Snippet } from 'svelte';
  import MermaidTailIcon from '~icons/custom/mermaid-tail';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import BookIcon from '~icons/material-symbols/book-2-outline-rounded';
  import DuplicateIcon from '~icons/material-symbols/content-copy-outline-rounded';
  import ContrastIcon from '~icons/material-symbols/contrast';
  import MenuIcon from '~icons/material-symbols/menu-rounded';
  import CommunityIcon from '~icons/material-symbols/person-play-outline-rounded';

  interface MenuItem {
    label: string;
    icon: Component;
    href: string;
    class?: string;
    isSectionEnd?: boolean;
    renderer: Snippet<[Omit<MenuItem, 'renderer'>]>;
  }

  const menuItems: MenuItem[] = $derived([
    { href: urls.current.new, icon: AddIcon, label: 'New', renderer: menuItem },
    {
      href: window.location.href,
      icon: DuplicateIcon,
      isSectionEnd: true,
      label: 'Duplicate',
      renderer: menuItem
    },
    {
      href: env.docsUrl,
      icon: MermaidTailIcon,
      label: 'Mermaid.js',
      renderer: menuItem
    },
    {
      href: `${env.docsUrl}/intro/`,
      icon: BookIcon,
      label: 'Documentation',
      renderer: menuItem
    },
    {
      href: 'https://discord.gg/sKeNQX4Wtj',
      icon: CommunityIcon,
      isSectionEnd: true,
      label: 'Community',
      renderer: menuItem
    },
    {
      href: '#',
      icon: ContrastIcon,
      label: 'Dark Mode',
      renderer: darkModeMenuItem
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
    <span class="flex items-center gap-2">
      <ContrastIcon />
      Dark Mode
    </span>
    <Switch
      checked={mode.current === 'dark'}
      onCheckedChange={(dark) => setMode(dark ? 'dark' : 'light')} />
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
