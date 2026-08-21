<script lang="ts">
  import MainMenu from '$/components/MainMenu.svelte';
  import { resolve } from '$app/paths';
  import type { Snippet } from 'svelte';
  import MermaidIcon from '~icons/custom/mermaid';

  interface Props {
    children: Snippet;
    mobileToggle?: Snippet;
  }

  let { children, mobileToggle }: Props = $props();
</script>

<div class="z-50">
  <nav class="flex p-4 sm:p-6">
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
  {#if mobileToggle}
    <!-- Narrow viewports hid the action row entirely, making Share (and the
         history/plugins toggles) unreachable on mobile — a documented feature
         with no entry point. Render the same row beneath the brand bar. -->
    <div class="flex flex-wrap items-center justify-end gap-2 px-4 pb-2 md:hidden">
      {@render children()}
    </div>
  {/if}
</div>
