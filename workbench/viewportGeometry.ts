export type CameraMode = 'fit' | 'fill' | 'actual' | 'custom';
export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
export interface Camera extends Point {
  scale: number;
  mode: CameraMode;
}

export const MIN_SCALE = 0.01;
export const MAX_SCALE = 32;

export function clampScale(scale: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** The image rectangle that is actually visible inside the viewport. */
export function visibleImageBounds(
  camera: Camera,
  image: Size,
  viewport: Size,
) {
  const clampX = (x: number) => Math.max(0, Math.min(viewport.width, x));
  const clampY = (y: number) => Math.max(0, Math.min(viewport.height, y));
  return {
    left: clampX(camera.x),
    right: clampX(camera.x + image.width * camera.scale),
    top: clampY(camera.y),
    bottom: clampY(camera.y + image.height * camera.scale),
  };
}

export function centeredCamera(
  image: Size,
  viewport: Size,
  mode: Exclude<CameraMode, 'custom'>,
): Camera {
  const padding =
    mode === 'fit' ? Math.min(24, viewport.width / 8, viewport.height / 8) : 0;
  const widthRatio = Math.max(1, viewport.width - padding * 2) / image.width;
  const heightRatio = Math.max(1, viewport.height - padding * 2) / image.height;
  const scale = clampScale(
    mode === 'actual'
      ? 1
      : mode === 'fill'
        ? Math.max(widthRatio, heightRatio)
        : Math.min(widthRatio, heightRatio),
  );
  return {
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2,
    scale,
    mode,
  };
}

/** Preserve the image coordinate underneath a viewport-space anchor. */
export function zoomAt(
  camera: Camera,
  requestedScale: number,
  anchor: Point,
): Camera {
  const scale = clampScale(requestedScale);
  const ratio = scale / camera.scale;
  return {
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
    scale,
    mode: 'custom',
  };
}

export function zoomToSelection(
  camera: Camera,
  start: Point,
  end: Point,
  viewport: Size,
): Camera {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width < 6 || height < 6) return camera;
  const scale = clampScale(
    camera.scale * Math.min(viewport.width / width, viewport.height / height),
  );
  const ratio = scale / camera.scale;
  return {
    x: viewport.width / 2 - ((start.x + end.x) / 2 - camera.x) * ratio,
    y: viewport.height / 2 - ((start.y + end.y) / 2 - camera.y) * ratio,
    scale,
    mode: 'custom',
  };
}
