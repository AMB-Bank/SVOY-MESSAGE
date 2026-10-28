# СВОЙ — мессенджер

Статический сайт (чистый HTML/JS, без сборки) на Firebase: Authentication,
Realtime Database, Storage.

## Структура

```
index.html              ← весь мессенджер (один файл)
manifest.webmanifest     ← PWA-манифест
icons/                   ← иконки приложения
database.rules.json      ← правила доступа к Realtime Database
storage.rules             ← правила доступа к Storage (файлы/аватары)
firebase.json             ← конфиг Firebase Hosting
.firebaserc                ← id проекта (respzonasite)
```

## Запуск локально

Сборка не нужна — просто открыть `index.html` в браузере
(или `npx serve .` для локального сервера).

## Деплой на Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting,database,storage
```

## Деплой на Netlify / статический Render / GitHub Pages

Publish directory — корень репозитория, Build command не нужен.
`database.rules.json`, `storage.rules`, `firebase.json`, `.firebaserc`
в таком случае просто лежат в репозитории как справочные файлы и на
сам сайт не влияют — они нужны только если решите позже деплоить
через `firebase deploy`.

## Обязательно в Firebase Console

Если домен, на который заливаете сайт (Netlify/GitHub Pages/другой),
отличается от `respzonasite.web.app` — добавьте его в
**Authentication → Settings → Authorized domains**, иначе вход и
регистрация будут давать ошибку `auth/unauthorized-domain`.
