import { useState, useRef, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Landing from "./components/Landing";
import CameraView from "./components/CameraView";
import Toolbar from "./components/Toolbar";
import Settings from "./components/Settings";
import SkeletonOverlay from "./components/SkeletonOverlay";
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
  const [trackingResult, setTrackingResult] = useState<TrackingResult | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  // Drawing / toolbar state
  const [brushType, setBrushType] = useState<BrushType>("neon");
  const [color, setColor] = useState("#7c3aed");
  const [brushSize, setBrushSize] = useState(8);
  const [opacity, setOpacity] = useState(1);
  const [isRecording, setIsRecording] = useState(false);

  // Refs shared with child components
  const videoRef = useRef<HTMLVideoElement>(null);
  const skeletonCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // Persist settings on change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore quota errors */
    }
  }, [settings]);

  const handleStart = useCallback(() => setScreen("capture"), []);

  const handleGesture = useCallback((g: GestureType) => {
    // Gesture → action routing is wired by the tracking pipeline.
    void g;
  }, []);

  // Toolbar action stubs (drawing engine wired by another module)
  const handleUndo = useCallback(() => {}, []);
  const handleRedo = useCallback(() => {}, []);
  const handleClear = useCallback(() => {}, []);
  const handleScreenshot = useCallback(() => {}, []);
  const handleToggleRecording = useCallback(() => setIsRecording((r) => !r), []);

  // Expose setters so a future tracking hook can feed results / state.
  void setTrackingResult;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-bg text-white">
      <AnimatePresence mode="wait">
        {screen === "landing" ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            <Landing onStart={handleStart} />
          </motion.div>
        ) : (
          <motion.div
            key="capture"
            initial={{ opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0"
          >
            <CameraView
              videoRef={videoRef}
              skeletonCanvasRef={skeletonCanvasRef}
              drawingCanvasRef={drawingCanvasRef}
              onReady={() => setIsTracking(true)}
              settings={settings}
              onGesture={handleGesture}
              isTracking={isTracking}
            />
            <SkeletonOverlay
              canvasRef={skeletonCanvasRef}
              trackingResult={trackingResult}
              settings={settings}
            />
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
            <AnimatePresence>
              {settingsOpen && (
                <Settings
                  settings={settings}
                  setSettings={setSettings}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
