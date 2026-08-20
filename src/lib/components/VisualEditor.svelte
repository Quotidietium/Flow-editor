<script lang="ts">
  import { Button } from '$/components/ui/button';
  import { Toggle } from '$/components/ui/toggle';
  import { TID } from '$/constants';
  import { notify } from '$/util/notify';
  import {
    applyPositions,
    COORD_KINDS,
    edgeAnchor,
    ER_CARDINALITIES,
    generateCode,
    KIND_SPECS,
    layoutGraph,
    nextEdgeId,
    nextNodeId,
    NODE_H,
    nodeSize,
    NODE_W,
    parseCode,
    sanitizePositions
  } from '$/util/visualEditor/model';
  import type { VEdge, VGraph, VLinkType, VNode, VShape } from '$/util/visualEditor/model';
  import { readJSON, writeJSON } from '$/util/persist.svelte';
  import { updateCode, validatedState } from '$/util/state.svelte';
  import AddIcon from '~icons/material-symbols/add-2-rounded';
  import DeleteIcon from '~icons/material-symbols/delete-outline-rounded';
  import AutoFixIcon from '~icons/material-symbols/auto-fix-normal-outline-rounded';
  import ResetIcon from '~icons/material-symbols/chrome-restore-outline-rounded';
  import ClearIcon from '~icons/material-symbols/clear-all-rounded';
  import StartIcon from '~icons/material-symbols/keyboard-double-arrow-right-rounded';
  import EndIcon from '~icons/material-symbols/keyboard-double-arrow-left-rounded';
  import DetailIcon from '~icons/material-symbols/notes-rounded';
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

  // Link types drawn with a dashed stroke, regardless of their arrowhead.
  const DASHED_LINKS = new Set<VLinkType>([
    'dashed',
    'dashedArrow',
    'dashedLine',
    'msgDashedFilled',
    'msgDashedOpen',
    'realization'
  ]);

  // Target-side arrowhead (SVG marker id) per link type; undefined = no head.
  const END_MARKERS: Partial<Record<VLinkType, string>> = {
    arrow: 've-arrow',
    dashed: 've-arrow',
    dashedArrow: 've-arrow-open',
    inheritance: 've-triangle',
    msgDashedFilled: 've-arrow',
    msgDashedOpen: 've-arrow-open',
    msgSolidFilled: 've-arrow',
    msgSolidOpen: 've-arrow-open',
    realization: 've-triangle'
  };

  // Source-side diamond markers (class composition/aggregation).
  const START_MARKERS: Partial<Record<VLinkType, string>> = {
    aggregation: 've-diamond-open',
    composition: 've-diamond'
  };

  let {
    active = true,
    compareOpen = false,
    onToggleCompare
  }: {
    active?: boolean;
    /** 对比模式开关（页面级状态：代码 | 画布 | Mermaid 预览 三栏）。 */
    compareOpen?: boolean;
    onToggleCompare?: () => void;
  } = $props();

  let graph = $state<VGraph>({ direction: 'TD', kind: 'flowchart', nodes: [], edges: [] });
  const kindSpec = $derived(KIND_SPECS[graph.kind ?? 'flowchart']);
  // List/series kinds (pie, packet, radar, …) have no edge syntax: the anchor
  // handles and link gestures are hidden so drawn edges cannot silently no-op.
  const canLink = $derived(kindSpec.canLink !== false);
  // Coordinate kinds (quadrant, wardley): node positions ARE the code — the
  // remembered-position overlay would fight the parse→generate coordinate
  // round-trip, so it is skipped entirely for them.
  const isCoordKind = $derived(COORD_KINDS.has(graph.kind ?? 'flowchart'));
  // Grouped-list kinds: adding an item while a group node is selected attaches
  // it to that group via a structural edge (journey 分组, kanban 列表, …).
  const AUTO_ATTACH_ROLES = new Set(['column', 'domain', 'period', 'section']);
  let selected = $state<{ id: string; kind: 'edge' | 'node' } | undefined>();
  let editing = $state<
    undefined | { id: string; kind: 'edge' | 'node'; label: string; x: number; y: number }
  >();
  let linking = $state<undefined | { cursor: { x: number; y: number }; source: string }>();
  let drag = $state<undefined | { id: string; offX: number; offY: number; moved: boolean }>();
  let showCode = $state(true);
  let editingDetail = $state(false);
  let detailDraft = $state('');
  let editingMeta = $state(false);
  let metaTitleDraft = $state('');
  let metaDrafts = $state<Record<string, string>>({});
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

  // Remembered canvas positions per node id. Mermaid source carries no
  // coordinates, so re-entering the visual tab would re-layout everything
  // (nodes visibly jumping back to auto-layout slots). The map is overlaid
  // on the auto layout by id: untouched nodes keep their placed positions
  // across mode switches, reloads and small external code edits, while new
  // ids fall back to their auto-layout slot. Module-level + localStorage:
  // the editor remounts on every tab switch but there is only one instance.
  const POSITIONS_KEY = 'visualEditorLayout';
  let rememberedPositions = sanitizePositions(readJSON(POSITIONS_KEY, null));
  const rememberPositions = (): void => {
    if (isCoordKind) {
      return; // coordinates live in the generated code itself
    }
    rememberedPositions = Object.fromEntries(
      graph.nodes.map((node) => [node.id, { x: node.x, y: node.y }] as const)
    );
    // Pathologically large graphs (thousands of nodes) would push a ~100KB+
    // JSON through a synchronous stringify+setItem on every drag release.
    // The in-memory map still serves this session's WYSIWYG; only the
    // persistence is skipped. Write frequency is one per committed gesture,
    // so normal diagrams never approach the cap.
    if (JSON.stringify(rememberedPositions).length > 100_000) {
      return;
    }
    writeJSON(POSITIONS_KEY, rememberedPositions);
  };

  const syncCode = (): void => {
    lastSyncedCode = generateCode(graph);
    rememberPositions();
    updateCode(lastSyncedCode, { updateDiagram: true });
  };

  const loadFromCode = (announce: boolean): void => {
    const parsed = parseCode(validatedState.current.code);
    if (parsed.ok) {
      const laid = layoutGraph(parsed.result.graph);
      const parsedKind = parsed.result.graph.kind ?? 'flowchart';
      graph = COORD_KINDS.has(parsedKind) ? laid : applyPositions(laid, rememberedPositions);
      rememberPositions();
      if (announce) {
        notify(
          parsed.result.skipped > 0
            ? `已从代码载入${kindLabel(parsed.result.graph.kind)}（跳过 ${parsed.result.skipped} 行不支持的语法）`
            : `已从代码载入${kindLabel(parsed.result.graph.kind)}`
        );
      }
    } else {
      graph = { direction: 'TD', kind: 'flowchart', nodes: [], edges: [] };
      rememberPositions();
      if (announce) {
        notify(
          '当前图类型暂不支持可视化编辑（仅 info 调试图无内容可编辑），已载入空白画布；绘制新图形将生成流程图，可用「从代码重载」恢复原代码'
        );
      }
    }
    lastSyncedCode = validatedState.current.code;
    selected = undefined;
    editing = undefined;
    editingDetail = false;
  };

  const kindLabel = (kind: VGraph['kind']): string => {
    const spec = kind ? KIND_SPECS[kind] : undefined;
    return spec ? `（${spec.label}）` : '';
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
    // Items added while a group node is selected attach to that group
    // (journey section, kanban column, timeline period, cynefin domain).
    const host = selected?.kind === 'node' ? nodeById.get(selected.id) : undefined;
    const defaultType = kindSpec.nodeTypes?.[0];
    const node: VNode = {
      id: nextNodeId(graph.nodes),
      label: '',
      role: defaultType?.role,
      roleData: defaultType?.data,
      shape: kindSpec.shapes[0] ?? 'rect',
      x: snap(x - NODE_W / 2),
      y: snap(y - NODE_H / 2)
    };
    graph.nodes.push(node);
    if (host && host.id !== node.id && host.role && AUTO_ATTACH_ROLES.has(host.role)) {
      graph.edges.push({
        id: nextEdgeId(graph.edges),
        source: host.id,
        target: node.id,
        type: 'line'
      });
    }
    selected = { id: node.id, kind: 'node' };
    startEdit(node);
  };

  const addNodeStaggered = (): void => {
    const n = graph.nodes.length;
    addNodeAt(80 + (n % 8) * (NODE_W + 40), 60 + Math.floor(n / 8) * (NODE_H + 40));
  };

  // stateDiagram pseudo nodes: only one start / one end dot can exist.
  const addSpecial = (kind: 'end' | 'start'): void => {
    const id = kind === 'start' ? '__start__' : '__end__';
    if (graph.nodes.some((node) => node.id === id)) {
      notify(kind === 'start' ? '起点已存在' : '终点已存在');
      return;
    }
    const y = kind === 'start' ? 60 : 60 + (NODE_H + 40) * 2;
    const node: VNode = {
      id,
      label: kind === 'start' ? '起点' : '终点',
      shape: 'rect',
      special: kind,
      x: snap(60),
      y
    };
    graph.nodes.push(node);
    selected = { id: node.id, kind: 'node' };
    syncCode();
  };

  const startEdit = (target: VNode | VEdge): void => {
    if ('special' in target && target.special) {
      return; // pseudo nodes have a fixed label
    }
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
    const shapes = kindSpec.shapes;
    const i = shapes.indexOf(selectedNode.shape);
    selectedNode.shape = shapes[(i + 1) % shapes.length] ?? shapes[0] ?? 'rect';
    syncCode();
  };

  const cycleLink = (): void => {
    if (!selectedEdge) return;
    const links = kindSpec.links;
    const i = links.findIndex((link) => link.type === selectedEdge.type);
    selectedEdge.type = links[(i + 1) % links.length]?.type ?? links[0]?.type ?? 'arrow';
    syncCode();
  };

  // ER crow's-foot cardinality presets, cycled like the link type.
  const cycleErCard = (): void => {
    if (!selectedEdge) return;
    const i = ER_CARDINALITIES.findIndex(
      (preset) => preset.cardL === selectedEdge?.cardL && preset.cardR === selectedEdge?.cardR
    );
    const preset = ER_CARDINALITIES[(i + 1) % ER_CARDINALITIES.length];
    if (preset) {
      selectedEdge.cardL = preset.cardL;
      selectedEdge.cardR = preset.cardR;
    }
    syncCode();
  };

  // Per-kind node type palette (C4 Person/System, journey task/section, …).
  const nodeTypeOf = (node: VNode) =>
    kindSpec.nodeTypes?.find(
      (t) => t.role === node.role && (t.data ?? undefined) === (node.roleData ?? undefined)
    );
  const cycleNodeType = (): void => {
    if (!selectedNode || !kindSpec.nodeTypes) return;
    const types = kindSpec.nodeTypes;
    const i = types.indexOf(nodeTypeOf(selectedNode) as (typeof types)[number]);
    const next = types[(i + 1) % types.length];
    if (next) {
      selectedNode.role = next.role;
      selectedNode.roleData = next.data;
      syncCode();
    }
  };

  const openMetaEditor = (): void => {
    metaTitleDraft = graph.title ?? '';
    metaDrafts = { ...(graph.meta ?? {}) };
    editingMeta = true;
  };

  const commitMeta = (): void => {
    graph.title = metaTitleDraft.trim() || undefined;
    const meta: Record<string, string> = {};
    for (const { key } of kindSpec.metaKeys ?? []) {
      const value = metaDrafts[key]?.trim();
      if (value) {
        meta[key] = value;
      }
    }
    graph.meta = Object.keys(meta).length > 0 ? meta : undefined;
    editingMeta = false;
    syncCode();
  };

  const openDetailEditor = (): void => {
    if (!selectedNode) return;
    detailDraft = selectedNode.detail ?? '';
    editingDetail = true;
  };

  const commitDetail = (): void => {
    if (selectedNode) {
      selectedNode.detail = detailDraft.trim() || undefined;
      syncCode();
    }
    editingDetail = false;
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
    graph = { direction: graph.direction, kind: graph.kind, nodes: [], edges: [] };
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
    if (!canLink) return;
    event.stopPropagation();
    linking = { cursor: svgPoint(event), source: node.id };
  };

  const nodeAt = (p: { x: number; y: number }): VNode | undefined =>
    graph.nodes.find((node) => {
      const size = nodeSize(node);
      return p.x >= node.x && p.x <= node.x + size.w && p.y >= node.y && p.y <= node.y + size.h;
    });

  // New edges use the kind's first palette link type; ER edges also seed the
  // default crow's-foot cardinality.
  const newEdge = (source: string, target: string): VEdge => {
    const edge: VEdge = {
      id: nextEdgeId(graph.edges),
      source,
      target,
      type: kindSpec.links[0]?.type ?? 'line'
    };
    if ((graph.kind ?? 'flowchart') === 'er') {
      edge.cardL = '||';
      edge.cardR = 'o{';
    }
    return edge;
  };

  // stateDiagram [*] syntax cannot express links back into the start dot or
  // out of the end dot (nor start->end); block them at creation time.
  const isBlockedStateLink = (sourceId: string, target: VNode): boolean => {
    if ((graph.kind ?? 'flowchart') !== 'state') {
      return false;
    }
    if (target.special === 'start') {
      return true;
    }
    if (sourceId === '__end__') {
      return true;
    }
    return sourceId === '__start__' && target.special === 'end';
  };

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
      if (
        canLink &&
        target &&
        target.id !== linking.source &&
        !isBlockedStateLink(linking.source, target)
      ) {
        const edge = newEdge(linking.source, target.id);
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

  // Focus on mount: more reliable than the autofocus attribute, which does
  // not steal focus when the click that opened the editor left focus on a
  // toolbar button (Enter would then re-trigger that button).
  const focusEditor = (el: HTMLElement): void => {
    el.focus();
  };

  const handles = (node: VNode): { key: string; x: number; y: number }[] => {
    const size = nodeSize(node);
    return [
      { key: 'b', x: node.x + size.w / 2, y: node.y + size.h },
      { key: 'l', x: node.x, y: node.y + size.h / 2 },
      { key: 'r', x: node.x + size.w, y: node.y + size.h / 2 },
      { key: 't', x: node.x + size.w / 2, y: node.y }
    ];
  };
</script>

<svelte:window
  onkeydown={onWindowKeydown}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp} />

