<script lang="ts">
  import EmbedView from '$/components/EmbedView.svelte';
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import { TID } from '$/constants';
  import {
    buildEditUrl,
    resolveEmbedSettings,
    serializeEmbedState,
    toggleMode,
    type EmbedMode,
    type ResolvedEmbed
  } from '$/util/embed';
  import { PanZoomState } from '$/util/panZoom';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import DarkModeIcon from '~icons/material-symbols/dark-mode-outline';
  import LightModeIcon from '~icons/material-symbols/light-mode-outline';

  let resolved = $state<ResolvedEmbed>();
  const panZoomState = new PanZoomState();

  const applyMode = (embedMode: EmbedMode) => {
    // Local to the embed document — independent of the editor's theme store.
    document.documentElement.classList.toggle('dark', embedMode === 'dark');
  };

  onMount(() => {
    const resolveFromLocation = () => {
      const next = resolveEmbedSettings(new URL(window.location.href));
      if (next.settings) {
        applyMode(next.settings.mode);
      }
      resolved = next;
    };
    resolveFromLocation();
    window.addEventListener('hashchange', resolveFromLocation);
    return () => window.removeEventListener('hashchange', resolveFromLocation);
  });

  const flipMode = () => {
    if (!resolved?.settings) {
      return;
    }
    const settings = toggleMode(resolved.settings);
    applyMode(settings.mode);
    resolved = { settings };
  };
</script>

<svelte:head>
  <title>Mermaid 图表</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="flex h-dvh flex-col bg-background text-foreground">
  <div class="relative min-h-0 flex-1">
    {#if resolved?.error}
      <div class="flex h-full items-center justify-center p-4">
        <div
          data-testid={TID.embedErrorCard}
          class="max-w-md rounded-lg border bg-card p-4 text-center text-sm text-card-foreground shadow-sm">
          <p>{resolved.error}</p>
          <p class="mt-2 text-muted-foreground">
            请检查链接是否完整，或<a class="underline" href={resolve('/edit', {})}>创建新图表</a>。
          </p>
        </div>
      </div>
    {:else if resolved?.settings}
      {@const settings = resolved.settings}
      <EmbedView
        code={settings.code}
        config={settings.config}
        dark={settings.mode === 'dark'}
        grid={settings.grid}
        pan={settings.pan}
        {panZoomState}
        rough={settings.rough}
        zoom={settings.zoom} />

      {#if settings.controls}
        <div class="absolute top-2 right-2" data-testid={TID.embedToolbar}>
          <PanZoomToolbar {panZoomState} compact />
        </div>
        <Button
          data-testid={TID.embedModeToggle}
          class="absolute top-2 left-2"
          variant="ghost"
          size="icon"
          title="切换浅色 / 深色"
          onclick={flipMode}>
          {#if settings.mode === 'dark'}
            <LightModeIcon />
          {:else}
            <DarkModeIcon />
          {/if}
        </Button>
      {/if}
    {/if}
  </div>

  {#if resolved?.settings}
    {@const serialized = serializeEmbedState(resolved.settings)}
    <footer
      data-testid={TID.embedFooter}
      class="flex items-center justify-end gap-2 border-t bg-card px-3 py-1.5 text-xs">
      <div class="flex items-center gap-3">
        <a
          data-testid={TID.embedEditLink}
          href={buildEditUrl(serialized, window.location.origin + resolve('/edit', {}))}
          target="_blank"
          rel="noreferrer noopener"
          class="text-muted-foreground hover:text-foreground">
          编辑
        </a>
      </div>
    </footer>
  {/if}
</div>
