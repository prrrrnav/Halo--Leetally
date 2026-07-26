import React from "react";
import { createRoot } from "react-dom/client";

import Widget from "./Widget";
import widgetStyles from "./widget.css?inline";


const ROOT_ID = "leetally-extension-root";


function injectLeetAlly(): void {
  const existingRoot = document.getElementById(ROOT_ID);

  if (existingRoot) {
    existingRoot.remove();
  }

  const host = document.createElement("div");
  host.id = ROOT_ID;

  document.documentElement.appendChild(host);

  const shadowRoot = host.attachShadow({
    mode: "open",
  });

  const styleElement = document.createElement("style");
  styleElement.textContent = widgetStyles;

  const mountElement = document.createElement("div");

  shadowRoot.appendChild(styleElement);
  shadowRoot.appendChild(mountElement);

  createRoot(mountElement).render(
    <React.StrictMode>
      <Widget />
    </React.StrictMode>,
  );
}


injectLeetAlly();