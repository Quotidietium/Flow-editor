<script lang="ts">
  import Card from '$/components/Card/Card.svelte';
  import CopyButton from '$/components/CopyButton.svelte';
  import { Button } from '$/components/ui/button';
  import { Input } from '$/components/ui/input';
  import { Separator } from '$/components/ui/separator';
  import * as ToggleGroup from '$/components/ui/toggle-group';
  import { waitForRender } from '$/util/autoSync';
  import { exportCanvasSize } from '$/util/fileIO';
  import { notify } from '$/util/notify';
  import {
    diagramFileName,
    downloadTextFile,
    markdownOf,
    openTextFile,
    parseOpenedFile,
    stateFileOf
  } from '$/util/fileIO';
  import {
    pluginExportFormats,
    runImportHandler,
    runInputTransforms,
    runPluginExport
  } from '$/plugins/registry.svelte';
  import {
    inputState,
    sanitizeConfig,
    updateCode,
    updateCodeStore,
    validatedState
  } from '$lib/util/state.svelte';
  import dayjs from 'dayjs';
  import { toBase64 } from 'js-base64';
  import DownloadIcon from '~icons/material-symbols/download';
  import WidthIcon from '~icons/material-symbols/width-rounded';
  import SaveIcon from '~icons/material-symbols/save';
  import FolderIcon from '~icons/material-symbols/folder-open-rounded';

  type Exporter = (context: CanvasRenderingContext2D, image: HTMLImageElement) => () => void;

  const getFileName = (extension: string) =>
    `mermaid-diagram-${dayjs().format('YYYY-MM-DD-HHmmss')}.${extension}`;

  /**
   * Fix text clipping in exported SVG for hand-drawn (rough) mode.
   * svg2roughjs copies foreignObject elements but their height is often insufficient,
   * causing text bottom edges to be cut off regardless of language.
   */
  const fixForeignObjectClipping = (svg: HTMLElement) => {
    const foreignObjects = svg.querySelectorAll('foreignObject');
    foreignObjects.forEach((foreignObj) => {
      const currentHeight = parseFloat(foreignObj.getAttribute('height') || '0');
      if (currentHeight <= 0) return;

      const currentY = parseFloat(foreignObj.getAttribute('y') || '0');
      const newHeight = currentHeight * 1.5;
      const heightDiff = newHeight - currentHeight;

      foreignObj.setAttribute('height', newHeight.toString());
      foreignObj.setAttribute('y', (currentY - heightDiff / 2).toString());

      // Ensure inner HTML elements are vertically centered within the expanded area
      const htmlElements = foreignObj.querySelectorAll('div, span, p');
      htmlElements.forEach((htmlEl) => {
        const el = htmlEl as HTMLElement;
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.height = '100%';
      });
    });
  };

  const getSvgElement = () => {
    const svgElement = document.querySelector('#container svg')?.cloneNode(true) as HTMLElement;
    svgElement.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    return svgElement;
  };

  const getBase64SVG = (svg?: HTMLElement, width?: number, height?: number): string => {
    if (svg) {
      // Prevents the SVG size of the interface from being changed
      svg = svg.cloneNode(true) as HTMLElement;
    }
    if (height) {
      svg?.setAttribute('height', `${height}px`);
    }
    if (width) {
      svg?.setAttribute('width', `${width}px`);
    }
    // Workaround https://stackoverflow.com/questions/28690643/firefox-error-rendering-an-svg-image-to-html5-canvas-with-drawimage

    if (!svg) {
      svg = getSvgElement();
    }

    if (inputState.rough) {
      fixForeignObjectClipping(svg);
    }

    svg.style.backgroundColor = window
      .getComputedStyle(document.body)
      .getPropertyValue('--background');

    const svgString = svg.outerHTML
      .replaceAll('<br>', '<br/>')
      .replaceAll(/<img([^>]*)>/g, (m, g: string) => `<img ${g} />`);

    return toBase64(`<?xml version="1.0" encoding="UTF-8"?>
${svgString}`);
  };

  const simulateDownload = (download: string, href: string): void => {
    const a = document.createElement('a');
    a.download = download;
    a.href = href;
    a.click();
    a.remove();
  };

  /**
   * Wait for the panZoom-off re-render to land and hand back the clean SVG,
   * replacing the previous fixed 1000ms sleep. Resolves as soon as the
   * container holds an SVG without the pan-zoom viewport wrapper (the render
   * may be debounced up to ~1s by autoSync on slow diagrams); on a broken
   * diagram or after the deadline it falls back to whatever is rendered —
   * the same best-effort semantics the sleep had, without the fixed delay.
   */
  const waitForCleanSvg = async (): Promise<HTMLElement> => {
    const deadline = performance.now() + 5000;
    for (;;) {
      await waitForRender();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const svg = document.querySelector<HTMLElement>('#container svg');
      if (
        (svg && !svg.querySelector('g.svg-pan-zoom_viewport')) ||
        validatedState.current.error !== undefined ||
        performance.now() > deadline
      ) {
        if (!svg) {
          throw new Error('svg not found');
        }
        return svg;
      }
    }
  };

  // Export flows toggle panZoom off and wait for the clean re-render; a
  // second concurrent click would race the first (double downloads, panZoom
  // restored mid-flight). Buttons are disabled while one is in progress.
  let exporting = $state(false);

  const exportImage = async (event: Event, exporter: Exporter): Promise<void> => {
    if (exporting) {
      return;
    }
    exporting = true;
    try {
      await runExport(event, exporter);
    } finally {
      exporting = false;
    }
  };

  const runExport = async (event: Event, exporter: Exporter): Promise<void> => {
    updateCodeStore({ panZoom: false });
    const svg = await waitForCleanSvg();
    const canvas = document.createElement('canvas');

    const box = svg.getBoundingClientRect();

    // In rough mode, SVG has width/height="100%" so getBoundingClientRect returns
    // the container size, not the actual diagram size. Use viewBox dimensions instead.
    const svgEl = svg as unknown as SVGSVGElement;
    const viewBox = svgEl.viewBox?.baseVal;
    const contentWidth = viewBox && viewBox.width > 0 ? viewBox.width : box.width;
    const contentHeight = viewBox && viewBox.height > 0 ? viewBox.height : box.height;

    // Typed sizes and degenerate content dimensions are clamped here — the
    // number input's HTML min/max only advises the spinner UI.
    const size = exportCanvasSize(imageSizeMode, imageSize, contentWidth, contentHeight);
    canvas.width = size.width;
    canvas.height = size.height;

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('context not found');
    }

    context.fillStyle = window.getComputedStyle(document.body).getPropertyValue('--background');
    context.fillRect(0, 0, canvas.width, canvas.height);

    const image = new Image();
    image.addEventListener('load', () => {
      exporter(context, image)();
      updateCodeStore({ panZoom: true });
    });
    image.src = `data:image/svg+xml;base64,${getBase64SVG(svg, canvas.width, canvas.height)}`;
    // Fallback to set panZoom to true after 2 seconds
    // This is a workaround for the case when the image is not loaded
    setTimeout(() => {
      if (!inputState.panZoom) {
        updateCodeStore({ panZoom: true });
      }
    }, 2000);
    event.stopPropagation();
    event.preventDefault();
  };

  const downloadImage: Exporter = (context, image) => {
    return () => {
      const { canvas } = context;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      simulateDownload(
        getFileName('png'),
        canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream')
      );
    };
  };

  const canvasExporter = (mime: 'image/webp' | 'image/jpeg'): Exporter => {
    return (context, image) => {
      return () => {
        const { canvas } = context;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        simulateDownload(
          getFileName(mime === 'image/webp' ? 'webp' : 'jpg'),
          canvas.toDataURL(mime, 0.95).replace(mime, 'image/octet-stream')
        );
      };
    };
  };

  const pdfExporter: Exporter = (context, image) => {
    return () => {
      const { canvas } = context;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      // jsPDF is lazily imported so its ~150KB stays out of the startup chunk.
      void import('jspdf').then(({ jsPDF }) => {
        const pdf = new jsPDF({
          orientation: canvas.width >= canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height]
        });
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(getFileName('pdf'));
      });
    };
  };

  const isClipboardAvailable = (): boolean => {
    return Object.prototype.hasOwnProperty.call(window, 'ClipboardItem');
  };

  const clipboardCopy: Exporter = (context, image) => {
    return () => {
      const { canvas } = context;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        try {
          if (!blob) {
            throw new Error('blob is empty');
          }
          void navigator.clipboard.write([
            new ClipboardItem({
              [blob.type]: blob
            })
          ]);
        } catch (error) {
          console.error(error);
        }
      });
    };
  };

  // Export failures (no rendered SVG — broken diagram, mid-render window)
  // must surface as a toast, never as an uncaught error from the click
  // handler: under rapid double-clicks that meant repeated page errors.
  const onCopyClipboard = async (event?: Event) => {
    if (!event) {
      return;
    }
    try {
      await exportImage(event, clipboardCopy);
    } catch {
      notify('复制图像失败：当前没有可导出的图形');
    }
  };

  const onDownloadPNG = async (event: Event) => {
    try {
      await exportImage(event, downloadImage);
    } catch {
      notify('导出 PNG 失败：当前没有可导出的图形');
    }
  };

  const onDownloadSVG = () => {
    simulateDownload(getFileName('svg'), `data:image/svg+xml;base64,${getBase64SVG()}`);
  };

  // --- local file save / open / extra export formats ---

  let exportOpen = $state(false);
  let exportRef: HTMLDivElement | undefined = $state();

  const onWindowPointerDown = (event: PointerEvent): void => {
    if (exportOpen && exportRef && !exportRef.contains(event.target as Node)) {
      exportOpen = false;
    }
  };

  const onSaveMmd = () => {
    downloadTextFile(diagramFileName('mmd'), validatedState.current.code, 'text/plain');
  };

  const onDownloadMarkdown = () => {
    downloadTextFile(
      diagramFileName('md'),
      markdownOf(validatedState.current.code),
      'text/markdown'
    );
  };

  const onDownloadState = () => {
    downloadTextFile(
      diagramFileName('json'),
      JSON.stringify(
        stateFileOf(validatedState.current.code, validatedState.current.mermaid),
        null,
        2
      ),
      'application/json'
    );
  };

  const onOpenFile = async () => {
    const file = await openTextFile('.mmd,.md,.txt,.json,.mermaid,.zip');
    if (!file) {
      return;
    }
    // Plugin import handlers get first claim (custom formats, incl. binary
    // via bytes), then the built-in parser; either way the entering source
    // passes the plugin input-transform pipeline (cleaning/format conversion).
    const handled = await runImportHandler(file.name, file.text, file.bytes);
    const parsed = handled ?? parseOpenedFile(file.name, file.text);
    if (!parsed) {
      notify(`无法识别文件「${file.name}」的内容`);
      return;
    }
    const code = runInputTransforms(parsed.code, 'file');
    if (parsed.mermaid !== undefined) {
      // Opened state files (and plugin-imported configs) are untrusted input
      // like share links — same confirm-and-strip gate.
      updateCodeStore({ code, mermaid: sanitizeConfig(parsed.mermaid) });
    } else {
      updateCode(code, { updateDiagram: true });
    }
    notify(`已载入「${file.name}」`);
  };

  // Plugin-registered export formats run fully inside the plugin and hand
  // back a payload we just download (text or blob, private formats welcome).
  // run may be async — e.g. the MC designer's JAR export awaits desktop IPC.
  const runPluginFormat = async (formatId: string) => {
    const format = pluginExportFormats().find((f: { id: string }) => f.id === formatId);
    if (!format) {
      return;
    }
    try {
      const payload = await runPluginExport(format);
      if (!payload) {
        notify(`导出失败：插件 ${format.pluginId} 未产出内容`);
        return;
      }
      if (payload.blob) {
        const url = URL.createObjectURL(payload.blob);
        simulateDownload(payload.filename, url);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else if (payload.text !== undefined) {
        downloadTextFile(payload.filename, payload.text, payload.mime);
      }
    } catch {
      // guardedAsync 已隔离并记录插件异常；此处兜底提示（不吞静默失败）
      notify(`导出失败：插件 ${format.pluginId} 执行出错`);
    }
  };

  const onDownloadWebP = async (event: Event) => {
    try {
      await exportImage(event, canvasExporter('image/webp'));
    } catch {
      notify('导出 WebP 失败：当前没有可导出的图形');
    }
  };

  const onDownloadJPEG = async (event: Event) => {
    try {
      await exportImage(event, canvasExporter('image/jpeg'));
    } catch {
      notify('导出 JPEG 失败：当前没有可导出的图形');
    }
  };

  const onDownloadPDF = async (event: Event) => {
    try {
      await exportImage(event, pdfExporter);
    } catch {
      notify('导出 PDF 失败：当前没有可导出的图形');
    }
  };

  let imageSizeMode: 'auto' | 'width' | 'height' = $state('auto');

  $effect(() => {
    if (!imageSizeMode) {
      imageSizeMode = 'auto';
    }
  });

  let imageSize = $state(1080);
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<Card title="操作" isStackable icon={{ component: DownloadIcon, class: 'rotate-180' }}>
  <div class="flex min-w-fit flex-col gap-2 p-2">
    <div class="flex w-full items-center gap-2 py-2 whitespace-nowrap">
      PNG 尺寸
      <ToggleGroup.Root type="single" variant="outline" bind:value={imageSizeMode}>
        <ToggleGroup.Item value="auto">自动</ToggleGroup.Item>
        <ToggleGroup.Item value="width">宽度</ToggleGroup.Item>
        <ToggleGroup.Item value="height">高度</ToggleGroup.Item>
      </ToggleGroup.Root>
      {#if imageSizeMode !== 'auto'}
        <WidthIcon
          class={['size-6 shrink-0 transition-all', imageSizeMode === 'width' && 'rotate-90']} />
      {/if}
      <Input
        type="number"
        min="3"
        max="10000"
        disabled={imageSizeMode === 'auto'}
        bind:value={imageSize} />
    </div>
    {#if imageSizeMode !== 'auto'}
      <!-- 常用分辨率一键填入（宽/高语义随模式切换），省去手敲数字 -->
      <div class="flex items-center gap-1 px-1 pb-1" data-testid="png-size-chips">
        {#each [720, 1080, 1440, 2160] as size (size)}
          <button
            class={[
              'rounded border px-1.5 py-0.5 text-xs hover:bg-accent',
              imageSize === size && 'border-primary text-primary'
            ]}
            data-testid="png-size-{size}"
            onclick={() => (imageSize = size)}>
            {size}
          </button>
        {/each}
      </div>
    {/if}
    <div class="flex gap-2">
      <Button
        class="flex-grow"
        onclick={onSaveMmd}
        data-testid="save-mmd"
        title="保存源码到本地（.mmd）">
        <SaveIcon />
        保存
      </Button>
      <Button
        class="flex-grow"
        onclick={() => void onOpenFile()}
        data-testid="open-file"
        title="打开本地 .mmd/.md/.json 文件">
        <FolderIcon />
        打开
      </Button>
    </div>
    <div class="relative" bind:this={exportRef}>
      <Button
        class="w-full"
        disabled={exporting}
        data-testid="export-menu"
        onclick={() => (exportOpen = !exportOpen)}>
        <DownloadIcon />
        导出 ▾
      </Button>
      {#if exportOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="absolute right-0 z-20 mt-1 min-w-44 rounded-md border bg-popover p-1 text-xs text-popover-foreground shadow-md"
          data-testid="export-menu-list"
          onpointerdown={(e) => e.stopPropagation()}>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            data-testid="download-PNG"
            onclick={(e) => {
              exportOpen = false;
              void onDownloadPNG(e);
            }}>
            PNG 图像
          </button>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            data-testid="download-SVG"
            onclick={() => {
              exportOpen = false;
              onDownloadSVG();
            }}>
            SVG 矢量图
          </button>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            data-testid="download-webp"
            onclick={(e) => {
              exportOpen = false;
              void onDownloadWebP(e);
            }}>
            WebP 图像
          </button>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            data-testid="download-jpeg"
            onclick={(e) => {
              exportOpen = false;
              void onDownloadJPEG(e);
            }}>
            JPEG 图像
          </button>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            data-testid="download-pdf"
            onclick={(e) => {
              exportOpen = false;
              void onDownloadPDF(e);
            }}>
            PDF 文档
          </button>
          <div class="my-1 border-t"></div>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onclick={onDownloadMarkdown}>
            Markdown（代码块）
          </button>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onclick={() => {
              onSaveMmd();
            }}>
            Mermaid 源码（.mmd）
          </button>
          <button
            class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
            onclick={onDownloadState}>
            状态文件（.json）
          </button>
          {#each pluginExportFormats() as format (format.pluginId + ':' + format.id)}
            <div class="my-1 border-t"></div>
            <button
              class="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
              data-testid="plugin-export-{format.id}"
              onclick={() => runPluginFormat(format.id)}>
              {format.label}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <Separator />
    {#if isClipboardAvailable()}
      <CopyButton onclick={onCopyClipboard} disabled={exporting} label="复制图像" />
    {/if}
  </div>
</Card>
