<script lang="ts">
  import { TID } from '$/constants';
  import type { DiagramKind, VGraph, VLinkType } from '$/util/visualEditor/model';
  import { nextEdgeId, nextNodeId } from '$/util/visualEditor/model';
  import { enterCommit } from '$/util/enterCommit';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/close-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-rounded';
  import LeftIcon from '~icons/material-symbols/arrow-left-alt-rounded';
  import RightIcon from '~icons/material-symbols/arrow-right-alt-rounded';
  import UpIcon from '~icons/material-symbols/arrow-upward-alt-rounded';
  import DownIcon from '~icons/material-symbols/arrow-downward-alt-rounded';

  /**
   * Sequence editor for sequenceDiagram / zenuml: participants are an ordered
   * list (declaration order = lifeline order), messages are an ordered list
   * (top = earliest). Editing order/labels here maps 1:1 onto the rendered
   * diagram — no free canvas to fight.
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

  interface ArrowOption {
    name: string;
    type: VLinkType;
  }

  const SEQUENCE_ARROWS: ArrowOption[] = [
    { name: '实线实心 ->>', type: 'msgSolidFilled' },
    { name: '虚线实心 -->>', type: 'msgDashedFilled' },
    { name: '实线开放 ->', type: 'msgSolidOpen' },
    { name: '虚线开放 --)>', type: 'msgDashedOpen' }
  ];
  const ZENUML_ARROWS: ArrowOption[] = [
    { name: '实线 ->', type: 'msgSolidFilled' },
    { name: '虚线 -->', type: 'msgDashedFilled' }
  ];

  const arrows = $derived(kind === 'zenuml' ? ZENUML_ARROWS : SEQUENCE_ARROWS);
  const participants = $derived(graph.nodes);

  // 消息过滤：长时序图按消息内容或参与者名定位（Board 卡片过滤同款交互），
  // 只过滤显示、不动数据；Esc 清空。
  let messageQuery = $state('');
  const query = $derived(messageQuery.trim().toLowerCase());
  const participantLabel = (id: string): string =>
    graph.nodes.find((n) => n.id === id)?.label ?? id;
  const visibleEdges = $derived(
    query === ''
      ? graph.edges
      : graph.edges.filter(
          (edge) =>
            (edge.label ?? '').toLowerCase().includes(query) ||
            participantLabel(edge.source).toLowerCase().includes(query) ||
            participantLabel(edge.target).toLowerCase().includes(query)
        )
  );

  let lastAddedId = $state<string | undefined>();

  const focusNew = (el: HTMLElement, id: string): void => {
    if (id === lastAddedId) {
      el.focus();
      lastAddedId = undefined;
    }
  };

  const addParticipant = (): void => {
    commit(() => {
      lastAddedId = nextNodeId(graph.nodes);
      graph.nodes.push({ id: lastAddedId, label: '', shape: 'rect', x: 0, y: 0 });
    });
  };

  const moveParticipant = (id: string, direction: -1 | 1): void => {
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

  const removeParticipant = (id: string): void => {
    commit(() => {
      graph.nodes = graph.nodes.filter((n) => n.id !== id);
      graph.edges = graph.edges.filter((e) => e.source !== id && e.target !== id);
    });
  };

  const addMessage = (): void => {
    if (participants.length === 0) {
      return;
    }
    commit(() => {
      const source = graph.nodes[0];
      const target = graph.nodes.find((n) => n.id !== source?.id) ?? source;
      if (!source || !target) {
        return;
      }
      graph.edges.push({
        id: nextEdgeId(graph.edges),
        source: source.id,
        target: target.id,
        type: arrows[0]?.type ?? 'msgSolidFilled'
      });
    });
  };

  const moveMessage = (id: string, direction: -1 | 1): void => {
    commit(() => {
      const at = graph.edges.findIndex((e) => e.id === id);
      const swap = at + direction;
      if (at < 0 || swap < 0 || swap >= graph.edges.length) {
        return;
      }
      const a = graph.edges[at];
      graph.edges[at] = graph.edges[swap] as NonNullable<typeof a>;
      graph.edges[swap] = a as NonNullable<typeof a>;
    });
  };

  // 复制消息：紧邻原位插入一份全等拷贝（新 id）。时序图里相邻消息常成对
  // （请求/响应、重试），复制后改一端或改箭头比从头选快得多。
  const duplicateMessage = (id: string): void => {
    commit(() => {
      const at = graph.edges.findIndex((e) => e.id === id);
      const source = graph.edges[at];
      if (!source) {
        return;
      }
      graph.edges.splice(at + 1, 0, { ...source, id: nextEdgeId(graph.edges) });
    });
  };

  const arrowName = (type: VLinkType): string =>
    arrows.find((a) => a.type === type)?.name ?? arrows[0]?.name ?? '';
</script>

<div class="min-h-64 flex-1 overflow-auto p-3" data-testid={TID.visualSequence}>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <section class="rounded-lg border">
      <header
        class="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 text-xs font-semibold">
        <span>参与者 · {participants.length}（顺序 = 生命线从左到右）</span>
        <button
          class="rounded border px-2 py-0.5 text-[11px] font-normal hover:bg-accent"
          data-testid="visual-sequence-add-participant"
          onclick={addParticipant}>
          <AddIcon class="inline" /> 参与者
        </button>
      </header>
      <ul class="divide-y">
        {#each participants as p, pi (p.id)}
          <li class="flex items-center gap-2 px-3 py-1.5" data-participant-id={p.id}>
            <input
              class="min-w-0 flex-1 rounded bg-transparent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              aria-label="参与者名称"
              placeholder="参与者名称"
              use:enterCommit
              use:focusNew={p.id}
              value={p.label}
              onchange={(e) => {
                const v = e.currentTarget.value;
                commit(() => (p.label = v.trim() || p.id));
              }} />
            <select
              class="w-24 flex-none rounded border bg-background px-1 py-1 text-xs"
              aria-label="参与者类型"
              value={p.shape === 'round' ? 'actor' : 'participant'}
              onchange={(e) => {
                const v = e.currentTarget.value;
                commit(() => (p.shape = v === 'actor' ? 'round' : 'rect'));
              }}>
              <option value="participant">参与者</option>
              <option value="actor">actor</option>
            </select>
            <span class="flex flex-none items-center text-muted-foreground">
              <button
                class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
                disabled={pi === 0}
                title="左移"
                onclick={() => moveParticipant(p.id, -1)}>
                <LeftIcon />
              </button>
              <button
                class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
                disabled={pi === participants.length - 1}
                title="右移"
                onclick={() => moveParticipant(p.id, 1)}>
                <RightIcon />
              </button>
              <button
                class="rounded p-0.5 hover:bg-accent hover:text-destructive"
                title="删除（连同其消息）"
                onclick={() => removeParticipant(p.id)}>
                <DeleteIcon />
              </button>
            </span>
          </li>
        {/each}
      </ul>
    </section>

    <section class="rounded-lg border">
      <header
        class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs font-semibold">
        <span>
          消息 · {query === ''
            ? graph.edges.length
            : `${visibleEdges.length}/${graph.edges.length}`}（顺序 = 从上到下）
        </span>
        <span class="flex items-center gap-2 font-normal">
          <input
            class="w-32 rounded border bg-background px-1.5 py-0.5 text-[11px]"
            placeholder="过滤消息…"
            aria-label="过滤消息"
            data-testid="visual-sequence-search"
            bind:value={messageQuery}
            onkeydown={(e) => {
              if (e.key === 'Escape') {
                messageQuery = '';
              }
            }} />
          <button
            class="rounded border px-2 py-0.5 text-[11px] font-normal hover:bg-accent disabled:opacity-30"
            data-testid="visual-sequence-add-message"
            disabled={participants.length === 0}
            onclick={addMessage}>
            <AddIcon class="inline" /> 消息
          </button>
        </span>
      </header>
      {#if graph.edges.length === 0}
        <div class="px-3 py-2 text-[11px] text-muted-foreground">
          还没有消息{participants.length < 2 ? '（先添加两个参与者）' : ''}。
        </div>
      {:else if visibleEdges.length === 0}
        <div class="px-3 py-2 text-[11px] text-muted-foreground">
          没有匹配「{messageQuery.trim()}」的消息。
        </div>
      {/if}
      <ul class="divide-y">
        {#each visibleEdges as edge, ei (edge.id)}
          <li class="flex items-center gap-1.5 px-3 py-1.5" data-message-id={edge.id}>
            <select
              class="w-0 min-w-16 flex-1 rounded border bg-background px-1 py-1 text-xs"
              aria-label="消息源"
              value={edge.source}
              onchange={(e) => {
                const v = e.currentTarget.value;
                commit(() => {
                  // Source and target may not coincide (self messages have no
                  // import syntax): swap rather than strand the target select.
                  if (v === edge.target) {
                    edge.target = edge.source;
                  }
                  edge.source = v;
                });
              }}>
              {#each participants as p (p.id)}
                <option value={p.id}>{p.label || p.id}</option>
              {/each}
            </select>
            <select
              class="w-32 flex-none rounded border bg-background px-1 py-1 text-xs"
              aria-label="箭头"
              value={edge.type}
              onchange={(e) => {
                const v = e.currentTarget.value as VLinkType;
                commit(() => (edge.type = v));
              }}>
              {#if !arrows.some((a) => a.type === edge.type)}
                <option value={edge.type}>{arrowName(edge.type)}</option>
              {/if}
              {#each arrows as arrow (arrow.type)}
                <option value={arrow.type}>{arrow.name}</option>
              {/each}
            </select>
            <select
              class="w-0 min-w-16 flex-1 rounded border bg-background px-1 py-1 text-xs"
              aria-label="消息目标"
              value={edge.target}
              onchange={(e) => {
                const v = e.currentTarget.value;
                commit(() => (edge.target = v));
              }}>
              {#each participants.filter((p) => p.id !== edge.source) as p (p.id)}
                <option value={p.id}>{p.label || p.id}</option>
              {/each}
            </select>
            <input
              class="w-0 min-w-20 flex-1 rounded bg-transparent px-1 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              aria-label="消息内容"
              placeholder="消息内容"
              use:enterCommit
              value={edge.label ?? ''}
              onchange={(e) => {
                const v = e.currentTarget.value;
                commit(() => (edge.label = v.trim() || undefined));
              }} />
            <span class="flex flex-none items-center text-muted-foreground">
              <button
                class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
                disabled={ei === 0}
                title="上移"
                onclick={() => moveMessage(edge.id, -1)}>
                <UpIcon />
              </button>
              <button
                class="rounded p-0.5 hover:bg-accent disabled:opacity-30"
                disabled={ei === graph.edges.length - 1}
                title="下移"
                onclick={() => moveMessage(edge.id, 1)}>
                <DownIcon />
              </button>
              <button
                class="rounded p-0.5 hover:bg-accent"
                title="复制消息（紧邻原位插入）"
                onclick={() => duplicateMessage(edge.id)}>
                <CopyIcon />
              </button>
              <button
                class="rounded p-0.5 hover:bg-accent hover:text-destructive"
                title="删除消息"
                onclick={() =>
                  commit(() => (graph.edges = graph.edges.filter((e) => e.id !== edge.id)))}>
                <DeleteIcon />
              </button>
            </span>
          </li>
        {/each}
      </ul>
    </section>
  </div>
</div>
