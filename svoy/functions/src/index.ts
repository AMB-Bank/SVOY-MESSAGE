import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";

initializeApp();

const METERED_SECRET_KEY = defineSecret("METERED_SECRET_KEY");   // firebase functions:secrets:set METERED_SECRET_KEY
const METERED_DOMAIN = defineString("METERED_DOMAIN");           // например svoy.metered.live
// Первый администратор назначается один раз вручную: firebase functions:config / переменная окружения
const BOOTSTRAP_ADMIN_UID = defineString("BOOTSTRAP_ADMIN_UID", { default: "" });

function requireAuth(uid?: string): string {
  if (!uid) throw new HttpsError("unauthenticated", "Войдите в аккаунт");
  return uid;
}

async function isAdmin(uid: string): Promise<boolean> {
  const u = await getAuth().getUser(uid);
  return u.customClaims?.admin === true || (!!BOOTSTRAP_ADMIN_UID.value() && uid === BOOTSTRAP_ADMIN_UID.value());
}

/** Временные TURN/STUN-данные Metered. Секретный ключ остаётся только на сервере. */
export const getIceServers = onCall({ secrets: [METERED_SECRET_KEY], cors: true }, async (req) => {
  const uid = requireAuth(req.auth?.uid);
  const domain = METERED_DOMAIN.value();
  const base = `https://${domain}/api/v1/turn`;
  const created = await fetch(`${base}/credential?secretKey=${encodeURIComponent(METERED_SECRET_KEY.value())}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expiryInSeconds: 3600, label: uid }),
  });
  if (!created.ok) throw new HttpsError("internal", "Не удалось получить TURN-доступ");
  const { apiKey } = (await created.json()) as { apiKey: string };
  const ice = await fetch(`${base}/credentials?apiKey=${encodeURIComponent(apiKey)}`);
  if (!ice.ok) throw new HttpsError("internal", "Не удалось получить список ICE-серверов");
  return { iceServers: await ice.json() };
});

/** Назначение/снятие роли администратора — только администратор. Роль хранится в custom claims. */
export const setAdminRole = onCall(async (req) => {
  const caller = requireAuth(req.auth?.uid);
  if (!(await isAdmin(caller))) throw new HttpsError("permission-denied", "Недостаточно прав");
  const { uid, admin } = req.data as { uid?: string; admin?: boolean };
  if (typeof uid !== "string" || typeof admin !== "boolean" || uid.length > 128)
    throw new HttpsError("invalid-argument", "Неверные данные");
  await getAuth().setCustomUserClaims(uid, { admin });
  return { ok: true };
});

/** Блокировка/разблокировка пользователя — только администратор. */
export const setUserDisabled = onCall(async (req) => {
  const caller = requireAuth(req.auth?.uid);
  if (!(await isAdmin(caller))) throw new HttpsError("permission-denied", "Недостаточно прав");
  const { uid, disabled } = req.data as { uid?: string; disabled?: boolean };
  if (typeof uid !== "string" || typeof disabled !== "boolean" || uid === caller)
    throw new HttpsError("invalid-argument", "Неверные данные");
  await getAuth().updateUser(uid, { disabled });
  if (disabled) await getAuth().revokeRefreshTokens(uid);
  return { ok: true };
});

export const whoAmI = onCall(async (req) => {
  const uid = requireAuth(req.auth?.uid);
  return { admin: await isAdmin(uid) };
});
