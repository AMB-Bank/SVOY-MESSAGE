import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { db } from "./firebase";

export interface Profile {
  username: string; displayName: string; photoURL?: string; createdAt: number;
  privacy?: { showOnline?: boolean; showLastSeen?: boolean };
}

const cache = new Map<string, Profile | null>();

export function useProfile(uid?: string): Profile | null | undefined {
  const [p, setP] = useState<Profile | null | undefined>(uid ? cache.get(uid) : null);
  useEffect(() => {
    if (!uid) return;
    return onValue(ref(db, `users/${uid}`), (s) => { const v = (s.val() as Profile | null); cache.set(uid, v); setP(v); });
  }, [uid]);
  return p;
}

export interface PresenceInfo { online: boolean; lastSeen?: number }
export function usePresence(uid?: string): PresenceInfo {
  const [info, setInfo] = useState<PresenceInfo>({ online: false });
  useEffect(() => {
    if (!uid) return;
    return onValue(ref(db, `presence/${uid}`), (s) => {
      const v = s.val() as { connections?: Record<string, unknown>; lastSeen?: number } | null;
      setInfo({ online: !!v?.connections && Object.keys(v.connections).length > 0, lastSeen: v?.lastSeen });
    });
  }, [uid]);
  return info;
}

export function presenceLabel(p: PresenceInfo, showExact: boolean): string {
  if (p.online) return "В сети";
  if (!p.lastSeen) return "Был(а) недавно";
  if (showExact) {
    const d = new Date(p.lastSeen);
    const today = new Date().toDateString() === d.toDateString();
    const t = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    return today ? `Был(а) сегодня в ${t}` : `Был(а) ${d.toLocaleDateString("ru-RU")} в ${t}`;
  }
  return "Был(а) недавно";
}

export function useOnline(): boolean {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener("online", a); window.addEventListener("offline", b);
    return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); };
  }, []);
  return on;
}

export const directChatId = (a: string, b: string) => [a, b].sort().join("_");
