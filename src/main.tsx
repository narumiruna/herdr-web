import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@radix-ui/themes/styles.css";
import "@radix-ui/colors/amber.css";
import "@radix-ui/colors/amber-dark.css";
import "@radix-ui/colors/blue.css";
import "@radix-ui/colors/blue-dark.css";
import "@radix-ui/colors/grass.css";
import "@radix-ui/colors/grass-dark.css";
import "@radix-ui/colors/red.css";
import "@radix-ui/colors/red-dark.css";
import "@radix-ui/colors/sand.css";
import "@radix-ui/colors/sand-dark.css";
import "./styles.css";
import "./styles-workbench.css";
import "./styles-overlays.css";
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
