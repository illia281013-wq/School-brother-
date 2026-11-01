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
const chatRate = new Map();
app.use("/api/chat", (req, res, next) => {
  const now = Date.now();
  const key = req.ip || "unknown";
  const current = chatRate.get(key);
  if (!current || now - current.start > 15 * 60 * 1000) chatRate.set(key, { start: now, count: 1 });
  else if (current.count >= 20) return res.status(429).json({ error: "Слишком много запросов. Попробуй позже." });
  else current.count += 1;
  next();
});
app.use(express.json({ limit: "12mb" }));



let cachedModels = { at: 0, data: [] };
const allowedModelId = /^[a-zA-Z0-9._:\/-]{1,180}$/;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const systemPrompt = "Ты — доброжелательный учебный помощник для школьников 5–11 классов. Объясняй доступно, спокойно и по шагам. Помогай понять ход решения, не выдумывай факты. Если условие неполное, попроси уточнение. Для химии и естественных наук соблюдай правила безопасности. Не проси личные данные.";
export function normalizeGrade(value) { const grade = String(value); return ["5", "6", "7", "8", "9", "10", "11"].includes(grade) ? grade : "7"; }
export function normalizeModels(items = []) {
  return items.filter(m => m && typeof m.id === "string" && allowedModelId.test(m.id) && /(qwen|deepseek|llama|gemma|mistral|phi|internvl|glm|hermes|nous|yi-|minicpm)/i.test(m.id))
    .map(m => ({ id: m.id, name: m.name || m.id, vision: (m.architecture?.input_modalities || []).includes("image"), free: Number(m.pricing?.prompt ?? 1) === 0 && Number(m.pricing?.completion ?? 1) === 0 }));
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


app.get("/api/status", (_req, res) => res.json({ server: true, aiConfigured: Boolean(process.env.OPENROUTER_API_KEY) }));

async function getModels() {
  if (cachedModels.at && Date.now() - cachedModels.at < 5 * 60 * 1000) return cachedModels.data;
  const response = await fetch("https://openrouter.ai/api/v1/models", { headers: { "User-Agent": "AI-School-Assistant/1.0" }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Не удалось получить каталог моделей.");
  const payload = await response.json();
  const models = normalizeModels(payload.data || []);
  cachedModels = { at: Date.now(), data: models };
  return models;
}
app.get("/api/models", async (_req, res) => {
  try { res.json({ models: await getModels() }); }
  catch (error) { res.status(502).json({ error: error.message || "Каталог моделей недоступен." }); }
});

app.post("/api/chat", async (req, res) => {
  const { model, messages = [], grade = "7", prompt, image } = req.body || {};
  if (typeof model !== "string" || !allowedModelId.test(model)) return res.status(400).json({ error: "Выбрана некорректная модель." });
  const safeMessages = Array.isArray(messages) ? messages.slice(-12).filter(m => ["user", "assistant"].includes(m.role) && typeof m.content === "string").map(m => ({ role: m.role, content: m.content.slice(0, 5000) })) : [];
  let userContent;
  if (image !== undefined && image !== null) {
    if (typeof image !== "string" || image.length > 11_200_000) return res.status(413).json({ error: "Изображение слишком большое. Максимум 8 МБ." });
    const parsedImage = parseImageDataUrl(image);
    if (!parsedImage) return res.status(400).json({ error: "Поддерживаются только JPG, PNG и WEBP до 8 МБ." });
    userContent = [{ type: "text", text: String(prompt || "Проанализируй изображение и объясни его содержание.").slice(0, 3000) }, { type: "image_url", image_url: { url: image } }];
  } else {
    if (!safeMessages.length) return res.status(400).json({ error: "Напиши вопрос перед отправкой." });
    userContent = safeMessages.pop().content;
  }
  if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: "AI не подключён: на сервере не задан OPENROUTER_API_KEY. Открой Настройки проекта." });

  const messagesForModel = [
    { role: "system", content: systemPrompt + " Уровень ученика: " + normalizeGrade(grade) + " класс." },
    ...safeMessages,
    { role: "user", content: userContent }
  ];
  try {
    const selectedModel = (await getModels()).find(item => item.id === model);
    if (!selectedModel) return res.status(400).json({ error: "Выбери модель из доступного каталога." });
    if (image && !selectedModel.vision) return res.status(400).json({ error: "Эта модель не поддерживает анализ изображений." });
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": "Bearer " + process.env.OPENROUTER_API_KEY, "Content-Type": "application/json", "HTTP-Referer": process.env.APP_URL || "http://localhost:5173", "X-Title": "AI School Assistant" },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({ model, messages: messagesForModel, temperature: 0.4, max_tokens: 1800 })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "AI-провайдер не смог обработать запрос. Проверь модель и доступность." });
    const answer = data.choices?.[0]?.message?.content;
    res.json({ answer: typeof answer === "string" ? answer : JSON.stringify(answer || "Модель вернула пустой ответ."), model: data.model || model });
  } catch (error) {
    res.status(502).json({ error: "Не удалось связаться с AI-провайдером: " + error.message });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(DIST));
  app.get("*", (_req, res) => res.sendFile(path.join(DIST, "index.html")));
}
if (process.env.NODE_ENV !== "test") app.listen(PORT, () => console.log(`AI School API listening on http://localhost:${PORT}`));
export default app;
