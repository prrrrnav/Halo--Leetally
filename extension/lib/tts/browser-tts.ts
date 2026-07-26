import type {
  SpeakOptions,
  TTSCallbacks,
  TTSProvider,
  TTSStatus,
} from "./types";

export class BrowserTTSProvider implements TTSProvider {
  readonly name = "browser" as const;

  private status: TTSStatus = "idle";
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private currentSpeechId: string | undefined;

  private setStatus(
    status: TTSStatus,
    callbacks?: TTSCallbacks,
  ): void {
    this.status = status;
    callbacks?.onStatusChange?.(status);
  }

  async speak(
    text: string,
    options: SpeakOptions = {},
    callbacks: TTSCallbacks = {},
  ): Promise<void> {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return;
    }

    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      const error = new Error(
        "Browser speech synthesis is not supported.",
      );

      this.setStatus("error", callbacks);
      callbacks.onError?.(error, options.speechId);

      throw error;
    }

    /*
     * Stop the previous interviewer response before starting
     * a new one. This also supports candidate interruptions.
     */
    this.cancel();

    this.currentSpeechId = options.speechId;

    const utterance = new SpeechSynthesisUtterance(
      normalizedText,
    );

    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;
    utterance.lang = options.language ?? "en-US";

    const selectedVoice = this.findVoice(
      options.voiceName,
      utterance.lang,
    );

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    this.currentUtterance = utterance;
    this.setStatus("loading", callbacks);

    return new Promise<void>((resolve, reject) => {
      utterance.onstart = () => {
        this.setStatus("speaking", callbacks);
        callbacks.onStart?.(options.speechId);
      };

      utterance.onend = () => {
        this.currentUtterance = null;
        this.currentSpeechId = undefined;

        this.setStatus("idle", callbacks);
        callbacks.onEnd?.(options.speechId);

        resolve();
      };

      utterance.onerror = (event) => {
        /*
         * Chrome can emit "interrupted" or "canceled" when we
         * intentionally stop speech. That should not be treated
         * as an application failure.
         */
        if (
          event.error === "interrupted" ||
          event.error === "canceled"
        ) {
          this.currentUtterance = null;
          this.currentSpeechId = undefined;

          this.setStatus("cancelled", callbacks);
          resolve();

          return;
        }

        const error = new Error(
          `Browser TTS failed: ${event.error}`,
        );

        this.currentUtterance = null;
        this.currentSpeechId = undefined;

        this.setStatus("error", callbacks);
        callbacks.onError?.(error, options.speechId);

        reject(error);
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  cancel(): void {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    if (
      window.speechSynthesis.speaking ||
      window.speechSynthesis.pending ||
      this.currentUtterance
    ) {
      window.speechSynthesis.cancel();
    }

    this.currentUtterance = null;
    this.currentSpeechId = undefined;
    this.status = "cancelled";
  }

  pause(): void {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      this.status = "paused";
    }
  }

  resume(): void {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      this.status = "speaking";
    }
  }

  isSpeaking(): boolean {
    if (
      typeof window === "undefined" ||
      !("speechSynthesis" in window)
    ) {
      return false;
    }

    return (
      window.speechSynthesis.speaking ||
      window.speechSynthesis.pending
    );
  }

  getStatus(): TTSStatus {
    return this.status;
  }

  dispose(): void {
    this.cancel();
  }

  private findVoice(
    preferredVoiceName?: string,
    language = "en-US",
  ): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices();

    if (voices.length === 0) {
      return null;
    }

    if (preferredVoiceName) {
      const exactMatch = voices.find(
        (voice) =>
          voice.name.toLowerCase() ===
          preferredVoiceName.toLowerCase(),
      );

      if (exactMatch) {
        return exactMatch;
      }

      const partialMatch = voices.find((voice) =>
        voice.name
          .toLowerCase()
          .includes(preferredVoiceName.toLowerCase()),
      );

      if (partialMatch) {
        return partialMatch;
      }
    }

    const normalizedLanguage = language.toLowerCase();

    const exactLanguageMatch = voices.find(
      (voice) =>
        voice.lang.toLowerCase() === normalizedLanguage,
    );

    if (exactLanguageMatch) {
      return exactLanguageMatch;
    }

    const languagePrefix = normalizedLanguage.split("-")[0];

    return (
      voices.find((voice) =>
        voice.lang.toLowerCase().startsWith(languagePrefix),
      ) ?? null
    );
  }
}