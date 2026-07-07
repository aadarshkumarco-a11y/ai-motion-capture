/**
 * Drawing engine for air-drawing.
 *
 * Manages strokes + layers, supports undo/redo (max 50 steps), smooths
 * incoming points via exponential interpolation, and renders each stroke
 * with brush-specific canvas logic.
 *
 * Brush types:
 *   pencil       - thin, slightly transparent, crisp
 *   marker       - medium-thick, mostly opaque
 *   highlighter  - very thick, low-opacity multiply blend
 *   neon         - bright core with a colored outer glow shadow
 *   glow         - soft diffuse glow
 *   rainbow      - hue rotates along the stroke length
 *   calligraphy  - width modulated by stroke direction (pen angle)
 *   eraser       - destination-out composite
 */

import type {
  BrushType,
  DrawingPoint,
  Layer,
  Stroke,
} from "../types";

export interface StrokeOptions {
  brushType: BrushType;
  color: string;
  size: number;
  opacity: number;
  layer?: number;
}

export interface DrawingEngineSnapshot {
  strokes: Stroke[];
  layers: Layer[];
}

const MAX_HISTORY = 50;
const TWO_PI = Math.PI * 2;

let strokeIdCounter = 0;
function newStrokeId(): string {
  strokeIdCounter += 1;
  return `stroke-${Date.now().toString(36)}-${strokeIdCounter}`;
}

let layerIdCounter = 0;
function newLayerId(): string {
  layerIdCounter += 1;
  return `layer-${Date.now().toString(36)}-${layerIdCounter}`;
}

export class DrawingEngine {
  private layers: Layer[] = [];
  private activeLayerId: string;
  private currentStroke: Stroke | null = null;
  private undoStack: DrawingEngineSnapshot[] = [];
  private redoStack: DrawingEngineSnapshot[] = [];
  private maxHistory = MAX_HISTORY;

  /** 0 = no smoothing, 1 = max smoothing. */
  private smoothing = 0.5;

  constructor(smoothing = 0.5, maxHistory = MAX_HISTORY) {
    this.smoothing = smoothing;
    this.maxHistory = maxHistory;
    const firstLayer: Layer = {
      id: newLayerId(),
      name: "Layer 1",
      visible: true,
      locked: false,
      strokes: [],
    };
    this.layers = [firstLayer];
    this.activeLayerId = firstLayer.id;
  }

  // ------------------------------------------------------------------
  // Configuration
  // ------------------------------------------------------------------

  setSmoothing(value: number): void {
    this.smoothing = Math.min(1, Math.max(0, value));
  }

  getSmoothing(): number {
    return this.smoothing;
  }

  setMaxHistory(value: number): void {
    this.maxHistory = Math.max(1, Math.floor(value));
    while (this.undoStack.length > this.maxHistory) this.undoStack.shift();
  }

  // ------------------------------------------------------------------
  // Layer management
  // ------------------------------------------------------------------

  getLayers(): Layer[] {
    return this.layers;
  }

  getActiveLayerId(): string {
    return this.activeLayerId;
  }

  setActiveLayer(id: string): void {
    if (this.layers.some((l) => l.id === id)) this.activeLayerId = id;
  }

  addLayer(name?: string): Layer {
    const layer: Layer = {
      id: newLayerId(),
      name: name ?? `Layer ${this.layers.length + 1}`,
      visible: true,
      locked: false,
      strokes: [],
    };
    this.layers.push(layer);
    this.activeLayerId = layer.id;
    return layer;
  }

  setLayerVisible(id: string, visible: boolean): void {
    const l = this.layers.find((x) => x.id === id);
    if (l) l.visible = visible;
  }

  // ------------------------------------------------------------------
  // Stroke lifecycle
  // ------------------------------------------------------------------

  /** Read-only access to all strokes from all visible layers. */
  getStrokes(): Stroke[] {
    const out: Stroke[] = [];
    for (const layer of this.layers) {
      if (layer.visible) out.push(...layer.strokes);
    }
    return out;
  }

  /** True if a stroke is currently being drawn. */
  isDrawing(): boolean {
    return this.currentStroke !== null;
  }

  /** Returns the in-progress stroke (or null). */
  getCurrentStroke(): Stroke | null {
    return this.currentStroke;
  }

  /**
   * Begins a new stroke with the given starting point and brush options.
   * Pushes the current state onto the undo stack so a later `undo()`
   * will discard this whole stroke.
   */
  startStroke(point: DrawingPoint, opts: StrokeOptions): void {
    // Cancel any in-progress stroke first (shouldn't normally happen).
    if (this.currentStroke) this.endStroke();

    this.pushHistory();

    const targetLayer =
      this.layers.find((l) => l.id === this.activeLayerId) ?? this.layers[0];

    this.currentStroke = {
      id: newStrokeId(),
      points: [{ ...point }],
      layer: this.layers.indexOf(targetLayer),
      brushType: opts.brushType,
      color: opts.color,
      size: opts.size,
      opacity: opts.opacity,
    };
  }

