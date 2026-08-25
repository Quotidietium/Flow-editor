<script lang="ts">
  import PanZoomToolbar from '$/components/PanZoomToolbar.svelte';
  import View from '$/components/View.svelte';
  import { Button } from '$/components/ui/button';
  import { PanZoomState } from '$/util/panZoom';
  import { initHandler } from '$/util/util';
  import { resolve } from '$app/paths';
  import { onMount } from 'svelte';
  import EditIcon from '~icons/material-symbols/edit-note-rounded';

  const panZoomState = new PanZoomState();

  // 回编辑器的链接：hash 只有客户端可见，挂载后拼上当前图的序列化态。
  let editHref = $state(resolve('/edit', {}));
  onMount(() => {
    editHref = `${resolve('/edit', {})}${window.location.hash}`;
    initHandler();
  });
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
    <PanZoomToolbar {panZoomState} compact />
  </div>
</div>
