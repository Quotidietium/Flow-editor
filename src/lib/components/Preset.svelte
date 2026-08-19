<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import { Button, buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { getSampleDiagrams, type SampleExample } from '$/util/mermaid';
  import { updateCode } from '$lib/util/state.svelte';
  import { cn } from '$lib/utils';
  import ShapesIcon from '~icons/material-symbols/account-tree-outline-rounded';
  import ChevronDownIcon from '~icons/material-symbols/keyboard-arrow-down-rounded';

  const extras: Record<string, SampleExample[]> = {
    ZenUML: [
      {
        title: 'Order Service',
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

  // The examples catalogue loads as a separate (non-blocking) chunk; the
  // ZenUML extras render immediately and the catalogue fills the card the
  // moment it arrives — from HTTP cache on every visit after the first.
  let samples = $state<Record<string, SampleExample[]>>({ ...extras });
  $effect(() => {
    void getSampleDiagrams().then((loaded) => {
      samples = { ...loaded, ...extras };
    });
  });

  const loadSampleDiagram = (diagramType: string, example: SampleExample): void => {
    updateCode(example.code, {
      resetPanZoom: true,
      updateDiagram: true
    });
  };

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
</script>

<Card title="示例图表" isOpen isStackable icon={{ component: ShapesIcon }}>
  <div class="flex h-fit max-h-52 flex-wrap gap-2 overflow-y-auto p-2">
    {#each diagramOrder as sample (sample)}
      {@const examples = samples[sample]}
      <div class="flex min-w-20 flex-grow">
        <Button
          size="sm"
          class={cn('flex-grow normal-case', examples.length > 1 && 'rounded-r-none')}
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
