import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { onValue, ref, update } from "firebase/database";
import { getDownloadURL, ref as sref, uploadBytes } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { Avatar } from "../components/Avatar";
import { InstallBanner } from "../components/InstallBanner";

interface LogItem { id: string; with: string; type: string; direction: string; status: string; ts: number; duration: number }

export function Settings() {
  const { user, profile, logout, admin } = useAuth(); const nav = useNavigate();
  const [name, setName] = useState(profile?.displayName ?? ""); const [msg, setMsg] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);
  const [analytics, setAnalytics] = useState(localStorage.getItem("svoy:analytics") === "granted");
  const uid = user!.uid;
  useEffect(() => onValue(ref(db, `callLog/${uid}`), (s) => {
    const a: LogItem[] = []; s.forEach((c) => { a.push({ id: c.key!, ...c.val() }); }); setLog(a.reverse().slice(0, 30));
  }), [uid]);

  const save = (patch: Record<string, unknown>) => update(ref(db, `users/${uid}`), patch).then(() => setMsg("Сохранено")).catch(() => setMsg("Ошибка сохранения"));
  const upload = async (f: File) => {
    try {
      const r = sref(storage, `avatars/${uid}/avatar`); await uploadBytes(r, f, { contentType: f.type });
      await save({ photoURL: await getDownloadURL(r) });
    } catch { setMsg("Нужна картинка JPG/PNG/WebP до 2 МБ"); }
  };
  const pv = profile?.privacy ?? {};
  return (
    <main className="page">
      <header><Link className="btn ghost" to="/">←</Link><h2>Настройки</h2></header>
      <div className="card center"><Avatar name={profile?.displayName} url={profile?.photoURL} size={84} />
        <label className="btn ghost">Сменить фото<input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
        <p>@{profile?.username}</p></div>
      <div className="card">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
        <button className="btn" onClick={() => name.trim() && save({ displayName: name.trim() })}>Сохранить имя</button>
      </div>
      <div className="card"><h3>Приватность</h3>
        <label className="check"><input type="checkbox" checked={pv.showOnline !== false} onChange={(e) => save({ "privacy/showOnline": e.target.checked })} /> Показывать, что я «в сети»</label>
        <label className="check"><input type="checkbox" checked={pv.showLastSeen !== false} onChange={(e) => save({ "privacy/showLastSeen": e.target.checked })} /> Показывать время последнего посещения</label>
        <label className="check"><input type="checkbox" checked={analytics} onChange={(e) => { localStorage.setItem("svoy:analytics", e.target.checked ? "granted" : "denied"); setAnalytics(e.target.checked); }} /> Разрешить анонимную аналитику (вступит в силу после перезапуска)</label>
      </div>
      <div className="card"><h3>История вызовов</h3>
        {log.length === 0 && <p className="hint">Пока пусто</p>}
        {log.map((l) => <CallLogRow key={l.id} l={l} />)}
      </div>
      <InstallBanner />
      {msg && <p className="ok">{msg}</p>}
      {admin && <Link className="btn ghost" to="/admin">Администрирование</Link>}
      <button className="btn ghost" onClick={async () => { await logout(); nav("/login"); }}>Выйти</button>
    </main>
  );
}

import { useProfile } from "../lib/hooks";
function CallLogRow({ l }: { l: LogItem }) {
  const p = useProfile(l.with);
  const icon = l.status === "missed" ? "↙ пропущен" : l.direction === "out" ? "↗ исходящий" : "↘ входящий";
  return <div className="logrow"><b>{p?.displayName ?? "…"}</b><span>{l.type === "video" ? "🎥" : "📞"} {icon} · {new Date(l.ts).toLocaleString("ru-RU")}{l.duration ? ` · ${l.duration} с` : ""}</span></div>;
}
