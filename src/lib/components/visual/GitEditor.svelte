<script lang="ts">
  import { TID } from '$/constants';
  import type { VGraph, VNode } from '$/util/visualEditor/model';
  import { nextEdgeId, nextNodeId } from '$/util/visualEditor/model';
  import { enterCommit } from '$/util/enterCommit';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/close-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-rounded';
  import UpIcon from '~icons/material-symbols/arrow-upward-alt-rounded';
  import DownIcon from '~icons/material-symbols/arrow-downward-alt-rounded';

  /**
   * Git editor: a gitGraph is a replayed operation sequence, so the editor is
   * an ordered list of rows — commit/merge type, branch, optional id/tag, and
   * the merge source branch. Row order = replay order = history order. The
   * existing replay generator (branch/checkout emitted automatically when the
   * active branch changes) consumes the node order directly.
   */
  let {
    commit,
    graph
  }: {
    commit: (mutate: () => void) => void;
    graph: VGraph;
  } = $props();

  /** Branches in first-use order (main first — the generator's default). */
  const branches = $derived.by(() => {
    const seen: string[] = ['main'];
    for (const node of graph.nodes) {
      if (node.roleData && !seen.includes(node.roleData)) {
        seen.push(node.roleData);
      }
    }
    return seen;
  });

  const mergeSourceOf = (node: VNode): string =>
    graph.edges.find((e) => e.role === 'mergeFrom' && e.target === node.id)?.roleData ?? '';

  const setMergeSource = (node: VNode, from: string): void => {
    commit(() => {
      const existing = graph.edges.find((e) => e.role === 'mergeFrom' && e.target === node.id);
      if (existing) {
        existing.roleData = from;
        return;
      }
      // The generator reads only roleData; source still points at the source
      // branch's latest node so the edge stays structurally meaningful.
      const fromHead = [...graph.nodes]
        .reverse()
        .find((n) => n.roleData === from && n.id !== node.id);
      graph.edges.push({
        id: nextEdgeId(graph.edges),
        role: 'mergeFrom',
        roleData: from,
        source: fromHead?.id ?? node.id,
        target: node.id,
        type: 'arrow'
      });
    });
  };

  const addOperation = (role: 'commit' | 'merge'): void => {
    commit(() => {
      const last = graph.nodes.at(-1);
      const node: VNode = {
        id: nextNodeId(graph.nodes),
        label: '',
        role,
        roleData: last?.roleData ?? 'main',
        shape: 'rect',
        x: 0,
        y: 0
      };
      graph.nodes.push(node);
      if (role === 'merge') {
        const from = branches.find((b) => b !== node.roleData);
        if (from) {
          const fromHead = [...graph.nodes]
            .reverse()
            .find((n) => n.roleData === from && n.id !== node.id);
          graph.edges.push({
            id: nextEdgeId(graph.edges),
            role: 'mergeFrom',
            roleData: from,
            source: fromHead?.id ?? node.id,
            target: node.id,
            type: 'arrow'
          });
        }
      }
    });
  };

  const moveOperation = (id: string, direction: -1 | 1): void => {
    commit(() => {
      const at = graph.nodes.findIndex((n) => n.id === id);
      const swap = at + direction;
      if (at < 0 || swap < 0 || swap >= graph.nodes.length) {
        return;
      }
      const a = graph.nodes[at];
      graph.nodes[at] = graph.nodes[swap] as NonNullable<typeof a>;
      graph.nodes[swap] = a as NonNullable<typeof a>;
    });
  };

  const removeOperation = (id: string): void => {
    commit(() => {
      graph.nodes = graph.nodes.filter((n) => n.id !== id);
      graph.edges = graph.edges.filter((e) => e.source !== id && e.target !== id);
    });
  };

  // 复制操作：紧邻原位重放一份同分支/同类型拷贝（merge 行连来源边一起
  // 克隆）。提交 ID 与标签须唯一，新行留空另填——复制的是「这一步操作」，
  // 而不是再造一个同名提交。
  const duplicateOperation = (id: string): void => {
    commit(() => {
      const at = graph.nodes.findIndex((n) => n.id === id);
      const source = graph.nodes[at];
      if (!source) {
        return;
      }
      const copy: VNode = { ...source, detail: undefined, id: nextNodeId(graph.nodes), label: '' };
      graph.nodes.splice(at + 1, 0, copy);
      const mergeEdge = graph.edges.find((e) => e.role === 'mergeFrom' && e.target === id);
      if (mergeEdge) {
        graph.edges.splice(graph.edges.indexOf(mergeEdge) + 1, 0, {
          ...mergeEdge,
          id: nextEdgeId(graph.edges),
          target: copy.id
        });
      }
    });
  };
