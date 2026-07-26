import {
  createTTSProvider,
  type TTSProvider,
} from "./tts";
import { ttsConfig } from "./tts-config";

let ttsProvider: TTSProvider | null = null;

export function getTTSProvider(): TTSProvider {
  if (ttsProvider) {
    return ttsProvider;
  }

  ttsProvider = createTTSProvider({
    provider: ttsConfig.provider,
    cartesia: ttsConfig.cartesia,
  });

  return ttsProvider;
}

export function resetTTSProvider(): void {
  ttsProvider?.dispose();
  ttsProvider = null;
}