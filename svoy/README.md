# СВОЙ — «Связь, которая объединяет»

Мессенджер на React + Vite + Firebase (Hosting, Auth, Realtime Database, Storage, App Check, Cloud Functions).
Название: **СВОЙ** — «СВО» красным, «Й» белым (компонент `src/components/Wordmark.tsx`, использовать на синем/тёмном фоне).

## Статус проверки (честно)
Код написан, но **сборка, эмуляторы, тесты правил и звонки между двумя устройствами в этой среде НЕ запускались** (нет доступа к npm/Firebase).
Проверено: валидность JSON правил, реальные PNG/ICO-иконки созданы из вашей эмблемы. Всё остальное — выполните чеклист ниже.

## Запуск (все команды — из корня проекта `svoy/`, если не указано иное)
```bash
npm install
npm --prefix functions install
npm run dev                     # http://localhost:5173
npm run build                   # папка сборки: dist
npm install -g firebase-tools
firebase login
firebase deploy --only database,storage     # правила безопасности
firebase deploy --only hosting              # публикация (public = dist, SPA = Yes, перезаписывать index.html = No)
```
`firebase.json` и `.firebaserc` уже настроены (проект `respzonasite`), `firebase init hosting` повторно запускать не нужно.

## Настройка в Firebase Console (сделать владельцу)
1. Authentication → Sign-in method → включить «Email/пароль».
2. Realtime Database → создать базу (регион по желанию; URL в `src/lib/firebase.ts` должен совпасть с реальным).
3. Storage → включить.
4. App Check → зарегистрировать веб-приложение (reCAPTCHA v3), ключ положить в `.env` как `VITE_RECAPTCHA_SITE_KEY`; включить enforcement после проверки.
5. Google Cloud → Credentials → ограничить Web API key по HTTP-referrer (ваш домен `*.web.app`, `*.firebaseapp.com`) и нужным API.
6. Authentication → Settings → Authorized domains: добавить свой домен Hosting.

## Звонки (WebRTC + TURN Metered)
Сигналинг идёт через Realtime Database (`calls/*`, `incomingCalls/*`), медиа — напрямую (WebRTC), TURN-доступ выдаётся временным.
Секретный ключ Metered **никогда не попадает в браузер**: клиент вызывает защищённый серверный endpoint, а тот запрашивает у Metered временный credential (`POST /api/v1/turn/credential?secretKey=…`, затем `GET /api/v1/turn/credentials?apiKey=…`).

**Вариант A — Cloud Functions (нужен тариф Blaze!).** Деплой функций требует платного плана Blaze (есть бесплатный объём, но нужна привязка карты; следите за бюджетом и поставьте оповещения). Автоматически ничего платного не подключается.
```bash
firebase functions:secrets:set METERED_SECRET_KEY
# при деплое спросит METERED_DOMAIN (например svoy.metered.live)
firebase deploy --only functions
```
**Вариант B — Render (без Blaze).** Папка `render-server/` → Web Service на Render; переменные: `METERED_DOMAIN`, `METERED_SECRET_KEY`, `FIREBASE_SERVICE_ACCOUNT`, `ALLOWED_ORIGIN`. В `.env` фронтенда: `VITE_ICE_ENDPOINT=https://<ваш-сервис>.onrender.com`. Для ролей администратора без Functions используйте `scripts/set-admin.mjs`.

Если серверный endpoint недоступен, приложение использует только публичный STUN — звонки могут не соединяться через мобильные сети/строгий NAT.

## Администраторы
Роль хранится в **custom claims** (не в профиле). Первого админа назначьте один раз:
`GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/set-admin.mjs <uid>` (ключ не коммитить). Дальше — экран «Администрирование» (вызывает `setAdminRole` / `setUserDisabled`, права проверяются на сервере).

## Тесты правил безопасности
```bash
npm run test:rules
```
Проверяет, в том числе, что посторонний не читает чужую переписку, нельзя подделать отправителя, угнать имя пользователя, записать `role: admin`, подделать присутствие.

## Установка как приложение (PWA)
Манифест: `public/manifest.webmanifest`, иконки: `public/icons/*` (пересоздать: `npm run icons`, исходник `scripts/source-emblem.png`).
Android (Chrome): откройте опубликованный HTTPS-сайт → «Установить приложение»/«Добавить на главный экран» (не каждый браузер предлагает установку автоматически — в приложении есть подсказка). iPhone: Safari → «Поделиться» → «На экран “Домой”».

## Ограничения, о которых стоит знать
- Правила Storage не видят членство в чатах (нет доступа к RTDB): вложения защищены авторизацией, неугадываемым именем и ограничениями типа/размера; ссылка видна только участникам чата.
- Профили (имя, фото) читают все авторизованные пользователи; поиск — только по точному `@username`.
- Приватность присутствия реальная: если отключено, устройство ничего не публикует.
- Firebase Analytics включается только после согласия в настройках.

## Чеклист ручной проверки перед публикацией
Регистрация/вход/письмо подтверждения · сообщения между двумя аккаунтами · онлайн/«печатает» · отказ в доступе постороннему (`npm run test:rules`) · аудио- и видеозвонок между двумя разными устройствами и сетями · установка на Android, иконка и название «СВОЙ» · запуск из иконки сохраняет вход · `npm run build` без ошибок.
