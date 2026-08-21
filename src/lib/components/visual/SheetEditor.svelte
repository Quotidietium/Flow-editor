<script lang="ts">
  import { TID } from '$/constants';
  import type { SheetSection } from '$/util/visualEditor/sheet';
  import { addRow, moveRow, removeRow, SHEET_CONFIG, sheetRows } from '$/util/visualEditor/sheet';
  import type { DiagramKind, VGraph, VNode } from '$/util/visualEditor/model';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/close-rounded';
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
    {#each sections as section (section.title)}
      {@const rows = sheetRows(graph, section)}
      <section class="rounded-lg border">
        <header
          class="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 text-xs font-semibold">
          <span>{section.title} · {rows.length}</span>
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
