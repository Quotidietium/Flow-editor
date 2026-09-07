<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import { onMount } from 'svelte';
  import { Button, buttonVariants } from '$/components/ui/button';
  import * as Popover from '$/components/ui/popover';
  import { getSampleDiagrams, type SampleExample } from '$/util/mermaid';
  import { codePreview } from '$/util/codePreview';
  import { notify } from '$/util/notify';
  import { loadRecentPresets, pushRecentPreset, clearRecentPresets } from '$/util/recentPresets';
  import {
    deleteUserSample,
    loadUserSamples,
    saveUserSample,
    type UserSample
  } from '$/util/userSamples';
  import { detectDiagramKind, type DiagramKind } from '$/util/visualEditor/model';
  import { updateCode, validatedState } from '$lib/util/state.svelte';
  import { cn } from '$lib/utils';
  import ShapesIcon from '~icons/material-symbols/account-tree-outline-rounded';
  import ChevronDownIcon from '~icons/material-symbols/keyboard-arrow-down-rounded';
  import CopyIcon from '~icons/material-symbols/content-copy-outline-rounded';
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

  // 复制示例代码：借鉴骨架不必整图替换当前文档（不触发 recent/不更新代码）。
  const copyExampleCode = async (example: SampleExample): Promise<void> => {
    try {
      await navigator.clipboard.writeText(example.code);
      notify(`已复制「${example.title}」的代码`);
    } catch {
      notify('复制失败');
    }
  };

  // 「最近使用」：重复起步高频动作一键直达，localStorage 持久化（最多 6 条）。
  let recent = $state<string[]>(loadRecentPresets());
  // 类目 key 只有在目录里有示例时才渲染（目录 chunk 未加载前过滤）。
  const recentAvailable = $derived(recent.filter((key) => samples[key]));

  // 资产导入联动：导入直接写 storage，重读本列表（不刷新页面）
  onMount(() => {
    const refresh = () => (userSamples = loadUserSamples());
    window.addEventListener('flow-assets-changed', refresh);
    return () => window.removeEventListener('flow-assets-changed', refresh);
  });

  /* ---------------- 我的示例（用户整图模板，localStorage 持久化） ----------------
     与「我的配置模板」（配置）/「我的代码片段」（光标处插入）三足鼎立：
     我的示例 = 整图载入（updateCode 网关，与内置示例同路径）。 */
  let userSamples = $state<UserSample[]>(loadUserSamples());
  let sampleSaveOpen = $state(false);
  let sampleSaveName = $state('');

  const startSampleSave = () => {
    sampleSaveName = '';
    sampleSaveOpen = true;
  };

  const confirmSampleSave = () => {
    const label = sampleSaveName.trim();
    if (!label) {
      notify('请输入示例名称');
      return;
    }
    const code = validatedState.current.code;
    if (code.trim().length === 0) {
      notify('当前代码为空，未保存');
      return;
    }
    userSamples = saveUserSample(label, code);
    sampleSaveOpen = false;
    notify(`已保存示例「${label}」`);
  };

  const loadUserSample = (sample: UserSample) => {
    updateCode(sample.code, { resetPanZoom: true, updateDiagram: true });
  };

  const removeUserSample = (sample: UserSample) => {
    userSamples = deleteUserSample(sample.id);
    // 删除可撤销（循环 171）：误点即恢复；同名示例已重建则不覆盖。
    notify(`已删除示例「${sample.label}」`, {
      action: {
        label: '撤销',
        onClick: () => {
          if (userSamples.some((s) => s.label === sample.label)) {
            notify('已存在同名示例，未恢复');
            return;
          }
          userSamples = saveUserSample(sample.label, sample.code);
          notify(`已恢复示例「${sample.label}」`);
        }
      },
      duration: 8000
    });
  };

  // 双击重命名（历史条目同款交互）：saveUserSample 按新名建条（同名覆盖
  // 语义），旧条随后删除——代码原样保留。
  const renameUserSample = (sample: UserSample) => {
    const next = prompt('重命名示例', sample.label)?.trim();
    if (!next || next === sample.label) {
      return;
    }
    userSamples = deleteUserSample(sample.id);
    userSamples = saveUserSample(next, sample.code);
    notify(`已重命名为「${next}」`);
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

  // 33 个类目需要快速定位：搜索框同时匹配类目中文名、原始英文名与
  // 示例标题（如「订单服务」），大小写不敏感。
  let presetQuery = $state('');
  const presetQueryLower = $derived(presetQuery.trim().toLowerCase());
  const filteredOrder = $derived.by(() => {
    const query = presetQueryLower;
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
  // 我的示例行吃同一个查询词（标签匹配；保存入口始终可见）
  const visibleUserSamples = $derived(
    presetQueryLower === ''
      ? userSamples
      : userSamples.filter((sample) => sample.label.toLowerCase().includes(presetQueryLower))
  );

  // 类目网格方向键导航（循环 142）：卡片几十个按钮，键盘用户逐 Tab
  // 穿越成本高——←/→ 按 DOM 序前后移动，↑/↓ 按「视觉行」跳（按钮
  // flex-wrap 后按 offsetTop 分行、保持列位）。焦点不在网格内时不劫持。
  let presetGridEl: HTMLDivElement | undefined = $state();
  const onPresetGridKeydown = (event: KeyboardEvent): void => {
    if (!presetGridEl || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    const buttons = Array.from(presetGridEl.querySelectorAll<HTMLButtonElement>('button')).filter(
      (button) => button.offsetParent !== null
    );
    const active = document.activeElement;
    const current = buttons.indexOf(active as HTMLButtonElement);
    if (current === -1) {
      return;
    }
    // 按 offsetTop 把按钮分成视觉行
    const rows: HTMLButtonElement[][] = [];
    let rowTop: number | undefined;
    for (const button of buttons) {
      if (button.offsetTop !== rowTop) {
        rowTop = button.offsetTop;
        rows.push([]);
      }
      rows[rows.length - 1]?.push(button);
    }
    let rowIndex = rows.findIndex((row) => row.includes(active as HTMLButtonElement));
    let colIndex = rows[rowIndex]?.indexOf(active as HTMLButtonElement) ?? 0;
    let target: HTMLButtonElement | undefined;
    if (event.key === 'ArrowLeft') {
      target = buttons[Math.max(0, current - 1)];
    } else if (event.key === 'ArrowRight') {
      target = buttons[Math.min(buttons.length - 1, current + 1)];
    } else if (event.key === 'ArrowUp') {
      rowIndex = Math.max(0, rowIndex - 1);
      target = rows[rowIndex]?.[colIndex] ?? rows[rowIndex]?.[rows[rowIndex].length - 1];
    } else {
      rowIndex = Math.min(rows.length - 1, rowIndex + 1);
      target = rows[rowIndex]?.[colIndex] ?? rows[rowIndex]?.[rows[rowIndex].length - 1];
    }
    if (target && target !== active) {
      event.preventDefault();
      target.focus();
    }
  };
</script>

<Card
  title="示例图表"
  isOpen={window.innerWidth >= 640}
  isStackable
  persistKey="flowCardPreset"
  icon={{ component: ShapesIcon }}>
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
        } else if (
          event.key === 'Enter' &&
          !event.isComposing &&
          event.keyCode !== 229 &&
          filteredOrder.length > 0
        ) {
          // Enter 载入首个匹配（键盘闭环：搜索→回车，不必挪手点按钮；
          // IME 选词回车不算——双守卫）
          const first = filteredOrder[0];
          loadSampleDiagram(first, samples[first][0]);
        }
      }} />
  </div>
  <!-- 键盘委托在网格容器上：a11y 告警豁免——容器只接收子按钮冒泡的
       方向键（焦点始终在按钮内，容器非交互目标），等价网格 roving 模式 -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="flex h-fit max-h-52 flex-wrap gap-2 overflow-y-auto p-2"
    role="group"
    aria-label="示例图表按钮组（方向键导航）"
    bind:this={presetGridEl}
    onkeydown={onPresetGridKeydown}>
    <div
      class="flex w-full flex-wrap items-center gap-2 border-b border-dashed pb-2"
      data-testid="user-samples">
      <span class="text-xs text-muted-foreground">我的示例</span>
      {#each visibleUserSamples as sample (sample.id)}
        <span class="inline-flex items-center">
          <Button
            size="sm"
            variant="outline"
            class="normal-case"
            data-testid="user-sample-{sample.id}"
            title="载入示例（整图替换当前文档） · {codePreview(sample.code)}（双击重命名）"
            onclick={() => loadUserSample(sample)}
            ondblclick={() => renameUserSample(sample)}>
            {sample.label}
          </Button>
          <button
            class="rounded p-1 opacity-40 hover:bg-accent hover:opacity-100"
            title="删除示例「{sample.label}」"
            aria-label="删除示例{sample.label}"
            data-testid="user-sample-delete-{sample.id}"
            onclick={() => removeUserSample(sample)}>
            <ClearIcon class="size-3.5" />
          </button>
        </span>
      {/each}
      {#if sampleSaveOpen}
        <span class="inline-flex items-center gap-1">
          <input
            class="h-7 w-28 rounded border bg-background px-1.5 text-xs"
            placeholder="示例名称…"
            aria-label="示例名称"
            data-testid="user-sample-save-name"
            bind:value={sampleSaveName}
            onkeydown={(event) => {
              if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
                confirmSampleSave();
              } else if (event.key === 'Escape') {
                sampleSaveOpen = false;
              }
            }} />
          <button
            class="h-7 shrink-0 rounded border px-2 text-xs hover:bg-accent"
            data-testid="user-sample-save-confirm"
            onclick={confirmSampleSave}>
            保存
          </button>
        </span>
      {:else}
        <button
          class="rounded border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
          data-testid="user-sample-save"
          onclick={startSampleSave}>
          ＋ 保存当前图为示例
        </button>
      {/if}
    </div>
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
            title="Mermaid 关键字：{key}"
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
              <!-- 示例数角标：一眼看出哪些类目有备选变体。放在触发钮内——
                   主钮 textContent 绝不能污染（getByText exact 选择器会撞，
                   循环 31/本轮 loadSite+actions 双实证）；aria-label 不受
                   子文本影响，aria-hidden 只是双保险。 -->
              <span aria-hidden="true" class="rounded bg-primary/10 px-0.5 text-[10px]">
                {examples.length}
              </span>
            </Popover.Trigger>
            <Popover.Content align="start" class="flex w-fit flex-col gap-1 p-1">
              {#each examples as example (example.title)}
                <div class="flex items-center gap-0.5">
                  <Popover.Close
                    class={cn(
                      buttonVariants({ variant: 'ghost', size: 'sm' }),
                      'flex-1 justify-start normal-case'
                    )}
                    onclick={() => loadSampleDiagram(sample, example)}>
                    {example.title}
                  </Popover.Close>
                  <!-- 复制代码：借鉴骨架不必整图替换当前文档（只取不替） -->
                  <button
                    class="rounded p-1 opacity-50 hover:bg-accent hover:opacity-100"
                    title="复制「{example.title}」的代码"
                    aria-label="复制{example.title}的代码"
                    data-testid="preset-example-copy"
                    onclick={(event) => {
                      event.stopPropagation();
                      void copyExampleCode(example);
                    }}>
                    <CopyIcon class="size-3.5" />
                  </button>
                </div>
              {/each}
            </Popover.Content>
          </Popover.Root>
        {/if}
      </div>
    {/each}
  </div>
</Card>
