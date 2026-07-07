/**
 * Gesture recognition engine.
 *
 * Takes the 21 hand landmarks produced by MediaPipe's HandLandmarker
 * and maps them to one of the supported GestureType values.
 *
 * Hand landmark indices (MediaPipe):
 *   0          wrist
 *   1-4        thumb   (1 CMC, 2 MCP, 3 IP, 4 tip)
 *   5-8        index   (5 MCP, 6 PIP, 7 DIP, 8 tip)
 *   9-12       middle  (9 MCP, 10 PIP, 11 DIP, 12 tip)
 *   13-16      ring    (13 MCP, 14 PIP, 15 DIP, 16 tip)
 *   17-20      pinky   (17 MCP, 18 PIP, 19 DIP, 20 tip)
 *
 * MediaPipe coordinates are normalized [0,1] with origin at the
 * top-left of the image, so "smaller y" === "higher up".
 */

import type { GestureType, Landmark } from "../types";

/** Euclidean distance between two landmarks (in normalized space). */
function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z ?? 0) - (b.z ?? 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Approximate palm center as the centroid of the wrist + 4 MCP joints. */
function palmCenter(lm: Landmark[]): Landmark {
  const ids = [0, 5, 9, 13, 17];
  let x = 0;
  let y = 0;
  let z = 0;
  for (const i of ids) {
    x += lm[i].x;
    y += lm[i].y;
    z += lm[i].z ?? 0;
  }
  return { x: x / ids.length, y: y / ids.length, z: z / ids.length };
}

/**
 * For the 4 non-thumb fingers: a finger is "extended" when its tip is
 * above (smaller y) its PIP joint AND the tip is further from the palm
 * than the PIP joint is.
 */
function fingerExtended(
  lm: Landmark[],
  tipIdx: number,
  pipIdx: number,
  palm: Landmark,
): boolean {
  const tip = lm[tipIdx];
  const pip = lm[pipIdx];
  if (tip.y >= pip.y) return false; // tip below or level with PIP -> curled
  return dist(tip, palm) > dist(pip, palm) * 1.05;
}

/**
 * Thumb extension check. The thumb extends sideways out of the palm,
 * so we look at the distance from the tip to the palm center relative
 * to the MCP joint's distance. A curled thumb crosses over the palm.
 */
function thumbExtended(lm: Landmark[], palm: Landmark): boolean {
  const tip = lm[4];
  const ip = lm[3];
  const mcp = lm[2];
  const tipFromPalm = dist(tip, palm);
  const mcpFromPalm = dist(mcp, palm);
  // Thumb is extended if the tip is well outside the palm relative to
  // the MCP joint AND the tip is further from the IP than expected
  // when curled.
  return tipFromPalm > mcpFromPalm * 1.35 && dist(tip, ip) > 0.03;
}

/**
 * True if the thumb tip is pointing up relative to the IP joint
 * (smaller y) — used to disambiguate thumbs_up vs thumbs_down.
 */
function thumbPointsUp(lm: Landmark[]): boolean {
  return lm[4].y < lm[3].y && lm[4].y < lm[2].y;
}

export interface GestureDebugInfo {
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  thumb: boolean;
  pinchRatio: number;
  okRatio: number;
}

/**
 * Recognizes a single static gesture from one hand's landmarks.
 *
 * Detection priority is intentionally ordered from most-specific to
 * most-generic so that e.g. an "ok" sign (which also looks like a
 * partial pinch) is matched before the looser "pinch" rule.
 *
 * @param landmarks  21 hand landmarks from MediaPipe
 * @returns          A GestureType. Returns "none" when no rule matches
 *                   or when fewer than 21 landmarks are provided.
 */
export function recognizeGesture(
  landmarks: Landmark[] | null | undefined,
): GestureType {
  if (!landmarks || landmarks.length < 21) return "none";

  const palm = palmCenter(landmarks);

  const indexExt = fingerExtended(landmarks, 8, 6, palm);
  const middleExt = fingerExtended(landmarks, 12, 10, palm);
  const ringExt = fingerExtended(landmarks, 16, 14, palm);
  const pinkyExt = fingerExtended(landmarks, 20, 18, palm);
  const thumbExt = thumbExtended(landmarks, palm);

  const fingerCount =
    (indexExt ? 1 : 0) +
    (middleExt ? 1 : 0) +
    (ringExt ? 1 : 0) +
    (pinkyExt ? 1 : 0);

  // Hand "size" reference: wrist -> middle MCP. Used to normalize the
  // pinch / OK distances so the gesture works regardless of how close
  // the hand is to the camera.
  const handSize = Math.max(dist(landmarks[0], landmarks[9]), 0.001);

  // Thumb tip <-> index tip distance (used by pinch + OK).
  const pinchDist = dist(landmarks[4], landmarks[8]);
  const pinchRatio = pinchDist / handSize;

  // OK sign: thumb & index tips touching, but middle/ring/pinky extended.
  if (pinchRatio < 0.35 && middleExt && ringExt && pinkyExt) {
    return "ok";
  }

  // Pinch: thumb & index tips touching, middle + ring curled.
  // (Pinky is allowed to drift either way for comfort.)
  if (pinchRatio < 0.45 && !middleExt && !ringExt) {
    return "pinch";
  }

  // Thumbs up / down: ONLY the thumb is extended (4 fingers curled).
  if (thumbExt && fingerCount === 0) {
    return thumbPointsUp(landmarks) ? "thumbs_up" : "thumbs_down";
  }

  // Victory: index + middle extended, ring + pinky curled.
  if (indexExt && middleExt && !ringExt && !pinkyExt) {
    return "victory";
  }

  // Rock (love-you horns): index + pinky extended, middle + ring curled.
  if (indexExt && !middleExt && !ringExt && pinkyExt) {
    return "rock";
  }

  // Index pointing up: only the index is extended.
  if (indexExt && !middleExt && !ringExt && !pinkyExt) {
    return "index_up";
  }

  // Open palm: all 4 fingers extended (thumb optional, usually extended too).
  if (indexExt && middleExt && ringExt && pinkyExt) {
    return "open_palm";
  }

  // Fist: nothing extended (thumb curled across palm).
  if (fingerCount === 0 && !thumbExt) {
    return "fist";
  }

  return "none";
}

/**
 * Variant of `recognizeGesture` that also returns the per-finger
 * debug info. Handy for UI overlays during development.
 */
export function recognizeGestureWithDebug(
  landmarks: Landmark[] | null | undefined,
): { gesture: GestureType; debug: GestureDebugInfo } {
  if (!landmarks || landmarks.length < 21) {
    return {
      gesture: "none",
      debug: {
        index: false,
        middle: false,
        ring: false,
        pinky: false,
        thumb: false,
        pinchRatio: 0,
        okRatio: 0,
      },
    };
  }

  const palm = palmCenter(landmarks);
  const indexExt = fingerExtended(landmarks, 8, 6, palm);
  const middleExt = fingerExtended(landmarks, 12, 10, palm);
  const ringExt = fingerExtended(landmarks, 16, 14, palm);
  const pinkyExt = fingerExtended(landmarks, 20, 18, palm);
  const thumbExt = thumbExtended(landmarks, palm);
  const handSize = Math.max(dist(landmarks[0], landmarks[9]), 0.001);
  const pinchRatio = dist(landmarks[4], landmarks[8]) / handSize;

  return {
    gesture: recognizeGesture(landmarks),
    debug: {
      index: indexExt,
      middle: middleExt,
      ring: ringExt,
      pinky: pinkyExt,
      thumb: thumbExt,
      pinchRatio,
      okRatio: pinchRatio,
    },
  };
}
