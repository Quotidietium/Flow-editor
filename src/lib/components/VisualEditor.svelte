<script lang="ts">
  import { Button } from '$/components/ui/button';
  import { TID } from '$/constants';
  import { notify } from '$/util/notify';
  import {
    edgeAnchor,
    generateCode,
    layoutGraph,
    LINK_ORDER,
    nextEdgeId,
    nextNodeId,
    NODE_H,
    NODE_W,
    parseFlowchart,
    SHAPE_ORDER
  } from '$/util/visualEditor/model';
  import type { VEdge, VGraph, VLinkType, VNode, VShape } from '$/util/visualEditor/model';
  import { updateCode, validatedState } from '$/util/state.svelte';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/delete-outline-rounded';
  import AutoFixIcon from '~icons/material-symbols/auto-fix-normal-outline-rounded';
  import ResetIcon from '~icons/material-symbols/chrome-restore-outline-rounded';
  import ClearIcon from '~icons/material-symbols/clear-all-rounded';
  import { onMount } from 'svelte';

  const CANVAS_W = 3000;
  const CANVAS_H = 2000;
  const SNAP = 10;

  const SHAPE_NAMES: Record<VShape, string> = {
    diamond: '菱形',
    rect: '矩形',
    round: '圆角',
    stadium: '胶囊'
  };
  const LINK_NAMES: Record<VLinkType, string> = {
    arrow: '箭头',
    dashed: '虚线',
    line: '直线'
  };

  let { active = true }: { active?: boolean } = $props();

  let graph = $state<VGraph>({ direction: 'TD', nodes: [], edges: [] });
  let selected = $state<{ id: string; kind: 'edge' | 'node' } | undefined>();
  let editing = $state<
    undefined | { id: string; kind: 'edge' | 'node'; label: string; x: number; y: number }
  >();
  let linking = $state<undefined | { cursor: { x: number; y: number }; source: string }>();
  let drag = $state<undefined | { id: string; offX: number; offY: number; moved: boolean }>();
  let showCode = $state(true);
  let svgEl: SVGSVGElement | undefined = $state();
  let canvasEl: HTMLDivElement | undefined = $state();

  // Cached svg rect for pointer-coordinate math: reading getBoundingClientRect
  // on every pointermove interleaves layout reads with the drag's attribute
  // writes (forced synchronous layout per move). Cached per gesture and
  // invalidated when the canvas scrolls mid-gesture.
  let svgRect: DOMRect | undefined;

  // Last code this editor produced or parsed; used to detect external edits
  // (in the Code tab) so switching back to Visual reloads them.
  let lastSyncedCode = '';

  const nodeById = $derived(new Map(graph.nodes.map((node) => [node.id, node] as const)));
  const edgeById = $derived(new Map(graph.edges.map((edge) => [edge.id, edge] as const)));
  const selectedNode = $derived(selected?.kind === 'node' ? nodeById.get(selected.id) : undefined);
  const selectedEdge = $derived(selected?.kind === 'edge' ? edgeById.get(selected.id) : undefined);
  const generated = $derived(generateCode(graph));

  const svgPoint = (event: PointerEvent | MouseEvent): { x: number; y: number } => {
    if (!svgRect) {
      svgRect = svgEl?.getBoundingClientRect();
    }
    return svgRect
      ? { x: event.clientX - svgRect.left, y: event.clientY - svgRect.top }
      : { x: 0, y: 0 };
  };

  const snap = (value: number): number => Math.round(value / SNAP) * SNAP;

  const syncCode = (): void => {
    lastSyncedCode = generateCode(graph);
    updateCode(lastSyncedCode, { updateDiagram: true });
  };

  const loadFromCode = (announce: boolean): void => {
    const parsed = parseFlowchart(validatedState.current.code);
    if (parsed.ok) {
      graph = layoutGraph(parsed.result.graph);
      if (announce) {
        notify(
          parsed.result.skipped > 0
            ? `已从代码载入（跳过 ${parsed.result.skipped} 行不支持的语法）`
            : '已从代码载入'
        );
      }
    } else {
      graph = { direction: 'TD', nodes: [], edges: [] };
      if (announce) {
        notify('当前代码不是 flowchart，已载入空白画布（原代码不会丢失）');
      }
    }
    lastSyncedCode = validatedState.current.code;
    selected = undefined;
    editing = undefined;
  };

  onMount(() => {
    // Mid-gesture canvas scrolling shifts the svg origin: drop the cached
    // rect so the next pointer event re-measures it.
    canvasEl?.addEventListener('scroll', () => (svgRect = undefined));
    loadFromCode(false);
  });

  // Reload external code edits made while this tab was hidden.
  $effect(() => {
    if (active && validatedState.current.code !== lastSyncedCode) {
      loadFromCode(false);
    }
  });

  const addNodeAt = (x: number, y: number): void => {
    const node: VNode = {
      id: nextNodeId(graph.nodes),
      label: '',
      shape: 'rect',
      x: snap(x - NODE_W / 2),
      y: snap(y - NODE_H / 2)
    };
    graph.nodes.push(node);
    selected = { id: node.id, kind: 'node' };
    startEdit(node);
  };

  const addNodeStaggered = (): void => {
    const n = graph.nodes.length;
    addNodeAt(80 + (n % 8) * (NODE_W + 40), 60 + Math.floor(n / 8) * (NODE_H + 40));
  };

  const startEdit = (target: VNode | VEdge): void => {
    if ('source' in target) {
      const s = nodeById.get(target.source);
      const t = nodeById.get(target.target);
      let x = 0;
      let y = 0;
      if (s && t) {
        const a = edgeAnchor(s, t);
        x = (a.x1 + a.x2) / 2;
        y = (a.y1 + a.y2) / 2;
      }
      editing = { id: target.id, kind: 'edge', label: target.label ?? '', x, y };
    } else {
      editing = {
        id: target.id,
        kind: 'node',
        label: target.label ?? '',
        x: target.x + NODE_W / 2,
        y: target.y + NODE_H / 2
      };
    }
  };

  const commitEdit = (): void => {
    if (!editing) return;
    const label = editing.label.trim();
    if (editing.kind === 'node') {
      const node = nodeById.get(editing.id);
      if (node) {
        node.label = label || node.id;
      }
    } else {
      const edge = edgeById.get(editing.id);
      if (edge) {
        edge.label = label || undefined;
      }
    }
    editing = undefined;
    syncCode();
  };

  const deleteSelected = (): void => {
    const sel = selected;
    if (!sel) return;
    if (sel.kind === 'node') {
      graph.nodes = graph.nodes.filter((node) => node.id !== sel.id);
      graph.edges = graph.edges.filter((edge) => edge.source !== sel.id && edge.target !== sel.id);
    } else {
      graph.edges = graph.edges.filter((edge) => edge.id !== sel.id);
    }
    selected = undefined;
    syncCode();
  };

  const cycleShape = (): void => {
    if (!selectedNode) return;
    const i = SHAPE_ORDER.indexOf(selectedNode.shape);
    selectedNode.shape = SHAPE_ORDER[(i + 1) % SHAPE_ORDER.length] ?? 'rect';
    syncCode();
  };

  const cycleLink = (): void => {
    if (!selectedEdge) return;
    const i = LINK_ORDER.indexOf(selectedEdge.type);
    selectedEdge.type = LINK_ORDER[(i + 1) % LINK_ORDER.length] ?? 'arrow';
    syncCode();
  };

  const toggleDirection = (): void => {
    graph.direction = graph.direction === 'TD' ? 'LR' : 'TD';
    syncCode();
  };

  const autoLayout = (): void => {
    graph = layoutGraph(graph);
    syncCode();
  };

  const clearAll = (): void => {
    graph = { direction: graph.direction, nodes: [], edges: [] };
    selected = undefined;
    syncCode();
  };

  // --- pointer interactions (window-level so drags survive leaving a node) ---

  const onNodePointerDown = (event: PointerEvent, node: VNode): void => {
    event.stopPropagation();
    selected = { id: node.id, kind: 'node' };
    const p = svgPoint(event);
    drag = { id: node.id, moved: false, offX: p.x - node.x, offY: p.y - node.y };
  };

  const onHandlePointerDown = (event: PointerEvent, node: VNode): void => {
    event.stopPropagation();
    linking = { cursor: svgPoint(event), source: node.id };
  };

  const nodeAt = (p: { x: number; y: number }): VNode | undefined =>
    graph.nodes.find(
      (node) => p.x >= node.x && p.x <= node.x + NODE_W && p.y >= node.y && p.y <= node.y + NODE_H
    );

  const onWindowPointerMove = (event: PointerEvent): void => {
    const p = svgPoint(event);
    if (drag) {
      const node = nodeById.get(drag.id);
      if (node) {
        const x = snap(p.x - drag.offX);
        const y = snap(p.y - drag.offY);
        // Skip no-op snapped positions: an assignment bumps the property
        // version and re-renders the node (and its edges) even when the
        // 10px-snapped coordinates did not change.
        if (x !== node.x || y !== node.y) {
          node.x = x;
          node.y = y;
          drag.moved = true;
        }
      }
    } else if (linking) {
      linking.cursor = p;
    }
  };

  const onWindowPointerUp = (event: PointerEvent): void => {
    if (drag?.moved) {
      syncCode();
    }
    drag = undefined;
    svgRect = undefined; // next gesture re-measures (layout may have changed)
    if (linking) {
      const target = nodeAt(svgPoint(event));
      if (target && target.id !== linking.source) {
        const edge: VEdge = {
          id: nextEdgeId(graph.edges),
          source: linking.source,
          target: target.id,
          type: 'arrow'
        };
        graph.edges.push(edge);
        selected = { id: edge.id, kind: 'edge' };
        syncCode();
      }
      linking = undefined;
    }
  };

  const onWindowKeydown = (event: KeyboardEvent): void => {
    if (editing || !active) return;
    if (event.key === 'Escape') {
      linking = undefined;
      selected = undefined;
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
      event.preventDefault();
      deleteSelected();
    }
  };

  const edgeGeom = (edge: VEdge) => {
    const s = nodeById.get(edge.source);
    const t = nodeById.get(edge.target);
    return s && t ? edgeAnchor(s, t) : undefined;
  };

  const linkPreview = $derived.by(() => {
    if (!linking) return undefined;
    const s = nodeById.get(linking.source);
    if (!s) return undefined;
    return {
      x1: s.x + NODE_W / 2,
      x2: linking.cursor.x,
      y1: s.y + NODE_H / 2,
      y2: linking.cursor.y
    };
  });

  const displayLabel = (label: string): string =>
    label.length > 16 ? `${label.slice(0, 15)}…` : label;

  const handles = (node: VNode): { key: string; x: number; y: number }[] => [
    { key: 'b', x: node.x + NODE_W / 2, y: node.y + NODE_H },
    { key: 'l', x: node.x, y: node.y + NODE_H / 2 },
    { key: 'r', x: node.x + NODE_W, y: node.y + NODE_H / 2 },
    { key: 't', x: node.x + NODE_W / 2, y: node.y }
  ];
