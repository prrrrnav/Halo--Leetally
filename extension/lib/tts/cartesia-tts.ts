import type {
  SpeakOptions,
  TTSCallbacks,
  TTSProvider,
  TTSStatus,
} from "./types";

export interface CartesiaTTSConfig {
  /**
   * This should point to our FastAPI backend.
   *
   * Do not expose the Cartesia API key inside the extension.
   */
  backendUrl: string;

  voiceId?: string;
}

export class CartesiaTTSProvider implements TTSProvider {
  readonly name = "cartesia" as const;

  private status: TTSStatus = "idle";
  private audioElement: HTMLAudioElement | null = null;
  private abortController: AbortController | null = null;

  constructor(private readonly config: CartesiaTTSConfig) {}

  async speak(
    text: string,
    options: SpeakOptions = {},
    callbacks: TTSCallbacks = {},
  ): Promise<void> {
    const normalizedText = text.trim();

    if (!normalizedText) {
      return;
    }

    this.cancel();

    this.abortController = new AbortController();
    this.setStatus("loading", callbacks);

    try {
      const response = await fetch(
        `${this.config.backendUrl}/api/v1/tts/synthesize`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text: normalizedText,
            speech_id: options.speechId,
            voice_id: this.config.voiceId,
          }),
          signal: this.abortController.signal,
        },
      );

      if (!response.ok) {
        throw new Error(
          `Cartesia TTS request failed with status ${response.status}.`,
        );
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);

      audio.volume = options.volume ?? 1;
      audio.playbackRate = options.rate ?? 1;

      this.audioElement = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onplay = () => {
          this.setStatus("speaking", callbacks);
          callbacks.onStart?.(options.speechId);
        };

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          this.audioElement = null;

          this.setStatus("idle", callbacks);
          callbacks.onEnd?.(options.speechId);

          resolve();
        };

        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);

          const error = new Error(
            "Unable to play Cartesia audio.",
          );

          this.audioElement = null;

          this.setStatus("error", callbacks);
          callbacks.onError?.(error, options.speechId);

          reject(error);
        };

        audio.play().catch((error: unknown) => {
          URL.revokeObjectURL(audioUrl);

          const normalizedError =
            error instanceof Error
              ? error
              : new Error("Unable to start Cartesia audio.");

          this.audioElement = null;

          this.setStatus("error", callbacks);
          callbacks.onError?.(
            normalizedError,
            options.speechId,
          );

          reject(normalizedError);
        });
      });
    } catch (error: unknown) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        this.setStatus("cancelled", callbacks);
        return;
      }

      const normalizedError =
        error instanceof Error
          ? error
          : new Error("Unknown Cartesia TTS error.");

      this.setStatus("error", callbacks);
      callbacks.onError?.(
        normalizedError,
        options.speechId,
      );

      throw normalizedError;
    } finally {
      this.abortController = null;
    }
  }

  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.currentTime = 0;
      this.audioElement.src = "";
      this.audioElement = null;
    }

    this.status = "cancelled";
  }

  pause(): void {
    if (!this.audioElement) {
      return;
    }

    this.audioElement.pause();
    this.status = "paused";
  }

  resume(): void {
    if (!this.audioElement) {
      return;
    }

    void this.audioElement.play();
    this.status = "speaking";
  }

  isSpeaking(): boolean {
    return Boolean(
      this.audioElement &&
        !this.audioElement.paused &&
        !this.audioElement.ended,
    );
  }

  getStatus(): TTSStatus {
    return this.status;
  }

  dispose(): void {
    this.cancel();
  }

  private setStatus(
    status: TTSStatus,
    callbacks?: TTSCallbacks,
  ): void {
    this.status = status;
    callbacks?.onStatusChange?.(status);
  }
}