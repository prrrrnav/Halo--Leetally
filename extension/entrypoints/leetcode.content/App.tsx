import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";



import type { Session } from "@supabase/supabase-js";

import {
  createInterview,
  submitInterviewAudio,
} from "../../lib/api.ts";
import { LeetCodeAdapter } from "../../lib/leetcode.ts";
import { supabase } from "../../lib/supabase.ts";
import { getTTSProvider } from "../../lib/tts-service.ts";
import type { TTSStatus } from "../../lib/tts/types.ts";
import { LocalVad } from "../../lib/voice/local-vad.ts";
import { float32ToPcm16 } from "../../lib/voice/pcm.ts";

import type { LeetCodeContext } from "@/lib/leetcode-context.ts";

interface Position {
  x: number;
  y: number;
}

type InterviewStatus =
  | "idle"
  | "starting"
  | "running";

type CandidateStatus =
  | "idle"
  | "listening"
  | "speaking"
  | "processing";



function readText(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);

    const text = element?.innerText?.trim();

    if (text) {
      return text;
    }
  }

  return "";
}

function readProblemTitle(): string {
  return readText([
    '[data-cy="question-title"]',
    'a[href^="/problems/"][class*="text-title-large"]',
    'div[class*="text-title-large"]',
  ]);
}

function readProblemDescription(): string {
  return readText([
    '[data-track-load="description_content"]',
    '[data-cy="question-content"]',
    'div[class*="elfjS"]',
  ]);
}

function readDifficulty(): string {
  const possibleElements = Array.from(
    document.querySelectorAll<HTMLElement>("div, span")
  );

  const difficultyElement = possibleElements.find((element) => {
    const text = element.innerText?.trim();

    return (
      text === "Easy" ||
      text === "Medium" ||
      text === "Hard"
    );
  });

  return difficultyElement?.innerText?.trim() ?? "";
}

function readProgrammingLanguage(): string {
  return readText([
    'button[id*="headlessui-listbox-button"]',
    'button[class*="rounded"][class*="items-center"]',
  ]);
}

function readVisibleOutput(): string {
  return readText([
    '[data-e2e-locator="console-result"]',
    '[data-e2e-locator="console-test-result"]',
    'div[class*="result"]',
  ]);
}

function readLeetCodeContext(): LeetCodeContext {
  return {
    problemTitle: readProblemTitle(),
    problemDescription: readProblemDescription(),
    difficulty: readDifficulty(),
    programmingLanguage: readProgrammingLanguage(),
    code: "",
    visibleOutput: readVisibleOutput(),
  };
}

const adapter = new LeetCodeAdapter();
const tts = getTTSProvider();

const VAD_SAMPLE_RATE = 16_000;

