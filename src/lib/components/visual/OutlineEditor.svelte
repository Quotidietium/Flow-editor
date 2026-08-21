<script lang="ts">
  import { TID } from '$/constants';
  import type { DiagramKind, VGraph, VShape } from '$/util/visualEditor/model';
  import { KIND_SPECS } from '$/util/visualEditor/model';
  import type { OutlineRow } from '$/util/visualEditor/outline';
  import {
    addChild,
    addRoot,
    addSiblingAfter,
    indentRow,
    moveRow,
    outlineRows,
    outdentRow,
    removeRow
  } from '$/util/visualEditor/outline';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/close-rounded';
  import ChildIcon from '~icons/material-symbols/subdirectory-arrow-right-rounded';
  import IndentIcon from '~icons/material-symbols/format-indent-increase-rounded';
  import OutdentIcon from '~icons/material-symbols/format-indent-decrease-rounded';
  import UpIcon from '~icons/material-symbols/arrow-upward-alt-rounded';
  import DownIcon from '~icons/material-symbols/arrow-downward-alt-rounded';

  /**
   * Outline editor for indent-tree kinds (mindmap / treeview / treemap /
   * ishikawa / swimlane): the tree is edited as an outliner — one row per
   * node, indentation shows depth. Enter = new sibling, Tab = indent,
   * Shift+Tab = outdent; deleting a row promotes its children. All mutations
   * go through `commit` (undo snapshot + code sync).
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

  const SHAPE_NAMES: Record<VShape, string> = {
    diamond: '菱形',
    rect: '矩形',
    round: '圆角',
    stadium: '胶囊'
  };

  const spec = $derived(KIND_SPECS[kind]);
  const rows = $derived(outlineRows(graph));
  const hasDetail = $derived(spec.detail);
  const shapes = $derived(spec.shapes);

  let lastAddedId = $state<string | undefined>();

  const focusNew = (el: HTMLElement, id: string): void => {
    if (id === lastAddedId) {
      el.focus();
      lastAddedId = undefined;
    }
  };

  const onLabelKeydown = (event: KeyboardEvent, row: OutlineRow): void => {
    if (event.key !== 'Enter' && event.key !== 'Tab') {
      return;
    }
    event.preventDefault();
    // Flush the in-flight label in the same undo step as the structural op —
    // otherwise Tab/Enter would snapshot the graph before the typed text.
    const label = (event.currentTarget as HTMLInputElement).value.trim();
    commit(() => {
      row.node.label = label || row.node.id;
      if (event.key === 'Enter') {
        lastAddedId = addSiblingAfter(graph, row).id;
      } else if (event.shiftKey) {
        outdentRow(graph, row);
      } else {
        indentRow(graph, row);
      }
    });
  };
</script>

<div class="min-h-64 flex-1 overflow-auto p-3" data-testid={TID.visualOutline}>
  <div class="mx-auto flex max-w-2xl flex-col">
    {#if rows.length === 0}
      <div class="flex h-32 items-center justify-center text-sm text-muted-foreground">
        还没有节点，点击下方「添加根节点」开始。
      </div>
    {/if}
    {#each rows as row (row.id)}
      <div
        class="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/40"
        data-row-id={row.id}
        style="padding-left: {row.depth * 24 + 4}px;">
        <span class="text-[10px] text-muted-foreground select-none">•</span>
        <input
          class="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
          aria-label="节点名称"
          placeholder="节点名称"
          use:focusNew={row.id}
          value={row.node.label}
          onchange={(e) => {
            const v = e.currentTarget.value;
            commit(() => (row.node.label = v.trim() || row.node.id));
          }}
          onkeydown={(e) => onLabelKeydown(e, row)} />
        {#if hasDetail}
          <input
            class="w-24 flex-none rounded bg-muted/50 px-1 py-1 text-[11px] text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
            aria-label="数值"
            placeholder="数值"
            value={row.node.detail ?? ''}
            onchange={(e) => {
              const v = e.currentTarget.value;
              commit(() => (row.node.detail = v.trim() || undefined));
            }} />
        {/if}
        {#if shapes.length > 1}
          <select
            class="w-20 flex-none rounded border bg-background px-1 py-0.5 text-[11px]"
            aria-label="形状"
            value={row.node.shape}
            onchange={(e) => {
              const v = e.currentTarget.value as VShape;
              commit(() => (row.node.shape = v));
            }}>
            {#each shapes as shape (shape)}
              <option value={shape}>{SHAPE_NAMES[shape]}</option>
            {/each}
          </select>
        {/if}
        <span class="flex flex-none items-center text-muted-foreground">
          <button
            class="rounded p-0.5 hover:bg-accent"
            title="添加子级"
            onclick={() =>
              commit(() => {
                lastAddedId = addChild(graph, row.id).id;
              })}>
            <ChildIcon />
          </button>
          <button
            class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
            disabled={row.depth === 0 && rows.findIndex((r) => r.id === row.id) === 0}
            title="上移"
            onclick={() => commit(() => moveRow(graph, row, -1))}>
            <UpIcon />
          </button>
          <button
            class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
            title="下移"
            onclick={() => commit(() => moveRow(graph, row, 1))}>
            <DownIcon />
          </button>
          <button
            class="rounded p-0.5 hover:bg-accent"
            title="缩进（Tab）"
            onclick={() => commit(() => indentRow(graph, row))}>
            <IndentIcon />
          </button>
          <button
            class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
            disabled={row.parentId === undefined}
            title="取消缩进（Shift+Tab）"
            onclick={() => commit(() => outdentRow(graph, row))}>
            <OutdentIcon />
          </button>
          <button
            class="rounded p-0.5 hover:bg-accent hover:text-destructive"
            title="删除（子级上移一级）"
            onclick={() => commit(() => removeRow(graph, row))}>
            <DeleteIcon />
          </button>
        </span>
      </div>
    {/each}
    <button
      class="mt-1 self-start rounded border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
      data-testid="visual-outline-add-root"
      onclick={() =>
        commit(() => {
          lastAddedId = addRoot(graph).id;
        })}>
      <AddIcon class="inline" /> 添加根节点
    </button>
    <div class="mt-2 text-[11px] text-muted-foreground">
      Enter 新增同级 · Tab 缩进 · Shift+Tab 取消缩进
    </div>
  </div>
</div>
