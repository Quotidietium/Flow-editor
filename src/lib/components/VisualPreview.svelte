<script lang="ts">
  /**
   * Live Mermaid rendering of the visual editor's generated code — restores
   * the Mermaid display inside the editing interface, next to the interactive
   * canvas. Shares the production render pipeline (`renderAndPlaceDiagram`),
   * so themes, hand-drawn mode and every diagram kind render exactly like the
   * preview pane.
   */
  import type { MermaidConfig } from 'mermaid';
  import uniqueID from 'lodash-es/uniqueId';
  import { TID } from '$/constants';
  import { renderAndPlaceDiagram } from '$/util/renderView';

  let {
    code,
    config,
    rough = false,
    visible = true
  }: {
    code: string;
    /** Mermaid config JSON (same string the preview pane parses). */
    config: string;
    rough?: boolean;
    visible?: boolean;
  } = $props();

  let container: HTMLDivElement | undefined = $state();
  let error = $state(false);

  // Renders are serialized through a promise chain (overlapping mermaid
  // renders on the same instance corrupt each other) and debounced: the
  // `code` prop recomputes on every snapped pointermove during a drag, and
  // only the settled state is worth a render.
  let pending = Promise.resolve();
  let lastRendered = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const safeConfig = (raw: string): MermaidConfig => {
    try {
      return JSON.parse(raw) as MermaidConfig;
    } catch {
      return {};
    }
  };

  $effect(() => {
    const currentCode = code;
    const currentConfig = config;
    const currentRough = rough;
    if (!visible || currentCode === '') {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      pending = pending
        .then(async () => {
          if (!container || currentCode === lastRendered) {
            return;
          }
          lastRendered = currentCode;
          error = false;
          try {
            await renderAndPlaceDiagram({
              code: currentCode,
              config: safeConfig(currentConfig),
              container,
              rough: currentRough,
              viewId: uniqueID('visual-graph-')
            });
          } catch {
            // Mid-edit states may be invalid Mermaid — keep the last good
            // render and tint the pane until the code becomes valid again.
            error = true;
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        .catch(() => {});
    }, 250);
    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    };
  });
</script>

<div class="flex h-full min-h-64 flex-col" data-testid={TID.visualPreview}>
  <div class="flex-none border-b px-2 py-1 text-xs text-muted-foreground">
    Mermaid 实时渲染{#if error}<span class="ml-1 text-destructive"
        >（当前代码无法渲染，保留上次结果）</span
      >{/if}
  </div>
  <div
    id="visual-preview-container"
    bind:this={container}
    class="flex-1 overflow-auto p-2 transition-opacity"
    style="background-image: radial-gradient(circle, var(--border) 1px, transparent 1px); background-size: 20px 20px; opacity: {error
      ? 0.5
      : 1};">
  </div>
</div>
