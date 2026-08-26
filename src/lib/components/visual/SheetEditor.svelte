<script lang="ts">
  import { TID } from '$/constants';
  import type { SheetSection } from '$/util/visualEditor/sheet';
  import {
    addRow,
    duplicateRow,
    moveRow,
    removeRow,
    SHEET_CONFIG,
    sheetRows
  } from '$/util/visualEditor/sheet';
  import type { DiagramKind, VGraph, VNode } from '$/util/visualEditor/model';
  import { enterCommit } from '$/util/enterCommit';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/close-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-rounded';
  import UpIcon from '~icons/material-symbols/arrow-upward-alt-rounded';
  import DownIcon from '~icons/material-symbols/arrow-downward-alt-rounded';

  /**
   * Sheet editor for record-list kinds (pie / packet / radar / xychart / venn /
   * eventmodeling / railroad): the diagram is a flat list of typed records, so
   * the editor is a table — one row per record, one input per field. All
   * mutations go through `commit` (undo snapshot + code sync).
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

  const sections = $derived(SHEET_CONFIG[kind] ?? []);

  // 行过滤：railroad 规则表等长列表定位全靠滚屏（Board/Sequence/Outline
  // 同款交互），匹配名称/数值/角色数据全字段；只过滤显示、不动数据。
  let rowQuery = $state('');
  const query = $derived(rowQuery.trim().toLowerCase());
  const rowMatches = (row: VNode): boolean =>
    query === '' ||
    row.label.toLowerCase().includes(query) ||
    (row.detail ?? '').toLowerCase().includes(query) ||
    (row.roleData ?? '').toLowerCase().includes(query);
  const matchCount = $derived(
    query === ''
      ? 0
      : sections.reduce(
          (total, section) => total + sheetRows(graph, section).filter(rowMatches).length,
          0
        )
  );

  let lastAddedRowId = $state<string | undefined>();

  const focusNew = (el: HTMLElement, id: string): void => {
    if (id === lastAddedRowId) {
      el.focus();
      lastAddedRowId = undefined;
    }
  };

  const fieldValue = (node: VNode, key: 'detail' | 'label' | 'role' | 'roleData'): string =>
    (node[key] ?? '') as string;

  const setField = (
    node: VNode,
    key: 'detail' | 'label' | 'role' | 'roleData',
    value: string
  ): void => {
    commit(() => {
      const v = value.trim();
      if (key === 'detail' || key === 'roleData') {
        node[key] = v || undefined;
      } else {
        node[key] = v;
      }
    });
  };

  const sectionOf = (node: VNode): SheetSection | undefined =>
    sections.find((s) => s.roles.includes(node.role));
</script>

<div class="min-h-64 flex-1 overflow-auto p-3" data-testid={TID.visualSheet}>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <div class="flex items-center justify-end gap-2">
      {#if query !== ''}
        <span class="text-[11px] text-muted-foreground" data-testid="visual-sheet-search-count">
          {matchCount} 行匹配
        </span>
      {/if}
      <input
        class="w-36 rounded border bg-background px-2 py-1 text-xs"
        placeholder="过滤行…"
        aria-label="过滤行"
        data-testid="visual-sheet-search"
        bind:value={rowQuery}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            rowQuery = '';
          }
        }} />
    </div>
    {#each sections as section (section.title)}
      {@const total = sheetRows(graph, section).length}
      {@const rows = sheetRows(graph, section).filter(rowMatches)}
      <section class="rounded-lg border">
        <header
          class="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 text-xs font-semibold">
          <span>{section.title} · {query === '' ? total : `${rows.length}/${total}`}</span>
          <button
            class="rounded border px-2 py-0.5 text-[11px] font-normal hover:bg-accent"
            data-testid="visual-sheet-add-row"
            onclick={() =>
              commit(() => {
                lastAddedRowId = addRow(graph, section).id;
              })}>
            <AddIcon class="inline" />
            {section.addLabel}
          </button>
        </header>
        {#if rows.length === 0}
          <div class="px-3 py-2 text-[11px] text-muted-foreground">
            还没有{section.addLabel}，点右上角添加。
          </div>
        {/if}
        <ul class="divide-y">
          {#each rows as row, ri (row.id)}
            <li class="flex items-center gap-2 px-3 py-1.5" data-row-id={row.id}>
              {#each section.fields as field (field.key)}
                {#if field.options}
                  <select
                    class="w-28 flex-none rounded border bg-background px-1 py-1 text-xs"
                    aria-label={field.label}
                    value={fieldValue(row, field.key)}
                    onchange={(e) => setField(row, field.key, e.currentTarget.value)}>
                    {#if !field.options.some((o) => o.value === fieldValue(row, field.key))}
                      <option value={fieldValue(row, field.key)}
                        >{fieldValue(row, field.key)}</option>
                    {/if}
                    {#each field.options as option (option.value)}
                      <option value={option.value}>{option.name}</option>
                    {/each}
                  </select>
                {:else}
                  <input
                    class="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                    aria-label={field.label}
                    placeholder={field.placeholder ?? field.label}
                    use:enterCommit
                    use:focusNew={row.id}
                    value={fieldValue(row, field.key)}
                    onchange={(e) => setField(row, field.key, e.currentTarget.value)} />
                {/if}
              {/each}
              <span class="flex flex-none items-center">
                <button
                  class="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  disabled={ri === 0}
                  title="上移"
                  onclick={() => {
                    const s = sectionOf(row);
                    if (s) {
                      commit(() => moveRow(graph, s, row.id, -1));
                    }
                  }}>
                  <UpIcon />
                </button>
                <button
                  class="rounded p-0.5 text-muted-foreground hover:bg-accent disabled:opacity-30"
                  disabled={ri === rows.length - 1}
                  title="下移"
                  onclick={() => {
                    const s = sectionOf(row);
                    if (s) {
                      commit(() => moveRow(graph, s, row.id, 1));
                    }
                  }}>
                  <DownIcon />
                </button>
                <button
                  class="rounded p-0.5 text-muted-foreground hover:bg-accent"
                  title="复制（紧邻原位插入）"
                  onclick={() => {
                    const s = sectionOf(row);
                    if (s) {
                      commit(() => {
                        // 拷贝自动聚焦立即可改（与 addRow 同一条 focusNew 通道）
                        lastAddedRowId = duplicateRow(graph, s, row.id)?.id;
                      });
                    }
                  }}>
                  <CopyIcon />
                </button>
                <button
                  class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  title="删除"
                  onclick={() => commit(() => removeRow(graph, row.id))}>
                  <DeleteIcon />
                </button>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</div>