<div class="flex h-full min-h-80 flex-col select-none">
  <div class="flex flex-wrap items-center gap-1.5 border-b p-1.5 text-xs">
    <Button size="sm" variant="outline" data-testid={TID.visualAddNode} onclick={addNodeStaggered}>
      <AddIcon />
      {kindSpec.newNode}
    </Button>
    {#if kindSpec.startEnd}
      <Button
        size="sm"
        variant="outline"
        onclick={() => addSpecial('start')}
        title="添加起点（[*]）">
        <StartIcon /> 起点
      </Button>
      <Button size="sm" variant="outline" onclick={() => addSpecial('end')} title="添加终点（[*]）">
        <EndIcon /> 终点
      </Button>
    {/if}
    {#if kindSpec.direction}
      <Button size="sm" variant="outline" onclick={toggleDirection}>
        方向 {graph.direction}
      </Button>
    {/if}
    {#if kindSpec.shapes.length > 1}
      <Button size="sm" variant="outline" disabled={!selectedNode} onclick={cycleShape}>
        形状: {selectedNode && !selectedNode.special ? SHAPE_NAMES[selectedNode.shape] : '—'}
      </Button>
    {/if}
    {#if kindSpec.nodeTypes && kindSpec.nodeTypes.length > 0}
      <Button
        size="sm"
        variant="outline"
        data-testid={TID.visualNodeType}
        disabled={!selectedNode}
        onclick={cycleNodeType}>
        类型: {selectedNode
          ? (nodeTypeOf(selectedNode)?.name ?? selectedNode.roleData ?? selectedNode.role ?? '—')
          : '—'}
      </Button>
    {/if}
    {#if kindSpec.hasTitle || (kindSpec.metaKeys ?? []).length > 0}
      <Button size="sm" variant="outline" data-testid={TID.visualMeta} onclick={openMetaEditor}>
        <DetailIcon /> 属性
      </Button>
    {/if}
    {#if kindSpec.links.length > 1}
      <Button size="sm" variant="outline" disabled={!selectedEdge} onclick={cycleLink}>
        线型: {selectedEdge
          ? (kindSpec.links.find((link) => link.type === selectedEdge?.type)?.name ?? '—')
          : '—'}
      </Button>
    {/if}
    {#if (graph.kind ?? 'flowchart') === 'er'}
      <Button size="sm" variant="outline" disabled={!selectedEdge} onclick={cycleErCard}>
        基数: {selectedEdge ? `${selectedEdge.cardL ?? '||'}--${selectedEdge.cardR ?? 'o{'}` : '—'}
      </Button>
    {/if}
    {#if kindSpec.detail}
      <Button size="sm" variant="outline" disabled={!selectedNode} onclick={openDetailEditor}>
        <DetailIcon /> 编辑内容
      </Button>
    {/if}
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
    <Toggle
      pressed={compareOpen}
      size="sm"
      data-testid={TID.visualPreviewToggle}
      title="对比模式：代码 | 可视化 | Mermaid 预览 三栏对照"
      aria-label="对比模式"
      onclick={(e) => {
        e.preventDefault();
        onToggleCompare?.();
      }}>
      <DetailIcon /> 对比
    </Toggle>
    <Button size="sm" variant="outline" onclick={clearAll} data-testid={TID.visualClear}>
      <ClearIcon /> 清空
    </Button>
    <span class="ml-auto text-muted-foreground">
      {kindSpec.label} · {graph.nodes.length} 节点 · {graph.edges.length} 连线
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
          <marker
            id="ve-arrow-open"
            markerHeight="9"
            markerWidth="9"
            orient="auto"
            refX="7"
            refY="4.5">
            <path d="M1,1 L7,4.5 L1,8" fill="none" stroke="var(--foreground)" stroke-width="1.3"
            ></path>
          </marker>
          <marker
            id="ve-triangle"
            markerHeight="10"
            markerWidth="10"
            orient="auto"
            refX="8"
            refY="5">
            <path
              d="M1,1 L9,5 L1,9 Z"
              fill="var(--background)"
              stroke="var(--foreground)"
              stroke-width="1.2"></path>
          </marker>
          <marker
            id="ve-diamond"
            markerHeight="9"
            markerWidth="11"
            orient="auto-start-reverse"
            refX="1"
            refY="4.5">
            <path d="M1,4.5 L5.5,1 L10,4.5 L5.5,8 Z" fill="var(--foreground)"></path>
          </marker>
          <marker
            id="ve-diamond-open"
            markerHeight="9"
            markerWidth="11"
            orient="auto-start-reverse"
            refX="1"
            refY="4.5">
            <path
              d="M1,4.5 L5.5,1 L10,4.5 L5.5,8 Z"
              fill="var(--background)"
              stroke="var(--foreground)"
              stroke-width="1.2"></path>
          </marker>
        </defs>
        <rect width={CANVAS_W} height={CANVAS_H} fill="transparent"></rect>

        {#each graph.edges as edge (edge.id)}
          {@const geom = edgeGeom(edge)}
          {#if geom}
            {@const selectedEdgeId = selected?.kind === 'edge' ? selected.id : undefined}
            {@const endMarker = END_MARKERS[edge.type]}
            {@const startMarker = START_MARKERS[edge.type]}
            <path
              role="button"
              tabindex="0"
              data-edge-id={edge.id}
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
              stroke-dasharray={DASHED_LINKS.has(edge.type) ? '6 4' : undefined}
              marker-end={endMarker ? `url(#${endMarker})` : undefined}
              marker-start={startMarker ? `url(#${startMarker})` : undefined}
              style="pointer-events: none;"></path>
            {#if edge.cardL || edge.cardR}
              {#if edge.cardL}
                <text
                  x={geom.x1 + (geom.x2 - geom.x1) * 0.15}
                  y={geom.y1 + (geom.y2 - geom.y1) * 0.15 - 4}
                  fill="var(--foreground)"
                  font-size="9"
                  text-anchor="middle"
                  style="pointer-events: none;">
                  {edge.cardL}
                </text>
              {/if}
              {#if edge.cardR}
                <text
                  x={geom.x1 + (geom.x2 - geom.x1) * 0.85}
                  y={geom.y1 + (geom.y2 - geom.y1) * 0.85 - 4}
                  fill="var(--foreground)"
                  font-size="9"
                  text-anchor="middle"
                  style="pointer-events: none;">
                  {edge.cardR}
                </text>
              {/if}
            {/if}
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
          {@const size = nodeSize(node)}
          <g
            role="button"
            tabindex="-1"
            data-node-id={node.id}
            style="cursor: move;"
            onpointerdown={(e) => onNodePointerDown(e, node)}
            ondblclick={(e) => {
              e.stopPropagation();
              startEdit(node);
            }}>
            {#if node.special}
              {#if node.special === 'start'}
                <circle
                  cx={node.x + size.w / 2}
                  cy={node.y + size.h / 2}
                  r={11}
                  fill="var(--foreground)"></circle>
              {:else}
                <circle
                  cx={node.x + size.w / 2}
                  cy={node.y + size.h / 2}
                  r={11}
                  fill="var(--background)"
                  stroke={isSelected ? 'var(--primary)' : 'var(--foreground)'}
                  stroke-width={isSelected ? 2.5 : 1.5}></circle>
                <circle
                  cx={node.x + size.w / 2}
                  cy={node.y + size.h / 2}
                  r={5.5}
                  fill="var(--foreground)"></circle>
              {/if}
              <text
                x={node.x + size.w / 2}
                y={node.y + size.h + 11}
                fill="var(--muted-foreground)"
                font-size="9"
                text-anchor="middle"
                style="pointer-events: none;">
                {node.label}
              </text>
            {:else if node.shape === 'diamond'}
              <polygon
                points="{node.x + size.w / 2},{node.y} {node.x + size.w},{node.y +
                  size.h / 2} {node.x + size.w / 2},{node.y + size.h} {node.x},{node.y +
                  size.h / 2}"
                fill="var(--background)"
                stroke={isSelected ? 'var(--primary)' : 'var(--border)'}
                stroke-width={isSelected ? 2.5 : 1.5}></polygon>
            {:else}
              <rect
                height={size.h}
                rx={node.shape === 'stadium' ? size.h / 2 : node.shape === 'round' ? 12 : 4}
                width={size.w}
                x={node.x}
                y={node.y}
                fill="var(--background)"
                stroke={isSelected ? 'var(--primary)' : 'var(--border)'}
                stroke-width={isSelected ? 2.5 : 1.5}></rect>
            {/if}
            {#if !node.special}
              {#if node.role}
                <text
                  x={node.x + size.w / 2}
                  y={node.y - 4}
                  fill="var(--muted-foreground)"
                  font-size="8"
                  text-anchor="middle"
                  style="pointer-events: none;">
                  {node.roleData ?? node.role}
                </text>
              {/if}
              <text
                x={node.x + size.w / 2}
                y={node.y + NODE_H / 2 + 4}
                fill="var(--foreground)"
                font-size="12"
                text-anchor="middle"
                style="pointer-events: none;">
                {displayLabel(node.label || node.id)}
              </text>
              {#if node.detail}
                {#each node.detail.split('\n').slice(0, 5) as line, i (i)}
                  <text
                    x={node.x + size.w / 2}
                    y={node.y + NODE_H + 11 + i * 13}
                    fill="var(--muted-foreground)"
                    font-size="9"
                    text-anchor="middle"
                    style="pointer-events: none;">
                    {displayLabel(line)}
                  </text>
                {/each}
              {/if}
            {/if}
          </g>
          {#if isSelected && canLink}
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
            双击画布添加{kindSpec.newNode}；拖动节点边缘圆点创建连线；双击节点/连线修改文字
          </text>
        {/if}
      </svg>

      {#if editing}
        <input
          type="text"
          class="absolute z-10 w-44 rounded border bg-background px-1 py-0.5 text-xs text-foreground"
          style="left: {editing.x - 88}px; top: {editing.y - 12}px;"
          bind:value={editing.label}
          use:focusEditor
          onkeydown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') editing = undefined;
          }}
          onblur={commitEdit} />
      {/if}

      {#if editingMeta}
        <div class="absolute top-2 left-2 z-10 w-64 rounded border bg-background p-2 shadow">
          <div class="mb-1 text-xs text-muted-foreground">图表属性</div>
          {#if kindSpec.hasTitle}
            <label class="mb-1 block text-xs" for="ve-meta-title">标题</label>
            <input
              id="ve-meta-title"
              class="mb-2 w-full rounded border border-input bg-background p-1 text-xs text-foreground"
              bind:value={metaTitleDraft} />
          {/if}
          {#each kindSpec.metaKeys ?? [] as metaKey (metaKey.key)}
            <label class="mb-1 block text-xs" for="ve-meta-{metaKey.key}">{metaKey.label}</label>
            <input
              id="ve-meta-{metaKey.key}"
              class="mb-2 w-full rounded border border-input bg-background p-1 text-xs text-foreground"
              bind:value={metaDrafts[metaKey.key]} />
          {/each}
          <div class="mt-1 flex justify-end gap-1">
            <Button size="sm" variant="ghost" onclick={() => (editingMeta = false)}>取消</Button>
            <Button size="sm" onclick={commitMeta}>保存</Button>
          </div>
        </div>
      {/if}

      {#if editingDetail && selectedNode}
        <div class="absolute top-2 left-2 z-10 w-64 rounded border bg-background p-2 shadow">
          <div class="mb-1 text-xs text-muted-foreground">
            编辑「{displayLabel(selectedNode.label || selectedNode.id)}」的内容（每行一条）
          </div>
          <textarea
            data-testid={TID.visualDetailEditor}
            bind:value={detailDraft}
            class="h-24 w-full rounded border border-input bg-background p-1 font-mono text-xs text-foreground"
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === 'Escape') editingDetail = false;
            }}></textarea>
          <div class="mt-1 flex justify-end gap-1">
            <Button size="sm" variant="ghost" onclick={() => (editingDetail = false)}>取消</Button>
            <Button size="sm" onclick={commitDetail}>保存</Button>
          </div>
        </div>
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
