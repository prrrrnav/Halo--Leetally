import { useEffect, useState } from "react";

type TimerMode = "focus" | "break";

interface FocusTimerState {
  mode: TimerMode;
  running: boolean;
  endAt: number | null;
  remainingSeconds: number;
  focusMinutes: number;
  breakMinutes: number;
  voiceEnabled: boolean;
  autoStart: boolean;
  completedFocusSessions: number;
}

interface FocusTimerProps {
  settingsOpen: boolean;
  onOpen: () => void;
}

const STORAGE_KEY = "leetally-focus-timer";
const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;

const DEFAULT_STATE: FocusTimerState = {
  mode: "focus",
  running: false,
  endAt: null,
  remainingSeconds: DEFAULT_FOCUS_MINUTES * 60,
  focusMinutes: DEFAULT_FOCUS_MINUTES,
  breakMinutes: DEFAULT_BREAK_MINUTES,
  voiceEnabled: true,
  autoStart: false,
  completedFocusSessions: 0,
};

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function speakReminder(message: string): void {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(message);
  utterance.rate = 0.96;
  utterance.pitch = 1.02;
  utterance.volume = 0.9;
  window.speechSynthesis.speak(utterance);
}

export function useFocusTimer() {
  const [timer, setTimer] = useState<FocusTimerState>(DEFAULT_STATE);
  const [now, setNow] = useState(Date.now());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void browser.storage.local.get(STORAGE_KEY).then((stored) => {
      if (!active) return;
      const saved = stored[STORAGE_KEY] as Partial<FocusTimerState> | undefined;
      if (saved) {
        setTimer({
          ...DEFAULT_STATE,
          ...saved,
          focusMinutes: Math.max(1, Number(saved.focusMinutes) || DEFAULT_FOCUS_MINUTES),
          breakMinutes: Math.max(1, Number(saved.breakMinutes) || DEFAULT_BREAK_MINUTES),
        });
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void browser.storage.local.set({ [STORAGE_KEY]: timer });
  }, [hydrated, timer]);

  useEffect(() => {
    if (!timer.running) return;
    const interval = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [timer.running]);

  const remainingSeconds = timer.running && timer.endAt
    ? Math.max(0, Math.ceil((timer.endAt - now) / 1000))
    : timer.remainingSeconds;

  function advance(announce = true): void {
    const completedMode = timer.mode;
    const nextMode: TimerMode = completedMode === "focus" ? "break" : "focus";
    const nextMinutes = nextMode === "focus" ? timer.focusMinutes : timer.breakMinutes;
    const nextRunning = timer.autoStart;

    if (announce && timer.voiceEnabled) {
      const nextAction = nextRunning ? "is starting now" : "is ready when you are";
      speakReminder(
        completedMode === "focus"
          ? `Focus session complete. Nice work. Your ${timer.breakMinutes} minute break ${nextAction}.`
          : `Break complete. Your next ${timer.focusMinutes} minute focus session ${nextAction}.`,
      );
    }

    setTimer((current) => ({
      ...current,
      mode: nextMode,
      running: nextRunning,
      endAt: nextRunning ? Date.now() + nextMinutes * 60_000 : null,
      remainingSeconds: nextMinutes * 60,
      completedFocusSessions:
        completedMode === "focus"
          ? current.completedFocusSessions + 1
          : current.completedFocusSessions,
    }));
    setNow(Date.now());
  }

  useEffect(() => {
    if (timer.running && timer.endAt !== null && timer.endAt <= now) {
      advance(true);
    }
  }, [now, timer.endAt, timer.running]);

  function start(): void {
    if (remainingSeconds <= 0) return;
    const startedAt = Date.now();
    setNow(startedAt);
    setTimer((current) => ({
      ...current,
      running: true,
      endAt: startedAt + remainingSeconds * 1_000,
      remainingSeconds,
    }));
  }

  function pause(): void {
    setTimer((current) => ({
      ...current,
      running: false,
      endAt: null,
      remainingSeconds,
    }));
  }

  function reset(): void {
    const duration = timer.mode === "focus" ? timer.focusMinutes : timer.breakMinutes;
    setTimer((current) => ({
      ...current,
      running: false,
      endAt: null,
      remainingSeconds: duration * 60,
    }));
    setNow(Date.now());
  }

  function selectMode(mode: TimerMode): void {
    if (timer.running) return;
    const duration = mode === "focus" ? timer.focusMinutes : timer.breakMinutes;
    setTimer((current) => ({
      ...current,
      mode,
      endAt: null,
      remainingSeconds: duration * 60,
    }));
  }

  function setDuration(mode: TimerMode, minutes: number): void {
    setTimer((current) => ({
      ...current,
      focusMinutes: mode === "focus" ? minutes : current.focusMinutes,
      breakMinutes: mode === "break" ? minutes : current.breakMinutes,
      remainingSeconds:
        !current.running && current.mode === mode
          ? minutes * 60
          : current.remainingSeconds,
    }));
  }

  return {
    timer,
    remainingSeconds,
    formattedTime: formatTime(remainingSeconds),
    start,
    pause,
    reset,
    skip: () => advance(true),
    selectMode,
    setDuration,
    setVoiceEnabled: (voiceEnabled: boolean) =>
      setTimer((current) => ({ ...current, voiceEnabled })),
    setAutoStart: (autoStart: boolean) =>
      setTimer((current) => ({ ...current, autoStart })),
  };
}

type FocusTimerControlsProps = ReturnType<typeof useFocusTimer>;

function FocusTimerControls(props: FocusTimerControlsProps & { onClose: () => void }) {
  const {
    timer,
    formattedTime,
    start,
    pause,
    reset,
    skip,
    selectMode,
    setDuration,
    setVoiceEnabled,
    setAutoStart,
    onClose,
  } = props;

  return (
    <section className="leetally-focus-timer">
      <header>
        <div>
          <strong>Focus timer</strong>
          <span>{timer.completedFocusSessions} sessions</span>
        </div>
        <div className="leetally-timer-header-actions">
          <button
            type="button"
            className={timer.voiceEnabled ? "active" : ""}
            aria-pressed={timer.voiceEnabled}
            title="Toggle spoken timer reminders"
            onClick={() => setVoiceEnabled(!timer.voiceEnabled)}
          >
            {timer.voiceEnabled ? "Voice on" : "Voice off"}
          </button>
          <button type="button" aria-label="Close focus timer" title="Close focus timer" onClick={onClose}>×</button>
        </div>
      </header>

      <div className="leetally-timer-modes" role="group" aria-label="Timer mode">
        <button type="button" className={timer.mode === "focus" ? "active" : ""} disabled={timer.running} onClick={() => selectMode("focus")}>Focus</button>
        <button type="button" className={timer.mode === "break" ? "active" : ""} disabled={timer.running} onClick={() => selectMode("break")}>Break</button>
      </div>

      <div className={`leetally-timer-clock mode-${timer.mode}`} aria-live="polite">
        <strong>{formattedTime}</strong>
      </div>

      <div className="leetally-timer-durations">
        <label>
          Focus
          <select value={timer.focusMinutes} onChange={(event) => setDuration("focus", Number(event.target.value))}>
            {[15, 25, 45, 60, 90].map((minutes) => <option value={minutes} key={minutes}>{minutes} min</option>)}
          </select>
        </label>
        <label>
          Break
          <select value={timer.breakMinutes} onChange={(event) => setDuration("break", Number(event.target.value))}>
            {[5, 10, 15, 20].map((minutes) => <option value={minutes} key={minutes}>{minutes} min</option>)}
          </select>
        </label>
      </div>

      <div className="leetally-timer-actions">
        <button type="button" className="primary" onClick={timer.running ? pause : start}>{timer.running ? "Pause" : "Start"}</button>
        <button type="button" onClick={reset}>Reset</button>
        <button type="button" onClick={skip}>Skip</button>
      </div>

      <label className="leetally-timer-auto">
        <input type="checkbox" checked={timer.autoStart} onChange={(event) => setAutoStart(event.target.checked)} />
        <span>Auto-start next session</span>
      </label>
    </section>
  );
}

export function FocusTimerChip({
  mode,
  running,
  formattedTime,
  onOpen,
}: {
  mode: TimerMode;
  running: boolean;
  formattedTime: string;
  onOpen: FocusTimerProps["onOpen"];
}) {
  return (
    <button type="button" className={`leetally-timer-chip mode-${mode}`} onClick={onOpen} title="Open focus timer">
      <span>{running ? (mode === "focus" ? "Focus" : "Break") : "Timer"}</span>
      <strong>{running ? formattedTime : "Set focus"}</strong>
    </button>
  );
}

export function FocusTimer({ settingsOpen, onOpen }: FocusTimerProps) {
  const focusTimer = useFocusTimer();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (settingsOpen) setOpen(false);
  }, [settingsOpen]);

  return (
    <>
      {open && <FocusTimerControls {...focusTimer} onClose={() => setOpen(false)} />}
      {!settingsOpen && !open && (
        <FocusTimerChip
          mode={focusTimer.timer.mode}
          running={focusTimer.timer.running}
          formattedTime={focusTimer.formattedTime}
          onOpen={() => {
            onOpen();
            setOpen(true);
          }}
        />
      )}
    </>
  );
}
