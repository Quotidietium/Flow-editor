<script lang="ts">
  import { Button, buttonVariants } from '$/components/ui/button';
  import * as Dialog from '$/components/ui/dialog';
  import { Toggle } from '$/components/ui/toggle';
  import BoardEditor from '$/components/visual/BoardEditor.svelte';
  import GitEditor from '$/components/visual/GitEditor.svelte';
  import OutlineEditor from '$/components/visual/OutlineEditor.svelte';
  import SequenceEditor from '$/components/visual/SequenceEditor.svelte';
  import SheetEditor from '$/components/visual/SheetEditor.svelte';
  import { TID } from '$/constants';
  import { notify } from '$/util/notify';
  import {
    alignSelection,
    alignmentGuides,
    autoConnect,
    distributeSelection,
    nodesInRect,
    remintIds,
    snapshotGraph
  } from '$/util/visualEditor/interaction';
  import type {
    AlignMode,
    ClipboardPayload,
    Direction,
    DistributeAxis,
    GuideLine
  } from '$/util/visualEditor/interaction';
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
    clampPosition,
    sanitizePositions
  } from '$/util/visualEditor/model';
  import type { VEdge, VGraph, VLinkType, VNode, VShape } from '$/util/visualEditor/model';
  import { pointOnRoute, routeEdge } from '$/util/visualEditor/routing';
  import type { EdgeStyle } from '$/util/visualEditor/routing';
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
  import HelpIcon from '~icons/material-symbols/help-outline-rounded';
  import UndoIcon from '~icons/material-symbols/undo-rounded';
  import RedoIcon from '~icons/material-symbols/redo-rounded';
  import { onMount } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';

  const CANVAS_W = 3000;
  const CANVAS_H = 2000;
  const SNAP = 10;
  const UNDO_LIMIT = 50;

  const SHAPE_NAMES: Record<VShape, string> = {
    diamond: '菱形',
    rect: '矩形',
    round: '圆角',
    stadium: '胶囊'
  };

  const ALIGN_LABELS: Record<AlignMode, string> = {
    bottom: '底端对齐',
    centerX: '垂直居中',
    centerY: '水平居中',
    left: '左对齐',
    right: '右对齐',
    top: '顶端对齐'
  };

  // 快捷键帮助对话框内容（与 onWindowKeydown 实际实现一一对应）。
  const SHORTCUT_GROUPS: { group: string; items: [keys: string, desc: string][] }[] = [
    {
      group: '画布',
      items: [
        ['双击空白', '新建节点'],
        ['双击节点 / 连线（或 F2）', '编辑文字'],
        ['从锚点拖拽', '创建连线（拖到空白松手 = 新建并连接）'],
        ['方向箭头', '在该方向快速添加并连接']
      ]
    },
    {
      group: '选择',
      items: [
        ['Shift / Ctrl + 点击', '加选'],
        ['Shift + 拖拽', '框选（Ctrl + 拖拽追加）'],
        ['Ctrl + A', '全选'],
        ['Esc', '取消选择 / 连线 / 菜单']
      ]
    },
    {
      group: '编辑',
      items: [
        ['Delete / Backspace', '删除选中'],
        ['Ctrl + C / X / V', '复制 / 剪切 / 粘贴'],
        ['Ctrl + D', '原位复制'],
        ['Ctrl + 拖拽', '克隆拖放'],
        ['Alt + Shift + 方向键', '克隆并连接'],
        ['方向键（Shift 加速）', '微移 1px（10px）'],
        ['右键 / Shift + F10', '上下文菜单']
      ]
    },
    {
      group: '历史与视图',
      items: [
        ['Ctrl + Z', '撤销'],
        ['Ctrl + Shift + Z / Ctrl + Y', '重做'],
        ['空白拖拽 / 空格 + 拖拽', '平移画布'],
        ['Ctrl + 滚轮 / 双指捏合', '缩放画布'],
        ['Ctrl + H', '复位视图']
      ]
    },
    {
      group: '搜索',
      items: [
        ['Ctrl+F', '聚焦画布搜索框'],
        ['搜索框输入', '命中保持 / 非命中降透明'],
        ['Enter', '居中并选中首个命中'],
        ['Esc', '清空搜索']
      ]
    },
    {
      group: '专用编辑器',
      items: [
        ['大纲：Enter / Tab / Shift+Tab', '同级 / 缩进 / 反缩进'],
        ['看板：拖拽卡片', '换列 / 列内排序'],
        ['时序 / Git：上下移动行', '调整次序'],
        ['表单输入框 Enter', '直接提交（免挪手点按钮）']
      ]
    }
  ];

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
  // Dedicated editor views (board / sheet / outline / sequence / git) replace
  // the free canvas for kinds whose semantics are not node-link; the canvas
  // toolbar cluster and pan/zoom machinery only apply in canvas mode.
  const canvasView = $derived(kindSpec.view === undefined);
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

  const nodeById = $derived(new Map(graph.nodes.map((node) => [node.id, node] as const)));
  const edgeById = $derived(new Map(graph.edges.map((edge) => [edge.id, edge] as const)));
  const generated = $derived(generateCode(graph));

  // Multi-selection (draw.io style): the last picked entry is the "primary"
  // target the single-item toolbar buttons operate on.
  interface Selection {
    id: string;
    kind: 'edge' | 'node';
  }
  let selected = $state<Selection[]>([]);
  const selectedNodeIds = $derived(
    new Set(selected.filter((s) => s.kind === 'node').map((s) => s.id))
  );
  const selectedEdgeIds = $derived(
    new Set(selected.filter((s) => s.kind === 'edge').map((s) => s.id))
  );
  const selectedNodes = $derived(graph.nodes.filter((n) => selectedNodeIds.has(n.id)));

  // 画布节点搜索：大流程图定位节点全靠拖屏（Board/Sequence/Outline/Sheet
  // 列表类编辑器已有过滤框，画布类同款思路）。命中保持原样、非命中降为
  // 25% 不透明度；Esc 清空；只影响显示不动数据。
  let canvasQuery = $state('');
  // Ctrl+F 聚焦目标（bind:this）
  let canvasSearchEl: HTMLInputElement | undefined = $state();
  const canvasQueryLower = $derived(canvasQuery.trim().toLowerCase());
  const canvasHitIds = $derived(
    new Set(
      canvasQueryLower === ''
        ? []
        : graph.nodes
            .filter(
              (n) =>
                n.label.toLowerCase().includes(canvasQueryLower) ||
                n.id.toLowerCase().includes(canvasQueryLower)
            )
            .map((n) => n.id)
    )
  );
  const canvasHitCount = $derived(canvasQueryLower === '' ? 0 : canvasHitIds.size);

  // 搜索 Enter：滚动居中首个命中并选中（定位 = 看见 + 到达），
  // 选中后形状/类型/属性等节点操作即刻可用。
  const centerOnNode = (node: VNode): void => {
    if (!canvasEl) {
      return;
    }
    const size = nodeSize(node);
    canvasEl.scrollTo({
      behavior: 'smooth',
      left: (node.x + size.w / 2) * view.k - canvasEl.clientWidth / 2,
      top: (node.y + size.h / 2) * view.k - canvasEl.clientHeight / 2
    });
    selected = [{ id: node.id, kind: 'node' }];
  };
  const primaryNodeKey = $derived(
    [...selected].reverse().find((s) => s.kind === 'node' && nodeById.has(s.id))
  );
  const primaryEdgeKey = $derived(
    [...selected].reverse().find((s) => s.kind === 'edge' && edgeById.has(s.id))
  );
  const selectedNode = $derived(primaryNodeKey ? nodeById.get(primaryNodeKey.id) : undefined);
  const selectedEdge = $derived(primaryEdgeKey ? edgeById.get(primaryEdgeKey.id) : undefined);

  let editing = $state<
    undefined | { id: string; kind: 'edge' | 'node'; label: string; x: number; y: number }
  >();
  let linking = $state<undefined | { cursor: { x: number; y: number }; source: string }>();
  let drag = $state<
    | undefined
    | {
        batch: SvelteMap<string, { offX: number; offY: number }>;
        id: string;
        lastX: number;
        lastY: number;
        moved: boolean;
        offX: number;
        offY: number;
        preState: VGraph;
      }
  >();
  let marquee = $state<
    undefined | { additive: boolean; x0: number; x1: number; y0: number; y1: number }
  >();
  let guides = $state<GuideLine[]>([]);
  let menu = $state<
    | undefined
    | {
        clientX: number;
        clientY: number;
        submenu: undefined | string;
        target: { id?: string; kind: 'canvas' | 'edge' | 'node' };
      }
  >();
  // Internal clipboard (draw.io scope: shapes + connectors between them).
  let clipboard = $state<ClipboardPayload | undefined>(undefined);
  // 插入 ▾ stencil list (nodeTypes × shapes per kind) and 整理 ▾ layout menu.
  let insertOpen = $state<undefined | { x: number; y: number }>(undefined);
  // C4 等类型多达 25 种图元：面板内搜索过滤，关闭时重置。
  let insertQuery = $state('');
  $effect(() => {
    if (!insertOpen) {
      insertQuery = '';
    }
  });
  const filteredInsertShapes = $derived.by(() => {
    const shapes = kindSpec.shapes ?? [];
    const query = insertQuery.trim().toLowerCase();
    if (!query) {
      return shapes;
    }
    return shapes.filter(
      (shape) => SHAPE_NAMES[shape].includes(query) || shape.toLowerCase().includes(query)
    );
  });
  const filteredInsertTypes = $derived.by(() => {
    const types = kindSpec.nodeTypes ?? [];
    const query = insertQuery.trim().toLowerCase();
    if (!query) {
      return types;
    }
    return types.filter(
      (nodeType) =>
        nodeType.name.toLowerCase().includes(query) || nodeType.role.toLowerCase().includes(query)
    );
  });
  let layoutMenuOpen = $state(false);
  let helpOpen = $state(false);
  // 代码面板折叠状态跨会话记忆（收起=纯画布工作法），与卡片偏好同款
  const CODE_PANE_KEY = 'visualCodePane';
  let showCode = $state(readJSON<boolean>(CODE_PANE_KEY, true));
  $effect(() => {
    writeJSON(CODE_PANE_KEY, showCode);
  });
  let editingDetail = $state(false);
  let detailDraft = $state('');
  let editingMeta = $state(false);
  let metaTitleDraft = $state('');
  let metaDrafts = $state<Record<string, string>>({});
  let svgEl: SVGSVGElement | undefined = $state();
  let canvasEl: HTMLDivElement | undefined = $state();

  // Undo/redo: whole-graph snapshots at committed-gesture boundaries. Text
  // diffs would also revert mermaid's legitimate round-trip normalizations.
  let undoStack = $state<VGraph[]>([]);
  let redoStack = $state<VGraph[]>([]);

  const pushUndo = (): void => {
    undoStack = [...undoStack.slice(-(UNDO_LIMIT - 1)), snapshotGraph(graph)];
    redoStack = [];
  };

  // Single mutation gateway for the dedicated editor views: snapshot for
  // undo, mutate, then publish through the state gateway.
  const commit = (mutate: () => void): void => {
    pushUndo();
    mutate();
    syncCode();
  };

  const restore = (state: VGraph): void => {
    graph = state;
    const ids = new Set(graph.nodes.map((n) => n.id));
    const edgeIds = new Set(graph.edges.map((e) => e.id));
    selected = selected.filter(
      (s) => (s.kind === 'node' && ids.has(s.id)) || (s.kind === 'edge' && edgeIds.has(s.id))
    );
    syncCode();
  };

  const undo = (): void => {
    const prev = undoStack.at(-1);
    if (!prev) {
      return;
    }
    undoStack = undoStack.slice(0, -1);
    redoStack = [...redoStack, snapshotGraph(graph)];
    restore(prev);
  };

  const redo = (): void => {
    const next = redoStack.at(-1);
    if (!next) {
      return;
    }
    redoStack = redoStack.slice(0, -1);
    undoStack = [...undoStack, snapshotGraph(graph)];
    restore(next);
  };

  // Cached svg rect for pointer-coordinate math: reading getBoundingClientRect
  // on every pointermove interleaves layout reads with the drag's attribute
  // writes (forced synchronous layout per move). Cached per gesture and
  // invalidated when the canvas scrolls mid-gesture.
  let svgRect: DOMRect | undefined;

  // Canvas viewport: CSS-scale zoom on the world content + programmatic
  // scroll panning (blank-drag / space-drag / middle-drag), like every
  // office canvas. `moved` distinguishes a pan gesture from a blank click
  // (which clears the selection on pointerup).
  let view = $state({ k: 1 });
  let panning = $state<undefined | { lastX: number; lastY: number; moved: boolean }>();
  let resize = $state<
    | undefined
    | {
        corner: 'ne' | 'nw' | 'se' | 'sw';
        h0: number;
        id: string;
        preState: VGraph;
        w0: number;
        x: number;
        y: number;
      }
  >();
  let spaceDown = false;

  const ZOOM_MIN = 0.4;
  const ZOOM_MAX = 2.5;

  const zoomAt = (clientX: number, clientY: number, factor: number): void => {
    if (!canvasEl) {
      return;
    }
    const k0 = view.k;
    const k1 = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k0 * factor));
    if (k1 === k0) {
      return;
    }
    const box = canvasEl.getBoundingClientRect();
    // Keep the world point under the pointer stationary while zooming.
    const worldX = (canvasEl.scrollLeft + clientX - box.left) / k0;
    const worldY = (canvasEl.scrollTop + clientY - box.top) / k0;
    view = { k: k1 };
    canvasEl.scrollLeft = worldX * k1 - (clientX - box.left);
    canvasEl.scrollTop = worldY * k1 - (clientY - box.top);
  };

  const resetView = (): void => {
    view = { k: 1 };
    if (canvasEl) {
      canvasEl.scrollLeft = 0;
      canvasEl.scrollTop = 0;
    }
  };

  const onCanvasWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey && !event.metaKey) {
      return; // plain wheel keeps scrolling the container
    }
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.1 : 1 / 1.1);
  };

  // 触屏捏合缩放：移动端没有 ctrl+滚轮。双指距离比折算目标倍率，
  // 锚点取双指中心（svg 已有 touch-action:none，浏览器不抢手势，
  // 无需 preventDefault，passive 监听即可）。
  let pinch: { d0: number; k0: number } | undefined;
  const touchDistance = (event: TouchEvent): number => {
    const a = event.touches.item(0);
    const b = event.touches.item(1);
    if (!a || !b) {
      return 1;
    }
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const onCanvasTouchStart = (event: TouchEvent): void => {
    if (event.touches.length === 2) {
      pinch = { d0: touchDistance(event), k0: view.k };
    }
  };
  const onCanvasTouchMove = (event: TouchEvent): void => {
    if (!pinch || event.touches.length !== 2) {
      return;
    }
    const a = event.touches.item(0);
    const b = event.touches.item(1);
    if (!a || !b || pinch.d0 === 0) {
      return;
    }
    const targetK = pinch.k0 * (touchDistance(event) / pinch.d0);
    zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, targetK / view.k);
  };
  const onCanvasTouchEnd = (): void => {
    pinch = undefined;
  };

  // Last code this editor produced or parsed; used to detect external edits
  // (in the Code tab) so switching back to Visual reloads them.
  let lastSyncedCode = '';

  const svgPoint = (event: PointerEvent | MouseEvent): { x: number; y: number } => {
    if (!svgRect) {
      svgRect = svgEl?.getBoundingClientRect();
    }
    return svgRect
      ? {
          x: (event.clientX - svgRect.left) / view.k,
          y: (event.clientY - svgRect.top) / view.k
        }
      : { x: 0, y: 0 };
  };

  const snap = (value: number): number => Math.round(value / SNAP) * SNAP;

  const sanitizeSizes = (raw: unknown): Record<string, { h: number; w: number }> => {
    if (typeof raw !== 'object' || raw === null) {
      return {};
    }
    const clean: Record<string, { h: number; w: number }> = {};
    for (const [id, value] of Object.entries(raw)) {
      if (typeof value !== 'object' || value === null) {
        continue;
      }
      const { w, h } = value as { h?: unknown; w?: unknown };
      // Untrusted storage: finite AND bounded — an inflated w/h (1e300)
      // would blow up every geometry calculation and SVG attribute.
      if (
        typeof w === 'number' &&
        typeof h === 'number' &&
        Number.isFinite(w) &&
        Number.isFinite(h) &&
        w >= 0 &&
        h >= 0 &&
        w <= 900 &&
        h <= 600
      ) {
        clean[id] = { h, w };
      }
    }
    return clean;
  };

  // Remembered canvas positions per node id. Mermaid source carries no
  // coordinates, so re-entering the visual tab would re-layout everything
  // (nodes visibly jumping back to auto-layout slots). The map is overlaid
  // on the auto layout by id: untouched nodes keep their placed positions
  // across mode switches, reloads and small external code edits, while new
  // ids fall back to their auto-layout slot. Module-level + localStorage:
  // the editor remounts on every tab switch but there is only one instance.
  const POSITIONS_KEY = 'visualEditorLayout';
  let rememberedPositions = sanitizePositions(readJSON(POSITIONS_KEY, null));
  // Editor-local edge routing style and manual node sizes (both never enter
  // the generated code — same channel as the position memory).
  const EDGE_STYLE_KEY = 'visualEditorEdgeStyle';
  let edgeStyle = $state<EdgeStyle>(
    readJSON<EdgeStyle>(EDGE_STYLE_KEY, 'orthogonal') === 'straight'
      ? 'straight'
      : readJSON<EdgeStyle>(EDGE_STYLE_KEY, 'orthogonal') === 'curved'
        ? 'curved'
        : 'orthogonal'
  );
  $effect(() => {
    writeJSON(EDGE_STYLE_KEY, edgeStyle);
  });
  const SIZES_KEY = 'visualEditorSizes';
  let rememberedSizes = sanitizeSizes(readJSON(SIZES_KEY, null));
  const rememberSizes = (): void => {
    rememberedSizes = Object.fromEntries(
      graph.nodes
        .filter((n) => n.w !== undefined || n.h !== undefined)
        .map((n) => [n.id, { h: n.h ?? 0, w: n.w ?? 0 }] as const)
    );
    if (JSON.stringify(rememberedSizes).length > 100_000) {
      return;
    }
    writeJSON(SIZES_KEY, rememberedSizes);
  };
  const rememberPositions = (): void => {
    if (isCoordKind) {
      return; // coordinates live in the generated code itself
    }
    rememberedPositions = Object.fromEntries(
      graph.nodes.map((node) => [node.id, clampPosition(node.x, node.y)] as const)
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
    rememberSizes();
    updateCode(lastSyncedCode, { updateDiagram: true });
  };

  const loadFromCode = (announce: boolean): void => {
    const parsed = parseCode(validatedState.current.code);
    if (parsed.ok) {
      const laid = layoutGraph(parsed.result.graph);
      const parsedKind = parsed.result.graph.kind ?? 'flowchart';
      graph = COORD_KINDS.has(parsedKind) ? laid : applyPositions(laid, rememberedPositions);
      for (const node of graph.nodes) {
        const size = rememberedSizes[node.id];
        if (size && (size.w > 0 || size.h > 0)) {
          node.w = size.w > 0 ? size.w : undefined;
          node.h = size.h > 0 ? size.h : undefined;
        }
      }
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
    selected = [];
    editing = undefined;
    editingDetail = false;
    // External state replaces the model — history cannot cross the boundary.
    undoStack = [];
    redoStack = [];
  };

  const kindLabel = (kind: VGraph['kind']): string => {
    const spec = kind ? KIND_SPECS[kind] : undefined;
    return spec ? `（${spec.label}）` : '';
  };

  onMount(() => {
    // Mid-gesture canvas scrolling shifts the svg origin: drop the cached
    // rect so the next pointer event re-measures it.
    canvasEl?.addEventListener('scroll', () => (svgRect = undefined));
    // Native contextmenu dispatch (right-click / Shift+F10 fallback): resolve
    // node/edge/canvas from the hit target instead of per-element handlers —
    // one listener, no Svelte event delegation involved.
    canvasEl?.addEventListener('contextmenu', (event) => {
      const target = event.target as Element | null;
      const nodeEl = target?.closest('[data-node-id]');
      const edgeEl = target?.closest('[data-edge-id]');
      if (nodeEl) {
        openContextMenu(event, {
          id: nodeEl.getAttribute('data-node-id') ?? undefined,
          kind: 'node'
        });
      } else if (edgeEl) {
        openContextMenu(event, {
          id: edgeEl.getAttribute('data-edge-id') ?? undefined,
          kind: 'edge'
        });
      } else if (target?.closest('svg')) {
        openContextMenu(event, { kind: 'canvas' });
      }
    });
    loadFromCode(false);
  });

  // Reload external code edits made while this tab was hidden.
  $effect(() => {
    if (active && validatedState.current.code !== lastSyncedCode) {
      loadFromCode(false);
    }
  });

  const addNodeAt = (x: number, y: number): void => {
    pushUndo();
    // Items added while a group node is selected attach to that group
    // (journey section, kanban column, timeline period, cynefin domain).
    const host = selectedNode;
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
    selected = [{ id: node.id, kind: 'node' }];
    syncCode();
    startEdit(node);
  };

  const addNodeStaggered = (): void => {
    const n = graph.nodes.length;
    addNodeAt(80 + (n % 8) * (NODE_W + 40), 60 + Math.floor(n / 8) * (NODE_H + 40));
  };

  // 插入 ▾ palette creation: explicit shape/role from the stencil list.
  const insertNode = (options: { role?: string; roleData?: string; shape?: VShape }): void => {
    pushUndo();
    const n = graph.nodes.length;
    const host = selectedNode;
    const defaultType = kindSpec.nodeTypes?.[0];
    const node: VNode = {
      id: nextNodeId(graph.nodes),
      label: '',
      role: options.role ?? defaultType?.role,
      roleData: options.roleData ?? defaultType?.data,
      shape: options.shape ?? kindSpec.shapes[0] ?? 'rect',
      x: snap(80 + (n % 8) * (NODE_W + 40) - NODE_W / 2 + NODE_W / 2),
      y: snap(60 + Math.floor(n / 8) * (NODE_H + 40))
    };
    graph.nodes.push(node);
    if (host && host.role && AUTO_ATTACH_ROLES.has(host.role)) {
      graph.edges.push({
        id: nextEdgeId(graph.edges),
        source: host.id,
        target: node.id,
        type: 'line'
      });
    }
    selected = [{ id: node.id, kind: 'node' }];
    insertOpen = undefined;
    syncCode();
    startEdit(node);
  };

  // stateDiagram pseudo nodes: only one start / one end dot can exist.
  const addSpecial = (kind: 'end' | 'start'): void => {
    const id = kind === 'start' ? '__start__' : '__end__';
    if (graph.nodes.some((node) => node.id === id)) {
      notify(kind === 'start' ? '起点已存在' : '终点已存在');
      return;
    }
    pushUndo();
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
    selected = [{ id: node.id, kind: 'node' }];
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
    pushUndo();
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
    if (selected.length === 0) return;
    pushUndo();
    if (selectedNodeIds.size > 0) {
      graph.nodes = graph.nodes.filter((node) => !selectedNodeIds.has(node.id));
      graph.edges = graph.edges.filter(
        (edge) => !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target)
      );
    }
    if (selectedEdgeIds.size > 0) {
      graph.edges = graph.edges.filter((edge) => !selectedEdgeIds.has(edge.id));
    }
    selected = [];
    syncCode();
  };

  // --- clipboard (internal; ids re-minted on paste) ---

  const selectionPayload = (): ClipboardPayload | undefined => {
    if (selectedNodeIds.size === 0 && selectedEdgeIds.size === 0) {
      return undefined;
    }
    return {
      edges: graph.edges.filter(
        (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
      ),
      nodes: graph.nodes.filter((n) => selectedNodeIds.has(n.id))
    };
  };

  const copySelection = (): void => {
    const payload = selectionPayload();
    if (payload && (payload.nodes.length > 0 || payload.edges.length > 0)) {
      clipboard = payload;
    }
  };

  const cutSelection = (): void => {
    if (selected.length === 0) return;
    copySelection();
    deleteSelected();
  };

  const pasteClipboard = (): void => {
    if (!clipboard || clipboard.nodes.length === 0) {
      return;
    }
    pushUndo();
    const { edges, nodes } = remintIds(clipboard, graph.nodes, graph.edges);
    for (const node of nodes) {
      const at = clampPosition(snap(node.x + 24), snap(node.y + 24));
      node.x = at.x;
      node.y = at.y;
      graph.nodes.push(node);
    }
    for (const edge of edges) {
      graph.edges.push(edge);
    }
    selected = nodes.map((node) => ({ id: node.id, kind: 'node' as const }));
    syncCode();
  };

  const duplicateSelection = (): void => {
    if (selected.length === 0) return;
    copySelection();
    pasteClipboard();
  };

  // --- arrangement ---

  const applyMoves = (moves: Record<string, { x?: number; y?: number }>): void => {
    for (const node of graph.nodes) {
      const move = moves[node.id];
      if (move?.x !== undefined) {
        node.x = move.x;
      }
      if (move?.y !== undefined) {
        node.y = move.y;
      }
    }
  };

  const applyAlign = (mode: AlignMode): void => {
    if (selectedNodes.length < 2) return;
    pushUndo();
    applyMoves(alignSelection(selectedNodes, mode));
    syncCode();
  };

  const applyDistribute = (axis: DistributeAxis): void => {
    if (selectedNodes.length < 3) return;
    pushUndo();
    applyMoves(distributeSelection(selectedNodes, axis));
    syncCode();
  };

  const alignToGrid = (): void => {
    if (graph.nodes.length === 0) return;
    pushUndo();
    for (const node of graph.nodes) {
      node.x = Math.round(node.x / 20) * 20;
      node.y = Math.round(node.y / 20) * 20;
    }
    syncCode();
  };

  const reverseSelectedEdge = (): void => {
    if (!selectedEdge) return;
    pushUndo();
    const source = selectedEdge.source;
    selectedEdge.source = selectedEdge.target;
    selectedEdge.target = source;
    const cardL = selectedEdge.cardL;
    selectedEdge.cardL = selectedEdge.cardR;
    selectedEdge.cardR = cardL;
    syncCode();
  };

  const nudgeSelection = (dx: number, dy: number): void => {
    if (selectedNodeIds.size === 0) return;
    pushUndo();
    for (const node of graph.nodes) {
      if (selectedNodeIds.has(node.id)) {
        node.x += dx;
        node.y += dy;
      }
    }
    syncCode();
  };

  // Visio AutoConnect arrows: connect the nearest unconnected node in the
  // direction, or spawn a fresh connected node there (draw.io drop-on-arrow).
  const autoConnectAction = (source: VNode, direction: Direction): void => {
    const { existingId, spawn } = autoConnect(graph.nodes, graph.edges, source, direction);
    if (existingId) {
      if (isBlockedStateLink(source.id, nodeById.get(existingId) as VNode)) {
        return;
      }
      pushUndo();
      graph.edges.push(newEdge(source.id, existingId));
      selectOnly(existingId, 'node');
      syncCode();
      return;
    }
    pushUndo();
    const defaultType = kindSpec.nodeTypes?.[0];
    const node: VNode = {
      id: nextNodeId(graph.nodes),
      label: '',
      role: defaultType?.role,
      roleData: defaultType?.data,
      shape: kindSpec.shapes[0] ?? 'rect',
      x: snap(spawn.x),
      y: snap(spawn.y)
    };
    graph.nodes.push(node);
    if (!isBlockedStateLink(source.id, node)) {
      graph.edges.push(newEdge(source.id, node.id));
    }
    selected = [{ id: node.id, kind: 'node' }];
    syncCode();
    startEdit(node);
  };

  const cloneConnect = (direction: Direction): void => {
    if (!selectedNode) {
      return;
    }
    const source = selectedNode;
    const { spawn } = autoConnect(graph.nodes, graph.edges, source, direction);
    pushUndo();
    const node: VNode = {
      ...(snapshotGraph({ direction: 'TD', edges: [], nodes: [source] }).nodes[0] as VNode),
      id: nextNodeId(graph.nodes),
      x: snap(spawn.x),
      y: snap(spawn.y)
    };
    graph.nodes.push(node);
    if (!isBlockedStateLink(source.id, node)) {
      graph.edges.push(newEdge(source.id, node.id));
    }
    selected = [{ id: node.id, kind: 'node' }];
    syncCode();
  };

  const cycleShape = (): void => {
    if (!selectedNode) return;
    const shapes = kindSpec.shapes;
    if (shapes.length < 2) return;
    pushUndo();
    const i = shapes.indexOf(selectedNode.shape);
    selectedNode.shape = shapes[(i + 1) % shapes.length] ?? shapes[0] ?? 'rect';
    syncCode();
  };

  const setShape = (shape: VShape): void => {
    if (!selectedNode) return;
    pushUndo();
    selectedNode.shape = shape;
    syncCode();
  };

  const cycleLink = (): void => {
    if (!selectedEdge) return;
    const links = kindSpec.links;
    if (links.length < 2) return;
    pushUndo();
    const i = links.findIndex((link) => link.type === selectedEdge.type);
    selectedEdge.type = links[(i + 1) % links.length]?.type ?? links[0]?.type ?? 'arrow';
    syncCode();
  };

  const setLinkType = (type: VLinkType): void => {
    if (!selectedEdge) return;
    pushUndo();
    selectedEdge.type = type;
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
      pushUndo();
      selectedEdge.cardL = preset.cardL;
      selectedEdge.cardR = preset.cardR;
      syncCode();
    }
  };

  // Per-kind node type palette (C4 Person/System, journey task/section, …).
  const nodeTypeOf = (node: VNode) =>
    kindSpec.nodeTypes?.find(
      (t) => t.role === node.role && (t.data ?? undefined) === (node.roleData ?? undefined)
    );

  const setNodeType = (role: string, data?: string): void => {
    if (!selectedNode) return;
    pushUndo();
    selectedNode.role = role;
    selectedNode.roleData = data;
    syncCode();
  };

  const cycleNodeType = (): void => {
    if (!selectedNode || !kindSpec.nodeTypes) return;
    const types = kindSpec.nodeTypes;
    const i = types.indexOf(nodeTypeOf(selectedNode) as (typeof types)[number]);
    const next = types[(i + 1) % types.length];
    if (next) {
      setNodeType(next.role, next.data);
    }
  };

  const openMetaEditor = (): void => {
    metaTitleDraft = graph.title ?? '';
    metaDrafts = { ...(graph.meta ?? {}) };
    editingMeta = true;
  };

  const commitMeta = (): void => {
    pushUndo();
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

  // 属性对话框键盘路径：Enter 即保存（isComposing+keyCode229 双守卫——
  // 拼音输入法选词的回车不是提交，MC 设计器循环 72 同款），Esc 取消。
  const onMetaKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      commitMeta();
    } else if (event.key === 'Escape') {
      editingMeta = false;
    }
  };

  const openDetailEditor = (): void => {
    if (!selectedNode) return;
    detailDraft = selectedNode.detail ?? '';
    editingDetail = true;
  };

  const commitDetail = (): void => {
    if (selectedNode) {
      pushUndo();
      selectedNode.detail = detailDraft.trim() || undefined;
      syncCode();
    }
    editingDetail = false;
  };

  const toggleDirection = (): void => {
    pushUndo();
    graph.direction = graph.direction === 'TD' ? 'LR' : 'TD';
    syncCode();
  };

  const autoLayout = (): void => {
    pushUndo();
    graph = layoutGraph(graph);
    syncCode();
  };

  const clearAll = (): void => {
    pushUndo();
    graph = { direction: graph.direction, kind: graph.kind, nodes: [], edges: [] };
    selected = [];
    syncCode();
  };

  // --- selection helpers ---

  const selectOnly = (id: string, kind: 'edge' | 'node'): void => {
    selected = [{ id, kind }];
  };

  const toggleInSelection = (id: string, kind: 'edge' | 'node'): void => {
    const exists = selected.some((s) => s.id === id && s.kind === kind);
    selected = exists
      ? selected.filter((s) => !(s.id === id && s.kind === kind))
      : [...selected, { id, kind }];
  };

  const selectAll = (): void => {
    selected = [
      ...graph.nodes.map((n) => ({ id: n.id, kind: 'node' as const })),
      ...graph.edges.map((e) => ({ id: e.id, kind: 'edge' as const }))
    ];
  };

  // --- pointer interactions (window-level so drags survive leaving a node) ---

  const onNodePointerDown = (event: PointerEvent, node: VNode): void => {
    event.stopPropagation();
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      toggleInSelection(node.id, 'node');
      return;
    }
    const multi = selectedNodeIds.has(node.id) && selectedNodeIds.size > 1;
    if (!multi) {
      selectOnly(node.id, 'node');
    }
    const p = svgPoint(event);
    const batch = new SvelteMap<string, { offX: number; offY: number }>();
    if (multi) {
      for (const other of graph.nodes) {
        if (selectedNodeIds.has(other.id)) {
          batch.set(other.id, { offX: p.x - other.x, offY: p.y - other.y });
        }
      }
    }
    drag = {
      batch,
      id: node.id,
      lastX: node.x,
      lastY: node.y,
      moved: false,
      offX: p.x - node.x,
      offY: p.y - node.y,
      preState: snapshotGraph(graph)
    };
  };

  const onCanvasPointerDown = (event: PointerEvent): void => {
    // Middle button or space+drag pans the canvas (office convention).
    if (event.button === 1 || spaceDown) {
      event.preventDefault();
      panning = { lastX: event.clientX, lastY: event.clientY, moved: false };
      return;
    }
    if (event.button !== 0) {
      return;
    }
    if (event.shiftKey || event.ctrlKey || event.metaKey) {
      // Rubber band lives behind a modifier since plain blank drag pans
      // (below): Shift+drag replaces the selection with the enclosed set,
      // Ctrl/Meta+drag adds to it (draw.io semantics, one modifier deeper).
      const p = svgPoint(event);
      marquee = {
        additive: event.ctrlKey || event.metaKey,
        x0: p.x,
        x1: p.x,
        y0: p.y,
        y1: p.y
      };
      return;
    }
    // Plain left-drag on blank canvas pans the view.
    panning = { lastX: event.clientX, lastY: event.clientY, moved: false };
  };

  const onResizePointerDown = (
    event: PointerEvent,
    node: VNode,
    corner: 'ne' | 'nw' | 'se' | 'sw'
  ): void => {
    event.stopPropagation();
    const size = nodeSize(node);
    const p = svgPoint(event);
    resize = {
      corner,
      h0: size.h,
      id: node.id,
      preState: snapshotGraph(graph),
      w0: size.w,
      x: p.x,
      y: p.y
    };
  };

  const resetNodeSize = (): void => {
    if (!selectedNode) {
      return;
    }
    pushUndo();
    selectedNode.w = undefined;
    selectedNode.h = undefined;
    syncCode();
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
    if (resize) {
      const node = nodeById.get(resize.id);
      if (node) {
        const p = svgPoint(event);
        const dx = p.x - resize.x;
        const dy = p.y - resize.y;
        const flipX = resize.corner === 'nw' || resize.corner === 'ne';
        const flipY = resize.corner === 'nw' || resize.corner === 'sw';
        const w = flipX ? resize.w0 - dx : resize.w0 + dx;
        const h = flipY ? resize.h0 - dy : resize.h0 + dy;
        node.w = Math.max(60, Math.min(900, snap(w)));
        node.h = Math.max(36, Math.min(600, snap(h)));
      }
      return;
    }
    if (panning && canvasEl) {
      const dx = event.clientX - panning.lastX;
      const dy = event.clientY - panning.lastY;
      canvasEl.scrollLeft -= dx;
      canvasEl.scrollTop -= dy;
      panning = {
        lastX: event.clientX,
        lastY: event.clientY,
        moved: panning.moved || dx !== 0 || dy !== 0
      };
      return;
    }
    const p = svgPoint(event);
    if (drag) {
      const node = nodeById.get(drag.id);
      if (node) {
        // Grid snap first; dynamic alignment guides refine against the
        // non-selected nodes (draw.io alignment guides / Visio dynamic grid).
        let x = snap(p.x - drag.offX);
        let y = snap(p.y - drag.offY);
        const others = graph.nodes.filter((n) => !drag?.batch.has(n.id));
        if (others.length > 0) {
          const result = alignmentGuides(node, others, { x, y });
          x = result.snapped.x;
          y = result.snapped.y;
          guides = result.guides;
        }
        // Skip no-op snapped positions: an assignment bumps the property
        // version and re-renders the node (and its edges) even when the
        // coordinates did not change.
        if (x !== drag.lastX || y !== drag.lastY) {
          const dx = x - drag.lastX;
          const dy = y - drag.lastY;
          node.x = x;
          node.y = y;
          drag.lastX = x;
          drag.lastY = y;
          drag.moved = true;
          for (const [id] of drag.batch) {
            const other = nodeById.get(id);
            if (other && other !== node) {
              other.x += dx;
              other.y += dy;
            }
          }
        }
      }
    } else if (marquee && (event.buttons & 1) === 1) {
      marquee = { ...marquee, x1: p.x, y1: p.y };
    } else if (linking) {
      linking.cursor = p;
    }
  };

  const onWindowPointerUp = (event: PointerEvent): void => {
    if (panning) {
      // Blank click (no movement) clears the selection — same outcome the
      // sub-threshold marquee produced before blank-drag became the panner.
      if (!panning.moved) {
        selected = [];
      }
      panning = undefined;
      return;
    }
    if (resize) {
      const pre = resize.preState;
      resize = undefined;
      undoStack = [...undoStack.slice(-(UNDO_LIMIT - 1)), pre];
      redoStack = [];
      syncCode();
      return;
    }
    if (drag?.moved) {
      // Snapshot taken at gesture start (drag.preState) — see onNodePointerDown.
      undoStack = [...undoStack.slice(-(UNDO_LIMIT - 1)), drag.preState];
      redoStack = [];
      syncCode();
    }
    drag = undefined;
    guides = [];
    svgRect = undefined; // next gesture re-measures (layout may have changed)
    if (marquee) {
      const rect = {
        height: Math.abs(marquee.y1 - marquee.y0),
        width: Math.abs(marquee.x1 - marquee.x0),
        x: Math.min(marquee.x0, marquee.x1),
        y: Math.min(marquee.y0, marquee.y1)
      };
      if (rect.width >= 4 || rect.height >= 4) {
        const hits = nodesInRect(graph.nodes, rect, event.altKey).map((n) => ({
          id: n.id,
          kind: 'node' as const
        }));
        selected = marquee.additive ? [...selected, ...hits] : hits;
      } else if (!marquee.additive) {
        selected = [];
      }
      marquee = undefined;
    }
    if (linking) {
      const target = nodeAt(svgPoint(event));
      if (
        canLink &&
        target &&
        target.id !== linking.source &&
        !isBlockedStateLink(linking.source, target)
      ) {
        pushUndo();
        const edge = newEdge(linking.source, target.id);
        graph.edges.push(edge);
        selected = [{ id: edge.id, kind: 'edge' }];
        syncCode();
      }
      linking = undefined;
    }
  };

  const isTypingTarget = (event: KeyboardEvent): boolean => {
    const el = event.target as HTMLElement | null;
    if (!el) {
      return false;
    }
    return (
      editing !== undefined ||
      editingDetail ||
      editingMeta ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.isContentEditable
    );
  };

  const openContextMenu = (
    event: MouseEvent,
    target: { id?: string; kind: 'canvas' | 'edge' | 'node' }
  ): void => {
    event.preventDefault();
    event.stopPropagation();
    if (target.kind === 'node' && target.id && !selectedNodeIds.has(target.id)) {
      selectOnly(target.id, 'node');
    } else if (target.kind === 'edge' && target.id && !selectedEdgeIds.has(target.id)) {
      selectOnly(target.id, 'edge');
    }
    menu = { clientX: event.clientX, clientY: event.clientY, submenu: undefined, target };
  };

  const closeMenu = (): void => {
    menu = undefined;
  };

  const menuAction = (run: () => void): void => {
    closeMenu();
    run();
  };

  const openMenuAtSelection = (): void => {
    if (selectedNode) {
      const box = svgEl?.getBoundingClientRect();
      menu = {
        clientX: (box?.left ?? 0) + selectedNode.x + 160,
        clientY: (box?.top ?? 0) + selectedNode.y + 20,
        submenu: undefined,
        target: { id: selectedNode.id, kind: 'node' }
      };
    } else if (selectedEdge) {
      const s = nodeById.get(selectedEdge.source);
      const t = nodeById.get(selectedEdge.target);
      if (s && t) {
        menu = {
          clientX: (s.x + t.x) / 2 + 160,
          clientY: (s.y + t.y) / 2 + 60,
          submenu: undefined,
          target: { id: selectedEdge.id, kind: 'edge' }
        };
      }
    }
  };

  const onWindowKeydown = (event: KeyboardEvent): void => {
    if (!active) return;
    if (event.code === 'Space') {
      spaceDown = true;
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'h') {
      event.preventDefault();
      resetView();
      return;
    }
    if (event.key === 'Escape') {
      if (menu) {
        closeMenu();
        return;
      }
      linking = undefined;
      marquee = undefined;
      selected = [];
      return;
    }
    if (isTypingTarget(event)) return;
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }
    if (ctrl && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
      return;
    }
    if (ctrl && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectAll();
      return;
    }
    if (ctrl && event.key.toLowerCase() === 'c') {
      copySelection();
      return;
    }
    if (ctrl && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      cutSelection();
      return;
    }
    if (ctrl && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      pasteClipboard();
      return;
    }
    if (ctrl && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      duplicateSelection();
      return;
    }
    if (event.key === 'F2') {
      if (selectedNode) {
        event.preventDefault();
        startEdit(selectedNode);
      } else if (selectedEdge) {
        event.preventDefault();
        startEdit(selectedEdge);
      }
      return;
    }
    // Ctrl+F 聚焦画布搜索（拦截浏览器原生查找——在可视化模式用户意图
    // 几乎总是找节点；输入控件聚焦时按 isTypingTarget 早退不劫持）
    if (ctrl && event.key.toLowerCase() === 'f' && canvasView) {
      event.preventDefault();
      canvasSearchEl?.focus();
      canvasSearchEl?.select();
      return;
    }
    if (
      (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) &&
      selected.length > 0
    ) {
      event.preventDefault();
      openMenuAtSelection();
      return;
    }
    if (event.altKey && event.shiftKey && event.key.startsWith('Arrow') && selectedNode) {
      event.preventDefault();
      cloneConnect(
        event.key === 'ArrowLeft'
          ? 'left'
          : event.key === 'ArrowRight'
            ? 'right'
            : event.key === 'ArrowUp'
              ? 'up'
              : 'down'
      );
      return;
    }
    if (event.key.startsWith('Arrow') && selectedNodeIds.size > 0) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      nudgeSelection(dx, dy);
      return;
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected.length > 0) {
      event.preventDefault();
      deleteSelected();
    }
  };

  const onWindowPointerDown = (): void => {
    if (menu) {
      closeMenu();
    }
    if (insertOpen) {
      insertOpen = undefined;
    }
    if (layoutMenuOpen) {
      layoutMenuOpen = false;
    }
  };

  const onWindowKeyup = (event: KeyboardEvent): void => {
    if (event.code === 'Space') {
      spaceDown = false;
    }
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

  const marqueeRect = $derived.by(() => {
    if (!marquee) return undefined;
    return {
      height: Math.abs(marquee.y1 - marquee.y0),
      width: Math.abs(marquee.x1 - marquee.x0),
      x: Math.min(marquee.x0, marquee.x1),
      y: Math.min(marquee.y0, marquee.y1)
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

  // 打开时按估计宽度夹取（152px）只是防闪屏第一帧；面板宽度随内容
  // （实测 177px+），挂载后按实测宽度精确收进视口。
  const clampMenuToViewport = (el: HTMLElement): void => {
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 8) {
      el.style.left = `${Math.max(8, window.innerWidth - rect.width - 8)}px`;
    }
  };

  // 浮层 portal 到 body：移动端 200% 滑屏容器带 transform（-translate-x-1/2），
  // position:fixed 在 transform 祖先内会相对祖先而非视口定位——实测菜单偏移
  // 整整 390px（102-390=-288）。挂到 body 下 fixed 才恒等于视口坐标。
  const portal = (el: HTMLElement): { destroy: () => void } => {
    document.body.append(el);
    return {
      destroy: () => {
        el.remove();
      }
    };
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
  onkeyup={onWindowKeyup}
  onpointerdown={onWindowPointerDown}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp} />

{#snippet metaDialog()}
  {#if editingMeta}
    <div class="absolute top-2 left-2 z-10 w-64 rounded border bg-background p-2 shadow">
      <div class="mb-1 text-xs text-muted-foreground">图表属性</div>
      {#if kindSpec.hasTitle}
        <label class="mb-1 block text-xs" for="ve-meta-title">标题</label>
        <input
          id="ve-meta-title"
          class="mb-2 w-full rounded border border-input bg-background p-1 text-xs text-foreground"
          bind:value={metaTitleDraft}
          onkeydown={onMetaKeydown} />
      {/if}
      {#each kindSpec.metaKeys ?? [] as metaKey (metaKey.key)}
        <label class="mb-1 block text-xs" for="ve-meta-{metaKey.key}">{metaKey.label}</label>
        <input
          id="ve-meta-{metaKey.key}"
          class="mb-2 w-full rounded border border-input bg-background p-1 text-xs text-foreground"
          list={metaKey.suggestions ? `ve-meta-dl-${metaKey.key}` : undefined}
          bind:value={metaDrafts[metaKey.key]}
          onkeydown={onMetaKeydown} />
        {#if metaKey.suggestions}
          <!-- 常用取值建议（原生下拉，自由输入并存）——拼错格式=静默解析失败 -->
          <datalist id="ve-meta-dl-{metaKey.key}">
            {#each metaKey.suggestions as suggestion (suggestion)}
              <option value={suggestion}></option>
            {/each}
          </datalist>
        {/if}
      {/each}
      <div class="mt-1 flex justify-end gap-1">
        <Button size="sm" variant="ghost" onclick={() => (editingMeta = false)}>取消</Button>
        <Button size="sm" onclick={commitMeta}>保存</Button>
      </div>
    </div>
  {/if}
{/snippet}

<div class="flex h-full min-h-80 flex-col select-none">
  <!-- 移动端单行横滑（390px 实测 13 钮换行要占 ~159px 画布高度）；桌面保持换行平铺 -->
  <div
    class="flex flex-nowrap items-center gap-1.5 overflow-x-auto border-b p-1.5 text-xs sm:flex-wrap sm:overflow-visible [&>*]:shrink-0"
    data-testid="visual-toolbar">
    {#if canvasView}
      <Button
        size="sm"
        variant="outline"
        data-testid={TID.visualAddNode}
        onclick={addNodeStaggered}>
        <AddIcon />
        {kindSpec.newNode}
      </Button>
      {#if (kindSpec.nodeTypes?.length ?? 0) > 1 || kindSpec.shapes.length > 1}
        <Button
          size="sm"
          variant="outline"
          data-testid={TID.visualInsert}
          onclick={(e) => {
            e.stopPropagation();
            const box = e.currentTarget.getBoundingClientRect();
            if (insertOpen) {
              insertOpen = undefined;
              return;
            }
            // 视口内夹取：移动端横滑工具栏下按钮可在任意 x，面板不得出屏
            // （152 = min-w-36 的 144px + 8px 边距；宽度另有 max-w 兜底）
            const maxX = Math.max(8, window.innerWidth - 152);
            insertOpen = { x: Math.max(8, Math.min(box.left, maxX)), y: box.bottom + 4 };
          }}>
          插入 ▾
        </Button>
      {/if}
      <input
        class="w-28 rounded border bg-background px-1.5 py-1"
        placeholder="搜索节点…"
        aria-label="搜索节点"
        data-testid="visual-canvas-search"
        bind:this={canvasSearchEl}
        bind:value={canvasQuery}
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            canvasQuery = '';
          } else if (e.key === 'Enter') {
            const first = graph.nodes.find((n) => canvasHitIds.has(n.id));
            if (first) {
              centerOnNode(first);
            }
          }
        }} />
      {#if canvasQueryLower !== ''}
        <span
          class="whitespace-nowrap text-muted-foreground"
          data-testid="visual-canvas-search-count">
          {#if canvasHitCount === 0}
            无匹配（Esc 清除）
          {:else}
            {canvasHitCount} 匹配
          {/if}
        </span>
      {/if}
      {#if kindSpec.startEnd}
        <Button
          size="sm"
          variant="outline"
          onclick={() => addSpecial('start')}
          title="添加起点（[*]）">
          <StartIcon /> 起点
        </Button>
        <Button
          size="sm"
          variant="outline"
          onclick={() => addSpecial('end')}
          title="添加终点（[*]）">
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
    {/if}
    {#if kindSpec.hasTitle || (kindSpec.metaKeys ?? []).length > 0}
      <Button size="sm" variant="outline" data-testid={TID.visualMeta} onclick={openMetaEditor}>
        <DetailIcon /> 属性
      </Button>
    {/if}
    {#if canvasView}
      {#if kindSpec.links.length > 1}
        <Button size="sm" variant="outline" disabled={!selectedEdge} onclick={cycleLink}>
          线型: {selectedEdge
            ? (kindSpec.links.find((link) => link.type === selectedEdge?.type)?.name ?? '—')
            : '—'}
        </Button>
      {/if}
      {#if (graph.kind ?? 'flowchart') === 'er'}
        <Button size="sm" variant="outline" disabled={!selectedEdge} onclick={cycleErCard}>
          基数: {selectedEdge
            ? `${selectedEdge.cardL ?? '||'}--${selectedEdge.cardR ?? 'o{'}`
            : '—'}
        </Button>
      {/if}
      {#if kindSpec.detail}
        <Button size="sm" variant="outline" disabled={!selectedNode} onclick={openDetailEditor}>
          <DetailIcon /> 编辑内容
        </Button>
      {/if}
    {/if}
    <Button
      size="sm"
      variant="outline"
      data-testid={TID.visualUndo}
      disabled={undoStack.length === 0}
      onclick={undo}
      title="撤销（Ctrl+Z）">
      <UndoIcon />
    </Button>
    <Button
      size="sm"
      variant="outline"
      data-testid={TID.visualRedo}
      disabled={redoStack.length === 0}
      onclick={redo}
      title="重做（Ctrl+Shift+Z / Ctrl+Y）">
      <RedoIcon />
    </Button>
    {#if canvasView}
      <Button
        size="sm"
        variant="outline"
        disabled={selected.length === 0}
        onclick={deleteSelected}
        title="Delete 键亦可删除">
        <DeleteIcon /> 删除
      </Button>
      <Button
        size="sm"
        variant="outline"
        data-testid={TID.visualLayoutMenu}
        onclick={(e) => {
          e.stopPropagation();
          layoutMenuOpen = !layoutMenuOpen;
        }}>
        <AutoFixIcon /> 整理 ▾
      </Button>
    {/if}
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
      class="hidden sm:inline-flex"
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
    <Button
      size="sm"
      variant="outline"
      data-testid="visual-help"
      title="快捷键与操作帮助"
      aria-label="快捷键与操作帮助"
      onclick={() => (helpOpen = true)}>
      <HelpIcon />
    </Button>
    <span class="ml-auto whitespace-nowrap text-muted-foreground">
      {kindSpec.label} · {graph.nodes.length} 节点 · {graph.edges.length} 连线
      {#if canvasView}· {Math.round(view.k * 100)}%{/if}
    </span>
  </div>

  {#if kindSpec.view}
    <div class="relative flex min-h-0 flex-1 flex-col">
      {#if kindSpec.view === 'board'}
        <BoardEditor {commit} {graph} kind={graph.kind ?? 'flowchart'} />
      {:else if kindSpec.view === 'sheet'}
        <SheetEditor {commit} {graph} kind={graph.kind ?? 'flowchart'} />
      {:else if kindSpec.view === 'outline'}
        <OutlineEditor {commit} {graph} kind={graph.kind ?? 'flowchart'} />
      {:else if kindSpec.view === 'sequence'}
        <SequenceEditor {commit} {graph} kind={graph.kind ?? 'flowchart'} />
      {:else if kindSpec.view === 'git'}
        <GitEditor {commit} {graph} />
      {/if}
      {@render metaDialog()}
    </div>
  {/if}

  {#if canvasView}
    <div
      bind:this={canvasEl}
      class="min-h-64 flex-1 overflow-auto"
      data-testid={TID.visualCanvas}
      style="background-image: radial-gradient(circle, var(--border) 1px, transparent 1px); background-size: 20px 20px;"
      onwheel={onCanvasWheel}>
      <div class="relative" style="width:{CANVAS_W * view.k}px; height:{CANVAS_H * view.k}px;">
        <div
          class="absolute top-0 left-0 origin-top-left"
          style="width:{CANVAS_W}px; height:{CANVAS_H}px; transform: scale({view.k});">
          <svg
            bind:this={svgEl}
            class="absolute inset-0 block h-full w-full"
            style="touch-action: none; cursor: {panning ? 'grabbing' : 'grab'};"
            ondblclick={(e) => {
              const p = svgPoint(e);
              addNodeAt(p.x, p.y);
            }}
            onpointerdown={onCanvasPointerDown}
            ontouchend={onCanvasTouchEnd}
            ontouchmove={onCanvasTouchMove}
            ontouchstart={onCanvasTouchStart}
            role="application"
            aria-label="可视化画布">
            <defs>
              <marker
                id="ve-arrow"
                markerHeight="8"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4">
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
              {@const sNode = nodeById.get(edge.source)}
              {@const tNode = nodeById.get(edge.target)}
              {#if sNode && tNode}
                {@const route = routeEdge(edgeStyle, sNode, tNode, graph.nodes)}
                {@const cardLPos = pointOnRoute(route, 0.15)}
                {@const cardRPos = pointOnRoute(route, 0.85)}
                {@const labelPos = pointOnRoute(route, 0.5)}
                {@const selectedEdgeId = selectedEdgeIds.has(edge.id) ? edge.id : undefined}
                {@const endMarker = END_MARKERS[edge.type]}
                {@const startMarker = START_MARKERS[edge.type]}
                <path
                  role="button"
                  tabindex="0"
                  data-edge-id={edge.id}
                  d={route.d}
                  fill="none"
                  stroke="transparent"
                  stroke-width="14"
                  style="pointer-events: stroke; cursor: pointer;"
                  onpointerdown={(e) => e.stopPropagation()}
                  onclick={(e) => {
                    e.stopPropagation();
                    selectOnly(edge.id, 'edge');
                  }}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      selectOnly(edge.id, 'edge');
                    }
                  }}
                  ondblclick={(e) => {
                    e.stopPropagation();
                    selectOnly(edge.id, 'edge');
                    startEdit(edge);
                  }}></path>
                <path
                  d={route.d}
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
                      x={cardLPos.x}
                      y={cardLPos.y - 4}
                      fill="var(--foreground)"
                      font-size="9"
                      text-anchor="middle"
                      style="pointer-events: none;">
                      {edge.cardL}
                    </text>
                  {/if}
                  {#if edge.cardR}
                    <text
                      x={cardRPos.x}
                      y={cardRPos.y - 4}
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
                    x={labelPos.x}
                    y={labelPos.y - 6}
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

            {#each guides as guide (guide.axis + guide.at)}
              {#if guide.axis === 'x'}
                <path
                  d="M{guide.at},0 L{guide.at},{CANVAS_H}"
                  stroke="var(--primary)"
                  stroke-dasharray="4 4"
                  stroke-width="1"
                  style="pointer-events: none;"></path>
              {:else}
                <path
                  d="M0,{guide.at} L{CANVAS_W},{guide.at}"
                  stroke="var(--primary)"
                  stroke-dasharray="4 4"
                  stroke-width="1"
                  style="pointer-events: none;"></path>
              {/if}
            {/each}

            {#if marqueeRect}
              <rect
                fill="var(--primary)"
                fill-opacity="0.06"
                height={marqueeRect.height}
                stroke="var(--primary)"
                stroke-dasharray="4 3"
                width={marqueeRect.width}
                x={marqueeRect.x}
                y={marqueeRect.y}></rect>
            {/if}

            {#each graph.nodes as node (node.id)}
              {@const isSelected = selectedNodeIds.has(node.id)}
              {@const size = nodeSize(node)}
              <g
                role="button"
                tabindex="-1"
                data-node-id={node.id}
                data-search-hit={canvasQueryLower !== '' && canvasHitIds.has(node.id)
                  ? true
                  : undefined}
                opacity={canvasQueryLower !== '' && !canvasHitIds.has(node.id) ? 0.25 : undefined}
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
              {#if isSelected && canLink && selectedNodeIds.size === 1}
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
              {#if isSelected && !node.special && selectedNodeIds.size === 1}
                {@const corners = [
                  { key: 'nw', x: node.x + 4, y: node.y + 4 },
                  { key: 'ne', x: node.x + size.w - 4, y: node.y + 4 },
                  { key: 'se', x: node.x + size.w - 4, y: node.y + size.h - 4 },
                  { key: 'sw', x: node.x + 4, y: node.y + size.h - 4 }
                ]}
                {#each corners as corner (corner.key)}
                  <rect
                    role="button"
                    tabindex="-1"
                    aria-label="调整大小"
                    data-testid="visual-resize-{corner.key}"
                    fill="var(--primary)"
                    height="8"
                    style="cursor: nwse-resize;"
                    width="8"
                    x={corner.x - 4}
                    y={corner.y - 4}
                    onpointerdown={(e) =>
                      onResizePointerDown(e, node, corner.key as 'ne' | 'nw' | 'se' | 'sw')}></rect>
                {/each}
              {/if}
              {#if isSelected && !node.special && canLink && selectedNodeIds.size === 1}
                {@const size2 = nodeSize(node)}
                {#each [{ dir: 'right', x: node.x + size2.w + 26, y: node.y + size2.h / 2 }, { dir: 'left', x: node.x - 26, y: node.y + size2.h / 2 }, { dir: 'down', x: node.x + size2.w / 2, y: node.y + size2.h + 26 }, { dir: 'up', x: node.x + size2.w / 2, y: node.y - 26 }] as arrow (arrow.dir)}
                  <path
                    role="button"
                    tabindex="-1"
                    data-testid="visual-autoconnect-{arrow.dir}"
                    d="M{arrow.x - 5},{arrow.y - 6} L{arrow.x + 7},{arrow.y} L{arrow.x -
                      5},{arrow.y + 6} Z"
                    fill="var(--primary)"
                    style="cursor: pointer;"
                    onpointerdown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                    }}
                    onclick={(e) => {
                      e.stopPropagation();
                      autoConnectAction(node, arrow.dir as Direction);
                    }}
                    onkeydown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        autoConnectAction(node, arrow.dir as Direction);
                      }
                    }}></path>
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
                双击画布添加{kindSpec.newNode}；拖动空白平移画布（Shift+拖拽框选）；拖动节点边缘圆点创建连线；双击节点/连线修改文字
              </text>
            {/if}
          </svg>
        </div>
        {#if editing}
          <!-- Overlays live OUTSIDE the scale() layer: inside it their font
               size and geometry would track the canvas zoom (unusable at
               0.4x, enormous at 2.5x). Position = world coords × zoom. -->
          <input
            type="text"
            class="absolute z-10 w-44 rounded border bg-background px-1 py-0.5 text-xs text-foreground"
            style="left: {editing.x * view.k - 88}px; top: {editing.y * view.k - 12}px;"
            bind:value={editing.label}
            use:focusEditor
            onkeydown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') commitEdit();
              if (e.key === 'Escape') editing = undefined;
            }}
            onblur={commitEdit} />
        {/if}

        {@render metaDialog()}

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
                // 多行文本域：Enter 换行照旧，Ctrl+Enter 保存（IDE 惯例）
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  commitDetail();
                } else if (e.key === 'Escape') editingDetail = false;
              }}></textarea>
            <div class="mt-1 flex justify-end gap-1">
              <Button size="sm" variant="ghost" onclick={() => (editingDetail = false)}
                >取消</Button>
              <Button size="sm" title="保存（Ctrl+Enter）" onclick={commitDetail}>保存</Button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if showCode}
    <div class="flex-none border-t">
      <button
        class="flex w-full items-center justify-between px-2 py-1 text-xs text-muted-foreground"
        data-testid="visual-code-toggle"
        onclick={() => (showCode = !showCode)}>
        <span>生成的代码（实时同步到预览与编辑器）</span>
        <span>▾</span>
      </button>
      <pre
        data-testid={TID.visualCodeOut}
        class="max-h-32 overflow-auto bg-muted/50 p-2 font-mono text-xs whitespace-pre-wrap">{generated}</pre>
    </div>
  {:else}
    <!-- 收起后保留一条可重开的头部：此前整块消失，收起即无入口
         （叠加折叠记忆后被永久锁在收起态） -->
    <button
      class="flex w-full flex-none items-center justify-between border-t px-2 py-1 text-xs text-muted-foreground"
      data-testid="visual-code-toggle"
      onclick={() => (showCode = !showCode)}>
      <span>生成的代码（已收起）</span>
      <span>▸</span>
    </button>
  {/if}

  {#if insertOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed z-50 min-w-36 max-w-[calc(100vw-16px)] rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
      data-testid={TID.visualInsertMenu}
      style="left: {insertOpen.x}px; top: {insertOpen.y}px;"
      use:portal
      use:clampMenuToViewport
      onpointerdown={(e) => e.stopPropagation()}>
      <input
        class="mb-1 h-7 w-full rounded border bg-background px-1.5"
        placeholder="搜索图元…"
        aria-label="搜索图元"
        data-testid="visual-insert-search"
        bind:value={insertQuery}
        use:focusEditor
        onkeydown={(e) => {
          // Esc 双段：有词清词，无词关面板（IME 合成期 Esc 属取消候选词不清）
          if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229) {
            if (insertQuery.trim() !== '') {
              insertQuery = '';
            } else {
              insertOpen = undefined;
              e.currentTarget.blur();
            }
          }
          e.stopPropagation();
        }} />
      <div class="max-h-64 overflow-y-auto">
        {#each filteredInsertShapes as shape (shape)}
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onclick={() => insertNode({ shape })}>
            形状：{SHAPE_NAMES[shape]}
          </button>
        {/each}
        {#each filteredInsertTypes as nodeType (nodeType.name)}
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onclick={() => insertNode({ role: nodeType.role, roleData: nodeType.data })}>
            类型：{nodeType.name}
          </button>
        {/each}
        {#if filteredInsertShapes.length === 0 && filteredInsertTypes.length === 0}
          <div class="px-2 py-1 text-muted-foreground">
            没有匹配「{insertQuery.trim()}」的图元。
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if layoutMenuOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed z-50 min-w-36 rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
      data-testid={TID.visualLayoutMenuList}
      style="right: 16px; bottom: 120px;"
      use:portal
      onpointerdown={(e) => e.stopPropagation()}>
      <button
        class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
        onclick={() => {
          layoutMenuOpen = false;
          autoLayout();
        }}>
        自动分层
      </button>
      <button
        class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
        onclick={() => {
          layoutMenuOpen = false;
          alignToGrid();
        }}>
        对齐网格
      </button>
      <button
        class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
        onclick={() => {
          layoutMenuOpen = false;
          resetView();
        }}>
        复位视图 <span class="ml-auto text-muted-foreground">Ctrl+H</span>
      </button>
    </div>
  {/if}

  {#if menu}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed z-50 min-w-44 rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
      data-testid={TID.visualContextMenu}
      style="left: {Math.min(menu.clientX, window.innerWidth - 250)}px; top: {Math.min(
        menu.clientY,
        window.innerHeight - 380
      )}px;"
      use:portal
      onpointerdown={(e) => e.stopPropagation()}
      oncontextmenu={(e) => e.preventDefault()}>
      {#if menu.target.kind === 'node'}
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(() => selectedNode && startEdit(selectedNode))}>
          编辑标签 <span class="ml-4 text-muted-foreground">F2</span>
        </button>
        {#if kindSpec.detail && selectedNode}
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onclick={() => menuAction(openDetailEditor)}>
            编辑内容
          </button>
        {/if}
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(copySelection)}>
          复制 <span class="ml-4 text-muted-foreground">Ctrl+C</span>
        </button>
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(cutSelection)}>
          剪切 <span class="ml-4 text-muted-foreground">Ctrl+X</span>
        </button>
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(duplicateSelection)}>
          复制副本 <span class="ml-4 text-muted-foreground">Ctrl+D</span>
        </button>
        <div class="my-1 border-t"></div>
        {#if kindSpec.shapes.length > 1 && selectedNode}
          <div
            class="relative"
            onmouseenter={() => (menu = menu && { ...menu, submenu: 'shape' })}
            onmouseleave={() => (menu = menu && { ...menu, submenu: undefined })}>
            <button
              class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent">
              形状 ▸
            </button>
            {#if menu.submenu === 'shape'}
              <div
                class="absolute top-0 left-full z-10 ml-1 min-w-28 rounded-md border bg-popover p-1 shadow-md">
                {#each kindSpec.shapes as shape (shape)}
                  <button
                    class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
                    onclick={() => menuAction(() => setShape(shape))}>
                    {SHAPE_NAMES[shape]}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        {#if kindSpec.nodeTypes && kindSpec.nodeTypes.length > 0 && selectedNode}
          <div
            class="relative"
            onmouseenter={() => (menu = menu && { ...menu, submenu: 'type' })}
            onmouseleave={() => (menu = menu && { ...menu, submenu: undefined })}>
            <button
              class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent">
              类型 ▸
            </button>
            {#if menu.submenu === 'type'}
              <div
                class="absolute top-0 left-full z-10 ml-1 min-w-28 rounded-md border bg-popover p-1 shadow-md">
                {#each kindSpec.nodeTypes as nodeType (nodeType.name)}
                  <button
                    class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
                    onclick={() => menuAction(() => setNodeType(nodeType.role, nodeType.data))}>
                    {nodeType.name}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        {#if selectedNodes.length >= 2}
          <div
            class="relative"
            onmouseenter={() => (menu = menu && { ...menu, submenu: 'align' })}
            onmouseleave={() => (menu = menu && { ...menu, submenu: undefined })}>
            <button
              class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent">
              对齐 ▸
            </button>
            {#if menu.submenu === 'align'}
              <div
                class="absolute top-0 left-full z-10 ml-1 min-w-28 rounded-md border bg-popover p-1 shadow-md">
                {#each Object.keys(ALIGN_LABELS) as mode (mode)}
                  <button
                    class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
                    onclick={() => menuAction(() => applyAlign(mode as AlignMode))}>
                    {ALIGN_LABELS[mode as AlignMode]}
                  </button>
                {/each}
                {#if selectedNodes.length >= 3}
                  <div class="my-1 border-t"></div>
                  <button
                    class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
                    onclick={() => menuAction(() => applyDistribute('x'))}>
                    水平等距
                  </button>
                  <button
                    class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
                    onclick={() => menuAction(() => applyDistribute('y'))}>
                    垂直等距
                  </button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}
        <div class="my-1 border-t"></div>
        {#if selectedNode?.w !== undefined || selectedNode?.h !== undefined}
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onclick={() => menuAction(resetNodeSize)}>
            重置尺寸
          </button>
        {/if}
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-destructive hover:bg-accent"
          data-testid={TID.visualMenuDelete}
          onclick={() => menuAction(deleteSelected)}>
          删除 <span class="ml-4 text-muted-foreground">Del</span>
        </button>
      {:else if menu.target.kind === 'edge'}
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(() => selectedEdge && startEdit(selectedEdge))}>
          编辑标签 <span class="ml-4 text-muted-foreground">F2</span>
        </button>
        {#if kindSpec.links.length > 1 && selectedEdge}
          <div
            class="relative"
            onmouseenter={() => (menu = menu && { ...menu, submenu: 'link' })}
            onmouseleave={() => (menu = menu && { ...menu, submenu: undefined })}>
            <button
              class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent">
              线型 ▸
            </button>
            {#if menu.submenu === 'link'}
              <div
                class="absolute top-0 left-full z-10 ml-1 min-w-28 rounded-md border bg-popover p-1 shadow-md">
                {#each kindSpec.links as link (link.name)}
                  <button
                    class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
                    onclick={() => menuAction(() => setLinkType(link.type))}>
                    {link.name}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
        <button
          class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(reverseSelectedEdge)}>
          反转方向
        </button>
        <div class="my-1 border-t"></div>
        <button
          class="flex w-full items-center rounded px-2 py-1 text-left text-destructive hover:bg-accent"
          data-testid={TID.visualMenuDelete}
          onclick={() => menuAction(deleteSelected)}>
          删除
        </button>
      {:else}
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent disabled:opacity-50"
          disabled={!clipboard}
          onclick={() => menuAction(pasteClipboard)}>
          粘贴 <span class="ml-4 text-muted-foreground">Ctrl+V</span>
        </button>
        <button
          class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(selectAll)}>
          全选 <span class="ml-4 text-muted-foreground">Ctrl+A</span>
        </button>
        <div class="my-1 border-t"></div>
        <div
          class="relative"
          onmouseenter={() => (menu = menu && { ...menu, submenu: 'edgestyle' })}
          onmouseleave={() => (menu = menu && { ...menu, submenu: undefined })}>
          <button
            class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent">
            连线风格 ▸
          </button>
          {#if menu.submenu === 'edgestyle'}
            <div
              class="absolute top-0 left-full z-10 ml-1 min-w-28 rounded-md border bg-popover p-1 shadow-md">
              {#each [{ key: 'orthogonal', name: '直角' }, { key: 'straight', name: '直线' }, { key: 'curved', name: '曲线' }] as styleItem (styleItem.key)}
                <button
                  class="flex w-full items-center justify-between rounded px-2 py-1 text-left hover:bg-accent"
                  onclick={() =>
                    menuAction(() => {
                      edgeStyle = styleItem.key as EdgeStyle;
                    })}>
                  {styleItem.name}
                  {#if edgeStyle === styleItem.key}<span>✓</span>{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button
          class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(alignToGrid)}>
          对齐网格
        </button>
        <button
          class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(autoLayout)}>
          整理布局
        </button>
        <div class="my-1 border-t"></div>
        <button
          class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(() => loadFromCode(true))}>
          从代码重载
        </button>
        <button
          class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
          onclick={() => menuAction(clearAll)}>
          清空画布
        </button>
      {/if}
    </div>
  {/if}

  <Dialog.Root bind:open={helpOpen}>
    <Dialog.Content class="max-w-lg" data-testid="visual-help-dialog">
      <Dialog.Header>
        <Dialog.Title>快捷键与操作</Dialog.Title>
        <Dialog.Description>可视化编辑器的全部键盘与鼠标操作</Dialog.Description>
      </Dialog.Header>
      <div class="max-h-[60vh] overflow-y-auto pr-1">
        {#each SHORTCUT_GROUPS as section (section.group)}
          <div class="mb-3">
            <div class="mb-1 text-xs font-medium text-muted-foreground">{section.group}</div>
            <div class="flex flex-col gap-1">
              {#each section.items as [keys, desc] (keys)}
                <div class="flex items-center justify-between gap-4 text-sm">
                  <span>{desc}</span>
                  <kbd class="rounded border bg-muted px-1.5 py-0.5 text-xs whitespace-nowrap">
                    {keys}
                  </kbd>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
      <Dialog.Footer>
        <Dialog.Close class={buttonVariants({ size: 'sm', variant: 'outline' })}>关闭</Dialog.Close>
      </Dialog.Footer>
    </Dialog.Content>
  </Dialog.Root>
</div>
