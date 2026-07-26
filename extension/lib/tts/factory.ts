import {
  CartesiaTTSProvider,
  type CartesiaTTSConfig,
} from "./cartesia-tts";
import { BrowserTTSProvider } from "./browser-tts";
import type {
  TTSProvider,
  TTSProviderName,
} from "./types";

export interface TTSFactoryConfig {
  provider: TTSProviderName;
  cartesia?: CartesiaTTSConfig;
}

export function createTTSProvider(
  config: TTSFactoryConfig,
): TTSProvider {
  switch (config.provider) {
    case "browser":
      return new BrowserTTSProvider();

    case "cartesia": {
      if (!config.cartesia?.backendUrl) {
        throw new Error(
          "Cartesia backend URL is required.",
        );
      }

      return new CartesiaTTSProvider(config.cartesia);
    }

    default: {
      const unsupportedProvider: never = config.provider;

      throw new Error(
        `Unsupported TTS provider: ${unsupportedProvider}`,
      );
    }
  }
}