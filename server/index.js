import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3001);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

app.disable("x-powered-by");
app.set("trust proxy", 1);

function parseOrigins(...values) {
  return new Set(values.flatMap(value => String(value || "").split(","))
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => {
      try { return new URL(value).origin; } catch { return null; }
    })
    .filter(Boolean));
}

const allowedOrigins = parseOrigins(
  process.env.APP_URL,
  process.env.FRONTEND_ORIGINS,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
);

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  if (req.path.startsWith("/api")) res.setHeader("Cache-Control", "no-store");
  const origin = req.headers.origin;
  const forwardedProtocol = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0].trim();
  const sameOrigin = origin && origin === forwardedProtocol + "://" + req.get("host");
  if (origin) {
    if (!sameOrigin && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: "Адрес сайта не разрешён. Добавь его в APP_URL или FRONTEND_ORIGINS на сервере." });
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function createRateLimiter({ windowMs, maxRequests, message }) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip || req.socket?.remoteAddress || "unknown";
    let entry = clients.get(key);
    if (!entry || now - entry.startedAt >= windowMs) {
      entry = { startedAt: now, count: 0 };
      clients.set(key, entry);
    }
    if (entry.count >= maxRequests) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((windowMs - (now - entry.startedAt)) / 1000))));
      return res.status(429).json({ error: message });
    }
    entry.count += 1;
    if (clients.size > 5000) {
      for (const [clientKey, client] of clients) {
        if (now - client.startedAt >= windowMs) clients.delete(clientKey);
      }
      while (clients.size > 5000) clients.delete(clients.keys().next().value);
    }
    next();
  };
}

app.use(express.json({ limit: "12mb" }));

const chatLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 20,
  message: "Слишком много запросов к AI. Подожди немного и попробуй снова."
});
const ttsLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 30,
  message: "Слишком много запросов на озвучку. Подожди немного и попробуй снова."
});

const modelCache = new Map();
const allowedModelId = /^[a-zA-Z0-9._:\\/-]{1,180}$/;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const systemPrompt = "Ты — доброжелательный учебный помощник для школьников 5–11 классов. Объясняй доступно, спокойно и по шагам. Помогай понять ход решения, не выдумывай факты. Если условие неполное, попроси уточнение. Для химии и естественных наук соблюдай правила безопасности. Не проси личные данные.";

export function normalizeGrade(value) {
  const grade = String(value);
  return ["5", "6", "7", "8", "9", "10", "11"].includes(grade) ? grade : "7";
}
export function normalizeModels(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(model => model && typeof model.id === "string" && allowedModelId.test(model.id))
    .map(model => ({
      id: model.id,
      name: typeof model.name === "string" && model.name.trim() ? model.name : model.id,
      vision: Array.isArray(model.architecture?.input_modalities) && model.architecture.input_modalities.includes("image"),
      free: Number(model.pricing?.prompt ?? 1) === 0 && Number(model.pricing?.completion ?? 1) === 0,
      contextLength: Number.isFinite(Number(model.context_length)) ? Number(model.context_length) : null
    }));
}

export function parseImageDataUrl(value) {
  if (typeof value !== "string" || value.length > 11_200_000) return null;
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || !imageTypes.has(match[1])) return null;
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024 || bytes.toString("base64") !== match[2]) return null;
  const validSignature =
    (match[1] === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (match[1] === "image/jpeg" && bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) ||
    (match[1] === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!validSignature) return null;
  return { mime: match[1], data: match[2] };
}

function getInworldKey() {
  return String(process.env.INWORLD_API_KEY || "").trim().replace(/^Basic\s+/i, "").trim();
}

app.get("/api/status", (_req, res) => res.json({
  server: true,
  aiConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  ttsConfigured: Boolean(getInworldKey()),
  ttsVoice: process.env.INWORLD_TTS_VOICE_ID || "Ashley"
}));

