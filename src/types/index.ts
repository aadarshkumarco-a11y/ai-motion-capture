// Core types for AI Motion Capture

export type Landmark = { x: number; y: number; z: number; visibility?: number };

export type TrackingResult = {
  faceLandmarks: Landmark[];
  poseLandmarks: Landmark[];
  leftHandLandmarks: Landmark[];
  rightHandLandmarks: Landmark[];
  poseWorldLandmarks: Landmark[];
};

export type GestureType =
  | "thumbs_up" | "thumbs_down" | "victory" | "ok"
  | "fist" | "open_palm" | "rock" | "index_up" | "pinch" | "none";

export type BrushType =
  | "pencil" | "marker" | "highlighter" | "neon" | "glow"
  | "rainbow" | "calligraphy" | "eraser";

export type DrawingPoint = {
  x: number; y: number;
  color: string; size: number; opacity: number;
  brushType: BrushType; timestamp: number;
};

export type Stroke = {
  id: string; points: DrawingPoint[]; layer: number;
  brushType: BrushType; color: string; size: number; opacity: number;
};

export type Layer = {
  id: string; name: string; visible: boolean; locked: boolean;
  strokes: Stroke[];
};

export type Settings = {
  showSkeleton: boolean;
  showFaceMesh: boolean;
  showHands: boolean;
  mirror: boolean;
  trackingSensitivity: number;
  detectionConfidence: number;
  fpsLimit: number;
  drawingSmoothing: number;
  gestureDelay: number;
  cameraResolution: "720p" | "1080p" | "480p";
};

export type GestureAction =
  | "start_drawing" | "stop_drawing" | "clear_canvas" | "undo"
  | "redo" | "change_color" | "increase_brush" | "decrease_brush"
  | "screenshot" | "start_recording" | "none";

export type GestureBinding = Record<GestureType, GestureAction>;

export const DEFAULT_SETTINGS: Settings = {
  showSkeleton: true,
  showFaceMesh: false,
  showHands: true,
  mirror: true,
  trackingSensitivity: 0.5,
  detectionConfidence: 0.5,
  fpsLimit: 60,
  drawingSmoothing: 0.5,
  gestureDelay: 300,
  cameraResolution: "720p",
};

export const DEFAULT_GESTURE_BINDINGS: GestureBinding = {
  thumbs_up: "none",
  thumbs_down: "none",
  victory: "none",
  ok: "none",
  fist: "stop_drawing",
  open_palm: "start_drawing",
  rock: "none",
  index_up: "start_drawing",
  pinch: "start_drawing",
  none: "none",
};

export const POSE_CONNECTIONS: [number, number][] = [
  [11,12],[11,13],[13,15],[12,14],[14,16],
  [11,23],[12,24],[23,24],[23,25],[24,26],
  [25,27],[27,29],[29,31],[27,31],[26,28],
  [28,30],[30,32],[28,32],[0,11],[0,12],
  [5,8],[2,5],[1,2],[1,5],[0,4],[0,1],[4,1],
  [9,10],[14,21],[19,21],[17,19],[16,18],[16,20],[18,20],[14,16],
  [15,17],[15,19],[15,21],[13,17],
];

export const HAND_CONNECTIONS: [number, number][] = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],
  [0,17],
];

export const FACE_CONNECTIONS: [number, number][] = [
  [10,338],[338,297],[297,332],[332,284],[284,251],[251,389],[389,356],[356,454],[454,323],[323,361],[361,288],[288,397],[397,365],[365,379],[379,378],[378,400],[400,377],[377,152],[152,148],[148,176],[176,149],[149,150],[150,136],[136,172],[172,58],[58,132],[132,93],[93,234],[234,127],[127,162],[162,21],[21,54],[54,103],[103,67],[67,109],[109,10],
  [33,7],[7,163],[163,144],[144,145],[145,153],[153,154],[154,155],[155,133],[133,173],[173,157],[157,158],[158,159],[159,160],[160,161],[161,246],[246,33],
  [263,249],[249,390],[390,373],[373,374],[374,380],[380,381],[381,382],[382,362],[362,398],[398,384],[384,385],[385,386],[386,387],[387,388],[388,466],[466,263],
];
