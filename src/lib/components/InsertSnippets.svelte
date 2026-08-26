<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { Separator } from '$/components/ui/separator';
  import { notify } from '$/util/notify';
  import { inputState } from '$/util/state.svelte';
  import {
    deleteUserSnippet,
    loadUserSnippets,
    saveUserSnippet,
    type UserSnippet
  } from '$/util/userSnippets';
  import { cn } from '$lib/utils';
  import DeleteIcon from '~icons/material-symbols/delete-outline-rounded';
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
    { hint: '时序图 Note over 说明', id: 'note', label: '时序注释', text: 'Note over A: 说明\n' },
    {
      hint: 'loop 循环块 … end',
      id: 'loop',
      label: '时序循环',
      text: 'loop 循环描述\n  A->>B: 消息\nend\n'
    },
    {
      hint: 'alt/else 分支块 … end',
      id: 'alt',
      label: '时序分支',
      text: 'alt 条件A\n  A->>B: 情况一\nelse 条件B\n  A->>B: 情况二\nend\n'
    },
    {
      hint: 'activate/deactivate 生命线激活',
      id: 'activate',
      label: '时序激活',
      text: 'activate A\nA->>B: 调用\ndeactivate A\n'
    },
    {
      hint: 'gantt section + 任务行',
      id: 'gantt',
      label: '甘特骨架',
      text: 'gantt\n  title 标题\n  section 阶段\n  任务: 2024-01-01, 3d\n'
    },
    {
      hint: 'stateDiagram-v2 起点转移',
      id: 'state',
      label: '状态转移',
      text: '[*] --> 状态\n'
    },
    {
      hint: 'classDiagram 继承关系',
      id: 'class',
      label: '类继承',
      text: 'A <|-- B\n'
    }
  ];

  /* ---------------- 我的片段（用户自定义，localStorage 持久化） ---------------- */

  let userSnippets = $state<UserSnippet[]>(loadUserSnippets());
  let saveOpen = $state(false);
  let saveName = $state('');

  const startSave = () => {
    saveName = '';
    saveOpen = true;
  };

  // 保存的是当前代码全文的快照：常用骨架/整图模板随取随用，
  // 插入时与内置片段同走光标处插入路径（选区替换、不触碰其它内容）。
  const confirmSave = () => {
    const label = saveName.trim();
    if (!label) {
      notify('请输入片段名称');
      return;
    }
    const code = inputState.code;
    if (code.trim().length === 0) {
      notify('当前代码为空，未保存');
      return;
    }
    userSnippets = saveUserSnippet(label, code);
    saveOpen = false;
    notify(`已保存片段「${label}」`);
  };

  const removeUserSnippet = (snippet: UserSnippet) => {
    userSnippets = deleteUserSnippet(snippet.id);
    notify(`已删除片段「${snippet.label}」`);
  };

  // 菜单预览行：首行压缩空白后截断，让用户认得出是哪段代码。
  const previewOf = (code: string): string => {
    const firstLine = code.trim().split('\n', 1)[0].replaceAll(/\s+/g, ' ');
    return firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
  };
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
  <Popover.Content align="end" class="flex max-h-[70vh] w-56 flex-col gap-0.5 overflow-y-auto p-1">
    <div class="px-2 pt-1 text-xs text-muted-foreground">我的片段</div>
    {#each userSnippets as snippet (snippet.id)}
      <div class="group flex items-center">
        <Popover.Close
          data-testid="user-snippet-{snippet.id}"
          class="flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent"
          title={snippet.code}
          onclick={() => onInsert(snippet.code)}>
          <span class="text-sm">{snippet.label}</span>
          <span class="truncate font-mono text-xs text-muted-foreground">
            {previewOf(snippet.code)}
          </span>
        </Popover.Close>
        <button
          class="rounded p-1 opacity-40 hover:bg-accent hover:opacity-100"
          title="删除片段「{snippet.label}」"
          aria-label="删除片段{snippet.label}"
          data-testid="user-snippet-delete-{snippet.id}"
          onclick={(event) => {
            event.stopPropagation();
            removeUserSnippet(snippet);
          }}>
          <DeleteIcon class="size-3.5" />
        </button>
      </div>
    {/each}
    {#if saveOpen}
      <div class="flex items-center gap-1 px-1 py-0.5">
        <input
          class="h-7 w-full rounded border bg-background px-1.5 text-sm"
          placeholder="片段名称…"
          aria-label="片段名称"
          data-testid="user-snippet-save-name"
          bind:value={saveName}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              confirmSave();
            } else if (event.key === 'Escape') {
              saveOpen = false;
            }
          }} />
        <button
          class="h-7 shrink-0 rounded border px-2 text-xs hover:bg-accent"
          data-testid="user-snippet-save-confirm"
          onclick={confirmSave}>
          保存
        </button>
      </div>
    {:else}
      <button
        class="flex w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        data-testid="user-snippet-save"
        onclick={startSave}>
        ＋ 保存当前代码为片段
      </button>
    {/if}
    <Separator class="my-1" />
    <div class="px-2 pt-1 text-xs text-muted-foreground">内置骨架</div>
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
