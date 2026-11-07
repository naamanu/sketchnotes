import React from "react";
import {
  AbsoluteFill, Easing, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { loadFont } from "@remotion/fonts";
import { INTRO, OUTRO, STEPS, TRANSITION, Step, stepFrames } from "./steps";

loadFont({ family: "Excalifont", url: staticFile("fonts/Excalifont-Latin.woff2") });
loadFont({ family: "Nunito", url: staticFile("fonts/Nunito-Latin.woff2") });

const C = {
  bg1: "#f6f5ff",
  bg2: "#e6e4fb",
  ink: "#1d1d22",
  muted: "#5d5d6b",
  accent: "#6965db",
  accentSoft: "#e3e2fb",
  bezel: "#1b1b20",
};
const HAND = "Excalifont, Nunito, sans-serif";
const BODY = "Nunito, system-ui, sans-serif";

const Background: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(1400px 900px at 20% 10%, ${C.bg1}, ${C.bg2})` }}>
    {/* faint dot grid, like the canvas */}
    <AbsoluteFill
      style={{
        backgroundImage: `radial-gradient(${C.accent}22 1.6px, transparent 1.6px)`,
        backgroundSize: "34px 34px",
        opacity: 0.6,
      }}
    />
  </AbsoluteFill>
);

/** A spring-driven 0→1 value starting `delay` frames into the scene. */
const useEnter = (delay = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.6 } });
};

const Intro: React.FC = () => {
  const a = useEnter(4);
  const b = useEnter(16);
  const c = useEnter(28);
  const frame = useCurrentFrame();
  const underline = interpolate(frame, [22, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Background />
      <div style={{ transform: `translateY(${(1 - a) * 40}px)`, opacity: a }}>
        <div style={{ fontFamily: HAND, fontSize: 170, color: C.ink, lineHeight: 1 }}>SketchNotes</div>
        <svg width="760" height="40" viewBox="0 0 760 40" style={{ display: "block", margin: "6px auto 0" }}>
          <path d="M10 26 C 160 8, 330 34, 480 18 S 700 14, 750 22" fill="none" stroke={C.accent} strokeWidth="9"
            strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - underline} />
        </svg>
      </div>
      <div style={{ fontFamily: BODY, fontSize: 46, color: C.muted, marginTop: 34, opacity: b, transform: `translateY(${(1 - b) * 24}px)` }}>
        Diagrams and PDF notes on your Android tablet
      </div>
      <div style={{
        fontFamily: BODY, fontSize: 30, fontWeight: 700, color: C.accent, marginTop: 40, opacity: c,
        background: C.accentSoft, padding: "10px 26px", borderRadius: 999, letterSpacing: 1,
      }}>
        A ONE-MINUTE TOUR
      </div>
    </AbsoluteFill>
  );
};

const Tablet: React.FC<{ clip: string; speed: number }> = ({ clip, speed }) => {
  const enter = useEnter(2);
  const W = 1280 * 1.01, H = 800 * 1.01, PAD = 20;
  return (
    <div style={{
      position: "absolute", right: 56, top: (1080 - H - PAD * 2) / 2,
      width: W + PAD * 2, height: H + PAD * 2, background: C.bezel, borderRadius: 44, padding: PAD,
      boxShadow: "0 40px 90px rgba(40, 36, 120, 0.28), 0 8px 24px rgba(0,0,0,0.18)",
      transform: `translateY(${(1 - enter) * 50}px) scale(${0.96 + enter * 0.04})`, opacity: enter,
    }}>
      <div style={{ width: W, height: H, borderRadius: 24, overflow: "hidden", background: "#fff" }}>
        <OffthreadVideo src={staticFile(`clips/${clip}.mp4`)} playbackRate={speed} muted style={{ width: W, height: H }} />
      </div>
      {/* camera dot */}
      <div style={{ position: "absolute", left: "50%", top: 7, width: 7, height: 7, marginLeft: -3, borderRadius: 9, background: "#3a3a44" }} />
    </div>
  );
};

const StepScene: React.FC<{ step: Step; index: number }> = ({ step, index }) => {
  const num = useEnter(0);
  const title = useEnter(6);
  return (
    <AbsoluteFill>
      <Background />
      <div style={{ position: "absolute", left: 70, top: 0, bottom: 0, width: 430, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, opacity: num, transform: `translateX(${(1 - num) * -30}px)` }}>
          <div style={{
            width: 72, height: 72, borderRadius: 999, background: C.accent, color: "#fff",
            fontFamily: HAND, fontSize: 44, display: "grid", placeItems: "center",
          }}>{index + 1}</div>
          <div style={{ fontFamily: BODY, fontSize: 24, fontWeight: 700, color: C.accent, letterSpacing: 1.5 }}>
            STEP {index + 1} OF {STEPS.length}
          </div>
        </div>
        <div style={{
          fontFamily: HAND, fontSize: 66, lineHeight: 1.08, color: C.ink, marginTop: 28,
          opacity: title, transform: `translateY(${(1 - title) * 20}px)`,
        }}>{step.title}</div>
        <div style={{ marginTop: 34, display: "flex", flexDirection: "column", gap: 22 }}>
          {step.points.map((p, i) => <Point key={p} text={p} delay={18 + i * 14} />)}
        </div>
      </div>
      <Tablet clip={step.clip} speed={step.speed} />
    </AbsoluteFill>
  );
};

const Point: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const e = useEnter(delay);
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", opacity: e, transform: `translateX(${(1 - e) * -24}px)` }}>
      <div style={{ width: 12, height: 12, borderRadius: 9, background: C.accent, marginTop: 13, flex: "none" }} />
      <div style={{ fontFamily: BODY, fontSize: 31, lineHeight: 1.32, color: C.muted }}>{text}</div>
    </div>
  );
};

const Outro: React.FC = () => {
  const a = useEnter(2);
  const items = ["Folders", "Diagrams", "PDF notes", "Share", "Search", "Dark mode"];
  const extra = useEnter(40);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <Background />
      <div style={{ fontFamily: HAND, fontSize: 120, color: C.ink, opacity: a, transform: `scale(${0.92 + a * 0.08})` }}>
        That's the basics!
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 46, flexWrap: "wrap", justifyContent: "center", maxWidth: 1400 }}>
        {items.map((t, i) => <Chip key={t} text={t} delay={10 + i * 5} />)}
      </div>
      <div style={{ fontFamily: BODY, fontSize: 34, color: C.muted, marginTop: 56, opacity: extra, transform: `translateY(${(1 - extra) * 16}px)` }}>
        Also on the tablet: handwriting turns into text · backups · works offline
      </div>
    </AbsoluteFill>
  );
};

const Chip: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const e = useEnter(delay);
  return (
    <div style={{
      fontFamily: HAND, fontSize: 40, color: C.ink, background: "#fff", border: `3px solid ${C.ink}`,
      borderRadius: 18, padding: "12px 28px", boxShadow: `5px 5px 0 ${C.accent}`,
      opacity: e, transform: `translateY(${(1 - e) * 30}px) rotate(${(delay % 3) - 1}deg)`,
    }}>{text}</div>
  );
};

export const Tour: React.FC = () => {
  const t = linearTiming({ durationInFrames: TRANSITION });
  return (
    <AbsoluteFill style={{ background: C.bg2 }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={INTRO}><Intro /></TransitionSeries.Sequence>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.clip}>
            <TransitionSeries.Transition presentation={fade()} timing={t} />
            <TransitionSeries.Sequence durationInFrames={stepFrames(s)}><StepScene step={s} index={i} /></TransitionSeries.Sequence>
          </React.Fragment>
        ))}
        <TransitionSeries.Transition presentation={fade()} timing={t} />
        <TransitionSeries.Sequence durationInFrames={OUTRO}><Outro /></TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
