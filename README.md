# Birthday Invite

Форма приглашения на день рождения на React + Vite.

## Запуск

```bash
npm install
npm run dev
```

## Интеграция с Google Sheets

1. Создай Google Sheet и открой `Extensions -> Apps Script`.
2. Вставь код из `google-apps-script/Code.gs`.
3. В Apps Script нажми `Deploy -> New deployment -> Web app`:
   - `Execute as`: **Me**
   - `Who has access`: **Anyone**
4. Скопируй URL вида `https://script.google.com/macros/s/.../exec`.
5. Создай файл `.env.local` в корне проекта:

```bash
VITE_GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
```

6. Перезапусти dev сервер (`npm run dev`).

После этого отправка формы будет записывать ответы в лист `RSVP`.
