<script lang="ts">
  import FloatingToolbar from '$/components/FloatingToolbar.svelte';
  import { Button } from '$/components/ui/button';
  import { Separator } from '$/components/ui/separator';
  import type { PanZoomState } from '$/util/panZoom';
  import { PREVIEW_BG_LABELS } from '$/util/previewBackground';
  import { previewBackground } from '$/util/previewBackground.svelte';
  import BgIcon from '~icons/material-symbols/format-color-fill-rounded';
  import ExpandIcon from '~icons/material-symbols/open-in-full-rounded';
  import ArrowsToCircleIcon from '~icons/material-symbols/screenshot-frame-2';
  import MagnifyingGlassPlusIcon from '~icons/material-symbols/zoom-in';
  import MagnifyingGlassMinusIcon from '~icons/material-symbols/zoom-out';

  let {
    /** Embed/narrow frames: keep zoom buttons visible below the `sm` breakpoint. */
    compact = false,
    fullScreenHref,
    panZoomState
  }: {
    compact?: boolean;
    /** When set, shows a "Full Screen" button linking here. Omit for store-free embeds. */
    fullScreenHref?: string;
    panZoomState: PanZoomState;
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
  {#if fullScreenHref}
    <Separator orientation="vertical" class={zoomClass} />
    <Button variant="ghost" size="icon" title="全屏" href={fullScreenHref} target="_blank">
      <ExpandIcon />
    </Button>
  {/if}
</FloatingToolbar>
