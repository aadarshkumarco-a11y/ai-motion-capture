/**
 * MediaPipe service for AI Motion Capture.
 *
 * Loads HandLandmarker, PoseLandmarker and FaceLandmarker from CDN,
 * runs detection on a <video> element and returns a normalized
 * TrackingResult that the rest of the app can consume.
 *
 * NOTE: This is a Vite + React project (NOT Next.js), so there is no
 * "use client" directive. This module is browser-only.
 */

import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  FaceLandmarker,
  type HandLandmarkerOptions,
  type PoseLandmarkerOptions,
  type FaceLandmarkerOptions,
} from "@mediapipe/tasks-vision";
import type { Landmark, TrackingResult } from "../types";

/** CDN base URL for the tasks-vision WASM runtime. */
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";

/** CDN base URL for the official MediaPipe model assets. */
const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models";

const HAND_MODEL = `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;
const POSE_MODEL = `${MODEL_BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`;
const FACE_MODEL = `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;

/** Empty result returned when detection fails or no landmarks are found. */
export const EMPTY_RESULT: TrackingResult = {
  faceLandmarks: [],
  poseLandmarks: [],
  leftHandLandmarks: [],
  rightHandLandmarks: [],
  poseWorldLandmarks: [],
};

/** Live confidence thresholds applied to all landmarkers. */
export interface ConfidenceThresholds {
  handDetection: number;
  handPresence: number;
  handTracking: number;
  poseDetection: number;
  posePresence: number;
  poseTracking: number;
  faceDetection: number;
  facePresence: number;
  faceTracking: number;
}

const DEFAULT_THRESHOLDS: ConfidenceThresholds = {
  handDetection: 0.5,
  handPresence: 0.5,
  handTracking: 0.5,
  poseDetection: 0.5,
  posePresence: 0.5,
  poseTracking: 0.5,
  faceDetection: 0.5,
  facePresence: 0.5,
  faceTracking: 0.5,
};

export type MotionCaptureStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

/**
 * MotionCaptureService wraps the three MediaPipe landmarkers and exposes
 * a tiny API: `initMotionCapture()`, `detect()` and `setConfidence()`.
 *
 * It is implemented as a class so it can be reused across React renders
 * and so callers can grab a singleton via the exported `motionCapture`
 * instance.
 */
export class MotionCaptureService {
  private handLandmarker: HandLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private faceLandmarker: FaceLandmarker | null = null;

  private status: MotionCaptureStatus = "idle";
  private lastError: string | null = null;

  /** MediaPipe timestamps must be strictly increasing per landmarker. */
  private lastHandTs = -1;
  private lastPoseTs = -1;
  private lastFaceTs = -1;

  private thresholds: ConfidenceThresholds = { ...DEFAULT_THRESHOLDS };

  /** Dedupes concurrent init() calls. */
  private initPromise: Promise<void> | null = null;

  getStatus(): MotionCaptureStatus {
    return this.status;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  isReady(): boolean {
    return this.status === "ready";
  }

  /**
   * Loads all three landmarkers (hand, pose, face) from the CDN.
   * Safe to call multiple times — concurrent calls share the same promise.
   *
   * Tries GPU delegation first and falls back to CPU on failure.
   */
  async initMotionCapture(): Promise<void> {
    if (this.status === "ready") return;
    if (this.initPromise) return this.initPromise;

    this.status = "loading";
    this.lastError = null;

    this.initPromise = this.initializeWithDelegate("GPU").catch(
      async (gpuErr) => {
        console.warn(
          "[MotionCapture] GPU init failed, falling back to CPU:",
          gpuErr,
        );
        try {
          await this.initializeWithDelegate("CPU");
        } catch (cpuErr) {
          this.status = "error";
          this.lastError =
            cpuErr instanceof Error ? cpuErr.message : String(cpuErr);
          this.initPromise = null;
          throw cpuErr;
        }
      },
    );

    return this.initPromise;
  }

  private async initializeWithDelegate(
    delegate: "GPU" | "CPU",
  ): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);

    const handOptions: HandLandmarkerOptions = {
      baseOptions: { modelAssetPath: HAND_MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: this.thresholds.handDetection,
      minHandPresenceConfidence: this.thresholds.handPresence,
      minTrackingConfidence: this.thresholds.handTracking,
    };
    const poseOptions: PoseLandmarkerOptions = {
      baseOptions: { modelAssetPath: POSE_MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: this.thresholds.poseDetection,
      minPosePresenceConfidence: this.thresholds.posePresence,
      minTrackingConfidence: this.thresholds.poseTracking,
    };
    const faceOptions: FaceLandmarkerOptions = {
      baseOptions: { modelAssetPath: FACE_MODEL, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: this.thresholds.faceDetection,
      minFacePresenceConfidence: this.thresholds.facePresence,
      minTrackingConfidence: this.thresholds.faceTracking,
    };

    const [hand, pose, face] = await Promise.all([
      HandLandmarker.createFromOptions(fileset, handOptions),
      PoseLandmarker.createFromOptions(fileset, poseOptions),
      FaceLandmarker.createFromOptions(fileset, faceOptions),
    ]);

    // Dispose any previously created landmarkers (e.g. when re-init happens).
    this.disposeLandmarkers();
    this.handLandmarker = hand;
    this.poseLandmarker = pose;
    this.faceLandmarker = face;
    this.status = "ready";
    this.initPromise = null;
  }

  /**
   * Live-updates confidence thresholds. Re-applies options to all
   * landmarkers that have already been created.
   */
  setConfidence(confidence: number): void {
    const c = Math.min(1, Math.max(0, confidence));
    this.thresholds = {
      handDetection: c,
      handPresence: c,
      handTracking: c,
      poseDetection: c,
      posePresence: c,
      poseTracking: c,
      faceDetection: c,
      facePresence: c,
      faceTracking: c,
    };

    if (this.handLandmarker) {
      this.handLandmarker.setOptions({
        minHandDetectionConfidence: c,
        minHandPresenceConfidence: c,
        minTrackingConfidence: c,
      });
    }
    if (this.poseLandmarker) {
      this.poseLandmarker.setOptions({
        minPoseDetectionConfidence: c,
        minPosePresenceConfidence: c,
        minTrackingConfidence: c,
      });
    }
    if (this.faceLandmarker) {
      this.faceLandmarker.setOptions({
        minFaceDetectionConfidence: c,
        minFacePresenceConfidence: c,
        minTrackingConfidence: c,
      });
    }
  }

  /**
   * Runs all three landmarkers against a video frame and returns a
   * normalized TrackingResult. Each detector is wrapped in its own
   * try/catch so a single failure doesn't abort the others.
   *
   * @param video   The <video> element serving as the camera source.
   * @param timestamp Milliseconds since some epoch. Must be increasing.
   */
  detect(video: HTMLVideoElement, timestamp: number): TrackingResult {
    if (this.status !== "ready") return EMPTY_RESULT;
    if (!video || video.readyState < 2) return EMPTY_RESULT;

    const result: TrackingResult = {
      faceLandmarks: [],
      poseLandmarks: [],
      leftHandLandmarks: [],
      rightHandLandmarks: [],
      poseWorldLandmarks: [],
    };

    // -------- Face --------------------------------------------------
    try {
      if (this.faceLandmarker) {
        const ts = this.bumpTs(timestamp, this.lastFaceTs);
        this.lastFaceTs = ts;
        const r = this.faceLandmarker.detectForVideo(video, ts);
        if (r.faceLandmarks && r.faceLandmarks.length > 0) {
          result.faceLandmarks = normalizeLandmarks(r.faceLandmarks[0]);
        }
      }
    } catch (err) {
      // Re-sync timestamp on the next call to avoid "monotonic" errors.
      this.lastFaceTs = -1;
      console.warn("[MotionCapture] face detect failed:", err);
    }

    // -------- Pose --------------------------------------------------
    try {
      if (this.poseLandmarker) {
        const ts = this.bumpTs(timestamp, this.lastPoseTs);
        this.lastPoseTs = ts;
        const r = this.poseLandmarker.detectForVideo(video, ts);
        if (r.landmarks && r.landmarks.length > 0) {
          result.poseLandmarks = normalizeLandmarks(r.landmarks[0]);
          result.poseWorldLandmarks = normalizeLandmarks(
            r.worldLandmarks?.[0] ?? [],
          );
        }
      }
    } catch (err) {
      this.lastPoseTs = -1;
      console.warn("[MotionCapture] pose detect failed:", err);
    }

    // -------- Hands -------------------------------------------------
    try {
      if (this.handLandmarker) {
        const ts = this.bumpTs(timestamp, this.lastHandTs);
        this.lastHandTs = ts;
        const r = this.handLandmarker.detectForVideo(video, ts);
        const hands = r.landmarks ?? [];
        const handedness = r.handedness ?? [];
        for (let i = 0; i < hands.length; i++) {
          const lm = normalizeLandmarks(hands[i]);
          // MediaPipe `handedness` is reported from the subject's
          // perspective ("Left" = subject's left hand). In a mirrored
          // selfie view that hand appears on the right of the image,
          // but we keep the label as the subject's true hand so the
          // rest of the app can render / bind gestures correctly.
          const label = handedness[i]?.[0]?.categoryName ?? "Right";
          if (label === "Left") {
            result.leftHandLandmarks = lm;
          } else {
            result.rightHandLandmarks = lm;
          }
        }
      }
    } catch (err) {
      this.lastHandTs = -1;
      console.warn("[MotionCapture] hand detect failed:", err);
    }

    return result;
  }

  /** Ensures the timestamp passed to MediaPipe is strictly increasing. */
  private bumpTs(ts: number, lastTs: number): number {
    if (ts <= lastTs) return lastTs + 1;
    return ts;
  }

  /** Releases all landmarker resources. */
  dispose(): void {
    this.disposeLandmarkers();
    this.status = "idle";
    this.initPromise = null;
    this.lastHandTs = -1;
    this.lastPoseTs = -1;
    this.lastFaceTs = -1;
  }

  private disposeLandmarkers(): void {
    try {
      this.handLandmarker?.close();
    } catch {
      /* ignore */
    }
    try {
      this.poseLandmarker?.close();
    } catch {
      /* ignore */
    }
    try {
      this.faceLandmarker?.close();
    } catch {
      /* ignore */
    }
    this.handLandmarker = null;
    this.poseLandmarker = null;
    this.faceLandmarker = null;
  }
}

/** Coerces a raw MediaPipe landmark list into our Landmark type. */
function normalizeLandmarks(input: readonly unknown[]): Landmark[] {
  if (!input || input.length === 0) return [];
  return input.map((raw) => {
    const r = raw as { x: number; y: number; z: number; visibility?: number };
    return {
      x: r.x,
      y: r.y,
      z: r.z,
      visibility: r.visibility,
    } as Landmark;
  });
}

/** Shared singleton used across the app. */
export const motionCapture = new MotionCaptureService();
