process.env.NODE_ENV = "test";
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
const { normalizeModels, parseImageDataUrl, default: app } = await import("../server/index.js");

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=";
const webp = "UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vz0AAA=";
const jpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEAAAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldZWVpjZGVmZ2hpanN0dXZ4eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==";

test("model catalog filters known open model families and labels capabilities", () => {
  const models = normalizeModels([
    { id: "qwen/qwen-vl", name: "Qwen VL", architecture: { input_modalities: ["text", "image"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "deepseek/deepseek-chat", architecture: { input_modalities: ["text"] }, pricing: { prompt: "0.1", completion: "0.2" } },
    { id: "vendor/unsupported" },
    null
  ]);
  assert.equal(models.length, 2);
  assert.equal(models[0].vision, true);
  assert.equal(models[0].free, true);
  assert.equal(models[1].vision, false);
  assert.equal(models[1].free, false);
});

test("image validator checks format, base64, size and file signature", () => {
  assert.equal(parseImageDataUrl("data:image/png;base64," + png)?.mime, "image/png");
  assert.equal(parseImageDataUrl("data:image/webp;base64," + webp)?.mime, "image/webp");
  assert.equal(parseImageDataUrl("data:image/jpeg;base64," + jpeg)?.mime, "image/jpeg");
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