app.post("/api/tts/check", ttsLimiter, async (_req, res) => {
  const apiKey = getInworldKey();
  if (!apiKey) return res.status(503).json({ ok: false, error: "На сервере не задан INWORLD_API_KEY." });
  const voiceId = process.env.INWORLD_TTS_VOICE_ID || "Ashley";
  try {
    const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: { Authorization: "Basic " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        text: "Проверка подключения Inworld.",
        voiceId,
        modelId: "inworld-tts-2",
        audioConfig: { audioEncoding: "MP3" }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = payload.error?.message || payload.message || "Inworld не смог выполнить тест.";
      const error = response.status === 401
        ? "Inworld отклонил ключ (401). Используй Base64 credentials из Inworld Portal без повторного кодирования."
        : response.status === 403
          ? "Доступ запрещён (403). Проверь права рабочего пространства на TTS."
          : response.status === 404
            ? "Голос не найден (404). Проверь INWORLD_TTS_VOICE_ID и наличие голоса в своём рабочем пространстве."
            : response.status === 429
              ? "Лимит Inworld исчерпан (429). Проверь доступные лимиты."
              : String(providerMessage).slice(0, 500);
      return res.status(response.status >= 500 ? 502 : response.status).json({ ok: false, error, providerStatus: response.status });
    }
    if (typeof payload.audioContent !== "string" || !payload.audioContent) {
      return res.status(502).json({ ok: false, error: "Inworld ответил без аудиоданных. Проверь голос и модель." });
    }
    return res.json({ ok: true, voiceId, model: payload.usage?.modelId || "inworld-tts-2", message: "Inworld успешно создал тестовое аудио." });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.name === "TimeoutError" ? "Inworld не ответил за 30 секунд." : "Не удалось подключиться к Inworld из backend-сервера." });
  }
});

app.post("/api/tts", ttsLimiter, async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ error: "Нет текста для озвучивания." });
  if (text.length > 2000) return res.status(400).json({ error: "Текст для Inworld TTS не должен превышать 2000 символов." });
  const apiKey = getInworldKey();
  if (!apiKey) return res.status(503).json({ error: "Inworld не подключён. Добавь INWORLD_API_KEY в серверный .env." });

  try {
    const response = await fetch("https://api.inworld.ai/tts/v1/voice", {
      method: "POST",
      headers: { Authorization: "Basic " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        text,
        voiceId: process.env.INWORLD_TTS_VOICE_ID || "Ashley",
        modelId: "inworld-tts-2",
        audioConfig: { audioEncoding: "MP3" }
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage = payload.error?.message || payload.message || payload.error || "Inworld не смог создать аудио.";
      const message = response.status === 401
        ? "Inworld отклонил API-ключ (401). В INWORLD_API_KEY вставь Base64-ключ из Inworld Portal без слова Basic; проверь, что ключ активен."
        : response.status === 403
          ? "Inworld запретил запрос (403). Проверь доступ ключа к TTS API и настройки рабочего пространства."
          : response.status === 404
            ? "Inworld не нашёл голос или модель (404). Проверь INWORLD_TTS_VOICE_ID и модель inworld-tts-2."
            : response.status === 429
              ? "Inworld ограничил запросы (429). Проверь лимиты и баланс рабочего пространства."
              : String(providerMessage).slice(0, 500);
      return res.status(response.status >= 500 ? 502 : response.status).json({ error: message, providerStatus: response.status });
    }
    if (typeof payload.audioContent !== "string" || !payload.audioContent || payload.audioContent.length > 20_000_000) {
      return res.status(502).json({ error: "Inworld вернул пустой или слишком большой аудиофайл." });
    }
    res.json({ audioContent: payload.audioContent, model: payload.usage?.modelId || "inworld-tts-2" });
  } catch (error) {
    res.status(502).json({ error: error.name === "TimeoutError"
      ? "Inworld не ответил вовремя. Попробуй ещё раз."
      : "Не удалось связаться с Inworld. Проверь подключение сервера." });
  }
});

async function getModels(search = "") {
  const query = String(search || "").trim().slice(0, 180);
  const cacheKey = query.toLowerCase();
  const cached = modelCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.data;

  const url = new URL("https://openrouter.ai/api/v1/models");
  if (query) url.searchParams.set("q", query);
  else url.searchParams.set("sort", "most-popular");

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "AI-School-Assistant/1.0" },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error("OpenRouter вернул ошибку каталога моделей (" + response.status + ").");
    const payload = await response.json();
    const models = normalizeModels(payload.data);
    if (!models.length) throw new Error("OpenRouter не вернул подходящих моделей для этого поиска.");
    const result = models.slice(0, 1000);
    modelCache.set(cacheKey, { at: Date.now(), data: result });
    if (modelCache.size > 30) modelCache.delete(modelCache.keys().next().value);
    return result;
  } catch (error) {
    if (cached?.data?.length) return cached.data;
    throw error;
  }
}

