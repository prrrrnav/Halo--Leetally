import { MicVAD } from "@ricky0123/vad-web";
import { browser } from "wxt/browser";

export type VadCallbacks = {
  onSpeechStart?: () => void;
  onSpeechEnd?: (audio: Float32Array) => void;
  onVADMisfire?: () => void;
  onAudioLevel?: (level: number) => void;
};

export class LocalVad {
  private vad: MicVAD | null = null;

  private initializationPromise:
    | Promise<void>
    | null = null;

  private initialized = false;
  private running = false;

  initialize(
    callbacks: VadCallbacks,
  ): Promise<void> {
    if (this.initialized) {
      return Promise.resolve();
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise =
      this.createVad(callbacks);

    return this.initializationPromise;
  }

  private async createVad(
    callbacks: VadCallbacks,
  ): Promise<void> {
    try {
      const extensionUrl = browser.runtime.getURL("");
      this.vad = await MicVAD.new({
        baseAssetPath: `${extensionUrl}vad/`,
        onnxWASMBasePath: `${extensionUrl}ort/`,

        startOnLoad: false,
        positiveSpeechThreshold: 0.8,
        negativeSpeechThreshold: 0.5,
        redemptionMs: 400,
        preSpeechPadMs: 160,
        // All silence detection stays on-device. A segment must contain enough
        // sustained speech before any paid network provider can be called.
        minSpeechMs: 400,

        onFrameProcessed: (_probabilities, frame) => {
          let sum = 0;
          for (let index = 0; index < frame.length; index += 1) {
            sum += frame[index] * frame[index];
          }
          const rms = Math.sqrt(sum / Math.max(1, frame.length));
          callbacks.onAudioLevel?.(Math.min(1, rms * 7));
        },

        onSpeechStart: () => {
          callbacks.onSpeechStart?.();
        },

        onSpeechEnd: (
          audio: Float32Array,
        ) => {
          callbacks.onSpeechEnd?.(audio);
        },

        onVADMisfire: () => {
          callbacks.onVADMisfire?.();
        },
      });

      this.initialized = true;

      console.log(
        "[LeetAlly VAD] Initialized successfully",
      );
    } catch (cause) {
      this.vad = null;
      this.initialized = false;
      this.initializationPromise = null;

      console.error(
        "[LeetAlly VAD] Initialization failed",
        cause,
      );

      throw cause;
    }
  }

  async start(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    if (!this.vad || !this.initialized) {
      throw new Error(
        "Local VAD failed to initialize. Check the browser console.",
      );
    }

    if (this.running) {
      return;
    }

    await this.vad.start();
    this.running = true;

    console.log("[LeetAlly VAD] Listening");
  }

  async pause(): Promise<void> {
    if (!this.vad || !this.running) {
      return;
    }

    await this.vad.pause();
    this.running = false;
  }

  async destroy(): Promise<void> {
    if (this.vad) {
      await this.vad.destroy();
    }

    this.vad = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.running = false;
  }
}
