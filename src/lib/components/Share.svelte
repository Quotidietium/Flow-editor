<script lang="ts">
  import { buttonVariants } from '$/components/ui/button';
  import * as Dialog from '$/components/ui/dialog';
  import { Input } from '$/components/ui/input';
  import { Separator } from '$/components/ui/separator';
  import { Switch } from '$/components/ui/switch';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import { MERMAID_LOOKS, MERMAID_THEMES, TID } from '$/constants';
  import { isDarkTheme, type EmbedMode } from '$/util/embed';
  import { EMBED_IFRAME_SANDBOX, buildEmbedSnippets, buildEmbedUrls } from '$/util/embedCode';
  import { silentlySanitizeConfig } from '$/util/sanitize';
  import { validatedState } from '$/util/state.svelte';
  import { copyToClipboard } from '$/util/util';
  import { asset, base } from '$app/paths';
  import CodeIcon from '~icons/material-symbols/code';
  import ShareIcon from '~icons/material-symbols/share';
  import CopyButton from './CopyButton.svelte';
  import CopyInput from './CopyInput.svelte';

  const sanitizedConfig = $derived(silentlySanitizeConfig(validatedState.current.mermaid));
  // Deliberate initial-value capture: the embed form seeds from the config at
  // mount time and then owns its values.
  // svelte-ignore state_referenced_locally
  const initialConfig = sanitizedConfig;
  const initialTheme = (initialConfig.theme as string | undefined) ?? 'default';
  let theme = $state(initialTheme);
  let look = $state((initialConfig.look as string | undefined) ?? 'classic');
  let mode = $state<EmbedMode>(isDarkTheme(initialTheme) ? 'dark' : 'light');
  let controls = $state(true);
  let grid = $state(true);
  let width = $state('100%');
  let height = $state('480');
  let format = $state<'iframe' | 'webComponent'>('iframe');
  let showPreview = $state(false);

  // The expensive half (config sanitize + pako serialize) is independent of
  // width/height, so typing in the size inputs only re-runs the snippet strings.
  const embedUrls = $derived(
    buildEmbedUrls({
      code: validatedState.current.code,
      config: sanitizedConfig,
      controls,
      grid,
      host: window.location.origin + base,
      look,
      mode,
      theme
    })
  );
  const snippets = $derived(buildEmbedSnippets(embedUrls, { height, width }));
  const snippet = $derived(format === 'webComponent' ? snippets.webComponent : snippets.iframe);
</script>

<Dialog.Root>
  <Dialog.Trigger class={buttonVariants({ size: 'sm' })}>分享</Dialog.Trigger>
  <Dialog.Content class="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2 text-xl">
        <ShareIcon class="size-5" /> 分享链接
      </Dialog.Title>
      <Dialog.Description>与他人分享你的图表。</Dialog.Description>
    </Dialog.Header>

    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h2 class="flex items-center gap-2">
          <img class="size-5" src={asset('/favicon.svg')} alt="Flow 编辑器" />
          Flow 编辑器
        </h2>
        <CopyInput value={window.location.href} />
        <div class="mt-1 flex flex-col gap-1">
          <span class="text-xs text-muted-foreground">只读链接（接收者只能查看与缩放）</span>
          <!-- 内联求值（每次打开对话框取当下 hash）：脚本顶层常量在页面
               挂载时求值，hash 未落/编辑后更新都会拿到过期链接 -->
          <CopyInput
            testID="share-view-link"
            value={window.location.origin + base + '/view' + window.location.hash} />
        </div>
        <Dialog.Description>你创建的图表内容永远不会离开你的浏览器。</Dialog.Description>
      </div>
      <Separator />
      <div class="flex flex-col gap-3">
        <h2 class="flex items-center gap-2">
          <CodeIcon class="size-5" />
          嵌入
        </h2>
        <Dialog.Description>在你自己的网站或博客中嵌入实时交互图表。</Dialog.Description>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">
            主题
            <select
              bind:value={theme}
              class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              {#each MERMAID_THEMES as themeName (themeName)}
                <option value={themeName}>{themeName}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            外观
            <select
              bind:value={look}
              class="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground">
              {#each MERMAID_LOOKS as lookName (lookName)}
                <option value={lookName}>{lookName}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            宽度
            <Input bind:value={width} />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            高度
            <Input bind:value={height} />
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-4">
          <ToggleGroup.Root
            type="single"
            variant="outline"
            value={mode}
            onValueChange={(value) => {
              if (value === 'light' || value === 'dark') {
                mode = value;
              }
            }}>
            <ToggleGroup.Item value="light">浅色</ToggleGroup.Item>
            <ToggleGroup.Item value="dark">深色</ToggleGroup.Item>
          </ToggleGroup.Root>
          <label class="flex items-center gap-2 text-sm">
            <Switch bind:checked={controls} />
            控件
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Switch bind:checked={grid} />
            网格
          </label>
          <label class="flex items-center gap-2 text-sm">
            <Switch bind:checked={showPreview} />
            预览
          </label>
        </div>
        {#if showPreview}
          <iframe
            data-testid={TID.embedPreview}
            src={embedUrls.url}
            title="嵌入预览"
            class="h-52 w-full rounded-lg border"
            sandbox={EMBED_IFRAME_SANDBOX}></iframe>
        {/if}
        <div class="flex items-start gap-2">
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <ToggleGroup.Root
              type="single"
              variant="outline"
              value={format}
              onValueChange={(value) => {
                if (value === 'iframe' || value === 'webComponent') {
                  format = value;
                }
              }}>
              <ToggleGroup.Item value="iframe">iframe</ToggleGroup.Item>
              <ToggleGroup.Item value="webComponent">Web 组件</ToggleGroup.Item>
            </ToggleGroup.Root>
            <textarea
              data-testid={TID.embedSnippet}
              readonly
              rows="4"
              class="w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground"
              value={snippet}></textarea>
          </div>
          <CopyButton onclick={() => copyToClipboard(snippet)} />
        </div>
      </div>
    </div>
  </Dialog.Content>
</Dialog.Root>
