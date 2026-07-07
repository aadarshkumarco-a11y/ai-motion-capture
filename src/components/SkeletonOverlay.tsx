import { useEffect } from "react";
import type { RefObject } from "react";
import type { Landmark, Settings, TrackingResult } from "../types";
import { POSE_CONNECTIONS, HAND_CONNECTIONS, FACE_CONNECTIONS } from "../types";

type Props = {
  canvasRef: RefObject<HTMLCanvasElement>;
  trackingResult: TrackingResult | null;
  settings: Settings;
};

const COLORS = {
  pose: "#22c55e",
  hands: "#f97316",
  face: "#06b6d4",
} as const;

/**
 * Draws skeleton / face / hand landmarks onto the provided canvas.
 *
 * Note on mirroring: the canvas element itself is rendered with a CSS
 * `scaleX(-1)` transform by the parent (CameraView) whenever
 * `settings.mirror` is on, so drawing happens in normalized (unmirrored)
 * coordinates and the visual flip is applied uniformly to the video,
 * skeleton overlay and drawing overlay — keeping everything aligned.
 */
export default function SkeletonOverlay({
  canvasRef,
  trackingResult,
  settings,
}: Props) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = (w: number, h: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!trackingResult) return;

      const toPx = (lm: Landmark) => ({ x: lm.x * w, y: lm.y * h });

      const visible = (lm: Landmark) =>
        lm.visibility === undefined || lm.visibility >= 0.5;

      const drawConnections = (
        landmarks: Landmark[],
        conns: [number, number][],
        color: string,
        width: number
      ) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const [a, b] of conns) {
          const la = landmarks[a];
          const lb = landmarks[b];
          if (!la || !lb) continue;
          if (!visible(la) || !visible(lb)) continue;
          const pa = toPx(la);
          const pb = toPx(lb);
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
        }
        ctx.stroke();
      };

      const drawDots = (
        landmarks: Landmark[],
        color: string,
        radius: number
      ) => {
        ctx.fillStyle = color;
        for (const lm of landmarks) {
          if (!visible(lm)) continue;
          const p = toPx(lm);
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // Pose skeleton (green)
      if (settings.showSkeleton && trackingResult.poseLandmarks?.length) {
        drawConnections(trackingResult.poseLandmarks, POSE_CONNECTIONS, COLORS.pose, 3);
        drawDots(trackingResult.poseLandmarks, COLORS.pose, 3);
      }

      // Face mesh (cyan)
      if (settings.showFaceMesh && trackingResult.faceLandmarks?.length) {
        drawConnections(trackingResult.faceLandmarks, FACE_CONNECTIONS, COLORS.face, 1);
        drawDots(trackingResult.faceLandmarks, COLORS.face, 1);
      }

      // Hands (orange)
      if (settings.showHands) {
        if (trackingResult.leftHandLandmarks?.length) {
          drawConnections(trackingResult.leftHandLandmarks, HAND_CONNECTIONS, COLORS.hands, 3);
          drawDots(trackingResult.leftHandLandmarks, COLORS.hands, 3);
        }
        if (trackingResult.rightHandLandmarks?.length) {
          drawConnections(trackingResult.rightHandLandmarks, HAND_CONNECTIONS, COLORS.hands, 3);
          drawDots(trackingResult.rightHandLandmarks, COLORS.hands, 3);
        }
      }
    };

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render(w, h);
    };

    draw();

    // Re-render on container resize
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [
    canvasRef,
    trackingResult,
    settings.showSkeleton,
    settings.showFaceMesh,
    settings.showHands,
  ]);

  // This component is renderless — the canvas element lives in CameraView.
  return null;
}
