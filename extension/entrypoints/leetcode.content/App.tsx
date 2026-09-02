import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import type { Session } from "@supabase/supabase-js";

import {
  createInterview,
  completeInterview,
  InterviewStreamUnavailableError,
  submitInterviewAudio,
  submitInterviewAudioStream,
  updateInterviewContext,
  type InterviewAssessment,
  type InterviewPhase,
  type InterviewStreamStage,
  type VoiceProviderId,
} from "../../lib/api.ts";

import { LeetCodeAdapter } from "../../lib/leetcode.ts";
import { supabase } from "../../lib/supabase.ts";
import {
  POLICY_VERSION,
  recordPolicyAcceptance,
  sendPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  syncWebsiteSession,
} from "../../lib/auth.ts";
import { reconcileProgressWithCloud, saveAccountProgress, startCloudProgressSync } from "../../lib/cloud-progress.ts";
import type { TTSStatus } from "../../lib/tts/types.ts";

import { LocalVad } from "../../lib/voice/local-vad.ts";
import { float32ToPcm16 } from "../../lib/voice/pcm.ts";

import { readLeetCodeContext } from "@/lib/leetcode-context.ts";
import {
  loadProgress,
  isTargetCompanyId,
  localDateKey,
  PROGRESS_STORAGE_KEY,
  recordSolved,
  saveProgress,
  type Difficulty,
  type InterviewHistoryRecord,
  type InterviewType,
  type ProgressData,
  type TargetCompanyId,
} from "../../lib/progress.ts";
import { syncLeetCodeProfile } from "../../lib/leetcode-profile.ts";
import { updateAllSheetProgress } from "../../lib/sheet-progress.ts";
import { findProblemCompanies, loadCompanyCatalog } from "../../lib/company-problems.ts";
import { InterviewerMark, type InterviewerMarkMode } from "./InterviewerMark.tsx";
import { FocusTimer } from "./FocusTimer.tsx";

interface Position {
  x: number;
  y: number;
}

type InterviewStatus = "idle" | "starting" | "running";

type CandidateStatus = "idle" | "listening" | "speaking" | "processing";

type ConversationMessage = {
  id: string;
  role: "candidate" | "interviewer";
  text: string;
};

const adapter = new LeetCodeAdapter();

const VAD_SAMPLE_RATE = 16_000;
const INTERVIEW_INACTIVITY_LIMIT_MS = 5 * 60 * 1_000;
const WEBSITE_URL = (
  (import.meta.env.VITE_WEBSITE_URL as string | undefined) || "https://leetally-web.vercel.app"
).replace(/\/$/, "");
const TERMS_URL = (import.meta.env.VITE_TERMS_URL as string | undefined) || `${WEBSITE_URL}/terms`;
const PRIVACY_URL = (import.meta.env.VITE_PRIVACY_URL as string | undefined) || `${WEBSITE_URL}/privacy`;
const POLICY_ACCEPTANCE_KEY = "leetally-policy-acceptance";
const CHROME_STORE_URL = "https://chromewebstore.google.com/detail/kbmamkkghfaagfplfdgpdocmgakhjmlo";

