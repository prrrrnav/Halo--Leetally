import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],

  manifest: {
    name: "LeetAlly",
    description:
      "Practice LeetCode with an AI interviewer and track interview preparation progress.",
    version: "0.1.3",
    homepage_url: "https://leetally-web.vercel.app/",
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuTlgzS1tC36TPGJvzhIQEBwXIyuJgmWyTp8+LJOrmSfHvSXhgs8qJxdU19ChM2Hom7xkw8/Yph5MNKgt7c1D4gLk/HE1D5HTIVAw+xqYLSYBFs/l5FHTut5Q8ep189+y5R3NH18HmcY5h6UKY2/4DSjjzgI5RKDYmhs9Qh+VRCkwqNMqSuNF+awOEJt0M3ZZeMsy4tZA2rnrWZz2fc1KmJ+7qOteaO1ysUTbYoBTVJet+lg7NzHZs0DB2+9ReLzSA40y7N5gkLaWsCW0KK5tv0YfZH5TalywCzHsSYaXreZqthGvZD+4aSeWhuVrSU4eXyV9KP56oRX5ctnert1X5wIDAQAB",

    action: {
      default_title: "Open LeetAlly",
    },

    permissions: ["storage", "identity"],

    host_permissions: [
      "https://leetally-api.vercel.app/*",
      "https://wfpiyxepzmocwuowiadw.supabase.co/*",
      "https://leetcode.com/*",
      "https://www.leetcode.com/*",
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
          "https://www.leetcode.com/*",
        ],
      },
    ],
  },
});
