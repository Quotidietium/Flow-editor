<script lang="ts">
  import type { State, ValidatedState } from '$/types';
  import { recordRenderTime, shouldRefreshView } from '$/util/autoSync';
  import { PanZoomState } from '$/util/panZoom';
  import { previewPause } from '$/util/previewPause.svelte';
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
  // 空态（循环 131）：从未渲染过任何有效图（code 仍为初始 ''）。单独
  // 用响应式标志而非直接读 code——code 是刻意的非响应式渲染对照值
  // （handleStateChange 微任务里读写），模板读它每次都要 svelte-check 警告。
  let empty = $state(true);
  // 暂停期间有过未渲染的改动（陈旧指示的显示条件）；恢复渲染即清除。
  let stale = $state(false);
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

        // 实时预览暂停（会话级开关）：持有画面、跳过渲染——大图连改免拖累。
        // code/config 等仍记着「最后渲染值」，暂停解除后据此照常增量渲染。
        if (previewPause.paused) {
          stale = true;
          return;
        }

        if (!shouldRefreshView()) {
          return;
        }

        stale = false;
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
        // 渲染成功才解除空态——放在 try 内置 false 会在「空代码抛错→
        // error=true」路径上把标志错误清除（探针实证）
        empty = false;
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
    // 暂停开关不经过状态网关，在此读取依赖：开关翻转（尤其「恢复」）会
    // 重跑本 effect，对最新状态补一次 handleStateChange（暂停中的发布
    // 已各自走空，无副作用）。
    void previewPause.paused;
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
  <!-- 双击复位缩放（循环 151）：draw.io 式捷径，与工具栏「重置视图」/
       键盘 0 同一语义（0.875 基准）。预览 svg 无其他双击占用（可视化
       画布的双击加节点在另一组件）。纯冗余鼠标捷径（按钮/键盘均可达），
       故不为它设交互 role。 -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    id="container"
    bind:this={container}
    class="h-full overflow-auto"
    ondblclick={() => panZoomState.reset()}>
  </div>
  {#if rendering}
    <div
      class="pointer-events-none absolute right-2 bottom-2 rounded bg-background/80 px-2 py-1 text-[11px] text-muted-foreground shadow"
      data-testid="view-rendering">
      渲染中…
    </div>
  {/if}
  {#if !rendering && stale}
    <!-- 暂停期间的陈旧指示：画面 ≠ 当前代码。给「立即渲染」直达钮，
         用户不必回忆工具栏里还有个暂停开关。bottom-14 让开右下角的
         版本/主题工具栏（h-12），否则它拦截指示牌的点击 -->
    <div
      class="absolute right-2 bottom-14 flex items-center gap-1.5 rounded bg-background/90 px-2 py-1 text-[11px] shadow"
      data-testid="preview-paused">
      <span class="text-muted-foreground">实时预览已暂停，画面为改动前的版本</span>
      <button
        type="button"
        class="rounded border px-1.5 py-0.5 hover:bg-accent"
        data-testid="preview-resume"
        onclick={() => (previewPause.paused = false)}>
        立即渲染
      </button>
    </div>
  {/if}
  {#if error && empty}
    <!-- 空态引导（循环 131）：画面上真的什么都没有时（从未渲染过有效
         图，如清空代码后刷新）给出起点提示。清空但不刷新时旧图仍半透明
         挂着（error 态、code 记着旧值），此时不提示，避免与上次内容混淆 -->
    <div
      class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 text-center text-muted-foreground"
      data-testid="view-empty">
      <span class="text-sm">在左侧输入 Mermaid 代码，图表会实时渲染在这里</span>
      <span class="text-xs">可从「示例图表」挑一张开始，或按 Ctrl+O 打开本地文件</span>
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
