<script lang="ts">
  import type { Tab } from '$/types';
  import { readJSON, writeJSON } from '$/util/persist.svelte';
  import type { Component, Snippet } from 'svelte';
  import { untrack } from 'svelte';
  import { quintOut } from 'svelte/easing';
  import { slide } from 'svelte/transition';
  import CollapseAllIcon from '~icons/material-symbols/collapse-all-rounded';
  import Tabs from './Tabs.svelte';

  interface Props {
    isClosable?: boolean;
    isOpen?: boolean;
    isStackable?: boolean;
    /** 折叠状态跨会话记忆的 localStorage 键；不设则不持久化。 */
    persistKey?: string;
    tabs?: Tab[];
    activeTabID?: string;
    title?: string;
    icon?: {
      component: Component;
      class?: string;
    };
    onselect?: (tab: Tab) => void;
    actions?: Snippet;
    children: Snippet;
  }

  let {
    isClosable = true,
    isOpen: initialOpen = false,
    isStackable = false,
    persistKey: openStateKey,
    tabs = [],
    activeTabID = '',
    title,
    icon,
    onselect,
    actions,
    children
  }: Props = $props();

  // 折叠状态跨会话记忆：用户收起示例卡片专心作图（或常驻展开），
  // 重载后保持——不给 key 的卡片行为不变（编辑卡恒展开）。
  // untrack 显式声明「只取初始值」（编译器认可的消警模式）。
  let isOpen = $state(
    untrack(() => (openStateKey ? readJSON<boolean>(openStateKey, initialOpen) : initialOpen))
  );

  const toggleCardOpen = () => {
    if (isClosable) {
      isOpen = !isOpen;
      if (openStateKey) {
        writeJSON(openStateKey, isOpen);
      }
    }
  };

  let isTabsShown = $derived(isOpen && tabs.length > 0);
</script>

<div
  class={[
    'card flex h-fit flex-col overflow-hidden rounded-2xl border-2 border-muted',
    isOpen && 'isOpen flex-grow',
    isStackable ? 'flex-1 group-has-[.isOpen]:w-full group-has-[.isOpen]:flex-none' : 'w-full'
  ]}>
  <div
    role="toolbar"
    tabindex="0"
    class={[
      'flex h-11 flex-none cursor-pointer items-center justify-between bg-muted p-2 whitespace-nowrap',
      isTabsShown && 'pb-1'
    ]}
    onclick={toggleCardOpen}
    onkeypress={toggleCardOpen}>
    {#if icon || title}
      <span role="menubar" tabindex="0" class="flex w-fit items-center gap-3">
        {#if icon}
          <icon.component class={icon.class} />
        {/if}
        {title}
      </span>
    {/if}
    {#if isOpen && tabs && tabs.length > 0}
      <Tabs {onselect} {tabs} {activeTabID} />
    {/if}

    {@render actions?.()}

    {#if isOpen && isClosable}
      <CollapseAllIcon />
    {/if}
  </div>
  {#if isOpen}
    <div class="flex-grow overflow-x-auto" transition:slide={{ easing: quintOut }}>
      {@render children()}
    </div>
  {/if}
</div>
