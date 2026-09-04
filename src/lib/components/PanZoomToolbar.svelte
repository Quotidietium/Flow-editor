<script lang="ts">
  import FloatingToolbar from '$/components/FloatingToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import { Separator } from '$/components/ui/separator';
  import type { PanZoomState } from '$/util/panZoom';
  import { previewPause } from '$/util/previewPause.svelte';
  import { PREVIEW_BG_LABELS } from '$/util/previewBackground';
  import { previewBackground } from '$/util/previewBackground.svelte';
  import BgIcon from '~icons/material-symbols/format-color-fill-rounded';
  import ExpandIcon from '~icons/material-symbols/open-in-full-rounded';
  import FitIcon from '~icons/material-symbols/fit-screen-rounded';
  import PauseIcon from '~icons/material-symbols/pause-rounded';
  import PlayIcon from '~icons/material-symbols/play-arrow-rounded';
  import ArrowsToCircleIcon from '~icons/material-symbols/screenshot-frame-2';
  import MagnifyingGlassPlusIcon from '~icons/material-symbols/zoom-in';
  import MagnifyingGlassMinusIcon from '~icons/material-symbols/zoom-out';

  let {
    /** Embed/narrow frames: keep zoom buttons visible below the `sm` breakpoint. */
    compact = false,
    fullScreenHref,
    panZoomState,
    /** 编辑页预览才提供「暂停实时预览」——/view 只读页与 store-free embed 无编辑可暂停。 */
    showPauseToggle = false
  }: {
    compact?: boolean;
    /** When set, shows a "Full Screen" button linking here. Omit for store-free embeds. */
    fullScreenHref?: string;
    panZoomState: PanZoomState;
    showPauseToggle?: boolean;
  } = $props();

  const zoomClass = $derived(compact ? undefined : 'hidden sm:block');

  // 缩放百分比读数：种子值取实例当前缩放，之后经回调随缩放交互更新。
  let zoomLevel = $state(1);
  $effect(() => {
    zoomLevel = panZoomState.currentZoom();
    panZoomState.onZoomLevelChange = (zoom) => {
      zoomLevel = zoom;
    };
    return () => {
      panZoomState.onZoomLevelChange = undefined;
    };
  });
</script>

<FloatingToolbar>
  <Button variant="ghost" size="icon" title="重置视图" onclick={() => panZoomState.reset()}>
    <ArrowsToCircleIcon />
  </Button>
  <!-- 适应窗口：全图缩放到视口内并居中（大图找不到全貌时一键归位） -->
  <Button
    variant="ghost"
    size="icon"
    data-testid="zoom-fit"
    title="适应窗口"
    onclick={() => panZoomState.fitAndCenter()}>
    <FitIcon />
  </Button>
  <Separator orientation="vertical" />
  <Button
    variant="ghost"
    size="icon"
    class={zoomClass}
    title="缩小"
    onclick={() => panZoomState.zoomOut()}>
    <MagnifyingGlassMinusIcon />
  </Button>
  <span
    class="w-11 self-center text-center text-xs text-muted-foreground tabular-nums {zoomClass}"
    data-testid="zoom-level">
    {Math.round(zoomLevel * 100)}%
  </span>
  <Button
    variant="ghost"
    size="icon"
    class={zoomClass}
    title="放大"
    onclick={() => panZoomState.zoomIn()}>
    <MagnifyingGlassPlusIcon />
  </Button>
  <Separator orientation="vertical" />
  <!-- 预览背景四档循环（网格点/棋盘格/纯白/纯黑）：核对透明导出与深色文档嵌图效果 -->
  <Button
    variant="ghost"
    size="icon"
    data-testid="preview-bg-toggle"
    title="预览背景：{PREVIEW_BG_LABELS[previewBackground.current]}（点击切换）"
    aria-label="切换预览背景"
    onclick={() => previewBackground.cycle()}>
    <BgIcon />
  </Button>
  {#if showPauseToggle}
    <!-- 暂停实时预览：大图连改免渲染拖累；会话级开关（不持久化，防被遗忘的
         暂停造成「改了没反应」），暂停期间改动以陈旧指示 + 立即渲染按钮呈现 -->
    <Button
      variant="ghost"
      size="icon"
      data-testid="preview-pause"
      title={previewPause.paused ? '恢复实时预览' : '暂停实时预览（改完点画面角落的「立即渲染」）'}
      aria-label={previewPause.paused ? '恢复实时预览' : '暂停实时预览'}
      aria-pressed={previewPause.paused}
      onclick={() => (previewPause.paused = !previewPause.paused)}>
      {#if previewPause.paused}
        <PlayIcon />
      {:else}
        <PauseIcon />
      {/if}
    </Button>
  {/if}
  {#if fullScreenHref}
    <Separator orientation="vertical" class={zoomClass} />
    <Button variant="ghost" size="icon" title="全屏" href={fullScreenHref} target="_blank">
      <ExpandIcon />
    </Button>
  {/if}
</FloatingToolbar>
