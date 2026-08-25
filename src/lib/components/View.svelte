<script lang="ts">
  import type { State, ValidatedState } from '$/types';
  import { recordRenderTime, shouldRefreshView } from '$/util/autoSync';
  import { PanZoomState } from '$/util/panZoom';
  import { previewBgClass } from '$/util/previewBackground';
  import { previewBackground } from '$/util/previewBackground.svelte';
  import { renderAndPlaceDiagram } from '$/util/renderView';
  import { updateCodeStore, validatedState } from '$/util/state.svelte';
  import uniqueID from 'lodash-es/uniqueId';
  import type { MermaidConfig } from 'mermaid';
  import { mode } from 'mode-watcher';
  import { onMount } from 'svelte';

  let {
    panZoomState = new PanZoomState(),
    shouldShowGrid = true
  }: { panZoomState?: PanZoomState; shouldShowGrid?: boolean } = $props();
  let code = '';
  let config = '';
  let container: HTMLDivElement | undefined = $state();
  let rendering = $state(false);
  let rough: boolean;
  let view: HTMLDivElement | undefined = $state();
  let error = $state(false);
  let panZoom = true;
  let manualUpdate = true;

  // Set up panZoom state observer to update the store when pan/zoom changes
  const setupPanZoomObserver = () => {
    panZoomState.onPanZoomChange = (pan, zoom) => {
      updateCodeStore({ pan, zoom });
    };
  };

  const handlePanZoom = (state: State, graphDiv: SVGSVGElement) => {
    try {
      panZoomState.updateElement(graphDiv, state);
    } catch (error) {
      console.error('PanZoom error:', error);
    }
  };

  const handleStateChange = async (state: ValidatedState) => {
    const startTime = Date.now();
    if (state.error !== undefined) {
      error = true;
      return;
    }
    error = false;
    try {
      if (container) {
        manualUpdate = true;
        // Do not render if there is no change in Code/Config/PanZoom
        if (
          code === state.code &&
          config === state.mermaid &&
          rough === state.rough &&
          panZoom === state.panZoom
        ) {
          return;
        }

        if (!shouldRefreshView()) {
          return;
        }

        code = state.code;
        config = state.mermaid;
        rough = state.rough;
        panZoom = state.panZoom ?? true;

        const scroll = view?.parentElement?.scrollTop;
        // 大图渲染可达数百毫秒：给用户一个「正在工作」的可见信号，
        // 而不是旧图静静挂着让人以为没生效（finally 保证任何路径都熄灭）。
        rendering = true;
        let graphDiv: SVGSVGElement | undefined;
        try {
          ({ graphDiv } = await renderAndPlaceDiagram({
            code,
            config: JSON.parse(state.mermaid) as MermaidConfig,
            container,
            rough: state.rough,
            viewId: uniqueID('graph-')
          }));
        } finally {
          rendering = false;
        }
        if (disposed) {
          return;
        }
        if (graphDiv && state.panZoom) {
          handlePanZoom(state, graphDiv);
        }
        if (view?.parentElement && scroll) {
          view.parentElement.scrollTop = scroll;
        }
        error = false;
      } else if (manualUpdate) {
        manualUpdate = false;
      }
    } catch (error_) {
      console.error('view fail', error_);
      error = true;
    }
    const renderTime = Date.now() - startTime;
    recordRenderTime(renderTime, () => {
      updateCodeStore({ updateDiagram: true });
    });
  };

  // Set while the awaited render below is still in flight and the component
  // unmounts: calling updateElement then would resurrect a pan-zoom instance
  // (window listeners + ResizeObserver) on an already-detached SVG — the
  // leak destroy() just cleaned up.
  let disposed = false;

  onMount(() => {
    setupPanZoomObserver();
    // Release the pan-zoom wrapper (svg-pan-zoom window listeners and the
    // ResizeObserver) when the View unmounts — e.g. every Visual↔preview
    // toggle. Pan/zoom values survive inside the wrapper for the next mount.
    return () => {
      disposed = true;
      panZoomState.destroy();
    };
  });

  // Queue state changes to avoid race condition
  let pendingStateChange = Promise.resolve();
  $effect(() => {
    const state = validatedState.current;
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    pendingStateChange = pendingStateChange.then(() => handleStateChange(state).catch(() => {}));
  });
</script>

<div
  id="view"
  bind:this={view}
  class={[
    'relative h-full w-full',
    // shouldShowGrid=false（如 /view 全屏页）保持素净默认：grid 档不上点阵；
    // 但用户显式切到棋盘格/纯白/纯黑时处处生效——否则该页工具栏的切换钮形同虚设。
    (shouldShowGrid || previewBackground.current !== 'grid') &&
      previewBgClass(previewBackground.current, mode.current),
    error && 'opacity-50'
  ]}>
  <div id="container" bind:this={container} class="h-full overflow-auto"></div>
  {#if rendering}
    <div
      class="pointer-events-none absolute right-2 bottom-2 rounded bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow"
      data-testid="view-rendering">
      渲染中…
    </div>
  {/if}
</div>

<style>
  .grid-bg-light {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #e4e4e48c 2px, #0000 2px);
  }

  .grid-bg-dark {
    background-size: 30px 30px;
    background-image: radial-gradient(circle, #46464646 2px, #0000 2px);
  }

  /* 棋盘格：设计工具通用的透明底示意，便于核对透明 PNG/SVG 导出 */
  .preview-bg-checker {
    background-color: #ffffff;
    background-image:
      linear-gradient(45deg, #d4d4d4 25%, #0000 25%, #0000 75%, #d4d4d4 75%),
      linear-gradient(45deg, #d4d4d4 25%, #0000 25%, #0000 75%, #d4d4d4 75%);
    background-position:
      0 0,
      12px 12px;
    background-size: 24px 24px;
  }

  .preview-bg-white {
    background: #ffffff;
  }

  .preview-bg-black {
    background: #171717;
  }
</style>
