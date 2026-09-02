export default defineContentScript({
  matches: ["*://leetcode.com/problems/*", "*://www.leetcode.com/problems/*"],

  world: "MAIN",

  main() {
    const EVENT_NAME = "leetally:editor-context";
    const CONTROL_EVENT_NAME = "leetally:editor-control";
    const ACCEPTED_EVENT_NAME = "leetally:submission-accepted";

    let previousCode = "";
    let previousLanguage = "";
    let intervalId: number | null = null;

    function publishAcceptedSubmission(payload: unknown): void {
      if (!payload || typeof payload !== "object") return;
      const result = payload as Record<string, unknown>;
      const status = String(result.status_msg ?? result.statusMessage ?? result.status ?? "").toLowerCase();
      if (status !== "accepted") return;
      window.dispatchEvent(new CustomEvent(ACCEPTED_EVENT_NAME, { detail: { acceptedAt: Date.now() } }));
    }

    async function inspectSubmissionResponse(response: Response): Promise<void> {
      if (!response.url.includes("/submissions/detail/") || !response.ok) return;
      try {
        publishAcceptedSubmission(await response.clone().json());
      } catch {
        // LeetCode can return an intermediate non-JSON response while polling.
      }
    }

    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      void inspectSubmissionResponse(response);
      return response;
    };

    const nativeOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function patchedOpen(method: string, url: string | URL, ...rest: unknown[]): void {
      this.addEventListener("load", () => {
        if (!String(url).includes("/submissions/detail/") || this.status < 200 || this.status >= 300) return;
        try {
          publishAcceptedSubmission(JSON.parse(this.responseText));
        } catch {
          // Ignore intermediate polling responses.
        }
      });
      const [async = true, user, password] = rest as [boolean?, string?, string?];
      if (user === undefined) nativeOpen.call(this, method, url, async);
      else nativeOpen.call(this, method, url, async, user, password);
    };

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

      const editors = monacoApi?.editor?.getEditors?.() ?? [];

      return (
        editors.find((editor) => {
          const node = editor?.getDomNode?.();
          return node?.isConnected && node.getClientRects().length > 0;
        }) ??
        editors[0] ??
        null
      );
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
      const editor = findEditor();
      const activeLanguage = editor?.getModel?.()?.getLanguageId?.();
      if (activeLanguage) return activeLanguage;

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

      if (code === previousCode && language === previousLanguage) {
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
        }),
      );
    }

    function setEnabled(enabled: boolean): void {
      if (!enabled) {
        if (intervalId !== null) window.clearInterval(intervalId);
        intervalId = null;
        previousCode = "";
        previousLanguage = "";
        return;
      }
      if (intervalId !== null) return;
      publishContext();
      intervalId = window.setInterval(publishContext, 500);
    }

    window.addEventListener(CONTROL_EVENT_NAME, (event) => {
      const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
      setEnabled(detail?.enabled === true);
    });
  },
});
