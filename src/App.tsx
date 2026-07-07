import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Landing from "./components/Landing";
import CameraView from "./components/CameraView";
import Toolbar from "./components/Toolbar";
import SettingsModal from "./components/Settings";
import SkeletonOverlay from "./components/SkeletonOverlay";
import { useMotionCapture } from "./hooks/useMotionCapture";
import { DrawingEngine } from "./engine/drawing";
import { recognizeGesture } from "./engine/gestures";
import type {
  Settings as SettingsType,
  TrackingResult,
  GestureType,
  BrushType,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

const SETTINGS_KEY = "ai-motion-capture:settings";

export default function App() {
  const [screen, setScreen] = useState<"landing" | "capture">("landing");
  const [settings, setSettings] = useState<SettingsType>(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [brushType, setBrushType] = useState<BrushType>("neon");
  const [color, setColor] = useState("#7c3aed");
  const [brushSize, setBrushSize] = useState(8);
  const [opacity, setOpacity] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [activeGesture, setActiveGesture] = useState<GestureType>("none");

  // Use the hook's videoRef — NOT a separate one!
  const {
    videoRef,
    trackingResult,
    fps,
    isTracking,
    error: captureError,
    start: startCapture,
    stop: stopCapture,
  } = useMotionCapture(settings);

  const skeletonCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingEngineRef = useRef<DrawingEngine | null>(null);
  const isDrawingRef = useRef(false);
  const lastGestureRef = useRef<GestureType>("none");
  const lastGestureTimeRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  useEffect(() => {
    if (screen !== "capture") return;
    const canvas = drawingCanvasRef.current;
    if (!canvas) return;
    drawingEngineRef.current = new DrawingEngine();
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [screen]);

  useEffect(() => {
    if (screen !== "capture" || !isTracking) return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const skCanvas = skeletonCanvasRef.current;
      if (skCanvas && trackingResult) {
        const ctx = skCanvas.getContext("2d");
        if (ctx) {
          const w = skCanvas.clientWidth, h = skCanvas.clientHeight;
          const dpr = window.devicePixelRatio || 1;
          if (skCanvas.width !== w * dpr) { skCanvas.width = w * dpr; skCanvas.height = h * dpr; }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          drawSkeleton(ctx, trackingResult, settings, w, h);
        }
      }
      if (trackingResult && drawingEngineRef.current) {
        const engine = drawingEngineRef.current;
        const drawCanvas = drawingCanvasRef.current;
        const allHands = [
          ...(trackingResult.rightHandLandmarks || []),
          ...(trackingResult.leftHandLandmarks || []),
        ];
        if (allHands.length >= 21) {
          const gesture = recognizeGesture(allHands);
          if (gesture !== lastGestureRef.current) {
            const now = Date.now();
            if (now - lastGestureTimeRef.current > settings.gestureDelay) {
              lastGestureRef.current = gesture;
              lastGestureTimeRef.current = now;
              setActiveGesture(gesture);
              if (gesture === "pinch" || gesture === "index_up") {
                if (!isDrawingRef.current) {
                  engine.startStroke(
                    { x: 0, y: 0, color, size: brushSize, opacity, brushType, timestamp: Date.now() },
                    { brushType, color, size: brushSize, opacity },
                  );
                  isDrawingRef.current = true;
                }
              } else if (gesture === "fist" || gesture === "open_palm") {
                if (isDrawingRef.current) { engine.endStroke(); isDrawingRef.current = false; }
              }
            }
          }
          if (isDrawingRef.current && allHands.length >= 9) {
            const tip = allHands[8];
            if (tip) {
              engine.addPoint({
                x: tip.x * (drawCanvas?.clientWidth || 0),
                y: tip.y * (drawCanvas?.clientHeight || 0),
                color, size: brushSize, opacity, brushType, timestamp: Date.now(),
              });
            }
          }
        } else {
          if (isDrawingRef.current) { engine.endStroke(); isDrawingRef.current = false; }
          lastGestureRef.current = "none";
        }
        if (drawCanvas) {
          const ctx = drawCanvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, drawCanvas.clientWidth, drawCanvas.clientHeight);
            engine.render(ctx);
          }
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [screen, isTracking, trackingResult, settings, brushType, color, brushSize, opacity]);

  const handleStart = useCallback(async () => {
    setScreen("capture");
    // Wait for DOM to render the <video> element, then start capture
    setTimeout(async () => {
      await startCapture();
    }, 300);
  }, [startCapture]);

  const handleUndo = useCallback(() => drawingEngineRef.current?.undo(), []);
  const handleRedo = useCallback(() => drawingEngineRef.current?.redo(), []);
  const handleClear = useCallback(() => drawingEngineRef.current?.clear(), []);

  const handleScreenshot = useCallback(() => {
    const canvas = drawingCanvasRef.current;
    const sk = skeletonCanvasRef.current;
    if (!canvas) return;
    const tmp = document.createElement("canvas");
    tmp.width = canvas.clientWidth;
    tmp.height = canvas.clientHeight;
    const ctx = tmp.getContext("2d");
    if (!ctx) return;
    const v = videoRef.current;
    if (v && v.readyState >= 2) ctx.drawImage(v, 0, 0, tmp.width, tmp.height);
    if (sk) ctx.drawImage(sk, 0, 0, tmp.width, tmp.height);
    ctx.drawImage(canvas, 0, 0, tmp.width, tmp.height);
    tmp.toBlob((b) => {
      if (!b) return;
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = `capture-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(u);
    });
  }, [videoRef]);

  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      recorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const canvas = drawingCanvasRef.current;
    const sk = skeletonCanvasRef.current;
    const tmp = document.createElement("canvas");
    tmp.width = 1280;
    tmp.height = 720;
    const ctx = tmp.getContext("2d");
    if (!ctx) return;
    const stream = tmp.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm" });
    chunksRef.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = () => {
      const b = new Blob(chunksRef.current, { type: "video/webm" });
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = `capture-${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(u);
    };
    const v = videoRef.current;
    const draw = () => {
      if (v && v.readyState >= 2) ctx.drawImage(v, 0, 0, 1280, 720);
      if (sk) ctx.drawImage(sk, 0, 0, 1280, 720);
      if (canvas) ctx.drawImage(canvas, 0, 0, 1280, 720);
      if (rec.state === "recording") requestAnimationFrame(draw);
    };
    draw();
    rec.start();
    recorderRef.current = rec;
    setIsRecording(true);
  }, [isRecording, videoRef]);

  const mirrorStyle = settings.mirror ? { transform: "scaleX(-1)" as const } : undefined;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-white">
      <AnimatePresence mode="wait">
        {screen === "landing" ? (
          <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
            <Landing onStart={handleStart} />
          </motion.div>
        ) : (
          <motion.div key="c" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0">
            {/* Camera + overlays */}
            <div className="relative w-full h-full bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="absolute inset-0 w-full h-full object-cover"
                style={{ ...mirrorStyle, visibility: isTracking ? "visible" : "hidden" }}
              />
              <canvas
                ref={skeletonCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={mirrorStyle}
              />
              <canvas
                ref={drawingCanvasRef}
                className="absolute inset-0 w-full h-full"
                style={mirrorStyle}
              />

              {/* FPS */}
              {fps > 0 && (
                <div className="absolute top-3 right-3 px-3 py-1.5 rounded-full glass text-xs font-mono z-20">
                  <span className={fps >= 24 ? "text-green-400" : "text-yellow-400"}>{fps} FPS</span>
                </div>
              )}

              {/* Error */}
              {captureError && (
                <div className="absolute top-3 left-3 max-w-xs px-3 py-2 rounded-lg glass text-xs text-red-400 z-20">
                  {captureError}
                </div>
              )}

              {/* Loading */}
              {!isTracking && !captureError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 bg-bg/40">
                  <div className="w-10 h-10 border-[3px] border-white/10 border-t-accent rounded-full animate-spin" />
                  <p className="text-sm">Loading AI models & camera…</p>
                </div>
              )}
            </div>

            {/* Skeleton overlay component */}
            <SkeletonOverlay canvasRef={skeletonCanvasRef} trackingResult={trackingResult} settings={settings} />

            {/* Toolbar */}
            <Toolbar
              brushType={brushType}
              setBrushType={setBrushType}
              color={color}
              setColor={setColor}
              brushSize={brushSize}
              setBrushSize={setBrushSize}
              opacity={opacity}
              setOpacity={setOpacity}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onClear={handleClear}
              onScreenshot={handleScreenshot}
              isRecording={isRecording}
              onToggleRecording={handleToggleRecording}
              onOpenSettings={() => setSettingsOpen(true)}
            />

            {/* Gesture indicator */}
            {activeGesture !== "none" && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full glass-strong text-sm font-bold z-30">
                {activeGesture.replace("_", " ").toUpperCase()}
              </div>
            )}

            {/* Settings modal */}
            <AnimatePresence>
              {settingsOpen && (
                <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setSettingsOpen(false)} />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function drawSkeleton(ctx: CanvasRenderingContext2D, result: TrackingResult, settings: SettingsType, w: number, h: number) {
  if (settings.showSkeleton && result.poseLandmarks?.length > 0) {
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3;
    ctx.fillStyle = "#22c55e";
    const c: [number, number][] = [
      [11,12],[11,13],[13,15],[12,14],[14,16],
      [11,23],[12,24],[23,24],[23,25],[24,26],
      [25,27],[27,29],[29,31],[27,31],[26,28],
      [28,30],[30,32],[28,32],
    ];
    for (const [a, b] of c) {
      const la = result.poseLandmarks[a], lb = result.poseLandmarks[b];
      if (la && lb) { ctx.beginPath(); ctx.moveTo(la.x*w, la.y*h); ctx.lineTo(lb.x*w, lb.y*h); ctx.stroke(); }
    }
    for (const lm of result.poseLandmarks) { ctx.beginPath(); ctx.arc(lm.x*w, lm.y*h, 4, 0, Math.PI*2); ctx.fill(); }
  }
  if (settings.showHands) {
    const hands = [{ l: result.rightHandLandmarks }, { l: result.leftHandLandmarks }];
    const hc: [number, number][] = [
      [0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
      [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
      [13,17],[17,18],[18,19],[19,20],[0,17],
    ];
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.fillStyle = "#f97316";
    for (const hand of hands) {
      if (!hand.l || hand.l.length === 0) continue;
      for (const [a, b] of hc) {
        const la = hand.l[a], lb = hand.l[b];
        if (la && lb) { ctx.beginPath(); ctx.moveTo(la.x*w, la.y*h); ctx.lineTo(lb.x*w, lb.y*h); ctx.stroke(); }
      }
      for (const lm of hand.l) { ctx.beginPath(); ctx.arc(lm.x*w, lm.y*h, 3, 0, Math.PI*2); ctx.fill(); }
    }
  }
  if (settings.showFaceMesh && result.faceLandmarks?.length > 0) {
    ctx.fillStyle = "#06b6d4";
    for (let i = 0; i < result.faceLandmarks.length; i += 3) {
      const lm = result.faceLandmarks[i];
      ctx.beginPath();
      ctx.arc(lm.x*w, lm.y*h, 1, 0, Math.PI*2);
      ctx.fill();
    }
  }
}