  /**
   * Appends a point to the in-progress stroke. The point is smoothed
   * using exponential interpolation toward the previous point: a higher
   * smoothing value pulls the new point closer to the last one.
   */
  addPoint(point: DrawingPoint): void {
    if (!this.currentStroke) return;
    const pts = this.currentStroke.points;
    if (pts.length === 0) {
      pts.push({ ...point });
      return;
    }
    const last = pts[pts.length - 1];
    // Step factor: smoothing 0 -> follow 1:1, smoothing 1 -> move 30%.
    const step = 1 - this.smoothing * 0.7;
    const smoothed: DrawingPoint = {
      ...point,
      x: last.x + (point.x - last.x) * step,
      y: last.y + (point.y - last.y) * step,
    };
    // Skip near-duplicate points to keep stroke arrays compact.
    const dx = smoothed.x - last.x;
    const dy = smoothed.y - last.y;
    if (dx * dx + dy * dy < 0.0001) return;
    pts.push(smoothed);
  }

  /** Finalizes the in-progress stroke and adds it to the active layer. */
  endStroke(): void {
    if (!this.currentStroke) return;
    const stroke = this.currentStroke;
    this.currentStroke = null;
    // Drop empty strokes entirely.
    if (stroke.points.length === 0) {
      // Roll back the history entry we pushed in startStroke.
      this.undoStack.pop();
      return;
    }
    const layer =
      this.layers[stroke.layer] ??
      this.layers.find((l) => l.id === this.activeLayerId) ??
      this.layers[0];
    layer.strokes.push(stroke);
  }

  /** Cancels the in-progress stroke WITHOUT committing it. */
  cancelStroke(): void {
    if (!this.currentStroke) return;
    this.currentStroke = null;
    // Roll back the history entry that startStroke pushed.
    this.undoStack.pop();
  }

