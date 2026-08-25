<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { cn } from '$lib/utils';
  import InsertIcon from '~icons/material-symbols/post-add-rounded';

  const { onInsert } = $props<{ onInsert: (text: string) => void }>();

  // 代码模式的常用骨架：插入到当前选区/光标处（选中则替换），不触碰
  // 文档其它内容——与「示例图表」整图替换互补。
  const SNIPPETS: { hint: string; id: string; label: string; text: string }[] = [
    { hint: '矩形节点 A[标签]', id: 'node', label: '节点', text: 'A[标签]' },
    { hint: '箭头 -->', id: 'edge', label: '连线', text: ' --> ' },
    { hint: '箭头加文字 -->|标签|', id: 'edge-label', label: '带标签连线', text: ' -->|标签| ' },
    { hint: '%% 注释', id: 'comment', label: '注释行', text: '%% 注释\n' },
    {
      hint: 'subgraph … end 分组骨架',
      id: 'subgraph',
      label: '子图骨架',
      text: 'subgraph 分组\n  A --> B\nend\n'
    },
    {
      hint: '时序图 participant 声明',
      id: 'participant',
      label: '时序参与者',
      text: 'participant A as 参与者\n'
    },
    { hint: '时序图 Note over 说明', id: 'note', label: '时序注释', text: 'Note over A: 说明\n' }
  ];
</script>

<Popover.Root>
  <Popover.Trigger
    data-testid="insert-snippet-menu"
    title="插入代码片段（光标处插入，不替换全文）"
    aria-label="插入代码片段"
    class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1 px-2')}>
    <InsertIcon />
    <span class="hidden sm:inline">插入</span>
  </Popover.Trigger>
  <Popover.Content align="end" class="flex w-56 flex-col gap-0.5 p-1">
    {#each SNIPPETS as snippet (snippet.id)}
      <Popover.Close
        data-testid="insert-snippet-{snippet.id}"
        class="flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent"
        onclick={() => onInsert(snippet.text)}>
        <span class="text-sm">{snippet.label}</span>
        <span class="text-xs text-muted-foreground">{snippet.hint}</span>
      </Popover.Close>
    {/each}
  </Popover.Content>
</Popover.Root>