</script>

<div class="min-h-64 flex-1 overflow-auto p-3" data-testid={TID.visualGit}>
  <div class="mx-auto flex max-w-3xl flex-col gap-3">
    <div class="text-[11px] text-muted-foreground">
      操作自上而下按序重放为 Git 历史；切换分支的 branch/checkout 指令自动生成。
    </div>
    <ul class="divide-y rounded-lg border">
      {#each graph.nodes as node, ni (node.id)}
        <!-- 移动端换行平铺：行内控件定宽合计 ~500px，390px 下靠横滚可达
             但挤——sm 以下两行展开（scrollW 462>374 实证） -->
        <li class="flex flex-wrap items-center gap-1.5 px-3 py-1.5" data-operation-id={node.id}>
          <select
            class="w-20 flex-none rounded border bg-background px-1 py-1 text-xs"
            aria-label="操作类型"
            value={node.role === 'merge' ? 'merge' : 'commit'}
            onchange={(e) => {
              const v = e.currentTarget.value;
              commit(() => {
                node.role = v === 'merge' ? 'merge' : 'commit';
                if (node.role === 'commit') {
                  graph.edges = graph.edges.filter(
                    (e) => !(e.role === 'mergeFrom' && e.target === node.id)
                  );
                }
              });
            }}>
            <option value="commit">提交</option>
            <option value="merge">合并</option>
          </select>
          <input
            class="w-24 flex-none rounded border bg-background px-1 py-1 text-xs"
            aria-label="所在分支"
            placeholder="main"
            use:enterCommit
            value={node.roleData ?? 'main'}
            onchange={(e) => {
              const v = e.currentTarget.value;
              commit(() => (node.roleData = v.trim() || 'main'));
            }} />
          {#if node.role === 'merge'}
            <select
              class="w-28 flex-none rounded border bg-background px-1 py-1 text-xs"
              aria-label="合并来源"
              value={mergeSourceOf(node)}
              onchange={(e) => setMergeSource(node, e.currentTarget.value)}>
              {#if mergeSourceOf(node) === ''}
                <option value="">选择来源分支</option>
              {/if}
              {#each branches.filter((b) => b !== (node.roleData ?? 'main')) as branch (branch)}
                <option value={branch}>{branch}</option>
              {/each}
            </select>
          {/if}
          <input
            class="w-0 min-w-16 flex-1 rounded bg-transparent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            aria-label="提交 ID"
            placeholder="提交 ID（可空）"
            use:enterCommit
            value={node.label}
            onchange={(e) => {
              const v = e.currentTarget.value;
              commit(() => (node.label = v.trim()));
            }} />
          <input
            class="w-20 flex-none rounded bg-transparent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            aria-label="标签"
            placeholder="标签（可空）"
            use:enterCommit
            value={node.detail ?? ''}
            onchange={(e) => {
              const v = e.currentTarget.value;
              commit(() => (node.detail = v.trim() || undefined));
            }} />
          <span class="flex flex-none items-center text-muted-foreground">
            <button
              class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
              disabled={ni === 0}
              title="上移"
              onclick={() => moveOperation(node.id, -1)}>
              <UpIcon />
            </button>
            <button
              class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
              disabled={ni === graph.nodes.length - 1}
              title="下移"
              onclick={() => moveOperation(node.id, 1)}>
              <DownIcon />
            </button>
            <button
              class="rounded p-0.5 hover:bg-accent"
              title="复制操作（新行清空提交 ID 与标签）"
              onclick={() => duplicateOperation(node.id)}>
              <CopyIcon />
            </button>
            <button
              class="rounded p-0.5 hover:bg-accent hover:text-destructive"
              title="删除"
              onclick={() => removeOperation(node.id)}>
              <DeleteIcon />
            </button>
          </span>
        </li>
      {/each}
    </ul>
    <div class="flex gap-2">
      <button
        class="rounded border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
        data-testid="visual-git-add-commit"
        onclick={() => addOperation('commit')}>
        <AddIcon class="inline" /> 提交
      </button>
      <button
        class="rounded border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent disabled:opacity-30"
        data-testid="visual-git-add-merge"
        disabled={branches.length < 2}
        title={branches.length < 2 ? '先在某个提交上填写新分支名' : ''}
        onclick={() => addOperation('merge')}>
        <AddIcon class="inline" /> 合并
      </button>
    </div>
  </div>
</div>
