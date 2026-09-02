import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import App from "./App";
import "./styles.css";

function sanitizeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.search = "";
  url.hash = "";
  return { ...event, url: url.toString() };
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Analytics beforeSend={sanitizeAnalyticsEvent} />
  </StrictMode>,
);
