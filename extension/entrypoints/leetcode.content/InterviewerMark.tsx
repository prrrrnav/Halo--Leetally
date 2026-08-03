import { useEffect, useRef, type MutableRefObject } from "react";

export type InterviewerMarkMode =
  | "idle"
  | "listening"
  | "user-speaking"
  | "thinking"
  | "ai-speaking";

type Props = {
  mode: InterviewerMarkMode;
  userLevel: MutableRefObject<number>;
  aiLevel: MutableRefObject<number>;
};

const MODE_COLORS: Record<InterviewerMarkMode, [string, string]> = {
  idle: ["#5877a5", "#a8caff"],
  listening: ["#4d8dff", "#8bb7ff"],
  "user-speaking": ["#79aaff", "#d7e8ff"],
  thinking: ["#5b7fd1", "#a8caff"],
  "ai-speaking": ["#4d8dff", "#c9ddff"],
};

export function InterviewerMark({ mode, userLevel, aiLevel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modeRef = useRef(mode);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let frame = 0;
    let animationFrame = 0;
    let displayedEnergy = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const currentMode = modeRef.current;
      const liveLevel = currentMode === "ai-speaking"
        ? aiLevel.current
        : currentMode === "user-speaking"
          ? userLevel.current
          : 0;
      const syntheticEnergy = currentMode === "thinking"
        ? 0.2 + Math.sin(now / 180) * 0.05
        : currentMode === "listening"
          ? 0.08 + Math.sin(now / 520) * 0.025
          : currentMode === "idle"
            ? 0.035
            : 0.12;
      const targetEnergy = Math.min(1, Math.max(liveLevel, syntheticEnergy));
      displayedEnergy += (targetEnergy - displayedEnergy) * 0.16;

      context.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * (0.31 + displayedEnergy * 0.035);
      const time = reduceMotion ? 0.8 : now / 1400;
      const [startColor, endColor] = MODE_COLORS[currentMode];
      const glow = context.createRadialGradient(
        centerX, centerY, radius * 0.1,
        centerX, centerY, radius * 1.45,
      );
      glow.addColorStop(0, "rgba(29, 38, 55, 0)");
      glow.addColorStop(0.62, `${startColor}18`);
      glow.addColorStop(1, "rgba(2, 8, 15, 0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, width, height);

      const ribbons = reduceMotion ? 6 : 8;
      for (let ribbon = 0; ribbon < ribbons; ribbon += 1) {
        const blend = ribbon / Math.max(1, ribbons - 1);
        const gradient = context.createLinearGradient(
          centerX - radius,
          centerY + radius,
          centerX + radius,
          centerY - radius,
        );
        gradient.addColorStop(0, startColor);
        gradient.addColorStop(Math.min(0.92, 0.28 + blend * 0.35), endColor);
        gradient.addColorStop(1, startColor);

        context.beginPath();
        context.strokeStyle = gradient;
        context.globalAlpha = 0.24 + blend * 0.34;
        context.lineWidth = 0.7 + displayedEnergy * 0.8;
        context.shadowColor = blend > 0.5 ? endColor : startColor;
        context.shadowBlur = 4 + displayedEnergy * 10;

        const phase = ribbon * 0.19;
        const direction = ribbon % 2 === 0 ? 1 : -1;
        for (let point = 0; point <= 120; point += 1) {
          const angle = (point / 120) * Math.PI * 2;
          const pulse = 1 + displayedEnergy * 0.16 * Math.sin(angle * 6 - time * 4);
          const x = centerX + radius * pulse * (
            Math.cos(angle + phase + time * 0.13 * direction) * 0.82
            + Math.cos(angle * 3 - time * 0.7 + phase) * 0.22
          );
          const y = centerY + radius * pulse * (
            Math.sin(angle - phase - time * 0.11 * direction) * 0.82
            + Math.sin(angle * 4 + time * 0.62 - phase) * 0.2
          );
          if (point === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.stroke();
      }

      context.globalAlpha = 1;
      context.shadowBlur = 0;
      frame += 1;
      if (!reduceMotion || frame < 2) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    };

    resize();
    window.addEventListener("resize", resize);
    animationFrame = window.requestAnimationFrame(draw);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, [aiLevel, mode, userLevel]);

  return (
    <canvas
      ref={canvasRef}
      className="leetally-interviewer-mark"
      role="img"
      aria-label={`AI interviewer: ${mode.replace("-", " ")}`}
    />
  );
}
