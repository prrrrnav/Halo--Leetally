export type TTSProviderName = "browser" | "cartesia";

export type TTSStatus =
  | "idle"
  | "loading"
  | "speaking"
  | "paused"
  | "cancelled"
  | "error";

export interface SpeakOptions {
  /**
   * A unique identifier for the speech message.
   * Useful when cancelling or replacing a specific response.
   */
  speechId?: string;

  /**
   * Speech rate.
   * Browser SpeechSynthesis generally supports 0.1 to 10.
   */
  rate?: number;

  /**
   * Speech pitch.
   * Browser SpeechSynthesis generally supports 0 to 2.
   */
  pitch?: number;

  /**
   * Speech volume.
   * Value between 0 and 1.
   */
  volume?: number;

  /**
   * Preferred language.
   */
  language?: string;

  /**
   * Preferred voice name.
   */
  voiceName?: string;
}

export interface TTSCallbacks {
  onStart?: (speechId?: string) => void;
  onEnd?: (speechId?: string) => void;
  onError?: (error: Error, speechId?: string) => void;
  onStatusChange?: (status: TTSStatus) => void;
}

export interface TTSProvider {
  readonly name: TTSProviderName;

  speak(
    text: string,
    options?: SpeakOptions,
    callbacks?: TTSCallbacks,
  ): Promise<void>;

  cancel(): void;

  pause(): void;

  resume(): void;

  isSpeaking(): boolean;

  getStatus(): TTSStatus;

  dispose(): void;
}