</script>

<svelte:window
  onkeydown={onWindowKeydown}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp} />

<div class="flex h-full min-h-80 flex-col select-none">
  <div class="flex flex-wrap items-center gap-1.5 border-b p-1.5 text-xs">
    <Button size="sm" variant="outline" data-testid={TID.visualAddNode} onclick={addNodeStaggered}>
      <AddIcon /> 节点
    </Button>
    <Button size="sm" variant="outline" onclick={toggleDirection}>
      方向 {graph.direction}
    </Button>
    <Button size="sm" variant="outline" disabled={!selectedNode} onclick={cycleShape}>
      形状: {selectedNode ? SHAPE_NAMES[selectedNode.shape] : '—'}
    </Button>
    <Button size="sm" variant="outline" disabled={!selectedEdge} onclick={cycleLink}>
      线型: {selectedEdge ? LINK_NAMES[selectedEdge.type] : '—'}
    </Button>
    <Button
      size="sm"
      variant="outline"
      disabled={!selected}
      onclick={deleteSelected}
      title="Delete 键亦可删除">
      <DeleteIcon /> 删除
    </Button>
    <Button size="sm" variant="outline" onclick={autoLayout} title="自动整理节点位置">
      <AutoFixIcon /> 整理布局
    </Button>
    <Button
      size="sm"
      variant="outline"
      onclick={() => loadFromCode(true)}
      title="从当前代码重新载入">
      <ResetIcon /> 从代码重载
    </Button>
    <Button size="sm" variant="outline" onclick={clearAll} data-testid={TID.visualClear}>
      <ClearIcon /> 清空
    </Button>
    <span class="ml-auto text-muted-foreground">
      {graph.nodes.length} 节点 · {graph.edges.length} 连线
    </span>
  </div>

  <div
    bind:this={canvasEl}
    class="min-h-64 flex-1 overflow-auto"
    data-testid={TID.visualCanvas}
    style="background-image: radial-gradient(circle, var(--border) 1px, transparent 1px); background-size: 20px 20px;">
    <div class="relative" style="width:{CANVAS_W}px; height:{CANVAS_H}px;">
      <svg
        bind:this={svgEl}
        class="absolute inset-0 block h-full w-full"
        style="touch-action: none;"
        ondblclick={(e) => {
          const p = svgPoint(e);
          addNodeAt(p.x, p.y);
        }}
        role="application"
        aria-label="可视化画布">
        <defs>
          <marker id="ve-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--foreground)"></path>
          </marker>
        </defs>
        <rect width={CANVAS_W} height={CANVAS_H} fill="transparent"></rect>

        {#each graph.edges as edge (edge.id)}
          {@const geom = edgeGeom(edge)}
          {#if geom}
            {@const selectedEdgeId = selected?.kind === 'edge' ? selected.id : undefined}
            <path
              role="button"
              tabindex="0"
              d="M{geom.x1},{geom.y1} L{geom.x2},{geom.y2}"
              fill="none"
              stroke="transparent"
              stroke-width="14"
              style="pointer-events: stroke; cursor: pointer;"
              onclick={(e) => {
                e.stopPropagation();
                selected = { id: edge.id, kind: 'edge' };
              }}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  selected = { id: edge.id, kind: 'edge' };
                }
              }}
              ondblclick={(e) => {
                e.stopPropagation();
                selected = { id: edge.id, kind: 'edge' };
                startEdit(edge);
              }}></path>
            <path
              d="M{geom.x1},{geom.y1} L{geom.x2},{geom.y2}"
              fill="none"
              stroke={selectedEdgeId === edge.id ? 'var(--primary)' : 'var(--foreground)'}
              stroke-width={selectedEdgeId === edge.id ? 2.5 : 1.5}
              stroke-dasharray={edge.type === 'dashed' ? '6 4' : undefined}
              marker-end={edge.type === 'arrow' ? 'url(#ve-arrow)' : undefined}
              style="pointer-events: none;"></path>
            {#if edge.label}
              <text
                x={(geom.x1 + geom.x2) / 2}
                y={(geom.y1 + geom.y2) / 2 - 6}
                fill="var(--foreground)"
                font-size="11"
                text-anchor="middle"
                style="pointer-events: none; paint-order: stroke; stroke: var(--background); stroke-width: 4px;">
                {displayLabel(edge.label)}
              </text>
            {/if}
          {/if}
        {/each}

        {#if linkPreview}
          <path
            d="M{linkPreview.x1},{linkPreview.y1} L{linkPreview.x2},{linkPreview.y2}"
            fill="none"
            stroke="var(--primary)"
            stroke-dasharray="5 4"
            stroke-width="2"></path>
        {/if}

        {#each graph.nodes as node (node.id)}
          {@const isSelected = selected?.kind === 'node' && selected.id === node.id}
          <g
            role="button"
            tabindex="-1"
            style="cursor: move;"
            onpointerdown={(e) => onNodePointerDown(e, node)}
            ondblclick={(e) => {
              e.stopPropagation();
              startEdit(node);
            }}>
            {#if node.shape === 'diamond'}
              <polygon
                points="{node.x + NODE_W / 2},{node.y} {node.x + NODE_W},{node.y +
                  NODE_H / 2} {node.x + NODE_W / 2},{node.y + NODE_H} {node.x},{node.y +
                  NODE_H / 2}"
                fill="var(--background)"
                stroke={isSelected ? 'var(--primary)' : 'var(--border)'}
                stroke-width={isSelected ? 2.5 : 1.5}></polygon>
            {:else}
              <rect
                height={NODE_H}
                rx={node.shape === 'stadium' ? NODE_H / 2 : node.shape === 'round' ? 12 : 4}
                width={NODE_W}
                x={node.x}
                y={node.y}
                fill="var(--background)"
                stroke={isSelected ? 'var(--primary)' : 'var(--border)'}
                stroke-width={isSelected ? 2.5 : 1.5}></rect>
            {/if}
            <text
              x={node.x + NODE_W / 2}
              y={node.y + NODE_H / 2 + 4}
              fill="var(--foreground)"
              font-size="12"
              text-anchor="middle"
              style="pointer-events: none;">
              {displayLabel(node.label || node.id)}
            </text>
          </g>
          {#if isSelected}
            {#each handles(node) as handle (handle.key)}
              <circle
                role="button"
                tabindex="-1"
                cx={handle.x}
                cy={handle.y}
                r="5"
                fill="var(--primary)"
                style="cursor: crosshair;"
                onpointerdown={(e) => onHandlePointerDown(e, node)}></circle>
            {/each}
          {/if}
        {/each}

        {#if graph.nodes.length === 0}
          <text
            x={CANVAS_W / 2}
            y={80}
            fill="var(--muted-foreground)"
            font-size="14"
            text-anchor="middle">
            双击画布添加节点；拖动节点边缘圆点创建连线；双击节点/连线修改文字
          </text>
        {/if}
      </svg>

      {#if editing}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          class="absolute z-10 w-44 rounded border bg-background px-1 py-0.5 text-xs text-foreground"
          style="left: {editing.x - 88}px; top: {editing.y - 12}px;"
          bind:value={editing.label}
          autofocus
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') editing = undefined;
          }}
          onblur={commitEdit} />
      {/if}
    </div>
  </div>

  {#if showCode}
    <div class="flex-none border-t">
      <button
        class="flex w-full items-center justify-between px-2 py-1 text-xs text-muted-foreground"
        onclick={() => (showCode = !showCode)}>
        <span>生成的代码（实时同步到预览与编辑器）</span>
        <span>{showCode ? '▾' : '▸'}</span>
      </button>
      <pre
        data-testid={TID.visualCodeOut}
        class="max-h-32 overflow-auto bg-muted/50 p-2 font-mono text-xs whitespace-pre-wrap">{generated}</pre>
    </div>
  {/if}
</div>
