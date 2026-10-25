import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  get, increment, limitToLast, onDisconnect, onValue, push, query, ref, remove, serverTimestamp, set, update,
} from "firebase/database";
import { getDownloadURL, ref as sref, uploadBytes } from "firebase/storage";
import { db, storage } from "../lib/firebase";
import { useAuth } from "../lib/auth";
import { directChatId, presenceLabel, useProfile, usePresence } from "../lib/hooks";
import { newCallId, type CallType } from "../lib/calls";
import { Avatar } from "../components/Avatar";
import { Wordmark } from "../components/Wordmark";
import { CallScreen, type CallProps } from "../components/CallScreen";

interface ChatMeta { type: "direct" | "group"; title?: string; members: Record<string, string>; createdBy: string }
interface UC { lastMessage?: string; lastTs?: number; lastFrom?: string; unread?: number }
interface Msg {
  id: string; from: string; ts: number; text?: string; editedAt?: number;
  attachment?: { url: string; name: string; type: string; size: number }; reactions?: Record<string, string>;
}

const timeOf = (ts?: number) => ts ? new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";

function useChat(chatId?: string) {
  const [chat, setChat] = useState<ChatMeta | null>(null);
  useEffect(() => {
    if (!chatId) { setChat(null); return; }
    return onValue(ref(db, `chats/${chatId}`), (s) => setChat(s.val()), () => setChat(null));
  }, [chatId]);
  return chat;
}

function ChatRow({ chatId, uc, active, me }: { chatId: string; uc: UC; active: boolean; me: string }) {
  const chat = useChat(chatId);
  const other = chat?.type === "direct" ? Object.keys(chat.members).find((u) => u !== me) : undefined;
  const p = useProfile(other); const pres = usePresence(other);
  const title = chat?.type === "group" ? chat.title : p?.displayName;
  return (
    <Link to={`/chat/${chatId}`} className={`row ${active ? "active" : ""}`}>
      <Avatar name={title} url={p?.photoURL} online={pres.online} />
      <div className="row-main"><b>{title ?? "…"}</b><span>{uc.lastFrom === me ? "Вы: " : ""}{uc.lastMessage}</span></div>
      <div className="row-meta"><small>{timeOf(uc.lastTs)}</small>{!!uc.unread && <em>{uc.unread}</em>}</div>
    </Link>
  );
}

function NewChat({ me, onDone }: { me: string; onDone(id: string): void }) {
  const [name, setName] = useState(""); const [err, setErr] = useState("");
  const [group, setGroup] = useState(false); const [title, setTitle] = useState("");
  const lookup = async (u: string) => {
    const s = await get(ref(db, `usernames/${u.trim().toLowerCase().replace(/^@/, "")}`));
    return s.exists() ? (s.val() as string) : null;
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr("");
    try {
      const names = name.split(/[ ,]+/).filter(Boolean);
      const uids = (await Promise.all(names.map(lookup)));
      if (uids.some((x) => !x)) return setErr("Пользователь не найден");
      const others = [...new Set(uids as string[])].filter((u) => u !== me);
      if (!others.length) return setErr("Укажите другого пользователя");
      if (!group && others.length === 1) {
        const id = directChatId(me, others[0]);
        await set(ref(db, `chats/${id}`), { type: "direct", createdBy: me, createdAt: serverTimestamp(), members: { [me]: "owner", [others[0]]: "member" } })
          .catch(() => { /* чат уже существует (создан собеседником) */ });
        return onDone(id);
      }
      if (!title.trim()) return setErr("Введите название группы");
      const id = push(ref(db, "chats")).key!;
      const members: Record<string, string> = { [me]: "owner" }; others.forEach((u) => (members[u] = "member"));
      await set(ref(db, `chats/${id}`), { type: "group", title: title.trim().slice(0, 80), createdBy: me, createdAt: serverTimestamp(), members });
      onDone(id);
    } catch { setErr("Не удалось создать чат"); }
  };
  return (
    <form className="newchat" onSubmit={submit}>
      <label className="check"><input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} /> Группа</label>
      {group && <input placeholder="Название группы" value={title} onChange={(e) => setTitle(e.target.value)} />}
      <input placeholder={group ? "@имена через пробел" : "@имя пользователя"} value={name} onChange={(e) => setName(e.target.value)} required />
      {err && <p className="error">{err}</p>}
      <button className="btn">Создать</button>
    </form>
  );
}