function pcm16ToWavBlob(
  pcmBuffer: ArrayBuffer,
  sampleRate = VAD_SAMPLE_RATE,
): Blob {
  const pcmBytes = new Uint8Array(pcmBuffer);
  const wavBuffer = new ArrayBuffer(44 + pcmBytes.byteLength);
  const view = new DataView(wavBuffer);

  function writeText(offset: number, value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  writeText(0, "RIFF");
  view.setUint32(4, 36 + pcmBytes.byteLength, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, "data");
  view.setUint32(40, pcmBytes.byteLength, true);

  new Uint8Array(wavBuffer, 44).set(pcmBytes);

  return new Blob([wavBuffer], {
    type: "audio/wav",
  });
}

export default function App() {
  const [session, setSession] =
    useState<Session | null>(null);

  const [settingsOpen, setSettingsOpen] =
    useState(false);

  const [status, setStatus] =
    useState<InterviewStatus>("idle");

  const [candidateStatus, setCandidateStatus] =
    useState<CandidateStatus>("idle");

  const [ttsStatus, setTTSStatus] =
    useState<TTSStatus>("idle");

  const [interviewId, setInterviewId] =
    useState<string | null>(null);

  const [lastTranscript, setLastTranscript] =
    useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [seconds, setSeconds] = useState(0);
  const [error, setError] =
    useState<string | null>(null);

  const [position, setPosition] =
    useState<Position>({
      x: Math.max(20, window.innerWidth - 260),
      y: Math.max(100, window.innerHeight - 220),
    });

  const dragging = useRef(false);

  const dragOffset = useRef<Position>({
    x: 0,
    y: 0,
  });

  const vadRef = useRef<LocalVad | null>(null);
  const interviewIdRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const processingRef = useRef(false);

  const CODE_IDLE_DELAY_MS = 10_000;

  const latestCodeRef = useRef("");
  const latestLanguageRef = useRef("");

  const typingRef = useRef(false);

  const codeUpdateTimerRef =
    useRef<number | null>(null);

  const vadInitializationRef =
    useRef<Promise<void> | null>(null);

  const processCapturedSpeechRef = useRef<
    (audio: Float32Array) => Promise<void>
  >(async () => undefined);

  useEffect(() => {
    function onEditorContext(
      event: Event,
    ) {
      const customEvent =
        event as CustomEvent<{
          code: string;
          programmingLanguage: string;
        }>;

      latestCodeRef.current =
        customEvent.detail?.code ?? "";

      latestLanguageRef.current =
        customEvent.detail?.programmingLanguage ?? "";

      typingRef.current = true;

      if (codeUpdateTimerRef.current !== null) {
        window.clearTimeout(codeUpdateTimerRef.current);
      }

      codeUpdateTimerRef.current =
        window.setTimeout(async () => {

          typingRef.current = false;

          console.log(
            "Candidate stopped typing"
          );

          // send latest context here

        }, CODE_IDLE_DELAY_MS);
    }

    window.addEventListener(
      "leetally:editor-context",
      onEditorContext,
    );

    return () => {
      window.removeEventListener(
        "leetally:editor-context",
        onEditorContext,
      );

      if (codeUpdateTimerRef.current !== null) {
        window.clearTimeout(codeUpdateTimerRef.current);
        codeUpdateTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    interviewIdRef.current = interviewId;
  }, [interviewId]);

  useEffect(() => {
    runningRef.current = status === "running";
  }, [status]);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

    return () => {
      subscription.unsubscribe();
      tts.cancel();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const vad = new LocalVad();
    vadRef.current = vad;

    vadInitializationRef.current =
      vad.initialize({
        onSpeechStart: () => {
          if (
            disposed ||
            !runningRef.current ||
            processingRef.current
          ) {
            return;
          }

          tts.cancel();
          setTTSStatus("cancelled");
          setCandidateStatus("speaking");
        },

        onSpeechEnd: (audio) => {
          if (
            disposed ||
            !runningRef.current ||
            processingRef.current
          ) {
            return;
          }

          void processCapturedSpeechRef.current(
            audio,
          );
        },

        onVADMisfire: () => {
          if (
            !disposed &&
            runningRef.current &&
            !processingRef.current
          ) {
            setCandidateStatus("listening");
          }
        },
      });

    void vadInitializationRef.current.catch(
      (cause: unknown) => {
        if (disposed) {
          return;
        }

        console.error(
          "[LeetAlly VAD] Initialization error",
          cause,
        );

        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to initialise voice detection.",
        );
      },
    );

    return () => {
      disposed = true;
      vadInitializationRef.current = null;
      vadRef.current = null;

      void vad.destroy();
    };
  }, []);

  useEffect(() => {
    if (status !== "running") {
      return;
    }

    const timer = window.setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [status]);

  async function signIn(): Promise<void> {
    setError(null);

    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setPassword("");
  }

  async function speak(
    text: string,
    speechId = crypto.randomUUID(),
  ): Promise<void> {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return;
    }

    setError(null);

    try {
      await tts.speak(
        normalizedText,
        {
          speechId,
          rate: 0.92,
          pitch: 1,
          volume: 1,
          language: "en-US",
          voiceName: "Microsoft Aria Online",
        },
        {
          onStatusChange: setTTSStatus,

          onError: (speechError) => {
            console.error(
              "[LeetAlly TTS]",
              speechError,
            );

            setError(speechError.message);
          },
        },
      );
    } catch (cause) {
      const message =
        cause instanceof Error
          ? cause.message
          : "Unable to play interviewer voice.";

      setError(message);
      setTTSStatus("error");
    }
  }

  async function processCapturedSpeech(
    audio: Float32Array,
  ): Promise<void> {
    const activeInterviewId =
      interviewIdRef.current;

    if (
      !activeInterviewId ||
      !runningRef.current ||
      processingRef.current
    ) {
      return;
    }

    /*
     * Ignore very short VAD segments and accidental noises.
     * At 16 kHz, 0.4 seconds is approximately 6,400 samples.
     */
    if (audio.length < VAD_SAMPLE_RATE * 0.4) {
      setCandidateStatus("listening");
      return;
    }

    processingRef.current = true;
    setCandidateStatus("processing");
    setError(null);

    try {
      const pcmAudio = float32ToPcm16(audio);
      const wavBlob = pcm16ToWavBlob(pcmAudio);

      const result = await submitInterviewAudio(
        activeInterviewId,
        wavBlob,
      );

      if (!runningRef.current) {
        return;
      }

      setLastTranscript(result.transcript);
      setCandidateStatus("listening");

      await speak(result.interviewer_message);

      if (runningRef.current) {
        setCandidateStatus("listening");
      }
    } catch (cause) {
      setCandidateStatus(
        runningRef.current ? "listening" : "idle",
      );

      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to process your response.",
      );
    } finally {
      processingRef.current = false;
    }
  }

  processCapturedSpeechRef.current =
    processCapturedSpeech;

  async function testVoice(): Promise<void> {
    await speak(
      "Hello. I am your LeetAlly interviewer. Please explain your initial approach to this problem.",
    );
  }

  function stopVoice(): void {
    tts.cancel();
    setTTSStatus("cancelled");

    if (runningRef.current) {
      setCandidateStatus("listening");
    }
  }

  async function startInterview(): Promise<void> {
    setError(null);

    if (!session) {
      setSettingsOpen(true);
      setError("Sign in first.");
      return;
    }

    try {
      setStatus("starting");

      const context = {
        ...adapter.getContext(),
        ...readLeetCodeContext(),
        code: latestCodeRef.current,
        programmingLanguage:
          latestLanguageRef.current ||
          readProgrammingLanguage(),
      };
      const interview = await createInterview(context);

      interviewIdRef.current = interview.id;
      runningRef.current = true;

      setInterviewId(interview.id);
      setLastTranscript("");
      setCandidateStatus("listening");
      setSeconds(0);
      setStatus("running");

      if (vadInitializationRef.current) {
        await vadInitializationRef.current;
      }

      if (!vadRef.current) {
        throw new Error(
          "Voice detection is unavailable.",
        );
      }

      await vadRef.current.start();

      void speak(
        "Your interview has started. First, explain the problem in your own words and then describe your initial approach.",
      );
    } catch (cause) {
      runningRef.current = false;
      interviewIdRef.current = null;

      setStatus("idle");
      setInterviewId(null);
      setCandidateStatus("idle");

      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to start interview.",
      );

      setSettingsOpen(true);
    }
  }

  function endInterview(): void {
    runningRef.current = false;
    processingRef.current = false;
    interviewIdRef.current = null;
    typingRef.current = false;

    if (codeUpdateTimerRef.current !== null) {
      window.clearTimeout(codeUpdateTimerRef.current);
      codeUpdateTimerRef.current = null;
    }

    void vadRef.current?.pause();
    tts.cancel();

    setInterviewId(null);
    setCandidateStatus("idle");
    setLastTranscript("");
    setTTSStatus("idle");
    setStatus("idle");
    setSeconds(0);
  }

  function formatTime(
    totalSeconds: number,
  ): string {
    const minutes = Math.floor(totalSeconds / 60);
    const secondsLeft = totalSeconds % 60;

    return `${String(minutes).padStart(
      2,
      "0",
    )}:${String(secondsLeft).padStart(2, "0")}`;
  }

  function getTTSLabel(): string {
    switch (ttsStatus) {
      case "loading":
        return "Preparing voice";

      case "speaking":
        return "Interviewer speaking";

      case "paused":
        return "Voice paused";

      case "cancelled":
        return "Voice stopped";

      case "error":
        return "Voice error";

      default:
        return "Voice ready";
    }
  }

  function getCandidateLabel(): string {
    switch (candidateStatus) {
      case "listening":
        return "Listening automatically. Start speaking when ready.";

      case "speaking":
        return "Listening to your response...";

      case "processing":
        return "Processing your response...";

      default:
        return "Start the interview to enable automatic listening.";
    }
  }

  function beginDrag(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    dragging.current = true;

    dragOffset.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
  }

  function moveDrag(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    if (!dragging.current) {
      return;
    }

    setPosition({
      x: Math.max(
        8,
        Math.min(
          window.innerWidth - 220,
          event.clientX - dragOffset.current.x,
        ),
      ),

      y: Math.max(
        8,
        Math.min(
          window.innerHeight - 150,
          event.clientY - dragOffset.current.y,
        ),
      ),
    });
  }

  function stopDrag(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    dragging.current = false;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }
  }

  const running = status === "running";
  const speaking = ttsStatus === "speaking";

  const voiceBusy =
    ttsStatus === "loading" ||
    ttsStatus === "speaking";

  return (
    <div
      className="leetally-shell"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {settingsOpen && (
        <section className="leetally-panel">
          <header>
            <strong>LeetAlly</strong>

            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
            >
              ×
            </button>
          </header>

          {error && (
            <p className="leetally-error">
              {error}
            </p>
          )}

          {!session ? (
            <>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(event) =>
                  setEmail(event.target.value)
                }
              />

              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
              />

              <button
                type="button"
                className="leetally-login"
                onClick={() => void signIn()}
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              <p className="leetally-email">
                {session.user.email}
              </p>

              <button
                type="button"
                className="leetally-logout"
                disabled={running}
                onClick={() =>
                  void supabase.auth.signOut()
                }
              >
                Logout
              </button>
            </>
          )}

          <div className="leetally-voice-section">
            <p className="leetally-voice-status">
              {getTTSLabel()}
            </p>

            <div className="leetally-voice-actions">
              <button
                type="button"
                disabled={voiceBusy}
                onClick={() => void testVoice()}
              >
                Test voice
              </button>

              <button
                type="button"
                disabled={!voiceBusy}
                onClick={stopVoice}
              >
                Stop voice
              </button>
            </div>
          </div>

          {running && (
            <div className="leetally-transcript-section">
              <p>{getCandidateLabel()}</p>

              {lastTranscript && (
                <>
                  <strong>Last transcript</strong>
                  <p>{lastTranscript}</p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <div
        className={`leetally-creature ${running ? "running" : ""
          } ${speaking ? "speaking" : ""}`}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div className="head">
          <span className="eye left" />
          <span className="eye right" />
          <span className="mouth" />
        </div>

        <div className="body" />
      </div>

      <div className="leetally-controls">
        <button
          type="button"
          onClick={() =>
            running
              ? endInterview()
              : void startInterview()
          }
          disabled={status === "starting"}
          title={
            running
              ? "End interview"
              : "Start interview"
          }
        >
          {running
            ? "■"
            : status === "starting"
              ? "…"
              : "▶"}
        </button>

        <span>{formatTime(seconds)}</span>

        <button
          type="button"
          disabled
          title={getCandidateLabel()}
          aria-label={getCandidateLabel()}
        >
          {candidateStatus === "speaking"
            ? "🔴"
            : candidateStatus === "processing"
              ? "…"
              : "🎙"}
        </button>

        {voiceBusy && (
          <button
            type="button"
            onClick={stopVoice}
            title="Stop interviewer voice"
          >
            🔇
          </button>
        )}

        <button
          type="button"
          onClick={() =>
            setSettingsOpen(
              (current) => !current,
            )
          }
          title="Settings"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
