export type WorkbenchCardKind = "chat" | "plan" | "canvas";
export type WorkbenchCardId = string;

export interface CardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  customized?: boolean;
  fullscreen?: boolean;
}

export type ResizeDirection = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

export interface ViewportBounds {
  width: number;
  height: number;
  bottomReserve?: number;
}

const cardViewportMarginX = 0;
const cardViewportMarginTop = 0;
const cardViewportBottomReserve = 0;

export function resizeLayout(layout: CardLayout, direction: ResizeDirection, deltaX: number, deltaY: number, minWidth: number, minHeight: number, viewport: ViewportBounds): CardLayout {
  const bottomReserve = viewportBottomReserve(viewport);
  const maxWidth = Math.max(280, viewport.width - cardViewportMarginX * 2);
  const maxHeight = Math.max(240, viewport.height - cardViewportMarginTop - bottomReserve);
  const effectiveMinWidth = Math.min(minWidth, maxWidth);
  const effectiveMinHeight = Math.min(minHeight, maxHeight);
  const west = direction.includes("w");
  const east = direction.includes("e");
  const north = direction.includes("n");
  const south = direction.includes("s");
  const width = Math.min(maxWidth, Math.max(effectiveMinWidth, Math.round(layout.width + (east ? deltaX : 0) - (west ? deltaX : 0))));
  const height = Math.min(maxHeight, Math.max(effectiveMinHeight, Math.round(layout.height + (south ? deltaY : 0) - (north ? deltaY : 0))));
  return {
    ...layout,
    x: west ? Math.round(layout.x + layout.width - width) : layout.x,
    y: north ? Math.round(layout.y + layout.height - height) : layout.y,
    width,
    height
  };
}

export function fitCardLayoutToViewport(layout: CardLayout, viewport: ViewportBounds): CardLayout {
  const bottomReserve = viewportBottomReserve(viewport);
  const maxWidth = Math.max(280, viewport.width - cardViewportMarginX * 2);
  const maxHeight = Math.max(240, viewport.height - cardViewportMarginTop - bottomReserve);
  const width = Math.min(layout.width, maxWidth);
  const height = Math.min(layout.height, maxHeight);
  const maxX = Math.max(cardViewportMarginX, viewport.width - cardViewportMarginX - width);
  const maxY = Math.max(cardViewportMarginTop, viewport.height - bottomReserve - height);
  return {
    ...layout,
    x: clamp(layout.x, cardViewportMarginX, maxX),
    y: clamp(layout.y, cardViewportMarginTop, maxY),
    width,
    height
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function viewportBottomReserve(_viewport: ViewportBounds) {
  return cardViewportBottomReserve;
}
