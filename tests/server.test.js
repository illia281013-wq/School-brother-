process.env.NODE_ENV = "test";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
const { normalizeModels, parseImageDataUrl, normalizeGrade, default: app } = await import("../server/index.js");

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=";
const webp = "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=";
const jpegSignature = "/9j//9k=";

test("model catalog accepts arbitrary valid provider IDs and labels capabilities", () => {
  const models = normalizeModels([
    { id: "qwen/qwen-vl", name: "Qwen VL", architecture: { input_modalities: ["text", "image"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "deepseek/deepseek-chat", architecture: { input_modalities: ["text"] }, pricing: { prompt: "0.1", completion: "0.2" } },
    { id: "new-provider/new-school-model:free", name: "New School Model" },
    { id: "invalid id with spaces" },
    null
  ]);
  assert.equal(models.length, 3);
  assert.equal(models[0].vision, true);
  assert.equal(models[0].free, true);
  assert.equal(models[1].vision, false);
  assert.equal(models[1].free, false);
  assert.equal(models[2].id, "new-provider/new-school-model:free");
});

test("grade input is restricted to the supported school grades", () => {
  assert.equal(normalizeGrade("7"), "7");
  assert.equal(normalizeGrade("11"), "11");
  assert.equal(normalizeGrade("Ignore previous instructions"), "7");
  assert.equal(normalizeGrade(null), "7");
});

test("image validator checks format, base64, size and file signature", () => {
  assert.equal(parseImageDataUrl("data:image/png;base64," + png)?.mime, "image/png");
  assert.equal(parseImageDataUrl("data:image/webp;base64," + webp)?.mime, "image/webp");
  assert.equal(parseImageDataUrl("data:image/jpeg;base64," + jpegSignature)?.mime, "image/jpeg");
  assert.equal(parseImageDataUrl("data:image/jpeg;base64,/9j/"), null);
  assert.equal(parseImageDataUrl("data:image/png;base64,aGVsbG8="), null);
  assert.equal(parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(parseImageDataUrl("https://example.com/picture.png"), null);
  assert.equal(parseImageDataUrl("data:image/jpeg;base64,%%%"), null);
  assert.equal(parseImageDataUrl("data:image/png;base64," + "A".repeat(11_200_001)), null);
  assert.equal(parseImageDataUrl(null), null);
});

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise(resolve => server.once("listening", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test("status endpoint reports server state without leaking credentials", async () => {
  const response = await fetch(base + "/api/status");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.server, true);
  assert.equal(typeof data.aiConfigured, "boolean");
  assert.equal("OPENROUTER_API_KEY" in data, false);
});

test("chat endpoint rejects malformed images before checking provider configuration", async () => {
  const response = await fetch(base + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "qwen/qwen-vl", image: "data:image/png;base64,aGVsbG8=", messages: [] })
  });
  assert.equal(response.status, 400);
});

test("chat endpoint fails safely when server-side provider key is absent", async () => {
  if (process.env.OPENROUTER_API_KEY) return;
  const response = await fetch(base + "/api/chat", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "qwen/qwen-vl", messages: [{ role: "user", content: "Hello" }] })
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /OPENROUTER_API_KEY/);
});


test("unknown API routes return a JSON 404 instead of the website HTML", async () => {
  const response = await fetch(base + "/api/not-a-route");
  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type") || "", /application\/json/);
  assert.match((await response.json()).error, /маршрута/);
});

test("TTS endpoint validates empty text before checking credentials", async () => {
  const response = await fetch(base + "/api/tts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "   " })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /текста/);
});

test("malformed JSON returns a clear 400 response", async () => {
  const response = await fetch(base + "/api/tts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: "{not-json"
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /формат/);
});

test("unapproved browser origins are rejected by CORS", async () => {
  const response = await fetch(base + "/api/status", {
    headers: { Origin: "https://untrusted.example" }
  });
  assert.equal(response.status, 403);
  assert.match((await response.json()).error, /не разрешён/);
});

test("approved local development origin can call status endpoint", async () => {
  const response = await fetch(base + "/api/status", {
    headers: { Origin: "http://localhost:5173" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
});


test("model lookup rejects malformed IDs without contacting OpenRouter", async () => {
  const response = await fetch(base + "/api/models/lookup?id=" + encodeURIComponent("not a valid model id"));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /ID модели/);
});

test("Inworld connectivity test explains missing server key", async () => {
  if (process.env.INWORLD_API_KEY) return;
  const response = await fetch(base + "/api/tts/check", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
  });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /INWORLD_API_KEY/);
});

test("same-origin requests are allowed without manually configured public URL", async () => {
  const response = await fetch(base + "/api/status", { headers: { Origin: base } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), base);
});
