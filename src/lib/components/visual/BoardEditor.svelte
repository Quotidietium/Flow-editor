<script lang="ts">
  import { TID } from '$/constants';
  import {
    addCard,
    addColumn,
    boardColumns,
    duplicateCard,
    moveCard,
    moveColumn,
    removeCard,
    removeColumn
  } from '$/util/visualEditor/board';
  import type { DiagramKind, VGraph } from '$/util/visualEditor/model';
  import { nextEdgeId } from '$/util/visualEditor/model';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/close-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-rounded';
  import LeftIcon from '~icons/material-symbols/arrow-left-alt-rounded';
  import RightIcon from '~icons/material-symbols/arrow-right-alt-rounded';

  /**
   * Board editor for grouped-list kinds (journey / gantt / timeline / kanban /
   * cynefin): groups are columns, member items are cards. Cards drag between
   * columns (rewiring the membership edge) and within a column (reorder).
   * All mutations go through `commit` so undo + code sync stay centralized.
   */
  let {
    commit,
    graph,
    kind
  }: {
    commit: (mutate: () => void) => void;
    graph: VGraph;
    kind: DiagramKind;
  } = $props();

  interface BoardConfig {
    /** Placeholder for the per-card detail input; omitted = no detail field. */
    detailPlaceholder?: string;
    /** Fixed column set (cynefin domains): no add/remove/reorder/rename. */
    fixed: boolean;
    groupName: string;
    groupRole: string;
    itemName: string;
    itemRole: string;
    /** Domain→domain transition editor (cynefin). */
    transitions?: boolean;
  }

  const CONFIGS: Partial<Record<DiagramKind, BoardConfig>> = {
    cynefin: {
      fixed: true,
      groupName: '域',
      groupRole: 'domain',
      itemName: '条目',
      itemRole: 'item',
      transitions: true
    },
    gantt: {
      detailPlaceholder: '日期/工期：2024-01-01, 3d',
      fixed: false,
      groupName: '阶段',
      groupRole: 'section',
      itemName: '任务',
      itemRole: 'task'
    },
    journey: {
      detailPlaceholder: '评分 1-5，可带参与者：5: 我',
      fixed: false,
      groupName: '分组',
      groupRole: 'section',
      itemName: '任务',
      itemRole: 'task'
    },
    kanban: {
      detailPlaceholder: '属性尾缀：@{ priority: "High" }',
      fixed: false,
      groupName: '列表',
      groupRole: 'column',
      itemName: '卡片',
      itemRole: 'ticket'
    },
    timeline: {
      fixed: false,
      groupName: '时期',
      groupRole: 'period',
      itemName: '事件',
      itemRole: 'event'
    }
  };

  const DOMAIN_NAMES: Record<string, string> = {
    chaotic: '混沌域',
    clear: '清晰域',
    complex: '复杂域',
    complicated: '繁杂域',
    confusion: '困惑域'
  };

  const config = $derived(
    CONFIGS[kind] ?? {
      fixed: false,
      groupName: '分组',
      groupRole: 'section',
      itemName: '条目',
      itemRole: 'task'
    }
  );
  const columns = $derived(boardColumns(graph, config.groupRole, config.groupName));
  const domainNodes = $derived(graph.nodes.filter((n) => n.role === 'domain'));

  // 卡片过滤：大甘特图/长看板里按名称或详情定位（MC 设计器树搜索同款交互），
  // 只过滤显示、不动数据结构；Esc 清空。
  let cardQuery = $state('');
  const query = $derived(cardQuery.trim().toLowerCase());
  const visibleColumns = $derived(
    query === ''
      ? columns
      : columns.map((col) => ({
          ...col,
          items: col.items.filter(
            (card) =>
              card.label.toLowerCase().includes(query) ||
              (card.detail ?? '').toLowerCase().includes(query)
          )
        }))
  );
  const matchCount = $derived(visibleColumns.reduce((total, col) => total + col.items.length, 0));

  let dragCardId = $state<string | undefined>();
  let dropHint = $state<string | undefined>(); // column id or `${columnId}:${cardId}`
  let lastAddedCardId = $state<string | undefined>();
  // cynefin transition drafts: per-domain { target, label }.
  let transitionDrafts = $state<Record<string, { label: string; target: string }>>({});

  const focusNew = (el: HTMLElement, id: string): void => {
    if (id === lastAddedCardId) {
      el.focus();
      lastAddedCardId = undefined;
    }
  };

  const columnName = (label: string): string => DOMAIN_NAMES[label] ?? label;

  const onCardDragStart = (event: DragEvent, cardId: string): void => {
    dragCardId = cardId;
    event.dataTransfer?.setData('text/plain', cardId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  };

  const dropOnColumn = (columnId: string | undefined): void => {
    if (!dragCardId) {
      return;
    }
    const id = dragCardId;
    commit(() =>
      moveCard(graph, { cardId: id, groupRole: config.groupRole, toColumnId: columnId })
    );
    dragCardId = undefined;
    dropHint = undefined;
  };

  const dropOnCard = (columnId: string | undefined, beforeCardId: string): void => {
    if (!dragCardId || dragCardId === beforeCardId) {
      return;
    }
    const id = dragCardId;
    commit(() =>
      moveCard(graph, {
        beforeCardId,
        cardId: id,
        groupRole: config.groupRole,
        toColumnId: columnId
      })
    );
    dragCardId = undefined;
    dropHint = undefined;
  };

  const transitionsFrom = (columnId: string) =>
    graph.edges.filter((edge) => {
      const source = graph.nodes.find((n) => n.id === edge.source);
      const target = graph.nodes.find((n) => n.id === edge.target);
      return edge.source === columnId && source?.role === 'domain' && target?.role === 'domain';
    });

  const addTransition = (columnId: string): void => {
    const draft = transitionDrafts[columnId];
    if (!draft?.target) {
      return;
    }
    commit(() => {
      graph.edges.push({
        id: nextEdgeId(graph.edges),
        label: draft.label.trim() || undefined,
        source: columnId,
        target: draft.target,
        type: 'arrow'
      });
    });
    transitionDrafts = { ...transitionDrafts, [columnId]: { label: '', target: '' } };
  };
</script>

<div class="min-h-64 flex-1 overflow-auto p-3" data-testid={TID.visualBoard}>
  {#if columns.length === 0}
    <div class="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <span>还没有{config.groupName}</span>
      <button
        class="rounded border px-3 py-1 text-xs hover:bg-accent"
        data-testid="visual-board-add-column"
        onclick={() =>
          commit(() => void addColumn(graph, { label: config.groupName, role: config.groupRole }))}>
        <AddIcon class="inline" /> 添加{config.groupName}
      </button>
    </div>
  {:else}
    <div class="mb-2 flex items-center justify-end gap-2">
      {#if query !== ''}
        <span class="text-[11px] text-muted-foreground" data-testid="visual-board-search-count">
          {matchCount} 张匹配
        </span>
      {/if}
      <input
        class="w-44 rounded border bg-background px-2 py-1 text-xs"
        placeholder="过滤{config.itemName}…"
        aria-label="过滤{config.itemName}"
        data-testid="visual-board-search"
        bind:value={cardQuery}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            cardQuery = '';
          }
        }} />
    </div>
    <div class="flex items-start gap-3">
      {#each visibleColumns as col, ci (col.id ?? '__virtual__')}
        {@const colKey = col.id ?? '__virtual__'}
        <section
          class="w-60 flex-none rounded-lg border bg-muted/30 transition-colors {dropHint === colKey
            ? 'ring-2 ring-primary'
            : ''}"
          aria-label={columnName(col.label)}
          ondragover={(e) => {
            e.preventDefault();
            dropHint = colKey;
          }}
          ondragleave={() => (dropHint = undefined)}
          ondrop={(e) => {
            e.preventDefault();
            dropOnColumn(col.id);
          }}>
          <header class="flex items-center gap-1 border-b px-2 py-1.5">
            {#if config.fixed}
              <span class="flex-1 truncate text-xs font-semibold">{columnName(col.label)}</span>
            {:else}
              <input
                class="w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs font-semibold outline-none focus:bg-background focus:ring-1 focus:ring-primary"
                aria-label="{config.groupName}名称"
                value={col.label}
                onchange={(e) => {
                  const v = e.currentTarget.value;
                  commit(() => {
                    const node = graph.nodes.find((n) => n.id === col.id);
                    if (node) {
                      node.label = v.trim() || node.id;
                    }
                  });
                }} />
            {/if}
            <span class="text-[10px] text-muted-foreground">{col.items.length}</span>
            {#if !config.fixed && col.id !== undefined}
              <button
                class="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                disabled={ci === 0}
                title="左移"
                onclick={() =>
                  commit(() => moveColumn(graph, config.groupRole, col.id as string, -1))}>
                <LeftIcon />
              </button>
              <button
                class="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                disabled={ci === columns.length - 1}
                title="右移"
                onclick={() =>
                  commit(() => moveColumn(graph, config.groupRole, col.id as string, 1))}>
                <RightIcon />
              </button>
              <button
                class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                title="删除{config.groupName}（{config.itemName}移入末尾{config.groupName}）"
                onclick={() => commit(() => removeColumn(graph, col.id as string))}>
                <DeleteIcon />
              </button>
            {/if}
          </header>

          <div class="flex min-h-10 flex-col gap-1.5 p-2">
            {#each col.items as card (card.id)}
              <div
                class="rounded border bg-background p-1.5 shadow-sm {dropHint ===
                `${colKey}:${card.id}`
                  ? 'border-primary'
                  : ''} {dragCardId === card.id ? 'opacity-40' : ''}"
                data-card-id={card.id}
                data-testid="visual-board-card"
                draggable="true"
                ondragstart={(e) => onCardDragStart(e, card.id)}
                ondragend={() => {
                  dragCardId = undefined;
                  dropHint = undefined;
                }}
                ondragover={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dropHint = `${colKey}:${card.id}`;
                }}
                ondrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dropOnCard(col.id, card.id);
                }}
                role="listitem">
                <div class="flex items-center gap-1">
                  <input
                    class="w-0 flex-1 rounded bg-transparent px-1 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                    aria-label="{config.itemName}名称"
                    placeholder="{config.itemName}名称"
                    use:focusNew={card.id}
                    value={card.label}
                    onchange={(e) => {
                      const v = e.currentTarget.value;
                      commit(() => (card.label = v.trim() || card.id));
                    }} />
                  <button
                    class="rounded p-0.5 text-muted-foreground hover:bg-accent"
                    title="复制{config.itemName}（紧邻原位插入）"
                    onclick={() =>
                      commit(() => {
                        // 拷贝获得焦点立即可改名（与 addCard 同一条 focusNew 通道）
                        lastAddedCardId = duplicateCard(graph, {
                          cardId: card.id,
                          groupRole: config.groupRole
                        })?.id;
                      })}>
                    <CopyIcon />
                  </button>
                  <button
                    class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                    title="删除{config.itemName}"
                    onclick={() => commit(() => removeCard(graph, card.id))}>
                    <DeleteIcon />
                  </button>
                </div>
                {#if config.detailPlaceholder}
                  <input
                    class="mt-1 w-full rounded bg-muted/50 px-1 py-0.5 text-[11px] text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
                    aria-label="{config.itemName}详情"
                    placeholder={config.detailPlaceholder}
                    value={card.detail ?? ''}
                    onchange={(e) => {
                      const v = e.currentTarget.value;
                      commit(() => (card.detail = v.trim() || undefined));
                    }} />
                {/if}
              </div>
            {/each}

            {#if col.id !== undefined || columns.length === 0}
              <button
                class="rounded border border-dashed px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-accent"
                data-testid="visual-board-add-card"
                onclick={() =>
                  commit(() => {
                    const node = addCard(graph, {
                      columnId: col.id,
                      itemRole: config.itemRole,
                      label: ''
                    });
                    lastAddedCardId = node.id;
                  })}>
                <AddIcon class="inline" />
                {config.itemName}
              </button>
            {/if}
          </div>

          {#if config.transitions && col.id}
            {@const domainId = col.id}
            <div class="border-t px-2 py-1.5">
              {#each transitionsFrom(domainId) as edge (edge.id)}
                {@const target = graph.nodes.find((n) => n.id === edge.target)}
                <div class="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span class="flex-1 truncate">
                    → {DOMAIN_NAMES[target?.label ?? ''] ?? target?.label ?? edge.target}
                    {edge.label ? `：${edge.label}` : ''}
                  </span>
                  <button
                    class="rounded p-0.5 hover:bg-accent hover:text-destructive"
                    title="删除转换"
                    onclick={() =>
                      commit(() => (graph.edges = graph.edges.filter((e) => e.id !== edge.id)))}>
                    <DeleteIcon />
                  </button>
                </div>
              {/each}
              <div class="mt-1 flex items-center gap-1">
                <select
                  class="w-0 flex-1 rounded border bg-background px-1 py-0.5 text-[11px]"
                  aria-label="转换目标域"
                  value={transitionDrafts[domainId]?.target ?? ''}
                  onchange={(e) => {
                    const cur = transitionDrafts[domainId] ?? { label: '', target: '' };
                    transitionDrafts = {
                      ...transitionDrafts,
                      [domainId]: { ...cur, target: e.currentTarget.value }
                    };
                  }}>
                  <option value="">＋转换到…</option>
                  {#each domainNodes.filter((n) => n.id !== domainId) as domain (domain.id)}
                    <option value={domain.id}>{DOMAIN_NAMES[domain.label] ?? domain.label}</option>
                  {/each}
                </select>
                <input
                  class="w-16 rounded border bg-background px-1 py-0.5 text-[11px]"
                  aria-label="转换说明"
                  placeholder="说明"
                  value={transitionDrafts[domainId]?.label ?? ''}
                  oninput={(e) => {
                    const cur = transitionDrafts[domainId] ?? { label: '', target: '' };
                    transitionDrafts = {
                      ...transitionDrafts,
                      [domainId]: { ...cur, label: e.currentTarget.value }
                    };
                  }} />
                <button
                  class="rounded border px-1.5 py-0.5 text-[11px] hover:bg-accent disabled:opacity-30"
                  disabled={!transitionDrafts[domainId]?.target}
                  onclick={() => addTransition(domainId)}>
                  添加
                </button>
              </div>
            </div>
          {/if}
        </section>
      {/each}

      {#if !config.fixed}
        <button
          class="flex h-24 w-32 flex-none items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-accent"
          data-testid="visual-board-add-column"
          onclick={() =>
            commit(
              () => void addColumn(graph, { label: config.groupName, role: config.groupRole })
            )}>
          <AddIcon class="mr-1 inline" />
          {config.groupName}
        </button>
      {/if}
    </div>
  {/if}
</div>
