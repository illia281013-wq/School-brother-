# AI School Assistant

React + Vite приложение школьного AI-репетитора для 5–11 классов: английский язык, алгебра, геометрия, украинский язык, физика и химия.

## Стек

- React 19 + React DOM
- Vite 7 + @vitejs/plugin-react
- Supabase Auth и PostgreSQL через `@supabase/supabase-js`
- Supabase Edge Function `ai-tutor` для AI-решений

## Структура проекта

```
.
├── index.html                 # HTML entry point
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx               # React root
│   ├── App.jsx                # App shell, pages and components
│   ├── styles.css
│   └── lib/
│       └── supabase.js
└── supabase/
    ├── migrations/
    └── functions/
        └── ai-tutor/
```

## Запуск

Нужен Node.js 20.19+ или 22.12+.

1. `npm install`
2. Скопируй `.env.example` в `.env.local`.
3. Заполни Supabase URL и publishable key.
4. `npm run dev`
5. Открой адрес Vite (обычно http://localhost:5173).

Production build: `npm run build`; preview: `npm run preview`.

Корневой `index.html` остаётся точкой входа, но React-приложение монтируется через `src/main.jsx`.

## Supabase

Примени SQL migration из `supabase/migrations`, проверь RLS и разверни Edge Function `ai-tutor`. Секрет `OPENAI_API_KEY` должен храниться только в Supabase Edge Function secrets. Не добавляй service-role/secret key в браузер, GitHub или `VITE_*` переменные.

## Реализовано в интерфейсе

- Компонентная React-архитектура.
- 6 предметов, классы 5–11.
- AI-решатель с режимами объяснения и загрузкой изображений.
- Supabase Auth, сохранение решений и история.
- Библиотека знаний и формул с фильтрами.
- Страницы тренажёра и прогресса.

База знаний требует наполнения проверенными материалами; тренажёр пока подготовлен как интерфейс следующего этапа.
