import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth, USERNAME_RE } from "../lib/auth";
import { Wordmark, SLOGAN } from "../components/Wordmark";

function errText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Неверная почта или пароль", "auth/wrong-password": "Неверная почта или пароль",
    "auth/user-not-found": "Неверная почта или пароль", "auth/email-already-in-use": "Эта почта уже зарегистрирована",
    "auth/weak-password": "Пароль слишком простой (минимум 6 символов)", "auth/invalid-email": "Некорректная почта",
    "auth/too-many-requests": "Слишком много попыток. Попробуйте позже", "auth/network-request-failed": "Нет соединения с интернетом",
    "auth/user-disabled": "Аккаунт заблокирован",
  };
  return map[code] ?? (e instanceof Error ? e.message : "Что-то пошло не так");
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth">
      <div className="tri" />
      <div className="auth-card">
        <img src="/icons/icon-192.png" alt="" className="auth-logo" />
        <Wordmark size={44} />
        <p className="slogan">{SLOGAN}</p>
        {children}
      </div>
    </main>
  );
}

export function Login() {
  const { login, user } = useAuth(); const nav = useNavigate();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await login(email.trim(), pw); nav("/"); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <form onSubmit={submit}>
        <input type="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <input type="password" placeholder="Пароль" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? "Входим…" : "Войти"}</button>
      </form>
      <p className="links"><Link to="/register">Создать аккаунт</Link> · <Link to="/reset">Забыли пароль?</Link></p>
    </Shell>
  );
}

export function Register() {
  const { register, user } = useAuth(); const nav = useNavigate();
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    try { await register(email.trim(), pw); nav("/verify"); } catch (x) { setErr(errText(x)); } finally { setBusy(false); }
  };
  return (
    <Shell>
      <form onSubmit={submit}>
        <input type="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <input type="password" placeholder="Пароль (от 6 символов)" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" minLength={6} required />
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? "Создаём…" : "Зарегистрироваться"}</button>
      </form>
      <p className="links"><Link to="/login">Уже есть аккаунт</Link></p>
    </Shell>
  );
}

export function Reset() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState(""); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setMsg("");
    try { await resetPassword(email.trim()); setMsg("Если такой аккаунт есть, мы отправили письмо со ссылкой для сброса пароля."); }
    catch (x) { setErr(errText(x)); }
  };
  return (
    <Shell>
      <form onSubmit={submit}>
        <input type="email" placeholder="Почта" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {err && <p className="error">{err}</p>}{msg && <p className="ok">{msg}</p>}
        <button className="btn">Отправить письмо</button>
      </form>
      <p className="links"><Link to="/login">Назад ко входу</Link></p>
    </Shell>
  );
}

export function Verify() {
  const { user, resendVerification, refreshUser, logout } = useAuth(); const nav = useNavigate();
  const [msg, setMsg] = useState("");
  if (!user) return <Navigate to="/login" replace />;
  if (user.emailVerified) return <Navigate to="/" replace />;
  return (
    <Shell>
      <p>Мы отправили письмо на <b>{user.email}</b>. Перейдите по ссылке в письме, затем нажмите кнопку ниже.</p>
      {msg && <p className="ok">{msg}</p>}
      <button className="btn" onClick={async () => { await refreshUser(); if (!user.emailVerified) setMsg("Почта пока не подтверждена"); else nav("/"); }}>Я подтвердил(а) почту</button>
      <button className="btn ghost" onClick={async () => { await resendVerification().then(() => setMsg("Письмо отправлено повторно")).catch(() => setMsg("Подождите немного перед повторной отправкой")); }}>Отправить ещё раз</button>
      <button className="btn ghost" onClick={logout}>Выйти</button>
    </Shell>
  );
}

export function Setup() {
  const { user, profile, createProfile } = useAuth(); const nav = useNavigate();
  const [username, setUsername] = useState(""); const [name, setName] = useState(""); const [err, setErr] = useState("");
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify" replace />;
  if (profile) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    try { await createProfile(username, name); nav("/"); } catch (x) { setErr(errText(x)); }
  };
  return (
    <Shell>
      <form onSubmit={submit}>
        <input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} required />
        <input placeholder="Имя пользователя (a–z, 0–9, _)" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())}
               pattern={USERNAME_RE.source} title="3–20 символов: a–z, 0–9, _" required />
        {err && <p className="error">{err}</p>}
        <button className="btn">Готово</button>
      </form>
    </Shell>
  );
}
