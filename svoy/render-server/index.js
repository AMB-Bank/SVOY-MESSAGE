// Альтернатива Cloud Functions (без тарифа Blaze): небольшой сервис на Render.
// Переменные окружения Render: METERED_DOMAIN, METERED_SECRET_KEY, FIREBASE_SERVICE_ACCOUNT (JSON одной строкой),
// ALLOWED_ORIGIN (например https://respzonasite.web.app)
import express from "express";
import cors from "cors";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const app = express();
const origins = (process.env.ALLOWED_ORIGIN || "").split(",").filter(Boolean);
app.use(cors({ origin: origins, methods: ["GET"] }));

app.get("/ice", async (req, res) => {
  try {
    const token = (req.headers.authorization || "").replace(/^Bearer /, "");
    const decoded = await getAuth().verifyIdToken(token);
    const base = `https://${process.env.METERED_DOMAIN}/api/v1/turn`;
    const c = await fetch(`${base}/credential?secretKey=${encodeURIComponent(process.env.METERED_SECRET_KEY)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiryInSeconds: 3600, label: decoded.uid }),
    });
    if (!c.ok) return res.status(502).json({ error: "metered" });
    const { apiKey } = await c.json();
    const ice = await fetch(`${base}/credentials?apiKey=${encodeURIComponent(apiKey)}`);
    res.json({ iceServers: await ice.json() });
  } catch { res.status(401).json({ error: "unauthorized" }); }
});
app.listen(process.env.PORT || 3000);
