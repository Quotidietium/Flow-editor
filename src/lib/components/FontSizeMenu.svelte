<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { cn } from '$lib/utils';
  import FontIcon from '~icons/material-symbols/format-size-rounded';

  let { size = $bindable(14) } = $props<{ size?: number }>();

  const SIZES = [12, 14, 16, 18, 20];
</script>

<Popover.Root>
  <Popover.Trigger
    data-testid="editor-font-size-menu"
    title="编辑器字号"
    aria-label="编辑器字号"
    class={cn(
      buttonVariants({ variant: 'ghost', size: 'sm' }),
      // 移动端头部空间不足（390px 实测溢出 ~60px）：字号调节留给桌面端
      'hidden gap-1 px-2 tabular-nums sm:inline-flex'
    )}>
    <FontIcon />
    {size}
  </Popover.Trigger>
  <Popover.Content align="end" class="flex w-28 flex-col gap-0.5 p-1">
    {#each SIZES as option (option)}
      <Popover.Close
        data-testid="editor-font-size-{option}"
        class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-accent"
        onclick={() => (size = option)}>
        <span>{option}px</span>
        {#if size === option}<span>✓</span>{/if}
      </Popover.Close>
    {/each}
  </Popover.Content>
</Popover.Root>
