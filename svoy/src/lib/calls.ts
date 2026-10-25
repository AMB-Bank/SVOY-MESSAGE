import { httpsCallable } from "firebase/functions";
import { onChildAdded, onValue, push, ref, remove, serverTimestamp, set, update, get, off } from "firebase/database";
import { auth, db, functions } from "./firebase";

export type CallType = "audio" | "video";
export interface CallEvents {
  onRemoteStream(s: MediaStream): void;
  onState(s: "connecting" | "active" | "ended" | "declined" | "failed", reason?: string): void;
}

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

/** Временные TURN-данные Metered: через Cloud Function или (если задан VITE_ICE_ENDPOINT) через сервис на Render. */
export async function loadIceServers(): Promise<{ servers: RTCIceServer[]; turn: boolean }> {
  try {
    const endpoint = import.meta.env.VITE_ICE_ENDPOINT as string | undefined;
    let list: RTCIceServer[];
    if (endpoint) {
      const token = await auth.currentUser!.getIdToken();
      const r = await fetch(`${endpoint}/ice`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error("ice endpoint");
      list = (await r.json()).iceServers;
    } else {
      const res = await httpsCallable<unknown, { iceServers: RTCIceServer[] }>(functions, "getIceServers")({});
      list = res.data.iceServers;
    }
    return { servers: list, turn: true };
  } catch {
    return { servers: FALLBACK_ICE, turn: false };   // без TURN звонок может не соединиться за сложным NAT
  }
}

export function mediaErrorMessage(e: unknown): string {
  const n = (e as DOMException)?.name;
  if (n === "NotAllowedError" || n === "SecurityError") return "Нет доступа к микрофону/камере. Разрешите доступ в настройках браузера.";
  if (n === "NotFoundError" || n === "OverconstrainedError") return "Микрофон или камера не найдены.";
  if (n === "NotReadableError") return "Устройство занято другим приложением.";
  return "Не удалось получить доступ к устройствам.";
}

export class CallSession {
  pc!: RTCPeerConnection;
  local?: MediaStream;
  private unsubs: Array<() => void> = [];
  private startedAt = 0;
  private finished = false;
  private canSignal: boolean;
  private queue: RTCIceCandidateInit[] = [];
  constructor(public callId: string, public type: CallType, public isCaller: boolean,
              public peerUid: string, private ev: CallEvents) { this.canSignal = !isCaller; }

  private sendCandidate(c: RTCIceCandidateInit) {
    void push(ref(db, `calls/${this.callId}/candidates/${auth.currentUser!.uid}`), c);
  }

  private async setup() {
    this.local = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: this.type === "video" ? { facingMode: "user" } : false,
    });
    const { servers } = await loadIceServers();
    this.pc = new RTCPeerConnection({ iceServers: servers });
    this.local.getTracks().forEach((t) => this.pc.addTrack(t, this.local!));
    const remote = new MediaStream();
    this.pc.ontrack = (e) => { e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t)); this.ev.onRemoteStream(remote); };
    this.pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      if (this.canSignal) this.sendCandidate(e.candidate.toJSON()); else this.queue.push(e.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      if (s === "connected") { this.startedAt ||= Date.now(); this.ev.onState("active"); }
      else if (s === "failed") { this.ev.onState("failed", "Не удалось установить соединение"); void this.hangup("failed"); }
      else if (s === "disconnected") setTimeout(() => { if (this.pc.connectionState === "disconnected") void this.hangup("ended"); }, 8000);
    };
    // кандидаты собеседника
    const peerCand = ref(db, `calls/${this.callId}/candidates/${this.peerUid}`);
    onChildAdded(peerCand, (s) => { void this.pc.addIceCandidate(new RTCIceCandidate(s.val())).catch(() => {}); });
    this.unsubs.push(() => off(peerCand));
    // статус вызова
    const st = ref(db, `calls/${this.callId}/status`);
    const u = onValue(st, (s) => {
      const v = s.val();
      if (v === "ended" || v === "declined" || v === "missed") void this.finish(v === "declined" ? "declined" : "ended");
    });
    this.unsubs.push(u);
  }

  async start(chatId: string): Promise<void> {         // звонящий
    const me = auth.currentUser!.uid;
    this.ev.onState("connecting");
    await this.setup();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await set(ref(db, `calls/${this.callId}`), {
      caller: me, callee: this.peerUid, chatId, type: this.type, status: "ringing",
      offer: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp(),
    });
    this.canSignal = true;                             // звонок создан — можно слать ICE-кандидаты
    this.queue.splice(0).forEach((c) => this.sendCandidate(c));
    await set(ref(db, `incomingCalls/${this.peerUid}/${this.callId}`), { from: me, type: this.type, chatId, ts: serverTimestamp() });
    const ans = ref(db, `calls/${this.callId}/answer`);
    const u = onValue(ans, (s) => {
      const a = s.val();
      if (a && !this.pc.currentRemoteDescription) void this.pc.setRemoteDescription(a);
    });
    this.unsubs.push(u);
    setTimeout(async () => {                           // никто не ответил за 45 с
      const st = (await get(ref(db, `calls/${this.callId}/status`))).val();
      if (st === "ringing") await this.hangup("missed");
    }, 45_000);
  }

  async accept(): Promise<void> {                      // принимающий
    this.ev.onState("connecting");
    const snap = await get(ref(db, `calls/${this.callId}`));
    const call = snap.val();
    if (!call || call.status !== "ringing") throw new Error("Вызов уже завершён");
    await this.setup();
    await this.pc.setRemoteDescription(call.offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await update(ref(db, `calls/${this.callId}`), { answer: { type: answer.type, sdp: answer.sdp }, status: "active" });
    await remove(ref(db, `incomingCalls/${auth.currentUser!.uid}/${this.callId}`));
  }

  setMic(on: boolean) { this.local?.getAudioTracks().forEach((t) => (t.enabled = on)); }
  setCam(on: boolean) { this.local?.getVideoTracks().forEach((t) => (t.enabled = on)); }

  async hangup(status: "ended" | "declined" | "missed" | "failed" = "ended") {
    if (this.finished) return;
    const dbStatus = status === "failed" ? "ended" : status;
    await update(ref(db, `calls/${this.callId}`), { status: dbStatus }).catch(() => {});
    await this.finish(status === "declined" ? "declined" : "ended", status);
  }

  private async finish(state: "ended" | "declined", logStatus: string = state) {
    if (this.finished) return; this.finished = true;
    const me = auth.currentUser?.uid;
    this.unsubs.forEach((u) => u());
    this.local?.getTracks().forEach((t) => t.stop());
    try { this.pc?.close(); } catch { /* noop */ }
    if (me) {
      await remove(ref(db, `incomingCalls/${me}/${this.callId}`)).catch(() => {});
      await push(ref(db, `callLog/${me}`), {
        with: this.peerUid, type: this.type, direction: this.isCaller ? "out" : "in",
        status: logStatus, ts: serverTimestamp(),
        duration: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
      }).catch(() => {});
    }
    this.ev.onState(state);
  }
}

export const newCallId = () => push(ref(db, "calls")).key!;
