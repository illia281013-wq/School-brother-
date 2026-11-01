process.env.NODE_ENV = "test";
const { normalizeModels, parseImageDataUrl } = await import("../server/index.js");
import test from "node:test";
import assert from "node:assert/strict";

test("normalizeModels detects vision and free tier", () => {
  const models = normalizeModels([
    { id: "qwen/qwen-vl", name: "Qwen VL", architecture: { input_modalities: ["text", "image"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "deepseek/deepseek-chat", architecture: { input_modalities: ["text"] }, pricing: { prompt: "0.1", completion: "0.2" } },
    { id: "vendor/unsupported" }
  ]);
  assert.equal(models.length, 2);
  assert.equal(models[0].vision, true);
  assert.equal(models[0].free, true);
  assert.equal(models[1].vision, false);
});

test("parseImageDataUrl accepts only supported image data URLs", () => {
  assert.deepEqual(parseImageDataUrl("data:image/png;base64,aGVsbG8="), { mime: "image/png", data: "aGVsbG8=" });
  assert.equal(parseImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="), null);
  assert.equal(parseImageDataUrl("https://example.com/picture.png"), null);
  assert.equal(parseImageDataUrl("data:image/jpeg;base64,%%%"), null);
});
