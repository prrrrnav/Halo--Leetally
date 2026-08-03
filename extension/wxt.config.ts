import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],

  manifest: {
    name: "LeetAlly",
    description:
      "Practice LeetCode with an AI interviewer.",
    version: "0.1.0",

    permissions: ["storage", "activeTab", "identity"],

    host_permissions: [
      "http://127.0.0.1:8000/*",
      "http://localhost:8000/*",
      "https://*.supabase.co/*",
      "https://leetcode.com/*",
      "https://neetcode.io/*",
      "https://takeuforward.org/*",
      "https://www.techinterviewhandbook.org/*",
      "https://namastedev.com/*",
      "https://www.codingninjas.com/*",
      "https://raw.githubusercontent.com/*",
    ],

    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },

    web_accessible_resources: [
      {
        resources: [
          "vad/*",
          "ort/*",
        ],
        matches: [
          "https://leetcode.com/*",
        ],
      },
    ],
  },
});
