/**
 * useMotionCapture — optimized hook
 * - Runs HANDS every frame (priority for drawing)
 * - Runs POSE only if settings.showSkeleton
 * - Runs FACE only if settings.showFaceMesh
 * - FPS capped at settings.fpsLimit
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { motionCapture } from "../services/mediapipe";
import type { Settings, TrackingResult } from "../types";

const EMPTY: TrackingResult = {
  faceLandmarks: [], poseLandmarks: [],
  leftHandLandmarks: [], rightHandLandmarks: [], poseWorldLandmarks: [],
};

const RES: Record<string, { width: number; height: number }> = {
  "480p": { width: 640, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

export function useMotionCapture(settings: Settings) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const settingsRef = useRef(settings);
  const [trackingResult, setTrackingResult] = useState<TrackingResult>(EMPTY);
  const [fps, setFps] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { settingsRef.current = settings; }, [settings]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsTracking(false);
    setFps(0);
    setTrackingResult(EMPTY);
  }, []);

  const start = useCallback(async () => {
    setError(null);

    // 1. Init MediaPipe
    try {
      await motionCapture.init();
      setIsReady(true);
    } catch (err) {
      setError(`Failed to load AI models: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }

    // 2. Camera
    let stream: MediaStream;
    try {
      const r = RES[settingsRef.current.cameraResolution] || RES["720p"];
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: r.width }, height: { ideal: r.height }, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("NotAllowed") || msg.includes("denied"))
        setError("Camera permission denied. Allow camera access and retry.");
      else if (msg.includes("NotFound"))
        setError("No camera found. Connect a camera and retry.");
      else
        setError(`Camera error: ${msg}`);
      return;
    }

    streamRef.current = stream;

    // 3. Attach to video
    const video = videoRef.current;
    if (!video) {
      setError("Video element not found.");
      stream.getTracks().forEach(t => t.stop());
      return;
    }

    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    try { await video.play(); } catch {}

    setIsTracking(true);
  }, [stop]);

  // Detection loop
  useEffect(() => {
    if (!isTracking) return;

    let raf = 0;
    let lastFrame = 0;
    let lastTs = 0;
    let frames = 0;
    let lastFpsTime = performance.now();
    let paused = false;

    const onVis = () => { paused = document.hidden; };
    document.addEventListener("visibilitychange", onVis);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (paused) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const now = performance.now();
      const s = settingsRef.current;
      const interval = 1000 / Math.max(15, s.fpsLimit);
      const elapsed = now - lastFrame;
      if (elapsed < interval) return;
      lastFrame = now - (elapsed % interval);

      let ts = Math.floor(video.currentTime * 1000);
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;

      // Only run detectors that are enabled (MAJOR perf win)
      const result = motionCapture.detect(video, ts, {
        runPose: s.showSkeleton,
        runFace: s.showFaceMesh,
      });
      setTrackingResult(result);

      // FPS
      frames++;
      const fpsElapsed = now - lastFpsTime;
      if (fpsElapsed >= 500) {
        setFps(Math.round((frames * 1000) / fpsElapsed));
        frames = 0;
        lastFpsTime = now;
      }
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [isTracking]);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, trackingResult, fps, isTracking, isReady, error, start, stop };
}
