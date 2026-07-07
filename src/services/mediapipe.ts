/**
 * MediaPipe service — optimized for performance.
 * Runs HAND detection first (most important), then pose/face only if enabled.
 */
import {
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  FaceLandmarker,
} from "@mediapipe/tasks-vision";
import type { Landmark, TrackingResult } from "../types";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_BASE = "https://storage.googleapis.com/mediapipe-models";
const HAND_MODEL = `${MODEL_BASE}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`;
const POSE_MODEL = `${MODEL_BASE}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`;
const FACE_MODEL = `${MODEL_BASE}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`;

export const EMPTY_RESULT: TrackingResult = {
  faceLandmarks: [], poseLandmarks: [],
  leftHandLandmarks: [], rightHandLandmarks: [], poseWorldLandmarks: [],
};

class MotionCaptureService {
  private hand: HandLandmarker | null = null;
  private pose: PoseLandmarker | null = null;
  private face: FaceLandmarker | null = null;
  private ready = false;
  private loading: Promise<void> | null = null;
  private lastHandTs = 0;
  private lastPoseTs = 0;
  private lastFaceTs = 0;

  async init(): Promise<void> {
    if (this.ready) return;
    if (this.loading) return this.loading;

    this.loading = this._init();
    return this.loading;
  }

  private async _init(): Promise<void> {
    try {
      const fs = await FilesetResolver.forVisionTasks(WASM_URL);

      // Hand first (most important, lightest)
      try {
        this.hand = await HandLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        console.log("[MP] Hand landmarker ready");
      } catch (e) {
        console.warn("[MP] Hand GPU failed, trying CPU:", e);
        this.hand = await HandLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: HAND_MODEL, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 2,
        });
      }

      // Pose (optional, load lazily)
      try {
        this.pose = await PoseLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: POSE_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numPoses: 1,
        });
        console.log("[MP] Pose landmarker ready");
      } catch (e) {
        console.warn("[MP] Pose failed:", e);
      }

      // Face (optional, heaviest — load but don't run by default)
      try {
        this.face = await FaceLandmarker.createFromOptions(fs, {
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          numFaces: 1,
        });
        console.log("[MP] Face landmarker ready");
      } catch (e) {
        console.warn("[MP] Face failed:", e);
      }

      this.ready = true;
      console.log("[MP] All models loaded");
    } catch (e) {
      console.error("[MP] Init failed:", e);
      throw e;
    }
  }

  detect(video: HTMLVideoElement, timestamp: number, opts?: { runPose?: boolean; runFace?: boolean }): TrackingResult {
    if (!this.ready || !video || video.readyState < 2) return EMPTY_RESULT;

    const result: TrackingResult = { ...EMPTY_RESULT };

    // HANDS FIRST — most important for drawing
    if (this.hand) {
      try {
        const ts = Math.max(timestamp, this.lastHandTs + 1);
        this.lastHandTs = ts;
        const r = this.hand.detectForVideo(video, ts);
        const hands = r.landmarks ?? [];
        const labels = r.handedness ?? [];
        for (let i = 0; i < hands.length; i++) {
          const lm = hands[i] as Landmark[];
          const label = labels[i]?.[0]?.categoryName ?? "Right";
          if (label === "Left") result.leftHandLandmarks = lm;
          else result.rightHandLandmarks = lm;
        }
      } catch (e) {
        this.lastHandTs = 0;
      }
    }

    // POSE — only if enabled (lag reduction)
    if (this.pose && opts?.runPose) {
      try {
        const ts = Math.max(timestamp, this.lastPoseTs + 1);
        this.lastPoseTs = ts;
        const r = this.pose.detectForVideo(video, ts);
        if (r.landmarks?.[0]) result.poseLandmarks = r.landmarks[0] as Landmark[];
      } catch (e) {
        this.lastPoseTs = 0;
      }
    }

    // FACE — only if enabled (heaviest, major lag source)
    if (this.face && opts?.runFace) {
      try {
        const ts = Math.max(timestamp, this.lastFaceTs + 1);
        this.lastFaceTs = ts;
        const r = this.face.detectForVideo(video, ts);
        if (r.faceLandmarks?.[0]) result.faceLandmarks = r.faceLandmarks[0] as Landmark[];
      } catch (e) {
        this.lastFaceTs = 0;
      }
    }

    return result;
  }

  setConfidence(c: number): void {
    // Could re-create landmarkers with new confidence, but for simplicity
    // we just log. MediaPipe uses the initial confidence values.
    console.log("[MP] Confidence set to:", c);
  }

  dispose(): void {
    this.hand?.close?.();
    this.pose?.close?.();
    this.face?.close?.();
    this.hand = null;
    this.pose = null;
    this.face = null;
    this.ready = false;
    this.loading = null;
  }
}

export const motionCapture = new MotionCaptureService();
