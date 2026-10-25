// Одноразово назначить первого администратора (нужен ключ сервисного аккаунта Firebase, НЕ коммитить!).
// Запуск: GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/set-admin.mjs <uid>
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
initializeApp({ credential: applicationDefault(), projectId: "respzonasite" });
const uid = process.argv[2];
if (!uid) { console.error("Укажите uid пользователя"); process.exit(1); }
await getAuth().setCustomUserClaims(uid, { admin: true });
console.log("Администратор назначен:", uid);