  // ------------------------------------------------------------------
  // History (undo / redo)
  // ------------------------------------------------------------------

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): boolean {
    if (!this.currentStroke) {
      // No in-progress stroke: snapshot BEFORE applying undo so redo
      // can restore the pre-undo state.
      if (this.undoStack.length === 0) return false;
      this.redoStack.push(this.snapshot());
      const prev = this.undoStack.pop()!;
      this.restore(prev);
      return true;
    }
    // If a stroke was in progress, just drop it.
    this.cancelStroke();
    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;
    this.undoStack.push(this.snapshot());
    const next = this.redoStack.pop()!;
    this.restore(next);
    return true;
  }

  /** Clears every stroke on every layer. Pushes a history entry first. */
  clear(): void {
    if (this.currentStroke) this.endStroke();
    const total = this.layers.reduce((n, l) => n + l.strokes.length, 0);
    if (total === 0) return;
    this.pushHistory();
    for (const layer of this.layers) layer.strokes = [];
  }

  // ------------------------------------------------------------------
  // Snapshot helpers
  // ------------------------------------------------------------------

  private snapshot(): DrawingEngineSnapshot {
    return {
      strokes: this.getStrokes().map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) })),
      layers: this.layers.map((l) => ({
        ...l,
        strokes: l.strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) })),
      })),
    };
  }

  private restore(snap: DrawingEngineSnapshot): void {
    // Replace the layer list with a deep clone of the snapshot.
    this.layers = snap.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      locked: l.locked,
      strokes: l.strokes.map((s) => ({
        ...s,
        points: s.points.map((p) => ({ ...p })),
      })),
    }));
    // Keep the active layer id valid.
    if (!this.layers.some((l) => l.id === this.activeLayerId)) {
      this.activeLayerId = this.layers[0]?.id ?? "";
    }
  }

  private pushHistory(): void {
    this.undoStack.push(this.snapshot());
    while (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------

  /**
   * Renders every visible stroke (plus the in-progress one) onto the
   * supplied 2D context. The caller is responsible for clearing the
   * canvas before calling.
   */
  render(ctx: CanvasRenderingContext2D): void {
    for (const layer of this.layers) {
      if (!layer.visible) continue;
      for (const stroke of layer.strokes) this.renderStroke(ctx, stroke);
    }
    if (this.currentStroke) this.renderStroke(ctx, this.currentStroke);
  }

  /** Renders a single stroke with brush-specific styling. */
  private renderStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
    const pts = stroke.points;
    if (pts.length === 0) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (stroke.brushType) {
      case "pencil":
        ctx.globalAlpha = clamp01(stroke.opacity * 0.85);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(0.5, stroke.size * 0.6);
        this.drawSmoothPath(ctx, pts);
        break;

      case "marker":
        ctx.globalAlpha = clamp01(stroke.opacity * 0.95);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, stroke.size * 1.2);
        this.drawSmoothPath(ctx, pts);
        break;

      case "highlighter":
        ctx.globalAlpha = clamp01(stroke.opacity * 0.35);
        ctx.globalCompositeOperation = "multiply";
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(2, stroke.size * 2.5);
        ctx.lineCap = "butt";
        this.drawSmoothPath(ctx, pts);
        break;

      case "neon":
        // Colored outer glow.
        ctx.shadowBlur = Math.max(4, stroke.size * 2.5);
        ctx.shadowColor = stroke.color;
        ctx.globalAlpha = clamp01(stroke.opacity);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, stroke.size);
        this.drawSmoothPath(ctx, pts);
        // Bright white core.
        ctx.shadowBlur = 0;
        ctx.globalAlpha = clamp01(stroke.opacity);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(0.5, stroke.size * 0.35);
        this.drawSmoothPath(ctx, pts);
        break;

      case "glow":
        ctx.shadowBlur = Math.max(6, stroke.size * 3.5);
        ctx.shadowColor = stroke.color;
        ctx.globalAlpha = clamp01(stroke.opacity * 0.75);
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = Math.max(1, stroke.size * 0.8);
        this.drawSmoothPath(ctx, pts);
        // Second soft pass for a richer halo.
        ctx.shadowBlur = Math.max(2, stroke.size * 1.5);
        ctx.globalAlpha = clamp01(stroke.opacity * 0.5);
        this.drawSmoothPath(ctx, pts);
        break;

      case "rainbow":
        ctx.globalAlpha = clamp01(stroke.opacity);
        ctx.lineWidth = Math.max(1, stroke.size);
        this.drawRainbowPath(ctx, pts);
        break;

      case "calligraphy":
        ctx.globalAlpha = clamp01(stroke.opacity);
        ctx.strokeStyle = stroke.color;
        this.drawCalligraphyPath(ctx, pts, stroke.size);
        break;

      case "eraser":
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(0,0,0,1)";
        ctx.lineWidth = Math.max(2, stroke.size * 2);
        this.drawSmoothPath(ctx, pts);
        break;
    }

    ctx.restore();
  }

  /**
   * Draws a stroke as a series of quadratic curves through the
   * midpoints between consecutive points. This produces a smooth
   * Catmull-Rom-like spline with very little math.
   */
  private drawSmoothPath(ctx: CanvasRenderingContext2D, pts: DrawingPoint[]): void {
    if (pts.length === 1) {
      this.drawDot(ctx, pts[0]);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  /** Solid filled dot for single-point strokes. */
  private drawDot(ctx: CanvasRenderingContext2D, p: DrawingPoint): void {
    const r = Math.max(0.5, (ctx.lineWidth || 1) / 2);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TWO_PI);
    ctx.fillStyle = (ctx.strokeStyle as string) ?? p.color;
    ctx.fill();
  }

  /** Hue-rotating rainbow stroke. */
  private drawRainbowPath(ctx: CanvasRenderingContext2D, pts: DrawingPoint[]): void {
    if (pts.length === 1) {
      ctx.fillStyle = `hsl(0, 100%, 55%)`;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(0.5, ctx.lineWidth / 2), 0, TWO_PI);
      ctx.fill();
      return;
    }
    for (let i = 1; i < pts.length; i++) {
      const hue = (i / pts.length) * 360;
      ctx.strokeStyle = `hsl(${hue}, 100%, 55%)`;
      ctx.beginPath();
      // Use the midpoint trick for smoother hue transitions.
      if (i === 1) {
        ctx.moveTo(pts[0].x, pts[0].y);
      } else {
        const mx = (pts[i - 2].x + pts[i - 1].x) / 2;
        const my = (pts[i - 2].y + pts[i - 1].y) / 2;
        ctx.moveTo(mx, my);
      }
      const ex = (pts[i - 1].x + pts[i].x) / 2;
      const ey = (pts[i - 1].y + pts[i].y) / 2;
      ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, ex, ey);
      ctx.stroke();
    }
  }

  /**
   * Calligraphy brush: line width varies with the stroke direction.
   * Vertical strokes are thicker, horizontal strokes thinner, mimicking
   * a flat-nib pen held at a 45deg angle.
   */
  private drawCalligraphyPath(
    ctx: CanvasRenderingContext2D,
    pts: DrawingPoint[],
    baseSize: number,
  ): void {
    if (pts.length === 1) {
      ctx.fillStyle = (ctx.strokeStyle as string) ?? pts[0].color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(0.5, baseSize), 0, TWO_PI);
      ctx.fill();
      return;
    }
    const penAngle = Math.PI / 4; // 45deg nib
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      const angle = Math.atan2(dy, dx);
      // Width scales with how perpendicular the stroke is to the nib.
      const factor = Math.abs(Math.sin(angle - penAngle));
      ctx.lineWidth = Math.max(0.5, baseSize * (0.35 + factor * 0.9));
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------------
  // Misc
  // ------------------------------------------------------------------

  /** Total number of committed strokes across all layers. */
  size(): number {
    return this.layers.reduce((n, l) => n + l.strokes.length, 0);
  }

  /** Returns a deep-cloned snapshot of the current state. */
  exportSnapshot(): DrawingEngineSnapshot {
    return this.snapshot();
  }

  /** Restores from a previously exported snapshot (no history pushed). */
  importSnapshot(snap: DrawingEngineSnapshot): void {
    this.restore(snap);
    this.undoStack = [];
    this.redoStack = [];
  }
}

// --------------------------------------------------------------------
// Module-private helpers
// --------------------------------------------------------------------

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