function ChatView({ chatId, me, startCall }: { chatId: string; me: string; startCall(t: CallType, peer: string, chatId: string): void }) {
  const chat = useChat(chatId); const nav = useNavigate();
  const other = chat?.type === "direct" ? Object.keys(chat.members).find((u) => u !== me) : undefined;
  const p = useProfile(other); const pres = usePresence(other);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [text, setText] = useState(""); const [typing, setTyping] = useState(false);
  const [reads, setReads] = useState<Record<string, number>>({}); const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null); const typingTimer = useRef<number>();

  useEffect(() => onValue(query(ref(db, `messages/${chatId}`), limitToLast(100)), (s) => {
    const arr: Msg[] = []; s.forEach((c) => { arr.push({ id: c.key!, ...(c.val() as Omit<Msg, "id">) }); });
    setMsgs(arr);
  }), [chatId]);
  useEffect(() => onValue(ref(db, `reads/${chatId}`), (s) => setReads(s.val() ?? {})), [chatId]);
  useEffect(() => onValue(ref(db, `typing/${chatId}`), (s) => {
    const v = (s.val() ?? {}) as Record<string, boolean>; setTyping(Object.keys(v).some((u) => u !== me && v[u]));
  }), [chatId, me]);
  useEffect(() => {                                   // прочитано: сбрасываем счётчик и ставим метку
    if (!msgs.length || document.visibilityState !== "visible") return;
    void update(ref(db), { [`reads/${chatId}/${me}`]: serverTimestamp(), [`userChats/${me}/${chatId}/unread`]: 0 }).catch(() => {});
  }, [msgs.length, chatId, me]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs.length, typing]);

  const members = useMemo(() => Object.keys(chat?.members ?? {}), [chat]);
  const title = chat?.type === "group" ? chat.title : p?.displayName;

  const setTypingState = (v: boolean) => {
    const r = ref(db, `typing/${chatId}/${me}`);
    if (v) { void set(r, true); void onDisconnect(r).remove(); } else void remove(r);
  };
  const onInput = (v: string) => {
    setText(v); setTypingState(true);
    window.clearTimeout(typingTimer.current); typingTimer.current = window.setTimeout(() => setTypingState(false), 2500);
  };

  const send = async (payload: { text?: string; attachment?: Msg["attachment"] }) => {
    if (!chat) return; setErr("");
    const id = push(ref(db, `messages/${chatId}`)).key!;
    const preview = payload.text ? payload.text.slice(0, 120) : `📎 ${payload.attachment!.name}`.slice(0, 120);
    const up: Record<string, unknown> = { [`messages/${chatId}/${id}`]: { from: me, ts: serverTimestamp(), ...payload } };
    members.forEach((u) => {
      up[`userChats/${u}/${chatId}/lastMessage`] = preview; up[`userChats/${u}/${chatId}/lastTs`] = serverTimestamp();
      up[`userChats/${u}/${chatId}/lastFrom`] = me;
      if (u !== me) up[`userChats/${u}/${chatId}/unread`] = increment(1);
    });
    try { await update(ref(db), up); } catch { setErr("Сообщение не отправлено. Проверьте соединение."); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault(); const t = text.trim(); if (!t) return;
    setText(""); setTypingState(false); void send({ text: t.slice(0, 4000) });
  };
  const attach = async (f: File) => {
    if (f.size > 25 * 1024 * 1024) return setErr("Файл больше 25 МБ");
    try {
      const path = `attachments/${me}/${chatId}/${crypto.randomUUID()}`;
      const r = sref(storage, path); await uploadBytes(r, f, { contentType: f.type || "application/octet-stream" });
      await send({ attachment: { url: await getDownloadURL(r), name: f.name.slice(0, 200), type: f.type, size: f.size } });
    } catch { setErr("Не удалось загрузить файл (проверьте тип и размер)"); }
  };
  const react = (m: Msg, emoji: string) => {
    const r = ref(db, `messages/${chatId}/${m.id}/reactions/${me}`);
    return m.reactions?.[me] === emoji ? remove(r) : set(r, emoji);
  };
  const otherRead = other ? reads[other] ?? 0 : 0;

  if (!chat) return <div className="empty">Чат недоступен</div>;
  return (
    <section className="chat">
      <header>
        <button className="btn ghost back" onClick={() => nav("/")} aria-label="Назад">←</button>
        <Avatar name={title} url={p?.photoURL} online={pres.online} size={40} />
        <div className="hd"><b>{title}</b>
          <small>{typing ? "печатает…" : chat.type === "group" ? `${members.length} участн.` : presenceLabel(pres, p?.privacy?.showLastSeen !== false)}</small></div>
        {other && <><button className="btn ghost" onClick={() => startCall("audio", other, chatId)} aria-label="Аудиозвонок">📞</button>
          <button className="btn ghost" onClick={() => startCall("video", other, chatId)} aria-label="Видеозвонок">🎥</button></>}
      </header>
      <div className="msgs">
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.from === me ? "mine" : ""}`}>
            {chat.type === "group" && m.from !== me && <Sender uid={m.from} />}
            {m.attachment && (m.attachment.type.startsWith("image/")
              ? <a href={m.attachment.url} target="_blank" rel="noreferrer noopener"><img className="att" src={m.attachment.url} alt={m.attachment.name} /></a>
              : <a href={m.attachment.url} target="_blank" rel="noreferrer noopener">📎 {m.attachment.name}</a>)}
            {m.text && <span>{m.text}</span>}
            <small>{timeOf(m.ts)}{m.from === me && chat.type === "direct" ? (m.ts <= otherRead ? " ✓✓" : " ✓") : ""}</small>
            <div className="reacts">
              {Object.values(m.reactions ?? {}).length > 0 && <span className="rc">{Object.values(m.reactions!).join("")}</span>}
              <span className="rp">{["👍", "❤️", "😂"].map((e) => <button key={e} onClick={() => react(m, e)}>{e}</button>)}</span>
            </div>
          </div>
        ))}
        {typing && <div className="msg typing">печатает…</div>}
        <div ref={endRef} />
      </div>
      {err && <p className="error pad">{err}</p>}
      <form className="composer" onSubmit={submit}>
        <label className="btn ghost clip">📎<input type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void attach(f); e.target.value = ""; }} /></label>
        <input value={text} onChange={(e) => onInput(e.target.value)} placeholder="Сообщение" maxLength={4000} />
        <button className="btn" aria-label="Отправить">➤</button>
      </form>
    </section>
  );
}
function Sender({ uid }: { uid: string }) { const p = useProfile(uid); return <b className="sender">{p?.displayName}</b>; }

export function Messenger({ onCall }: { onCall(c: Omit<CallProps, "onClose">): void }) {
  const { user, profile } = useAuth(); const { chatId } = useParams(); const nav = useNavigate();
  const me = user!.uid;
  const [list, setList] = useState<Array<[string, UC]>>([]); const [adding, setAdding] = useState(false);
  useEffect(() => onValue(ref(db, `userChats/${me}`), (s) => {
    const arr: Array<[string, UC]> = []; s.forEach((c) => { arr.push([c.key!, c.val()]); });
    setList(arr.sort((a, b) => (b[1].lastTs ?? 0) - (a[1].lastTs ?? 0)));
  }), [me]);

  const startCall = (type: CallType, peerUid: string, cid: string) =>
    onCall({ callId: newCallId(), peerUid, type, isCaller: true, chatId: cid });

  return (
    <div className={`layout ${chatId ? "has-chat" : ""}`}>
      <aside>
        <header>
          <Wordmark size={26} />
          <span className="sp" />
          <button className="btn ghost" onClick={() => setAdding(!adding)} aria-label="Новый чат">＋</button>
          <Link className="btn ghost" to="/settings" aria-label="Настройки"><Avatar name={profile?.displayName} url={profile?.photoURL} size={30} /></Link>
        </header>
        <div className="tri" />
        {adding && <NewChat me={me} onDone={(id) => { setAdding(false); nav(`/chat/${id}`); }} />}
        <div className="rows">
          {list.length === 0 && <p className="hint">Чатов пока нет. Нажмите ＋ и введите имя пользователя.</p>}
          {list.map(([id, uc]) => <ChatRow key={id} chatId={id} uc={uc} active={id === chatId} me={me} />)}
        </div>
      </aside>
      <main>{chatId ? <ChatView key={chatId} chatId={chatId} me={me} startCall={startCall} /> : <div className="empty"><Wordmark size={48} /><p>Выберите чат</p></div>}</main>
    </div>
  );
}
