<script lang="ts">
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import View from '$/components/View.svelte';
  import { Button } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
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
  import LinkIcon from '~icons/material-symbols/link-rounded';
  import MoreIcon from '~icons/material-symbols/more-rounded';

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

  // 观看者再分享：地址栏长串 pako 不用手选。
  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify('已复制链接');
    } catch {
      notify('复制失败');
    }
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
    <!-- 移动端收进「更多」菜单：四个显式按钮在 390px 占 288×208（74% 宽、
         顶部 1/4 高）严重遮图；桌面保留显式按钮（可发现性）。 -->
    <Popover.Root>
      <Popover.Trigger
        class="rounded-md border bg-background/80 p-2 sm:hidden"
        data-testid="view-actions-menu"
        title="更多操作"
        aria-label="更多操作">
        <MoreIcon class="size-4" />
      </Popover.Trigger>
      <Popover.Content align="end" class="flex w-40 flex-col gap-0.5 p-1">
        <Popover.Close
          class="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          onclick={() => window.open(editHref, '_blank')}>
          在编辑器中打开
        </Popover.Close>
        <Popover.Close
          class="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          onclick={onDownloadSvg}>
          下载 SVG
        </Popover.Close>
        <Popover.Close
          class="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          onclick={() => void onDownloadPng()}>
          下载 PNG
        </Popover.Close>
        <Popover.Close
          class="rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
          onclick={() => void onCopyLink()}>
          复制链接
        </Popover.Close>
      </Popover.Content>
    </Popover.Root>
    <Button
      size="sm"
      variant="outline"
      class="hidden bg-background/80 sm:inline-flex"
      href={editHref}
      data-testid="view-edit-link"
      title="在编辑器中打开当前图表">
      <EditIcon />
      在编辑器中打开
    </Button>
    <Button
      size="sm"
      variant="outline"
      class="hidden bg-background/80 sm:inline-flex"
      data-testid="view-download-svg"
      title="下载干净 SVG（不含当前平移/缩放）"
      onclick={onDownloadSvg}>
      <DownloadIcon />
      下载 SVG
    </Button>
    <Button
      size="sm"
      variant="outline"
      class="hidden bg-background/80 sm:inline-flex"
      data-testid="view-download-png"
      disabled={pngExporting}
      title="下载 PNG 位图（干净图形，长边 1080）"
      onclick={() => void onDownloadPng()}>
      <ImageIcon />
      {pngExporting ? '导出中…' : '下载 PNG'}
    </Button>
    <Button
      size="sm"
      variant="outline"
      class="hidden bg-background/80 sm:inline-flex"
      data-testid="view-copy-link"
      title="复制当前图表的分享链接"
      onclick={() => void onCopyLink()}>
      <LinkIcon />
      复制链接
    </Button>
    <PanZoomToolbar {panZoomState} compact />
  </div>
</div>
