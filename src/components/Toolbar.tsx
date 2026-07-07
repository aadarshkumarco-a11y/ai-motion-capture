import { useState, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Pencil,
  PenTool,
  Highlighter,
  Sparkles,
  Zap,
  Rainbow,
  Feather,
  Eraser,
  Droplet,
  Undo2,
  Redo2,
  Trash2,
  Camera,
  Circle,
  Square,
  Settings as SettingsIcon,
  ChevronDown,
  Brush,
  Palette,
} from "lucide-react";
import type { BrushType } from "../types";

type Props = {
  brushType: BrushType;
  setBrushType: (b: BrushType) => void;
  color: string;
  setColor: (c: string) => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  opacity: number;
  setOpacity: (n: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onScreenshot: () => void;
  isRecording: boolean;
  onToggleRecording: () => void;
  onOpenSettings: () => void;
};

type BrushOption = { type: BrushType; label: string; icon: LucideIcon };

const BRUSHES: BrushOption[] = [
  { type: "pencil", label: "Pencil", icon: Pencil },
  { type: "marker", label: "Marker", icon: PenTool },
  { type: "highlighter", label: "Highlighter", icon: Highlighter },
  { type: "neon", label: "Neon", icon: Sparkles },
  { type: "glow", label: "Glow", icon: Zap },
  { type: "rainbow", label: "Rainbow", icon: Rainbow },
  { type: "calligraphy", label: "Calligraphy", icon: Feather },
  { type: "eraser", label: "Eraser", icon: Eraser },
];

const PRESET_COLORS = [
  "#7c3aed",
  "#06b6d4",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#ffffff",
];

export default function Toolbar({
  brushType,
  setBrushType,
  color,
  setColor,
  brushSize,
  setBrushSize,
  opacity,
  setOpacity,
  onUndo,
  onRedo,
  onClear,
  onScreenshot,
  isRecording,
  onToggleRecording,
  onOpenSettings,
}: Props) {
  const [brushOpen, setBrushOpen] = useState(false);
  const brushMenuRef = useRef<HTMLDivElement>(null);

  // Close brush dropdown on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        brushMenuRef.current &&
        !brushMenuRef.current.contains(e.target as Node)
      ) {
        setBrushOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const rainbow = brushType === "rainbow";
  const glow = brushType === "glow";
  const activeBrush = BRUSHES.find((b) => b.type === brushType) ?? BRUSHES[0];

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[calc(100%-1rem)] max-w-3xl">
      <div className="glass-strong rounded-2xl px-3 py-2 flex flex-wrap items-center justify-center gap-1.5">
        {/* Brush selector */}
        <div ref={brushMenuRef} className="relative">
          <button
            onClick={() => setBrushOpen((o) => !o)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition text-sm"
          >
            <activeBrush.icon size={16} className="text-purple-300" />
            <span className="hidden sm:inline">{activeBrush.label}</span>
            <ChevronDown
              size={14}
              className={`transition-transform ${brushOpen ? "rotate-180" : ""}`}
            />
          </button>
          <AnimatePresence>
            {brushOpen && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 glass-strong rounded-xl p-2 grid grid-cols-2 gap-1 w-56"
              >
                {BRUSHES.map((b) => (
                  <button
                    key={b.type}
                    onClick={() => {
                      setBrushType(b.type);
                      setBrushOpen(false);
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition ${
                      brushType === b.type
                        ? "bg-accent text-white"
                        : "hover:bg-white/10 text-white/80"
                    }`}
                  >
                    <b.icon size={14} /> {b.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Divider />

        {/* Color picker */}
        <div className="flex items-center gap-1.5 px-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`color ${c}`}
              className={`w-6 h-6 rounded-full border-2 transition ${
                color.toLowerCase() === c.toLowerCase()
                  ? "border-white scale-110"
                  : "border-white/20 hover:border-white/50"
              }`}
              style={{ background: c }}
            />
          ))}
          <label
            className="relative w-6 h-6 rounded-full border-2 border-white/20 overflow-hidden cursor-pointer hover:border-white/50"
            title="Custom color"
          >
            <Palette
              size={14}
              className="absolute inset-0 m-auto text-white/70 pointer-events-none"
            />
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
            />
          </label>
        </div>

        <Divider />

        {/* Brush size */}
        <div className="flex items-center gap-2 px-1">
          <Brush size={14} className="text-white/60" />
          <input
            type="range"
            min={1}
            max={50}
            value={brushSize}
            onChange={(e) => setBrushSize(+e.target.value)}
            className="w-20"
            aria-label="Brush size"
          />
          <span className="text-xs font-mono w-6 text-white/60 text-right">
            {brushSize}
          </span>
        </div>

        {/* Opacity */}
        <div className="flex items-center gap-2 px-1">
          <Droplet size={14} className="text-white/60" />
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(+e.target.value)}
            className="w-16"
            aria-label="Opacity"
          />
        </div>

        <Divider />

        {/* Effect toggles */}
        <IconToggle
          active={rainbow}
          onClick={() => setBrushType(rainbow ? "neon" : "rainbow")}
          title="Rainbow mode"
        >
          <Rainbow size={16} />
        </IconToggle>
        <IconToggle
          active={glow}
          onClick={() => setBrushType(glow ? "neon" : "glow")}
          title="Glow effect"
        >
          <Sparkles size={16} />
        </IconToggle>

        <Divider />

        {/* History / capture actions */}
        <IconBtn onClick={onUndo} title="Undo">
          <Undo2 size={16} />
        </IconBtn>
        <IconBtn onClick={onRedo} title="Redo">
          <Redo2 size={16} />
        </IconBtn>
        <IconBtn onClick={onClear} title="Clear canvas">
          <Trash2 size={16} />
        </IconBtn>
        <IconBtn onClick={onScreenshot} title="Screenshot">
          <Camera size={16} />
        </IconBtn>
        <IconBtn
          onClick={onToggleRecording}
          title={isRecording ? "Stop recording" : "Start recording"}
          active={isRecording}
          activeClass="bg-red-500 text-white"
        >
          {isRecording ? <Square size={16} /> : <Circle size={16} className="text-red-400" />}
        </IconBtn>
        <IconBtn onClick={onOpenSettings} title="Settings">
          <SettingsIcon size={16} />
        </IconBtn>
      </div>
    </div>
  );
}

/* ---------- small inline UI helpers ---------- */

function Divider() {
  return <div className="w-px h-6 bg-white/10 mx-0.5 hidden sm:block" />;
}

function IconBtn({
  onClick,
  title,
  children,
  active,
  activeClass,
}: {
  onClick: () => void;
  title: string;
  children: ReactNode;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-2 rounded-xl transition ${
        active
          ? (activeClass ?? "bg-accent text-white")
          : "bg-white/5 hover:bg-white/10 text-white/80"
      }`}
    >
      {children}
    </button>
  );
}

function IconToggle({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-2 rounded-xl transition ${
        active
          ? "bg-accent text-white neon-border"
          : "bg-white/5 hover:bg-white/10 text-white/80"
      }`}
    >
      {children}
    </button>
  );
}
