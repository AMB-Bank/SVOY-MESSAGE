import { useEffect, useRef, useState } from "react";
import { CallSession, mediaErrorMessage, type CallType } from "../lib/calls";
import { Avatar } from "./Avatar";
import { useProfile } from "../lib/hooks";

export interface CallProps {
  callId: string; peerUid: string; type: CallType; isCaller: boolean; chatId: string;
  onClose(): void;
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Экран исходящего/входящего вызова, аудио- и видеозвонка. */
export function CallScreen(p: CallProps) {
  const peer = useProfile(p.peerUid);
  const [phase, setPhase] = useState<"incoming" | "connecting" | "active" | "ended">(p.isCaller ? "connecting" : "incoming");
  const [err, setErr] = useState("");
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(p.type === "video");
  const [secs, setSecs] = useState(0);
  const sess = useRef<CallSession | null>(null);
  const remoteV = useRef<HTMLVideoElement>(null);
  const localV = useRef<HTMLVideoElement>(null);
  const remoteStream = useRef<MediaStream | null>(null);

  const make = () => new CallSession(p.callId, p.type, p.isCaller, p.peerUid, {
    onRemoteStream: (s) => { remoteStream.current = s; if (remoteV.current) remoteV.current.srcObject = s; },
    onState: (st, reason) => {
      if (reason) setErr(reason);
      if (st === "active") setPhase("active");
      else if (st === "connecting") setPhase("connecting");
      else if (st === "ended" || st === "declined" || st === "failed") { setPhase("ended"); setTimeout(p.onClose, 1200); }
    },
  });

  useEffect(() => {
    if (!p.isCaller) { sess.current = make(); return; }
    const s = make(); sess.current = s;
    s.start(p.chatId).then(() => { if (localV.current && s.local) localV.current.srcObject = s.local; })
      .catch((e) => { setErr(mediaErrorMessage(e)); void s.hangup("ended"); });
    return () => { void s.hangup("ended"); };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (phase !== "active") return;
    const t = setInterval(() => setSecs((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (remoteV.current && remoteStream.current && remoteV.current.srcObject !== remoteStream.current) remoteV.current.srcObject = remoteStream.current;
    const l = sess.current?.local;
    if (localV.current && l && localV.current.srcObject !== l) localV.current.srcObject = l;
  });

  const accept = async () => {
    const s = sess.current!;
    try { await s.accept(); if (localV.current && s.local) localV.current.srcObject = s.local; }
    catch (e) { setErr(e instanceof Error && e.message.includes("завершён") ? e.message : mediaErrorMessage(e)); await s.hangup("ended"); }
  };
  const decline = () => void sess.current?.hangup("declined");
  const end = () => void sess.current?.hangup("ended");

  const status = phase === "incoming" ? (p.type === "video" ? "Входящий видеозвонок" : "Входящий аудиозвонок")
    : phase === "connecting" ? (p.isCaller ? "Вызов…" : "Соединение…") : phase === "active" ? fmt(secs) : "Звонок завершён";

  return (
    <div className="call" role="dialog" aria-label="Звонок">
      {p.type === "video" && phase === "active" && <video ref={remoteV} className="remote" autoPlay playsInline />}
      {p.type === "audio" && <video ref={remoteV} autoPlay playsInline style={{ display: "none" }} />}
      <div className="call-info">
        <Avatar name={peer?.displayName} url={peer?.photoURL} size={96} />
        <h2>{peer?.displayName ?? "…"}</h2>
        <p>{status}</p>
        {err && <p className="error">{err}</p>}
      </div>
      {p.type === "video" && phase !== "incoming" && <video ref={localV} className="local" autoPlay playsInline muted />}
      <div className="call-actions">
        {phase === "incoming" ? (
          <>
            <button className="round red" onClick={decline} aria-label="Отклонить">✕</button>
            <button className="round green" onClick={accept} aria-label="Принять">✆</button>
          </>
        ) : (
          <>
            <button className={`round ${mic ? "" : "off"}`} onClick={() => { setMic(!mic); sess.current?.setMic(!mic); }} aria-label="Микрофон">{mic ? "🎤" : "🔇"}</button>
            {p.type === "video" && <button className={`round ${cam ? "" : "off"}`} onClick={() => { setCam(!cam); sess.current?.setCam(!cam); }} aria-label="Камера">{cam ? "📷" : "🚫"}</button>}
            <button className="round red" onClick={end} aria-label="Завершить">⏻</button>
          </>
        )}
      </div>
    </div>
  );
}
