<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import { Button, buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { getSampleDiagrams, type SampleExample } from '$/util/mermaid';
  import { loadRecentPresets, pushRecentPreset, clearRecentPresets } from '$/util/recentPresets';
  import { detectDiagramKind, type DiagramKind } from '$/util/visualEditor/model';
  import { updateCode, validatedState } from '$lib/util/state.svelte';
  import { cn } from '$lib/utils';
  import ShapesIcon from '~icons/material-symbols/account-tree-outline-rounded';
  import ChevronDownIcon from '~icons/material-symbols/keyboard-arrow-down-rounded';
  import ClearIcon from '~icons/material-symbols/delete-sweep-outline-rounded';

  const extras: Record<string, SampleExample[]> = {
    ZenUML: [
      {
        title: '订单服务',
        isDefault: true,
        code: `zenuml
    title Order Service
    @Actor Client #FFEBE6
    @Boundary OrderController #0747A6
    @EC2 <<BFF>> OrderService #E3FCEF
    group BusinessService {
      @Lambda PurchaseService
      @AzureFunction InvoiceService
    }

    @Starter(Client)
    // \`POST /orders\`
    OrderController.post(payload) {
      OrderService.create(payload) {
        order = new Order(payload)
        if(order != null) {
          par {
            PurchaseService.createPO(order)
            InvoiceService.createInvoice(order)
          }
        }
      }
    }
    `
      }
    ]
  };

  // Display names for the example categories: the Record keys come from the
  // examples package (e.g. "Flowchart", "Entity Relationship") and stay
  // untranslated in code paths; only the button labels are localized.
  // Unmapped keys fall back to their original names.
  const CATEGORY_NAMES: Record<string, string> = {
    Architecture: '架构图',
    Block: '方块图',
    C4: 'C4 图',
    Class: '类图',
    'Cynefin Framework': 'Cynefin 框架',
    'Entity Relationship': '实体关系图',
    'Event Modeling': '事件建模',
    Flowchart: '流程图',
    Gantt: '甘特图',
    Git: 'Git 图',
    Ishikawa: '鱼骨图',
    Kanban: '看板',
    Mindmap: '思维导图',
    Packet: '分包图',
    Pie: '饼图',
    Quadrant: '象限图',
    Radar: '雷达图',
    'Railroad (ABNF)': '铁路图 (ABNF)',
    'Railroad (EBNF)': '铁路图 (EBNF)',
    'Railroad (IR)': '铁路图 (IR)',
    'Railroad (PEG)': '铁路图 (PEG)',
    Requirement: '需求图',
    Sankey: '桑基图',
    Sequence: '时序图',
    State: '状态图',
    Timeline: '时间线图',
    TreeView: '树视图',
    Treemap: '矩形树图',
    'User Journey': '用户旅程',
    Venn: '维恩图',
    'Wardley Maps': 'Wardley 地图',
    XY: 'XY 图表',
    ZenUML: 'ZenUML'
  };

  const categoryName = (key: string): string => CATEGORY_NAMES[key] ?? key;

  // 当前图类目高亮（方位感：一眼看出正在编辑哪类图）。仅取唯一映射的
  // 类目——railroad 四变体、swimlane 无对应类目，不高亮。
  const KIND_TO_CATEGORY: Partial<Record<DiagramKind, string>> = {
    architecture: 'Architecture',
    block: 'Block',
    c4: 'C4',
    class: 'Class',
    cynefin: 'Cynefin Framework',
    er: 'Entity Relationship',
    eventmodeling: 'Event Modeling',
    flowchart: 'Flowchart',
    gantt: 'Gantt',
    git: 'Git',
    ishikawa: 'Ishikawa',
    journey: 'User Journey',
    kanban: 'Kanban',
    mindmap: 'Mindmap',
    packet: 'Packet',
    pie: 'Pie',
    quadrant: 'Quadrant',
    radar: 'Radar',
    requirement: 'Requirement',
    sankey: 'Sankey',
    sequence: 'Sequence',
    state: 'State',
    timeline: 'Timeline',
    treemap: 'Treemap',
    treeview: 'TreeView',
    venn: 'Venn',
    wardley: 'Wardley Maps',
    xychart: 'XY',
    zenuml: 'ZenUML'
  };
  const currentCategory = $derived(
    KIND_TO_CATEGORY[detectDiagramKind(validatedState.current.code) ?? 'flowchart']
  );

  // The examples catalogue loads as a separate (non-blocking) chunk; the
  // ZenUML extras render immediately and the catalogue fills the card the
  // moment it arrives — from HTTP cache on every visit after the first.
  let samples = $state<Record<string, SampleExample[]>>({ ...extras });
  $effect(() => {
    // Chunk-load failure (offline first run, flaky cache) must not become an
    // unhandled rejection — the card simply keeps the built-in extras.
    void getSampleDiagrams().then(
      (loaded) => {
        samples = { ...loaded, ...extras };
      },
      (error) => {
        console.warn('示例目录加载失败，仅显示内置示例', error);
      }
    );
  });

  const loadSampleDiagram = (diagramType: string, example: SampleExample): void => {
    recent = pushRecentPreset(diagramType);
    updateCode(example.code, {
      resetPanZoom: true,
      updateDiagram: true
    });
  };

  // 「最近使用」：重复起步高频动作一键直达，localStorage 持久化（最多 6 条）。
  let recent = $state<string[]>(loadRecentPresets());
  // 类目 key 只有在目录里有示例时才渲染（目录 chunk 未加载前过滤）。
  const recentAvailable = $derived(recent.filter((key) => samples[key]));

  const mainDiagrams = [
    'Flowchart',
    'Class',
    'Sequence',
    'Entity Relationship',
    'State',
    'Mindmap'
  ];

  // Reactive: before the catalogue chunk lands only the extras exist, so
  // not-yet-loaded diagram names are filtered out instead of rendering
  // buttons for `undefined` sample lists.
  const diagramOrder = $derived([
    ...mainDiagrams.filter((name) => samples[name]),
    ...Object.keys(samples)
      .filter((key) => !mainDiagrams.includes(key))
      .sort()
  ]);

  // 33 个类目需要快速定位：搜索框同时匹配类目中文名、原始英文名与
  // 示例标题（如「订单服务」），大小写不敏感。
  let presetQuery = $state('');
  const filteredOrder = $derived.by(() => {
    const query = presetQuery.trim().toLowerCase();
    if (!query) {
      return diagramOrder;
    }
    return diagramOrder.filter(
      (name) =>
        name.toLowerCase().includes(query) ||
        categoryName(name).toLowerCase().includes(query) ||
        samples[name]?.some((example) => example.title.toLowerCase().includes(query))
    );
  });
</script>

<Card title="示例图表" isOpen isStackable icon={{ component: ShapesIcon }}>
  <div class="px-2 pt-2">
    <input
      class="h-8 w-full rounded-md border bg-background px-2 text-sm"
      placeholder="搜索图类型或示例…"
      aria-label="搜索示例图表"
      data-testid="preset-search"
      bind:value={presetQuery}
      onkeydown={(event) => {
        if (event.key === 'Escape') {
          presetQuery = '';
        }
      }} />
  </div>
  <div class="flex h-fit max-h-52 flex-wrap gap-2 overflow-y-auto p-2">
    {#if recentAvailable.length > 0}
      <div
        class="flex w-full flex-wrap items-center gap-2 border-b border-dashed pb-2"
        data-testid="preset-recent">
        <span class="text-xs text-muted-foreground">最近使用</span>
        {#each recentAvailable as key (key)}
          <Button
            size="sm"
            variant="outline"
            class="normal-case"
            data-testid="preset-recent-{key}"
            onclick={() => loadSampleDiagram(key, samples[key][0])}>
            {categoryName(key)}
          </Button>
        {/each}
        <!-- 试错一串后最近行被「随手点开看过」的类目占满：一键清空重攒 -->
        <button
          class="ml-auto rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="清空最近使用"
          aria-label="清空最近使用"
          data-testid="preset-recent-clear"
          onclick={() => {
            clearRecentPresets();
            recent = [];
          }}>
          <ClearIcon />
        </button>
      </div>
    {/if}
    {#if filteredOrder.length === 0}
      <div class="w-full py-2 text-center text-sm text-muted-foreground">
        没有匹配「{presetQuery.trim()}」的图类型或示例。
      </div>
    {/if}
    {#each filteredOrder as sample (sample)}
      {@const examples = samples[sample]}
      <div class="flex min-w-20 flex-grow">
        <Button
          size="sm"
          class={cn(
            'flex-grow normal-case',
            examples.length > 1 && 'rounded-r-none',
            sample === currentCategory && 'ring-2 ring-primary/60 ring-offset-1'
          )}
          title="Mermaid 关键字：{sample}"
          aria-current={sample === currentCategory ? 'true' : undefined}
          onclick={() => loadSampleDiagram(sample, examples[0])}>
          {categoryName(sample)}
        </Button>
        {#if examples.length > 1}
          <Popover.Root>
            <Popover.Trigger
              aria-label="选择{categoryName(sample)}示例"
              class={cn(
                buttonVariants({ size: 'sm' }),
                'rounded-l-none border-l border-primary-foreground/30 px-0.5 [&_svg]:size-5'
              )}>
              <ChevronDownIcon />
            </Popover.Trigger>
            <Popover.Content align="start" class="flex w-fit flex-col gap-1 p-1">
              {#each examples as example (example.title)}
                <Popover.Close
                  class={cn(
                    buttonVariants({ variant: 'ghost', size: 'sm' }),
                    'justify-start normal-case'
                  )}
                  onclick={() => loadSampleDiagram(sample, example)}>
                  {example.title}
                </Popover.Close>
              {/each}
            </Popover.Content>
          </Popover.Root>
        {/if}
      </div>
    {/each}
  </div>
</Card>
