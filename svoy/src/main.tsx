import { createRoot } from "react-dom/client";
import App from "./App";
import { initAnalyticsIfConsented } from "./lib/firebase";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<App />);

void initAnalyticsIfConsented();
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
