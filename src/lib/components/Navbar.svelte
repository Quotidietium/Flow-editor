<script lang="ts">
  import MainMenu from '$/components/MainMenu.svelte';
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import MermaidIcon from '~icons/custom/mermaid';

  interface Props {
    mobileToggle?: Snippet;
    children: Snippet;
  }

  let { children, mobileToggle }: Props = $props();
</script>

<nav class="z-50 flex p-4 sm:p-6">
  <div class="flex flex-1 items-center gap-2">
    <MainMenu />
    <MermaidIcon class="size-6" />
    <a href={resolve('/', {})} class="whitespace-nowrap text-accent">
      {#if !mobileToggle}
        Flow
      {/if}
      编辑器
    </a>
  </div>
  <div
    id="menu"
    class="hidden flex-nowrap items-center justify-between gap-3 overflow-hidden md:flex">
    {@render children()}
  </div>
  {@render mobileToggle?.()}
</nav>
