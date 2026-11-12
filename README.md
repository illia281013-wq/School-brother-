# AI School Assistant

Многостраничный учебный сайт для 5–11 классов. Интерфейс — HTML/CSS, интерактивность — JavaScript, AI API — Node.js + Express.

## Функции
- Главная и школьные предметы.
- Учебный чат с выбором модели.
- Полный каталог текстовых моделей OpenRouter, включая поиск по каталогу.
- Добавление любой опубликованной модели по точному ID с серверной проверкой.
- Сохранение добавленных моделей в localStorage этого браузера.
- Разбор фотографий JPG, PNG и WEBP с vision-моделями.
- Озвучка ответов через Inworld TTS-2.
- Отдельная реальная проверка Inworld из страницы настроек.
- Библиотека формул и правил.

## Локальный запуск

Нужен Node.js 20+.

```bash
npm install
cp .env.example .env
```

Добавь секреты в локальный `.env` и запусти:

```bash
npm run dev
```

Открой http://localhost:5173. Vite проксирует `/api` на Express (порт 3001).

## Серверные переменные

- `OPENROUTER_API_KEY` — ключ OpenRouter для учебного чата и анализа фото.
- `INWORLD_API_KEY` — Base64 credentials из Inworld Portal. Вставляй значение как выдал Portal, не кодируй повторно. Если скопировано с префиксом `Basic `, сервер его удалит.
- `INWORLD_TTS_VOICE_ID` — точный ID голоса из рабочего пространства Inworld; пример по умолчанию — `Ashley`.
- `APP_URL` / `FRONTEND_ORIGINS` — дополнительные разрешённые origin для отдельного frontend. При размещении frontend и backend на одном домене same-origin разрешается автоматически.

**Не помещай секреты в HTML, JavaScript или переменные с префиксом `VITE_`.** Не коммить файл `.env`. Если ключ был опубликован в чате или репозитории, отзови его и создай новый.

## Рекомендуемое размещение всего приложения

В репозитории есть `render.yaml` для одного Node.js web service на Render:

1. Открой Render и создай новый Blueprint из этого GitHub-репозитория.
2. Render прочитает `render.yaml` и создаст web service.
3. В Environment добавь значения `OPENROUTER_API_KEY` и `INWORLD_API_KEY`.
4. После завершения сборки открой адрес сервиса. Frontend и API будут обслуживаться одним Express-сервером.

Команды сборки и запуска:
```bash
npm install && npm run build
npm start
```

Render free service может засыпать при бездействии; первый запрос после паузы может занять больше времени.

## GitHub Pages

GitHub Pages размещает только статические файлы и **не запускает Express API**. Если использовать Pages, отдельно разверни backend и собери frontend с адресом API:

```bash
VITE_API_BASE_URL=https://your-api.example.com/api npm run build
```

На backend укажи `FRONTEND_ORIGINS` с точным origin сайта Pages. Без отдельного backend не будут работать чат, каталог моделей, анализ фото и Inworld.

## Добавление модели

На странице «AI-модели» введи точный OpenRouter ID вида `provider/model-name`. Backend проверит ID через endpoint OpenRouter Single Model Lookup. После проверки модель сохранится в localStorage этого браузера. Она не добавляется в аккаунт OpenRouter и не становится автоматически доступной без прав/лимитов провайдера.

Официальные документы: [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models), [OpenRouter Single Model Lookup](https://openrouter.ai/docs/guides/overview/models).

## Inworld TTS

На странице «Настройки» нажми «Проверить реальное подключение». Backend отправит короткую тестовую фразу в Inworld TTS-2 и покажет результат. Проверка выполняет реальный синтез и может расходовать лимит/квоту Inworld.

Официальная документация: [Inworld Synthesize Speech](https://docs.inworld.ai/api-reference/ttsAPI/texttospeech/synthesize-speech).

## Проверки

```bash
npm test
npm run build
```

CI выполняет установку зависимостей, серверные тесты и production-сборку. Это не заменяет ручную проверку в браузере и проверку реальных внешних ключей.

## Данные
- История чата и пользовательский список моделей хранятся локально в браузере.
- Загруженное изображение передаётся выбранному AI-провайдеру.
- Supabase не изменяется этой версией приложения.
