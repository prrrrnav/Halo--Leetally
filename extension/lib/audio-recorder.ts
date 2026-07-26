export type RecorderStatus =
  | "idle"
  | "requesting_permission"
  | "recording"
  | "stopping"
  | "error";

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt: number | null = null;
  private status: RecorderStatus = "idle";

  getStatus(): RecorderStatus {
    return this.status;
  }

  isRecording(): boolean {
    return this.status === "recording";
  }

  async start(): Promise<void> {
    if (this.isRecording()) {
      throw new Error("Audio recording is already active.");
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Microphone recording is not supported in this browser.",
      );
    }

    this.status = "requesting_permission";

    try {
      this.mediaStream =
        await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

      const mimeType = this.selectMimeType();

      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType })
        : new MediaRecorder(this.mediaStream);

      this.chunks = [];
      this.startedAt = Date.now();

      this.mediaRecorder.ondataavailable = (
        event: BlobEvent,
      ) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.start(250);
      this.status = "recording";
    } catch (cause) {
      this.cleanup();
      this.status = "error";

      if (
        cause instanceof DOMException &&
        cause.name === "NotAllowedError"
      ) {
        throw new Error(
          "Microphone permission was denied. Allow microphone access and try again.",
        );
      }

      throw cause instanceof Error
        ? cause
        : new Error("Unable to start microphone recording.");
    }
  }

  async stop(): Promise<RecordingResult> {
    if (
      !this.mediaRecorder ||
      this.mediaRecorder.state === "inactive"
    ) {
      throw new Error("No active recording was found.");
    }

    this.status = "stopping";

    const recorder = this.mediaRecorder;
    const startedAt = this.startedAt ?? Date.now();

    return new Promise<RecordingResult>(
      (resolve, reject) => {
        recorder.onerror = () => {
          this.cleanup();
          this.status = "error";

          reject(new Error("Microphone recording failed."));
        };

        recorder.onstop = () => {
          const mimeType =
            recorder.mimeType || "audio/webm";

          const blob = new Blob(this.chunks, {
            type: mimeType,
          });

          const durationMs = Math.max(
            0,
            Date.now() - startedAt,
          );

          this.cleanup();
          this.status = "idle";

          if (blob.size === 0) {
            reject(
              new Error(
                "The microphone recording was empty.",
              ),
            );
            return;
          }

          resolve({
            blob,
            mimeType,
            durationMs,
          });
        };

        recorder.stop();
      },
    );
  }

  cancel(): void {
    if (
      this.mediaRecorder &&
      this.mediaRecorder.state !== "inactive"
    ) {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }

    this.cleanup();
    this.status = "idle";
  }

  dispose(): void {
    this.cancel();
  }

  private selectMimeType(): string | undefined {
    const supportedTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
    ];

    return supportedTypes.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType),
    );
  }

  private cleanup(): void {
    this.mediaStream
      ?.getTracks()
      .forEach((track) => track.stop());

    this.mediaRecorder = null;
    this.mediaStream = null;
    this.chunks = [];
    this.startedAt = null;
  }
}