function pcm16ToWavBlob(pcmBuffer: ArrayBuffer, sampleRate = VAD_SAMPLE_RATE): Blob {
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
  const [session, setSession] = useState<Session | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedInterviewType, setSelectedInterviewType] = useState<InterviewType>("dsa");

  const [interviewFeedback, setInterviewFeedback] = useState<InterviewAssessment | null>(null);

  const [status, setStatus] = useState<InterviewStatus>("idle");
  const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>("clarification");
  const [streamStage, setStreamStage] = useState<InterviewStreamStage | null>(null);

  const [candidateStatus, setCandidateStatus] = useState<CandidateStatus>("idle");

  const [ttsStatus, setTTSStatus] = useState<TTSStatus>("idle");
  const voiceProvider: VoiceProviderId = "fish";

  const [interviewId, setInterviewId] = useState<string | null>(null);

  const [lastTranscript, setLastTranscript] = useState("");

  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);

  const [conversationOpen, setConversationOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [policiesAccepted, setPoliciesAccepted] = useState(false);
  const [shareNotice, setShareNotice] = useState("");

  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [position, setPosition] = useState<Position>({
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
  const streamAbortRef = useRef<AbortController | null>(null);

  const fishAudioRef = useRef<HTMLAudioElement | null>(null);

  const fishAudioUrlRef = useRef<string | null>(null);

  const fishAudioCancelRef = useRef<(() => void) | null>(null);

  const userAudioLevelRef = useRef(0);
  const aiAudioLevelRef = useRef(0);
  const aiMeterFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const aiAudioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const aiAudioAnalyserRef = useRef<AnalyserNode | null>(null);
  const conversationMessagesRef = useRef<HTMLDivElement | null>(null);
  const targetCompanyRef = useRef<TargetCompanyId>("google");
  const interviewTypeRef = useRef<InterviewType>("dsa");
  const startInterviewRef = useRef<() => Promise<void>>(async () => undefined);
  const endInterviewRef = useRef<(reason?: "user" | "inactive") => Promise<void>>(async () => undefined);
  const lastActivityAtRef = useRef(Date.now());

  const CODE_IDLE_DELAY_MS = 1_000;

  const latestCodeRef = useRef("");
  const latestLanguageRef = useRef("");

  const typingRef = useRef(false);

  const codeUpdateTimerRef = useRef<number | null>(null);

  const vadInitializationRef = useRef<Promise<void> | null>(null);

  const processCapturedSpeechRef = useRef<(audio: Float32Array) => Promise<void>>(async () => undefined);

  function setEditorCollectionEnabled(enabled: boolean): void {
    window.dispatchEvent(
      new CustomEvent("leetally:editor-control", {
        detail: { enabled },
      }),
    );
  }

  useEffect(() => {
    let active = true;
    void browser.storage.local.get(POLICY_ACCEPTANCE_KEY).then((stored) => {
      if (active) {
        setPoliciesAccepted(stored[POLICY_ACCEPTANCE_KEY] === POLICY_VERSION);
      }
    });
    return () => {
      active = false;
      setEditorCollectionEnabled(false);
    };
  }, []);

  async function updatePolicyAcceptance(accepted: boolean): Promise<void> {
    setPoliciesAccepted(accepted);
    if (accepted) {
      await browser.storage.local.set({ [POLICY_ACCEPTANCE_KEY]: POLICY_VERSION });
    } else {
      await browser.storage.local.remove(POLICY_ACCEPTANCE_KEY);
      setEditorCollectionEnabled(false);
    }
  }

  useEffect(() => {
    if (!session) return;
    setPoliciesAccepted(true);
    void browser.storage.local.set({ [POLICY_ACCEPTANCE_KEY]: POLICY_VERSION });
  }, [session?.user.id]);

  async function shareLeetAlly(): Promise<void> {
    const shareData = {
      title: "LeetAlly – LeetCode Progress Tracker",
      text: "Track LeetCode progress and practice interviews with LeetAlly.",
      url: CHROME_STORE_URL,
    };

    try {
      if (typeof navigator.share === "function") {
        await navigator.share(shareData);
        setShareNotice("Shared.");
        return;
      }
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setShareNotice("Share link copied.");
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setShareNotice("Could not open sharing. Copy the link from the Chrome Web Store.");
    }
  }

  useEffect(() => {
    function onEditorContext(event: Event) {
      const customEvent = event as CustomEvent<{
        code: string;
        programmingLanguage: string;
      }>;

      latestCodeRef.current = customEvent.detail?.code ?? "";

      latestLanguageRef.current = customEvent.detail?.programmingLanguage ?? "";

      if (runningRef.current) {
        lastActivityAtRef.current = Date.now();
      }

      typingRef.current = true;

      if (codeUpdateTimerRef.current !== null) {
        window.clearTimeout(codeUpdateTimerRef.current);
      }

      codeUpdateTimerRef.current = window.setTimeout(async () => {
        typingRef.current = false;

        const activeInterviewId = interviewIdRef.current;
        if (activeInterviewId && runningRef.current) {
          const pageContext = readLeetCodeContext(latestCodeRef.current, latestLanguageRef.current);
          void updateInterviewContext(activeInterviewId, {
            problem_title: pageContext.problemTitle,
            problem_description: pageContext.problemDescription,
            difficulty: pageContext.difficulty,
            programming_language: pageContext.programmingLanguage,
            code: pageContext.code,
            visible_output: pageContext.visibleOutput,
            problem_topics: pageContext.problemTopics,
          }).catch(() => undefined);
        }
      }, CODE_IDLE_DELAY_MS);
    }

    window.addEventListener("leetally:editor-context", onEditorContext);

    return () => {
      window.removeEventListener("leetally:editor-context", onEditorContext);

      if (codeUpdateTimerRef.current !== null) {
        window.clearTimeout(codeUpdateTimerRef.current);
        codeUpdateTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    void loadProgress().then((current) => {
      if (active) {
        targetCompanyRef.current = current.planner.targetCompany;
        interviewTypeRef.current = current.planner.interviewType ?? "dsa";
        setSelectedInterviewType(interviewTypeRef.current);
      }
    });

    function onStorageChanged(changes: Record<string, Browser.storage.StorageChange>, areaName: string): void {
      if (areaName !== "local") return;
      if (Object.keys(changes).some((key) => key.startsWith("sb-") && key.endsWith("-auth-token"))) {
        void supabase.auth.getSession().then(({ data }) => setSession(data.session));
      }
      const nextCompany = (changes[PROGRESS_STORAGE_KEY]?.newValue as Partial<ProgressData> | undefined)?.planner
        ?.targetCompany;
      const nextInterviewType = (changes[PROGRESS_STORAGE_KEY]?.newValue as Partial<ProgressData> | undefined)?.planner
        ?.interviewType;
      if (isTargetCompanyId(nextCompany)) {
        targetCompanyRef.current = nextCompany;
      }
      if (["dsa", "behavioral", "lld", "hld"].includes(nextInterviewType ?? "")) {
        interviewTypeRef.current = nextInterviewType as InterviewType;
        setSelectedInterviewType(interviewTypeRef.current);
      }
    }

    browser.storage.onChanged.addListener(onStorageChanged);

    return () => {
      active = false;
      browser.storage.onChanged.removeListener(onStorageChanged);
    };
  }, []);

  useEffect(() => {
    if (!policiesAccepted) return;
    async function syncProfile(): Promise<void> {
      try {
        const current = await loadProgress();
        if (!current.profile?.username) return;
        const profile = await syncLeetCodeProfile(current.profile.username);
        targetCompanyRef.current = current.planner.targetCompany;
        const sheets = profile.verifiedOwner
          ? await updateAllSheetProgress(current.sheets, profile.acceptedSlugs ?? [], profile.acceptedProblemIds ?? [])
          : current.sheets;
        const latest = await loadProgress();
        targetCompanyRef.current = latest.planner.targetCompany;
        await saveProgress({
          ...latest,
          profile,
          sheets,
          activity: {
            ...latest.activity,
            ...(profile.submissionActivity ?? {}),
          },
        });
      } catch {
        /* Profile sync is optional. */
      }
    }
    void syncProfile();
  }, [policiesAccepted, session?.user.id]);

  // Track successful submissions independently of whether the dashboard is open.
  useEffect(() => {
    let acceptedVisible = false;
    let disposed = false;
    let captureInFlight = false;

    async function captureAcceptedSubmission(forceAccepted = false): Promise<void> {
      if (captureInFlight || disposed) return;
      const accepted = forceAccepted || /(^|\n)\s*Accepted\s*(\n|$)/im.test(document.body.innerText);

      if (!accepted) {
        acceptedVisible = false;
        return;
      }

      if (acceptedVisible || disposed) return;
      acceptedVisible = true;
      captureInFlight = true;

      const rawDifficulty = adapter.getDifficulty()?.toLowerCase();
      const difficulty: Difficulty = rawDifficulty === "easy" || rawDifficulty === "hard" ? rawDifficulty : "medium";
      try {
        const current = await loadProgress();
        const problemSlug = adapter.getProblemSlug();
        let updated = recordSolved(current, problemSlug, difficulty);

        if (updated !== current && !disposed) {
          console.info("[LeetAlly tracking] Accepted submission detected.", {
            problemSlug,
            source: forceAccepted ? "submission-response" : "page-result",
          });
          if (current.profile?.username) {
            try {
              const profile = await syncLeetCodeProfile(current.profile.username);
              if (profile.verifiedOwner) {
                const sheets = await updateAllSheetProgress(
                  updated.sheets,
                  profile.acceptedSlugs ?? [],
                  profile.acceptedProblemIds ?? [],
                );
                updated = {
                  ...updated,
                  profile,
                  sheets,
                  activity: { ...updated.activity, ...(profile.submissionActivity ?? {}) },
                };
              }
            } catch {
              // Keep the locally recorded accepted submission and retry profile sync later.
            }
          }
          await saveProgress(updated);
          console.info("[LeetAlly tracking] Activity saved.", {
            date: localDateKey(),
            count: updated.activity[localDateKey()] ?? 0,
          });
        }
      } catch (cause) {
        console.error("[LeetAlly tracking] Could not save accepted submission.", {
          error: cause instanceof Error ? cause.message : String(cause),
        });
      } finally {
        captureInFlight = false;
      }
    }

    function onAcceptedSubmission(): void {
      acceptedVisible = false;
      void captureAcceptedSubmission(true);
    }

    const observer = new MutationObserver(() => {
      void captureAcceptedSubmission();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    window.addEventListener("leetally:submission-accepted", onAcceptedSubmission);
    void captureAcceptedSubmission();

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("leetally:submission-accepted", onAcceptedSubmission);
    };
  }, []);

  useEffect(() => {
    interviewIdRef.current = interviewId;
  }, [interviewId]);

  useEffect(() => {
    const container = conversationMessagesRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [candidateStatus, conversationMessages]);

  useEffect(() => {
    runningRef.current = status === "running";
  }, [status]);

  useEffect(() => {
    function startCompanyMock(): void {
      void startInterviewRef.current();
    }
    window.addEventListener("leetally:start-company-mock", startCompanyMock);
    return () => window.removeEventListener("leetally:start-company-mock", startCompanyMock);
  }, []);

  useEffect(() => {
    if (status !== "running") return;
    if (seconds === 40 * 60) {
      setConversationMessages((current) =>
        [
          ...current,
          {
            id: crypto.randomUUID(),
            role: "interviewer" as const,
            text: "You have five minutes remaining. Please finish the implementation, test it, and state the complexity.",
          },
        ].slice(-12),
      );
      setConversationOpen(true);
    }
    if (seconds === 45 * 60) {
      void endInterview();
    }
  }, [seconds, status]);

  useEffect(() => {
    void (async () => {
      const initial = (await supabase.auth.getSession()).data.session;
      if (!initial) await syncWebsiteSession(false).catch(() => false);
      const current = (await supabase.auth.getSession()).data.session;
      setSession(current);
      if (current) void reconcileProgressWithCloud(current.user.id).catch(() => undefined);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) void reconcileProgressWithCloud(nextSession.user.id).catch(() => undefined);
    });
    const stopCloudSync = startCloudProgressSync();

    return () => {
      subscription.unsubscribe();
      stopCloudSync();
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      stopFishAudio();
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    const vad = new LocalVad();
    vadRef.current = vad;

    vadInitializationRef.current = vad.initialize({
      onSpeechStart: () => {
        if (disposed || !runningRef.current || processingRef.current) {
          return;
        }

        lastActivityAtRef.current = Date.now();

        // Ignore VAD while processing or speaking. Otherwise speaker output
        // can cancel the interviewer voice before it becomes audible.
        stopFishAudio();
        setTTSStatus("cancelled");

        setCandidateStatus("speaking");
        setConversationOpen(true);
      },

      onSpeechEnd: (audio) => {
        userAudioLevelRef.current = 0;
        if (disposed || !runningRef.current || processingRef.current) {
          return;
        }

        lastActivityAtRef.current = Date.now();

        void processCapturedSpeechRef.current(audio);
      },

      onVADMisfire: () => {
        userAudioLevelRef.current = 0;
        if (!disposed && runningRef.current && !processingRef.current) {
          setCandidateStatus("listening");
        }
      },

      onAudioLevel: (level) => {
        userAudioLevelRef.current = level;
      },
    });

    void vadInitializationRef.current.catch((cause: unknown) => {
      if (disposed) {
        return;
      }

      console.error("[LeetAlly VAD] Initialization error", cause);

      setError(cause instanceof Error ? cause.message : "Unable to initialise voice detection.");
    });

    return () => {
      disposed = true;
      vadInitializationRef.current = null;
      vadRef.current = null;

      void vad.destroy();
    };
  }, []);

  useEffect(() => {
    if (status !== "running" && status !== "starting") {
      return;
    }

    const timer = window.setInterval(() => {
      setSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [status]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivityAtRef.current >= INTERVIEW_INACTIVITY_LIMIT_MS) {
        setError("Interview ended after five minutes without speech or code activity.");
        void endInterviewRef.current("inactive");
      }
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [status]);

  async function authenticateWithEmail(): Promise<void> {
    setError(null);
    setAuthNotice("");
    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const needsConfirmation = await signUpWithEmail(email, password);
        setAuthNotice(needsConfirmation ? "Check your inbox, confirm your email, then sign in." : "Account created.");
        if (needsConfirmation) setAuthMode("signin");
      } else {
        await signInWithEmail(email, password);
      }
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function authenticateWithGoogle(): Promise<void> {
    setError(null);
    setAuthNotice("");
    setAuthBusy(true);
    try {
      await signInWithGoogle();
      await recordPolicyAcceptance();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Google sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function resetPassword(): Promise<void> {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError(null);
    setAuthBusy(true);
    try {
      await sendPasswordReset(email);
      setAuthNotice("If an account exists for that email, a password reset link has been sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send reset email.");
    } finally {
      setAuthBusy(false);
    }
  }

  function stopFishAudio(): void {
    stopAILevelMeter();
    window.speechSynthesis?.cancel();

    const audio = fishAudioRef.current;
    const cancelPlayback = fishAudioCancelRef.current;
    fishAudioCancelRef.current = null;

    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      fishAudioRef.current = null;
    }

    const audioUrl = fishAudioUrlRef.current;

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      fishAudioUrlRef.current = null;
    }

    cancelPlayback?.();
  }

  function stopAILevelMeter(): void {
    if (aiMeterFrameRef.current !== null) {
      window.cancelAnimationFrame(aiMeterFrameRef.current);
      aiMeterFrameRef.current = null;
    }
    aiAudioSourceRef.current?.disconnect();
    aiAudioAnalyserRef.current?.disconnect();
    aiAudioSourceRef.current = null;
    aiAudioAnalyserRef.current = null;
    aiAudioLevelRef.current = 0;
  }

  async function startAILevelMeter(audio: HTMLAudioElement): Promise<void> {
    stopAILevelMeter();
    try {
      const audioContext = audioContextRef.current ?? new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
      aiAudioSourceRef.current = source;
      aiAudioAnalyserRef.current = analyser;
      const samples = new Uint8Array(analyser.fftSize);

      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let index = 0; index < samples.length; index += 1) {
          const normalized = (samples[index] - 128) / 128;
          sum += normalized * normalized;
        }
        aiAudioLevelRef.current = Math.min(1, Math.sqrt(sum / samples.length) * 4.5);
        aiMeterFrameRef.current = window.requestAnimationFrame(measure);
      };
      measure();
    } catch {
      aiAudioLevelRef.current = 0.18;
    }
  }

  /**
   * Play base64-encoded audio returned by the backend (Fish Audio).
   * This is the primary voice path — no robot voice here.
   */
  async function playBackendAudio(base64: string, contentType: string): Promise<boolean> {
    stopFishAudio();

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    const blob = new Blob([bytes], {
      type: contentType,
    });

    const audioUrl = URL.createObjectURL(blob);

    const audio = new Audio(audioUrl);

    fishAudioRef.current = audio;
    fishAudioUrlRef.current = audioUrl;

    audio.preload = "auto";

    setTTSStatus("loading");

    return new Promise<boolean>((resolve, reject) => {
      const cancelPlayback = () => {
        setTTSStatus("cancelled");
        resolve(false);
      };
      fishAudioCancelRef.current = cancelPlayback;

      function releaseAudio(): void {
        stopAILevelMeter();
        if (fishAudioCancelRef.current === cancelPlayback) {
          fishAudioCancelRef.current = null;
        }
        if (fishAudioRef.current === audio) {
          fishAudioRef.current = null;
        }

        if (fishAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          fishAudioUrlRef.current = null;
        }
      }

      audio.onplay = () => {
        setTTSStatus("speaking");
        // Keep Fish Audio on the native HTMLAudioElement output path.
        // Routing it through a suspended AudioContext can make valid MP3
        // playback silent in a content script.
        aiAudioLevelRef.current = 0.35;
      };

      audio.onended = () => {
        releaseAudio();
        setTTSStatus("idle");
        resolve(true);
      };

      audio.onerror = () => {
        releaseAudio();
        setTTSStatus("error");

        reject(new Error("Fish Audio playback failed."));
      };

      audio.play().catch((cause: unknown) => {
        releaseAudio();
        setTTSStatus("error");

        reject(cause instanceof Error ? cause : new Error("Fish Audio playback failed."));
      });
    });
  }

  async function playBrowserVoice(text: string): Promise<boolean> {
    const message = text.trim();
    if (!message || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      return false;
    }

    stopFishAudio();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1.05;
    setTTSStatus("loading");

    return new Promise<boolean>((resolve) => {
      utterance.onstart = () => setTTSStatus("speaking");
      utterance.onend = () => {
        setTTSStatus("idle");
        resolve(true);
      };
      utterance.onerror = () => {
        setTTSStatus("error");
        resolve(false);
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  async function processCapturedSpeech(audio: Float32Array): Promise<void> {
    const activeInterviewId = interviewIdRef.current;

    if (!activeInterviewId || !runningRef.current || processingRef.current) {
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
    setStreamStage("transcribing");
    setError(null);

    try {
      const pcmAudio = float32ToPcm16(audio);
      const wavBlob = pcm16ToWavBlob(pcmAudio);

      const currentContext = readLeetCodeContext(latestCodeRef.current, latestLanguageRef.current);
      await updateInterviewContext(activeInterviewId, {
        problem_title: currentContext.problemTitle,
        problem_description: currentContext.problemDescription,
        difficulty: currentContext.difficulty,
        programming_language: currentContext.programmingLanguage,
        code: currentContext.code,
        visible_output: currentContext.visibleOutput,
        problem_topics: currentContext.problemTopics,
      });

      const candidateMessageId = crypto.randomUUID();
      const interviewerMessageId = crypto.randomUUID();
      const controller = new AbortController();
      streamAbortRef.current?.abort();
      streamAbortRef.current = controller;

      let streamStarted = false;
      let streamedTranscript = "";
      let streamedReply = "";
      let streamedAudioBase64 = "";
      let streamedAudioContentType = "";
      let fallbackResult: Awaited<ReturnType<typeof submitInterviewAudio>> | null = null;

      try {
        await submitInterviewAudioStream(
          activeInterviewId,
          wavBlob,
          {
            onStatus: (stage) => {
              streamStarted = true;
              setStreamStage(stage);
              if (stage === "voice") setTTSStatus("loading");
            },
            onTranscript: (text, phase) => {
              streamStarted = true;
              streamedTranscript = text;
              setInterviewPhase(phase);
              if (!text.trim() || !runningRef.current) return;
              setLastTranscript(text);
              setConversationMessages((current) =>
                [
                  ...current,
                  {
                    id: candidateMessageId,
                    role: "candidate" as const,
                    text,
                  },
                ].slice(-12),
              );
              setConversationOpen(true);
            },
            onAssistantDelta: (delta) => {
              streamStarted = true;
              if (!runningRef.current || !delta) return;
              streamedReply += delta;
              setConversationMessages((current) => {
                const exists = current.some((message) => message.id === interviewerMessageId);
                if (!exists) {
                  return [
                    ...current,
                    {
                      id: interviewerMessageId,
                      role: "interviewer" as const,
                      text: streamedReply,
                    },
                  ].slice(-12);
                }
                return current.map((message) =>
                  message.id === interviewerMessageId ? { ...message, text: streamedReply } : message,
                );
              });
              setConversationOpen(true);
            },
            onAssistantDone: (text, phase) => {
              streamStarted = true;
              streamedReply = text;
              setInterviewPhase(phase);
              setConversationMessages((current) => {
                const exists = current.some((message) => message.id === interviewerMessageId);
                if (!exists) {
                  return [
                    ...current,
                    {
                      id: interviewerMessageId,
                      role: "interviewer" as const,
                      text,
                    },
                  ].slice(-12);
                }
                return current.map((message) => (message.id === interviewerMessageId ? { ...message, text } : message));
              });
            },
            onAudio: (base64, contentType) => {
              streamedAudioBase64 = base64;
              streamedAudioContentType = contentType;
            },
            onNotice: (message) => setError(message),
            onDone: (phase, serviceNotice) => {
              setInterviewPhase(phase);
              setStreamStage(null);
              if (serviceNotice) setError(serviceNotice);
            },
          },
          controller.signal,
          voiceProvider,
        );
      } catch (cause) {
        if (cause instanceof InterviewStreamUnavailableError && !streamStarted) {
          fallbackResult = await submitInterviewAudio(activeInterviewId, wavBlob, voiceProvider);
        } else {
          throw cause;
        }
      } finally {
        if (streamAbortRef.current === controller) {
          streamAbortRef.current = null;
        }
      }

      if (!runningRef.current) return;

      if (fallbackResult) {
        setStreamStage(null);
        streamedTranscript = fallbackResult.transcript;
        streamedReply = fallbackResult.interviewer_message;
        streamedAudioBase64 = fallbackResult.interviewer_audio_base64 ?? "";
        streamedAudioContentType = fallbackResult.interviewer_audio_content_type ?? "";
        setInterviewPhase(fallbackResult.phase);
        if (fallbackResult.service_notice) setError(fallbackResult.service_notice);
        if (streamedTranscript.trim()) {
          setLastTranscript(streamedTranscript);
          setConversationMessages((current) =>
            [
              ...current,
              {
                id: candidateMessageId,
                role: "candidate" as const,
                text: streamedTranscript,
              },
              {
                id: interviewerMessageId,
                role: "interviewer" as const,
                text: streamedReply,
              },
            ].slice(-12),
          );
          setConversationOpen(true);
        }
      }

      if (!streamedTranscript.trim()) {
        setCandidateStatus("listening");
        setTTSStatus("idle");
        return;
      }

      setCandidateStatus("listening");
      if (!streamedAudioBase64 || !streamedAudioContentType) {
        if (streamedReply.trim()) {
          await playBrowserVoice(streamedReply);
        } else {
          setTTSStatus("idle");
        }
        return;
      }

      let playbackCompleted = false;
      try {
        playbackCompleted = await playBackendAudio(streamedAudioBase64, streamedAudioContentType);
      } catch {
        playbackCompleted = await playBrowserVoice(streamedReply);
      }

      if (playbackCompleted && runningRef.current) {
        setCandidateStatus("listening");
      }
    } catch (cause) {
      setStreamStage(null);
      if (cause instanceof DOMException && cause.name === "AbortError") {
        return;
      }
      setCandidateStatus(runningRef.current ? "listening" : "idle");

      setError(cause instanceof Error ? cause.message : "Unable to process your response.");
    } finally {
      processingRef.current = false;
    }
  }

  processCapturedSpeechRef.current = processCapturedSpeech;

  function stopVoice(): void {
    stopFishAudio();
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
      setSeconds(0);
      lastActivityAtRef.current = Date.now();
      if (vadInitializationRef.current) {
        await vadInitializationRef.current;
      }
      if (!vadRef.current) {
        throw new Error("Voice detection is unavailable.");
      }
      // Obtain microphone access before the backend claims a one-time trial.
      // The callbacks ignore audio until runningRef becomes true.
      await vadRef.current.start();
      setEditorCollectionEnabled(true);

      const adapterContext = adapter.getContext();
      const pageContext = readLeetCodeContext(latestCodeRef.current, latestLanguageRef.current);
      const context = {
        ...adapterContext,
        ...pageContext,
        problemTitle: pageContext.problemTitle || adapterContext.problemTitle,
        difficulty: pageContext.difficulty || adapterContext.difficulty,
        targetCompany: targetCompanyRef.current,
        interviewType: interviewTypeRef.current,
      };
      if (!context.problemTitle?.trim() || !context.problemSlug?.trim()) {
        throw new Error("Open a supported LeetCode problem page before starting an interview.");
      }
      const interview = await createInterview(context);

      if (interview.target_company !== targetCompanyRef.current) {
        throw new Error("The backend did not accept the selected company. Restart the FastAPI backend and try again.");
      }
      if (interview.interview_type !== interviewTypeRef.current) {
        throw new Error(
          "The backend did not accept the selected interview type. Restart the FastAPI backend and try again.",
        );
      }

      interviewIdRef.current = interview.id;
      runningRef.current = true;

      setInterviewId(interview.id);
      setLastTranscript("");
      const openingMessage: Record<InterviewType, string> = {
        dsa: "First, explain the problem in your own words and describe your initial approach.",
        behavioral:
          "Let's begin the behavioural round. Tell me about a time you took ownership of a difficult problem.",
        lld: "Let's begin the LLD round. Design a parking-lot system; start by clarifying requirements and identifying the core entities.",
        hld: "Let's begin the HLD round. Design a URL-shortening service; start with requirements, scale assumptions, and the main components.",
      };
      setConversationMessages([
        {
          id: crypto.randomUUID(),
          role: "interviewer",
          text: openingMessage[interviewTypeRef.current],
        },
      ]);
      setConversationOpen(true);
      setCandidateStatus("listening");
      setInterviewPhase("clarification");
      setStatus("running");

      void loadCompanyCatalog()
        .then((companyCatalog) => {
          const interviewCompanies = findProblemCompanies(companyCatalog, context.problemSlug).map(
            ({ company }) => company.name,
          );
          return updateInterviewContext(interview.id, {
            problem_title: context.problemTitle,
            problem_description: context.problemDescription,
            difficulty: context.difficulty ?? undefined,
            programming_language: context.programmingLanguage,
            code: context.code,
            visible_output: context.visibleOutput,
            problem_topics: context.problemTopics,
            interview_companies: interviewCompanies,
          });
        })
        .catch(() => {
          setError("Interview started, but the initial screen context is still syncing.");
        });

      // Do not call paid TTS before the candidate speaks. The opening prompt is
      // already visible in the conversation panel.
    } catch (cause) {
      setEditorCollectionEnabled(false);
      runningRef.current = false;
      interviewIdRef.current = null;
      void vadRef.current?.pause();

      setStatus("idle");
      setInterviewId(null);
      setCandidateStatus("idle");

      setError(cause instanceof Error ? cause.message : "Unable to start interview.");

      setSettingsOpen(true);
    }
  }

  startInterviewRef.current = startInterview;

  async function chooseInterviewType(interviewType: InterviewType): Promise<void> {
    if (runningRef.current) {
      setError("End the current interview before changing its type.");
      return;
    }
    interviewTypeRef.current = interviewType;
    setSelectedInterviewType(interviewType);
    const current = await loadProgress();
    await saveProgress({ ...current, planner: { ...current.planner, interviewType } });
    setError(null);
  }

  async function endInterview(reason: "user" | "inactive" = "user"): Promise<void> {
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    const activeInterviewId = interviewIdRef.current;
    const elapsedSeconds = seconds;
    const sessionUserId = session?.user.id;
    const currentContext = adapter.getContext();
    const currentPageContext = readLeetCodeContext(latestCodeRef.current, latestLanguageRef.current);
    runningRef.current = false;
    processingRef.current = false;
    interviewIdRef.current = null;
    setEditorCollectionEnabled(false);
    typingRef.current = false;

    if (codeUpdateTimerRef.current !== null) {
      window.clearTimeout(codeUpdateTimerRef.current);
      codeUpdateTimerRef.current = null;
    }

    void vadRef.current?.pause();
    stopFishAudio();
    setInterviewId(null);
    setCandidateStatus("idle");
    setLastTranscript("");
    setConversationMessages([]);
    setConversationOpen(false);
    setTTSStatus("idle");
    setStatus("idle");
    setSeconds(0);
    setInterviewPhase("clarification");
    setStreamStage(null);
    if (reason === "user") setError(null);

    let assessment: InterviewAssessment | null = null;
    if (activeInterviewId) {
      try {
        await updateInterviewContext(activeInterviewId, {
          problem_title: currentPageContext.problemTitle,
          problem_description: currentPageContext.problemDescription,
          difficulty: currentPageContext.difficulty,
          programming_language: currentPageContext.programmingLanguage,
          code: currentPageContext.code,
          visible_output: currentPageContext.visibleOutput,
          problem_topics: currentPageContext.problemTopics,
        });
        assessment = await completeInterview(activeInterviewId, elapsedSeconds);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not generate the interview scorecard.");
      }
    }
    if (sessionUserId && activeInterviewId && assessment) {
      const record: InterviewHistoryRecord = {
        id: activeInterviewId,
        userId: sessionUserId,
        companyId: targetCompanyRef.current,
        interviewType: interviewTypeRef.current,
        problemTitle: currentContext.problemTitle || "LeetCode interview",
        problemSlug: currentContext.problemSlug || "unknown",
        difficulty: currentContext.difficulty,
        completedAt: new Date().toISOString(),
        durationSeconds: elapsedSeconds,
        overallScore: assessment.overall_score,
        communicationScore: assessment.dimensions.communication.score,
        problemSolvingScore: assessment.dimensions.problem_solving.score,
        complexityScore: assessment.dimensions.complexity.score,
        edgeCaseScore: assessment.dimensions.testing.score,
        strengths: assessment.strengths,
        improvements: assessment.priority_improvements,
        summary: assessment.summary,
      };
      const current = await loadProgress();
      const updated = {
        ...current,
        interviews: [record, ...current.interviews.filter((item) => item.id !== record.id)].slice(0, 50),
      };
      try {
        await saveAccountProgress(sessionUserId, updated);
      } catch {
        // saveAccountProgress writes browser storage before cloud upload, so
        // the popup updates immediately and the storage listener can retry.
        setError("Interview saved on this device. Cloud backup will retry automatically.");
      }
    }
    setInterviewFeedback(assessment);
  }

  endInterviewRef.current = endInterview;

  function formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const secondsLeft = totalSeconds % 60;

    return `${String(minutes).padStart(2, "0")}:${String(secondsLeft).padStart(2, "0")}`;
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

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    dragging.current = true;

    dragOffset.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!dragging.current) {
      return;
    }

    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - 220, event.clientX - dragOffset.current.x)),

      y: Math.max(8, Math.min(window.innerHeight - 150, event.clientY - dragOffset.current.y)),
    });
  }

  function stopDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    dragging.current = false;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  const running = status === "running";
  const speaking = ttsStatus === "speaking";

  const voiceBusy = ttsStatus === "loading" || ttsStatus === "speaking";

  const markMode: InterviewerMarkMode = speaking
    ? "ai-speaking"
    : candidateStatus === "speaking"
      ? "user-speaking"
      : candidateStatus === "processing" || ttsStatus === "loading"
        ? "thinking"
        : running
          ? "listening"
          : "idle";

  const pulseLabel =
    streamStage === "transcribing"
      ? "Transcribing…"
      : streamStage === "responding"
        ? "Thinking…"
        : streamStage === "voice"
          ? "Preparing voice…"
          : markMode === "listening"
            ? "Listening"
            : markMode === "user-speaking"
              ? "Listening"
              : markMode === "thinking"
                ? "Thinking"
                : markMode === "ai-speaking"
                  ? "Speaking"
                  : "Ready";

  return (
    <div
      className="leetally-shell"
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {interviewFeedback && (
        <section className="leetally-feedback">
          <header>
            <strong>Interview review</strong>
            <button type="button" onClick={() => setInterviewFeedback(null)}>
              ×
            </button>
          </header>
          <div className="leetally-score-hero">
            <b>{interviewFeedback.overall_score}/10</b>
            <span>{interviewFeedback.hiring_signal.replaceAll("_", " ")} · SDE-1</span>
          </div>
          <p>{interviewFeedback.summary}</p>
          <div className="leetally-score-grid">
            {Object.entries(interviewFeedback.dimensions).map(([name, result]) => (
              <div key={name} className="leetally-score-dimension">
                <span>{name.replaceAll("_", " ")}</span>
                <b>{result.score}</b>
                <ul>
                  {result.evidence.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <strong>Do next</strong>
          <ol>
            {interviewFeedback.next_drills.map((drill) => (
              <li key={drill}>{drill}</li>
            ))}
          </ol>
        </section>
      )}
      {conversationOpen && running && (
        <section className="leetally-conversation" aria-live="polite" aria-label="Live interview conversation">
          <header>
            <span className={`conversation-presence mode-${markMode}`} />
            <div className="conversation-title">
              <strong>Live SDE-1 interview</strong>
              <span>{interviewPhase.replaceAll("_", " ")}</span>
            </div>
            <button type="button" onClick={() => setConversationOpen(false)} aria-label="Hide conversation">
              ×
            </button>
          </header>

          <div className="conversation-messages" ref={conversationMessagesRef}>
            {conversationMessages.map((message) => (
              <p key={message.id} className={`conversation-message ${message.role}-message`}>
                {message.text}
              </p>
            ))}

            {candidateStatus === "speaking" && <p className="conversation-activity">Listening…</p>}

            {candidateStatus === "processing" && (
              <p className="conversation-activity">
                {streamStage === "transcribing"
                  ? "Transcribing…"
                  : streamStage === "responding"
                    ? "Thinking…"
                    : streamStage === "voice"
                      ? "Preparing voice…"
                      : "Thinking…"}
              </p>
            )}
          </div>
        </section>
      )}
      <section className={`leetally-panel ${settingsOpen ? "" : "leetally-hidden"}`}>
        <header>
          <span className="leetally-panel-brand">
            <img src={browser.runtime.getURL("/icon/32.png")} alt="" width="24" height="24" />
            <strong>LeetAlly</strong>
          </span>

          <button type="button" onClick={() => setSettingsOpen(false)}>
            ×
          </button>
        </header>

        {error && <p className="leetally-error">{error}</p>}

        {!session ? (
          <>
            <div className="leetally-data-disclosure">
              <strong>Before you continue</strong>
              <p>
                LeetAlly reads this problem, editor code and visible output. Detected speech segments—not silence—are
                sent to transcription and AI voice providers only to conduct and assess your practice interview.
              </p>
            </div>
            {authMode === "signup" && (
              <label className="leetally-policy-consent">
                <input
                  type="checkbox"
                  checked={policiesAccepted}
                  onChange={(event) => void updatePolicyAcceptance(event.target.checked)}
                />
                <span>
                  I agree to the{" "}
                  <a href={TERMS_URL} target="_blank" rel="noreferrer">
                    Terms
                  </a>{" "}
                  and acknowledge the{" "}
                  <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
                    Privacy Policy
                  </a>{" "}
                  (version {POLICY_VERSION}).
                </span>
              </label>
            )}
            <button
              type="button"
              className="leetally-google-login"
              disabled={authBusy}
              onClick={() => void authenticateWithGoogle()}
            >
              <img src={browser.runtime.getURL("/google.svg")} alt="" aria-hidden="true" /> Continue with Google
            </button>

            <div className="leetally-auth-divider">
              <span>or use email</span>
            </div>

            <input type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} />

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <button
              type="button"
              className="leetally-login"
              disabled={
                authBusy || !email.trim() || password.length < 8 || (authMode === "signup" && !policiesAccepted)
              }
              onClick={() => void authenticateWithEmail()}
            >
              {authBusy ? "Please wait…" : authMode === "signin" ? "Sign in" : "Create account"}
            </button>

            <div className="leetally-auth-links">
              <button
                type="button"
                onClick={() => {
                  setAuthMode((mode) => (mode === "signin" ? "signup" : "signin"));
                  setAuthNotice("");
                }}
              >
                {authMode === "signin" ? "Create account" : "Have an account?"}
              </button>
              {authMode === "signin" && (
                <button type="button" onClick={() => void resetPassword()}>
                  Forgot password?
                </button>
              )}
            </div>
            {authNotice && <p className="leetally-auth-notice">{authNotice}</p>}
          </>
        ) : null}

        <div className="leetally-voice-section">
          <p className="leetally-voice-status">{getTTSLabel()} · LeetAlly</p>
          <p className="leetally-beta-note">Interview experience is being upgraded.</p>
        </div>

        <div className="leetally-share-card">
          <strong>Share LeetAlly</strong>
          <button type="button" onClick={() => void shareLeetAlly()}>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M18 8a3 3 0 1 0-2.83-4A3 3 0 0 0 15 5c0 .2.02.39.06.57L8.91 9.15a3 3 0 1 0 0 5.7l6.15 3.58c-.04.18-.06.37-.06.57a3 3 0 1 0 .83-2.07l-6.08-3.54c.16-.44.25-.91.25-1.39s-.09-.95-.25-1.39l6.08-3.54A3 3 0 0 0 18 8Z"
                fill="currentColor"
              />
            </svg>
            Share
          </button>
          {shareNotice && (
            <p className="leetally-share-notice" role="status">
              {shareNotice}
            </p>
          )}
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

      <FocusTimer settingsOpen={settingsOpen} onOpen={() => setSettingsOpen(false)} />

      <div className="leetally-interviewer-anchor">
        <span className={`leetally-pulse-label mode-${markMode}`} role="status" aria-live="polite">
          {pulseLabel}
        </span>
        <div className="leetally-type-picker" role="menu" aria-label="Choose interview type">
          {(["dsa", "behavioral", "lld", "hld"] as InterviewType[]).map((interviewType) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={selectedInterviewType === interviewType}
              className={selectedInterviewType === interviewType ? "active" : ""}
              disabled={running}
              onClick={() => void chooseInterviewType(interviewType)}
              key={interviewType}
            >
              {interviewType === "behavioral" ? "Behavioral" : interviewType.toUpperCase()}
            </button>
          ))}
        </div>
        <div
          className={`leetally-creature mode-${markMode}`}
          onPointerDown={beginDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <InterviewerMark mode={markMode} userLevel={userAudioLevelRef} aiLevel={aiAudioLevelRef} />
          <span className="leetally-type-badge">
            {selectedInterviewType === "behavioral" ? "BEH" : selectedInterviewType.toUpperCase()}
          </span>
          <span className="leetally-mark-status" aria-hidden="true" />
        </div>
      </div>

      <div className="leetally-controls">
        <button
          type="button"
          onClick={() => (running ? void endInterview() : void startInterview())}
          disabled={status === "starting"}
          title={running ? "End interview" : "Start interview"}
        >
          {running ? "■" : status === "starting" ? "…" : "▶"}
        </button>

        <span>{formatTime(seconds)}</span>

        <button type="button" disabled title={getCandidateLabel()} aria-label={getCandidateLabel()}>
          {candidateStatus === "speaking" ? "🔴" : candidateStatus === "processing" ? "…" : "🎙"}
        </button>

        {voiceBusy && (
          <button type="button" onClick={stopVoice} title="Stop interviewer voice">
            🔇
          </button>
        )}

        {running && !conversationOpen && (
          <button
            type="button"
            onClick={() => setConversationOpen(true)}
            title="Show live conversation"
            aria-label="Show live conversation"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path fill="currentColor" d="M4 4h16v12H8l-4 4V4Zm3 4v2h10V8H7Zm0 4v2h7v-2H7Z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
