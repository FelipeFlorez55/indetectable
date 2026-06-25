// Canvas — raw point capture (spec 01) and rendering (spec 02). The raw captured
// points are kept strictly separate from the smoothed display path (§6.3).

export { attachStrokeCapture, toCanvasPoint } from "./capture.ts";
export type { CaptureCallbacks, CaptureOptions } from "./capture.ts";
export {
  PROCEDURAL_STYLE,
  HUMAN_STYLE,
  toStrokeInput,
  getOutline,
  toDisplayPath,
  renderStroke,
  clearCanvas,
  fitCanvasToContainer,
  animateAutoDraw,
  animateScene,
  strokeBBox,
  renderAccusation,
} from "./render.ts";
export type { RenderStyle, BBox } from "./render.ts";
