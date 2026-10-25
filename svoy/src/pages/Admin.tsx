import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { get, ref } from "firebase/database";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { useAuth } from "../lib/auth";

/** Все права проверяются на сервере (Cloud Functions + custom claims). Этот экран — только интерфейс. */
export function Admin() {
  const { admin } = useAuth();
  const [username, setUsername] = useState(""); const [msg, setMsg] = useState("");
  if (!admin) return <Navigate to="/" replace />;
  const act = async (fn: "setAdminRole" | "setUserDisabled", payload: (uid: string) => object, okText: string) => {
    setMsg("");
    try {
      const s = await get(ref(db, `usernames/${username.trim().toLowerCase().replace(/^@/, "")}`));
      if (!s.exists()) return setMsg("Пользователь не найден");
      await httpsCallable(functions, fn)(payload(s.val()));
      setMsg(okText);
    } catch { setMsg("Не удалось выполнить действие (нет прав или функция не развёрнута)"); }
  };
  return (
    <main className="page">
      <header><Link className="btn ghost" to="/settings">←</Link><h2>Администрирование</h2></header>
      <div className="card">
        <input placeholder="@имя пользователя" value={username} onChange={(e) => setUsername(e.target.value)} />
        <button className="btn" onClick={() => act("setAdminRole", (uid) => ({ uid, admin: true }), "Роль администратора выдана")}>Назначить администратором</button>
        <button className="btn ghost" onClick={() => act("setAdminRole", (uid) => ({ uid, admin: false }), "Роль снята")}>Снять роль</button>
        <button className="btn ghost" onClick={() => act("setUserDisabled", (uid) => ({ uid, disabled: true }), "Пользователь заблокирован")}>Заблокировать</button>
        <button className="btn ghost" onClick={() => act("setUserDisabled", (uid) => ({ uid, disabled: false }), "Пользователь разблокирован")}>Разблокировать</button>
        {msg && <p className="ok">{msg}</p>}
      </div>
    </main>
  );
}
