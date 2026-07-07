import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import type { Settings as SettingsType } from "../types";

type Props = {
  settings: SettingsType;
  setSettings: (s: SettingsType) => void;
  onClose: () => void;
};

function patch<K extends keyof SettingsType>(
  setSettings: (s: SettingsType) => void,
  settings: SettingsType,
  key: K,
  value: SettingsType[K]
) {
  setSettings({ ...settings, [key]: value });
}

export default function Settings({ settings, setSettings, onClose }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-strong rounded-3xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 relative"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold neon-text">Settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="p-2 rounded-full hover:bg-white/10 transition"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-1">
          <Section title="Display">
            <SwitchRow
              label="Skeleton"
              checked={settings.showSkeleton}
              onChange={(v) => patch(setSettings, settings, "showSkeleton", v)}
            />
            <SwitchRow
              label="Face Mesh"
              checked={settings.showFaceMesh}
              onChange={(v) => patch(setSettings, settings, "showFaceMesh", v)}
            />
            <SwitchRow
              label="Hand Landmarks"
              checked={settings.showHands}
              onChange={(v) => patch(setSettings, settings, "showHands", v)}
            />
            <SwitchRow
              label="Mirror Camera"
              checked={settings.mirror}
              onChange={(v) => patch(setSettings, settings, "mirror", v)}
            />
          </Section>

          <Section title="Tracking">
            <SliderRow
              label="Tracking Sensitivity"
              min={0}
              max={1}
              step={0.05}
              value={settings.trackingSensitivity}
              onChange={(v) =>
                patch(setSettings, settings, "trackingSensitivity", v)
              }
              format={(v) => v.toFixed(2)}
            />
            <SliderRow
              label="Detection Confidence"
              min={0}
              max={1}
              step={0.05}
              value={settings.detectionConfidence}
              onChange={(v) =>
                patch(setSettings, settings, "detectionConfidence", v)
              }
              format={(v) => v.toFixed(2)}
            />
            <SliderRow
              label="FPS Limit"
              min={15}
              max={60}
              step={1}
              value={settings.fpsLimit}
              onChange={(v) => patch(setSettings, settings, "fpsLimit", v)}
              format={(v) => `${v}`}
            />
          </Section>

          <Section title="Drawing & Gestures">
            <SliderRow
              label="Drawing Smoothing"
              min={0}
              max={1}
              step={0.05}
              value={settings.drawingSmoothing}
              onChange={(v) =>
                patch(setSettings, settings, "drawingSmoothing", v)
              }
              format={(v) => v.toFixed(2)}
            />
            <SliderRow
              label="Gesture Delay"
              min={100}
              max={1000}
              step={50}
              value={settings.gestureDelay}
              onChange={(v) => patch(setSettings, settings, "gestureDelay", v)}
              format={(v) => `${v}ms`}
            />
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-white/80">Camera Resolution</span>
              <select
                value={settings.cameraResolution}
                onChange={(e) =>
                  patch(
                    setSettings,
                    settings,
                    "cameraResolution",
                    e.target.value as SettingsType["cameraResolution"]
                  )
                }
                className="bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent"
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
              </select>
            </div>
          </Section>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ---------- inline helpers ---------- */

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="py-2">
      <h3 className="text-[11px] uppercase tracking-widest text-white/40 mb-1 px-1">
        {title}
      </h3>
      <div className="glass rounded-xl px-3 divide-y divide-white/5">{children}</div>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-white/80">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition ${
          checked ? "bg-accent" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-5" : ""
          }`}
        />
      </button>
    </div>
  );
}

function SliderRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
  format,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-white/80">{label}</span>
        <span className="text-xs font-mono text-purple-300">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="w-full"
      />
    </div>
  );
}
