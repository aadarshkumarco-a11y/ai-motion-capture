/**
 * useMotionCapture
 *
 * React hook that wires together the camera stream, the MediaPipe
 * detection loop and the app's Settings. Returns a ref for the
 * <video> element plus reactive state for tracking output, FPS and
 * errors.
 *
 * Responsibilities:
 *   - Start / stop getUserMedia camera stream
 *   - Initialize the MotionCaptureService (Hand + Pose + Face)
 *   - Run a requestAnimationFrame detection loop with an FPS cap
 *   - Pause the loop when the tab is hidden (visibilitychange)
 *   - Apply detectionConfidence, fpsLimit and cameraResolution live
 *   - Surface human-readable camera permission errors
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motionCapture } from "../services/mediapipe";
import type { Settings, TrackingResult } from "../types";

const EMPTY_RESULT: TrackingResult = {
  faceLandmarks: [],
  poseLandmarks: [],
  leftHandLandmarks: [],
  rightHandLandmarks: [],
  poseWorldLandmarks: [],
};

const RESOLUTIONS: Record<
  Settings["cameraResolution"],
  { width: number; height: number }
> = {
  "480p": { width: 640, height: 480 },
  "720p": { width: 1280, height: 720 },
  "1080p": { width: 1920, height: 1080 },
};

export interface UseMotionCaptureReturn {
  /** Attach to a <video> element used as the camera source. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Latest normalized tracking result (empty when not tracking). */
  trackingResult: TrackingResult;
  /** Recent measured FPS of the detection loop. */
  fps: number;
  /** True while the camera + loop are actively running. */
  isTracking: boolean;
  /** True once MediaPipe models finished loading at least once. */
  isReady: boolean;
  /** Human-readable error string, or null. */
  error: string | null;
  /** Request camera access, init MediaPipe and start the loop. */
  start: () => Promise<void>;
  /** Stop the loop and release the camera. */
  stop: () => void;
}

/**
 * @param settings Live settings object — the hook reads the latest
 *                 values via a ref so changes apply without restarting
 *                 the loop.
 */
export function useMotionCapture(
  settings: Settings,
): UseMotionCaptureReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const settingsRef = useRef<Settings>(settings);

  const [trackingResult, setTrackingResult] =
    useState<TrackingResult>(EMPTY_RESULT);
  const [fps, setFps] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the latest settings available to the rAF loop without forcing
  // it to restart on every settings change.
  useEffect(() => {
    settingsRef.current = settings;
    // Live-apply confidence + smoothing without restarting the camera.
    motionCapture.setConfidence(settings.detectionConfidence);
  }, [settings]);

  // ------------------------------------------------------------------
  // Stop helper (also used as the unmount cleanup)
  // ------------------------------------------------------------------
  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.srcObject = null;
      } catch {
        /* ignore */
      }
    }
    setIsTracking(false);
    setFps(0);
    setTrackingResult(EMPTY_RESULT);
  }, []);

  // ------------------------------------------------------------------
  // Start helper
  // ------------------------------------------------------------------
  const start = useCallback(async () => {
    setError(null);

    // 1. Init MediaPipe (idempotent — safe to call repeatedly).
    try {
      await motionCapture.initMotionCapture();
      motionCapture.setConfidence(settingsRef.current.detectionConfidence);
      setIsReady(true);
    } catch (err) {
      setError(
        `Failed to load motion models: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    // 2. Request camera.
    let stream: MediaStream;
    try {
      const res = RESOLUTIONS[settingsRef.current.cameraResolution];
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: res.width },
          height: { ideal: res.height },
          facingMode: "user",
        },
        audio: false,
      });
    } catch (err) {
      setError(formatCameraError(err));
      stop();
      return;
    }
    streamRef.current = stream;

    // 3. Attach stream to the <video> element.
    const video = videoRef.current;
    if (!video) {
      setError("Video element is not mounted.");
      stop();
      return;
    }
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    try {
      await video.play();
    } catch {
      /* autoplay may be blocked; rely on user gesture */
    }

    // 4. Flip the isTracking flag, which the rAF effect listens to.
    setIsTracking(true);
  }, [stop]);

  // ------------------------------------------------------------------
  // Detection loop — driven by isTracking. Re-creates the loop only
  // when isTracking transitions, not on every render.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isTracking) return;

    let rafId = 0;
    let lastFrameTime = 0;
    let lastVideoTs = 0;
    let frameCount = 0;
    let lastFpsUpdate = performance.now();
    let cancelled = false;
    // Hidden tabs should pause the detection loop but keep the camera
    // open so a re-focus can resume instantly.
    let paused = false;

    const onVisibility = () => {
      paused = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);

    const loop = () => {
      if (cancelled) return;
      rafId = requestAnimationFrame(loop);

      if (paused) return;

      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      const now = performance.now();
      const s = settingsRef.current;
      const frameInterval = 1000 / Math.max(1, s.fpsLimit);
      const elapsed = now - lastFrameTime;
      if (elapsed < frameInterval) return;
      lastFrameTime = now - (elapsed % frameInterval);

      // MediaPipe requires strictly increasing timestamps (ms).
      let ts = Math.floor(video.currentTime * 1000);
      if (ts <= lastVideoTs) ts = lastVideoTs + 1;
      lastVideoTs = ts;

      try {
        const result = motionCapture.detect(video, ts);
        // `mirror` is honored by the rendering layer (canvas overlay),
        // not here — landmark coordinates stay in raw video space.
        setTrackingResult(result);
      } catch (err) {
        console.error("[useMotionCapture] detect failed:", err);
      }

      // FPS sampling (every ~500ms).
      frameCount += 1;
      const fpsElapsed = now - lastFpsUpdate;
      if (fpsElapsed >= 500) {
        setFps(Math.round((frameCount * 1000) / fpsElapsed));
        frameCount = 0;
        lastFpsUpdate = now;
      }
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isTracking]);

  // ------------------------------------------------------------------
  // Cleanup on unmount: stop the camera + loop.
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    videoRef,
    trackingResult,
    fps,
    isTracking,
    isReady,
    error,
    start,
    stop,
  };
}

/**
 * Maps a getUserMedia / MediaPipe error to a user-friendly message.
 */
function formatCameraError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("notallowed") || lower.includes("permission") ||
      lower.includes("denied")) {
    return "Camera permission denied. Please allow camera access in your browser and try again.";
  }
  if (lower.includes("notfound") || lower.includes("devicesnotfound")) {
    return "No camera was found. Please connect a camera and try again.";
  }
  if (lower.includes("notreadable") || lower.includes("trackstart")) {
    return "Your camera is in use by another application. Close it and try again.";
  }
  if (lower.includes("overconstrained") || lower.includes("constraint")) {
    return "The requested camera resolution is not supported by your device.";
  }
  if (lower.includes("notsupported") || lower.includes("secure context")) {
    return "Camera access requires HTTPS or localhost.";
  }
  return `Camera error: ${msg}`;
}
