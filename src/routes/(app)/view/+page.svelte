<script lang="ts">
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import View from '$/components/View.svelte';
  import { Button } from '$/components/ui/button';
  import { diagramFileName, downloadTextFile, svgMarkupOf } from '$/util/fileIO';
  import { notify } from '$/util/notify';
  import { PanZoomState } from '$/util/panZoom';
  import { initHandler } from '$/util/util';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import DownloadIcon from '~icons/material-symbols/download-rounded';
  import EditIcon from '~icons/material-symbols/edit-note-rounded';

  const panZoomState = new PanZoomState();

  // 回编辑器的链接：hash 只有客户端可见，挂载后拼上当前图的序列化态。
  let editHref = $state(resolve('/edit', {}));
  onMount(() => {
    editHref = `${resolve('/edit', {})}${window.location.hash}`;
    initHandler();
  });

  // 分享链接的接收者只有缩放工具——不下中转编辑器即可拿走一张干净 SVG
  // （剥掉 pan-zoom 的平移/缩放包装，呈现完整图形而非屏幕视角）。
  const onDownloadSvg = () => {
    const markup = svgMarkupOf(document);
    if (markup === undefined) {
      notify('当前没有可导出的图形');
      return;
    }
    downloadTextFile(diagramFileName('svg'), markup, 'image/svg+xml');
    notify('已下载 SVG');
  };
</script>

<svelte:head>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="relative h-full">
  <View shouldShowGrid={false} {panZoomState} />
  <div class="absolute top-2 right-2 flex flex-col items-end gap-2">
    <Button
      size="sm"
      variant="outline"
      class="bg-background/80"
      href={editHref}
      data-testid="view-edit-link"
      title="在编辑器中打开当前图表">
      <EditIcon />
      在编辑器中打开
    </Button>
    <Button
      size="sm"
      variant="outline"
      class="bg-background/80"
      data-testid="view-download-svg"
      title="下载干净 SVG（不含当前平移/缩放）"
      onclick={onDownloadSvg}>
      <DownloadIcon />
      下载 SVG
    </Button>
    <PanZoomToolbar {panZoomState} compact />
  </div>
</div>
