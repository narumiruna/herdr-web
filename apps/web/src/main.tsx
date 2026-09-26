import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/zen-old-mincho/latin-500.css";
import "@fontsource/zen-old-mincho/latin-600.css";
import "./styles-entry";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root application mount point");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
