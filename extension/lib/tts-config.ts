import type { TTSProviderName } from "./tts";

function getTTSProvider(): TTSProviderName {
  const configuredProvider =
    import.meta.env.VITE_TTS_PROVIDER?.toLowerCase();

  if (configuredProvider === "cartesia") {
    return "cartesia";
  }

  return "browser";
}

export const ttsConfig = {
  provider: getTTSProvider(),

  cartesia: {
    backendUrl:
      import.meta.env.VITE_API_BASE_URL ??
      "http://127.0.0.1:8000",

    voiceId:
      import.meta.env.VITE_CARTESIA_VOICE_ID ||
      undefined,
  },
};