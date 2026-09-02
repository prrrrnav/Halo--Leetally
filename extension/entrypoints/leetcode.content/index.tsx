import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { CompanyInterviewIndicator } from "./CompanyInterviewIndicator";
import "./style.css";

export default defineContentScript({
  matches: ["*://leetcode.com/problems/*", "*://www.leetcode.com/problems/*"],
  cssInjectionMode: "ui",

  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "leetally-widget",
      position: "inline",
      anchor: "body",
      isolateEvents: true,

      onMount(container) {
        const root = ReactDOM.createRoot(container);

        root.render(
          <React.StrictMode>
            <CompanyInterviewIndicator />
            <App />
          </React.StrictMode>,
        );

        return root;
      },

      onRemove(root) {
        root?.unmount();
      },
    });

    ui.mount();
  },
});
