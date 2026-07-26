export default defineContentScript({
  matches: [
    "*://leetcode.com/problems/*",
    "*://www.leetcode.com/problems/*",
  ],

  world: "MAIN",

  main() {
    const EVENT_NAME = "leetally:editor-context";

    let previousCode = "";
    let previousLanguage = "";

    function findEditor(): any | null {
      const monacoApi = (
        window as typeof window & {
          monaco?: {
            editor?: {
              getEditors?: () => any[];
              getModels?: () => any[];
            };
          };
        }
      ).monaco;

      const editors =
        monacoApi?.editor?.getEditors?.() ?? [];

      if (editors.length > 0) {
        return editors[0];
      }

      return null;
    }

    function getCode(): string {
      const editor = findEditor();

      if (editor?.getValue) {
        return editor.getValue();
      }

      const models = (
        window as typeof window & {
          monaco?: {
            editor?: {
              getModels?: () => Array<{
                getValue: () => string;
              }>;
            };
          };
        }
      ).monaco?.editor?.getModels?.();

      return models?.[0]?.getValue?.() ?? "";
    }

    function getLanguage(): string {
      const models = (
        window as typeof window & {
          monaco?: {
            editor?: {
              getModels?: () => Array<{
                getLanguageId?: () => string;
              }>;
            };
          };
        }
      ).monaco?.editor?.getModels?.();

      return models?.[0]?.getLanguageId?.() ?? "";
    }

    function publishContext(): void {
      const code = getCode();
      const language = getLanguage();

      if (
        code === previousCode &&
        language === previousLanguage
      ) {
        return;
      }

      previousCode = code;
      previousLanguage = language;

      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, {
          detail: {
            code,
            programmingLanguage: language,
            changedAt: Date.now(),
          },
        })
      );
    }

    window.setInterval(
      publishContext,
      500
    );

    publishContext();
  },
});