import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  Camera,
  PersonStanding,
  Smile,
  Hand,
  PenTool,
  Sparkles,
  Video,
  ArrowRight,
} from "lucide-react";

type Props = { onStart: () => void };

type Feature = { icon: LucideIcon; title: string; desc: string };

const FEATURES: Feature[] = [
  { icon: PersonStanding, title: "Body Tracking", desc: "33-point pose skeleton with real-time joint detection." },
  { icon: Smile, title: "Face Mesh", desc: "478-landmark face mesh for expressions and gaze." },
  { icon: Hand, title: "Hand Tracking", desc: "21 landmarks per hand for fine finger control." },
  { icon: PenTool, title: "Air Drawing", desc: "Draw in mid-air using your fingertip as the brush." },
  { icon: Sparkles, title: "Gesture Control", desc: "Pinch, fist or open palm to switch tools hands-free." },
  { icon: Video, title: "Recording", desc: "Capture video clips and screenshots of your art." },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};
const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
};

export default function Landing({ onStart }: Props) {
  return (
    <div className="relative w-full h-full overflow-y-auto animated-gradient">
      {/* ambient glow blobs */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-cyan/20 blur-3xl" />

      <div className="relative z-10 min-h-full flex flex-col items-center justify-center px-6 py-12">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="w-full max-w-5xl flex flex-col items-center"
        >
          {/* Hero card */}
          <motion.div
            variants={item}
            className="glass rounded-3xl px-8 py-10 md:px-14 md:py-14 w-full max-w-2xl text-center float-anim"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/20 border border-accent/30 text-[11px] uppercase tracking-widest text-purple-200 mb-6">
              <Sparkles size={12} /> AI-Powered · Browser-Native
            </div>
            <h1 className="text-4xl md:text-6xl font-bold neon-text tracking-tight leading-tight">
              AI Motion Capture
            </h1>
            <p className="mt-4 text-base md:text-lg text-white/70">
              Real-time body tracking &amp; air drawing
            </p>
            <button
              onClick={onStart}
              className="pulse-ring mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-accent to-purple-500 hover:from-purple-500 hover:to-accent transition-all text-white font-semibold text-lg shadow-lg shadow-accent/30"
            >
              <Camera size={20} /> Start Camera <ArrowRight size={18} />
            </button>
          </motion.div>

          {/* Feature grid */}
          <motion.div
            variants={container}
            className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full"
          >
            {FEATURES.map((f) => (
              <motion.div
                key={f.title}
                variants={item}
                whileHover={{ y: -4, scale: 1.02 }}
                className="glass rounded-2xl p-5 flex flex-col gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/30 flex items-center justify-center text-purple-200">
                  <f.icon size={20} />
                </div>
                <h3 className="font-semibold text-white">{f.title}</h3>
                <p className="text-sm text-white/60 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-10 text-center text-xs text-white/40"
        >
          Built with MediaPipe · React · Framer Motion · Tailwind CSS
        </motion.footer>
      </div>
    </div>
  );
}
