import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { motion } from "framer-motion";
import { Loader2, CameraOff, Activity } from "lucide-react";
import type { Settings, GestureType } from "../types";

type Props = {
  videoRef: RefObject<HTMLVideoElement>;
  skeletonCanvasRef: RefObject<HTMLCanvasElement>;
  drawingCanvasRef: RefObject<HTMLCanvasElement>;
  onReady: () => void;
  settings: Settings;
  onGesture: (g: GestureType) => void;
  isTracking: boolean;
};

const RESOLUTIONS: Record<Settings["cameraResolution"], { w: number; h: number }> = {
  "480p": { w: 640, h: 480 },
  "720p": { w: 1280, h: 720 },
  "1080p": { w: 1920, h: 1080 },
};

type Status = "loading" | "ready" | "error";

export default function CameraView({
  videoRef,
  skeletonCanvasRef,
  drawingCanvasRef,
  onReady,
  settings,
  onGesture,
  isTracking,
}: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [fps, setFps] = useState(0);
  const [confidence, setConfidence] = useState(0);

  const fpsRef = useRef({ frames: 0, last: performance.now() });
  // onGesture is invoked by the tracking pipeline once gestures are detected.
  void onGesture;

  // Start / restart camera when resolution changes
  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    setStatus("loading");

    const res = RESOLUTIONS[settings.cameraResolution] ?? RESOLUTIONS["720p"];

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: res.w }, height: { ideal: res.h } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatus("ready");
        onReady();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Camera access denied";
        setErrorMsg(msg);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.cameraResolution]);

  // FPS counter (rAF-based, throttled by fpsLimit)
  useEffect(() => {
    if (status !== "ready") return;
    let raf = 0;
    const interval = 1000 / Math.max(15, settings.fpsLimit);
    let acc = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      acc += delta;
      if (acc >= 1000) {
        const ref = fpsRef.current;
        setFps(ref.frames);
        ref.frames = 0;
        ref.last = now;
        acc = 0;
      }
      if (delta >= interval) {
        fpsRef.current.frames += 1;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status, settings.fpsLimit]);

  // Placeholder confidence: real values are fed by the tracking pipeline.
  useEffect(() => {
    setConfidence(isTracking ? 0.85 : 0);
  }, [isTracking]);

  const mirrorStyle = settings.mirror ? { transform: "scaleX(-1)" as const } : undefined;

  return (
    <div className="relative w-full h-full bg-black">
      {/* hidden-but-rendered source video */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          ...mirrorStyle,
          visibility: status === "ready" ? "visible" : "hidden",
        }}
      />

      {/* overlay canvases (mirrored to match the video display) */}
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

      {/* HUD */}
      {status === "ready" && (
        <>
          <div className="absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs font-mono z-20">
            <span
              className={
                fps >= 24
                  ? "text-green-400"
                  : fps >= 12
                    ? "text-yellow-400"
                    : "text-red-400"
              }
            >
              {fps} FPS
            </span>
          </div>

          <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-full glass text-xs z-20">
            <Activity
              size={14}
              className={isTracking ? "text-green-400" : "text-white/40"}
            />
            <span className="text-white/70 hidden sm:inline">Confidence</span>
            <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-cyan transition-all duration-300"
                style={{ width: `${Math.round(confidence * 100)}%` }}
              />
            </div>
          </div>
        </>
      )}

      {/* Loading spinner */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 bg-bg/40">
          <Loader2 className="animate-spin text-accent" size={40} />
          <p className="text-sm">Initializing camera…</p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6 bg-bg/60"
        >
          <CameraOff size={48} className="text-red-400" />
          <p className="text-white font-semibold">Camera unavailable</p>
          <p className="text-sm text-white/60 max-w-sm">{errorMsg}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-4 py-2 rounded-full bg-accent hover:bg-purple-600 transition text-sm font-medium"
          >
            Retry
          </button>
        </motion.div>
      )}
    </div>
  );
}
