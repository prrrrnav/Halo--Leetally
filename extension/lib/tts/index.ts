export { BrowserTTSProvider } from "./browser-tts";

export {
  CartesiaTTSProvider,
  type CartesiaTTSConfig,
} from "./cartesia-tts";

export {
  createTTSProvider,
  type TTSFactoryConfig,
} from "./factory";

export type {
  SpeakOptions,
  TTSCallbacks,
  TTSProvider,
  TTSProviderName,
  TTSStatus,
} from "./types";