import { ref, onValue, push, set, remove, onDisconnect, serverTimestamp, type DatabaseReference } from "firebase/database";
import { db } from "./firebase";

/**
 * Присутствие: у каждой вкладки/устройства своя запись presence/{uid}/connections/{id}.
 * Пользователь «в сети», пока есть хотя бы одна запись. lastSeen ставится сервером при обрыве.
 * Если в настройках приватности отключено — ничего не публикуем (это настоящая приватность, а не только скрытие в UI).
 */
export function startPresence(uid: string, opts: { showOnline: boolean; showLastSeen: boolean }): () => void {
  if (!opts.showOnline && !opts.showLastSeen) return () => {};
  const connectedRef = ref(db, ".info/connected");
  let conRef: DatabaseReference | null = null;
  let hideTimer: number | undefined;
  let connected = false;

  const goOnline = async () => {
    if (!connected || conRef) return;
    conRef = push(ref(db, `presence/${uid}/connections`));
    const lastSeenRef = ref(db, `presence/${uid}/lastSeen`);
    await onDisconnect(conRef).remove();
    if (opts.showLastSeen) await onDisconnect(lastSeenRef).set(serverTimestamp());
    if (opts.showOnline) await set(conRef, serverTimestamp());
  };
  const goAway = async () => {
    if (!conRef) return;
    const r = conRef; conRef = null;
    await remove(r).catch(() => {});
    if (opts.showLastSeen) await set(ref(db, `presence/${uid}/lastSeen`), serverTimestamp()).catch(() => {});
  };

  const unsub = onValue(connectedRef, (s) => {
    connected = s.val() === true;
    if (connected && document.visibilityState === "visible") void goOnline();
  });

  // Мобильные браузеры «замораживают» вкладку в фоне: через 45 с в фоне считаем устройство неактивным
  const onVis = () => {
    window.clearTimeout(hideTimer);
    if (document.visibilityState === "hidden") hideTimer = window.setTimeout(() => void goAway(), 45_000);
    else void goOnline();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", () => void goAway());

  return () => {
    unsub();
    document.removeEventListener("visibilitychange", onVis);
    window.clearTimeout(hideTimer);
    void goAway();
  };
}
