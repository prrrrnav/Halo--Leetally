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

type Palette = {
  core: string;
  edge: string;
  light: string;
};

const MODE_PALETTES: Record<InterviewerMarkMode, Palette> = {
  idle: { core: "#4d6fff", edge: "#86adff", light: "#dce8ff" },
  listening: { core: "#14b8d4", edge: "#4d8dff", light: "#d8fbff" },
  "user-speaking": { core: "#14b8a6", edge: "#60a5fa", light: "#e5fffb" },
  thinking: { core: "#7c5ce7", edge: "#4d8dff", light: "#eee8ff" },
  "ai-speaking": { core: "#8257e5", edge: "#67a4ff", light: "#f4edff" },
};

function drawLeetAllyMark(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radius: number,
  palette: Palette,
  energy: number,
) {
  const scale = 1 + energy * 0.035;
  context.save();
  context.translate(centerX, centerY);
  context.scale(scale, scale);

  const markGradient = context.createLinearGradient(-radius, 0, radius, 0);
  markGradient.addColorStop(0, palette.edge);
  markGradient.addColorStop(0.52, palette.light);
  markGradient.addColorStop(1, palette.edge);

  context.beginPath();
  context.moveTo(-radius * 0.58, -radius * 0.27);
  context.lineTo(-radius * 0.58, radius * 0.13);
  context.bezierCurveTo(
    -radius * 0.58,
    radius * 0.39,
    -radius * 0.39,
    radius * 0.48,
    -radius * 0.18,
    radius * 0.48,
  );
  context.lineTo(radius * 0.03, radius * 0.48);
  context.bezierCurveTo(
    radius * 0.24,
    radius * 0.48,
    radius * 0.31,
    radius * 0.34,
    radius * 0.31,
    radius * 0.14,
  );
  context.lineTo(radius * 0.31, -radius * 0.08);
  context.bezierCurveTo(
    radius * 0.31,
    -radius * 0.36,
    radius * 0.5,
    -radius * 0.5,
    radius * 0.67,
    -radius * 0.5,
  );
  context.bezierCurveTo(
    radius * 0.87,
    -radius * 0.5,
    radius * 0.94,
    -radius * 0.31,
    radius * 0.94,
    -radius * 0.11,
  );
  context.lineTo(radius * 0.94, radius * 0.22);
  context.strokeStyle = markGradient;
  context.lineWidth = Math.max(3.2, radius * 0.15);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.shadowColor = palette.edge;
  context.shadowBlur = 8 + energy * 8;
  context.stroke();

  context.beginPath();
  context.arc(radius * 0.64, -radius * 0.12, radius * 0.075, 0, Math.PI * 2);
  context.fillStyle = palette.light;
  context.shadowBlur = 7 + energy * 5;
  context.fill();
  context.restore();
}

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
    let animationFrame = 0;
    let displayedEnergy = 0;
    let lastPaint = 0;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(bounds.width * ratio);
      canvas.height = Math.round(bounds.height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const draw = (now: number) => {
      const currentMode = modeRef.current;
      const minimumFrameTime = currentMode === "idle" ? 1000 / 30 : 1000 / 60;
      if (!reduceMotion && now - lastPaint < minimumFrameTime) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }
      lastPaint = now;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const centerX = width / 2;
      const centerY = height / 2;
      const palette = MODE_PALETTES[currentMode];
      const liveLevel = currentMode === "ai-speaking"
        ? aiLevel.current
        : currentMode === "user-speaking"
          ? userLevel.current
          : 0;
      const syntheticEnergy = currentMode === "thinking"
        ? 0.22
        : currentMode === "listening"
          ? 0.09
          : currentMode === "idle"
            ? 0.035
            : 0.12;
      const targetEnergy = Math.min(1, Math.max(liveLevel, syntheticEnergy));
      displayedEnergy += (targetEnergy - displayedEnergy) * 0.14;

      context.clearRect(0, 0, width, height);
      const time = reduceMotion ? 0.75 : now / 1000;
      const baseRadius = Math.min(width, height) * 0.31;
      const breath = reduceMotion ? 1 : 1 + Math.sin(time * 1.35) * 0.018;
      const radius = baseRadius * (breath + displayedEnergy * 0.07);

      const lightPositions = [
        {
          x: centerX + Math.cos(time * 0.58) * radius * 0.34,
          y: centerY + Math.sin(time * 0.47) * radius * 0.28,
          color: palette.core,
          alpha: "9a",
        },
        {
          x: centerX + Math.cos(time * -0.43 + 2.1) * radius * 0.38,
          y: centerY + Math.sin(time * 0.52 + 1.2) * radius * 0.32,
          color: palette.edge,
          alpha: "78",
        },
        {
          x: centerX + Math.cos(time * 0.36 + 4.2) * radius * 0.3,
          y: centerY + Math.sin(time * -0.41 + 2.8) * radius * 0.34,
          color: palette.light,
          alpha: "46",
        },
      ];

      for (const light of lightPositions) {
        const blob = context.createRadialGradient(
          light.x,
          light.y,
          0,
          light.x,
          light.y,
          radius * 1.08,
        );
        blob.addColorStop(0, `${light.color}${light.alpha}`);
        blob.addColorStop(0.55, `${light.color}28`);
        blob.addColorStop(1, `${light.color}00`);
        context.fillStyle = blob;
        context.beginPath();
        context.arc(light.x, light.y, radius * 1.08, 0, Math.PI * 2);
        context.fill();
      }

      const membrane = new Path2D();
      const points = reduceMotion ? 64 : 88;
      for (let point = 0; point <= points; point += 1) {
        const angle = (point / points) * Math.PI * 2;
        const ambient = reduceMotion
          ? 0
          : Math.sin(angle * 3 + time * 0.82) * 0.022
            + Math.sin(angle * 5 - time * 0.57) * 0.014;
        const voice = displayedEnergy * 0.09
          * Math.max(0, Math.sin(angle * 6 - time * 5.2));
        const thought = currentMode === "thinking"
          ? Math.sin(angle * 4 + time * 2.1) * 0.035
          : 0;
        const pointRadius = radius * (1 + ambient + voice + thought);
        const x = centerX + Math.cos(angle) * pointRadius;
        const y = centerY + Math.sin(angle) * pointRadius;
        if (point === 0) membrane.moveTo(x, y);
        else membrane.lineTo(x, y);
      }
      membrane.closePath();

      const body = context.createRadialGradient(
        centerX - radius * 0.24,
        centerY - radius * 0.3,
        radius * 0.05,
        centerX,
        centerY,
        radius * 1.12,
      );
      body.addColorStop(0, `${palette.light}a8`);
      body.addColorStop(0.24, `${palette.core}9c`);
      body.addColorStop(0.68, `${palette.edge}55`);
      body.addColorStop(1, `${palette.core}12`);
      context.fillStyle = body;
      context.strokeStyle = `${palette.light}74`;
      context.lineWidth = 0.8 + displayedEnergy * 0.8;
      context.shadowColor = palette.edge;
      context.shadowBlur = 13 + displayedEnergy * 13;
      context.fill(membrane);
      context.stroke(membrane);
      context.shadowBlur = 0;

      if (currentMode === "listening" || currentMode === "user-speaking") {
        for (let ring = 0; ring < 2; ring += 1) {
          const phase = (time * 0.48 + ring * 0.5) % 1;
          context.beginPath();
          context.arc(
            centerX,
            centerY,
            radius * (1.02 + phase * 0.34),
            0,
            Math.PI * 2,
          );
          context.strokeStyle = `${palette.light}${Math.round((1 - phase) * 42)
            .toString(16)
            .padStart(2, "0")}`;
          context.lineWidth = 1;
          context.stroke();
        }
      }

      if (currentMode === "thinking") {
        const sparkAngle = time * 1.75;
        const sparkX = centerX + Math.cos(sparkAngle) * radius * 1.09;
        const sparkY = centerY + Math.sin(sparkAngle) * radius * 1.09;
        const spark = context.createRadialGradient(
          sparkX,
          sparkY,
          0,
          sparkX,
          sparkY,
          radius * 0.22,
        );
        spark.addColorStop(0, palette.light);
        spark.addColorStop(0.24, `${palette.light}b8`);
        spark.addColorStop(1, `${palette.edge}00`);
        context.fillStyle = spark;
        context.beginPath();
        context.arc(sparkX, sparkY, radius * 0.22, 0, Math.PI * 2);
        context.fill();
      }

      drawLeetAllyMark(
        context,
        centerX - radius * 0.08,
        centerY,
        radius * 0.77,
        palette,
        displayedEnergy,
      );

      if (!reduceMotion) {
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
      aria-label={`MOAT interviewer: ${mode.replace("-", " ")}`}
    />
  );
}
