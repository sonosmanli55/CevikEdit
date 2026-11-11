import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installI18n } from "./i18n";
import { activeLocale } from "./i18n/locale";
import { installPluginBridge } from "./editor/pluginBridge";

if (activeLocale() === "tr") {
  installI18n();
  document.documentElement.lang = "tr";
  document.title = "CevikEdit · Video Düzenleyici";
}
installPluginBridge();
void document.fonts
  .load('16px "Noto Sans SC"')
  .catch(() => [])
  .finally(() => {
    ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
  });
