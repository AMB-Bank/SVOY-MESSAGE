import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectDatabaseEmulator, getDatabase } from "firebase/database";
import { connectStorageEmulator, getStorage } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// Веб-ключ Firebase — идентификатор проекта, а не секрет. Защита: Auth + Security Rules + App Check.
const firebaseConfig = {
  apiKey: "AIzaSyCcicQSLYnBPQ_R-_eEul--2VK77v3TwCQ",
  authDomain: "respzonasite.firebaseapp.com",
  databaseURL: "https://respzonasite-default-rtdb.firebaseio.com",
  projectId: "respzonasite",
  storageBucket: "respzonasite.firebasestorage.app",
  messagingSenderId: "308009742152",
  appId: "1:308009742152:web:325b8e3ae2ee840542cd7d",
  measurementId: "G-B1XB02WDPJ",
};

// Единственный экземпляр приложения даже при повторной загрузке модулей (HMR)
export const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

const useEmu = import.meta.env.VITE_USE_EMULATORS === "true";

if (!useEmu && import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  if (import.meta.env.VITE_APPCHECK_DEBUG === "true") {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY), isTokenAutoRefreshEnabled: true });
  } catch { /* уже инициализирован */ }
}

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

if (useEmu && !(globalThis as { __svoyEmu?: boolean }).__svoyEmu) {
  (globalThis as { __svoyEmu?: boolean }).__svoyEmu = true;
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectDatabaseEmulator(db, "127.0.0.1", 9000);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

/** Analytics включается только если браузер поддерживает и пользователь дал согласие (localStorage svoy:analytics = "granted"). */
export async function initAnalyticsIfConsented() {
  if (localStorage.getItem("svoy:analytics") !== "granted") return;
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (await isSupported()) getAnalytics(app);
}
