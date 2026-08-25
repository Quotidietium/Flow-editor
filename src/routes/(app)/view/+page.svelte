<script lang="ts">
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import View from '$/components/View.svelte';
  import { Button } from '$/components/ui/button';
  import {
    diagramFileName,
    downloadDataUrl,
    downloadTextFile,
    IMAGE_SIZE_DEFAULT,
    svgMarkupOf
  } from '$/util/fileIO';
  import { notify } from '$/util/notify';
  import { PanZoomState } from '$/util/panZoom';
  import { rasterizeSvgMarkup } from '$/util/rasterize';
  import { initHandler } from '$/util/util';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import DownloadIcon from '~icons/material-symbols/download-rounded';
  import EditIcon from '~icons/material-symbols/edit-note-rounded';
  import ImageIcon from '~icons/material-symbols/image-outline-rounded';

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

  // PNG 走同一份干净 SVG 光栅化：长边 1080 等比，底色随 --background。
  // Word/聊天工具不吃 SVG 的场合免回编辑器。
  let pngExporting = $state(false);
  const onDownloadPng = async () => {
    if (pngExporting) {
      return;
    }
    const markup = svgMarkupOf(document);
    if (markup === undefined) {
      notify('当前没有可导出的图形');
      return;
    }
    pngExporting = true;
    try {
      const { dataUrl } = await rasterizeSvgMarkup(markup, IMAGE_SIZE_DEFAULT);
      downloadDataUrl(diagramFileName('png'), dataUrl);
      notify('已下载 PNG');
    } catch {
      notify('导出 PNG 失败');
    } finally {
      pngExporting = false;
    }
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
    <Button
      size="sm"
      variant="outline"
      class="bg-background/80"
      data-testid="view-download-png"
      disabled={pngExporting}
      title="下载 PNG 位图（干净图形，长边 1080）"
      onclick={() => void onDownloadPng()}>
      <ImageIcon />
      {pngExporting ? '导出中…' : '下载 PNG'}
    </Button>
    <PanZoomToolbar {panZoomState} compact />
  </div>
</div>
