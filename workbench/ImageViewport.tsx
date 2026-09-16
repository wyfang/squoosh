import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import type { WorkbenchItem } from './useWorkbench';
import {
  centeredCamera,
  visibleImageBounds,
  zoomAt,
  zoomToSelection,
  type Camera,
  type CameraMode,
  type Point,
  type Size,
} from './viewportGeometry';
import './viewport.css';

export type ViewMode = 'original' | 'compare' | 'output';
export interface ViewportControls {
  percent: number;
  mode: CameraMode;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  fill: () => void;
  actual: () => void;
  setPercent: (value: number) => void;
}

type Gesture =
  | { kind: 'pan'; pointerId: number; start: Point; camera: Camera }
  | { kind: 'split'; pointerId: number; offset: number }
  | {
      kind: 'zoom';
      pointerId: number;
      start: Point;
      end: Point;
      camera: Camera;
      zoomOut: boolean;
    }
  | {
      kind: 'pinch';
      startDistance: number;
      startMidpoint: Point;
      camera: Camera;
    };

function size(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1048576).toFixed(2)} MB`;
}
function isEditable(target: EventTarget | null) {
  return (
    target instanceof Element &&
    !!target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="spinbutton"], [role="combobox"]',
    )
  );
}
function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export default function ImageViewport({
  item,
  view,
  onControls,
}: {
  item: WorkbenchItem;
  view: ViewMode;
  onControls: (controls: ViewportControls) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const originalPlane = useRef<HTMLDivElement>(null);
  const resultPlane = useRef<HTMLDivElement>(null);
  const resultClip = useRef<HTMLDivElement>(null);
  const splitHandle = useRef<HTMLButtonElement>(null);
  const selection = useRef<HTMLDivElement>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 1, mode: 'fit' });
  const bounds = useRef<Size>({ width: 1, height: 1 });
  const dimensions = useRef<Size>({ width: item.width, height: item.height });
  const split = useRef(0.5);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const keys = useRef({ z: false, space: false, alt: false });
  const frame = useRef<number | null>(null);
  const emitControls = useRef(onControls);
  const lastControls = useRef<{ percent: number; mode: CameraMode } | null>(
    null,
  );
  const methods = useRef<Omit<ViewportControls, 'percent' | 'mode'>>(null!);
  emitControls.current = onControls;
  dimensions.current = { width: item.width, height: item.height };

  const draw = useCallback(() => {
    frame.current = null;
    const current = camera.current;
    const transform = `translate3d(${current.x}px, ${current.y}px, 0) scale(${current.scale})`;
    for (const element of [originalPlane.current, resultPlane.current]) {
      if (element) element.style.transform = transform;
    }
    const visible = visibleImageBounds(
      current,
      dimensions.current,
      bounds.current,
    );
    const visibleWidth = visible.right - visible.left;
    const visibleHeight = visible.bottom - visible.top;
    const splitX = visible.left + split.current * visibleWidth;
    if (resultClip.current)
      resultClip.current.style.clipPath = `inset(0 0 0 ${splitX}px)`;
    if (splitHandle.current) {
      const knobSize = Math.min(32, visibleWidth, visibleHeight);
      const knobX = Math.max(
        visible.left + knobSize / 2,
        Math.min(visible.right - knobSize / 2, splitX),
      );
      splitHandle.current.style.left = `${splitX}px`;
      splitHandle.current.style.top = `${visible.top}px`;
      splitHandle.current.style.height = `${visibleHeight}px`;
      splitHandle.current.style.setProperty(
        '--iv-knob-offset',
        `${knobX - splitX}px`,
      );
      splitHandle.current.style.setProperty('--iv-knob-size', `${knobSize}px`);
      splitHandle.current.style.visibility =
        visibleWidth > 0 && visibleHeight > 0 ? 'visible' : 'hidden';
      splitHandle.current.setAttribute(
        'aria-valuenow',
        String(split.current * 100),
      );
      splitHandle.current.setAttribute(
        'aria-valuetext',
        `${Math.round(split.current * 100)}%`,
      );
    }
    const active = gesture.current;
    if (selection.current) {
      const visible =
        active?.kind === 'zoom' &&
        !active.zoomOut &&
        distance(active.start, active.end) >= 6;
      selection.current.style.display = visible ? 'block' : 'none';
      if (active?.kind === 'zoom') {
        selection.current.style.left = `${Math.min(active.start.x, active.end.x)}px`;
        selection.current.style.top = `${Math.min(active.start.y, active.end.y)}px`;
        selection.current.style.width = `${Math.abs(active.end.x - active.start.x)}px`;
        selection.current.style.height = `${Math.abs(active.end.y - active.start.y)}px`;
      }
    }
    if (viewport.current) {
      const cursor =
        active?.kind === 'pan' || active?.kind === 'pinch'
          ? 'grabbing'
          : keys.current.space
            ? 'grab'
            : keys.current.z
              ? keys.current.alt
                ? 'zoom-out'
                : 'zoom-in'
              : active?.kind === 'split'
                ? 'ew-resize'
                : 'default';
      viewport.current.style.cursor = cursor;
      viewport.current.dataset.tool = keys.current.space
        ? 'pan'
        : keys.current.z
          ? 'zoom'
          : '';
    }
    const percent = current.scale * 100;
    if (
      lastControls.current?.percent !== percent ||
      lastControls.current.mode !== current.mode
    ) {
      lastControls.current = { percent, mode: current.mode };
      emitControls.current({ percent, mode: current.mode, ...methods.current });
    }
  }, []);
  const invalidate = useCallback(() => {
    if (frame.current === null) frame.current = requestAnimationFrame(draw);
  }, [draw]);
  const changeCamera = useCallback(
    (next: Camera) => {
      camera.current = next;
      invalidate();
    },
    [invalidate],
  );
  const cancelGesture = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    const captured = new Set(touches.current.keys());
    if (active && 'pointerId' in active) captured.add(active.pointerId);
    touches.current.clear();
    for (const pointerId of captured) {
      if (viewport.current?.hasPointerCapture(pointerId))
        viewport.current.releasePointerCapture(pointerId);
    }
    invalidate();
  }, [invalidate]);
  const setMode = useCallback(
    (mode: 'fit' | 'fill' | 'actual') => {
      cancelGesture();
      changeCamera(centeredCamera(dimensions.current, bounds.current, mode));
    },
    [cancelGesture, changeCamera],
  );
  const changeZoom = useCallback(
    (scale: number) => {
      if (!Number.isFinite(scale)) return;
      cancelGesture();
      changeCamera(
        zoomAt(camera.current, scale, {
          x: bounds.current.width / 2,
          y: bounds.current.height / 2,
        }),
      );
    },
    [cancelGesture, changeCamera],
  );
  const zoomIn = useCallback(
    () => changeZoom(camera.current.scale * 1.25),
    [changeZoom],
  );
  const zoomOut = useCallback(
    () => changeZoom(camera.current.scale / 1.25),
    [changeZoom],
  );
  const fit = useCallback(() => setMode('fit'), [setMode]);
  const fill = useCallback(() => setMode('fill'), [setMode]);
  const actual = useCallback(() => setMode('actual'), [setMode]);
  const setPercent = useCallback(
    (value: number) => changeZoom(value / 100),
    [changeZoom],
  );
  methods.current = { zoomIn, zoomOut, fit, fill, actual, setPercent };

  useLayoutEffect(() => {
    const element = viewport.current!;
    const measure = () => {
      const next = { width: element.clientWidth, height: element.clientHeight };
      if (!next.width || !next.height) return;
      const previous = bounds.current;
      if (next.width === previous.width && next.height === previous.height)
        return;
      // Gesture snapshots use the old viewport coordinates. Finish them before
      // recentering, so their next event cannot restore the previous camera.
      cancelGesture();
      bounds.current = next;
      if (camera.current.mode === 'fit' || camera.current.mode === 'fill') {
        camera.current = centeredCamera(
          dimensions.current,
          next,
          camera.current.mode,
        );
      } else {
        camera.current = {
          ...camera.current,
          x: camera.current.x + (next.width - previous.width) / 2,
          y: camera.current.y + (next.height - previous.height) / 2,
        };
      }
      invalidate();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [cancelGesture, invalidate]);

  useLayoutEffect(() => {
    cancelGesture();
    camera.current = centeredCamera(dimensions.current, bounds.current, 'fit');
    split.current = 0.5;
    lastControls.current = null;
    invalidate();
  }, [item.id, item.width, item.height, cancelGesture, invalidate]);
  useLayoutEffect(() => {
    invalidate();
  }, [view, item.output?.url, invalidate]);

  useEffect(() => {
    const element = viewport.current!;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (gesture.current) return;
      const rect = element.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? bounds.current.height
            : 1);
      if (!delta) return;
      changeCamera(
        zoomAt(
          camera.current,
          camera.current.scale *
            Math.exp(-Math.max(-500, Math.min(500, delta)) * 0.002),
          { x: event.clientX - rect.left, y: event.clientY - rect.top },
        ),
      );
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        delete element.dataset.pointerFocus;
        if (splitHandle.current)
          delete splitHandle.current.dataset.pointerFocus;
      }
      if (event.code === 'Escape') {
        if (gesture.current) {
          event.preventDefault();
          cancelGesture();
        }
        return;
      }
      if (
        isEditable(event.target) ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.metaKey ||
        event.ctrlKey
      )
        return;
      if (
        event.shiftKey &&
        !event.altKey &&
        (event.code === 'Digit1' || event.code === 'Digit0')
      ) {
        event.preventDefault();
        setMode(event.code === 'Digit1' ? 'fit' : 'actual');
        return;
      }
      if (event.code === 'Space') {
        // Toolbar focus should not disable the temporary Hand tool. Preserve
        // native Space activation on controls while still tracking the key.
        const onControl =
          event.target instanceof Element &&
          event.target.closest('button, a, [role="button"], [role="slider"]') &&
          !element.contains(event.target);
        if (!onControl) event.preventDefault();
        keys.current.space = true;
      } else if (event.code === 'KeyZ') {
        event.preventDefault();
        keys.current.z = true;
      }
      keys.current.alt = event.altKey;
      invalidate();
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space') keys.current.space = false;
      if (event.code === 'KeyZ') keys.current.z = false;
      keys.current.alt = event.altKey;
      invalidate();
    };
    const reset = () => {
      keys.current = { z: false, space: false, alt: false };
      cancelGesture();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    element.addEventListener('wheel', wheel, { passive: false });
    // React Aria controls may stop keyboard bubbling. Observe the physical key
    // before their handlers while preserving native control activation above.
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      element.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [cancelGesture, changeCamera, invalidate, setMode]);

  const pointOf = (event: ReactPointerEvent): Point => {
    const rect = viewport.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const updateSplit = (point: Point) => {
    const visible = visibleImageBounds(
      camera.current,
      dimensions.current,
      bounds.current,
    );
    const width = visible.right - visible.left;
    if (width <= 0) return;
    split.current = Math.max(0, Math.min(1, (point.x - visible.left) / width));
    invalidate();
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return;
    const point = pointOf(event);
    event.preventDefault();
    viewport.current!.dataset.pointerFocus = 'true';
    keys.current.alt = event.altKey;
    const handle =
      event.target instanceof Element && !!event.target.closest('.iv-split');
    if (handle && splitHandle.current)
      splitHandle.current.dataset.pointerFocus = 'true';
    (handle ? splitHandle.current : viewport.current)?.focus({
      preventScroll: true,
    });
    viewport.current!.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, point);
      if (touches.current.size >= 2) {
        const [a, b] = [...touches.current.values()];
        gesture.current = {
          kind: 'pinch',
          startDistance: Math.max(1, distance(a, b)),
          startMidpoint: midpoint(a, b),
          camera: { ...camera.current },
        };
        invalidate();
        return;
      }
    }
    if (keys.current.space || event.button === 1) {
      gesture.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        start: point,
        camera: { ...camera.current },
      };
    } else if (keys.current.z) {
      gesture.current = {
        kind: 'zoom',
        pointerId: event.pointerId,
        start: point,
        end: point,
        camera: { ...camera.current },
        zoomOut: event.altKey,
      };
    } else if (handle) {
      const visible = visibleImageBounds(
        camera.current,
        dimensions.current,
        bounds.current,
      );
      const splitX =
        visible.left + split.current * (visible.right - visible.left);
      gesture.current = {
        kind: 'split',
        pointerId: event.pointerId,
        offset: point.x - splitX,
      };
    } else if (event.pointerType === 'touch') {
      gesture.current = {
        kind: 'pan',
        pointerId: event.pointerId,
        start: point,
        camera: { ...camera.current },
      };
    }
    invalidate();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointOf(event);
    if (touches.current.has(event.pointerId))
      touches.current.set(event.pointerId, point);
    const active = gesture.current;
    if (!active) return;
    if (active.kind === 'pinch') {
      const [a, b] = [...touches.current.values()];
      if (!a || !b) return;
      const mid = midpoint(a, b);
      const next = zoomAt(
        active.camera,
        (active.camera.scale * distance(a, b)) / active.startDistance,
        active.startMidpoint,
      );
      changeCamera({
        ...next,
        x: next.x + mid.x - active.startMidpoint.x,
        y: next.y + mid.y - active.startMidpoint.y,
      });
      return;
    }
    if (active.pointerId !== event.pointerId) return;
    if (active.kind === 'pan') {
      changeCamera({
        ...active.camera,
        mode: 'custom',
        x: active.camera.x + point.x - active.start.x,
        y: active.camera.y + point.y - active.start.y,
      });
    } else if (active.kind === 'split') {
      updateSplit({ ...point, x: point.x - active.offset });
    } else {
      active.end = {
        x: Math.max(0, Math.min(bounds.current.width, point.x)),
        y: Math.max(0, Math.min(bounds.current.height, point.y)),
      };
      invalidate();
    }
  };
  const endPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const active = gesture.current;
    if (
      active?.kind === 'zoom' &&
      active.pointerId === event.pointerId &&
      !cancelled
    ) {
      const point = pointOf(event);
      const end = {
        x: Math.max(0, Math.min(bounds.current.width, point.x)),
        y: Math.max(0, Math.min(bounds.current.height, point.y)),
      };
      if (
        !active.zoomOut &&
        Math.abs(end.x - active.start.x) >= 6 &&
        Math.abs(end.y - active.start.y) >= 6
      ) {
        changeCamera(
          zoomToSelection(active.camera, active.start, end, bounds.current),
        );
      } else if (distance(active.start, end) < 6 || active.zoomOut) {
        changeCamera(
          zoomAt(
            active.camera,
            active.camera.scale * (active.zoomOut ? 0.5 : 2),
            active.start,
          ),
        );
      }
    }
    touches.current.delete(event.pointerId);
    if (active?.kind === 'pinch' && touches.current.size >= 2) {
      const [a, b] = [...touches.current.values()];
      gesture.current = {
        kind: 'pinch',
        startDistance: Math.max(1, distance(a, b)),
        startMidpoint: midpoint(a, b),
        camera: { ...camera.current },
      };
    } else if (active?.kind === 'pinch' && touches.current.size) {
      const [pointerId, point] = touches.current.entries().next().value!;
      gesture.current = {
        kind: 'pan',
        pointerId,
        start: point,
        camera: { ...camera.current },
      };
    } else if (
      !active ||
      active.kind === 'pinch' ||
      active.pointerId === event.pointerId
    ) {
      gesture.current = null;
    }
    // Transition first: releasePointerCapture may dispatch lostpointercapture
    // immediately, and must not cancel the remaining finger's continued pan.
    if (viewport.current?.hasPointerCapture(event.pointerId))
      viewport.current.releasePointerCapture(event.pointerId);
    invalidate();
  };

  const compare = view === 'compare' && !!item.output;
  const output = view === 'output' && !!item.output;
  const resultLabel =
    item.status === 'ready'
      ? { webp: 'WebP', jpeg: 'JPEG', avif: 'AVIF', png: 'PNG' }[
          item.settings.format
        ]
      : '上次结果';
  const planeStyle = { width: item.width, height: item.height };
  return (
    <div
      ref={viewport}
      className="iv-viewport"
      role="region"
      aria-label="图片画布。滚轮缩放；Shift 加 1 适应画布，Shift 加 0 原始像素；按住 Z 点击或框选放大，Z 加 Alt 点击缩小；空格拖动平移。"
      aria-keyshortcuts="Shift+1 Shift+0"
      tabIndex={0}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={(event) => endPointer(event)}
      onPointerCancel={(event) => endPointer(event, true)}
      onLostPointerCapture={(event) => {
        const active = gesture.current;
        const tracked =
          touches.current.has(event.pointerId) ||
          (active &&
            'pointerId' in active &&
            active.pointerId === event.pointerId);
        // Unexpected capture loss must remove its touch as well as the gesture;
        // otherwise the next touch would pinch against a phantom old pointer.
        if (tracked) endPointer(event, true);
      }}
      onAuxClick={(event) => {
        if (event.button === 1) event.preventDefault();
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      <div className="iv-image-plane" ref={originalPlane} style={planeStyle}>
        <img
          src={output ? item.output!.url : item.url}
          alt={output ? '转换结果' : '原始图片'}
          draggable={false}
        />
      </div>
      {compare && (
        <div className="iv-result-clip" ref={resultClip}>
          <div className="iv-image-plane" ref={resultPlane} style={planeStyle}>
            <img src={item.output!.url} alt="转换结果" draggable={false} />
          </div>
        </div>
      )}
      {compare && (
        <button
          ref={splitHandle}
          type="button"
          className="iv-split"
          role="slider"
          aria-label="对比分界线"
          aria-orientation="horizontal"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={split.current * 100}
          onBlur={(event) => {
            delete event.currentTarget.dataset.pointerFocus;
          }}
          onKeyDown={(event) => {
            delete event.currentTarget.dataset.pointerFocus;
            const visible = visibleImageBounds(
              camera.current,
              dimensions.current,
              bounds.current,
            );
            const width = visible.right - visible.left;
            if (width <= 0) return;
            const step = (event.shiftKey ? 10 : 1) / width;
            const next =
              event.key === 'ArrowLeft' || event.key === 'ArrowDown'
                ? split.current - step
                : event.key === 'ArrowRight' || event.key === 'ArrowUp'
                  ? split.current + step
                  : event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? 1
                      : null;
            if (next === null || keys.current.z || keys.current.space) return;
            event.preventDefault();
            split.current = Math.max(0, Math.min(1, next));
            invalidate();
          }}
        >
          <span>
            <ArrowLeftRight size={16} />
          </span>
        </button>
      )}
      <div className="iv-label iv-label-left">
        {output ? resultLabel : '原图'}
        <span>{size(output ? item.output!.blob.size : item.file.size)}</span>
      </div>
      {compare && (
        <div className="iv-label iv-label-right">
          {resultLabel}
          <span>{size(item.output!.blob.size)}</span>
        </div>
      )}
      <div className="iv-selection" ref={selection} aria-hidden="true" />
    </div>
  );
}
