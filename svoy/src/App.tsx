import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { onChildAdded, onValue, ref } from "firebase/database";
import { AuthProvider, useAuth } from "./lib/auth";
import { db } from "./lib/firebase";
import { useOnline } from "./lib/hooks";
import { Login, Register, Reset, Setup, Verify } from "./pages/AuthPages";
import { Messenger } from "./pages/Messenger";
import { Settings } from "./pages/Settings";
import { Admin } from "./pages/Admin";
import { CallScreen, type CallProps } from "./components/CallScreen";
import { Wordmark } from "./components/Wordmark";

function Gate({ children }: { children: JSX.Element }) {
  const { user, profile, ready } = useAuth();
  const [profileChecked, setChecked] = useState(false);
  useEffect(() => { const t = setTimeout(() => setChecked(true), 1500); return () => clearTimeout(t); }, []);
  if (!ready) return <div className="splash"><Wordmark size={56} /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.emailVerified) return <Navigate to="/verify" replace />;
  if (!profile) return profileChecked ? <Navigate to="/setup" replace /> : <div className="splash"><Wordmark size={56} /></div>;
  return children;
}

function Shell() {
  const { user } = useAuth(); const online = useOnline();
  const [call, setCall] = useState<Omit<CallProps, "onClose"> | null>(null);
  // входящие вызовы
  useEffect(() => {
    if (!user?.emailVerified) return;
    return onChildAdded(ref(db, `incomingCalls/${user.uid}`), (s) => {
      const v = s.val() as { from: string; type: "audio" | "video"; chatId: string };
      if (!v) return;
      setCall((cur) => cur ?? { callId: s.key!, peerUid: v.from, type: v.type, isCaller: false, chatId: v.chatId });
    });
  }, [user]);
  // если звонящий отменил — закрываем экран входящего
  useEffect(() => {
    if (!call || call.isCaller) return;
    return onValue(ref(db, `calls/${call.callId}/status`), (s) => { if (s.exists() && s.val() !== "ringing" && s.val() !== "active") setCall(null); });
  }, [call?.callId]); // eslint-disable-line
  return (
    <>
      {!online && <div className="offline">Нет соединения. Сообщения отправятся, когда связь восстановится.</div>}
      <Messenger onCall={setCall} />
      {call && <CallScreen key={call.callId} {...call} onClose={() => setCall(null)} />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/reset" element={<Reset />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/settings" element={<Gate><Settings /></Gate>} />
          <Route path="/admin" element={<Gate><Admin /></Gate>} />
          <Route path="/" element={<Gate><Shell /></Gate>} />
          <Route path="/chat/:chatId" element={<Gate><Shell /></Gate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
