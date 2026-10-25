import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendEmailVerification,
  sendPasswordResetEmail, onAuthStateChanged, updateProfile, type User,
} from "firebase/auth";
import { get, onValue, ref, serverTimestamp, set, update } from "firebase/database";
import { auth, db } from "./firebase";
import type { Profile } from "./hooks";
import { startPresence } from "./presence";

interface Ctx {
  user: User | null; profile: Profile | null; ready: boolean; admin: boolean;
  register(email: string, password: string): Promise<void>;
  login(email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  resendVerification(): Promise<void>;
  refreshUser(): Promise<void>;
  createProfile(username: string, displayName: string): Promise<void>;
}
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setUser(u);
    if (!u) { setProfile(null); setAdmin(false); }
    else { const t = await u.getIdTokenResult(); setAdmin(t.claims.admin === true); }
    setReady(true);
  }), []);

  // Профиль подгружается после входа и обновляется в реальном времени
  useEffect(() => {
    if (!user) return;
    return onValue(ref(db, `users/${user.uid}`), (s) => setProfile((s.val() as Profile | null) ?? null));
  }, [user]);

  // Присутствие запускается только для подтверждённого аккаунта с профилем
  useEffect(() => {
    if (!user || !profile || !user.emailVerified) return;
    return startPresence(user.uid, {
      showOnline: profile.privacy?.showOnline !== false,
      showLastSeen: profile.privacy?.showLastSeen !== false,
    });
  }, [user, profile?.privacy?.showOnline, profile?.privacy?.showLastSeen, !!profile]); // eslint-disable-line

  const value: Ctx = {
    user, profile, ready, admin,
    async register(email, password) {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
    },
    async login(email, password) { await signInWithEmailAndPassword(auth, email, password); },
    async logout() { await signOut(auth); },
    async resetPassword(email) { await sendPasswordResetEmail(auth, email); },
    async resendVerification() { if (auth.currentUser) await sendEmailVerification(auth.currentUser); },
    async refreshUser() {
      if (!auth.currentUser) return;
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);          // обновляем токен, чтобы в нём появился email_verified
      setTick((t) => t + 1);          // пользователь изменён «на месте» — просто перерисовываем
    },
    async createProfile(username, displayName) {
      const u = auth.currentUser; if (!u) throw new Error("Нет сессии");
      const name = username.trim().toLowerCase();
      if (!USERNAME_RE.test(name)) throw new Error("Имя пользователя: 3–20 символов, a–z, 0–9 и _");
      const existing = await get(ref(db, `usernames/${name}`));
      if (existing.exists() && existing.val() !== u.uid) throw new Error("Это имя пользователя уже занято");
      try { await set(ref(db, `usernames/${name}`), u.uid); }
      catch { throw new Error("Это имя пользователя уже занято"); }
      const data: Omit<Profile, "createdAt"> & { createdAt: unknown } = {
        username: name, displayName: displayName.trim().slice(0, 50) || name,
        createdAt: serverTimestamp(), privacy: { showOnline: true, showLastSeen: true },
      };
      await update(ref(db), { [`users/${u.uid}`]: data });
      await updateProfile(u, { displayName: data.displayName });
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