async function getModelById(id) {
  const parts = id.split("/");
  if (parts.length !== 2) return null;
  const url = "https://openrouter.ai/api/v1/model/" + parts.map(encodeURIComponent).join("/");
  const response = await fetch(url, {
    headers: { "User-Agent": "AI-School-Assistant/1.0" },
    signal: AbortSignal.timeout(12000)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("OpenRouter вернул ошибку проверки модели (" + response.status + ").");
  const payload = await response.json();
  return normalizeModels(payload.data ? [payload.data] : [])[0] || null;
}

app.get("/api/models/lookup", async (req, res) => {
  const id = String(req.query.id || "").trim();
  if (!allowedModelId.test(id)) return res.status(400).json({ error: "Введи корректный ID модели OpenRouter, например provider/model-name." });
  try {
    const model = await getModelById(id);
    if (!model) return res.status(404).json({ error: "Модель с таким ID не найдена в каталоге OpenRouter. Проверь написание и доступность." });
    res.json({ model });
  } catch (error) {
    res.status(502).json({ error: error.message || "Не удалось проверить модель в OpenRouter." });
  }
});

app.get("/api/models", async (req, res) => {
  try {
    const search = String(req.query.q || "").trim();
    const models = await getModels(search);
    res.json({ models, count: models.length, search });
  } catch (error) {
    res.status(502).json({ error: error.message || "Каталог моделей недоступен." });
  }
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  const { model, messages = [], grade = "7", prompt, image } = req.body || {};
  if (typeof model !== "string" || !allowedModelId.test(model)) {
    return res.status(400).json({ error: "Выбрана некорректная AI-модель." });
  }

  const safeMessages = Array.isArray(messages)
    ? messages.slice(-12)
      .filter(message => message && ["user", "assistant"].includes(message.role) && typeof message.content === "string")
      .map(message => ({ role: message.role, content: message.content.slice(0, 5000) }))
    : [];

  let userContent;
  if (image !== undefined && image !== null) {
    if (typeof image !== "string" || image.length > 11_200_000) {
      return res.status(413).json({ error: "Изображение слишком большое. Максимальный размер — 8 МБ." });
    }
    const parsedImage = parseImageDataUrl(image);
    if (!parsedImage) return res.status(400).json({ error: "Поддерживаются только корректные JPG, PNG или WEBP до 8 МБ." });
    userContent = [
      { type: "text", text: String(prompt || "Проанализируй изображение и объясни его содержание.").slice(0, 3000) },
      { type: "image_url", image_url: { url: image } }
    ];
  } else {
    const lastMessage = safeMessages.at(-1);
    if (!lastMessage || lastMessage.role !== "user" || !lastMessage.content.trim()) {
      return res.status(400).json({ error: "Напиши вопрос перед отправкой." });
    }
    userContent = safeMessages.pop().content;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(503).json({ error: "AI не подключён: на сервере не задан OPENROUTER_API_KEY. Проверь настройки сервера." });
  }

  const messagesForModel = [
    { role: "system", content: systemPrompt + " Уровень ученика: " + normalizeGrade(grade) + " класс." },
    ...safeMessages,
    { role: "user", content: userContent }
  ];

  try {
    const selectedModel = await getModelById(model);
    if (!selectedModel) return res.status(400).json({ error: "Выбери модель из актуального списка." });
    if (image && !selectedModel.vision) return res.status(400).json({ error: "Эта модель не поддерживает анализ изображений. Выбери vision-модель." });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENROUTER_API_KEY,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.APP_URL?.split(",")[0] || "http://localhost:5173",
        "X-Title": "AI School Assistant"
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ model, messages: messagesForModel, temperature: 0.4, max_tokens: 1800 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data.error?.message || "AI-провайдер не смог обработать запрос. Проверь модель и лимиты.";
      return res.status(response.status >= 500 ? 502 : response.status).json({ error: message });
    }
    const answer = data.choices?.[0]?.message?.content;
    res.json({
      answer: typeof answer === "string" ? answer : JSON.stringify(answer || "Модель вернула пустой ответ."),
      model: data.model || model
    });
  } catch (error) {
    res.status(502).json({ error: error.name === "TimeoutError"
      ? "AI-модель отвечает слишком долго. Попробуй ещё раз."
      : "Не удалось связаться с AI-провайдером. Проверь подключение и ключ API." });
  }
});

// API paths must return JSON 404s, not the static site's index.html.
app.use("/api", (_req, res) => res.status(404).json({ error: "Такого API-маршрута нет." }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (req.path.startsWith("/api")) {
    if (error.type === "entity.too.large") return res.status(413).json({ error: "Запрос слишком большой. Уменьши размер изображения или текста." });
    if (error.type === "entity.parse.failed") return res.status(400).json({ error: "Не удалось прочитать запрос. Проверь формат отправленных данных." });
    return res.status(500).json({ error: "Внутренняя ошибка сервера. Попробуй ещё раз." });
  }
  return res.status(500).send("Внутренняя ошибка сервера.");
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(DIST));
  app.get("*", (_req, res) => res.sendFile(path.join(DIST, "index.html")));
}

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log(`AI School API listening on http://localhost:${PORT}`));
}

export default app;
