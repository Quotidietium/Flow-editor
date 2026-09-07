<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import { onMount } from 'svelte';
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
  // 文档其它内容——与「示例图表」整图替换互补。按图族分组渲染。
  const SNIPPETS: {
    group: string;
    hint: string;
    id: string;
    label: string;
    text: string;
  }[] = [
    { group: '流程图', hint: '矩形节点 A[标签]', id: 'node', label: '节点', text: 'A[标签]' },
    { group: '流程图', hint: '箭头 -->', id: 'edge', label: '连线', text: ' --> ' },
    {
      group: '流程图',
      hint: '箭头加文字 -->|标签|',
      id: 'edge-label',
      label: '带标签连线',
      text: ' -->|标签| '
    },
    { group: '流程图', hint: '%% 注释', id: 'comment', label: '注释行', text: '%% 注释\n' },
    {
      group: '流程图',
      hint: 'subgraph … end 分组骨架',
      id: 'subgraph',
      label: '子图骨架',
      text: 'subgraph 分组\n  A --> B\nend\n'
    },
    {
      group: '时序图',
      hint: '时序图 participant 声明',
      id: 'participant',
      label: '时序参与者',
      text: 'participant A as 参与者\n'
    },
    {
      group: '时序图',
      hint: '时序图 Note over 说明',
      id: 'note',
      label: '时序注释',
      text: 'Note over A: 说明\n'
    },
    {
      group: '时序图',
      hint: 'loop 循环块 … end',
      id: 'loop',
      label: '时序循环',
      text: 'loop 循环描述\n  A->>B: 消息\nend\n'
    },
    {
      group: '时序图',
      hint: 'alt/else 分支块 … end',
      id: 'alt',
      label: '时序分支',
      text: 'alt 条件A\n  A->>B: 情况一\nelse 条件B\n  A->>B: 情况二\nend\n'
    },
    {
      group: '时序图',
      hint: 'activate/deactivate 生命线激活',
      id: 'activate',
      label: '时序激活',
      text: 'activate A\nA->>B: 调用\ndeactivate A\n'
    },
    {
      group: '甘特图',
      hint: 'gantt section + 任务行',
      id: 'gantt',
      label: '甘特骨架',
      text: 'gantt\n  title 标题\n  section 阶段\n  任务: 2024-01-01, 3d\n'
    },
    {
      group: '状态图',
      hint: 'stateDiagram-v2 起点转移',
      id: 'state',
      label: '状态转移',
      text: '[*] --> 状态\n'
    },
    {
      group: '类图',
      hint: 'classDiagram 继承关系',
      id: 'class',
      label: '类继承',
      text: 'A <|-- B\n'
    }
  ];

  // 分组渲染（保持声明序）：组内连续渲染，组间插小标题
  const SNIPPET_GROUPS: { items: typeof SNIPPETS; label: string }[] = [];
  for (const snippet of SNIPPETS) {
    const last = SNIPPET_GROUPS.at(-1);
    if (last && last.label === snippet.group) {
      last.items.push(snippet);
    } else {
      SNIPPET_GROUPS.push({ items: [snippet], label: snippet.group });
    }
  }

  /* ---------------- 我的片段（用户自定义，localStorage 持久化） ---------------- */

  let userSnippets = $state<UserSnippet[]>(loadUserSnippets());

  // 资产导入联动：导入直接写 storage，重读本列表（不刷新页面）
  onMount(() => {
    const refresh = () => (userSnippets = loadUserSnippets());
    window.addEventListener('flow-assets-changed', refresh);
    return () => window.removeEventListener('flow-assets-changed', refresh);
  });
  let saveOpen = $state(false);
  let saveName = $state('');

  const startSave = () => {
    saveName = '';
    saveOpen = true;
  };

  // 保存的是当前代码全文的快照：常用骨架/整图模板随取随用，
  // 插入时与内置片段同走光标处插入路径（选区替换、不触碰其它内容）。
  // 保存成功即收菜单：存完多半要回编辑器继续写（悬浮层不收会压住编辑器）。
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
    open = false;
    notify(`已保存片段「${label}」`);
  };

  const removeUserSnippet = (snippet: UserSnippet) => {
    userSnippets = deleteUserSnippet(snippet.id);
    notify(`已删除片段「${snippet.label}」`);
  };

  // 双击重命名（我的示例/历史条目同款）：按新名建条（同名覆盖）+删旧条，
  // 代码原样保留。
  const renameUserSnippet = (snippet: UserSnippet) => {
    const next = prompt('重命名片段', snippet.label)?.trim();
    if (!next || next === snippet.label) {
      return;
    }
    userSnippets = deleteUserSnippet(snippet.id);
    userSnippets = saveUserSnippet(next, snippet.code);
    notify(`已重命名为「${next}」`);
  };

  // 菜单预览行：首行压缩空白后截断，让用户认得出是哪段代码。
  const previewOf = (code: string): string => {
    const firstLine = code.trim().split('\n', 1)[0].replaceAll(/\s+/g, ' ');
    return firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
  };

  /* ---------------- 搜索过滤（示例对话框同款，循环 165） ---------------- */

  let open = $state(false);
  let query = $state('');
  let searchEl: HTMLInputElement | undefined = $state();
  const queryLower = $derived(query.trim().toLowerCase());
  // 匹配我的片段的名称/首行预览、内置骨架的标签/提示/组名。
  const filteredUser = $derived(
    queryLower === ''
      ? userSnippets
      : userSnippets.filter(
          (snippet) =>
            snippet.label.toLowerCase().includes(queryLower) ||
            previewOf(snippet.code).toLowerCase().includes(queryLower)
        )
  );
  const filteredGroups = $derived(
    queryLower === ''
      ? SNIPPET_GROUPS
      : SNIPPET_GROUPS.map((group) => ({
          items: group.items.filter(
            (snippet) =>
              snippet.label.toLowerCase().includes(queryLower) ||
              snippet.hint.toLowerCase().includes(queryLower) ||
              group.label.toLowerCase().includes(queryLower)
          ),
          label: group.label
        })).filter((group) => group.items.length > 0)
  );

  /* ---------------- ↑/↓ 导航高亮（循环 166） ---------------- */
  // 焦点留在搜索框（还要继续打字），导航走虚拟高亮（combobox 惯例）：
  // 键入关键词时高亮钉在首个匹配；↑/↓ 循环移动；Enter 插入高亮项；
  // 鼠标悬停同步高亮，指针/键盘两套输入不打架。-1 = 无高亮（空词初始态）。
  // start = 组首项在拍平展示序中的下标（我的片段占前段），供模板定位。
  const groupedRows = $derived.by(() => {
    let start = filteredUser.length;
    return filteredGroups.map((group) => {
      const row = { ...group, start };
      start += group.items.length;
      return row;
    });
  });
  const flatItems = $derived<(UserSnippet | (typeof SNIPPETS)[number])[]>([
    ...filteredUser,
    ...filteredGroups.flatMap((group) => group.items)
  ]);
  // manualIndex = 方向键/悬停的手动选择；未手动时派生默认位
  // （有词钉首匹配、空词无高亮）；越界（条目增删/词变收窄）自动回落默认。
  let manualIndex = $state<number>();
  const activeIndex = $derived(
    manualIndex !== undefined && manualIndex < flatItems.length
      ? manualIndex
      : queryLower !== '' && flatItems.length > 0
        ? 0
        : -1
  );
  const activeItem = $derived(activeIndex >= 0 ? flatItems[activeIndex] : undefined);

  let contentEl: HTMLDivElement | null = $state(null);

  const moveActive = (delta: 1 | -1) => {
    const count = flatItems.length;
    if (count === 0) {
      return;
    }
    const base = activeIndex === -1 ? (delta === 1 ? -1 : 0) : activeIndex;
    manualIndex = (base + delta + count) % count;
    // 键盘导航让高亮项滚入可视区（按 id 直取，不等渲染）。悬停路径不做：
    // 鼠标下的行本就可见，滚动反而在超长菜单里酿成「滚动-悬停」互追。
    contentEl?.querySelector(`#snippet-opt-${manualIndex}`)?.scrollIntoView({ block: 'nearest' });
  };
  // Enter 插入高亮项；尚未动过方向键时等价首个匹配（键入即达不变）。
  const insertActive = () => {
    if (!activeItem) {
      return;
    }
    onInsert('text' in activeItem ? activeItem.text : activeItem.code);
    open = false;
  };
  // 重开归零：上次的关键词与手动高亮不残留（菜单级过滤的通行做法）。
  $effect(() => {
    if (!open) {
      query = '';
      manualIndex = undefined;
    }
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger
    data-testid="insert-snippet-menu"
    title="插入代码片段（光标处插入，不替换全文）"
    aria-label="插入代码片段"
    class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'gap-1 px-2')}>
    <InsertIcon />
    <span class="hidden sm:inline">插入</span>
  </Popover.Trigger>
  <Popover.Content
    bind:ref={contentEl}
    align="end"
    class="flex max-h-[70vh] w-56 flex-col gap-0.5 overflow-y-auto p-1"
    onOpenAutoFocus={(event) => {
      event.preventDefault();
      // 移动端不抢焦点：聚焦输入框会弹起虚拟键盘把菜单顶出屏
      // （宽度口径与编辑页 isMobile 一致）；桌面保持打开即键入。
      if (window.innerWidth >= 768) {
        searchEl?.focus();
      }
    }}>
    <!-- 打开即聚焦搜索框（抢 bits-ui 默认焦点），直接键入即过滤 -->
    <input
      bind:this={searchEl}
      class="mx-1 mb-1 h-7 rounded border bg-background px-1.5 text-sm"
      placeholder="搜索片段…（↑/↓ 选择，Enter 插入）"
      aria-label="搜索片段"
      aria-activedescendant={activeIndex >= 0 ? `snippet-opt-${activeIndex}` : undefined}
      data-testid="snippet-search"
      bind:value={query}
      onkeydown={(event) => {
        if (event.isComposing || event.keyCode === 229) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          insertActive();
        } else if (event.key === 'ArrowDown') {
          // 焦点不出搜索框：方向键只挪虚拟高亮，光标不跑
          event.preventDefault();
          moveActive(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveActive(-1);
        } else if (event.key === 'Escape' && query !== '') {
          // 有词先清词（不把 Esc 放给 Popover 直接关菜单）；空词放行照常关闭
          event.stopPropagation();
          query = '';
        }
      }} />
    {#if queryLower !== '' && filteredUser.length === 0 && filteredGroups.length === 0}
      <div class="px-2 py-1 text-xs text-muted-foreground" data-testid="snippet-search-empty">
        无匹配片段（Esc 清除）
      </div>
    {/if}
    {#if filteredUser.length > 0}
      <div class="px-2 pt-1 text-xs text-muted-foreground">我的片段</div>
    {/if}
    {#each filteredUser as snippet, i (snippet.id)}
      <div class="group flex items-center">
        <Popover.Close
          id="snippet-opt-{i}"
          data-testid="user-snippet-{snippet.id}"
          data-active={i === activeIndex}
          class={cn(
            'flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent',
            i === activeIndex && 'bg-accent'
          )}
          title="{snippet.code}（双击重命名）"
          onmouseenter={() => (manualIndex = i)}
          onclick={() => onInsert(snippet.code)}
          ondblclick={() => renameUserSnippet(snippet)}>
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
              // 关闭悬浮层后焦点回到触发钮，Enter 的默认激活会立即点击它把菜单重开——拦掉。
              event.preventDefault();
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
    {:else if queryLower === ''}
      <!-- 过滤态不掺保存入口（打断结果流）；保存表单打开时照常顶替 -->
      <button
        class="flex w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        data-testid="user-snippet-save"
        onclick={startSave}>
        ＋ 保存当前代码为片段
      </button>
    {/if}
    {#if queryLower === ''}
      <Separator class="my-1" />
    {/if}
    {#if filteredGroups.length > 0}
      <div class="px-2 pt-1 text-xs text-muted-foreground">内置骨架</div>
    {/if}
    {#each groupedRows as group (group.label)}
      {#if group.label !== groupedRows[0]?.label}
        <div class="mt-1 border-t"></div>
      {/if}
      <div class="px-2 pt-1 text-[10px] text-muted-foreground">{group.label}</div>
      {#each group.items as snippet, ii (snippet.id)}
        <Popover.Close
          id="snippet-opt-{group.start + ii}"
          data-testid="insert-snippet-{snippet.id}"
          data-active={group.start + ii === activeIndex}
          class={cn(
            'flex w-full flex-col rounded px-2 py-1 text-left hover:bg-accent',
            group.start + ii === activeIndex && 'bg-accent'
          )}
          onmouseenter={() => (manualIndex = group.start + ii)}
          onclick={() => onInsert(snippet.text)}>
          <span class="text-sm">{snippet.label}</span>
          <span class="text-xs text-muted-foreground">{snippet.hint}</span>
        </Popover.Close>
      {/each}
    {/each}
  </Popover.Content>
</Popover.Root>
