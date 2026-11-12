import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installPluginBridge } from "./editor/pluginBridge";

document.documentElement.lang = "tr";
document.title = "CevikEdit · Video Düzenleyici";
installPluginBridge();
void document.fonts
  .load('16px "Noto Sans SC"')
  .catch(() => [])
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
  });
