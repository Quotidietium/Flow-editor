import type { State } from '$/types';
import Hammer from 'hammerjs';
import type { Point } from 'mermaid/dist/types.js';
import panzoom from 'svg-pan-zoom';
type PanZoom = typeof panzoom;

export class PanZoomState {
  private pan?: Point;
  private zoom?: number;
  private pzoom: PanZoom | undefined;
  private isDirty = false;
  private resizeObserver: ResizeObserver;

  public isPanEnabled: boolean;
  public onPanZoomChange?: (pan: Point, zoom: number) => void;
  /** 缩放百分比读数的订阅（工具栏 UI）；与 onPanZoomChange 互不干扰。 */
  public onZoomLevelChange?: (zoom: number) => void;

  /** 当前缩放（实例实时值优先，未初始化时回落记忆值/1）。 */
  public currentZoom(): number {
    return this.pzoom?.getZoom() ?? this.zoom ?? 1;
  }

  constructor() {
    this.isPanEnabled = true;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      if (!this.isDirty) {
        this.reset();
      }
    });
  }

  public updateElement(diagramView: SVGElement, { pan, zoom }: Pick<State, 'pan' | 'zoom'>) {
    this.pzoom?.destroy();
    let hammer: HammerManager | undefined;
    this.pzoom = panzoom(diagramView, {
      center: true,
      controlIconsEnabled: false,
      customEventsHandler: {
        haltEventListeners: ['touchstart', 'touchend', 'touchmove', 'touchleave', 'touchcancel'],
        init: function (options) {
          const instance = options.instance;
          let initialScale = 1;
          let pannedX = 0;
          let pannedY = 0;
          hammer = new Hammer(options.svgElement);

          const resetPanned = () => {
            pannedX = 0;
            pannedY = 0;
          };
          const handlePan = (event: HammerInput) => {
            instance.panBy({ x: event.deltaX - pannedX, y: event.deltaY - pannedY });
            pannedX = event.deltaX;
            pannedY = event.deltaY;
          };

          hammer.get('pinch').set({ enable: true });
          hammer.on('panstart panmove', function (event) {
            if (event.type === 'panstart') {
              resetPanned();
            }
            handlePan(event);
          });
          hammer.on('pinchstart pinchmove', function (event) {
            if (event.type === 'pinchstart') {
              initialScale = instance.getZoom();
              resetPanned();
            }
            instance.zoomAtPoint(initialScale * event.scale, {
              x: event.center.x,
              y: event.center.y
            });
            handlePan(event);
          });
          options.svgElement.addEventListener('touchmove', function (event) {
            event.preventDefault();
          });
        },
        destroy: function () {
          hammer?.destroy();
        }
      },
      fit: true,
      maxZoom: 12,
      minZoom: 0.2,
      onPan: (pan) => {
        this.pan = pan;
        this.zoom = this.pzoom?.getZoom();
        this.isDirty = true;
        if (this.zoom) {
          this.onPanZoomChange?.(this.pan, this.zoom);
          this.onZoomLevelChange?.(this.zoom);
        }
      },
      onZoom: (zoom) => {
        this.zoom = zoom;
        this.pan = this.pzoom?.getPan();
        this.isDirty = true;
        if (this.pan) {
          this.onPanZoomChange?.(this.pan, this.zoom);
        }
        this.onZoomLevelChange?.(zoom);
      },
      panEnabled: true,
      zoomEnabled: true
    });

    this.pzoom.disableDblClickZoom();

    this.resizeObserver.disconnect();
    this.resizeObserver.observe(diagramView);

    // Restored pan/zoom may come from an untrusted serialized state in the
    // URL hash — finiteness alone still admits magnitudes far outside the
    // [0.2, 12] instance limits.
    const clamp = (value: number, min: number, max: number): number =>
      Math.max(min, Math.min(max, value));
    if (pan && zoom && Number.isFinite(zoom) && Number.isFinite(pan.x) && Number.isFinite(pan.y)) {
      this.restorePanZoom(
        {
          x: clamp(pan.x, -1e6, 1e6),
          y: clamp(pan.y, -1e6, 1e6)
        },
        clamp(zoom, 0.2, 12)
      );
    } else {
      this.reset();
    }

    // we start out with both pan and zoom enabled so that the tool can auto position view refreshed
    // then set enable/disable pan based on state
    if (this.isPanEnabled) {
      this.pzoom.enablePan();
      this.pzoom.enableZoom();
    } else {
      this.pzoom.disableZoom();
      this.pzoom.disablePan();
    }

    if (pan === undefined && zoom === undefined) {
      this.reset();
    }
  }

  public restorePanZoom(pan: Point, zoom: number) {
    if (!this.pzoom) {
      console.error('PanZoomState.restorePanZoom: pzoom is not initialized');
      return;
    }
    this.pzoom.zoom(zoom);
    this.pzoom.pan(pan);
    this.onZoomLevelChange?.(zoom);
  }

  public resize() {
    this.pzoom?.resize();
    if (!this.isDirty) {
      this.reset();
    }
  }

  public zoomIn() {
    this.pzoom?.zoomIn();
  }

  public zoomOut() {
    this.pzoom?.zoomOut();
  }

  public reset() {
    this.pzoom?.reset();
    // Zoom out a bit to avoid overlap with the toolbar
    this.pzoom?.zoom(0.875);
    this.onZoomLevelChange?.(0.875);
    this.isDirty = false;
  }

  /**
   * 适应窗口：全图缩放到视口内并居中——大图找不到全貌时一键归位。
   * 与手动平移/缩放同级：新视口写入状态（isDirty + 回调），重载可恢复。
   */
  public fitAndCenter() {
    if (!this.pzoom) {
      return;
    }
    this.pzoom.resize();
    this.pzoom.fit();
    this.pzoom.center();
    const zoom = this.pzoom.getZoom();
    const pan = this.pzoom.getPan();
    this.zoom = zoom;
    this.pan = pan;
    this.isDirty = true;
    this.onPanZoomChange?.(pan, zoom);
    this.onZoomLevelChange?.(zoom);
  }

  /**
   * Release everything this wrapper holds: the svg-pan-zoom instance (which
   * owns window-level resize listeners) and the ResizeObserver. The remembered
   * pan/zoom survive so a later updateElement can restore the viewport.
   * Without this, every mount/unmount of the View (each Visual↔preview
   * toggle) leaked the previous instance's listeners.
   */
  public destroy() {
    this.pzoom?.destroy();
    this.pzoom = undefined;
    this.resizeObserver.disconnect();
    this.onPanZoomChange = undefined;
    this.onZoomLevelChange = undefined;
  }
}
